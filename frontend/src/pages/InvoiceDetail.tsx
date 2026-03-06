import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Send, CheckCircle, FileText, QrCode, Clock, Package, FileCheck, Mail, User, CreditCard, XCircle, AlertTriangle, Truck, Eye } from 'lucide-react'
import api from '../lib/api'
import type { Invoice } from '../types'

// Timeline helper functions
function getTimelineIcon(event: string, _entityType: string) {
  const size = 'w-3 h-3 text-white'
  switch (event) {
    case 'created': return <FileText className={size} />
    case 'sent': return <Send className={size} />
    case 'accepted': return <CheckCircle className={size} />
    case 'rejected': return <XCircle className={size} />
    case 'converted': return <FileCheck className={size} />
    case 'in_production': return <Package className={size} />
    case 'finished': return <CheckCircle className={size} />
    case 'invoiced': return <CreditCard className={size} />
    case 'paid': return <CreditCard className={size} />
    case 'cancelled': return <XCircle className={size} />
    case 'overdue': return <AlertTriangle className={size} />
    case 'finalized': return <FileCheck className={size} />
    case 'pdf_generated': return <FileText className={size} />
    case 'email_sent': return <Mail className={size} />
    case 'customer_assigned': return <User className={size} />
    case 'picked_up': return <Truck className={size} />
    default: return <Clock className={size} />
  }
}

function getTimelineLabel(event: string, entityType: string) {
  const entityLabel = entityType === 'offer' ? 'Angebot' : entityType === 'order' ? 'Auftrag' : 'Rechnung'
  switch (event) {
    case 'created': return `${entityLabel} erstellt`
    case 'sent': return `${entityLabel} versendet`
    case 'accepted': return `${entityLabel} angenommen`
    case 'rejected': return `${entityLabel} abgelehnt`
    case 'converted': return `${entityLabel} umgewandelt`
    case 'in_production': return 'In Produktion'
    case 'finished': return `${entityLabel} abgeschlossen`
    case 'invoiced': return 'Rechnung erstellt'
    case 'paid': return `${entityLabel} bezahlt`
    case 'cancelled': return `${entityLabel} storniert`
    case 'overdue': return `${entityLabel} überfällig`
    case 'finalized': return `${entityLabel} finalisiert`
    case 'pdf_generated': return `${entityLabel}-PDF generiert`
    case 'email_sent': return `${entityLabel} per E-Mail gesendet`
    case 'customer_assigned': return 'Kunde zugeordnet'
    case 'picked_up': return 'Abgeholt'
    default: return `${entityLabel}: ${event}`
  }
}

