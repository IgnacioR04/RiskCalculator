import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { EXAMPLE_VALID_JSON } from '../lib/import/schema'
import { useAppStore } from '../state/store'
import { ImportarPage } from './ImportarPage'

function resetStore() {
  useAppStore.setState({
    settings: { displayCurrency: 'EUR', locale: 'es-ES', riskFreeRate: '0' },
    accounts: [],
    assets: [],
    transactions: [],
    quotes: {},
    fxRates: [],
    scenarios: [],
    importBatches: [],
    riskProfile: null,
    riskResults: [],
    demoLoaded: false,
    cloudSync: {
      userId: null,
      email: null,
      status: 'local',
      message: 'Datos guardados en este dispositivo.',
      lastSyncedAt: null,
    },
  })
}

/** Pulsa sin dejar que React vuelva a renderizar entre clics. */
function clickTwiceInSameTick(button: HTMLElement) {
  button.click()
  button.click()
}

describe('ImportarPage', () => {
  beforeEach(() => {
    resetStore()
  })

  it('nada se escribe hasta que se confirma', () => {
    render(<ImportarPage />)

    const textarea = screen.getByLabelText('Respuesta de la IA')
    fireEvent.change(textarea, { target: { value: EXAMPLE_VALID_JSON } })
    screen.getByRole('button', { name: 'Validar y previsualizar' }).click()

    // Validado y previsualizado, pero la cartera sigue intacta.
    const afterPreview = useAppStore.getState()
    expect(afterPreview.transactions).toHaveLength(0)
    expect(afterPreview.accounts).toHaveLength(0)
    expect(afterPreview.importBatches).toHaveLength(0)
  })

  it('el doble clic en «Confirmar cambios» no duplica la importación', async () => {
    render(<ImportarPage />)

    const textarea = screen.getByLabelText('Respuesta de la IA')
    fireEvent.change(textarea, { target: { value: EXAMPLE_VALID_JSON } })
    screen.getByRole('button', { name: 'Validar y previsualizar' }).click()

    const confirmar = await screen.findByRole('button', { name: 'Confirmar cambios' })
    const esperadas = useAppStore.getState().transactions.length

    // Dos clics en el mismo tick: sin el cerrojo, `proposal` sigue vivo en el
    // closure durante el segundo y la importación entera se escribe dos veces.
    clickTwiceInSameTick(confirmar)

    const after = useAppStore.getState()
    expect(after.importBatches).toHaveLength(1)
    expect(after.transactions.length).toBeGreaterThan(esperadas)

    // Ninguna operación repetida: cada id aparece una sola vez.
    const ids = after.transactions.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)

    // Y ninguna cuenta ni activo duplicado por nombre.
    const brokers = after.accounts.map((a) => `${a.brokerName}·${a.accountLabel}`)
    expect(new Set(brokers).size).toBe(brokers.length)
    const symbols = after.assets.map((a) => a.symbol)
    expect(new Set(symbols).size).toBe(symbols.length)
  })
})
