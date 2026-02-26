import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Utility for merging Tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format date to German locale
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('de-DE')
}

// Format currency
export function formatCurrency(amount: number): string {
  return `€${amount.toFixed(2)}`
}

// Status color mappings
export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
export type OrderStatus = 'pending' | 'in_production' | 'ready' | 'delivered' | 'cancelled'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
export type ProductionStatus = 'queued' | 'in_progress' | 'done' | 'issue'

export const statusConfig = {
  offer: {
    draft: { color: 'bg-gray-100 text-gray-800', label: 'Entwurf' },
    sent: { color: 'bg-blue-100 text-blue-800', label: 'Gesendet' },
    accepted: { color: 'bg-green-100 text-green-800', label: 'Angenommen' },
    rejected: { color: 'bg-red-100 text-red-800', label: 'Abgelehnt' },
    expired: { color: 'bg-yellow-100 text-yellow-800', label: 'Abgelaufen' },
  },
  order: {
    pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Ausstehend' },
    in_production: { color: 'bg-blue-100 text-blue-800', label: 'In Produktion' },
    ready: { color: 'bg-purple-100 text-purple-800', label: 'Bereit' },
    delivered: { color: 'bg-green-100 text-green-800', label: 'Geliefert' },
    cancelled: { color: 'bg-red-100 text-red-800', label: 'Storniert' },
  },
  invoice: {
    draft: { color: 'bg-gray-100 text-gray-800', label: 'Entwurf' },
    sent: { color: 'bg-blue-100 text-blue-800', label: 'Gesendet' },
    paid: { color: 'bg-green-100 text-green-800', label: 'Bezahlt' },
    overdue: { color: 'bg-red-100 text-red-800', label: 'Überfällig' },
    cancelled: { color: 'bg-yellow-100 text-yellow-800', label: 'Storniert' },
  },
  production: {
    queued: { color: 'bg-gray-100 text-gray-800', label: 'Wartend' },
    in_progress: { color: 'bg-blue-100 text-blue-800', label: 'In Arbeit' },
    done: { color: 'bg-green-100 text-green-800', label: 'Fertig' },
    issue: { color: 'bg-red-100 text-red-800', label: 'Problem' },
  },
} as const

export function getStatusConfig<T extends keyof typeof statusConfig>(
  type: T,
  status: string
): { color: string; label: string } {
  const config = statusConfig[type] as Record<string, { color: string; label: string }>
  return config[status] || { color: 'bg-gray-100 text-gray-800', label: status }
}

// Customer source labels
export const customerSourceLabels: Record<string, string> = {
  direct: 'Direkt',
  kleinanzeigen: 'Kleinanzeigen',
  referral: 'Empfehlung',
  other: 'Sonstiges',
}

// Wood types and quality grades (constants)
export const WOOD_TYPES = ['Eiche', 'Kiefer', 'Fichte', 'Buche', 'Ahorn', 'Nuss', 'Sonstiges'] as const
export const QUALITY_GRADES = ['A', 'B', 'C', 'Rustikal', 'Select', 'Premium'] as const
