import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Loader2 } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import api from '../lib/api'

export default function Login() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [authState, setAuthState] = useState<'loading' | 'not_setup' | 'locked'>('loading')
  const navigate = useNavigate()
  const { unlock } = useAuthStore()

  useEffect(() => {
    api.get('/auth/status').then(res => {
      const state = res.data?.state
      if (state === 'not_setup') {
        setAuthState('not_setup')
      } else {
        setAuthState('locked')
      }
    }).catch(() => {
      setAuthState('locked')
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (authState === 'not_setup') {
      if (password.length < 12) {
        setError('Passwort muss mindestens 12 Zeichen lang sein')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwörter stimmen nicht überein')
        return
      }
    }

    setIsLoading(true)

    try {
      if (authState === 'not_setup') {
        await api.post('/auth/setup', { masterPassword: password })
      } else {
        await api.post('/auth/unlock', { masterPassword: password })
      }
      unlock()
      navigate('/')
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error
      if (authState === 'not_setup') {
        setError(msg || 'Fehler bei der Einrichtung')
      } else {
        setError(msg || 'Falsches Passwort')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    )
  }

  const isSetup = authState === 'not_setup'

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
              <Lock className="w-8 h-8 text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">HolzERP</h1>
            <p className="text-gray-500 mt-1">
              {isSetup ? 'Ersteinrichtung – Master-Passwort festlegen' : 'System entsperren'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Master-Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                placeholder={isSetup ? 'Neues Passwort (mind. 12 Zeichen)...' : 'Passwort eingeben...'}
                autoFocus
              />
            </div>

            {isSetup && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Passwort bestätigen
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                  placeholder="Passwort wiederholen..."
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !password || (isSetup && !confirmPassword)}
              className="w-full flex items-center justify-center py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isSetup ? (
                'Passwort festlegen & Starten'
              ) : (
                'Entsperren'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-gray-400">
            Verschlüsseltes ERP-System für Holzverarbeitung
          </div>
        </div>
      </div>
    </div>
  )
}