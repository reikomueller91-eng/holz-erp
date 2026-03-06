import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { CheckCircle, XCircle, Clock, AlertTriangle, Loader2, Download, FileText } from 'lucide-react'

interface OfferItem {
  productId: string
  heightMm: number
  widthMm: number
  lengthMm: number
  quantity: number
  quality: string
  pricePerM2: number
  netTotal: number
}

interface InvoiceInfo {
  invoiceId: string
  invoiceNumber: string
  date: string
  grossSum: number
  pdfAvailable: boolean
}

interface OfferInfo {
  offerNumber: string
  date: string
  validUntil: string
  customerAddress: string
  sellerAddress: string
  items: OfferItem[]
  netSum: number
  vatPercent: number
  vatAmount: number
  grossSum: number
  desiredCompletionDate?: string
  notes?: string
  status: string
  customerResponse: 'accepted' | 'rejected' | null
  customerResponseAt: string | null
  isExpired: boolean
  invoice: InvoiceInfo | null
}

interface ResponseResult {
  success: boolean
  message: string
  customerResponse: string
  customerResponseAt: string
}

export default function OfferResponse() {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const pw = searchParams.get('pw') || ''

  const [loading, setLoading] = useState(true)
  const [offerInfo, setOfferInfo] = useState<OfferInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ResponseResult | null>(null)
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!token || !pw) {
      setError('Ungültiger Link. Bitte scannen Sie den QR-Code erneut.')
      setLoading(false)
      return
    }

    axios
      .get(`/api/public/offers/${token}`, { params: { pw } })
      .then((res) => {
        setOfferInfo(res.data)
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          setError('Der Link ist ungültig oder abgelaufen.')
        } else if (err.response?.status === 404) {
          setError('Das Angebot wurde nicht gefunden.')
        } else {
          setError('Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.')
        }
      })
      .finally(() => setLoading(false))
  }, [token, pw])

  const handleRespond = async (response: 'accepted' | 'rejected') => {
    if (!token || !pw) return
    setSubmitting(true)

    try {
      const res = await axios.post(
        `/api/public/offers/${token}/respond`,
        { response, comment: comment.trim() || undefined },
        { params: { pw } }
      )
      setResult(res.data)
      if (offerInfo) {
        setOfferInfo({
          ...offerInfo,
          customerResponse: response,
          customerResponseAt: res.data.customerResponseAt,
        })
      }
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(err.response.data.message || 'Das Angebot wurde bereits beantwortet.')
      } else if (err.response?.status === 410) {
        setError(err.response.data.message || 'Die Angebotsgültigkeit ist abgelaufen.')
      } else {
        setError(err.response?.data?.message || 'Ein Fehler ist aufgetreten.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDownloadInvoice = () => {
    if (!token || !pw) return
    window.open(`/api/public/documents/${token}?pw=${pw}`, '_blank')
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-amber-600 mx-auto mb-4" />
          <p className="text-gray-600">Angebot wird geladen...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Hinweis</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!offerInfo) return null

  // Invoice available → show invoice download
  if (offerInfo.invoice && offerInfo.invoice.pdfAvailable) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <FileText className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Rechnung {offerInfo.invoice.invoiceNumber}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              zu Angebot {offerInfo.offerNumber}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Rechnungsdatum:</span>
              <span className="font-medium">{formatDate(offerInfo.invoice.date)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between">
              <span className="font-semibold">Gesamtbetrag:</span>
              <span className="font-bold text-lg">{formatCurrency(offerInfo.invoice.grossSum)}</span>
            </div>
          </div>

          <button
            onClick={handleDownloadInvoice}
            className="w-full px-4 py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
          >
            <Download className="h-5 w-5" />
            Rechnung herunterladen
          </button>

          <p className="text-xs text-gray-400 text-center mt-4">
            Vielen Dank für Ihren Auftrag.
          </p>
        </div>
      </div>
    )
  }

  // Already responded (accepted/rejected) - show status
  if (offerInfo.customerResponse || result) {
    const response = result?.customerResponse || offerInfo.customerResponse
    const responseAt = result?.customerResponseAt || offerInfo.customerResponseAt
    const isAccepted = response === 'accepted'

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          {isAccepted ? (
            <CheckCircle className="h-20 w-20 text-green-500 mx-auto mb-4" />
          ) : (
            <XCircle className="h-20 w-20 text-red-500 mx-auto mb-4" />
          )}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Angebot {offerInfo.offerNumber}
          </h1>
          <p className="text-lg font-medium mb-2" style={{ color: isAccepted ? '#22c55e' : '#ef4444' }}>
            {isAccepted ? 'Angenommen' : 'Abgelehnt'}
          </p>
          {result && (
            <p className="text-gray-600 mb-4">{result.message}</p>
          )}
          {responseAt && (
            <p className="text-sm text-gray-400">
              am {formatDate(responseAt)} um{' '}
              {new Date(responseAt).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
          <button
            onClick={() => window.open(`/api/public/documents/${token}?pw=${pw}`, '_blank')}
            className="mt-6 w-full px-4 py-3 border-2 border-amber-300 text-amber-700 rounded-lg font-medium hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
          >
            <Download className="h-5 w-5" />
            Angebot als PDF herunterladen
          </button>
        </div>
      </div>
    )
  }

  // Expired
  if (offerInfo.isExpired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <Clock className="h-20 w-20 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Angebot {offerInfo.offerNumber}
          </h1>
          <p className="text-gray-600 mb-4">
            Die Gültigkeit dieses Angebots ist am {formatDate(offerInfo.validUntil)} abgelaufen.
          </p>
          <p className="text-sm text-gray-400">
            Bitte kontaktieren Sie uns für ein neues Angebot.
          </p>
        </div>
      </div>
    )
  }

  // Show full offer + accept/reject form
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-2xl w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
            <span className="text-2xl">📋</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Angebot {offerInfo.offerNumber}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            vom {formatDate(offerInfo.date)}
          </p>
        </div>

        {/* Addresses */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Absender</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{offerInfo.sellerAddress}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Empfänger</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{offerInfo.customerAddress}</p>
          </div>
        </div>

        {/* Line items table */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Angebotspositionen</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-2 pr-2 text-gray-500 font-medium">Pos</th>
                  <th className="pb-2 pr-2 text-gray-500 font-medium">Artikel</th>
                  <th className="pb-2 pr-2 text-gray-500 font-medium text-right">Menge</th>
                  <th className="pb-2 pr-2 text-gray-500 font-medium text-right">Preis/m²</th>
                  <th className="pb-2 text-gray-500 font-medium text-right">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {offerInfo.items.map((item, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-2 pr-2 text-gray-600">{index + 1}</td>
                    <td className="py-2 pr-2 text-gray-800">
                      Holzprodukt {item.lengthMm}mm
                      <span className="text-xs text-gray-400 ml-1">
                        ({item.heightMm}×{item.widthMm}mm, {item.quality})
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-right text-gray-600">{item.quantity} Stk</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{formatCurrency(item.pricePerM2)}</td>
                    <td className="py-2 text-right font-medium text-gray-800">{formatCurrency(item.netTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Nettobetrag:</span>
            <span className="font-medium">{formatCurrency(offerInfo.netSum)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">MwSt ({offerInfo.vatPercent}%):</span>
            <span className="font-medium">{formatCurrency(offerInfo.vatAmount)}</span>
          </div>
          <div className="border-t pt-2 flex justify-between">
            <span className="font-semibold">Gesamtbetrag:</span>
            <span className="font-bold text-lg">{formatCurrency(offerInfo.grossSum)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Gültig bis:</span>
            <span className="font-medium">{formatDate(offerInfo.validUntil)}</span>
          </div>
          {offerInfo.desiredCompletionDate && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Gewünschte Fertigstellung:</span>
              <span className="font-medium">{formatDate(offerInfo.desiredCompletionDate)}</span>
            </div>
          )}
        </div>

        {offerInfo.notes && (
          <div className="bg-amber-50 rounded-lg p-3 mb-6">
            <p className="text-xs font-semibold text-amber-600 uppercase mb-1">Bemerkungen</p>
            <p className="text-sm text-gray-700">{offerInfo.notes}</p>
          </div>
        )}

        {/* PDF Download */}
        <div className="mb-6">
          <button
            onClick={() => window.open(`/api/public/documents/${token}?pw=${pw}`, '_blank')}
            className="w-full px-4 py-3 border-2 border-amber-300 text-amber-700 rounded-lg font-medium hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
          >
            <Download className="h-5 w-5" />
            Angebot als PDF herunterladen
          </button>
        </div>

        {/* Comment */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Kommentar (optional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            rows={3}
            placeholder="Optionaler Kommentar..."
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => handleRespond('rejected')}
            disabled={submitting}
            className="flex-1 px-4 py-3 border-2 border-red-300 text-red-700 rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            Ablehnen
          </button>
          <button
            onClick={() => handleRespond('accepted')}
            disabled={submitting}
            className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle className="h-5 w-5" />
            )}
            Annehmen
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          Mit der Annahme bestätigen Sie den Auftrag zu den genannten Konditionen.
        </p>
      </div>
    </div>
  )
}
