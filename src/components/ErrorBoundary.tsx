import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * Red de seguridad: si cualquier parte de la app lanza durante el render,
 * en vez de dejar la pantalla en blanco (o «pillada») se muestra un mensaje
 * claro con opción de recargar. No captura errores de handlers async.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Deja rastro en consola para diagnóstico; sin datos sensibles.
    console.error('Error no controlado en la interfaz:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div style={{ maxWidth: 620, margin: '10vh auto', padding: '0 16px' }}>
          <div className="card">
            <h2>Algo ha fallado en la interfaz</h2>
            <p>
              La aplicación ha encontrado un problema inesperado y ha parado esta pantalla para no
              quedarse bloqueada. Tus datos guardados no se han perdido.
            </p>
            <p className="muted mono" style={{ fontSize: '0.8rem' }}>
              {this.state.error.message}
            </p>
            <div className="row">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  this.setState({ error: null })
                }}
              >
                Reintentar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => window.location.reload()}
              >
                Recargar la página
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
