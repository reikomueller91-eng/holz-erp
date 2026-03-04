import type { Offer, OfferItem, OfferVersion } from '../../domain/offer/Offer';
import { transitionOffer, createOfferVersion } from '../../domain/offer/Offer';
import type { IDatabase } from '../../application/ports/IDatabase';
import type { ICryptoService } from '../../application/ports/ICryptoService';
import type { UUID, OfferStatus } from '../../shared/types';

export interface IOfferRepository {
  findAll(options?: { status?: OfferStatus; customerId?: UUID; limit?: number; offset?: number }): Promise<Offer[]>;
  findById(id: UUID): Promise<Offer | null>;
  findByOfferNumber(offerNumber: string): Promise<Offer | null>;
  findByCustomer(customerId: UUID): Promise<Offer[]>;
  save(offer: Offer): Promise<void>;
  update(offer: Offer): Promise<void>;
  getVersionHistory(offerId: UUID): Promise<OfferVersion[]>;
  saveVersion(offerId: UUID, version: OfferVersion): Promise<void>;
}

interface OfferRow {
  id: string;
  offer_number: string;
  version: number;
  status: string;
  date: string;
  valid_until?: string;
  inquiry_source: string;
  inquiry_contact?: string;
  customer_id: string;
  encrypted_data: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  pdf_path?: string;
}

interface OfferEncryptedData {
  sellerAddress: string;
  customerAddress: string;
  items: OfferItem[];
  netSum: number;
  vatPercent: number;
  vatAmount: number;
  grossSum: number;
  notes?: string;
}

interface OfferVersionRow {
  offer_id: string;
  version: number;
  encrypted_data: string;
  created_at: string;
  created_by?: string;
}

export class OfferRepository implements IOfferRepository {
  constructor(
    private db: IDatabase,
    private crypto: ICryptoService
  ) { }

  async findAll(options: { status?: OfferStatus; customerId?: UUID; limit?: number; offset?: number } = {}): Promise<Offer[]> {
    let sql = 'SELECT * FROM offers WHERE 1=1';
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

    const rows = this.db.query<OfferRow>(sql, params);
    return Promise.all(rows.map(row => this.rowToOffer(row)));
  }

  async findById(id: UUID): Promise<Offer | null> {
    const row = this.db.queryOne<OfferRow>('SELECT * FROM offers WHERE id = ?', [id]);
    return row ? this.rowToOffer(row) : null;
  }

  async findByOfferNumber(offerNumber: string): Promise<Offer | null> {
    const row = this.db.queryOne<OfferRow>('SELECT * FROM offers WHERE offer_number = ?', [offerNumber]);
    return row ? this.rowToOffer(row) : null;
  }

  async findByCustomer(customerId: UUID): Promise<Offer[]> {
    const rows = this.db.query<OfferRow>('SELECT * FROM offers WHERE customer_id = ? ORDER BY created_at DESC', [customerId]);
    return Promise.all(rows.map(row => this.rowToOffer(row)));
  }

  async save(offer: Offer): Promise<void> {
    const encryptedData = this.crypto.serializeField<OfferEncryptedData>({
      sellerAddress: offer.sellerAddress,
      customerAddress: offer.customerAddress,
      items: offer.items,
      netSum: offer.netSum,
      vatPercent: offer.vatPercent,
      vatAmount: offer.vatAmount,
      grossSum: offer.grossSum,
      notes: offer.notes,
    });

    this.db.run(
      `INSERT INTO offers (
        id, offer_number, version, status, date, valid_until,
        inquiry_source, inquiry_contact, customer_id, encrypted_data,
        created_at, updated_at, created_by, updated_by, pdf_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        offer.id,
        offer.offerNumber,
        offer.version,
        offer.status,
        offer.date,
        offer.validUntil ?? null,
        offer.inquirySource,
        offer.inquiryContact ?? null,
        offer.customerId,
        encryptedData,
        offer.createdAt,
        offer.updatedAt,
        offer.createdBy ?? null,
        offer.updatedBy ?? null,
        offer.pdfPath ?? null,
      ]
    );
  }

  async update(offer: Offer): Promise<void> {
    const encryptedData = this.crypto.serializeField<OfferEncryptedData>({
      sellerAddress: offer.sellerAddress,
      customerAddress: offer.customerAddress,
      items: offer.items,
      netSum: offer.netSum,
      vatPercent: offer.vatPercent,
      vatAmount: offer.vatAmount,
      grossSum: offer.grossSum,
      notes: offer.notes,
    });

    this.db.run(
      `UPDATE offers SET
        version = ?,
        status = ?,
        valid_until = ?,
        encrypted_data = ?,
        updated_at = ?,
        updated_by = ?,
        pdf_path = ?
      WHERE id = ?`,
      [
        offer.version,
        offer.status,
        offer.validUntil ?? null,
        encryptedData,
        offer.updatedAt,
        offer.updatedBy ?? null,
        offer.pdfPath ?? null,
        offer.id,
      ]
    );
  }

  async getVersionHistory(offerId: UUID): Promise<OfferVersion[]> {
    const rows = this.db.query<OfferVersionRow>(
      'SELECT * FROM offer_versions WHERE offer_id = ? ORDER BY version ASC',
      [offerId]
    );
    return Promise.all(rows.map(row => this.rowToOfferVersion(row)));
  }

  async saveVersion(offerId: UUID, version: OfferVersion): Promise<void> {
    const encryptedData = this.crypto.serializeField<Omit<OfferVersion, 'version' | 'offerId' | 'createdAt' | 'createdBy'>>({
      status: version.status,
      items: version.items,
      sellerAddress: version.sellerAddress,
      customerAddress: version.customerAddress,
      netSum: version.netSum,
      vatPercent: version.vatPercent,
      vatAmount: version.vatAmount,
      grossSum: version.grossSum,
      notes: version.notes,
    });

    this.db.run(
      `INSERT INTO offer_versions (offer_id, version, encrypted_data, created_at, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [
        offerId,
        version.version,
        encryptedData,
        version.createdAt,
        version.createdBy ?? null,
      ]
    );
  }

  private async rowToOffer(row: OfferRow): Promise<Offer> {
    const decrypted = this.crypto.deserializeField<OfferEncryptedData>(row.encrypted_data);

    return {
      id: row.id as UUID,
      offerNumber: row.offer_number,
      version: row.version,
      customerId: row.customer_id as UUID,
      status: row.status as OfferStatus,
      date: row.date,
      validUntil: row.valid_until,
      inquirySource: row.inquiry_source,
      inquiryContact: row.inquiry_contact,
      sellerAddress: decrypted.sellerAddress,
      customerAddress: decrypted.customerAddress,
      items: decrypted.items,
      netSum: decrypted.netSum,
      vatPercent: decrypted.vatPercent,
      vatAmount: decrypted.vatAmount,
      grossSum: decrypted.grossSum,
      notes: decrypted.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      pdfPath: row.pdf_path,
    };
  }

  private async rowToOfferVersion(row: OfferVersionRow): Promise<OfferVersion> {
    const decrypted = this.crypto.deserializeField<Omit<OfferVersion, 'version' | 'offerId' | 'createdAt' | 'createdBy'>>(row.encrypted_data);

    return {
      offerId: row.offer_id as UUID,
      version: row.version,
      status: decrypted.status,
      items: decrypted.items,
      sellerAddress: decrypted.sellerAddress,
      customerAddress: decrypted.customerAddress,
      netSum: decrypted.netSum,
      vatPercent: decrypted.vatPercent,
      vatAmount: decrypted.vatAmount,
      grossSum: decrypted.grossSum,
      notes: decrypted.notes,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }
}
