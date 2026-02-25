import type { UUID, ISODateTime, ISODate, InvoiceStatus } from '../../shared/types';
import { ImmutableError, InvalidTransitionError } from '../../shared/errors';

export interface InvoiceLineItem {
  id: UUID;
  invoiceId: UUID;
  orderItemId?: UUID;
  productId?: UUID;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  sortOrder: number;
}

export interface Invoice {
  id: UUID;
  invoiceNumber: string;
  version: number;
  orderId: UUID;
  customerId: UUID;
  status: InvoiceStatus;
  
  // Business data
  sellerAddress: string;
  customerAddress: string;
  lineItems: InvoiceLineItem[];
  totalNet: number;
  vatPercent: number;
  vatAmount: number;
  totalGross: number;
  
  // Dates
  date: ISODate;
  dueDate?: ISODate;
  paidAt?: ISODateTime;
  finalizedAt?: ISODateTime;
  
  // PDF
  pdfPath?: string;
  
  // Metadata
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  createdBy?: string;
  updatedBy?: string;
}

export interface InvoiceVersion {
  version: number;
  invoiceId: UUID;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  sellerAddress: string;
  customerAddress: string;
  totalNet: number;
  vatPercent: number;
  vatAmount: number;
  totalGross: number;
  createdAt: ISODateTime;
  createdBy?: string;
}

// ─── Valid Status Transitions ────────────────────────────────────
const VALID_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['paid', 'overdue', 'cancelled'],
  paid: [],
  overdue: ['paid', 'cancelled'],
  cancelled: [],
};

export function transitionInvoice(invoice: Invoice, to: InvoiceStatus): Invoice {
  const allowed = VALID_TRANSITIONS[invoice.status];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError('Invoice', invoice.status, to);
  }
  
  const updates: Partial<Invoice> = {
    status: to,
    updatedAt: new Date().toISOString() as ISODateTime,
  };
  
  if (to === 'paid') {
    updates.paidAt = new Date().toISOString() as ISODateTime;
  }
  
  return { ...invoice, ...updates };
}

export function finalizeInvoice(invoice: Invoice): Invoice {
  if (invoice.finalizedAt) {
    throw new ImmutableError('Invoice is already finalized');
  }
  
  if (invoice.status !== 'sent') {
    throw new Error('Invoice must be sent before finalizing');
  }
  
  return {
    ...invoice,
    finalizedAt: new Date().toISOString() as ISODateTime,
    updatedAt: new Date().toISOString() as ISODateTime,
  };
}

export function createInvoiceVersion(invoice: Invoice): InvoiceVersion {
  return {
    version: invoice.version,
    invoiceId: invoice.id,
    status: invoice.status,
    lineItems: invoice.lineItems,
    sellerAddress: invoice.sellerAddress,
    customerAddress: invoice.customerAddress,
    totalNet: invoice.totalNet,
    vatPercent: invoice.vatPercent,
    vatAmount: invoice.vatAmount,
    totalGross: invoice.totalGross,
    createdAt: new Date().toISOString() as ISODateTime,
    createdBy: invoice.updatedBy,
  };
}

export function calcInvoiceTotals(
  lineItems: Pick<InvoiceLineItem, 'totalPrice'>[],
  vatPercent: number,
): { totalNet: number; vatAmount: number; totalGross: number } {
  const totalNet = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const vatAmount = Math.round(totalNet * vatPercent) / 100;
  const totalGross = totalNet + vatAmount;
  
  return { totalNet, vatAmount, totalGross };
}

export function generateInvoiceNumber(sequence: number): string {
  return `INV-${String(sequence + 1).padStart(6, '0')}`;
}
