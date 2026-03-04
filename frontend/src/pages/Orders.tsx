import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Eye, Factory } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { formatDate, formatCurrency } from '../lib/utils'
import { PageHeader, SearchInput, LoadingState, EmptyState, StatusBadge } from '../components/ui'
import type { Order } from '../types'

export default function Orders() {
  const [search, setSearch] = useState('')

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data } = await api.get<{ orders: Order[] }>('/orders')
      return data.orders ?? []
    },
  })

  const filteredOrders = orders?.filter(o =>
    o.customerName?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aufträge"
        action={
          <Link to="/offers" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Aus Angebot erstellen
          </Link>
        }
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Aufträge suchen..."
      />

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : filteredOrders?.length === 0 ? (
          <EmptyState
            message="Noch keine Aufträge vorhanden"
            searchActive={!!search}
          />
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produktion</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Betrag</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOrders?.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {order.customerName || 'Unbekannt'}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {formatDate(order.createdAt)}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge type="order" status={order.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Factory className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {order.productionJobs.filter(j => j.status === 'done').length} / {order.productionJobs.length} fertig
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900">
                    {formatCurrency(order.totalAmount)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      to={`/orders/${order.id}`}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg inline-flex"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
