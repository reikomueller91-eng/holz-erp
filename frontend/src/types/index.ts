export interface Customer {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  notes?: string
  source: 'direct' | 'kleinanzeigen' | 'referral' | 'other'
  kleinanzeigenId?: string
  isActive: boolean
  rating?: number | null
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  name: string
  woodType: string
  qualityGrade: string
  heightMm: number
  widthMm: number
  lengthMm?: number
  calcMethod: 'm2_unsorted' | 'm2_sorted' | 'volume_divided'
  volumeDivider?: number | null
  description?: string
  currentPricePerM2: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface OfferLineItem {
  id: string
  productId: string
  productName?: string
  lengthMm: number
  quantityPieces: number
  unitPricePerM2: number
  totalPrice: number
  notes?: string
}

export interface Offer {
  id: string
  version: number
  customerId: string
  customerName?: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
  lineItems: OfferLineItem[]
  validUntil: string
  notes?: string
  pdfPath?: string
  totalAmount: number
  createdAt: string
  updatedAt: string
}

export interface ProductionJob {
  id: string
  orderId: string
  lineItemRef: string
  productName: string
  targetQuantity: number
  producedQuantity: number
  status: 'queued' | 'in_progress' | 'done' | 'issue'
  notes?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface Order {
  id: string
  orderNumber?: string
  offerId: string
  customerId: string
  customerName?: string
  status: 'new' | 'pending' | 'in_production' | 'finished' | 'ready' | 'delivered' | 'cancelled' | 'invoiced' | 'paid' | 'picked_up'
  productionJobs?: ProductionJob[]
  items?: any[]
  totalAmount?: number
  netSum?: number
  vatPercent?: number
  vatAmount?: number
  grossSum?: number
  productionStatus?: string
  pdfPath?: string
  createdAt: string
  updatedAt: string
  finishedAt?: string | null
}

export interface InvoiceLineItem {
  id: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
}

export interface Invoice {
  id: string
  invoiceNumber?: string
  version: number
  orderId: string
  customerId: string
  customerName?: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  lineItems: InvoiceLineItem[]
  totalNet: number
  taxRate: number
  totalGross: number
  dueDate: string
  paidAt?: string
  finalizedAt?: string
  pdfPath?: string
  createdAt: string
  updatedAt: string
}

export interface DashboardStats {
  totalCustomers: number
  totalProducts: number
  openOffers: number
  pendingOrders: number
  unpaidInvoices: number
  monthlyRevenue: number
  recentOrders: Order[]
  productionQueue: ProductionJob[]
}

export interface ProductionOrderRef {
  orderId: string
  orderNumber: string
  customerName: string
  itemId: string
  quantity: number
  produced: number
  lengthMm: number
  status: string
}

export interface ProductionCluster {
  productId: string
  productName: string
  heightMm: number
  widthMm: number
  lengthMm: number
  quality: string
  totalQuantity: number
  totalProduced: number
  orders: ProductionOrderRef[]
}