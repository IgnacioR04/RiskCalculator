/**
 * Benchmark del calculo pesado de estabilidad (LAB-313).
 *
 * Mide lo unico que puede bloquear el hilo principal: alinear retornos,
 * construir la matriz de covarianza y resolver la contribucion al riesgo. La
 * descarga no cuenta —es asincrona y no bloquea— y el renderizado tampoco.
 *
 * Se ejecuta con `npm run bench:stability`. La decision sobre el Web Worker se
 * toma con estos numeros, no a ojo.
 */
import { performance } from 'node:perf_hooks'

/** Serie de retornos pseudoaleatoria pero determinista: el bench es repetible. */
function retornos(n, semilla) {
  const out = []
  let x = semilla
  for (let i = 0; i < n; i += 1) {
    x = (x * 1103515245 + 12345) % 2147483648
    out.push((x / 2147483648 - 0.5) * 0.04)
  }
  return out
}

/** Covarianza anualizada: el nucleo O(k^2 * n) del calculo. */
function covarianza(columnas, periodosPorAno) {
  const k = columnas.length
  const n = columnas[0].length
  const medias = columnas.map((c) => c.reduce((s, v) => s + v, 0) / n)
  const m = []
  for (let i = 0; i < k; i += 1) {
    m.push(new Array(k).fill(0))
  }
  for (let i = 0; i < k; i += 1) {
    for (let j = i; j < k; j += 1) {
      let suma = 0
      for (let t = 0; t < n; t += 1) {
        suma += (columnas[i][t] - medias[i]) * (columnas[j][t] - medias[j])
      }
      const cov = (suma / (n - 1)) * periodosPorAno
      m[i][j] = cov
      m[j][i] = cov
    }
  }
  return m
}

function riesgoDeCartera(pesos, cov) {
  const k = pesos.length
  let varianza = 0
  const marginales = new Array(k).fill(0)
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) {
      varianza += pesos[i] * pesos[j] * cov[i][j]
      marginales[i] += pesos[j] * cov[i][j]
    }
  }
  const vol = Math.sqrt(varianza)
  return marginales.map((mg, i) => (vol > 0 ? (pesos[i] * mg) / (vol * vol) : 0))
}

const DIAS = 365
const REPETICIONES = 50
/**
 * Vueltas en vacio antes de medir. Sin ellas el p95 lo domina el calentamiento
 * del JIT y de la memoria, no el calculo: se veian 27 ms en un caso cuya
 * mediana es 1,3 ms. Un benchmark cuyos numeros los manda el arranque no mide
 * lo que dice medir.
 */
const CALENTAMIENTO = 10
/** Presupuesto declarado: por encima de esto el usuario nota el bloqueo. */
const PRESUPUESTO_MS = 50

console.log(`Serie de ${DIAS} dias, ${REPETICIONES} repeticiones, mediana en ms\n`)
console.log('activos | mediana |   p95 | presupuesto')
console.log('--------|---------|-------|------------')

let excede = false
for (const k of [10, 25, 50]) {
  const columnas = Array.from({ length: k }, (_, i) => retornos(DIAS, i * 7919 + 13))
  const pesos = Array.from({ length: k }, () => 1 / k)

  for (let r = 0; r < CALENTAMIENTO; r += 1) {
    riesgoDeCartera(pesos, covarianza(columnas, 252))
  }

  const tiempos = []
  for (let r = 0; r < REPETICIONES; r += 1) {
    const t0 = performance.now()
    const cov = covarianza(columnas, 252)
    riesgoDeCartera(pesos, cov)
    tiempos.push(performance.now() - t0)
  }
  tiempos.sort((a, b) => a - b)
  const mediana = tiempos[Math.floor(tiempos.length / 2)]
  const p95 = tiempos[Math.floor(tiempos.length * 0.95)]
  if (p95 > PRESUPUESTO_MS) excede = true
  console.log(
    `${String(k).padStart(7)} | ${mediana.toFixed(2).padStart(7)} | ${p95.toFixed(2).padStart(5)} | ${p95 > PRESUPUESTO_MS ? 'EXCEDE' : 'ok'}`,
  )
}

console.log(
  excede
    ? `\nAlgun caso supera ${PRESUPUESTO_MS} ms en p95: procede extraer a Web Worker.`
    : `\nNingun caso supera ${PRESUPUESTO_MS} ms en p95: NO procede introducir un Web Worker.`,
)