function getTimelineColor(event: string) {
  switch (event) {
    case 'created': return 'bg-blue-500'
    case 'sent': return 'bg-indigo-500'
    case 'accepted': return 'bg-green-500'
    case 'rejected': return 'bg-red-500'
    case 'converted': return 'bg-purple-500'
    case 'in_production': return 'bg-yellow-500'
    case 'finished': return 'bg-green-600'
    case 'invoiced': return 'bg-blue-600'
    case 'paid': return 'bg-green-700'
    case 'cancelled': return 'bg-red-600'
    case 'overdue': return 'bg-orange-500'
    case 'finalized': return 'bg-teal-500'
    case 'pdf_generated': return 'bg-gray-500'
    case 'email_sent': return 'bg-cyan-500'
    case 'customer_assigned': return 'bg-violet-500'
    case 'picked_up': return 'bg-emerald-500'
    default: return 'bg-gray-400'
  }
}

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

  // Fetch QR link for the invoice (available after PDF generation)
  const { data: qrData } = useQuery({
    queryKey: ['invoice-qr', id],
    queryFn: async () => {
      const res = await api.get<{ secureLink: string | null; qrDataUrl: string | null }>(`/invoices/${id}/qrlink`)
      return res.data
    },
    enabled: !!invoice?.pdfPath,
  })

  // Fetch timeline
  const { data: timelineData } = useQuery({
    queryKey: ['invoice-timeline', id],
    queryFn: async () => {
      const res = await api.get(`/invoices/${id}/timeline`)
      return res.data as {
        timeline: Array<{
          id: string
          entityType: 'offer' | 'order' | 'invoice'
          entityId: string
          event: string
          details?: string
          createdAt: string
        }>
        accessLogs: Array<{
          id: string
          action: string
          ipAddress: string
          userAgent: string
          createdAt: string
        }>
        offerInfo: any
        orderInfo: any
        customerInfo: any
      }
    },
    enabled: !!invoice,
  })

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      queryClient.invalidateQueries({ queryKey: ['invoice-qr', id] })
    },
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

          {/* QR Code Section */}
          {qrData?.qrDataUrl && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-3">
                <QrCode className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-semibold">QR-Code</h2>
              </div>
              <div className="flex flex-col items-center">
                <img
                  src={qrData.qrDataUrl}
                  alt="Rechnungs-QR-Code"
                  className="w-40 h-40"
                />
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Diesen QR-Code scannen, um die Rechnung online aufzurufen.
                </p>
              </div>
              {qrData?.secureLink && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Direktlink:</p>
                  <div className="bg-gray-50 rounded p-2 break-all text-xs text-gray-700 font-mono select-all">
                    {qrData.secureLink}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Timeline / Rechnungshistorie */}
      {timelineData && timelineData.timeline && timelineData.timeline.length > 0 && (
        <div className="card">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold">Rechnungshistorie</h2>
            </div>
            {/* Context links */}
            <div className="flex items-center gap-4 mt-2 text-sm">
              {timelineData.customerInfo && (
                <Link to={`/customers/${timelineData.customerInfo.id}`} className="text-primary-600 hover:underline flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {timelineData.customerInfo.name}
                </Link>
              )}
              {timelineData.offerInfo && (
                <Link to={`/offers/${timelineData.offerInfo.id}`} className="text-primary-600 hover:underline flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  Angebot {timelineData.offerInfo.offerNumber}
                </Link>
              )}
              {timelineData.orderInfo && (
                <Link to={`/orders/${timelineData.orderInfo.id}`} className="text-primary-600 hover:underline flex items-center gap-1">
                  <Package className="w-3.5 h-3.5" />
                  Auftrag {timelineData.orderInfo.orderNumber}
                </Link>
              )}
            </div>
          </div>
          <div className="p-6">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
              <div className="space-y-4">
                {timelineData.timeline.map((entry) => {
                  const icon = getTimelineIcon(entry.event, entry.entityType)
                  const label = getTimelineLabel(entry.event, entry.entityType)
                  const colorClass = getTimelineColor(entry.event)
                  const details = entry.details ? (() => { try { return JSON.parse(entry.details!) } catch { return null } })() : null

                  return (
                    <div key={entry.id} className="relative flex items-start gap-3 pl-10">
                      <div className={`absolute left-2 w-5 h-5 rounded-full flex items-center justify-center ${colorClass}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{label}</p>
                        {details && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {details.offerNumber && `Angebot: ${details.offerNumber}`}
                            {details.orderNumber && `Auftrag: ${details.orderNumber}`}
                            {details.invoiceNumber && `Rechnung: ${details.invoiceNumber}`}
                            {details.to && ` → ${details.to}`}
                            {details.customerName && ` – ${details.customerName}`}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Access Log (Zugriffsverlauf) */}
          {timelineData.accessLogs && timelineData.accessLogs.length > 0 && (
            <div className="p-6 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700">Zugriffsverlauf (Kundenportal)</h3>
              </div>
              <div className="space-y-2">
                {timelineData.accessLogs.map((log) => {
                  const actionLabels: Record<string, string> = {
                    view_offer: '👁 Angebot angesehen',
                    download_pdf: '📄 PDF heruntergeladen',
                    respond_accepted: '✅ Angebot angenommen',
                    respond_rejected: '❌ Angebot abgelehnt',
                  }
                  return (
                    <div key={log.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-3 py-2">
                      <div>
                        <span className="font-medium text-gray-700">{actionLabels[log.action] || log.action}</span>
                        <span className="text-gray-400 ml-2">IP: {log.ipAddress}</span>
                      </div>
                      <span className="text-gray-400">
                        {new Date(log.createdAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}