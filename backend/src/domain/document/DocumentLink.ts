import { UUID, ISODateTime } from '../../shared/types';

export interface DocumentLink {
    id: string; // UUID
    token: string;
    passwordHash: string;
    offerId?: string; // UUID
    orderId?: string; // UUID
    invoiceId?: string; // UUID
    encryptedUrl?: string; // Encrypted absolute URL
    expiresAt: string; // ISODateTime
    createdAt: string; // ISODateTime
    lastAccessedAt?: string; // ISODateTime
}

export type CreateDocumentLinkDto = Omit<DocumentLink, 'id' | 'createdAt' | 'lastAccessedAt'>;
