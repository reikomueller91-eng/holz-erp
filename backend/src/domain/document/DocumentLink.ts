export interface DocumentLink {
    id: string; // UUID
    token: string;
    passwordHash: string;
    offerId?: string; // UUID
    orderId?: string; // UUID
    invoiceId?: string; // UUID
    encryptedUrl?: string; // Encrypted absolute URL
    publicData?: string; // Unencrypted JSON snapshot of offer/invoice data for public access
    expiresAt: string; // ISODateTime
    createdAt: string; // ISODateTime
    lastAccessedAt?: string; // ISODateTime
}

export type CreateDocumentLinkDto = Omit<DocumentLink, 'id' | 'createdAt' | 'lastAccessedAt'>;
