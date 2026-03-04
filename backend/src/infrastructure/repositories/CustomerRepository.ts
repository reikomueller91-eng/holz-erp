import type { ICustomerRepository, CustomerListOptions } from '../../application/ports/ICustomerRepository';
import type { ICryptoService } from '../../application/ports/ICryptoService';
import type { IDatabase } from '../../application/ports/IDatabase';
import type { Customer, CustomerRow, CustomerEncryptedPayload } from '../../domain/customer/Customer';
import type { UUID, PaginatedResult } from '../../shared/types';
import { NotFoundError } from '../../shared/errors';
import { nowISO } from '../../shared/utils/id';

/**
 * SQLite implementation of ICustomerRepository.
 *
 * Encryption strategy:
 *   All customer sensitive data (name, contactInfo, notes, source,
 *   kleinanzeigenId) is packed into a JSON payload and encrypted as
 *   a single `encrypted_data` TEXT column using AES-256-GCM via CryptoService.
 *
 *   Only non-sensitive fields (id, is_active, created_at, updated_at)
 *   are stored in plaintext — sufficient to list/filter without decryption.
 */
export class CustomerRepository implements ICustomerRepository {
  constructor(
    private readonly db: IDatabase,
    private readonly crypto: ICryptoService,
  ) { }

  // ─── Read ──────────────────────────────────────────────────────

  findById(id: UUID): Customer | undefined {
    const row = this.db.queryOne<CustomerRow>(
      'SELECT * FROM customers WHERE id = ?',
      [id],
    );
    if (!row) return undefined;
    return this.rowToCustomer(row);
  }

  findAll(options: CustomerListOptions = {}): PaginatedResult<Customer> {
    const {
      page = 1,
      pageSize = 50,
      includeInactive = false,
    } = options;

    const offset = (page - 1) * pageSize;
    const whereClause = includeInactive ? '' : 'WHERE is_active = 1';

    const total = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM customers ${whereClause}`,
    )?.count ?? 0;

    const rows = this.db.query<CustomerRow>(
      `SELECT * FROM customers ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset],
    );

    return {
      data: rows.map((r) => this.rowToCustomer(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  count(includeInactive = false): number {
    const where = includeInactive ? '' : 'WHERE is_active = 1';
    return this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM customers ${where}`,
    )?.count ?? 0;
  }

  // ─── Write ─────────────────────────────────────────────────────

  create(customer: Customer): Customer {
    const payload: CustomerEncryptedPayload = {
      name: customer.name,
      contactInfo: customer.contactInfo,
      notes: customer.notes,
      source: customer.source,
      ...(customer.kleinanzeigenId !== undefined
        ? { kleinanzeigenId: customer.kleinanzeigenId }
        : {}),
      ...(customer.rating !== undefined
        ? { rating: customer.rating }
        : {}),
    };

    const encryptedData = this.crypto.serializeField(payload);

    this.db.run(
      `INSERT INTO customers (id, encrypted_data, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        customer.id,
        encryptedData,
        customer.isActive ? 1 : 0,
        customer.createdAt,
        customer.updatedAt,
      ],
    );

    return customer;
  }

  update(
    id: UUID,
    updates: Partial<Omit<Customer, 'id' | 'createdAt'>>,
  ): Customer {
    const existing = this.findById(id);
    if (!existing) throw new NotFoundError('Customer', id);

    const merged: Customer = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: nowISO(),
    };

    const payload: CustomerEncryptedPayload = {
      name: merged.name,
      contactInfo: merged.contactInfo,
      notes: merged.notes,
      source: merged.source,
      ...(merged.kleinanzeigenId !== undefined
        ? { kleinanzeigenId: merged.kleinanzeigenId }
        : {}),
      ...(merged.rating !== undefined
        ? { rating: merged.rating }
        : {}),
    };

    const encryptedData = this.crypto.serializeField(payload);

    this.db.run(
      `UPDATE customers
       SET encrypted_data = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [encryptedData, merged.isActive ? 1 : 0, merged.updatedAt, id],
    );

    return merged;
  }

  softDelete(id: UUID): void {
    const existing = this.findById(id);
    if (!existing) throw new NotFoundError('Customer', id);

    this.db.run(
      'UPDATE customers SET is_active = 0, updated_at = ? WHERE id = ?',
      [nowISO(), id],
    );
  }

  // ─── Private helpers ───────────────────────────────────────────

  private rowToCustomer(row: CustomerRow): Customer {
    let payload = this.crypto.deserializeField<any>(row.encrypted_data);

    // Fallback migration for existing customers that were double-encrypted
    if (!payload.name && payload.iv && payload.tag && payload.data) {
      payload = this.crypto.decryptJson<any>(payload);
    }

    return {
      id: row.id,
      name: payload.name,
      contactInfo: payload.contactInfo,
      notes: payload.notes,
      source: payload.source,
      ...(payload.kleinanzeigenId !== undefined
        ? { kleinanzeigenId: payload.kleinanzeigenId }
        : {}),
      ...(payload.rating !== undefined
        ? { rating: payload.rating }
        : {}),
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

