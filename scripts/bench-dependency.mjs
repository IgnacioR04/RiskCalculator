/**
 * Coste de los motores de dependencia (LAB-416).
 *
 * Existe porque en LAB-313 se publicó un p95 falso: sin calentar el JIT, la
 * primera medición dominaba el resultado. Aquí se calienta antes de medir, y
 * el número que sale es el que se puede escribir en un informe.
 *
 * Se ejecuta sobre el fuente TypeScript con el runner de Vitest, para no
 * mantener una copia compilada aparte.
 */
import { execSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const TEMPORAL = join(process.cwd(), 'src/lib/lab/dependency/__bench.test.ts')

const CONTENIDO = `
import { it } from 'vitest'
import { dependencyMatrix } from './dependencyMatrix'
import { clusterByDependency } from './dependencyClustering'
import { downsideDependency } from './rollingDependency'

function cartera(n, dias) {
  let s = 12345
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5 }
  return Array.from({ length: n }, (_, k) => ({
    id: \`a\${k}\`,
    label: \`A\${k}\`,
    returns: Array.from({ length: dias }, (_, i) => ({
      date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
      value: rnd() + (k % 3 === 0 ? rnd() * 0.2 : 0),
    })),
  }))
}

function medir(nombre, fn) {
  for (let i = 0; i < 10; i += 1) fn()          // calentar el JIT
  const muestras = []
  for (let i = 0; i < 30; i += 1) {
    const t0 = performance.now()
    fn()
    muestras.push(performance.now() - t0)
  }
  muestras.sort((a, b) => a - b)
  const p50 = muestras[Math.floor(muestras.length * 0.5)]
  const p95 = muestras[Math.floor(muestras.length * 0.95)]
  console.log(\`BENCH \${nombre} p50=\${p50.toFixed(2)}ms p95=\${p95.toFixed(2)}ms\`)
}

it('bench', () => {
  for (const [n, dias] of [[5, 364], [20, 364], [50, 1260]]) {
    const series = cartera(n, dias)
    const m = dependencyMatrix(series)
    medir(\`matriz n=\${n} dias=\${dias}\`, () => dependencyMatrix(series))
    medir(\`clustering n=\${n}\`, () => clusterByDependency(m))
    medir(\`downside n=\${n}\`, () => downsideDependency(series[0], series[1], series[2]))
  }
})
`

writeFileSync(TEMPORAL, CONTENIDO)
try {
  const salida = execSync(`npx vitest run ${TEMPORAL} --reporter=basic`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const linea of salida.split('\n')) {
    if (linea.includes('BENCH')) console.log(linea.trim())
  }
} finally {
  unlinkSync(TEMPORAL)
}
