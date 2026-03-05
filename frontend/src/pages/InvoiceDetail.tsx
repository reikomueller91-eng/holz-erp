import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Send, CheckCircle, FileText } from 'lucide-react'
import api from '../lib/api'
import type { Invoice } from '../types'

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const res = await api.get<{ invoice: Invoice; customer: any; versions: any[] }>(`/invoices/${id}`)
      return res.data
    },
  })

  const invoice = data?.invoice
  const customer = data?.customer

  const emailMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/email`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      alert('E-Mail erfolgreich versendet')
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Fehler beim Versenden der E-Mail')
    }
  })

  // We no longer have a "send" mutation to change status, "send" means email now in terminology.
  // Actually, we should keep the status change or combine it.
  const markSentMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/status`, { status: 'sent' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
  })

  const markPaidMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/mark-paid`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/finalize`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
  })

  const generatePdfMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/pdf`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
  })

  if (!invoice) return <div className="p-8 text-center">Laden...</div>

  // Verify whether customer has email
  const hasEmail = Boolean(customer?.contactInfo?.email)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/invoices" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Rechnung {invoice.invoiceNumber || `#${invoice.id.slice(0, 8)}`}</h1>
          <p className="text-gray-500">Version {invoice.version}</p>
        </div>
        <div className="flex items-center gap-2">
          {invoice.status === 'draft' && (
            <>
              <button
                onClick={() => generatePdfMutation.mutate()}
                disabled={generatePdfMutation.isPending}
                className="btn-secondary flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                PDF generieren
              </button>
              <button
                onClick={() => finalizeMutation.mutate()}
                disabled={finalizeMutation.isPending}
                className="btn-primary flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Finalisieren
              </button>
            </>
          )}
          {invoice.pdfPath && (
            <button
              onClick={() => {
                emailMutation.mutate();
                if (invoice.status === 'draft') {
                  markSentMutation.mutate();
                }
              }}
              disabled={emailMutation.isPending || !hasEmail}
              className={`btn-primary flex items-center gap-2 ${!hasEmail ? 'opacity-50 cursor-not-allowed bg-gray-400 hover:bg-gray-400' : ''}`}
              title={!hasEmail ? "Kunde hat keine E-Mail Adresse hinterlegt" : "Rechnung per E-Mail senden"}
            >
              <Send className="w-4 h-4" />
              {emailMutation.isPending ? 'Wird gesendet...' : 'Per E-Mail senden'}
            </button>
          )}
          {invoice.status === 'draft' && invoice.pdfPath && (
            <button
              onClick={() => markSentMutation.mutate()}
              disabled={markSentMutation.isPending}
              className="btn-secondary flex items-center gap-2"
            >
              Als gesendet markieren
            </button>
          )}
          {invoice.status === 'sent' && (
            <button
              onClick={() => markPaidMutation.mutate()}
              disabled={markPaidMutation.isPending}
              className="btn-primary flex items-center gap-2 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="w-4 h-4" />
              Als bezahlt markieren
            </button>
          )}
          {invoice.pdfPath && (
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              PDF ansehen
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Rechnungspositionen</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Beschreibung</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Menge</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Einheit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Preis</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gesamt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoice.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 font-medium text-gray-900">{item.description}</td>
                    <td className="px-6 py-4 text-right text-gray-600">{item.quantity}</td>
                    <td className="px-6 py-4 text-right text-gray-600">{item.unit}</td>
                    <td className="px-6 py-4 text-right text-gray-600">€{item.unitPrice.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      €{item.totalPrice.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-6 py-3 text-right text-gray-600">Netto:</td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900">€{invoice.totalNet.toFixed(2)}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-6 py-3 text-right text-gray-600">MwSt ({(invoice.taxRate * 100).toFixed(0)}%):</td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900">
                    €{(invoice.totalGross - invoice.totalNet).toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-right font-bold text-gray-900">Brutto:</td>
                  <td className="px-6 py-4 text-right font-bold text-primary-600 text-lg">
                    €{invoice.totalGross.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Details</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Kunde</p>
                <p className="font-medium text-gray-900">{invoice.customerName || 'Unbekannt'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <span className={`
                  inline-flex px-2 py-1 text-xs font-medium rounded-full
                  ${invoice.status === 'draft' ? 'bg-gray-100 text-gray-800' : ''}
                  ${invoice.status === 'sent' ? 'bg-blue-100 text-blue-800' : ''}
                  ${invoice.status === 'paid' ? 'bg-green-100 text-green-800' : ''}
                  ${invoice.status === 'overdue' ? 'bg-red-100 text-red-800' : ''}
                `}>
                  {invoice.status === 'draft' && 'Entwurf'}
                  {invoice.status === 'sent' && 'Gesendet'}
                  {invoice.status === 'paid' && 'Bezahlt'}
                  {invoice.status === 'overdue' && 'Überfällig'}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Erstellt am</p>
                <p className="font-medium text-gray-900">
                  {new Date(invoice.createdAt).toLocaleDateString('de-DE')}
                </p>
              </div>
              {invoice.dueDate && (
                <div>
                  <p className="text-sm text-gray-500">Fällig am</p>
                  <p className="font-medium text-gray-900">
                    {new Date(invoice.dueDate).toLocaleDateString('de-DE')}
                  </p>
                </div>
              )}
              {invoice.paidAt && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-700">
                    Bezahlt am {new Date(invoice.paidAt).toLocaleDateString('de-DE')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}