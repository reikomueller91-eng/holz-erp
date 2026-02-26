import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Phone, Mail, MapPin, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { customerSourceLabels } from '../lib/utils'
import { PageHeader, SearchInput, LoadingState, EmptyState, Modal, ConfirmDialog } from '../components/ui'
import { toast } from '../stores/toastStore'
import type { Customer } from '../types'

export default function Customers() {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await api.get<Customer[]>('/customers')
      return data
    },
  })

  // SICHERSTELLEN dass wir ein Array haben
  const customers = Array.isArray(data) ? data : []

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Kunde wurde gelöscht')
      setDeleteTarget(null)
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Fehler beim Löschen'
      toast.error(message)
    },
  })

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Kunden"
        action={
          <button 
            onClick={() => { setEditingCustomer(null); setShowModal(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Neuer Kunde
          </button>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <div>
            <p className="font-medium text-red-800">Fehler beim Laden</p>
            <p className="text-sm text-red-600">
              {(error as any).response?.data?.message || 'Bitte entsperren Sie das System zuerst'}
            </p>
          </div>
        </div>
      )}

      {!Array.isArray(data) && !error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-700">
            Warnung: Ungültige Daten vom Server erhalten. Bitte Seite neu laden.
          </p>
        </div>
      )}

      <SearchInput 
        value={search}
        onChange={setSearch}
        placeholder="Kunden suchen..."
      />

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : filteredCustomers.length === 0 ? (
          <EmptyState 
            message="Noch keine Kunden vorhanden"
            searchActive={!!search}
          />
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredCustomers.map((customer) => (
              <div key={customer.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <Link to={`/customers/${customer.id}`} className="flex-1">
                    <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                    <div className="mt-2 space-y-1 text-sm text-gray-500">
                      {customer.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          {customer.email}
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          {customer.phone}
                        </div>
                      )}
                      {customer.address && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          {customer.address}
                        </div>
                      )}
                    </div>
                    <div className="mt-2">
                      <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600">
                        Quelle: {customerSourceLabels[customer.source] || customer.source}
                      </span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setEditingCustomer(customer); setShowModal(true); }}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(customer)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <CustomerModal customer={editingCustomer} onClose={() => setShowModal(false)} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Kunde löschen"
          message={`Möchten Sie den Kunden "${deleteTarget.name}" wirklich löschen?`}
          confirmLabel="Löschen"
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  )
}

function CustomerModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    name: customer?.name || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    address: customer?.address || '',
    notes: customer?.notes || '',
    source: customer?.source || 'direct',
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (customer) {
        await api.put(`/customers/${customer.id}`, formData)
      } else {
        await api.post('/customers', formData)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success(customer ? 'Kunde aktualisiert' : 'Kunde erstellt')
      onClose()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Fehler beim Speichern')
    },
  })

  return (
    <Modal
      title={customer ? 'Kunde bearbeiten' : 'Neuer Kunde'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={mutation.isPending}>Abbrechen</button>
          <button 
            onClick={() => mutation.mutate()}
            disabled={!formData.name || mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending ? 'Speichern...' : 'Speichern'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="input"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
          <textarea
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="input"
            rows={2}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quelle</label>
          <select
            value={formData.source}
            onChange={(e) => setFormData({ ...formData, source: e.target.value })}
            className="input"
          >
            <option value="direct">Direkt</option>
            <option value="kleinanzeigen">Kleinanzeigen</option>
            <option value="referral">Empfehlung</option>
            <option value="other">Sonstiges</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="input"
            rows={3}
          />
        </div>
      </div>
    </Modal>
  )
}