// Pricing Types
export interface PriceSuggestion {
  currentPrice: number;
  suggestedPrice: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  historyCount: number;
  previousPurchases: number;
  recentHistory: HistoricalPriceEntry[];
}

export interface PriceCalculationResult {
  areaMm2: number;
  areaM2: number;
  pricePerM2: number;
  lengthM: number;
  quantity: number;
  pricePerUnit: number;
  totalBeforeDiscount: number;
  discountAmount: number;
  discountPercent: number;
  finalTotal: number;
}

export interface HistoricalPriceEntry {
  date: string;
  orderId: string;
  customerId: string;
  customerName: string;
  quality: string;
  lengthMm: number;
  pricePerM2: number;
  quantity: number;
  isReturningCustomer: boolean;
}

// Offer Types
export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted';

export interface OfferItemData {
  id: string;
  productId: string;
  heightMm: number;
  widthMm: number;
  lengthMm: number;
  quantity: number;
  quality: string;
  pricePerM2: number;
  netTotal: number;
}

export interface OfferData {
  id: string;
  offerNumber: string;
  version: number;
  status: OfferStatus;
  date: string;
  validUntil?: string;
  inquirySource: string;
  inquiryContact?: string;
  customerId: string;
  sellerAddress: string;
  customerAddress: string;
  items: OfferItemData[];
  netSum: number;
  vatPercent: number;
  vatAmount: number;
  grossSum: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface OfferVersionInfo {
  version: number;
  createdAt: string;
  createdBy?: string;
  changes: string[];
}

// Order Types
export type OrderStatus = 'new' | 'in_production' | 'finished' | 'invoiced' | 'paid' | 'picked_up';
export type ProductionStatus = 'not_started' | 'in_progress' | 'completed';

export interface OrderItemData {
  id: string;
  productId: string;
  heightMm: number;
  widthMm: number;
  lengthMm: number;
  quantity: number;
  quantityProduced: number;
  quality: string;
  pricePerM2: number;
  netTotal: number;
  productionStatus: ProductionStatus;
}

export interface OrderData {
  id: string;
  orderNumber: string;
  offerId?: string;
  status: OrderStatus;
  customerId: string;
  items: OrderItemData[];
  netSum: number;
  vatPercent: number;
  vatAmount: number;
  grossSum: number;
  productionStatus: ProductionStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

// Invoice Types
export type InvoiceStatus = 'draft' | 'finalized' | 'paid';

export interface InvoiceItemData {
  id: string;
  orderItemId: string;
  productId: string;
  description: string;
  quantity: number;
  pricePerUnit: number;
  netTotal: number;
}

export interface InvoiceData {
  id: string;
  invoiceNumber: string;
  orderId: string;
  version: number;
  status: InvoiceStatus;
  date: string;
  dueDate?: string;
  customerId: string;
  sellerAddress: string;
  customerAddress: string;
  items: InvoiceItemData[];
  netSum: number;
  vatPercent: number;
  vatAmount: number;
  grossSum: number;
  roundingAdjustment?: number;
  finalSum: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// Production Types
export interface ProductionItem {
  orderId: string;
  orderNumber: string;
  itemId: string;
  customerName: string;
  heightMm: number;
  widthMm: number;
  lengthMm: number;
  quantityTotal: number;
  quantityProduced: number;
  quantityRemaining: number;
  quality: string;
  status: ProductionStatus;
}

// Audit Types
export interface AuditEntry {
  id: string;
  entityType: 'offer' | 'order' | 'invoice';
  entityId: string;
  version: number;
  action: 'created' | 'updated' | 'deleted' | 'status_changed';
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
  timestamp: string;
  userId?: string;
}
