import type { Invoice, InvoiceLineItem, InvoiceVersion } from '../../domain/invoice/Invoice';
import { transitionInvoice, finalizeInvoice, createInvoiceVersion } from '../../domain/invoice/Invoice';
import type { IDatabase } from '../../application/ports/IDatabase';
import type { ICryptoService } from '../../application/ports/ICryptoService';
import type { UUID, InvoiceStatus } from '../../shared/types';

export interface IInvoiceRepository {
  findAll(options?: { status?: InvoiceStatus; customerId?: UUID; limit?: number; offset?: number }): Promise<Invoice[]>;
  findById(id: UUID): Promise<Invoice | null>;
  findByInvoiceNumber(invoiceNumber: string): Promise<Invoice | null>;
  findByOrderId(orderId: UUID): Promise<Invoice[]>;
  findByCustomer(customerId: UUID): Promise<Invoice[]>;
  save(invoice: Invoice): Promise<void>;
  update(invoice: Invoice): Promise<void>;
  getVersionHistory(invoiceId: UUID): Promise<InvoiceVersion[]>;
  saveVersion(invoiceId: UUID, version: InvoiceVersion): Promise<void>;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  version: number;
  order_id: string;
  customer_id: string;
  status: string;
  encrypted_data: string;
  date: string;
  due_date?: string;
  paid_at?: string;
  finalized_at?: string;
  pdf_path?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

interface InvoiceEncryptedData {
  sellerAddress: string;
  customerAddress: string;
  lineItems: InvoiceLineItem[];
  totalNet: number;
  vatPercent: number;
  vatAmount: number;
  totalGross: number;
}

interface InvoiceVersionRow {
  invoice_id: string;
  version: number;
  encrypted_data: string;
  created_at: string;
  created_by?: string;
}

export class InvoiceRepository implements IInvoiceRepository {
  constructor(
    private db: IDatabase,
    private crypto: ICryptoService
  ) { }

  async findAll(options: { status?: InvoiceStatus; customerId?: UUID; limit?: number; offset?: number } = {}): Promise<Invoice[]> {
    let sql = 'SELECT * FROM invoices WHERE 1=1';
    const params: unknown[] = [];

    if (options.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }

    if (options.customerId) {
      sql += ' AND customer_id = ?';
      params.push(options.customerId);
    }

    sql += ' ORDER BY created_at DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const rows = this.db.query<InvoiceRow>(sql, params);
    return Promise.all(rows.map(row => this.rowToInvoice(row)));
  }

  async findById(id: UUID): Promise<Invoice | null> {
    const row = this.db.queryOne<InvoiceRow>('SELECT * FROM invoices WHERE id = ?', [id]);
    return row ? this.rowToInvoice(row) : null;
  }

  async findByInvoiceNumber(invoiceNumber: string): Promise<Invoice | null> {
    const row = this.db.queryOne<InvoiceRow>('SELECT * FROM invoices WHERE invoice_number = ?', [invoiceNumber]);
    return row ? this.rowToInvoice(row) : null;
  }

  async findByOrderId(orderId: UUID): Promise<Invoice[]> {
    const rows = this.db.query<InvoiceRow>('SELECT * FROM invoices WHERE order_id = ? ORDER BY created_at DESC', [orderId]);
    return Promise.all(rows.map(row => this.rowToInvoice(row)));
  }

  async findByCustomer(customerId: UUID): Promise<Invoice[]> {
    const rows = this.db.query<InvoiceRow>('SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC', [customerId]);
    return Promise.all(rows.map(row => this.rowToInvoice(row)));
  }

