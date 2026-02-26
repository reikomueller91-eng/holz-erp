import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, CheckCircle, XCircle, FileText, ClipboardList } from 'lucide-react'
import api from '../lib/api'
import type { Offer } from '../types'

export default function OfferDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: offer } = useQuery({
    queryKey: ['offer', id],
    queryFn: async () => {
      const { data } = await api.get<Offer>(`/offers/${id}`)
      return data
    },
  })

  const acceptMutation = useMutation({
    mutationFn: () => api.post(`/offers/${id}/accept`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offer', id] }),
  })

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/offers/${id}/reject`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offer', id] }),
  })

  const generatePdfMutation = useMutation({
    mutationFn: () => api.post(`/offers/${id}/pdf`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offer', id] }),
  })

  if (!offer) return <div className="p-8 text-center">Laden...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/offers" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Angebot #{offer.id.slice(0, 8)}</h1>
          <p className="text-gray-500">Version {offer.version}</p>
        </div>
        <div className="flex items-center gap-2">
          {offer.status === 'draft' && (
            <button
              onClick={() => generatePdfMutation.mutate()}
              disabled={generatePdfMutation.isPending}
              className="btn-secondary flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              PDF generieren
            </button>
          )}
          {offer.pdfPath && (
            <a
              href={`/api/offers/${offer.id}/pdf`}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              PDF herunterladen
            </a>
          )}
          {offer.status === 'sent' && (
            <>
              <button
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                className="btn-primary flex items-center gap-2 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4" />
                Annehmen
              </button>
              <button
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending}
                className="btn-danger flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                Ablehnen
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Positionen</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produkt</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Länge</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Anzahl</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Preis/m²</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gesamt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {offer.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{item.productName || 'Unbekannt'}</p>
                      {item.notes && <p className="text-sm text-gray-500">{item.notes}</p>}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">{item.lengthMm} mm</td>
                    <td className="px-6 py-4 text-right text-gray-600">{item.quantityPieces}</td>
                    <td className="px-6 py-4 text-right text-gray-600">€{item.unitPricePerM2.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      €{item.totalPrice.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-right font-medium text-gray-700">Gesamtsumme:</td>
                  <td className="px-6 py-4 text-right font-bold text-gray-900 text-lg">
                    €{offer.totalAmount.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {offer.notes && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold mb-2">Notizen</h2>
              <p className="text-gray-600">{offer.notes}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Details</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Kunde</p>
                <p className="font-medium text-gray-900">{offer.customerName || 'Unbekannt'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <span className={`
                  inline-flex px-2 py-1 text-xs font-medium rounded-full
                  ${offer.status === 'draft' ? 'bg-gray-100 text-gray-800' : ''}
                  ${offer.status === 'sent' ? 'bg-blue-100 text-blue-800' : ''}
                  ${offer.status === 'accepted' ? 'bg-green-100 text-green-800' : ''}
                  ${offer.status === 'rejected' ? 'bg-red-100 text-red-800' : ''}
                `}>
                  {offer.status === 'draft' && 'Entwurf'}
                  {offer.status === 'sent' && 'Gesendet'}
                  {offer.status === 'accepted' && 'Angenommen'}
                  {offer.status === 'rejected' && 'Abgelehnt'}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Erstellt am</p>
                <p className="font-medium text-gray-900">
                  {new Date(offer.createdAt).toLocaleDateString('de-DE')}
                </p>
              </div>
              {offer.validUntil && (
                <div>
                  <p className="text-sm text-gray-500">Gültig bis</p>
                  <p className="font-medium text-gray-900">
                    {new Date(offer.validUntil).toLocaleDateString('de-DE')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {offer.status === 'accepted' && (
            <div className="card p-6 bg-green-50 border-green-200">
              <div className="flex items-center gap-3 mb-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <h2 className="text-lg font-semibold text-green-900">Angenommen</h2>
              </div>
              <p className="text-green-700 text-sm mb-4">
                Dieses Angebot wurde angenommen. Ein Auftrag wurde erstellt.
              </p>
              <Link
                to={`/orders`}
                className="inline-flex items-center gap-2 text-green-700 hover:text-green-800 font-medium"
              >
                <ClipboardList className="w-4 h-4" />
                Zum Auftrag
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}