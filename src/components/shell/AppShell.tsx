import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { Currency } from '../../lib/domain'
import { endDemoSession, getDemoSession } from '../../lib/demoAuth'
import { isFeatureEnabled } from '../../lib/features/flags'
import { signOutAndClearCloudSession } from '../../lib/sync'
import { useAppStore } from '../../state/store'
import { MOBILE_SECTIONS, SECTIONS, sectionByPath } from './sections'

const SYNC_LABEL = {
  local: 'local',
  loading: 'cargando',
  saving: 'guardando',
  saved: 'guardado',
  offline: 'sin conexion',
  error: 'error',
} as const

function initials(label: string): string {
  return label.split('@')[0]!.slice(0, 2).toUpperCase()
}

export function AppShell(props: { children: ReactNode; leaf?: string }) {
  const location = useLocation()
  const section = sectionByPath(location.pathname)
  const displayCurrency = useAppStore((s) => s.settings.displayCurrency)
  const setDisplayCurrency = useAppStore((s) => s.setDisplayCurrency)
  const quotes = useAppStore((s) => s.quotes)
  const cloudSync = useAppStore((s) => s.cloudSync)
  const demoUser = getDemoSession()
  const user = cloudSync.email ?? demoUser ?? 'invitado'
  const syncLabel = SYNC_LABEL[cloudSync.status]

  const lastFetched = Object.values(quotes)
    .map((q) => q.fetchedAt)
    .sort()
    .at(-1)

  // Visibilidad por capacidad, no permiso: una sección apagada no se ofrece,
  // pero lo que protege datos sigue estando en Supabase.
  const seccionesVisibles = SECTIONS.filter(
    (s) => s.feature === undefined || isFeatureEnabled(s.feature),
  )
  const seccionesFueraDelMovil = seccionesVisibles.filter(
    (s) => !MOBILE_SECTIONS.includes(s.path),
  )

  return (
    <div className="app-shell">
      <nav className="app-rail" aria-label="Secciones">
        <NavLink to="/resumen" className="rail-logo" aria-label="RiskCalculator, ir al resumen">
          R
        </NavLink>
        {seccionesVisibles.map((s) => {
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
        <span className="rail-status tip" tabIndex={0} role="img" aria-label="Estado de sincronización">
          <span className="tip-bubble" role="tooltip">
            <span className="t-name">
              {cloudSync.userId === null ? 'Datos locales' : `Nube ${syncLabel}`}
            </span>
            <span className="t-desc">{cloudSync.message}</span>
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
            <div className="segmented" role="radiogroup" aria-label="Divisa de presentacion">
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
              title="Cripto: CoinGecko. EUR/USD: BCE. Acciones y ETF: precio manual mientras el proveedor esta desactivado."
            >
              {lastFetched !== undefined ? 'precios · actualizados' : 'precios · sin actualizar'}
            </span>
            <span className="meta" title={cloudSync.message}>
              {cloudSync.userId === null ? 'datos · local' : `nube · ${syncLabel}`}
            </span>
            <button
              type="button"
              className="avatar"
              title={`${user} · cerrar sesión`}
              onClick={() => {
                endDemoSession()
                void signOutAndClearCloudSession().finally(() => window.location.reload())
              }}
            >
              {initials(user)}
            </button>
          </div>
        </header>

        <main className="app-main">{props.children}</main>

        <p className="disclaimer">
          RiskCalculator ofrece cálculos y análisis con fines educativos. No es asesoramiento
          financiero, no recomienda comprar ni vender y no predice precios.
        </p>
      </div>

      <nav className="mobile-nav" aria-label="Navegacion principal">
        {seccionesVisibles
          .filter((s) => MOBILE_SECTIONS.includes(s.path))
          .map((s) => {
            const Icon = s.icon
            return (
              <NavLink key={s.path} to={s.path} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                <Icon />
                {s.short}
              </NavLink>
            )
          })}

        {/* En la barra inferior no caben las nueve secciones. Sin este menú,
            las que quedan fuera solo serían alcanzables escribiendo la URL. */}
        {seccionesFueraDelMovil.length > 0 && (
          <details className="mobile-mas">
            <summary>Más</summary>
            <ul>
              {seccionesFueraDelMovil.map((s) => (
                <li key={s.path}>
                  <NavLink to={s.path}>{s.title}</NavLink>
                </li>
              ))}
            </ul>
          </details>
        )}
      </nav>
    </div>
  )
}
