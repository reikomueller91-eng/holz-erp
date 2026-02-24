import type { Product, PriceHistory } from '../../domain/product/Product';
import type { UUID, PaginatedResult, WoodType, QualityGrade } from '../../shared/types';

export interface ProductListOptions {
  page?: number;
  pageSize?: number;
  includeInactive?: boolean;
  woodType?: WoodType;
  qualityGrade?: QualityGrade;
}

/**
 * Port: IProductRepository
 * Defines the contract for product persistence.
 * Implemented by: infrastructure/repositories/ProductRepository
 */
export interface IProductRepository {
  findById(id: UUID): Product | undefined;
  findAll(options?: ProductListOptions): PaginatedResult<Product>;
  create(product: Product): Product;
  update(id: UUID, updates: Partial<Omit<Product, 'id' | 'createdAt'>>): Product;
  softDelete(id: UUID): void;

  // Price history
  getCurrentPrice(productId: UUID): PriceHistory | undefined;
  getPriceHistory(productId: UUID): PriceHistory[];
  addPriceEntry(entry: PriceHistory): PriceHistory;
}
