import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileText, ClipboardList, Mail, Phone, MapPin, Edit, Save, X } from 'lucide-react'
import api from '../lib/api'
import type { Customer, Offer, Order } from '../types'

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    source: 'direct' as Customer['source'],
    rating: null as number | null,
  })

  const { data: customer } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const { data } = await api.get<Customer>(`/customers/${id}`)
      return data
    },
  })

  const { data: offers } = useQuery({
    queryKey: ['customer-offers', id],
    queryFn: async () => {
      const { data } = await api.get<Offer[]>(`/customers/${id}/offers`)
      return data
    },
  })

  const { data: orders } = useQuery({
    queryKey: ['customer-orders', id],
    queryFn: async () => {
      const { data } = await api.get<Order[]>(`/customers/${id}/orders`)
      return data
    },
  })

  const updateMutation = useMutation({
    mutationFn: (body: Partial<Customer>) => api.put(`/customers/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] })
      setIsEditing(false)
    },
  })

  const startEditing = () => {
    if (customer) {
      setEditForm({
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        notes: customer.notes || '',
        source: customer.source || 'direct',
        rating: customer.rating ?? null,
      })
      setIsEditing(true)
    }
  }

  const handleSave = () => {
    updateMutation.mutate({
      name: editForm.name,
      email: editForm.email || undefined,
      phone: editForm.phone || undefined,
      address: editForm.address || undefined,
      notes: editForm.notes || undefined,
      source: editForm.source,
      rating: editForm.rating,
    })
  }

  if (!customer) return <div className="p-8 text-center">Laden...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/customers" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex-1">{customer.name}</h1>
        {!isEditing ? (
          <button onClick={startEditing} className="btn-secondary flex items-center gap-2">
            <Edit className="w-4 h-4" />
            Bearbeiten
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {updateMutation.isPending ? 'Speichern...' : 'Speichern'}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="btn-secondary flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Abbrechen
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Info */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Kontakt</h2>
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="input w-full"
                  placeholder="email@beispiel.de"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="input w-full"
                  placeholder="+49..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="input w-full"
                  placeholder="Straße, PLZ Ort"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quelle</label>
                <select
                  value={editForm.source}
                  onChange={(e) => setEditForm({ ...editForm, source: e.target.value as Customer['source'] })}
                  className="input w-full"
                >
                  <option value="direct">Direkt</option>
                  <option value="kleinanzeigen">Kleinanzeigen</option>
                  <option value="referral">Empfehlung</option>
                  <option value="other">Sonstige</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bewertung</label>
                <select
                  value={editForm.rating ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, rating: e.target.value ? Number(e.target.value) : null })}
                  className="input w-full"
                >
                  <option value="">Keine Bewertung</option>
                  <option value="1">⭐</option>
                  <option value="2">⭐⭐</option>
                  <option value="3">⭐⭐⭐</option>
                  <option value="4">⭐⭐⭐⭐</option>
                  <option value="5">⭐⭐⭐⭐⭐</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="input w-full"
                  rows={3}
                  placeholder="Notizen..."
                />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {customer.email && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <Mail className="w-5 h-5" />
                    <a href={`mailto:${customer.email}`} className="hover:text-primary-600">
                      {customer.email}
                    </a>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <Phone className="w-5 h-5" />
                    <a href={`tel:${customer.phone}`} className="hover:text-primary-600">
                      {customer.phone}
                    </a>
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <MapPin className="w-5 h-5" />
                    <span>{customer.address}</span>
                  </div>
                )}
                {customer.rating && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <span>Bewertung: {'⭐'.repeat(customer.rating)}</span>
                  </div>
                )}
                {customer.source && (
                  <div className="text-sm text-gray-500">
                    Quelle: {customer.source === 'direct' ? 'Direkt' : customer.source === 'kleinanzeigen' ? 'Kleinanzeigen' : customer.source === 'referral' ? 'Empfehlung' : 'Sonstige'}
                  </div>
                )}
              </div>
              {customer.notes && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Notizen</h3>
                  <p className="text-gray-600 text-sm">{customer.notes}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Offers */}
        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Angebote
            </h2>
            <Link to="/offers" className="text-sm text-primary-600 hover:text-primary-700">
              Neues Angebot
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {offers?.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">Keine Angebote</div>
            ) : (
              offers?.map((offer) => (
                <Link
                  key={offer.id}
                  to={`/offers/${offer.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {new Date(offer.createdAt).toLocaleDateString('de-DE')}
                    </p>
                    <p className="text-sm text-gray-500">{(offer.lineItems || offer.items || []).length} Positionen</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      €{(offer.totalAmount ?? offer.grossSum ?? 0).toFixed(2)}
                    </p>
                    <span className={`
                      text-xs px-2 py-0.5 rounded-full
                      ${offer.status === 'draft' ? 'bg-gray-100 text-gray-800' : ''}
                      ${offer.status === 'sent' ? 'bg-blue-100 text-blue-800' : ''}
                      ${offer.status === 'accepted' ? 'bg-green-100 text-green-800' : ''}
                    `}>
                      {offer.status}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Orders */}
        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              Aufträge
            </h2>
          </div>
          <div className="divide-y divide-gray-200">
            {orders?.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">Keine Aufträge</div>
            ) : (
              orders?.map((order) => (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {new Date(order.createdAt).toLocaleDateString('de-DE')}
                    </p>
                    <p className="text-sm text-gray-500">
                      {(order.productionJobs || []).length} Produktionsjobs
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      €{(order.grossSum ?? order.totalAmount ?? 0).toFixed(2)}
                    </p>
                    <span className={`
                      text-xs px-2 py-0.5 rounded-full
                      ${order.status === 'new' ? 'bg-yellow-100 text-yellow-800' : ''}
                      ${order.status === 'in_production' ? 'bg-blue-100 text-blue-800' : ''}
                      ${order.status === 'finished' ? 'bg-green-100 text-green-800' : ''}
                      ${order.status === 'picked_up' ? 'bg-teal-100 text-teal-800' : ''}
                      ${order.status === 'cancelled' ? 'bg-red-100 text-red-800' : ''}
                    `}>
                      {order.status === 'new' && 'Neu'}
                      {order.status === 'in_production' && 'In Produktion'}
                      {order.status === 'finished' && 'Fertiggestellt'}
                      {order.status === 'picked_up' && 'Abgeholt'}
                      {order.status === 'cancelled' && 'Storniert'}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}