import React, { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Shield, Database, Download, Upload, AlertTriangle, Trash2, Image } from 'lucide-react'
import api from '../lib/api'

export default function Settings() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [sellerAddress, setSellerAddress] = useState('')
  const [vatPercent, setVatPercent] = useState<number>(19)
  const [taxNumber, setTaxNumber] = useState('')
  const [deliveryNote, setDeliveryNote] = useState('Der Kunde ist für die Ladungssicherung verantwortlich.')
  const [mainDomain, setMainDomain] = useState('http://localhost:3000')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState<number>(587)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpPasswordChanged, setSmtpPasswordChanged] = useState(false)
  const [offerLinkValidityDays, setOfferLinkValidityDays] = useState<number>(14)
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramBotTokenChanged, setTelegramBotTokenChanged] = useState(false)
  const [telegramChatId, setTelegramChatId] = useState('')
  const [addressMessage, setAddressMessage] = useState('')
  const [wipeStep, setWipeStep] = useState(0)
  const [wipeMessage, setWipeMessage] = useState('')
  const [hasLogo, setHasLogo] = useState(false)
  const [logoMessage, setLogoMessage] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

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
      if (data && data.taxNumber !== undefined) setTaxNumber(data.taxNumber)
      if (data && data.deliveryNote !== undefined) setDeliveryNote(data.deliveryNote)
      if (data && data.mainDomain) setMainDomain(data.mainDomain)
      if (data && data.smtpHost) setSmtpHost(data.smtpHost)
      if (data && data.smtpPort) setSmtpPort(data.smtpPort)
      if (data && data.smtpUser) setSmtpUser(data.smtpUser)
      if (data && data.smtpPassword && data.smtpPassword !== '••••••••') {
        setSmtpPassword(data.smtpPassword)
      } else {
        setSmtpPassword('')
        setSmtpPasswordChanged(false)
      }
      if (data && data.offerLinkValidityDays !== undefined) setOfferLinkValidityDays(data.offerLinkValidityDays)
      if (data && data.telegramBotToken && data.telegramBotToken !== '••••••••') {
        setTelegramBotToken(data.telegramBotToken)
      } else {
        setTelegramBotToken('')
        setTelegramBotTokenChanged(false)
      }
      if (data && data.telegramChatId) setTelegramChatId(data.telegramChatId)
      if (data && data.hasLogo !== undefined) setHasLogo(data.hasLogo)
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
      const payload: any = {
        sellerAddress,
        vatPercent,
        taxNumber,
        deliveryNote,
        mainDomain,
        smtpHost,
        smtpPort,
        smtpUser,
        offerLinkValidityDays,
        telegramChatId,
      }
      // Only send password if user actually changed it
      if (smtpPasswordChanged) {
        payload.smtpPassword = smtpPassword
      }
      // Only send telegram token if user actually changed it
      if (telegramBotTokenChanged) {
        payload.telegramBotToken = telegramBotToken
      }
      await api.put('/settings', payload)
    },
    onSuccess: () => {
      setAddressMessage('Einstellungen erfolgreich gespeichert')
      setTimeout(() => setAddressMessage(''), 3000)
    },
    onError: (error: any) => {
      setAddressMessage(error.response?.data?.message || 'Fehler beim Speichern der Einstellungen')
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Steuernummer
            </label>
            <input
              type="text"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              className="input max-w-full"
              placeholder="z.B. 123/456/7890"
            />
            <p className="text-xs text-gray-500 mt-1">Erscheint auf allen generierten PDF-Dokumenten im Fußbereich.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lieferhinweis (Ladungssicherung)
            </label>
            <textarea
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
              className="input min-h-[80px]"
              placeholder="Der Kunde ist für die Ladungssicherung verantwortlich."
            />
            <p className="text-xs text-gray-500 mt-1">Wird auf Angeboten, Aufträgen und Rechnungen angedruckt.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Systemhaupt-URL (Basis-URL für ext. Links)
            </label>
            <input
              type="text"
              value={mainDomain}
              onChange={(e) => setMainDomain(e.target.value)}
              className="input max-w-full"
              placeholder="https://deine-domain.de"
            />
            <p className="text-xs text-gray-500 mt-1">Wichtig für QR-Codes auf PDFs, damit Kunden auf das Dokument zugreifen können.</p>
          </div>

          {/* Logo Upload */}
          <div className="pt-4 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Image className="w-4 h-4" />
              Firmenlogo (für PDFs)
            </label>
            <p className="text-xs text-gray-500 mb-2">Wird oben links auf allen generierten PDF-Dokumenten angezeigt (max. 2 MB, PNG/JPEG/GIF).</p>
            <div className="flex items-center gap-3">
              {hasLogo && (
                <img
                  src={`/api/settings/logo?t=${Date.now()}`}
                  alt="Firmenlogo"
                  className="h-12 border rounded p-1 bg-white"
                />
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 2 * 1024 * 1024) {
                    setLogoMessage('Logo darf max. 2 MB groß sein.')
                    return
                  }
                  const reader = new FileReader()
                  reader.onload = async () => {
                    try {
                      await api.post('/settings/logo', {
                        data: reader.result as string,
                        filename: file.name,
                      })
                      setHasLogo(true)
                      setLogoMessage('Logo erfolgreich hochgeladen')
                      queryClient.invalidateQueries({ queryKey: ['settings'] })
                      setTimeout(() => setLogoMessage(''), 3000)
                    } catch (err: any) {
                      setLogoMessage(err.response?.data?.error || 'Fehler beim Hochladen')
                    }
                  }
                  reader.readAsDataURL(file)
                }}
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <Upload className="w-4 h-4" />
                {hasLogo ? 'Logo ersetzen' : 'Logo hochladen'}
              </button>
              {hasLogo && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api.delete('/settings/logo')
                      setHasLogo(false)
                      setLogoMessage('Logo entfernt')
                      setTimeout(() => setLogoMessage(''), 3000)
                    } catch (err: any) {
                      setLogoMessage(err.response?.data?.error || 'Fehler')
                    }
                  }}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            {logoMessage && (
              <div className={`mt-2 p-2 rounded text-sm ${logoMessage.includes('erfolgreich') || logoMessage.includes('entfernt') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {logoMessage}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Linkgültigkeit für Angebote (Tage)
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={offerLinkValidityDays}
              onChange={(e) => setOfferLinkValidityDays(Number(e.target.value))}
              className="input max-w-[120px]"
            />
            <p className="text-xs text-gray-500 mt-1">Wie lange der QR-Code-Link auf Angeboten gültig ist (Standard: 14 Tage).</p>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <h3 className="text-md font-semibold mb-3">SMTP E-Mail Server Einstellungen</h3>
            <p className="text-sm text-gray-500 mb-4">Wird verwendet, um Rechnungen, Angebote und Aufträge direkt aus dem System per E-Mail zu versenden.</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    className="input"
                    placeholder="mail.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    className="input"
                    placeholder="587"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Benutzername (meist E-Mail Adresse)</label>
                <input
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  className="input"
                  placeholder="info@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
                <input
                  type="password"
                  value={smtpPassword}
                  onChange={(e) => {
                    setSmtpPassword(e.target.value)
                    setSmtpPasswordChanged(true)
                  }}
                  className="input"
                  placeholder={smtpPasswordChanged ? '' : '(verschlüsselt gespeichert)'}
                />
                <p className="text-xs text-gray-500 mt-1">Wird verschlüsselt in der Datenbank gespeichert. Leer lassen um nicht zu ändern.</p>
              </div>
            </div>
          </div>

          {/* Telegram Bot Settings */}
          <div className="border-t border-gray-200 pt-6 mt-6">
            <h3 className="text-md font-semibold mb-3">Telegram Benachrichtigungen</h3>
            <p className="text-sm text-gray-500 mb-4">
              Erhalte sofortige Benachrichtigungen per Telegram, wenn ein Kunde ein Angebot über den QR-Code annimmt oder ablehnt.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bot Token</label>
                <input
                  type="password"
                  value={telegramBotToken}
                  onChange={(e) => {
                    setTelegramBotToken(e.target.value)
                    setTelegramBotTokenChanged(true)
                  }}
                  className="input"
                  placeholder={telegramBotTokenChanged ? '' : '(verschlüsselt gespeichert)'}
                />
                <p className="text-xs text-gray-500 mt-1">Vom @BotFather erhaltener Token. Wird verschlüsselt gespeichert.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chat-ID</label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="input"
                  placeholder="z.B. 123456789"
                />
                <p className="text-xs text-gray-500 mt-1">Deine persönliche Chat-ID oder eine Gruppen-ID.</p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={updateSettingsMutation.isPending}
            className="btn-primary mt-6"
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

        {/* DB Wipe Section */}
        <div className="mt-6 pt-6 border-t border-red-200">
          <h3 className="text-md font-semibold text-red-700 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Gefahrenzone
          </h3>
          {wipeStep === 0 && (
            <button
              onClick={() => setWipeStep(1)}
              className="px-4 py-2 bg-red-100 text-red-700 border border-red-300 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Datenbank zurücksetzen
            </button>
          )}
          {wipeStep === 1 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <p className="text-red-800 font-medium">⚠️ Sind Sie sicher? Alle Daten werden unwiderruflich gelöscht!</p>
              <p className="text-red-600 text-sm">Kunden, Angebote, Aufträge, Rechnungen, Einstellungen – alles wird gelöscht.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setWipeStep(2)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Ja, ich bin sicher
                </button>
                <button
                  onClick={() => setWipeStep(0)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
          {wipeStep === 2 && (
            <div className="bg-red-100 border-2 border-red-400 rounded-lg p-4 space-y-3">
              <p className="text-red-900 font-bold">🚨 LETZTE WARNUNG – Dies kann NICHT rückgängig gemacht werden!</p>
              <p className="text-red-700 text-sm">
                Tippen Sie <strong>DATENBANK UNWIDERRUFLICH LÖSCHEN</strong> ein, um die Löschung zu bestätigen:
              </p>
              <input
                type="text"
                className="input border-red-400 focus:ring-red-500"
                placeholder="Bestätigungstext hier eingeben..."
                onChange={(e) => {
                  if (e.target.value === 'DATENBANK UNWIDERRUFLICH LÖSCHEN') {
                    setWipeStep(3)
                  }
                }}
              />
              <button
                onClick={() => setWipeStep(0)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Abbrechen
              </button>
            </div>
          )}
          {wipeStep === 3 && (
            <div className="bg-red-100 border-2 border-red-500 rounded-lg p-4 space-y-3">
              <p className="text-red-900 font-bold text-lg">⛔ ENDGÜLTIGE BESTÄTIGUNG</p>
              <p className="text-red-700">Klicken Sie auf den Button, um die gesamte Datenbank unwiderruflich zu löschen.</p>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    try {
                      const { data } = await api.post('/system/wipe', {
                        confirmation: 'DATENBANK UNWIDERRUFLICH LÖSCHEN',
                      })
                      setWipeMessage(data.message || 'Datenbank wurde gelöscht.')
                      setWipeStep(0)
                    } catch (err: any) {
                      setWipeMessage(err.response?.data?.error || 'Fehler beim Löschen.')
                    }
                  }}
                  className="px-6 py-3 bg-red-700 text-white rounded-lg hover:bg-red-800 font-bold"
                >
                  🗑️ JETZT ENDGÜLTIG LÖSCHEN
                </button>
                <button
                  onClick={() => setWipeStep(0)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
          {wipeMessage && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${wipeMessage.includes('gelöscht') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {wipeMessage}
            </div>
          )}
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
