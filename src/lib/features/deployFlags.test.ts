/**
 * Guardián de las capacidades publicadas.
 *
 * El sitio de GitHub Pages estuvo semanas sirviendo un bundle **sin ninguna
 * capacidad del Laboratorio activa**: el workflow de despliegue definía
 * `DEPLOY_TARGET` y las variables de Supabase, pero no `VITE_LAB_FLAGS`. Nada
 * falló, y ese es exactamente el problema: `parseLabFlags` tiene un default
 * seguro —lo que no reconoce, o lo que no existe, no activa nada— así que el
 * build salía en verde y publicaba una aplicación sin la mitad de lo que se
 * había construido.
 *
 * Un default seguro protege de publicar de más, no de publicar de menos. Esa
 * segunda mitad la cubre este archivo: lee el workflow real y comprueba que lo
 * que declara existe y significa algo.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FLAGS_ENV_VAR, LAB_FEATURES, parseLabFlags, type LabFeature } from './flags'

// Se lee desde la raíz del proyecto y no con `import.meta.url`: bajo jsdom la
// URL del módulo es `http:`, no `file:`.
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')

/**
 * Extrae el valor de la variable tal y como lo recibirá Vite.
 *
 * Se busca la asignación real y no una mención cualquiera: los comentarios de
 * esos ficheros nombran la variable varias veces al explicar por qué está ahí, y
 * un guardián que se conforme con encontrar el nombre no guarda nada.
 */
function valorEn(ruta: string): string | null {
  for (const linea of leer(ruta).split('\n')) {
    const sinComentario = linea.replace(/^\s*(#|\/\/).*$/, '')
    const coincidencia = sinComentario.match(
      new RegExp(`${FLAGS_ENV_VAR}:\\s*['"]?([^'",}]+)['"]?`),
    )
    if (coincidencia !== null) return coincidencia[1]!.trim()
  }
  return null
}

const DESPLIEGUE = '.github/workflows/deploy-pages.yml'
const CI = '.github/workflows/ci.yml'
const E2E = 'playwright.config.ts'

const valorEnElWorkflow = () => valorEn(DESPLIEGUE)

describe('el despliegue declara qué capacidades publica', () => {
  it('el workflow define la variable', () => {
    // Sin esto el Laboratorio entero es invisible en producción, y nada avisa.
    expect(valorEnElWorkflow()).not.toBeNull()
  })

  it('no publica una lista vacía', () => {
    expect(parseLabFlags(valorEnElWorkflow()).enabled.size).toBeGreaterThan(0)
  })

  it('ningún nombre de la lista es una errata', () => {
    // Una errata no rompería el build: apagaría la capacidad en silencio.
    expect(parseLabFlags(valorEnElWorkflow()).unknown).toEqual([])
  })

  it('`labShell` está activa, porque sin ella las demás no se ven', () => {
    // Todo el Laboratorio cuelga de esta capacidad: `App.tsx` no monta la
    // sección sin ella. Publicar `labLookThrough` sin `labShell` sería declarar
    // algo que nadie puede alcanzar.
    expect(parseLabFlags(valorEnElWorkflow()).enabled.has('labShell')).toBe(true)
  })

  it('CI y las E2E ejercitan exactamente la lista que se publica', () => {
    // Antes de esto, CI construía y las E2E corrían con `labShell` a secas
    // mientras el despliegue publicaba cuatro capacidades: la combinación que
    // llegaba al usuario no la probaba nadie. Validar un artefacto que no es el
    // que se sirve es peor que no validarlo, porque parece que sí.
    expect(valorEn(CI)).toBe(valorEnElWorkflow())
    expect(valorEn(E2E)).toBe(valorEnElWorkflow())
  })

  it('no se publica ninguna capacidad de una fase que no se ha empezado', () => {
    // Freno de mano, no política: encender la capacidad de una fase sin pantalla
    // solo publicaría portadas de «todavía no está construido». Esta prueba y la
    // lista del workflow se cambian **a la vez y en el mismo diff**, que es el
    // momento de mirar si de verdad hay algo que enseñar.
    //
    // Subido a 9 al cerrar el plan: las fases 5, 6, 7 y 9 tienen pantalla. La 8
    // (empresas) sigue sin construir y su capacidad sigue apagada — el plan la
    // marca como opcional y bloqueada por defecto.
    const FASE_MAXIMA_CONSTRUIDA = 9
    const publicadas = [...parseLabFlags(valorEnElWorkflow()).enabled] as LabFeature[]

    for (const capacidad of publicadas) {
      expect(
        LAB_FEATURES[capacidad].phase,
        `${capacidad} pertenece a la fase ${LAB_FEATURES[capacidad].phase}`,
      ).toBeLessThanOrEqual(FASE_MAXIMA_CONSTRUIDA)
    }
  })
})

describe('la fase 8 sigue apagada, y es deliberado', () => {
  it('`labCompanyResearch` no se publica', () => {
    // El plan la marca como opcional y bloqueada por defecto, y `CLAUDE.md` §3
    // prohíbe activar sugerencias de empresas hasta superar las puertas de
    // calidad. No hay pantalla construida: encenderla publicaría una portada.
    expect(parseLabFlags(valorEnElWorkflow()).enabled.has('labCompanyResearch')).toBe(false)
  })
})
