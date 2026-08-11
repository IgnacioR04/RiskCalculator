/**
 * Presupuesto de tamaño del bundle (LAB-008).
 *
 * Falla el build cuando un chunk se pasa de lo declarado. Existe porque el
 * tamaño crece de uno en uno, sin que ningún cambio parezca culpable, y cuando
 * se nota ya es caro de arreglar.
 *
 * Los límites están por encima del tamaño actual con margen: la idea no es
 * congelar el bundle, es enterarse de un salto grande. Subir un límite es
 * legítimo; lo que no vale es subirlo sin mirar por qué creció.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

/** Límites en KiB de gzip, con la razón de cada uno. El orden importa. */
const PRESUPUESTO = [
  { patron: /^index-.*\.js$/, maxGzipKb: 120, nota: 'arranque de la aplicación' },
  { patron: /^chartTheme-.*\.js$/, maxGzipKb: 130, nota: 'motor de gráficas, diferido' },
  { patron: /\.js$/, maxGzipKb: 80, nota: 'chunk de ruta' },
]

const dir = join(process.cwd(), 'dist', 'assets')
let fallos = 0

for (const archivo of readdirSync(dir)) {
  if (!archivo.endsWith('.js')) continue
  const gzipKb = gzipSync(readFileSync(join(dir, archivo))).length / 1024
  const regla = PRESUPUESTO.find((r) => r.patron.test(archivo))
  if (regla === undefined) continue

  if (gzipKb > regla.maxGzipKb) {
    fallos += 1
    console.error(
      `x ${archivo}: ${gzipKb.toFixed(1)} KiB gzip supera el limite de ${regla.maxGzipKb} KiB (${regla.nota})`,
    )
  } else {
    console.log(`ok ${archivo}: ${gzipKb.toFixed(1)} / ${regla.maxGzipKb} KiB gzip`)
  }
}

if (fallos > 0) {
  console.error(`\n${fallos} chunk(s) por encima del presupuesto. Mira que ha crecido antes de subir el limite.`)
  process.exit(1)
}
console.log('\nPresupuesto de bundle respetado.')
