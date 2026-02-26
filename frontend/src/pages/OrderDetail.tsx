import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Factory, FileText } from 'lucide-react'
import api from '../lib/api'
import type { Order, ProductionJob, Invoice } from '../types'

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: order } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data } = await api.get<Order>(`/orders/${id}`)
      return data
    },
  })

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
    mutationFn: (status: string) => api.patch(`/orders/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', id] }),
  })

  const createInvoiceMutation = useMutation({
    mutationFn: () => api.post(`/orders/${id}/invoice`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order-invoice', id] }),
  })

  if (!order) return <div className="p-8 text-center">Laden...</div>

  const productionProgress = order.productionJobs.length > 0
    ? (order.productionJobs.filter(j => j.status === 'done').length / order.productionJobs.length) * 100
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/orders" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Auftrag #{order.id.slice(0, 8)}</h1>
          <p className="text-gray-500">{order.customerName}</p>
        </div>
        <div className="flex items-center gap-2">
          {!invoice && order.status !== 'cancelled' && (
            <button
              onClick={() => createInvoiceMutation.mutate()}
              disabled={createInvoiceMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Rechnung erstellen
            </button>
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
                <h2 className="text-lg font-semibold">Produktionsjobs</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {order.productionJobs.filter(j => j.status === 'done').length} / {order.productionJobs.length} fertig
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
              {order.productionJobs.map((job) => (
                <ProductionJobItem key={job.id} job={job} orderId={order.id} />
              ))}
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
                  <option value="pending">Ausstehend</option>
                  <option value="in_production">In Produktion</option>
                  <option value="ready">Bereit</option>
                  <option value="delivered">Geliefert</option>
                  <option value="cancelled">Storniert</option>
                </select>
              </div>
              <div>
                <p className="text-sm text-gray-500">Gesamtbetrag</p>
                <p className="text-xl font-bold text-gray-900">€{order.totalAmount.toFixed(2)}</p>
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

function ProductionJobItem({ job, orderId }: { job: ProductionJob; orderId: string }) {
  const queryClient = useQueryClient()
  
  const updateMutation = useMutation({
    mutationFn: (data: { producedQuantity?: number; status?: string }) => 
      api.patch(`/production/${job.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] })
    },
  })

  const progress = (job.producedQuantity / job.targetQuantity) * 100

  return (
    <div className="p-4 hover:bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-medium text-gray-900">{job.productName}</p>
          <p className="text-sm text-gray-500">Ziel: {job.targetQuantity} Stück</p>
        </div>
        <div className="flex items-center gap-2">
          {job.status === 'queued' && (
            <button
              onClick={() => updateMutation.mutate({ status: 'in_progress' })}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Starten
            </button>
          )}
          {job.status === 'in_progress' && (
            <button
              onClick={() => updateMutation.mutate({ status: 'done', producedQuantity: job.targetQuantity })}
              className="text-sm text-green-600 hover:text-green-700 font-medium"
            >
              Abschließen
            </button>
          )}
          <span className={`
            px-2 py-1 text-xs font-medium rounded-full
            ${job.status === 'queued' ? 'bg-gray-100 text-gray-800' : ''}
            ${job.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : ''}
            ${job.status === 'done' ? 'bg-green-100 text-green-800' : ''}
            ${job.status === 'issue' ? 'bg-red-100 text-red-800' : ''}
          `}>
            {job.status === 'queued' && 'Wartend'}
            {job.status === 'in_progress' && 'In Arbeit'}
            {job.status === 'done' && 'Fertig'}
            {job.status === 'issue' && 'Problem'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-1 bg-gray-200 rounded-full h-2">
          <div 
            className="bg-primary-600 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={job.producedQuantity}
            onChange={(e) => updateMutation.mutate({ producedQuantity: Number(e.target.value) })}
            className="w-20 text-right text-sm border rounded px-2 py-1"
            min={0}
            max={job.targetQuantity}
          />
          <span className="text-sm text-gray-500">/ {job.targetQuantity}</span>
        </div>
      </div>
    </div>
  )
}