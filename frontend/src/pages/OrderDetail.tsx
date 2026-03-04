import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Factory, FileText } from 'lucide-react'
import api from '../lib/api'
import type { Order, Invoice } from '../types'

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: orderData } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data } = await api.get<{ order: Order; customer?: { name: string } }>(`/orders/${id}`)
      return data
    },
  })

  const order = orderData?.order
  const customerName = orderData?.customer?.name ?? order?.customerName ?? 'Unbekannt'

  const { data: invoice } = useQuery({
    queryKey: ['order-invoice', id],
    queryFn: async () => {
      try {
        const { data } = await api.get<Invoice>(`/orders/${id}/invoice`)
        return data
      } catch {
        return null
      }
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => api.post(`/orders/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', id] }),
  })

  const createInvoiceMutation = useMutation({
    mutationFn: () => api.post(`/orders/${id}/invoice`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order-invoice', id] }),
  })

  if (!order) return <div className="p-8 text-center">Laden...</div>

  const items = order.items ?? []
  const totalTarget = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalProduced = items.reduce((sum, item) => sum + item.quantityProduced, 0)
  const productionProgress = totalTarget > 0 ? (totalProduced / totalTarget) * 100 : 0
  const isFinished = order.status === 'finished'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/orders" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Auftrag {order.orderNumber ?? `#${order.id.slice(0, 8)}`}</h1>
          <p className="text-gray-500">{customerName}</p>
        </div>
        <div className="flex items-center gap-2">
          {!invoice && order.status !== 'cancelled' && isFinished && (
            <button
              onClick={() => createInvoiceMutation.mutate()}
              disabled={createInvoiceMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Rechnung erstellen
            </button>
          )}
          {order.pdfPath && (
            <a
              href={`/api/orders/${order.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Auftrags-PDF
            </a>
          )}
          {invoice && (
            <Link
              to={`/invoices/${invoice.id}`}
              className="btn-secondary flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Rechnung anzeigen
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Production Jobs */}
          <div className="card">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Factory className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-semibold">Produktionsstatus</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {items.filter(i => i.productionStatus === 'completed').length} / {items.length} komplett
                </span>
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all"
                    style={{ width: `${productionProgress}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {items.length === 0 ? (
                <div className="p-6 text-center text-gray-500">Keine Positionen gefunden</div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {item.heightMm}x{item.widthMm}mm × {(item.lengthMm / 1000).toFixed(3)} (Qualität: {item.quality})
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`
                        px-2 py-1 text-xs font-medium rounded-full
                        ${item.productionStatus === 'not_started' ? 'bg-gray-100 text-gray-800' : ''}
                        ${item.productionStatus === 'in_progress' ? 'bg-blue-100 text-blue-800' : ''}
                        ${item.productionStatus === 'completed' ? 'bg-green-100 text-green-800' : ''}
                      `}>
                        {item.productionStatus === 'not_started' && 'Wartend'}
                        {item.productionStatus === 'in_progress' && 'In Arbeit'}
                        {item.productionStatus === 'completed' && 'Fertig'}
                      </span>
                      <div className="text-sm font-medium">
                        {item.quantityProduced} / {item.quantity}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Details</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <select
                  value={order.status}
                  onChange={(e) => updateStatusMutation.mutate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border-gray-300 text-sm"
                >
                  <option value="new">Neu</option>
                  <option value="pending">Ausstehend</option>
                  <option value="in_production">In Produktion</option>
                  <option value="ready">Bereit (Alt)</option>
                  <option value="finished">Bereit</option>
                  <option value="delivered">Geliefert</option>
                  <option value="cancelled">Storniert</option>
                </select>
              </div>
              <div>
                <p className="text-sm text-gray-500">Gesamtbetrag</p>
                <p className="text-xl font-bold text-gray-900">€{(order.grossSum ?? order.totalAmount ?? 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Erstellt am</p>
                <p className="font-medium text-gray-900">
                  {new Date(order.createdAt).toLocaleDateString('de-DE')}
                </p>
              </div>
            </div>
          </div>

          {invoice && (
            <div className="card p-6 bg-green-50 border-green-200">
              <div className="flex items-center gap-3 mb-3">
                <FileText className="w-6 h-6 text-green-600" />
                <h2 className="text-lg font-semibold text-green-900">Rechnung vorhanden</h2>
              </div>
              <p className="text-green-700 text-sm mb-4">
                Status: {invoice.status === 'paid' ? 'Bezahlt' : invoice.status === 'sent' ? 'Gesendet' : 'Entwurf'}
              </p>
              <Link
                to={`/invoices/${invoice.id}`}
                className="text-green-700 hover:text-green-800 font-medium text-sm"
              >
                Zur Rechnung →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

