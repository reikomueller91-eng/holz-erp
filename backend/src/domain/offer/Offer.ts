import type { UUID, ISODateTime, ISODate, OfferStatus } from '../../shared/types';
import { InvalidTransitionError } from '../../shared/errors';

export interface OfferItem {
  id: UUID;
  productId: UUID;
  heightMm: number;
  widthMm: number;
  lengthMm: number;
  quantity: number;
  quality: string;
  pricePerM2: number;
  netTotal: number;
}

export interface OfferVersion {
  version: number;
  offerId: UUID;
  status: OfferStatus;
  items: OfferItem[];
  sellerAddress: string;
  customerAddress: string;
  netSum: number;
  vatPercent: number;
  vatAmount: number;
  grossSum: number;
  notes?: string;
  createdAt: ISODateTime;
  createdBy?: string;
}

export interface Offer {
  id: UUID;
  offerNumber: string;
  version: number;
  customerId: UUID;
  status: OfferStatus;
  date: ISODate;
  validUntil?: ISODate;
  inquirySource: string;
  inquiryContact?: string;

  // PDF
  pdfPath?: string;

  // Business data
  sellerAddress: string;
  customerAddress: string;
  items: OfferItem[];
  netSum: number;
  vatPercent: number;
  vatAmount: number;
  grossSum: number;
  notes?: string;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  createdBy?: string;
  updatedBy?: string;
}

// ─── Valid Status Transitions ────────────────────────────────────
const VALID_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['accepted', 'rejected', 'cancelled'],
  accepted: ['converted'],
  rejected: [],
  cancelled: [],
  converted: [],
};

export function transitionOffer(offer: Offer, to: OfferStatus): Offer {
  const allowed = VALID_TRANSITIONS[offer.status];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError('Offer', offer.status, to);
  }
  return {
    ...offer,
    status: to,
    updatedAt: new Date().toISOString() as ISODateTime,
  };
}

export function createOfferVersion(offer: Offer): OfferVersion {
  return {
    version: offer.version,
    offerId: offer.id,
    status: offer.status,
    items: offer.items,
    sellerAddress: offer.sellerAddress,
    customerAddress: offer.customerAddress,
    netSum: offer.netSum,
    vatPercent: offer.vatPercent,
    vatAmount: offer.vatAmount,
    grossSum: offer.grossSum,
    notes: offer.notes,
    createdAt: new Date().toISOString() as ISODateTime,
    createdBy: offer.updatedBy,
  };
}

export function calcOfferTotals(items: OfferItem[], vatPercent: number): {
  netSum: number;
  vatAmount: number;
  grossSum: number;
} {
  const netSum = items.reduce((sum, item) => sum + item.netTotal, 0);
  const vatAmount = Math.round(netSum * vatPercent) / 100;
  const grossSum = netSum + vatAmount;

  return { netSum, vatAmount, grossSum };
}
