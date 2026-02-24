import type { IProductRepository, ProductListOptions } from '../ports/IProductRepository';
import type { Product, PriceHistory } from '../../domain/product/Product';
import type { UUID, PaginatedResult, WoodType, QualityGrade } from '../../shared/types';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { newUUID, nowISO } from '../../shared/utils/id';

export interface CreateProductInput {
  name: string;
  woodType: WoodType;
  qualityGrade: QualityGrade;
  heightMm: number;
  widthMm: number;
  description?: string;
  initialPricePerM2?: number;
  priceReason?: string;
}

export interface UpdateProductInput {
  name?: string;
  woodType?: WoodType;
  qualityGrade?: QualityGrade;
  heightMm?: number;
  widthMm?: number;
  description?: string;
  isActive?: boolean;
}

export interface SetPriceInput {
  pricePerM2: number;
  effectiveFrom?: string;
  reason?: string;
}

/**
 * ProductService – orchestrates product use cases.
 */
export class ProductService {
  constructor(private readonly repo: IProductRepository) {}

  getById(id: UUID): Product {
    const product = this.repo.findById(id);
    if (!product) throw new NotFoundError('Product', id);
    return product;
  }

  list(options?: ProductListOptions): PaginatedResult<Product> {
    return this.repo.findAll(options);
  }

  create(input: CreateProductInput): Product {
    if (!input.name?.trim()) {
      throw new ValidationError('Product name is required');
    }
    if (input.heightMm <= 0 || input.widthMm <= 0) {
      throw new ValidationError('Dimensions must be positive');
    }

    const now = nowISO();
    const product: Product = {
      id: newUUID(),
      name: input.name.trim(),
      woodType: input.woodType,
      qualityGrade: input.qualityGrade,
      dimensions: { heightMm: input.heightMm, widthMm: input.widthMm },
      ...(input.description !== undefined ? { description: input.description } : {}),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const saved = this.repo.create(product);

    // Optionally create initial price entry
    if (input.initialPricePerM2 !== undefined) {
      this.repo.addPriceEntry({
        id: newUUID(),
        productId: saved.id,
        pricePerM2: input.initialPricePerM2,
        effectiveFrom: now,
        createdAt: now,
        ...(input.priceReason !== undefined ? { reason: input.priceReason } : {}),
      });
    }

    return saved;
  }

  update(id: UUID, input: UpdateProductInput): Product {
    this.getById(id);

    if (input.name !== undefined && !input.name.trim()) {
      throw new ValidationError('Product name cannot be empty');
    }
    if (input.heightMm !== undefined && input.heightMm <= 0) {
      throw new ValidationError('Height must be positive');
    }
    if (input.widthMm !== undefined && input.widthMm <= 0) {
      throw new ValidationError('Width must be positive');
    }

    const existing = this.getById(id);
    const updates: Partial<Omit<Product, 'id' | 'createdAt'>> = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.woodType !== undefined ? { woodType: input.woodType } : {}),
      ...(input.qualityGrade !== undefined ? { qualityGrade: input.qualityGrade } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      dimensions: {
        heightMm: input.heightMm ?? existing.dimensions.heightMm,
        widthMm: input.widthMm ?? existing.dimensions.widthMm,
      },
      ...(input.description !== undefined ? { description: input.description } : {}),
    };

    return this.repo.update(id, updates);
  }

  delete(id: UUID): void {
    this.repo.softDelete(id);
  }

  getCurrentPrice(productId: UUID): PriceHistory | undefined {
    return this.repo.getCurrentPrice(productId);
  }

  getPriceHistory(productId: UUID): PriceHistory[] {
    return this.repo.getPriceHistory(productId);
  }

  setPrice(productId: UUID, input: SetPriceInput): PriceHistory {
    this.getById(productId);

    if (input.pricePerM2 <= 0) {
      throw new ValidationError('Price per m² must be positive');
    }

    const now = nowISO();
    const entry: PriceHistory = {
      id: newUUID(),
      productId,
      pricePerM2: input.pricePerM2,
      effectiveFrom: (input.effectiveFrom as PriceHistory['effectiveFrom']) ?? now,
      createdAt: now,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    };

    return this.repo.addPriceEntry(entry);
  }
}
