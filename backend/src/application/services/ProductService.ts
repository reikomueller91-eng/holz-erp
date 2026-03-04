import type { IProductRepository } from '../ports/IProductRepository';
import type { Product, PriceHistory } from '../../domain/product/Product';
import type { UUID, ISODateTime } from '../../shared/types';
import { generateId } from '../../shared/utils/id';
import { NotFoundError } from '../../shared/errors';

export class ProductService {
  constructor(private productRepo: IProductRepository) { }

  async getById(id: UUID): Promise<Product> {
    const product = await this.productRepo.findById(id);
    if (!product) {
      throw new NotFoundError('Product', id);
    }
    return product;
  }

  async list(options?: { limit?: number; offset?: number }): Promise<Product[]> {
    return this.productRepo.findAll(options);
  }

  async create(data: {
    name: string;
    woodType: string;
    qualityGrade: string;
    heightMm: number;
    widthMm: number;
    calcMethod?: string;
    volumeDivider?: number;
    description?: string;
  }): Promise<Product> {
    const product: Product = {
      id: generateId() as UUID,
      name: data.name,
      woodType: data.woodType as any,
      qualityGrade: data.qualityGrade as any,
      calcMethod: (data.calcMethod as any) || 'm2_sorted',
      volumeDivider: data.volumeDivider,
      dimensions: {
        heightMm: data.heightMm,
        widthMm: data.widthMm,
      },
      description: data.description,
      isActive: true,
      createdAt: new Date().toISOString() as ISODateTime,
      updatedAt: new Date().toISOString() as ISODateTime,
    };

    await this.productRepo.save(product);

    // Add initial price history entry if provided
    return product;
  }

  async update(id: UUID, updates: Partial<Product>): Promise<Product> {
    const product = await this.getById(id);

    const updated: Product = {
      ...product,
      ...updates,
      id: product.id, // Ensure ID doesn't change
      createdAt: product.createdAt, // Ensure createdAt doesn't change
      updatedAt: new Date().toISOString() as ISODateTime,
    };

    await this.productRepo.update(updated);
    return updated;
  }

  async delete(id: UUID): Promise<void> {
    await this.productRepo.delete(id);
  }

  async getPriceHistory(productId: UUID): Promise<PriceHistory[]> {
    return this.productRepo.getPriceHistory(productId);
  }

  async addPrice(data: {
    productId: UUID;
    pricePerM2: number;
    effectiveFrom: ISODateTime;
    reason?: string;
  }): Promise<PriceHistory> {
    const entry: PriceHistory = {
      id: generateId() as UUID,
      productId: data.productId,
      pricePerM2: data.pricePerM2,
      effectiveFrom: data.effectiveFrom,
      reason: data.reason,
      createdAt: new Date().toISOString() as ISODateTime,
    };

    await this.productRepo.addPriceHistory(entry);
    return entry;
  }
}
