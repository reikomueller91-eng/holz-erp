/**
 * Pricing Engine — Phase 3
 *
 * Will implement:
 *  - Current price lookup (latest PriceHistory entry)
 *  - Historical price analysis per customer+product
 *  - Trend-based price suggestion (linear regression over last 6 months)
 *  - Confidence scoring based on data density
 */

import type { UUID } from '../../shared/types';

export interface PriceSuggestion {
  productId: UUID;
  suggestedPricePerM2: number;
  currentPricePerM2: number;
  historicalAvgPerM2: number;
  confidenceScore: number; // 0-1
  dataPoints: number;
  trend: 'rising' | 'falling' | 'stable';
}

// TODO: implement in Phase 3
export class PricingEngine {
  suggestPrice(_productId: UUID, _customerId?: UUID): Promise<PriceSuggestion> {
    throw new Error('PricingEngine not yet implemented (Phase 3)');
  }
}
