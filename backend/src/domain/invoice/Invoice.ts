import type { UUID, ISODateTime, ISODate, InvoiceStatus } from '../../shared/types';
import { ImmutableError, InvalidTransitionError } from '../../shared/errors';

export interface InvoiceLineItem {
  id: UUID;
  invoiceId: UUID;
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
  version: number;
  orderId: UUID;
  customerId: UUID;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  totalNet: number;
  taxRate: number;
  totalGross: number;
  dueDate?: ISODate;
  paidAt?: ISODateTime;
  finalizedAt?: ISODateTime;
  pdfPath?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

const VALID_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['paid', 'overdue', 'cancelled'],
  paid: [],
  overdue: ['paid', 'cancelled'],
  cancelled: [],
};

export function finalizeInvoice(invoice: Invoice): Invoice {
  if (invoice.finalizedAt) {
    throw new ImmutableError('Invoice');
  }
  return {
    ...invoice,
    finalizedAt: new Date().toISOString() as ISODateTime,
    updatedAt: new Date().toISOString() as ISODateTime,
  };
}

export function transitionInvoice(invoice: Invoice, to: InvoiceStatus): Invoice {
  if (invoice.finalizedAt && to !== 'paid') {
    throw new ImmutableError('Invoice');
  }
  const allowed = VALID_TRANSITIONS[invoice.status];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError('Invoice', invoice.status, to);
  }
  return {
    ...invoice,
    status: to,
    ...(to === 'paid' ? { paidAt: new Date().toISOString() as ISODateTime } : {}),
    updatedAt: new Date().toISOString() as ISODateTime,
  };
}

export function calcInvoiceTotals(
  lineItems: Pick<InvoiceLineItem, 'totalPrice'>[],
  taxRate: number,
): { totalNet: number; totalGross: number } {
  const totalNet = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  return {
    totalNet,
    totalGross: totalNet * (1 + taxRate),
  };
}
