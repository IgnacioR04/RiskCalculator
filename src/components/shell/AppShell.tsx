/**
 * Shell de la aplicación: rail lateral de 58 px con tooltips accesibles,
 * barra superior con migas / divisa / estado de precios / avatar, y
 * navegación inferior de 5 iconos en móvil.
 */
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { Currency } from '../../lib/domain'
import { endDemoSession, getDemoSession } from '../../lib/demoAuth'
import { getSupabase } from '../../lib/supabase'
import { useAppStore } from '../../state/store'
import { MOBILE_SECTIONS, SECTIONS, sectionByPath } from './sections'

export function AppShell(props: { children: ReactNode; leaf?: string }) {
  const location = useLocation()
  const section = sectionByPath(location.pathname)
  const displayCurrency = useAppStore((s) => s.settings.displayCurrency)
  const setDisplayCurrency = useAppStore((s) => s.setDisplayCurrency)
  const quotes = useAppStore((s) => s.quotes)
  const user = getDemoSession()

  const lastFetched = Object.values(quotes)
    .map((q) => q.fetchedAt)
    .sort()
    .at(-1)

  return (
    <div className="app-shell">
      <nav className="app-rail" aria-label="Secciones">
        <NavLink to="/resumen" className="rail-logo" aria-label="RiskCalculator, ir al resumen">
          R
        </NavLink>
        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <NavLink
              key={s.path}
              to={s.path}
              className={({ isActive }) => (isActive ? 'rail-item tip active' : 'rail-item tip')}
              aria-label={`${s.num} ${s.title}`}
            >
              <Icon />
              <span className="tip-bubble" role="tooltip">
                <span className="t-name">
                  {s.num} · {s.title}
                </span>
                <span className="t-desc">{s.desc}</span>
              </span>
            </NavLink>
          )
        })}
        <span className="rail-status tip" tabIndex={0} role="img" aria-label="Estado de los datos">
          <span className="tip-bubble" role="tooltip">
            <span className="t-name">Datos guardados en este dispositivo</span>
            <span className="t-desc">Nada se envía a un servidor mientras no actives la sincronización.</span>
          </span>
        </span>
      </nav>

      <div className="app-body">
        <header className="app-topbar">
          <span className="crumb">{section?.title ?? 'RiskCalculator'}</span>
          {props.leaf !== undefined && (
            <>
              <span className="crumb-sep">/</span>
              <span className="crumb-leaf">{props.leaf}</span>
            </>
          )}
          <div className="topbar-right">
            <div className="segmented" role="radiogroup" aria-label="Divisa de presentación">
              {(['EUR', 'USD'] as Currency[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={displayCurrency === c}
                  onClick={() => setDisplayCurrency(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <span
              className="meta"
              title="Cripto: CoinGecko. EUR/USD: BCE. Acciones y ETF: precio manual mientras el proveedor está desactivado."
            >
              {lastFetched !== undefined ? 'precios · actualizados' : 'precios · sin actualizar'}
            </span>
            <button
              type="button"
              className="avatar"
              title={`${user ?? 'invitado'} · cerrar sesión`}
              onClick={() => {
                // Cierra tanto la puerta de demostración como la sesión real
                // de Supabase, si la hay.
                endDemoSession()
                const supabase = getSupabase()
                if (supabase !== null) {
                  void supabase.auth.signOut().finally(() => window.location.reload())
                } else {
                  window.location.reload()
                }
              }}
            >
              {(user ?? 'IN').slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>

        <main className="app-main">{props.children}</main>

        <p className="disclaimer">
          RiskCalculator ofrece cálculos y análisis con fines educativos. No es asesoramiento financiero, no recomienda
          comprar ni vender y no predice precios.
        </p>
      </div>

      <nav className="mobile-nav" aria-label="Navegación principal">
        {SECTIONS.filter((s) => MOBILE_SECTIONS.includes(s.path)).map((s) => {
          const Icon = s.icon
          return (
            <NavLink key={s.path} to={s.path} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <Icon />
              {s.short}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
