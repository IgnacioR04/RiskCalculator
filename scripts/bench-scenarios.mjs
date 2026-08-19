/**
 * Coste de los motores de escenario (LAB-512).
 *
 * Existe porque la decisión de LAB-510 —si hace falta una API asíncrona de
 * ejecuciones— tiene que tomarse con un número medido, no con una intuición.
 * Calienta el JIT antes de medir, igual que `bench-dependency.mjs`.
 */
import { execSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const TEMPORAL = join(process.cwd(), 'src/lib/lab/scenarios/__bench.test.ts')

const CONTENIDO = `
import { it } from 'vitest'
import { blockBootstrap } from './blockBootstrap'
import { portfolioPath } from './portfolioPath'
import { runDeterministicScenario, presetToDefinition } from './deterministicScenario'
import { STRESS_PRESETS } from '../../finance/stressPresets'

function medir(nombre, fn) {
  for (let i = 0; i < 5; i += 1) fn()
  const m = []
  for (let i = 0; i < 20; i += 1) {
    const t0 = performance.now()
    fn()
    m.push(performance.now() - t0)
  }
  m.sort((a, b) => a - b)
  console.log(\`BENCH \${nombre} p50=\${m[10].toFixed(2)}ms p95=\${m[19].toFixed(2)}ms\`)
}

it('bench', { timeout: 600_000 }, () => {
  const posiciones = Array.from({ length: 20 }, (_, i) => ({
    assetId: 'a' + i, symbol: 'A' + i, assetType: 'stock',
    quoteCurrency: 'EUR', value: String(1000 + i),
  }))
  const def = presetToDefinition(STRESS_PRESETS[1])
  medir('determinista 20 activos', () =>
    runDeterministicScenario({ definition: def, positions: posiciones, displayCurrency: 'EUR', asOf: '2026-08-19' }))

  // El caso de 10.000 trayectorias con 20 activos queda fuera a propósito: son
  // ~4 s de JavaScript bloqueante por ejecución, y veinte repeticiones tumban
  // el canal RPC del worker de Vitest. Ese dato está en ADR-006; medirlo aquí
  // solo conseguiría que el banco no se pueda ejecutar.
  for (const [activos, dias, paths] of [[5, 252, 1000], [20, 252, 1000], [20, 252, 2000]]) {
    const hist = Array.from({ length: dias }, () =>
      Array.from({ length: activos }, () => Math.random() / 100 - 0.005))
    medir(\`bootstrap \${activos}act \${paths}trayectorias \${dias}dias\`, () =>
      blockBootstrap({ history: hist, blockDays: 20, horizonDays: 252, paths, seed: 1 }))
  }

  const assets = Array.from({ length: 20 }, (_, i) => ({ id: 'a' + i, targetWeight: 0.05, initialValue: 1000 }))
  const rets = Array.from({ length: 252 }, () => Array.from({ length: 20 }, () => 0.0004))
  medir('portfolioPath 20act 252periodos', () =>
    portfolioPath({ assets, returns: rets, flow: { amount: 100, everyPeriods: 21 },
      costs: { holdingFee: 0.00001, tradingFee: 0.001 }, rebalance: { kind: 'bands', tolerance: 0.02 } }))
})
`

writeFileSync(TEMPORAL, CONTENIDO)
try {
  const salida = execSync(`npx vitest run ${TEMPORAL} --reporter=basic --testTimeout=600000`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const linea of salida.split('\n')) {
    if (linea.includes('BENCH')) console.log(linea.trim())
  }
} finally {
  unlinkSync(TEMPORAL)
}
