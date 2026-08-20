/**
 * Pruebas del universo sectorial (LAB-703).
 *
 * El criterio de aceptación: **una consulta por fecha no usa miembros futuros**.
 * Mirar hacia atrás con la lista de hoy infla sistemáticamente cualquier señal,
 * y no se nota porque el número sale plausible.
 */
import { describe, expect, it } from 'vitest'
import {
  UNIVERSE_ERROR_TEXT,
  addMember,
  closeMember,
  isEligible,
  membersAt,
  removeMember,
  sectorsAt,
  type CandidateInstrument,
  type SectorUniverse,
} from './universe'

const etf = (symbol: string, name = ''): CandidateInstrument => ({
  instrumentKey: `sym:${symbol}`,
  symbol,
  assetType: 'etf',
  name,
})

/** Universo con dos sectores, uno de ellos incorporado más tarde. */
function universo(): SectorUniverse {
  const a = addMember([], etf('TECH'), 'tecnologia', { from: '2025-01-01' })
  if (!a.ok) throw new Error('alta rechazada')
  const b = addMember(a.universe, etf('ENER'), 'energia', { from: '2026-06-01' })
  if (!b.ok) throw new Error('alta rechazada')
  return b.universe
}

describe('una consulta a fecha no usa miembros futuros', () => {
  it('en enero de 2026, energía todavía no está', () => {
    // El usuario decidió en junio que ENER representa energía. En enero esa
    // decisión no existía, y usarla sería usar información del futuro.
    expect(sectorsAt(universo(), '2026-01-15')).toEqual(['tecnologia'])
  })

  it('en julio de 2026, ya están los dos', () => {
    expect(sectorsAt(universo(), '2026-07-15')).toEqual(['energia', 'tecnologia'])
  })

  it('el mismo día en que empieza la vigencia, ya cuenta', () => {
    expect(sectorsAt(universo(), '2026-06-01')).toContain('energia')
  })

  it('el día anterior, todavía no', () => {
    expect(sectorsAt(universo(), '2026-05-31')).not.toContain('energia')
  })

  it('antes de que exista nada, el universo está vacío', () => {
    expect(membersAt(universo(), '2020-01-01')).toEqual([])
  })
})

describe('una pertenencia que se cierra deja de contar, pero el pasado sigue', () => {
  const cerrado = closeMember(universo(), 'sym:TECH', 'tecnologia', '2025-01-01', '2026-03-01')

  it('después del cierre ya no aparece', () => {
    expect(cerrado.ok).toBe(true)
    if (!cerrado.ok) return
    expect(sectorsAt(cerrado.universe, '2026-04-01')).not.toContain('tecnologia')
  })

  it('antes del cierre sigue apareciendo: entonces era verdad', () => {
    if (!cerrado.ok) return
    expect(sectorsAt(cerrado.universe, '2025-06-01')).toContain('tecnologia')
  })

  it('el mismo día del cierre ya no cuenta', () => {
    if (!cerrado.ok) return
    expect(sectorsAt(cerrado.universe, '2026-03-01')).not.toContain('tecnologia')
  })

  it('cerrar antes de empezar se rechaza', () => {
    const r = closeMember(universo(), 'sym:TECH', 'tecnologia', '2025-01-01', '2024-01-01')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('inverted_period')
  })

  it('quitar es la única forma de perder historial, y es explícita', () => {
    const sinTech = removeMember(universo(), 'sym:TECH', 'tecnologia', '2025-01-01')
    expect(sectorsAt(sinTech, '2025-06-01')).toEqual([])
  })
})

describe('lo que no puede representar un sector', () => {
  it('un producto apalancado se rechaza, y se explica por qué', () => {
    const r = addMember([], etf('TECH3L', 'Tech 3x Leveraged'), 'tecnologia', { from: '2025-01-01' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('excluded_instrument')
    expect(r.detail).toMatch(/apalancados/)
  })

  it('un producto inverso también', () => {
    expect(isEligible(etf('XSHORT', 'Inverse Technology'))).toBe(false)
    expect(isEligible(etf('BEAR', 'Daily Bear 2x'))).toBe(false)
  })

  it('una acción suelta no representa un sector aunque se etiquete', () => {
    const r = addMember(
      [],
      { instrumentKey: 'sym:AAPL', symbol: 'AAPL', assetType: 'stock' },
      'tecnologia',
      { from: '2025-01-01' },
    )
    expect(r.ok).toBe(false)
  })

  it('un ETF normal sí entra', () => {
    expect(isEligible(etf('TECH', 'MSCI World Information Technology'))).toBe(true)
  })

  it('el filtro por nombre es imperfecto y por eso el rechazo se explica', () => {
    // Un apalancado que no use esas palabras se colaría; se aplica con aviso,
    // no en silencio.
    expect(UNIVERSE_ERROR_TEXT.excluded_instrument).toMatch(/ADR-008/)
  })
})

describe('integridad de las fechas', () => {
  it('una fecha con formato inválido se rechaza', () => {
    const r = addMember([], etf('TECH'), 'tecnologia', { from: '01/01/2025' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('invalid_date')
  })

  it('una fecha que no existe en el calendario se rechaza', () => {
    expect(addMember([], etf('TECH'), 'tecnologia', { from: '2025-02-30' }).ok).toBe(false)
  })

  it('un periodo al revés se rechaza', () => {
    const r = addMember([], etf('TECH'), 'tecnologia', { from: '2026-01-01', to: '2025-01-01' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('inverted_period')
  })
})

describe('sin solapamientos', () => {
  it('la misma pareja instrumento-sector en periodos que se pisan se rechaza', () => {
    // Dos periodos solapados darían dos respuestas para la misma fecha.
    const r = addMember(universo(), etf('TECH'), 'tecnologia', { from: '2025-06-01' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('duplicate_membership')
  })

  it('la misma pareja en periodos que no se pisan sí entra', () => {
    const cerrado = closeMember(universo(), 'sym:TECH', 'tecnologia', '2025-01-01', '2025-06-01')
    if (!cerrado.ok) throw new Error('cierre rechazado')
    const r = addMember(cerrado.universe, etf('TECH'), 'tecnologia', { from: '2025-09-01' })
    expect(r.ok).toBe(true)
  })

  it('el mismo instrumento puede representar dos sectores distintos', () => {
    const r = addMember(universo(), etf('TECH'), 'innovacion', { from: '2025-01-01' })
    expect(r.ok).toBe(true)
  })

  it('dos instrumentos pueden representar el mismo sector', () => {
    const r = addMember(universo(), etf('TECH2'), 'tecnologia', { from: '2025-01-01' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(membersAt(r.universe, '2025-06-01')).toHaveLength(2)
  })
})

describe('determinismo', () => {
  it('el orden de la consulta no depende del orden de alta', () => {
    const a = addMember([], etf('ZZZ'), 'zeta', { from: '2025-01-01' })
    if (!a.ok) throw new Error('alta rechazada')
    const b = addMember(a.universe, etf('AAA'), 'alfa', { from: '2025-01-01' })
    if (!b.ok) throw new Error('alta rechazada')
    expect(membersAt(b.universe, '2025-06-01').map((m) => m.sector)).toEqual(['alfa', 'zeta'])
  })

  it('sin universo no rompe', () => {
    expect(membersAt([], '2026-01-01')).toEqual([])
    expect(sectorsAt([], '2026-01-01')).toEqual([])
  })
})
