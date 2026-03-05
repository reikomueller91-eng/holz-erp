import type { IDatabase } from '../../application/ports/IDatabase';
import type { IDocumentLinkRepository } from '../../application/ports/IDocumentLinkRepository';
import type { DocumentLink } from '../../domain/document/DocumentLink';

interface DocumentLinkRow {
    id: string;
    token: string;
    password_hash: string;
    offer_id: string | null;
    order_id: string | null;
    invoice_id: string | null;
    encrypted_url: string | null;
    expires_at: string;
    created_at: string;
    last_accessed_at: string | null;
}

export class DocumentLinkRepository implements IDocumentLinkRepository {
    constructor(private db: IDatabase) { }

    private mapRowToEntity(row: DocumentLinkRow): DocumentLink {
        return {
            id: row.id,
            token: row.token,
            passwordHash: row.password_hash,
            offerId: row.offer_id || undefined,
            orderId: row.order_id || undefined,
            invoiceId: row.invoice_id || undefined,
            encryptedUrl: row.encrypted_url || undefined,
            expiresAt: row.expires_at,
            createdAt: row.created_at,
            lastAccessedAt: row.last_accessed_at || undefined,
        };
    }

    async save(link: DocumentLink): Promise<void> {
        this.db.run(
            `
      INSERT INTO document_links (
        id, token, password_hash, offer_id, order_id, invoice_id, encrypted_url, expires_at, created_at, last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
            [
                link.id,
                link.token,
                link.passwordHash,
                link.offerId || null,
                link.orderId || null,
                link.invoiceId || null,
                link.encryptedUrl || null,
                link.expiresAt,
                link.createdAt,
                link.lastAccessedAt || null,
            ]
        );
    }

    async update(link: DocumentLink): Promise<void> {
        this.db.run(
            `
      UPDATE document_links 
      SET token = ?, password_hash = ?, offer_id = ?, order_id = ?, invoice_id = ?, encrypted_url = ?, expires_at = ?, last_accessed_at = ?
      WHERE id = ?
      `,
            [
                link.token,
                link.passwordHash,
                link.offerId || null,
                link.orderId || null,
                link.invoiceId || null,
                link.encryptedUrl || null,
                link.expiresAt,
                link.lastAccessedAt || null,
                link.id,
            ]
        );
    }

    async findById(id: string): Promise<DocumentLink | undefined> {
        const row = this.db.queryOne<DocumentLinkRow>(
            'SELECT * FROM document_links WHERE id = ?',
            [id]
        );
        return row ? this.mapRowToEntity(row) : undefined;
    }

    async findByOffer(offerId: string): Promise<DocumentLink[]> {
        const rows = this.db.query<DocumentLinkRow>(
            'SELECT * FROM document_links WHERE offer_id = ? ORDER BY created_at DESC',
            [offerId]
        );
        return rows.map(r => this.mapRowToEntity(r));
    }

    async findByToken(token: string): Promise<DocumentLink | undefined> {
        const row = this.db.queryOne<DocumentLinkRow>(
            'SELECT * FROM document_links WHERE token = ?',
            [token]
        );
        return row ? this.mapRowToEntity(row) : undefined;
    }

    async findByOrder(orderId: string): Promise<DocumentLink[]> {
        const rows = this.db.query<DocumentLinkRow>(
            'SELECT * FROM document_links WHERE order_id = ? ORDER BY created_at DESC',
            [orderId]
        );
        return rows.map(r => this.mapRowToEntity(r));
    }

    async findByInvoice(invoiceId: string): Promise<DocumentLink[]> {
        const rows = this.db.query<DocumentLinkRow>(
            'SELECT * FROM document_links WHERE invoice_id = ? ORDER BY created_at DESC',
            [invoiceId]
        );
        return rows.map(r => this.mapRowToEntity(r));
    }

    async deleteExpired(now: string): Promise<number> {
        // This assumes db.run or db.exec doesn't automatically return changes count in our wrapper, 
        // better-sqlite3 normally returns an info object { changes: number }.
        // We'll rely on our IDatabase abstraction.
        try {
            this.db.run('DELETE FROM document_links WHERE expires_at < ?', [now]);
            return 1; // Since IDatabase run returns void, we just return a positive integer for success
        } catch {
            return 0;
        }
    }
}
