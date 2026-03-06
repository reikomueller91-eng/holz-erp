import type { IDatabase } from '../../application/ports/IDatabase';
import { generateId } from '../../shared/utils/id';

export type EntityType = 'offer' | 'order' | 'invoice';

export type HistoryEvent =
  | 'created'
  | 'sent'
  | 'accepted'
  | 'accepted_manual'
  | 'rejected'
  | 'converted'
  | 'in_production'
  | 'finished'
  | 'invoiced'
  | 'paid'
  | 'cancelled'
  | 'overdue'
  | 'finalized'
  | 'pdf_generated'
  | 'email_sent'
  | 'customer_assigned'
  | 'picked_up';

export interface DocumentHistoryEntry {
  id: string;
  entityType: EntityType;
  entityId: string;
  event: HistoryEvent;
  details?: string; // JSON
  createdAt: string;
}

interface DocumentHistoryRow {
  id: string;
  entity_type: string;
  entity_id: string;
  event: string;
  details?: string;
  created_at: string;
}

export interface IDocumentHistoryRepository {
  log(entityType: EntityType, entityId: string, event: HistoryEvent, details?: Record<string, unknown>): void;
  getHistory(entityType: EntityType, entityId: string): DocumentHistoryEntry[];
  getTimeline(invoiceId: string): Promise<DocumentHistoryEntry[]>;
}

export class DocumentHistoryRepository implements IDocumentHistoryRepository {
  constructor(private db: IDatabase) {}

  log(entityType: EntityType, entityId: string, event: HistoryEvent, details?: Record<string, unknown>): void {
    this.db.run(
      `INSERT INTO document_history (id, entity_type, entity_id, event, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        generateId(),
        entityType,
        entityId,
        event,
        details ? JSON.stringify(details) : null,
        new Date().toISOString(),
      ]
    );
  }

  getHistory(entityType: EntityType, entityId: string): DocumentHistoryEntry[] {
    const rows = this.db.query<DocumentHistoryRow>(
      `SELECT * FROM document_history WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC`,
      [entityType, entityId]
    );
    return rows.map(this.rowToEntry);
  }

  /**
   * Get full timeline for an invoice, including linked order and offer history.
   * Traces: offer → order → invoice chain.
   */
  async getTimeline(invoiceId: string): Promise<DocumentHistoryEntry[]> {
    // Get invoice history
    const invoiceHistory = this.getHistory('invoice', invoiceId);

    // Get the invoice row to find orderId
    const invoiceRow = this.db.queryOne<{ order_id: string | null }>(
      'SELECT order_id FROM invoices WHERE id = ?',
      [invoiceId]
    );

    let orderHistory: DocumentHistoryEntry[] = [];
    let offerHistory: DocumentHistoryEntry[] = [];

    if (invoiceRow?.order_id) {
      orderHistory = this.getHistory('order', invoiceRow.order_id);

      // Get the order row to find offerId
      const orderRow = this.db.queryOne<{ offer_id: string | null }>(
        'SELECT offer_id FROM orders WHERE id = ?',
        [invoiceRow.order_id]
      );

      if (orderRow?.offer_id) {
        offerHistory = this.getHistory('offer', orderRow.offer_id);
      }
    }

    // Combine and sort chronologically
    const all = [...offerHistory, ...orderHistory, ...invoiceHistory];
    all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return all;
  }

  private rowToEntry(row: DocumentHistoryRow): DocumentHistoryEntry {
    return {
      id: row.id,
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id,
      event: row.event as HistoryEvent,
      details: row.details || undefined,
      createdAt: row.created_at,
    };
  }
}
