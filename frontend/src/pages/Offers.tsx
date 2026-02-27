import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Eye, Download, WifiOff, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
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
  const [showModal, setShowModal] = useState(false)

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

  const filteredOffers = offers.filter(o => 
    o?.customerName?.toLowerCase().includes(search.toLowerCase())
  )

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

      <SearchInput value={search} onChange={setSearch} placeholder="Angebote suchen..." />

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
              {filteredOffers.map((offer) => (
                <tr key={offer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{offer.customerName || 'Unbekannt'}</td>
                  <td className="px-6 py-4 text-gray-600">{formatDate(offer.createdAt)}</td>
                  <td className="px-6 py-4"><StatusBadge type="offer" status={offer.status} /></td>
                  <td className="px-6 py-4 text-right font-medium">{formatCurrency(offer.totalAmount)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/offers/${offer.id}`} className="p-2 text-gray-400 hover:text-primary-600 inline-block">
                      <Eye className="w-4 h-4" />
                    </Link>
                    {offer.pdfPath && (
                      <a href={`/api/offers/${offer.id}/pdf`} className="p-2 text-gray-400 hover:text-primary-600 inline-block">
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
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
  const [lineItems, setLineItems] = useState<Array<{productId: string; lengthMm: number; quantity: number; unitPrice: number}>>([])
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
          lengthMm: item.lengthMm,
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
    setLineItems([...lineItems, { productId: '', lengthMm: 1000, quantity: 1, unitPrice: 0 }])
  }

  const updateLineItem = (index: number, field: keyof typeof lineItems[0], value: string | number) => {
    const newItems = [...lineItems]
    newItems[index] = { ...newItems[index], [field]: value }
    if (field === 'productId') {
      const product = products?.find(p => p.id === value)
      if (product) {
        newItems[index].unitPrice = product.currentPricePerM2
      }
    }
    setLineItems(newItems)
  }

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const total = lineItems.reduce((sum, item) => {
    const product = products?.find(p => p.id === item.productId)
    if (!product) return sum
    const areaM2 = (product.heightMm / 1000) * (product.widthMm / 1000) * (item.lengthMm / 1000)
    return sum + (areaM2 * item.unitPrice * item.quantity)
  }, 0)

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
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Positionen</label>
            <button onClick={addLineItem} className="text-sm text-primary-600 hover:text-primary-700" disabled={isSubmitting}>+ Position</button>
          </div>
          {lineItems.map((item, index) => (
            <div key={index} className="flex items-center gap-2 mb-2 p-2 bg-gray-50 rounded">
              <select value={item.productId} onChange={(e) => updateLineItem(index, 'productId', e.target.value)} className="input flex-1 text-sm" disabled={isSubmitting}>
                <option value="">Produkt...</option>
                {products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" placeholder="Länge" value={item.lengthMm} onChange={(e) => updateLineItem(index, 'lengthMm', Number(e.target.value))} className="input w-24 text-sm" disabled={isSubmitting} />
              <input type="number" placeholder="Anzahl" value={item.quantity} onChange={(e) => updateLineItem(index, 'quantity', Number(e.target.value))} className="input w-20 text-sm" disabled={isSubmitting} />
              <input type="number" step="0.01" placeholder="€/m²" value={item.unitPrice} onChange={(e) => updateLineItem(index, 'unitPrice', Number(e.target.value))} className="input w-24 text-sm" disabled={isSubmitting} />
              <button onClick={() => removeLineItem(index)} className="p-1 text-red-500 hover:bg-red-50 rounded" disabled={isSubmitting}>×</button>
            </div>
          ))}
        </div>

        <div className="text-right font-bold text-lg">Gesamt: {formatCurrency(total)}</div>
      </div>
    </Modal>
  )
}