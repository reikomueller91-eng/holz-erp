import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Eye, Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { formatDate, formatCurrency } from '../lib/utils'
import { PageHeader, SearchInput, LoadingState, EmptyState, StatusBadge, Modal } from '../components/ui'
import { toast } from '../stores/toastStore'
import type { Offer, Customer, Product } from '../types'

export default function Offers() {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const { data: offers, isLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: async () => {
      const { data } = await api.get<Offer[]>('/offers')
      return data
    },
  })

  const filteredOffers = offers?.filter(o => 
    o.customerName?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Angebote"
        action={
          <button 
            onClick={() => setShowModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Neues Angebot
          </button>
        }
      />

      <SearchInput 
        value={search}
        onChange={setSearch}
        placeholder="Angebote suchen..."
      />

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : filteredOffers?.length === 0 ? (
          <EmptyState 
            message="Noch keine Angebote vorhanden"
            searchActive={!!search}
          />
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gültig bis</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Betrag</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOffers?.map((offer) => (
                <tr key={offer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {offer.customerName || 'Unbekannt'}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {formatDate(offer.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {offer.validUntil ? formatDate(offer.validUntil) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge type="offer" status={offer.status} />
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900">
                    {formatCurrency(offer.totalAmount)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/offers/${offer.id}`}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      {offer.pdfPath && (
                        <a
                          href={`/api/offers/${offer.id}/pdf`}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </div>
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
  const [lineItems, setLineItems] = useState<any[]>([])

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await api.get<Customer[]>('/customers')
      return data
    },
  })

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await api.get<Product[]>('/products')
      return data
    },
  })

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post('/offers', {
        customerId: selectedCustomer,
        validUntil: validUntil || undefined,
        lineItems: lineItems.map(item => ({
          productId: item.productId,
          lengthMm: item.lengthMm,
          quantityPieces: item.quantity,
          unitPricePerM2: item.unitPrice,
          notes: item.notes,
        })),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] })
      toast.success('Angebot wurde erstellt')
      onClose()
    },
    onError: () => {
      toast.error('Fehler beim Erstellen des Angebots')
    },
  })

  const addLineItem = () => {
    setLineItems([...lineItems, { productId: '', lengthMm: 0, quantity: 1, unitPrice: 0, notes: '' }])
  }

  const updateLineItem = (index: number, field: string, value: any) => {
    const newItems = [...lineItems]
    newItems[index][field] = value
    if (field === 'productId') {
      const product = products?.find(p => p.id === value)
      if (product) {
        newItems[index].unitPrice = product.currentPricePerM2
      }
    }
    setLineItems(newItems)
  }

  const total = lineItems.reduce((sum, item) => {
    const product = products?.find(p => p.id === item.productId)
    if (!product) return sum
    const areaM2 = (product.heightMm / 1000) * (product.widthMm / 1000) * (item.lengthMm / 1000)
    return sum + (areaM2 * item.unitPrice * item.quantity)
  }, 0)

  return (
    <Modal
      title="Neues Angebot"
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Abbrechen</button>
          <button 
            onClick={() => mutation.mutate()}
            disabled={!selectedCustomer || lineItems.length === 0 || mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending ? 'Erstellen...' : 'Angebot erstellen'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kunde *</label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="input"
            >
              <option value="">Bitte wählen...</option>
              {customers?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gültig bis</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-700">Positionen</label>
            <button onClick={addLineItem} className="text-sm text-primary-600 hover:text-primary-700">
              + Position hinzufügen
            </button>
          </div>
          <div className="space-y-3">
            {lineItems.map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <select
                  value={item.productId}
                  onChange={(e) => updateLineItem(index, 'productId', e.target.value)}
                  className="input flex-1"
                >
                  <option value="">Produkt wählen...</option>
                  {products?.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Länge (mm)"
                  value={item.lengthMm || ''}
                  onChange={(e) => updateLineItem(index, 'lengthMm', Number(e.target.value))}
                  className="input w-28"
                />
                <input
                  type="number"
                  placeholder="Anzahl"
                  value={item.quantity}
                  onChange={(e) => updateLineItem(index, 'quantity', Number(e.target.value))}
                  className="input w-24"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="€/m²"
                  value={item.unitPrice}
                  onChange={(e) => updateLineItem(index, 'unitPrice', Number(e.target.value))}
                  className="input w-28"
                />
                <button
                  onClick={() => setLineItems(lineItems.filter((_, i) => i !== index))}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  ×
                </button>
              </div>
            ))}
            {lineItems.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                Klicken Sie auf "Position hinzufügen" um Produkte hinzuzufügen
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <span className="text-gray-600">Gesamtbetrag:</span>
          <span className="text-2xl font-bold text-gray-900">{formatCurrency(total)}</span>
        </div>
      </div>
    </Modal>
  )
}
