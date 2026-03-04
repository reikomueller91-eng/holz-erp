import type { UUID, ISODateTime, WoodType, QualityGrade } from '../../shared/types';

/**
 * Product entity.
 * Products are not encrypted — they are catalog data, not customer data.
 */

export type PriceCalculationMethod = 'm2_unsorted' | 'm2_sorted' | 'volume_divided';

export interface Dimensions {
  heightMm: number;
  widthMm: number;
}

export interface Product {
  id: UUID;
  name: string;
  woodType: WoodType;
  qualityGrade: QualityGrade;
  dimensions: Dimensions;
  calcMethod: PriceCalculationMethod;
  volumeDivider?: number;
  description?: string;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PriceHistory {
  id: UUID;
  productId: UUID;
  pricePerM2: number;
  effectiveFrom: ISODateTime;
  effectiveTo?: ISODateTime;
  reason?: string;
  createdAt: ISODateTime;
}

// ─── Area / Price Calculation ────────────────────────────────────

/**
 * Calculate area in m² for a piece.
 * Length must be provided in mm.
 */
export function calcAreaM2(dims: Dimensions, lengthMm: number): number {
  return (dims.widthMm / 1000) * (lengthMm / 1000);
}

/**
 * Calculate total price for a line item.
 */
export function calcLineItemPrice(
  dims: Dimensions,
  lengthMm: number,
  quantityPieces: number,
  unitPricePerM2: number,
): number {
  const areaPerPiece = calcAreaM2(dims, lengthMm);
  return areaPerPiece * quantityPieces * unitPricePerM2;
}

// ─── Product Row (DB representation) ────────────────────────────
export interface ProductRow {
  id: UUID;
  name: string;
  wood_type: WoodType;
  quality_grade: QualityGrade;
  height_mm: number;
  width_mm: number;
  calc_method: PriceCalculationMethod;
  volume_divider: number | null;
  description: string | null;
  is_active: 0 | 1;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    woodType: row.wood_type,
    qualityGrade: row.quality_grade,
    dimensions: { heightMm: row.height_mm, widthMm: row.width_mm },
    calcMethod: row.calc_method,
    ...(row.volume_divider !== null ? { volumeDivider: row.volume_divider } : {}),
    ...(row.description !== null ? { description: row.description } : {}),
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
