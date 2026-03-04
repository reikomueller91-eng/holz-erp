import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileText, ClipboardList, Mail, Phone, MapPin } from 'lucide-react'
import api from '../lib/api'
import type { Customer, Offer, Order } from '../types'

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()

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

  if (!customer) return <div className="p-8 text-center">Laden...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/customers" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Info */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Kontakt</h2>
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
          </div>
          {customer.notes && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Notizen</h3>
              <p className="text-gray-600 text-sm">{customer.notes}</p>
            </div>
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
                    <p className="text-sm text-gray-500">{offer.lineItems.length} Positionen</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      €{offer.totalAmount.toFixed(2)}
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
                      {(order.productionJobs ?? []).length} Produktionsjobs
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      €{(order.grossSum ?? order.totalAmount ?? 0).toFixed(2)}
                    </p>
                    <span className={`
                      text-xs px-2 py-0.5 rounded-full
                      ${order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                      ${order.status === 'in_production' ? 'bg-blue-100 text-blue-800' : ''}
                      ${order.status === 'delivered' ? 'bg-green-100 text-green-800' : ''}
                    `}>
                      {order.status}
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