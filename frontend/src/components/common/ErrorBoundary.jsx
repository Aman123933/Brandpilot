import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch() {
    // Keep console clean for production, but error is captured in state
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary-screen" role="alert">
          <div className="error-boundary-card">
            <p className="eyebrow" style={{ color: 'var(--vermilion)' }}>SYSTEM NOTICE</p>
            <h1 className="display-font">Something interrupted the desk.</h1>
            <p>
              An unexpected render error occurred in this view. Your session and saved changes remain secure.
            </p>
            {this.state.error?.message && (
              <pre className="error-trace mono-font">
                {this.state.error.message}
              </pre>
            )}
            <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
              <button
                type="button"
                className="action-button primary"
                onClick={this.handleReload}
              >
                Reload workspace
              </button>
              <a href="/app/overview" className="action-button secondary">
                Go to Overview
              </a>
            </div>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
