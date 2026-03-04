import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Eye, Download, WifiOff, AlertCircle } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { formatDate, formatCurrency } from '../lib/utils'
import { PageHeader, SearchInput, LoadingState, EmptyState, StatusBadge, Modal } from '../components/ui'
import { toast } from '../stores/toastStore'
import type { Offer, Customer, Product } from '../types'

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { data?: { message?: string; error?: string } }; message?: string; code?: string }
    if (err.response?.data?.message) return err.response.data.message
    if (err.response?.data?.error) return err.response.data.error
    if (err.code === 'ERR_NETWORK') return 'Server nicht erreichbar'
    if (err.message?.includes('Network')) return 'Netzwerkfehler'
    if (err.message) return err.message
  }
  return 'Unbekannter Fehler'
}

export default function Offers() {
  const [search, setSearch] = useState('')
  const [hideExpired, setHideExpired] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const navigate = useNavigate()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['offers'],
    queryFn: async () => {
      const { data } = await api.get<Offer[]>('/offers')
      console.log('Offers API response:', data)
      return data
    },
    retry: 1,
  })

  const offers = Array.isArray(data) ? data : []

  const todayDateStr = new Date().toISOString().split('T')[0]

  const filteredOffers = offers.filter(o => {
    const matchesSearch = o?.customerName?.toLowerCase().includes(search.toLowerCase())

    // An offer is expired if validUntil exists and is before today
    const isExpired = o.validUntil ? o.validUntil < todayDateStr : false

    if (hideExpired && isExpired) return false;

    return matchesSearch;
  })

  if (error && !isLoading) {
    const isNetwork = (error as { code?: string }).code === 'ERR_NETWORK'
    return (
      <div className="space-y-6">
        <PageHeader title="Angebote" />
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          {isNetwork ? <WifiOff className="w-12 h-12 text-red-500 mx-auto mb-3" /> : <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />}
          <h3 className="text-lg font-semibold text-red-800 mb-2">{isNetwork ? 'Server nicht erreichbar' : 'Fehler'}</h3>
          <p className="text-red-600 mb-4">{getErrorMessage(error)}</p>
          <button onClick={() => refetch()} className="btn-primary">Erneut versuchen</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Angebote"
        action={
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Neues Angebot
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="flex-1 w-full">
          <SearchInput value={search} onChange={setSearch} placeholder="Angebote suchen..." />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="hideExpired"
            checked={hideExpired}
            onChange={(e) => setHideExpired(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="hideExpired" className="text-sm text-gray-700 select-none cursor-pointer">
            Abgelaufene Angebote ausblenden
          </label>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <LoadingState /> : filteredOffers.length === 0 ? (
          <EmptyState message="Noch keine Angebote" searchActive={!!search} />
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Betrag</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOffers.map((offer) => {
                const isExpired = offer.validUntil ? offer.validUntil < todayDateStr : false;
                return (
                  <tr
                    key={offer.id}
                    className={`cursor-pointer ${isExpired ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}
                    onClick={() => navigate(`/offers/${offer.id}`)}
                  >
                    <td className="px-6 py-4 font-medium">{offer.customerName || 'Unbekannt'}</td>
                    <td className="px-6 py-4 text-gray-600">{formatDate(offer.createdAt)}</td>
                    <td className="px-6 py-4"><StatusBadge type="offer" status={offer.status} /></td>
                    <td className="px-6 py-4 text-right font-medium">{formatCurrency(offer.totalAmount)}</td>
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/offers/${offer.id}`} className="p-2 text-gray-400 hover:text-primary-600 inline-block">
                        <Eye className="w-4 h-4" />
                      </Link>
                      {offer.pdfPath && (
                        <a href={`/api/offers/${offer.id}/pdf`} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-400 hover:text-primary-600 inline-block" title="PDF ansehen">
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <OfferModal onClose={() => setShowModal(false)} />}
    </div>
  )
}

function OfferModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [lineItems, setLineItems] = useState<Array<{ productId: string; lengthM: number; quantity: number; unitPrice: number }>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await api.get<Customer[]>('/customers')
      return Array.isArray(data) ? data : []
    },
  })

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await api.get<Product[]>('/products')
      return Array.isArray(data) ? data : []
    },
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await api.get<{ sellerAddress: string; vatPercent: number }>('/settings')
      return data
    },
  })

  const handleSubmit = async () => {
    if (!selectedCustomer) {
      toast.error('Bitte einen Kunden auswählen')
      return
    }
    if (lineItems.length === 0) {
      toast.error('Bitte mindestens eine Position hinzufügen')
      return
    }

    setIsSubmitting(true)
    try {
      await api.post('/offers', {
        customerId: selectedCustomer,
        validUntil: validUntil || undefined,
        lineItems: lineItems.map(item => ({
          productId: item.productId,
          lengthMm: Math.round(item.lengthM * 1000),
          quantityPieces: item.quantity,
          unitPricePerM2: item.unitPrice,
        })),
      })
      toast.success('Angebot erstellt')
      queryClient.invalidateQueries({ queryKey: ['offers'] })
      onClose()
    } catch (error) {
      console.error('Create offer error:', error)
      toast.error(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const addLineItem = () => {
    setLineItems([...lineItems, { productId: '', lengthM: 1, quantity: 1, unitPrice: 0 }])
  }

  const updateLineItem = (index: number, field: keyof typeof lineItems[0], value: string | number) => {
    const newItems = [...lineItems]
    newItems[index] = { ...newItems[index], [field]: value }
    if (field === 'productId') {
      const product = products?.find(p => p.id === value)
      if (product) {
        if (product.calcMethod === 'volume_divided') {
          const divider = product.volumeDivider && product.volumeDivider > 0 ? product.volumeDivider : 1;
          newItems[index].unitPrice = (product.heightMm * product.widthMm) / divider;
        } else {
          newItems[index].unitPrice = product.currentPricePerM2;
        }
      }
    }
    setLineItems(newItems)
  }

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const grossSum = lineItems.reduce((sum, item) => {
    const product = products?.find(p => p.id === item.productId)
    if (!product) return sum

    let itemGross = 0;
    if (product.calcMethod === 'm2_unsorted' || product.calcMethod === 'volume_divided') {
      itemGross = item.lengthM * item.quantity * item.unitPrice;
    } else {
      const areaM2 = (product.widthMm / 1000) * item.lengthM;
      itemGross = areaM2 * item.quantity * item.unitPrice;
    }

    return sum + (Math.round(itemGross * 100) / 100);
  }, 0)

  const vatPercent = settings?.vatPercent ?? 19
  const netSum = Math.round((grossSum / (1 + vatPercent / 100)) * 100) / 100;
  const vatAmount = Math.round((grossSum - netSum) * 100) / 100;

  return (
    <Modal title="Neues Angebot" onClose={onClose} size="xl" footer={
      <>
        <button onClick={onClose} className="btn-secondary" disabled={isSubmitting}>Abbrechen</button>
        <button onClick={handleSubmit} disabled={!selectedCustomer || lineItems.length === 0 || isSubmitting} className="btn-primary">
          {isSubmitting ? 'Erstellen...' : 'Angebot erstellen'}
        </button>
      </>
    }>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kunde *</label>
            <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} className="input" disabled={isSubmitting}>
              <option value="">Bitte wählen...</option>
              {customers?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gültig bis</label>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="input" disabled={isSubmitting} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-medium text-gray-700">Positionen</label>
            <button onClick={addLineItem} className="text-sm text-primary-600 hover:text-primary-700" disabled={isSubmitting}>+ Position</button>
          </div>

          {lineItems.length > 0 && (
            <div className="flex items-center gap-2 px-2 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 mb-3">
              <div className="flex-1">Produkt</div>
              <div className="w-28 px-1">Maß (m/m²)</div>
              <div className="w-20 px-1">Anzahl</div>
              <div className="w-24 px-1">Stückpreis</div>
              <div className="w-6"></div>
            </div>
          )}

          <div className="space-y-2 mb-6">
            {lineItems.map((item, index) => {
              const product = products?.find(p => p.id === item.productId);
              return (
                <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-transparent hover:border-gray-200 transition-colors">
                  <select value={item.productId} onChange={(e) => updateLineItem(index, 'productId', e.target.value)} className="input flex-1 text-sm bg-white" disabled={isSubmitting}>
                    <option value="">Produkt wählen...</option>
                    {products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" step="0.001" placeholder={product?.calcMethod === 'm2_unsorted' ? "Fläche (m²)" : product?.calcMethod === 'volume_divided' ? "Länge (Lfm)" : "Länge (m)"} value={item.lengthM} onChange={(e) => updateLineItem(index, 'lengthM', Number(e.target.value))} className="input w-28 text-sm bg-white" disabled={isSubmitting} title={product?.calcMethod === 'm2_unsorted' ? "Fläche in Quadratmetern" : product?.calcMethod === 'volume_divided' ? "Länge in Laufmetern" : "Länge in Metern"} />
                  <input type="number" placeholder="Anzahl" value={item.quantity} onChange={(e) => updateLineItem(index, 'quantity', Number(e.target.value))} className="input w-20 text-sm bg-white" disabled={isSubmitting} />
                  <input type="number" step="0.01" placeholder={product?.calcMethod === 'volume_divided' ? "€/Lfm" : "€/m²"} value={item.unitPrice} onChange={(e) => updateLineItem(index, 'unitPrice', Number(e.target.value))} className="input w-24 text-sm bg-white" disabled={isSubmitting} title={product?.calcMethod === 'volume_divided' ? "Preis Brutto pro Laufmeter" : "Preis Brutto pro m²"} />
                  <button onClick={() => removeLineItem(index)} className="p-1 w-6 text-red-500 hover:bg-red-50 rounded flex justify-center items-center" disabled={isSubmitting} title="Entfernen">×</button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 flex flex-col items-end gap-1">
          <div className="flex justify-between w-48 text-sm text-gray-600">
            <span>Netto:</span>
            <span>{formatCurrency(netSum)}</span>
          </div>
          <div className="flex justify-between w-48 text-sm text-gray-600">
            <span>MwSt ({vatPercent}%):</span>
            <span>{formatCurrency(vatAmount)}</span>
          </div>
          <div className="flex justify-between w-48 text-lg font-bold text-gray-900 pt-2 border-t border-gray-100">
            <span>Brutto:</span>
            <span>{formatCurrency(grossSum)}</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}