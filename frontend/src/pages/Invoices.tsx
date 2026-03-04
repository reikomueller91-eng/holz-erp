import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, Download, CheckCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { formatDate, formatCurrency } from '../lib/utils'
import { PageHeader, SearchInput, LoadingState, EmptyState, StatusBadge } from '../components/ui'
import { toast } from '../stores/toastStore'
import type { Invoice } from '../types'

export default function Invoices() {
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data } = await api.get<Invoice[]>('/invoices')
      return data
    },
  })

  const filteredInvoices = invoices?.filter(i =>
    i.customerName?.toLowerCase().includes(search.toLowerCase())
  )

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
      <PageHeader title="Rechnungen" />

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
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">
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
    </div>
  )
}
