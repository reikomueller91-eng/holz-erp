import type {
  UUID,
  ISODateTime,
  CustomerSource,
} from '../../shared/types';

/**
 * Customer entity.
 * Sensitive fields (name, contactInfo, notes, kleinanzeigenId) are
 * stored encrypted in DB and arrive as EncryptedField blobs.
 * When unlocked, they are decrypted to their plain types.
 */

export interface CustomerContactInfo {
  email?: string;
  phone?: string;
  address?: CustomerAddress;
}

export interface CustomerAddress {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

// ─── Encrypted form (as stored in DB) ───────────────────────────
export interface CustomerRow {
  id: UUID;
  encrypted_data: string; // JSON-serialized EncryptedField
  is_active: 0 | 1;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

// ─── Encrypted payload (inside the encrypted_data blob) ─────────
export interface CustomerEncryptedPayload {
  name: string;
  contactInfo: CustomerContactInfo;
  notes: string;
  source: CustomerSource;
  kleinanzeigenId?: string;
}

// ─── Domain entity (decrypted, in-memory) ───────────────────────
export interface Customer {
  id: UUID;
  name: string;
  contactInfo: CustomerContactInfo;
  notes: string;
  source: CustomerSource;
  kleinanzeigenId?: string;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ─── Factory ─────────────────────────────────────────────────────
export function createCustomer(
  params: Omit<Customer, 'isActive' | 'createdAt' | 'updatedAt'> & {
    isActive?: boolean;
    createdAt?: ISODateTime;
    updatedAt?: ISODateTime;
  },
): Customer {
  const now = new Date().toISOString() as ISODateTime;
  return {
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...params,
  };
}