  async save(invoice: Invoice): Promise<void> {
    const encryptedData = this.crypto.serializeField<InvoiceEncryptedData>({
      sellerAddress: invoice.sellerAddress,
      customerAddress: invoice.customerAddress,
      lineItems: invoice.lineItems,
      totalNet: invoice.totalNet,
      vatPercent: invoice.vatPercent,
      vatAmount: invoice.vatAmount,
      totalGross: invoice.totalGross,
    });

    this.db.run(
      `INSERT INTO invoices (
        id, invoice_number, version, order_id, customer_id, status,
        encrypted_data, date, due_date, paid_at, finalized_at, pdf_path,
        created_at, updated_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoice.id,
        invoice.invoiceNumber,
        invoice.version,
        invoice.orderId,
        invoice.customerId,
        invoice.status,
        encryptedData,
        invoice.date,
        invoice.dueDate ?? null,
        invoice.paidAt ?? null,
        invoice.finalizedAt ?? null,
        invoice.pdfPath ?? null,
        invoice.createdAt,
        invoice.updatedAt,
        invoice.createdBy ?? null,
        invoice.updatedBy ?? null,
      ]
    );
  }

  async update(invoice: Invoice): Promise<void> {
    const encryptedData = this.crypto.serializeField<InvoiceEncryptedData>({
      sellerAddress: invoice.sellerAddress,
      customerAddress: invoice.customerAddress,
      lineItems: invoice.lineItems,
      totalNet: invoice.totalNet,
      vatPercent: invoice.vatPercent,
      vatAmount: invoice.vatAmount,
      totalGross: invoice.totalGross,
    });

    this.db.run(
      `UPDATE invoices SET
        version = ?,
        status = ?,
        encrypted_data = ?,
        due_date = ?,
        paid_at = ?,
        finalized_at = ?,
        pdf_path = ?,
        updated_at = ?,
        updated_by = ?
      WHERE id = ?`,
      [
        invoice.version,
        invoice.status,
        encryptedData,
        invoice.dueDate ?? null,
        invoice.paidAt ?? null,
        invoice.finalizedAt ?? null,
        invoice.pdfPath ?? null,
        invoice.updatedAt,
        invoice.updatedBy ?? null,
        invoice.id,
      ]
    );
  }

  async getVersionHistory(invoiceId: UUID): Promise<InvoiceVersion[]> {
    const rows = this.db.query<InvoiceVersionRow>(
      'SELECT * FROM invoice_versions WHERE invoice_id = ? ORDER BY version ASC',
      [invoiceId]
    );
    return Promise.all(rows.map(row => this.rowToInvoiceVersion(row)));
  }

  async saveVersion(invoiceId: UUID, version: InvoiceVersion): Promise<void> {
    const encryptedData = this.crypto.serializeField<Omit<InvoiceVersion, 'version' | 'invoiceId' | 'createdAt' | 'createdBy'>>({
      status: version.status,
      lineItems: version.lineItems,
      sellerAddress: version.sellerAddress,
      customerAddress: version.customerAddress,
      totalNet: version.totalNet,
      vatPercent: version.vatPercent,
      vatAmount: version.vatAmount,
      totalGross: version.totalGross,
    });

    this.db.run(
      `INSERT INTO invoice_versions (invoice_id, version, encrypted_data, created_at, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [
        invoiceId,
        version.version,
        encryptedData,
        version.createdAt,
        version.createdBy ?? null,
      ]
    );
  }

  private async rowToInvoice(row: InvoiceRow): Promise<Invoice> {
    const decrypted = this.crypto.deserializeField<InvoiceEncryptedData>(row.encrypted_data);

    return {
      id: row.id as UUID,
      invoiceNumber: row.invoice_number,
      version: row.version,
      orderId: row.order_id as UUID,
      customerId: row.customer_id as UUID,
      status: row.status as InvoiceStatus,
      date: row.date,
      dueDate: row.due_date,
      paidAt: row.paid_at,
      finalizedAt: row.finalized_at,
      pdfPath: row.pdf_path,
      sellerAddress: decrypted.sellerAddress,
      customerAddress: decrypted.customerAddress,
      lineItems: decrypted.lineItems,
      totalNet: decrypted.totalNet,
      vatPercent: decrypted.vatPercent,
      vatAmount: decrypted.vatAmount,
      totalGross: decrypted.totalGross,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }

  private async rowToInvoiceVersion(row: InvoiceVersionRow): Promise<InvoiceVersion> {
    const decrypted = this.crypto.deserializeField<Omit<InvoiceVersion, 'version' | 'invoiceId' | 'createdAt' | 'createdBy'>>(row.encrypted_data);

    return {
      invoiceId: row.invoice_id as UUID,
      version: row.version,
      status: decrypted.status,
      lineItems: decrypted.lineItems,
      sellerAddress: decrypted.sellerAddress,
      customerAddress: decrypted.customerAddress,
      totalNet: decrypted.totalNet,
      vatPercent: decrypted.vatPercent,
      vatAmount: decrypted.vatAmount,
      totalGross: decrypted.totalGross,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }
}
