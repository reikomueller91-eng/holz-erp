import type { IProductRepository, ProductListOptions } from '../../application/ports/IProductRepository';
import type { IDatabase } from '../../application/ports/IDatabase';
import type { ICryptoService } from '../../application/ports/ICryptoService';
import type { Product, PriceHistory } from '../../domain/product/Product';
import type { UUID, ISODateTime, WoodType, QualityGrade } from '../../shared/types';

interface ProductRow {
  id: string;
  name: string; // Plaintext for indexing
  wood_type: string;
  quality_grade: string;
  height_mm: number;
  width_mm: number;
  calc_method: string;
  volume_divider: number | null;
  description: string | null;
  encrypted_data: string;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
}

interface ProductEncryptedData {
  name: string;
  description?: string;
}

export class ProductRepository implements IProductRepository {
  constructor(
    private db: IDatabase,
    private crypto: ICryptoService
  ) { }

  async findAll(options?: ProductListOptions): Promise<Product[]> {
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params: unknown[] = [];

    if (options?.isActive !== undefined) {
      sql += ' AND is_active = ?';
      params.push(options.isActive ? 1 : 0);
    }

    if (options?.woodType) {
      sql += ' AND wood_type = ?';
      params.push(options.woodType);
    }

    if (options?.qualityGrade) {
      sql += ' AND quality_grade = ?';
      params.push(options.qualityGrade);
    }

    sql += ' ORDER BY created_at DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const rows = this.db.query<ProductRow>(sql, params);
    return Promise.all(rows.map(row => this.rowToProduct(row)));
  }

  async findById(id: UUID): Promise<Product | null> {
    const row = this.db.queryOne<ProductRow>('SELECT * FROM products WHERE id = ?', [id]);
    return row ? this.rowToProduct(row) : null;
  }

  async save(product: Product): Promise<void> {
    const encryptedData = this.crypto.serializeField<ProductEncryptedData>({
      name: product.name,
      description: product.description,
    });

    this.db.run(
      `INSERT INTO products (
        id, name, wood_type, quality_grade, height_mm, width_mm,
        calc_method, volume_divider, description,
        encrypted_data, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.id,
        product.name, // Plaintext for indexing
        product.woodType,
        product.qualityGrade,
        product.dimensions.heightMm,
        product.dimensions.widthMm,
        product.calcMethod,
        product.volumeDivider ?? null,
        product.description ?? null, // Plaintext (deprecated, will be removed)
        encryptedData,
        product.isActive ? 1 : 0,
        product.createdAt,
        product.updatedAt,
      ]
    );
  }

  async update(product: Product): Promise<void> {
    const encryptedData = this.crypto.serializeField<ProductEncryptedData>({
      name: product.name,
      description: product.description,
    });

    this.db.run(
      `UPDATE products SET
        name = ?,
        wood_type = ?,
        quality_grade = ?,
        height_mm = ?,
        width_mm = ?,
        calc_method = ?,
        volume_divider = ?,
        description = ?,
        encrypted_data = ?,
        is_active = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        product.name, // Plaintext for indexing
        product.woodType,
        product.qualityGrade,
        product.dimensions.heightMm,
        product.dimensions.widthMm,
        product.calcMethod,
        product.volumeDivider ?? null,
        product.description ?? null, // Plaintext (deprecated)
        encryptedData,
        product.isActive ? 1 : 0,
        product.updatedAt,
        product.id,
      ]
    );
  }

  async delete(id: UUID): Promise<void> {
    this.db.run('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
  }

  async getPriceHistory(productId: UUID): Promise<PriceHistory[]> {
    const rows = this.db.query<{
      id: string;
      product_id: string;
      price_per_m2: number;
      effective_from: string;
      effective_to: string | null;
      reason: string | null;
      created_at: string;
    }>(
      `SELECT * FROM price_history 
       WHERE product_id = ? 
       ORDER BY effective_from DESC`,
      [productId]
    );

    return rows.map(row => ({
      id: row.id as UUID,
      productId: row.product_id as UUID,
      pricePerM2: row.price_per_m2,
      effectiveFrom: row.effective_from as ISODateTime,
      effectiveTo: row.effective_to as ISODateTime | undefined,
      reason: row.reason ?? undefined,
      createdAt: row.created_at as ISODateTime,
    }));
  }

  async addPriceHistory(history: PriceHistory): Promise<void> {
    this.db.run(
      `INSERT INTO price_history (
        id, product_id, price_per_m2, effective_from, effective_to, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        history.id,
        history.productId,
        history.pricePerM2,
        history.effectiveFrom,
        history.effectiveTo ?? null,
        history.reason ?? null,
        history.createdAt,
      ]
    );
  }

  private async rowToProduct(row: ProductRow): Promise<Product> {
    const decrypted = this.crypto.deserializeField<ProductEncryptedData>(row.encrypted_data);

    return {
      id: row.id as UUID,
      name: decrypted.name,
      woodType: row.wood_type as WoodType,
      qualityGrade: row.quality_grade as QualityGrade,
      dimensions: {
        heightMm: row.height_mm,
        widthMm: row.width_mm,
      },
      calcMethod: row.calc_method as any,
      ...(row.volume_divider !== null ? { volumeDivider: row.volume_divider } : {}),
      description: decrypted.description,
      isActive: row.is_active === 1,
      createdAt: row.created_at as ISODateTime,
      updatedAt: row.updated_at as ISODateTime,
    };
  }
}
