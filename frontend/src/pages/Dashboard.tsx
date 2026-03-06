import { useQuery } from '@tanstack/react-query'
import { 
  Users, Package, FileText, ClipboardList, 
  Receipt, Factory, Euro 
} from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import type { DashboardStats } from '../types'

const statCards = [
  { key: 'totalCustomers', label: 'Kunden', icon: Users, color: 'bg-blue-500', link: '/customers' },
  { key: 'totalProducts', label: 'Produkte', icon: Package, color: 'bg-green-500', link: '/products' },
  { key: 'openOffers', label: 'Offene Angebote', icon: FileText, color: 'bg-yellow-500', link: '/offers' },
  { key: 'pendingOrders', label: 'Aufträge in Arbeit', icon: ClipboardList, color: 'bg-purple-500', link: '/orders' },
  { key: 'unpaidInvoices', label: 'Unbezahlte Rechnungen', icon: Receipt, color: 'bg-red-500', link: '/invoices' },
  { key: 'monthlyRevenue', label: 'Monatsumsatz', icon: Euro, color: 'bg-emerald-500', link: '/reports', format: 'currency' },
]

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { data } = await api.get<DashboardStats>('/dashboard/stats')
      return data
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link 
          to="/production" 
          className="btn-primary flex items-center gap-2"
        >
          <Factory className="w-4 h-4" />
          Produktions-Modus
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => {
          const value = stats?.[card.key as keyof DashboardStats]
          return (
            <Link
              key={card.key}
              to={card.link}
              className="card p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center">
                <div className={`${card.color} p-3 rounded-lg`}>
                  <card.icon className="w-6 h-6 text-white" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {isLoading ? (
                      <span className="text-gray-300">-</span>
                    ) : card.format === 'currency' ? (
                      `€${Number(value).toLocaleString('de-DE', { minimumFractionDigits: 2 })}`
                    ) : (
                      String(value ?? 0)
                    )}
                  </p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="card">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Neueste Aufträge</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {isLoading ? (
              <div className="p-6 text-center text-gray-500">Laden...</div>
            ) : stats?.recentOrders?.length === 0 ? (
              <div className="p-6 text-center text-gray-500">Keine Aufträge vorhanden</div>
            ) : (
              stats?.recentOrders?.slice(0, 5).map((order) => (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900">{order.customerName || 'Unbekannt'}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <span className={`
                    px-2 py-1 text-xs font-medium rounded-full
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
                </Link>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-200">
            <Link to="/orders" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              Alle Aufträge anzeigen →
            </Link>
          </div>
        </div>

        {/* Production Queue */}
        <div className="card">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Produktions-Queue</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {isLoading ? (
              <div className="p-6 text-center text-gray-500">Laden...</div>
            ) : stats?.productionQueue?.length === 0 ? (
              <div className="p-6 text-center text-gray-500">Keine Produktionsjobs vorhanden</div>
            ) : (
              stats?.productionQueue?.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-gray-900">{job.productName}</p>
                    <span className={`
                      px-2 py-1 text-xs font-medium rounded-full
                      ${job.status === 'queued' ? 'bg-gray-100 text-gray-800' : ''}
                      ${job.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : ''}
                      ${job.status === 'done' ? 'bg-green-100 text-green-800' : ''}
                    `}>
                      {job.status === 'queued' && 'Wartend'}
                      {job.status === 'in_progress' && 'In Arbeit'}
                      {job.status === 'done' && 'Fertig'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-primary-600 h-2 rounded-full transition-all"
                      style={{ width: `${(job.producedQuantity / job.targetQuantity) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {job.producedQuantity} / {job.targetQuantity} Stück
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-200">
            <Link to="/production" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              Produktions-Modus öffnen →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}