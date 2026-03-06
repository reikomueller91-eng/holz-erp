import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Eye, Factory, FileText } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { formatDate, formatCurrency } from '../lib/utils'
import { PageHeader, SearchInput, LoadingState, EmptyState, StatusBadge } from '../components/ui'
import type { Order } from '../types'

export default function Orders() {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'desiredCompletion'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const navigate = useNavigate()

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data } = await api.get<{ orders: Order[] }>('/orders')
      return data.orders ?? []
    },
  })

  const filteredOrders = orders?.filter(o => {
    const q = search.toLowerCase()
    return (
      (o.orderNumber?.toLowerCase().includes(q)) ||
      (o.customerName?.toLowerCase().includes(q)) ||
      !search
    )
  }).sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortBy === 'desiredCompletion') {
      const aDate = a.desiredCompletionDate || ''
      const bDate = b.desiredCompletionDate || ''
      if (!aDate && !bDate) return 0
      if (!aDate) return 1
      if (!bDate) return -1
      return aDate.localeCompare(bDate) * dir
    }
    return (a.createdAt || '').localeCompare(b.createdAt || '') * dir
  })

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

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="flex-1 w-full">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Aufträge suchen..."
          />
        </div>
        <select
          value={`${sortBy}-${sortDir}`}
          onChange={(e) => {
            const [field, dir] = e.target.value.split('-') as ['date' | 'desiredCompletion', 'asc' | 'desc']
            setSortBy(field)
            setSortDir(dir)
          }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
        >
          <option value="date-desc">Datum ↓</option>
          <option value="date-asc">Datum ↑</option>
          <option value="desiredCompletion-asc">Wunschdatum ↑</option>
          <option value="desiredCompletion-desc">Wunschdatum ↓</option>
        </select>
      </div>

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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Auftragsnr.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Wunschdatum</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produktion</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Betrag</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOrders?.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/orders/${order.id}`)}>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {order.orderNumber || '—'}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {order.customerName || 'Unbekannt'}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {formatDate(order.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {order.desiredCompletionDate
                      ? new Date(order.desiredCompletionDate).toLocaleDateString('de-DE')
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge type="order" status={order.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Factory className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {order.items?.filter(i => i.productionStatus === 'completed').length ?? 0} / {order.items?.length ?? 0} fertig
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900">
                    {formatCurrency(order.grossSum ?? order.totalAmount ?? 0)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {order.status === 'finished' && (
                        <Link
                          to={`/orders/${order.id}`}
                          className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg inline-flex"
                          title="Rechnung erstellen / anzeigen"
                        >
                          <FileText className="w-4 h-4" />
                        </Link>
                      )}
                      <Link
                        to={`/orders/${order.id}`}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg inline-flex"
                        title="Details anzeigen"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    </div>
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
