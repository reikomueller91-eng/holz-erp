import type { UUID, ISODateTime, ISODate, OfferStatus } from '../../shared/types';
import { InvalidTransitionError } from '../../shared/errors';

export interface OfferLineItem {
  id: UUID;
  offerId: UUID;
  productId: UUID;
  lengthMm: number;
  quantityPieces: number;
  unitPricePerM2: number;
  totalPrice: number;
  notes?: string;
  sortOrder: number;
}

export interface Offer {
  id: UUID;
  version: number;
  customerId: UUID;
  status: OfferStatus;
  lineItems: OfferLineItem[];
  validUntil?: ISODate;
  notes?: string; // decrypted
  pdfPath?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ─── Valid Status Transitions ────────────────────────────────────
const VALID_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  draft: ['sent', 'rejected'],
  sent: ['accepted', 'rejected', 'expired'],
  accepted: [],
  rejected: [],
  expired: [],
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

export function calcOfferTotal(offer: Offer): number {
  return offer.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
}
