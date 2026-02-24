import type { IProductRepository, ProductListOptions } from '../../application/ports/IProductRepository';
import type { ICryptoService } from '../../application/ports/ICryptoService';
import type { IDatabase } from '../../application/ports/IDatabase';
import type { Product, ProductRow, PriceHistory } from '../../domain/product/Product';
import { rowToProduct } from '../../domain/product/Product';
import type { UUID, ISODateTime, PaginatedResult } from '../../shared/types';
import { NotFoundError } from '../../shared/errors';
import { nowISO } from '../../shared/utils/id';

/** Encrypted payload for name + description. */
interface ProductEncryptedPayload {
  name: string;
  description?: string;
}

interface PriceHistoryRow {
  id: UUID;
  product_id: UUID;
  price_per_m2: number;
  effective_from: string;
  effective_to: string | null;
  reason: string | null;
  created_at: string;
}

/**
 * SQLite implementation of IProductRepository.
 *
 * Encryption strategy:
 *   Product name and description are sensitive business data and are
 *   encrypted as a JSON payload in the `encrypted_data` TEXT column
 *   using AES-256-GCM via CryptoService.
 *
 *   Non-sensitive, searchable fields (wood_type, quality_grade,
 *   height_mm, width_mm) remain in plaintext for DB-level filtering.
 */
export class ProductRepository implements IProductRepository {
  constructor(
    private readonly db: IDatabase,
    private readonly crypto: ICryptoService,
  ) {}

  // ─── Read ──────────────────────────────────────────────────────

  findById(id: UUID): Product | undefined {
    const row = this.db.queryOne<ProductRow & { encrypted_data: string | null }>(
      'SELECT * FROM products WHERE id = ?',
      [id],
    );
    if (!row) return undefined;
    return this.rowToDecryptedProduct(row);
  }

  findAll(options: ProductListOptions = {}): PaginatedResult<Product> {
    const {
      page = 1,
      pageSize = 50,
      includeInactive = false,
      woodType,
      qualityGrade,
    } = options;

    const offset = (page - 1) * pageSize;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!includeInactive) {
      conditions.push('is_active = 1');
    }
    if (woodType) {
      conditions.push('wood_type = ?');
      params.push(woodType);
    }
    if (qualityGrade) {
      conditions.push('quality_grade = ?');
      params.push(qualityGrade);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const total = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM products ${whereClause}`,
      params,
    )?.count ?? 0;

    const rows = this.db.query<ProductRow & { encrypted_data: string | null }>(
      `SELECT * FROM products ${whereClause}
       ORDER BY name ASC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return {
      data: rows.map((r) => this.rowToDecryptedProduct(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ─── Write ─────────────────────────────────────────────────────

  create(product: Product): Product {
    const encryptedData = this.encryptProductData({
      name: product.name,
      ...(product.description !== undefined
        ? { description: product.description }
        : {}),
    });

    this.db.run(
      `INSERT INTO products
         (id, name, wood_type, quality_grade, height_mm, width_mm,
          description, encrypted_data, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.id,
        product.name,            // kept plain for logging/indexing
        product.woodType,
        product.qualityGrade,
        product.dimensions.heightMm,
        product.dimensions.widthMm,
        product.description ?? null,
        encryptedData,
        product.isActive ? 1 : 0,
        product.createdAt,
        product.updatedAt,
      ],
    );

    return product;
  }

  update(
    id: UUID,
    updates: Partial<Omit<Product, 'id' | 'createdAt'>>,
  ): Product {
    const existing = this.findById(id);
    if (!existing) throw new NotFoundError('Product', id);

    const merged: Product = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: nowISO(),
    };

    const encryptedData = this.encryptProductData({
      name: merged.name,
      ...(merged.description !== undefined
        ? { description: merged.description }
        : {}),
    });

    this.db.run(
      `UPDATE products
       SET name = ?, wood_type = ?, quality_grade = ?,
           height_mm = ?, width_mm = ?, description = ?,
           encrypted_data = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [
        merged.name,
        merged.woodType,
        merged.qualityGrade,
        merged.dimensions.heightMm,
        merged.dimensions.widthMm,
        merged.description ?? null,
        encryptedData,
        merged.isActive ? 1 : 0,
        merged.updatedAt,
        id,
      ],
    );

    return merged;
  }

  softDelete(id: UUID): void {
    const existing = this.findById(id);
    if (!existing) throw new NotFoundError('Product', id);

    this.db.run(
      'UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?',
      [nowISO(), id],
    );
  }

  // ─── Price History ─────────────────────────────────────────────

  getCurrentPrice(productId: UUID): PriceHistory | undefined {
    const row = this.db.queryOne<PriceHistoryRow>(
      `SELECT * FROM price_history
       WHERE product_id = ? AND (effective_to IS NULL OR effective_to > ?)
       ORDER BY effective_from DESC
       LIMIT 1`,
      [productId, nowISO()],
    );
    if (!row) return undefined;
    return this.rowToPriceHistory(row);
  }

  getPriceHistory(productId: UUID): PriceHistory[] {
    const rows = this.db.query<PriceHistoryRow>(
      `SELECT * FROM price_history
       WHERE product_id = ?
       ORDER BY effective_from DESC`,
      [productId],
    );
    return rows.map((r) => this.rowToPriceHistory(r));
  }

  addPriceEntry(entry: PriceHistory): PriceHistory {
    // Close the previous open price entry
    this.db.run(
      `UPDATE price_history
       SET effective_to = ?
       WHERE product_id = ? AND effective_to IS NULL`,
      [entry.effectiveFrom, entry.productId],
    );

    this.db.run(
      `INSERT INTO price_history
         (id, product_id, price_per_m2, effective_from, effective_to, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.productId,
        entry.pricePerM2,
        entry.effectiveFrom,
        entry.effectiveTo ?? null,
        entry.reason ?? null,
        entry.createdAt,
      ],
    );

    return entry;
  }

  // ─── Private helpers ───────────────────────────────────────────

  private encryptProductData(payload: ProductEncryptedPayload): string {
    return this.crypto.serializeField(this.crypto.encryptJson(payload));
  }

  private rowToDecryptedProduct(
    row: ProductRow & { encrypted_data: string | null },
  ): Product {
    const base = rowToProduct(row);

    if (row.encrypted_data) {
      try {
        const encryptedField = this.crypto.parseField(row.encrypted_data);
        const payload = this.crypto.decryptJson<ProductEncryptedPayload>(encryptedField);
        return {
          ...base,
          name: payload.name,
          ...(payload.description !== undefined
            ? { description: payload.description }
            : {}),
        };
      } catch {
        // Fallback to unencrypted row data if decryption fails
        // (e.g., data created before encryption was added)
        return base;
      }
    }

    return base;
  }

  private rowToPriceHistory(row: PriceHistoryRow): PriceHistory {
    // Build explicitly to satisfy exactOptionalPropertyTypes: true
    const entry: PriceHistory = {
      id: row.id as UUID,
      productId: row.product_id as UUID,
      pricePerM2: row.price_per_m2,
      effectiveFrom: row.effective_from as PriceHistory['effectiveFrom'],
      createdAt: row.created_at as PriceHistory['createdAt'],
    };
    if (row.effective_to !== null) {
      // PriceHistory['effectiveTo'] resolves to ISODateTime|undefined via indexed access,
      // so we cast directly to ISODateTime to satisfy exactOptionalPropertyTypes.
      entry.effectiveTo = row.effective_to as ISODateTime;
    }
    if (row.reason !== null) {
      entry.reason = row.reason;
    }
    return entry;
  }
}
