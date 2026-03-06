import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, Download, CheckCircle, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { formatDate, formatCurrency } from '../lib/utils'
import { PageHeader, SearchInput, LoadingState, EmptyState, StatusBadge, Modal } from '../components/ui'
import { toast } from '../stores/toastStore'
import type { Invoice, Customer, Product } from '../types'

export default function Invoices() {
  const [search, setSearch] = useState('')
  const [showDirectModal, setShowDirectModal] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data } = await api.get<{ invoices: Invoice[] }>('/invoices')
      return data.invoices ?? []
    },
  })

  const filteredInvoices = invoices?.filter(i => {
    if (!search) return true
    const q = search.toLowerCase()
    return i.customerName?.toLowerCase().includes(q)
  })

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => api.post(`/invoices/${id}/mark-paid`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Rechnung als bezahlt markiert')
    },
    onError: () => {
      toast.error('Fehler beim Aktualisieren')
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Rechnungen" />
        <button
          onClick={() => setShowDirectModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Direktrechnung
        </button>
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Rechnungen suchen..."
      />

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : filteredInvoices?.length === 0 ? (
          <EmptyState
            message="Noch keine Rechnungen vorhanden"
            searchActive={!!search}
          />
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rechnung #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fällig</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Betrag</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredInvoices?.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                >
                  <td className="px-6 py-4 font-medium text-primary-600 hover:text-primary-800">
                    {invoice.invoiceNumber || '-'}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {invoice.customerName || 'Unbekannt'}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {formatDate(invoice.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {invoice.dueDate ? formatDate(invoice.dueDate) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge type="invoice" status={invoice.status} />
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900">
                    {formatCurrency(invoice.totalGross)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {invoice.status === 'sent' && (
                        <button
                          onClick={() => markPaidMutation.mutate(invoice.id)}
                          disabled={markPaidMutation.isPending}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                          title="Als bezahlt markieren"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <Link to={`/invoices/${invoice.id}`} className="p-2 text-gray-400 hover:text-primary-600 inline-block" title="Ansehen">
                        <Eye className="w-4 h-4" />
                      </Link>
                      {invoice.pdfPath && (
                        <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-400 hover:text-primary-600 inline-block" title="PDF ansehen">
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

      {showDirectModal && (
        <DirectInvoiceModal
          onClose={() => setShowDirectModal(false)}
          onCreated={(invoiceId) => {
            setShowDirectModal(false)
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
            navigate(`/invoices/${invoiceId}`)
          }}
        />
      )}
    </div>
  )
}

function DirectInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [lineItems, setLineItems] = useState<Array<{ description: string; quantity: number; unit: string; unitPrice: number; productId?: string }>>([])
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

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unit: 'Stk', unitPrice: 0 }])
  }

  const addProductLineItem = (productId: string) => {
    const product = products?.find(p => p.id === productId)
    if (!product) return
    setLineItems([...lineItems, {
      description: `${product.name} (${product.woodType}, ${product.qualityGrade})`,
      quantity: 1,
      unit: product.calcMethod === 'volume_divided' ? 'Lfm' : 'm²',
      unitPrice: product.currentPricePerM2,
      productId: product.id,
    }])
  }

  const updateLineItem = (index: number, field: string, value: string | number) => {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
  }

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const totalNet = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const vatPercent = settings?.vatPercent ?? 19
  const totalGross = totalNet * (1 + vatPercent / 100)

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
      const customer = customers?.find(c => c.id === selectedCustomer)
      const sellerAddress = settings?.sellerAddress || 'HolzERP Musterfirma'
      let customerAddress = customer?.name || 'Unbekannt'
      if (customer?.address) customerAddress += '\n' + customer.address

      const { data } = await api.post<{ invoice: Invoice }>('/invoices', {
        customerId: selectedCustomer,
        sellerAddress,
        customerAddress,
        items: lineItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          productId: item.productId || undefined,
        })),
        dueDate: dueDate || undefined,
        vatPercent,
      })
      toast.success('Direktrechnung erstellt')
      onCreated(data.invoice.id)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Fehler beim Erstellen')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="Direktrechnung erstellen" onClose={onClose} size="xl" footer={
      <>
        <button onClick={onClose} className="btn-secondary" disabled={isSubmitting}>Abbrechen</button>
        <button onClick={handleSubmit} disabled={!selectedCustomer || lineItems.length === 0 || isSubmitting} className="btn-primary">
          {isSubmitting ? 'Erstellen...' : 'Rechnung erstellen'}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Fällig am</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" disabled={isSubmitting} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Positionen *</label>
            <div className="flex items-center gap-3">
              {products && products.length > 0 && (
                <select
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                  value=""
                  onChange={(e) => { if (e.target.value) addProductLineItem(e.target.value) }}
                >
                  <option value="">Aus Produkt...</option>
                  {products.filter(p => p.isActive).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} – €{p.currentPricePerM2.toFixed(2)}/{p.calcMethod === 'volume_divided' ? 'Lfm' : 'm²'}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" onClick={addLineItem} className="text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Freitext-Position
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {lineItems.map((item, index) => (
              <div key={index} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Beschreibung"
                    value={item.description}
                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                    className="input w-full text-sm mb-1"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Menge"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="input w-20 text-sm"
                      min={1}
                    />
                    <input
                      type="text"
                      placeholder="Einheit"
                      value={item.unit}
                      onChange={(e) => updateLineItem(index, 'unit', e.target.value)}
                      className="input w-16 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Preis"
                      value={item.unitPrice}
                      onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="input w-24 text-sm"
                      min={0}
                      step="0.01"
                    />
                    <span className="text-sm font-medium text-gray-700 self-center min-w-[80px] text-right">
                      €{(item.quantity * item.unitPrice).toFixed(2)}
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => removeLineItem(index)} className="p-1 text-red-400 hover:text-red-600 mt-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          {lineItems.length > 0 && (
            <div className="text-right mt-3 space-y-1">
              <p className="text-sm text-gray-600">Netto: {formatCurrency(totalNet)}</p>
              <p className="text-sm text-gray-600">MwSt ({vatPercent}%): {formatCurrency(totalGross - totalNet)}</p>
              <p className="text-base font-bold text-gray-900">Brutto: {formatCurrency(totalGross)}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}