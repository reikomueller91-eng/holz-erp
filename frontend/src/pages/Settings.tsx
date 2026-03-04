import React, { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Lock, Shield, Database, Download, Upload } from 'lucide-react'
import api from '../lib/api'

export default function Settings() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [sellerAddress, setSellerAddress] = useState('')
  const [vatPercent, setVatPercent] = useState<number>(19)
  const [addressMessage, setAddressMessage] = useState('')

  const { data: status } = useQuery({
    queryKey: ['auth-status'],
    queryFn: async () => {
      const { data } = await api.get('/auth/status')
      return data
    },
  })

  // Fetch address settings
  useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await api.get('/settings')
      if (data && data.sellerAddress) {
        setSellerAddress(data.sellerAddress)
      }
      if (data && data.vatPercent !== undefined) {
        setVatPercent(data.vatPercent)
      }
      return data
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      })
    },
    onSuccess: () => {
      setMessage('Passwort erfolgreich geändert')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (error: any) => {
      setMessage(error.response?.data?.message || 'Fehler beim Ändern des Passworts')
    },
  })

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    if (newPassword !== confirmPassword) {
      setMessage('Die Passwörter stimmen nicht überein')
      return
    }
    if (newPassword.length < 8) {
      setMessage('Das neue Passwort muss mindestens 8 Zeichen lang sein')
      return
    }
    changePasswordMutation.mutate()
  }

  const updateSettingsMutation = useMutation({
    mutationFn: async () => {
      await api.put('/settings', { sellerAddress, vatPercent })
    },
    onSuccess: () => {
      setAddressMessage('Absenderadresse erfolgreich gespeichert')
      setTimeout(() => setAddressMessage(''), 3000)
    },
    onError: (error: any) => {
      setAddressMessage(error.response?.data?.message || 'Fehler beim Speichern der Adresse')
    },
  })

  const handleAddressChange = (e: React.FormEvent) => {
    e.preventDefault()
    setAddressMessage('')
    updateSettingsMutation.mutate()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Einstellungen</h1>

      {/* Security Status */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6 text-green-600" />
          <h2 className="text-lg font-semibold">Sicherheitsstatus</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${status?.unlocked ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-gray-700">
            {status?.unlocked ? 'System entsperrt' : 'System gesperrt'}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Verschlüsselung: AES-256-GCM mit Argon2id
        </p>
      </div>

      {/* Firmendaten / Absenderadresse */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Database className="w-6 h-6 text-blue-600" />
          <h2 className="text-lg font-semibold">Firmendaten (Absenderadresse)</h2>
        </div>

        {addressMessage && (
          <div className={`p-3 mb-4 rounded-lg text-sm ${addressMessage.includes('erfolgreich') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
            {addressMessage}
          </div>
        )}

        <form onSubmit={handleAddressChange} className="space-y-4 max-w-md">
          <p className="text-sm text-gray-500 mb-2">Diese Einstellungen werden zentral für alle neu erstellten Angebote und Rechnungen verwendet.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Absenderadresse
            </label>
            <textarea
              value={sellerAddress}
              onChange={(e) => setSellerAddress(e.target.value)}
              className="input min-h-[120px]"
              placeholder="HolzERP Musterfirma&#10;Musterstraße 1&#10;12345 Musterstadt"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mehrwertsteuersatz (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={vatPercent}
              onChange={(e) => setVatPercent(Number(e.target.value))}
              className="input max-w-[120px]"
            />
            <p className="text-xs text-gray-500 mt-1">Wird bei der Erstellung neuer Angebote und Aufträge verwendet.</p>
          </div>
          <button
            type="submit"
            disabled={updateSettingsMutation.isPending}
            className="btn-primary"
          >
            {updateSettingsMutation.isPending ? 'Wird gespeichert...' : 'Einstellungen speichern'}
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="w-6 h-6 text-primary-600" />
          <h2 className="text-lg font-semibold">Passwort ändern</h2>
        </div>

        {message && (
          <div className={`p-3 mb-4 rounded-lg text-sm ${message.includes('erfolgreich') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
            {message}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aktuelles Passwort
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Neues Passwort
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Neues Passwort bestätigen
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              required
            />
          </div>
          <button
            type="submit"
            disabled={changePasswordMutation.isPending}
            className="btn-primary"
          >
            {changePasswordMutation.isPending ? 'Wird geändert...' : 'Passwort ändern'}
          </button>
        </form>
      </div>

      {/* Data Management */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Database className="w-6 h-6 text-wood-600" />
          <h2 className="text-lg font-semibold">Datenverwaltung</h2>
        </div>
        <div className="flex flex-wrap gap-4">
          <a
            href="/api/system/export/json"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Vollständiger Export (JSON)
          </a>
          <a
            href="/api/system/export/csv"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Vollständiger Export (CSV)
          </a>
          <button className="btn-secondary flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Backup wiederherstellen
          </button>
        </div>
      </div>

      {/* About */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-2"> Über HolzERP</h2>
        <p className="text-gray-600 text-sm">
          Version 2.0.0 Phase 6 - React Frontend
        </p>
        <p className="text-gray-500 text-xs mt-1">
          Ein verschlüsseltes ERP-System für die Holzverarbeitung.
          Alle Daten werden mit AES-256-GCM verschlüsselt gespeichert.
        </p>
      </div>
    </div>
  )
}
