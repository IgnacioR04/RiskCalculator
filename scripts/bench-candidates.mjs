/**
 * Coste y validación fuera de muestra de las candidatas (LAB-614, LAB-615).
 *
 * Hace dos cosas que no se pueden escribir sin medir:
 *
 * 1. **Rendimiento** de cada optimizador, con calentamiento de JIT.
 * 2. **Walk-forward**: entrena la covarianza con una ventana y mide qué pasa en
 *    la siguiente, para cada candidata. Es la única forma honesta de comparar:
 *    dentro de muestra la mínima varianza gana por construcción.
 */
import { execSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const TEMPORAL = join(process.cwd(), 'src/lib/lab/candidates/__bench.test.ts')

const CONTENIDO = `
import { it } from 'vitest'
import { compileConstraints } from './constraintCompiler'
import { candidateEqualWeight } from './candidateEqualWeight'
import { candidateMinimumVariance, candidateEqualRiskContribution, portfolioVariance } from './optimizers'
import { covarianceMatrix } from '../../finance/portfolioRisk'

function rng(seed) {
  let s = seed >>> 0 || 1
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

/**
 * Serie sintética con estructura: dos bloques correlacionados.
 *
 * El parámetro «regimen» controla la honestidad del experimento:
 * - 'estable': las volatilidades no cambian nunca. Es el régimen FAVORABLE a
 *   los optimizadores, porque la covarianza estimada ayer sigue valiendo hoy.
 * - 'cambiante': a mitad de la serie se permutan las volatilidades entre
 *   activos. Es lo que hacen los mercados de verdad, y donde una covarianza
 *   estimada con el pasado deja de describir el futuro.
 */
function generar(nActivos, nDias, seed, regimen = 'estable') {
  const r = rng(seed)
  const normal = () => {
    let u = 0, v = 0
    while (u === 0) u = r()
    while (v === 0) v = r()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const cols = Array.from({ length: nActivos }, () => [])
  for (let d = 0; d < nDias; d += 1) {
    const factorA = normal() * 0.012
    const factorB = normal() * 0.008
    const invertido = regimen === 'cambiante' && d > nDias / 2
    for (let a = 0; a < nActivos; a += 1) {
      const comun = a % 2 === 0 ? factorA : factorB
      // Al cambiar de régimen, el activo tranquilo pasa a ser el volátil.
      const escalon = invertido ? 4 - (a % 5) : a % 5
      const vol = 0.006 + escalon * 0.004
      cols[a].push(comun + normal() * vol)
    }
  }
  return cols
}

function universo(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'a' + i, symbol: 'A' + i, dimensions: {}, currentWeight: 1 / n,
  }))
}

function medir(nombre, fn) {
  for (let i = 0; i < 5; i += 1) fn()
  const m = []
  for (let i = 0; i < 20; i += 1) {
    const t0 = performance.now(); fn(); m.push(performance.now() - t0)
  }
  m.sort((a, b) => a - b)
  console.log(\`BENCH \${nombre} p50=\${m[10].toFixed(2)}ms p95=\${m[19].toFixed(2)}ms\`)
}

it('bench y walk-forward', { timeout: 600000 }, () => {
  /* ── 1. Rendimiento ─────────────────────────────────────────────────── */
  for (const n of [5, 20, 50]) {
    const compiled = compileConstraints([], universo(n))
    const cols = generar(n, 504, 7)
    const cov = covarianceMatrix(cols, 252)
    if (!cov.ok) { console.log('BENCH n=' + n + ' sin covarianza'); continue }
    medir(\`1/N n=\${n}\`, () => candidateEqualWeight(compiled))
    medir(\`minvar n=\${n}\`, () => candidateMinimumVariance({ compiled, covariance: cov.value }))
    medir(\`erc n=\${n}\`, () => candidateEqualRiskContribution({ compiled, covariance: cov.value }))
  }

  /* ── 2. Walk-forward, en dos regímenes ──────────────────────────────── */
  // Ventana de entrenamiento 252 días, prueba 63 días, avanzando 63.
  const N = 12
  const DIAS = 2016
  const ENTRENA = 252
  const PRUEBA = 63
  const compiled = compileConstraints([], universo(N))

  for (const regimen of ['estable', 'cambiante']) {
    const cols = generar(N, DIAS, 42, regimen)
    const acumulado = { equalWeight: [], minimumVariance: [], equalRiskContribution: [] }
    let ventanas = 0
    let fallos = 0

    for (let inicio = 0; inicio + ENTRENA + PRUEBA <= DIAS; inicio += PRUEBA) {
      const entrena = cols.map((c) => c.slice(inicio, inicio + ENTRENA))
      const prueba = cols.map((c) => c.slice(inicio + ENTRENA, inicio + ENTRENA + PRUEBA))
      const cov = covarianceMatrix(entrena, 252)
      if (!cov.ok) continue
      const covFuera = covarianceMatrix(prueba, 252)
      if (!covFuera.ok) continue
      ventanas += 1

      const candidatas = {
        equalWeight: candidateEqualWeight(compiled),
        minimumVariance: candidateMinimumVariance({ compiled, covariance: cov.value }),
        equalRiskContribution: candidateEqualRiskContribution({ compiled, covariance: cov.value }),
      }

      for (const [nombre, c] of Object.entries(candidatas)) {
        if (c.weights === null) { fallos += 1; continue }
        // Volatilidad REALIZADA en la ventana siguiente, con los pesos elegidos
        // con datos anteriores. Eso es fuera de muestra.
        acumulado[nombre].push(Math.sqrt(portfolioVariance(c.weights, covFuera.value)))
      }
    }

    console.log(\`WF[\${regimen}] ventanas=\${ventanas} fallos=\${fallos}\`)
    for (const [nombre, vols] of Object.entries(acumulado)) {
      if (vols.length === 0) { console.log(\`WF[\${regimen}] \${nombre} sin datos\`); continue }
      const media = vols.reduce((s, v) => s + v, 0) / vols.length
      const orden = [...vols].sort((a, b) => a - b)
      const peor = orden[orden.length - 1]
      console.log(\`WF[\${regimen}] \${nombre} volMedia=\${(media * 100).toFixed(2)}% peorVentana=\${(peor * 100).toFixed(2)}% n=\${vols.length}\`)
    }
  }
})
`

writeFileSync(TEMPORAL, CONTENIDO)
try {
  const salida = execSync(`npx vitest run ${TEMPORAL} --reporter=basic --testTimeout=600000`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const linea of salida.split('\n')) {
    if (linea.includes('BENCH') || linea.includes('WF')) console.log(linea.trim())
  }
} finally {
  unlinkSync(TEMPORAL)
}
