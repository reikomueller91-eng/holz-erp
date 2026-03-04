import React, { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, CheckCircle, XCircle, FileText, ClipboardList, Edit, ArrowRight, Plus, Trash2 } from 'lucide-react'
import api from '../lib/api'
import { formatCurrency } from '../lib/utils'
import type { Offer, Product } from '../types'

type EditLineItem = {
  productId: string
  lengthM: number
  quantity: number
  unitPrice: number
}

export default function OfferDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [showEditModal, setShowEditModal] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [editValidUntil, setEditValidUntil] = useState('')
  const [editLineItems, setEditLineItems] = useState<EditLineItem[]>([])

  const { data: offer } = useQuery({
    queryKey: ['offer', id],
    queryFn: async () => {
      const { data } = await api.get<Offer>(`/offers/${id}`)
      return data
    },
  })

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await api.get<Product[]>('/products')
      return Array.isArray(data) ? data : []
    },
    enabled: showEditModal,
  })

  const acceptMutation = useMutation({
    mutationFn: () => api.post(`/offers/${id}/status`, { status: 'accepted' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offer', id] }),
  })

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/offers/${id}/status`, { status: 'rejected' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offer', id] }),
  })

  const generatePdfMutation = useMutation({
    mutationFn: () => api.post(`/offers/${id}/pdf`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offer', id] }),
  })

  const updateMutation = useMutation({
    mutationFn: (body: { notes?: string; validUntil?: string; lineItems?: { productId: string; lengthMm: number; quantityPieces: number; unitPricePerM2: number }[] }) =>
      api.put(`/offers/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer', id] })
      setShowEditModal(false)
    },
  })

  const convertMutation = useMutation({
    mutationFn: () => api.post<{ orderId: string }>(`/offers/${id}/convert`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['offers'] })
      navigate(`/orders/${res.data.orderId ?? ''}`)
    },
  })

  const openEditModal = () => {
    setEditNotes(offer?.notes ?? '')
    setEditValidUntil(offer?.validUntil ? offer.validUntil.split('T')[0] : '')
    setEditLineItems(
      (offer?.lineItems ?? []).map(item => ({
        productId: item.productId,
        lengthM: item.lengthMm / 1000,
        quantity: item.quantityPieces,
        unitPrice: item.unitPricePerM2,
      }))
    )
    setShowEditModal(true)
  }

  const addLineItem = () => {
    setEditLineItems([...editLineItems, { productId: '', lengthM: 1, quantity: 1, unitPrice: 0 }])
  }

  const updateLineItem = (index: number, field: keyof EditLineItem, value: string | number) => {
    const updated = [...editLineItems]
    updated[index] = { ...updated[index], [field]: value }
    if (field === 'productId') {
      const product = products?.find(p => p.id === value)
      if (product) {
        if (product.calcMethod === 'volume_divided') {
          const divider = product.volumeDivider && product.volumeDivider > 0 ? product.volumeDivider : 1;
          updated[index].unitPrice = (product.heightMm * product.widthMm) / divider;
        } else {
          updated[index].unitPrice = product.currentPricePerM2;
        }
      }
    }
    setEditLineItems(updated)
  }

  const removeLineItem = (index: number) => {
    setEditLineItems(editLineItems.filter((_, i) => i !== index))
  }

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({
      notes: editNotes || undefined,
      validUntil: editValidUntil || undefined,
      lineItems: editLineItems
        .filter(item => item.productId)
        .map(item => ({
          productId: item.productId,
          lengthMm: Math.round(item.lengthM * 1000),
          quantityPieces: item.quantity,
          unitPricePerM2: item.unitPrice,
        })),
    })
  }

  const editTotal = editLineItems.reduce((sum, item) => {
    const product = products?.find(p => p.id === item.productId)
    if (!product) return sum

    let itemGross = 0;
    if (product.calcMethod === 'm2_unsorted' || product.calcMethod === 'volume_divided') {
      itemGross = item.lengthM * item.quantity * item.unitPrice;
    } else {
      const areaM2 = (product.widthMm / 1000) * item.lengthM;
      itemGross = areaM2 * item.quantity * item.unitPrice;
    }
    return sum + itemGross;
  }, 0)

  if (!offer) return <div className="p-8 text-center">Laden...</div>

  const offerStatus = offer.status as string
  const isConverted = offerStatus === 'converted'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/offers" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Angebot #{offer.id.slice(0, 8)}</h1>
          <p className="text-gray-500">Version {offer.version}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {offer.status === 'draft' && (
            <button onClick={openEditModal} className="btn-secondary flex items-center gap-2">
              <Edit className="w-4 h-4" />
              Bearbeiten
            </button>
          )}
          {offer.status === 'draft' && (
            <button
              onClick={() => generatePdfMutation.mutate()}
              disabled={generatePdfMutation.isPending}
              className="btn-secondary flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              {generatePdfMutation.isPending ? 'Generiert...' : 'PDF generieren'}
            </button>
          )}
          {(offer as any).pdfPath && (
            <a
              href={`/api/offers/${offer.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              PDF ansehen
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
          {(offer.status === 'accepted' || offer.status === 'draft') && !isConverted && (
            <button
              onClick={() => convertMutation.mutate()}
              disabled={convertMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              {convertMutation.isPending ? 'Wird umgewandelt...' : 'Zum Auftrag umwandeln'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items */}
          <div className="card">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Positionen</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produkt</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Maß</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Anzahl</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stückpreis</th>
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
                    <td className="px-6 py-4 text-right text-gray-600">{(item.lengthMm / 1000).toFixed(3)}</td>
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
                    {formatCurrency(offer.totalAmount)}
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

        {/* Sidebar */}
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
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full
                  ${offer.status === 'draft' ? 'bg-gray-100 text-gray-800' : ''}
                  ${offer.status === 'sent' ? 'bg-blue-100 text-blue-800' : ''}
                  ${offer.status === 'accepted' ? 'bg-green-100 text-green-800' : ''}
                  ${offer.status === 'rejected' ? 'bg-red-100 text-red-800' : ''}
                  ${isConverted ? 'bg-purple-100 text-purple-800' : ''}
                `}>
                  {offer.status === 'draft' && 'Entwurf'}
                  {offer.status === 'sent' && 'Gesendet'}
                  {offer.status === 'accepted' && 'Angenommen'}
                  {offer.status === 'rejected' && 'Abgelehnt'}
                  {isConverted && 'Umgewandelt'}
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

          {isConverted && (
            <div className="card p-6 bg-purple-50 border-purple-200">
              <div className="flex items-center gap-3 mb-3">
                <ClipboardList className="w-6 h-6 text-purple-600" />
                <h2 className="text-lg font-semibold text-purple-900">Umgewandelt</h2>
              </div>
              <p className="text-purple-700 text-sm mb-4">
                Dieses Angebot wurde in einen Auftrag umgewandelt.
              </p>
              <Link
                to="/orders"
                className="inline-flex items-center gap-2 text-purple-700 hover:text-purple-800 font-medium"
              >
                <ClipboardList className="w-4 h-4" />
                Zu den Aufträgen
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Full Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-3xl my-8">
            <h2 className="text-lg font-bold text-gray-900 mb-5">Angebot bearbeiten</h2>
            <form onSubmit={handleEditSave} className="space-y-5">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gültig bis</label>
                  <input
                    type="date"
                    value={editValidUntil}
                    onChange={(e) => setEditValidUntil(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="input"
                    placeholder="Notizen..."
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700">Positionen</label>
                  <button type="button" onClick={addLineItem} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700">
                    <Plus className="w-4 h-4" /> Position hinzufügen
                  </button>
                </div>

                {editLineItems.length === 0 && (
                  <p className="text-sm text-gray-400 italic py-2">Noch keine Positionen. Bitte hinzufügen.</p>
                )}

                {editLineItems.map((item, index) => {
                  const product = products?.find(p => p.id === item.productId)
                  const lineTotal = (() => {
                    if (!product) return 0;
                    if (product.calcMethod === 'm2_unsorted' || product.calcMethod === 'volume_divided') {
                      return item.lengthM * item.quantity * item.unitPrice;
                    }
                    return ((product.widthMm / 1000) * item.lengthM) * item.unitPrice * item.quantity;
                  })();

                  return (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={item.productId}
                          onChange={(e) => updateLineItem(index, 'productId', e.target.value)}
                          className="input flex-1 min-w-[160px] text-sm"
                        >
                          <option value="">Produkt wählen...</option>
                          {products?.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.woodType})</option>
                          ))}
                        </select>
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500 mb-0.5" title={product?.calcMethod === 'm2_unsorted' ? "Fläche in Quadratmetern" : product?.calcMethod === 'volume_divided' ? "Länge in Laufmetern" : "Länge in Metern"}>
                            {product?.calcMethod === 'm2_unsorted' ? "Fläche (m²)" : product?.calcMethod === 'volume_divided' ? "Länge (Lfm)" : "Länge (m)"}
                          </span>
                          <input
                            type="number"
                            step="0.001"
                            value={item.lengthM}
                            onChange={(e) => updateLineItem(index, 'lengthM', Number(e.target.value))}
                            className="input w-24 text-sm"
                            min={0.001}
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500 mb-0.5">Anzahl</span>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(index, 'quantity', Number(e.target.value))}
                            className="input w-20 text-sm"
                            min={1}
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500 mb-0.5" title={product?.calcMethod === 'volume_divided' ? "Preis Brutto pro Laufmeter" : "Preis Brutto pro m²"}>
                            {product?.calcMethod === 'volume_divided' ? "€/Lfm" : "€/m²"}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateLineItem(index, 'unitPrice', Number(e.target.value))}
                            className="input w-24 text-sm"
                            min={0}
                          />
                        </div>
                        <div className="flex flex-col items-end min-w-[80px]">
                          <span className="text-xs text-gray-500 mb-0.5">Gesamt</span>
                          <span className="text-sm font-medium text-gray-900">€{lineTotal.toFixed(2)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded mt-4"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {product && (
                        <p className="text-xs text-gray-400 mt-1 ml-1">
                          {product.heightMm}×{product.widthMm} mm · Qualität {product.qualityGrade}
                          {item.lengthM > 0 && product.calcMethod !== 'm2_unsorted' && product.calcMethod !== 'volume_divided' && ` · ${((product.widthMm / 1000) * item.lengthM).toFixed(4)} m² × ${item.quantity} Stk.`}
                        </p>
                      )}
                    </div>
                  )
                })}

                {editLineItems.length > 0 && (
                  <div className="text-right font-bold text-gray-900 pt-2">
                    Gesamt: {formatCurrency(editTotal)}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2 border-t">
                <button
                  type="submit"
                  disabled={updateMutation.isPending || editLineItems.filter(i => i.productId).length === 0}
                  className="btn-primary flex-1"
                >
                  {updateMutation.isPending ? 'Speichern...' : 'Änderungen speichern'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn-secondary flex-1"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}