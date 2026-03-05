import type { DocumentLink, CreateDocumentLinkDto } from '../../domain/document/DocumentLink';

export interface IDocumentLinkRepository {
    save(link: DocumentLink): Promise<void>;
    update(link: DocumentLink): Promise<void>;
    findById(id: string): Promise<DocumentLink | undefined>;
    findByToken(token: string): Promise<DocumentLink | undefined>;
    findByOffer(offerId: string): Promise<DocumentLink[]>;
    findByOrder(orderId: string): Promise<DocumentLink[]>;
    findByInvoice(invoiceId: string): Promise<DocumentLink[]>;
    deleteExpired(now: string): Promise<number>;
}
