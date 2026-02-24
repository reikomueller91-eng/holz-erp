import { Offer, OfferData, OfferVersion, OfferStatus } from '../../domain/models/Offer';
import { IDatabase } from '../../application/ports/IDatabase';
import { ICryptoService } from '../../application/ports/ICryptoService';
import { EncryptedField } from '../../shared/types';

export interface IOfferRepository {
  findAll(options?: { status?: OfferStatus; customerId?: string; limit?: number; offset?: number }): Promise<Offer[]>;
  findById(id: string): Promise<Offer | null>;
  findByOfferNumber(offerNumber: string): Promise<Offer | null>;
  findByCustomer(customerId: string): Promise<Offer[]>;
  save(offer: Offer): Promise<void>;
  update(offer: Offer): Promise<void>;
  getVersionHistory(offerId: string): Promise<OfferVersion[]>;
  saveVersion(offerId: string, version: OfferVersion): Promise<void>;
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
}

interface OfferEncryptedData {
  sellerAddress: string;
  customerAddress: string;
  items: Array<{
    id: string;
    productId: string;
    heightMm: number;
    widthMm: number;
    lengthMm: number;
    quantity: number;
    quality: string;
    pricePerM2: number;
    netTotal: number;
  }>;
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
  changes: string;
}

export class OfferRepository implements IOfferRepository {
  constructor(
    private db: IDatabase,
    private crypto: ICryptoService
  ) {}

  async findAll(options: { status?: OfferStatus; customerId?: string; limit?: number; offset?: number } = {}): Promise<Offer[]> {
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

    const rows = await this.db.query<OfferRow>(sql, params);
    return Promise.all(rows.map(row => this.rowToOffer(row)));
  }

  async findById(id: string): Promise<Offer | null> {
    const row = await this.db.queryOne<OfferRow>(
      'SELECT * FROM offers WHERE id = ?',
      [id]
    );
    if (!row) return null;

    const versions = await this.getVersionHistory(id);
    return this.rowToOffer(row, versions);
  }

  async findByOfferNumber(offerNumber: string): Promise<Offer | null> {
    const row = await this.db.queryOne<OfferRow>(
      'SELECT * FROM offers WHERE offer_number = ?',
      [offerNumber]
    );
    if (!row) return null;

    const versions = await this.getVersionHistory(row.id);
    return this.rowToOffer(row, versions);
  }

  async findByCustomer(customerId: string): Promise<Offer[]> {
    const rows = await this.db.query<OfferRow>(
      'SELECT * FROM offers WHERE customer_id = ? ORDER BY created_at DESC',
      [customerId]
    );
    return Promise.all(rows.map(row => this.rowToOffer(row)));
  }

  async save(offer: Offer): Promise<void> {
    const props = offer.toJSON();
    const payload = this.offerToEncryptedData(props);
    const encrypted: EncryptedField = this.crypto.encryptJson(payload);
    const encryptedData: string = this.crypto.serializeField(encrypted);

    await this.db.run(
      `INSERT INTO offers (id, offer_number, version, status, date, valid_until, inquiry_source, inquiry_contact, customer_id, encrypted_data, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        props.id,
        props.offerNumber,
        props.version,
        props.status,
        props.date.toISOString(),
        props.validUntil?.toISOString() || null,
        props.inquirySource,
        props.inquiryContact || null,
        props.customerId,
        encryptedData,
        props.createdAt.toISOString(),
        props.updatedAt.toISOString(),
        props.createdBy || null,
        props.updatedBy || null
      ]
    );

    await this.saveVersion(props.id, {
      version: props.version,
      data: props,
      createdAt: new Date(),
      createdBy: props.createdBy,
      changes: ['Initial version']
    });
  }

  async update(offer: Offer): Promise<void> {
    const props = offer.toJSON();
    const payload = this.offerToEncryptedData(props);
    const encrypted: EncryptedField = this.crypto.encryptJson(payload);
    const encryptedData: string = this.crypto.serializeField(encrypted);

    await this.db.run(
      `UPDATE offers 
       SET version = ?, status = ?, date = ?, valid_until = ?, inquiry_source = ?, inquiry_contact = ?, customer_id = ?, encrypted_data = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`,
      [
        props.version,
        props.status,
        props.date.toISOString(),
        props.validUntil?.toISOString() || null,
        props.inquirySource,
        props.inquiryContact || null,
        props.customerId,
        encryptedData,
        props.updatedAt.toISOString(),
        props.updatedBy || null,
        props.id
      ]
    );

    const versions = offer.getVersionHistory();
    if (versions.length > 0) {
      const latestVersion = versions[versions.length - 1];
      await this.saveVersion(props.id, latestVersion);
    }
  }

  async getVersionHistory(offerId: string): Promise<OfferVersion[]> {
    const rows = await this.db.query<OfferVersionRow>(
      'SELECT * FROM offer_versions WHERE offer_id = ? ORDER BY version ASC',
      [offerId]
    );

    return rows.map(row => {
      const field: EncryptedField = this.crypto.parseField(row.encrypted_data);
      return {
        version: row.version,
        data: this.crypto.decryptJson(field),
        createdAt: new Date(row.created_at),
        createdBy: row.created_by,
        changes: JSON.parse(row.changes)
      };
    });
  }

  async saveVersion(offerId: string, version: OfferVersion): Promise<void> {
    const encrypted: EncryptedField = this.crypto.encryptJson(version.data);
    const encryptedData: string = this.crypto.serializeField(encrypted);

    await this.db.run(
      `INSERT OR REPLACE INTO offer_versions (offer_id, version, encrypted_data, created_at, created_by, changes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        offerId,
        version.version,
        encryptedData,
        version.createdAt.toISOString(),
        version.createdBy || null,
        JSON.stringify(version.changes)
      ]
    );
  }

  private rowToOffer(row: OfferRow, versions: OfferVersion[] = []): Offer {
    const field: EncryptedField = this.crypto.parseField(row.encrypted_data);
    const data = this.crypto.decryptJson<OfferEncryptedData>(field);

    return new Offer({
      id: row.id,
      offerNumber: row.offer_number,
      version: row.version,
      status: row.status as OfferData['status'],
      date: new Date(row.date),
      validUntil: row.valid_until ? new Date(row.valid_until) : undefined,
      inquirySource: row.inquiry_source,
      inquiryContact: row.inquiry_contact,
      customerId: row.customer_id,
      sellerAddress: data.sellerAddress,
      customerAddress: data.customerAddress,
      items: data.items,
      netSum: data.netSum,
      vatPercent: data.vatPercent,
      vatAmount: data.vatAmount,
      grossSum: data.grossSum,
      notes: data.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by,
      updatedBy: row.updated_by
    }, versions);
  }

  private offerToEncryptedData(props: OfferData): OfferEncryptedData {
    return {
      sellerAddress: props.sellerAddress,
      customerAddress: props.customerAddress,
      items: props.items,
      netSum: props.netSum,
      vatPercent: props.vatPercent,
      vatAmount: props.vatAmount,
      grossSum: props.grossSum,
      notes: props.notes
    };
  }
}

export const createOfferRepository = (
  db: IDatabase,
  crypto: ICryptoService
): IOfferRepository => {
  return new OfferRepository(db, crypto);
};
