import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">💥</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Etwas ist schiefgelaufen</h2>
            <p className="text-gray-600 mb-4">
              Die Anwendung ist abgestürzt. Bitte laden Sie die Seite neu.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Seite neu laden
            </button>
            {this.state.error && (
              <pre className="mt-4 text-xs text-red-600 bg-red-50 p-2 rounded overflow-auto">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}