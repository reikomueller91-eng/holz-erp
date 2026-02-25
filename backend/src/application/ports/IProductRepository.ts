import type { Product, PriceHistory } from '../../domain/product/Product';
import type { UUID, WoodType, QualityGrade } from '../../shared/types';

export interface ProductListOptions {
  limit?: number;
  offset?: number;
  isActive?: boolean;
  woodType?: WoodType;
  qualityGrade?: QualityGrade;
}

/**
 * Port: IProductRepository
 * Defines the contract for product persistence.
 * Implemented by: infrastructure/repositories/ProductRepository
 */
export interface IProductRepository {
  findById(id: UUID): Promise<Product | null>;
  findAll(options?: ProductListOptions): Promise<Product[]>;
  save(product: Product): Promise<void>;
  update(product: Product): Promise<void>;
  delete(id: UUID): Promise<void>;

  // Price history
  getPriceHistory(productId: UUID): Promise<PriceHistory[]>;
  addPriceHistory(entry: PriceHistory): Promise<void>;
}
