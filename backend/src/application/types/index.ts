import type { UUID, ISODateTime } from '../../shared/types';

// Pricing Types
export interface PriceSuggestion {
  suggestedPrice: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  historicalData?: {
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    sampleSize: number;
  };
}

export interface PriceCalculationResult {
  areaM2: number;
  basePricePerM2: number;
  adjustedPricePerM2: number;
  finalPricePerM2: number;
  pricePerPiece: number;
  totalPrice: number;
  qualityGrade: string;
  quantityDiscount: number;
}

export interface HistoricalPriceEntry {
  orderId: UUID;
  orderNumber: string;
  orderDate: ISODateTime;
  customerId: UUID;
  pricePerM2: number;
  quantity: number;
  quality: string;
}
