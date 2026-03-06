import * as argon2 from 'argon2';
import crypto from 'crypto';
import type { IDocumentLinkRepository } from '../ports/IDocumentLinkRepository';
import type { DocumentLink } from '../../domain/document/DocumentLink';
import { generateId } from '../../shared/utils/id';
import type { UUID } from '../../shared/types';
import type { ICryptoService } from '../ports/ICryptoService';
import type { EncryptedField } from '../../shared/types';

export class DocumentLinkService {
    constructor(
        private documentLinkRepo: IDocumentLinkRepository,
        private cryptoService: ICryptoService
    ) { }

    /**
     * Generates a new secure link for a document.
     * Returns the unhashed password to be shown to the user ONCE.
     */
    async createLink(params: { offerId?: string; orderId?: string; invoiceId?: string }): Promise<{ link: DocumentLink; rawPassword: string }> {
        const token = crypto.randomBytes(32).toString('hex');
        const rawPassword = crypto.randomBytes(8).toString('hex'); // 16-char hex password

        // Hash the password securely
        const passwordHash = await argon2.hash(rawPassword);

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days

        const link: DocumentLink = {
            id: generateId() as UUID,
            token,
            passwordHash,
            offerId: params.offerId,
            orderId: params.orderId,
            invoiceId: params.invoiceId,
            expiresAt,
            createdAt: now.toISOString(),
        };

        await this.documentLinkRepo.save(link);

        return { link, rawPassword };
    }

    /**
     * Validates a token and password. Checks for expiration.
     * Returns the document link if valid, throws/returns null otherwise.
     */
    async validateAndAccessLink(token: string, rawPassword: string): Promise<DocumentLink | null> {
        const link = await this.documentLinkRepo.findByToken(token);
        if (!link) {
            return null;
        }

        const now = new Date().toISOString();
        if (link.expiresAt < now) {
            return null; // Link expired
        }

        const isValid = await argon2.verify(link.passwordHash, rawPassword);
        if (!isValid) {
            return null;
        }

        // Update last accessed time
        link.lastAccessedAt = now;
        await this.documentLinkRepo.update(link);

        return link;
    }

    async saveEncryptedUrl(link: DocumentLink, rawUrl: string): Promise<void> {
        const encrypted = this.cryptoService.encrypt(rawUrl);
        link.encryptedUrl = JSON.stringify(encrypted);
        await this.documentLinkRepo.update(link);
    }

    getDecryptedUrl(link: DocumentLink): string | null {
        if (!link.encryptedUrl) return null;
        try {
            const encrypted = JSON.parse(link.encryptedUrl) as EncryptedField;
            return this.cryptoService.decrypt(encrypted);
        } catch (e) {
            return null;
        }
    }

    async getExistingLink(params: { offerId?: string; orderId?: string; invoiceId?: string }): Promise<DocumentLink | null> {
        if (params.invoiceId) {
            const links = await this.documentLinkRepo.findByInvoice(params.invoiceId);
            if (links.length > 0) return links[0];
        }
        if (params.orderId) {
            const links = await this.documentLinkRepo.findByOrder(params.orderId);
            if (links.length > 0) return links[0];
        }
        if (params.offerId) {
            const links = await this.documentLinkRepo.findByOffer(params.offerId);
            if (links.length > 0) return links[0];
        }
        return null;
    }

    async extendExpiration(link: DocumentLink, newExpiresAt: string): Promise<void> {
        if (link.expiresAt < newExpiresAt) {
            link.expiresAt = newExpiresAt;
            await this.documentLinkRepo.update(link);
        }
    }

    /**
     * Force-extends expiration even if the link is already expired (reactivation).
     */
    async forceExtendExpiration(link: DocumentLink, newExpiresAt: string): Promise<void> {
        link.expiresAt = newExpiresAt;
        await this.documentLinkRepo.update(link);
    }

    /**
     * Update a link's properties (e.g. orderId, invoiceId) without changing the token/password.
     */
    async forceUpdateLink(link: DocumentLink): Promise<void> {
        await this.documentLinkRepo.update(link);
    }

    /**
     * Store an unencrypted JSON snapshot of offer/invoice data for public access without system unlock.
     */
    async savePublicData(link: DocumentLink, data: Record<string, unknown>): Promise<void> {
        link.publicData = JSON.stringify(data);
        await this.documentLinkRepo.update(link);
    }
}
