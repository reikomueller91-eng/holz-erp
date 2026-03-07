import React, { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, CheckCircle, XCircle, FileText, ClipboardList, Edit, ArrowRight, Plus, Trash2, Send, UserPlus, Globe, Monitor, QrCode, Phone, Calculator } from 'lucide-react'
import api from '../lib/api'
import { formatCurrency } from '../lib/utils'
import type { Offer, Product, Customer } from '../types'

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
  const [showAssignCustomerModal, setShowAssignCustomerModal] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editValidUntil, setEditValidUntil] = useState('')
  const [editDesiredCompletionDate, setEditDesiredCompletionDate] = useState('')
  const [editLineItems, setEditLineItems] = useState<EditLineItem[]>([])
  const [showRoundingModal, setShowRoundingModal] = useState(false)
  const [roundingMethod, setRoundingMethod] = useState<'euro' | '5euro'>('euro')
  const [roundingTolerance, setRoundingTolerance] = useState(0.03)
  const [roundingResult, setRoundingResult] = useState<any>(null)
  const [roundingLoading, setRoundingLoading] = useState(false)

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

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await api.get<Customer[]>('/customers')
      return Array.isArray(data) ? data : []
    },
    enabled: showAssignCustomerModal,
  })

  const acceptMutation = useMutation({
    mutationFn: () => api.post(`/offers/${id}/status`, { status: 'accepted' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offer', id] }),
  })

  const manualAcceptMutation = useMutation({
    mutationFn: (comment: string | undefined) => api.post(`/offers/${id}/accept-manual`, { comment }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offer', id] }),
  })


  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/offers/${id}/status`, { status: 'rejected' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offer', id] }),
  })

  const markSentMutation = useMutation({
    mutationFn: () => api.post(`/offers/${id}/status`, { status: 'sent' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offer', id] }),
  })

  const generatePdfMutation = useMutation({
    mutationFn: () => api.post(`/offers/${id}/pdf`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer', id] })
      queryClient.invalidateQueries({ queryKey: ['offer-qr', id] })
    },
  })

  const emailMutation = useMutation({
    mutationFn: () => api.post(`/offers/${id}/email`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer', id] })
      alert('E-Mail erfolgreich versendet')
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Fehler beim Versenden der E-Mail')
    }
  })

  const applyRoundedMutation = useMutation({
    mutationFn: (items: Array<{ productId: string; lengthMm: number; quantityPieces: number; unitPricePerM2: number }>) =>
      api.post(`/offers/${id}/apply-rounded`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer', id] })
      setShowRoundingModal(false)
      setRoundingResult(null)
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Fehler beim Anwenden der Abrundung')
    }
  })

  const handleRoundGross = async () => {
    setRoundingLoading(true)
    setRoundingResult(null)
    try {
      const { data } = await api.post(`/offers/${id}/round-gross`, {
        roundingMethod,
        tolerance: roundingTolerance,
      })
      setRoundingResult(data)
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fehler bei der Berechnung')
    } finally {
      setRoundingLoading(false)
    }
  }

  const assignCustomerMutation = useMutation({
    mutationFn: (customerId: string) => api.post(`/offers/${id}/assign-customer`, { customerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer', id] })
      setShowAssignCustomerModal(false)
      setSelectedCustomerId('')
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Fehler bei Kundenzuordnung')
    }
  })

  const updateMutation = useMutation({
    mutationFn: (body: { notes?: string; validUntil?: string; desiredCompletionDate?: string; lineItems?: { productId: string; lengthMm: number; quantityPieces: number; unitPricePerM2: number }[] }) =>
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

  interface AccessLogEntry {
    id: string
    action: string
    ipAddress: string
    userAgent: string
    createdAt: string
  }

  const { data: accessLogs } = useQuery({
    queryKey: ['offer-access-log', id],
    queryFn: async () => {
      const { data } = await api.get<{ logs: AccessLogEntry[] }>(`/offers/${id}/access-log`)
      return data.logs
    },
  })

  const { data: qrData } = useQuery({
    queryKey: ['offer-qr', id],
    queryFn: async () => {
      const res = await api.get<{ secureLink: string | null; qrDataUrl: string | null }>(`/offers/${id}/qrlink`)
      return res.data
    },
    enabled: !!offer?.pdfPath,
  })

  const openEditModal = () => {
    setEditNotes(offer?.notes ?? '')
    setEditValidUntil(offer?.validUntil ? offer.validUntil.split('T')[0] : '')
    setEditDesiredCompletionDate(offer?.desiredCompletionDate ? offer.desiredCompletionDate.split('T')[0] : '')
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
      desiredCompletionDate: editDesiredCompletionDate || undefined,
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

  // Verify whether customer has email
  const anyOffer = offer as any
  const hasEmail = Boolean(anyOffer.customer?.contactInfo?.email)

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
            <button
              onClick={() => {
                emailMutation.mutate();
                if (offer.status === 'draft') {
                  markSentMutation.mutate();
                }
              }}
              disabled={emailMutation.isPending || !hasEmail}
              className={`btn-primary flex items-center gap-2 ${!hasEmail ? 'opacity-50 cursor-not-allowed bg-gray-400 hover:bg-gray-400' : ''}`}
              title={!hasEmail ? "Kunde hat keine E-Mail Adresse hinterlegt" : "Angebot per E-Mail senden"}
            >
              <Send className="w-4 h-4" />
              {emailMutation.isPending ? 'Wird gesendet...' : 'Per E-Mail senden'}
            </button>
          )}
          {offer.status === 'draft' && (offer as any).pdfPath && (
            <button
              onClick={() => markSentMutation.mutate()}
              disabled={markSentMutation.isPending}
              className="btn-secondary flex items-center gap-2"
            >
              Als gesendet markieren
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
          {(offer.status === 'sent' || offer.status === 'draft') && (
            <button
              onClick={() => {
                if (confirm('Angebot im Auftrag des Kunden annehmen?')) {
                  manualAcceptMutation.mutate(undefined)
                }
              }}
              disabled={manualAcceptMutation.isPending}
              className="btn-secondary flex items-center gap-2 border-green-300 text-green-700 hover:bg-green-50"
            >
              <Phone className="w-4 h-4" />
              Im Auftrag d. Kunden annehmen
            </button>
          )}
          {(offer.status === 'accepted' || offer.status === 'draft') && !isConverted && (
            <button
              onClick={() => convertMutation.mutate()}
              disabled={convertMutation.isPending || !offer.customerId}
              className={`btn-primary flex items-center gap-2 ${!offer.customerId ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={!offer.customerId ? 'Bitte zuerst einen Kunden zuordnen' : 'Zum Auftrag umwandeln'}
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
                {(offer.lineItems || (offer.items as any[]) || []).map((item: any) => (
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
                  <td colSpan={4} className="px-6 py-2 text-right text-sm text-gray-600">Netto:</td>
                  <td className="px-6 py-2 text-right text-gray-700">
                    {formatCurrency(offer.netSum ?? 0)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-6 py-2 text-right text-sm text-gray-600">MwSt ({offer.vatPercent ?? 19}%):</td>
                  <td className="px-6 py-2 text-right text-gray-700">
                    {formatCurrency(offer.vatAmount ?? 0)}
                  </td>
                </tr>
                <tr className="border-t border-gray-300">
                  <td colSpan={3} className="px-6 py-4 text-right">
                    {offer.status === 'draft' && (
                      <button
                        onClick={() => { setShowRoundingModal(true); setRoundingResult(null) }}
                        className="btn-secondary text-sm flex items-center gap-1 ml-auto"
                      >
                        <Calculator className="w-4 h-4" />
                        Brutto abrunden
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-700">Brutto:</td>
                  <td className="px-6 py-4 text-right font-bold text-gray-900 text-lg">
                    {formatCurrency(offer.totalAmount ?? offer.grossSum ?? 0)}
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
                <p className="font-medium text-gray-900">
                  {offer.customerId ? (offer.customerName || 'Unbekannt') : (
                    <span className="text-amber-600 flex items-center gap-1">
                      Anonym
                      <button
                        onClick={() => setShowAssignCustomerModal(true)}
                        className="ml-2 text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded hover:bg-primary-200"
                      >
                        <UserPlus className="w-3 h-3 inline mr-1" />
                        Zuordnen
                      </button>
                    </span>
                  )}
                </p>
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
              {offer.validUntil && (
                <div>
                  <p className="text-sm text-gray-500">Angebotsdauer</p>
                  <p className="font-medium text-gray-900">
                    {(() => {
                      const now = new Date();
                      const validDate = new Date(offer.validUntil);
                      const diffDays = Math.ceil((validDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      if (diffDays < 0) return <span className="text-red-600">Abgelaufen ({Math.abs(diffDays)} Tage)</span>;
                      return <span className="text-green-700">{diffDays} Tage verbleibend</span>;
                    })()}
                  </p>
                </div>
              )}
              {offer.desiredCompletionDate && (
                <div>
                  <p className="text-sm text-gray-500">Wunschdatum Fertigstellung</p>
                  <p className="font-medium text-gray-900">
                    {new Date(offer.desiredCompletionDate).toLocaleDateString('de-DE')}
                  </p>
                </div>
              )}
              {/* Customer QR Response */}
              {offer.customerResponse && (
                <div>
                  <p className="text-sm text-gray-500">Kundenantwort (QR)</p>
                  <div className="mt-1">
                    {offer.customerResponse === 'accepted' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        <CheckCircle className="w-3.5 h-3.5" /> Vom Kunden angenommen
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                        <XCircle className="w-3.5 h-3.5" /> Vom Kunden abgelehnt
                      </span>
                    )}
                    {offer.customerResponseAt && (
                      <p className="text-xs text-gray-400 mt-1">
                        am {new Date(offer.customerResponseAt).toLocaleDateString('de-DE')}{' '}
                        um {new Date(offer.customerResponseAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {offer.customerComment && (
                      <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
                        <p className="text-xs text-gray-500 font-medium">Kundenkommentar:</p>
                        <p className="text-sm text-gray-700 mt-0.5">{offer.customerComment}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {!offer.customerResponse && offer.status === 'sent' && (
                <div>
                  <p className="text-sm text-gray-500">Kundenantwort (QR)</p>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 mt-1">
                    Ausstehend
                  </span>
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

          {/* QR Code Section */}
          {qrData?.qrDataUrl && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-3">
                <QrCode className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-semibold">QR-Code</h2>
              </div>
              <div className="flex flex-col items-center">
                <img
                  src={qrData.qrDataUrl}
                  alt="Angebots-QR-Code"
                  className="w-40 h-40"
                />
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Diesen QR-Code scannen, um das Angebot online aufzurufen.
                </p>
              </div>
              {qrData?.secureLink && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Direktlink:</p>
                  <div className="bg-gray-50 rounded p-2 break-all text-xs text-gray-700 font-mono select-all">
                    {qrData.secureLink}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Access Log / Client Tracking */}
          {accessLogs && accessLogs.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-4">
                <Globe className="w-6 h-6 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">Zugriffsverlauf</h2>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{accessLogs.length} Einträge</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {accessLogs.map((log) => {
                  const actionLabels: Record<string, string> = {
                    view_offer: '📄 Angebot angesehen',
                    download_pdf: '⬇️ PDF heruntergeladen',
                    respond_accepted: '✅ Angebot angenommen',
                    respond_rejected: '❌ Angebot abgelehnt',
                  };
                  return (
                    <div key={log.id} className="flex items-start gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800">
                          {actionLabels[log.action] || log.action}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {log.ipAddress}
                          </span>
                          <span className="inline-flex items-center gap-1 truncate max-w-[300px]" title={log.userAgent}>
                            <Monitor className="w-3 h-3" />
                            {log.userAgent.length > 60 ? log.userAgent.substring(0, 60) + '…' : log.userAgent}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleDateString('de-DE')}{' '}
                        {new Date(log.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wunschdatum Fertigstellung</label>
                  <input
                    type="date"
                    value={editDesiredCompletionDate}
                    onChange={(e) => setEditDesiredCompletionDate(e.target.value)}
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

      {/* Assign Customer Modal */}
      {showAssignCustomerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Kunde zuordnen</h2>
            <p className="text-sm text-gray-500 mb-4">Wählen Sie einen Kunden für dieses anonyme Angebot aus.</p>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="input w-full mb-4"
            >
              <option value="">Kunde auswählen...</option>
              {(customers || []).map((c: Customer) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => selectedCustomerId && assignCustomerMutation.mutate(selectedCustomerId)}
                disabled={!selectedCustomerId || assignCustomerMutation.isPending}
                className="btn-primary flex-1"
              >
                {assignCustomerMutation.isPending ? 'Zuordnen...' : 'Zuordnen'}
              </button>
              <button
                onClick={() => { setShowAssignCustomerModal(false); setSelectedCustomerId('') }}
                className="btn-secondary flex-1"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brutto Rounding Modal */}
      {showRoundingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Brutto abrunden
            </h2>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Aktueller Bruttobetrag:</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(offer.totalAmount ?? offer.grossSum ?? 0)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Abrundungsmethode</label>
                  <select
                    value={roundingMethod}
                    onChange={(e) => setRoundingMethod(e.target.value as 'euro' | '5euro')}
                    className="input w-full"
                  >
                    <option value="euro">Auf volle Euro (z.B. 147,67€ → 147€)</option>
                    <option value="5euro">Auf volle 5 Euro (z.B. 147,67€ → 145€)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Toleranz (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1"
                    value={roundingTolerance}
                    onChange={(e) => setRoundingTolerance(parseFloat(e.target.value) || 0.03)}
                    className="input w-full"
                  />
                </div>
              </div>

              <button
                onClick={handleRoundGross}
                disabled={roundingLoading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {roundingLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Berechne... (bis zu 3 Sekunden)
                  </>
                ) : (
                  <>
                    <Calculator className="w-4 h-4" />
                    Berechnung starten
                  </>
                )}
              </button>

              {roundingResult && (
                <div className={`p-4 rounded-lg border ${roundingResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <p className={`text-sm font-medium ${roundingResult.success ? 'text-green-800' : 'text-red-800'}`}>
                    {roundingResult.message}
                  </p>

                  {roundingResult.success && (
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-gray-600">Neues Netto:</span>
                        <span className="text-right font-medium">{formatCurrency(roundingResult.netSum)}</span>
                        <span className="text-gray-600">Neue MwSt:</span>
                        <span className="text-right font-medium">{formatCurrency(roundingResult.vatAmount)}</span>
                        <span className="text-gray-600">Neues Brutto:</span>
                        <span className="text-right font-bold text-lg">{formatCurrency(roundingResult.grossSum)}</span>
                      </div>

                      <div className="mt-3 pt-3 border-t border-green-200">
                        <p className="text-xs text-gray-500 mb-2">Angepasste Positionen:</p>
                        <div className="space-y-1">
                          {roundingResult.items.map((item: any, idx: number) => {
                            const orig = (offer.lineItems || [])[idx] as any
                            const lengthChanged = orig && item.lengthMm !== orig.lengthMm
                            const priceChanged = orig && Math.abs(item.unitPricePerM2 - orig.unitPricePerM2) > 0.001
                            if (!lengthChanged && !priceChanged) return null
                            return (
                              <div key={idx} className="text-xs bg-white rounded p-2 border">
                                <span className="font-medium">Pos {idx + 1}: </span>
                                {lengthChanged && (
                                  <span className="text-blue-600">
                                    Länge: {(orig.lengthMm / 1000).toFixed(3)}m → {(item.lengthMm / 1000).toFixed(3)}m
                                  </span>
                                )}
                                {lengthChanged && priceChanged && <span> | </span>}
                                {priceChanged && (
                                  <span className="text-purple-600">
                                    Preis: €{orig.unitPricePerM2.toFixed(2)} → €{item.unitPricePerM2.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t mt-4">
              {roundingResult?.success && (
                <button
                  onClick={() => applyRoundedMutation.mutate(roundingResult.items)}
                  disabled={applyRoundedMutation.isPending}
                  className="btn-primary flex-1"
                >
                  {applyRoundedMutation.isPending ? 'Übernehme...' : 'Übernehmen'}
                </button>
              )}
              <button
                onClick={() => { setShowRoundingModal(false); setRoundingResult(null) }}
                className="btn-secondary flex-1"
              >
                {roundingResult?.success ? 'Abbrechen' : 'Schließen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}