import type { IOrderRepository } from '../../infrastructure/repositories/OrderRepository';
import type { Product } from '../../domain/product/Product';
import type { PriceSuggestion, PriceCalculationResult, HistoricalPriceEntry } from '../types';
import type { UUID } from '../../shared/types';

export interface IPricingService {
  calculatePrice(
    heightMm: number,
    widthMm: number,
    lengthMm: number,
    quantity: number,
    basePricePerM2: number,
    qualityOverride?: string
  ): PriceCalculationResult;
  
  calculatePriceForProduct(
    product: Product,
    lengthMm: number,
    quantity: number,
    basePricePerM2: number,
    qualityOverride?: string
  ): PriceCalculationResult;
  
  getPriceHistory(productId: UUID, customerId?: UUID): Promise<HistoricalPriceEntry[]>;
  
  suggestPrice(productId: UUID, basePrice: number, customerId?: UUID): Promise<PriceSuggestion>;
  
  applyQuantityDiscount(basePrice: number, quantity: number, discounts: QuantityDiscount[]): number;
}

export interface QuantityDiscount {
  minQuantity: number;
  discountPercent: number;
}

export interface PricingConfig {
  defaultDivisor: number;
  quantityDiscounts: QuantityDiscount[];
  minPricePerM2: number;
}

export class PricingService implements IPricingService {
  private pricingConfig: PricingConfig;
  
  constructor(
    private orderRepo: IOrderRepository,
    config?: Partial<PricingConfig>
  ) {
    this.pricingConfig = {
      defaultDivisor: 1000000, // mm² → m²
      quantityDiscounts: [
        { minQuantity: 10, discountPercent: 5 },
        { minQuantity: 50, discountPercent: 10 },
        { minQuantity: 100, discountPercent: 15 }
      ],
      minPricePerM2: 50, // cents
      ...config
    };
  }

  calculatePrice(
    heightMm: number,
    widthMm: number,
    lengthMm: number,
    quantity: number,
    basePricePerM2: number,
    qualityOverride?: string
  ): PriceCalculationResult {
    // Area calculation: (height × width) / divisor × length × quantity
    const areaM2 = (heightMm * widthMm / this.pricingConfig.defaultDivisor) * (lengthMm / 1000);
    
    // Quality adjustment
    const qualityFactor = this.getQualityFactor(qualityOverride || 'A');
    const adjustedPrice = Math.round(basePricePerM2 * qualityFactor);
    
    // Quantity discount
    const discountedPrice = this.applyQuantityDiscount(adjustedPrice, quantity, this.pricingConfig.quantityDiscounts);
    
    // Total calculation
    const pricePerPiece = Math.round(areaM2 * discountedPrice);
    const totalPrice = pricePerPiece * quantity;
    
    return {
      areaM2,
      basePricePerM2,
      adjustedPricePerM2: adjustedPrice,
      finalPricePerM2: discountedPrice,
      pricePerPiece,
      totalPrice,
      qualityGrade: qualityOverride || 'A',
      quantityDiscount: adjustedPrice - discountedPrice,
    };
  }

  calculatePriceForProduct(
    product: Product,
    lengthMm: number,
    quantity: number,
    basePricePerM2: number,
    qualityOverride?: string
  ): PriceCalculationResult {
    return this.calculatePrice(
      product.dimensions.heightMm,
      product.dimensions.widthMm,
      lengthMm,
      quantity,
      basePricePerM2,
      qualityOverride || product.qualityGrade
    );
  }

  async getPriceHistory(productId: UUID, customerId?: UUID): Promise<HistoricalPriceEntry[]> {
    let orders = await this.orderRepo.findByProduct(productId);
    
    if (customerId) {
      orders = orders.filter(o => o.customerId === customerId);
    }

    const history: HistoricalPriceEntry[] = [];

    for (const order of orders) {
      for (const item of order.items) {
        if (item.productId === productId) {
          history.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderDate: order.createdAt,
            customerId: order.customerId,
            pricePerM2: item.pricePerM2,
            quantity: item.quantity,
            quality: item.quality,
          });
        }
      }
    }

    // Sort by date descending
    return history.sort((a, b) => 
      new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()
    );
  }

  async suggestPrice(productId: UUID, basePrice: number, customerId?: UUID): Promise<PriceSuggestion> {
    const history = await this.getPriceHistory(productId, customerId);

    if (history.length === 0) {
      return {
        suggestedPrice: basePrice,
        confidence: 'low',
        reasoning: 'No historical data available',
      };
    }

    // Calculate average of last 5 orders
    const recentHistory = history.slice(0, 5);
    const avgPrice = recentHistory.reduce((sum, h) => sum + h.pricePerM2, 0) / recentHistory.length;
    
    // Calculate variance
    const variance = recentHistory.reduce((sum, h) => sum + Math.pow(h.pricePerM2 - avgPrice, 2), 0) / recentHistory.length;
    const stdDev = Math.sqrt(variance);
    
    // Determine confidence based on variance
    const coefficientOfVariation = stdDev / avgPrice;
    const confidence: 'low' | 'medium' | 'high' = 
      coefficientOfVariation > 0.2 ? 'low' :
      coefficientOfVariation > 0.1 ? 'medium' :
      'high';

    return {
      suggestedPrice: Math.round(avgPrice),
      confidence,
      reasoning: `Based on ${recentHistory.length} recent orders. Avg: ${Math.round(avgPrice)}¢/m², StdDev: ${Math.round(stdDev)}¢`,
      historicalData: {
        avgPrice: Math.round(avgPrice),
        minPrice: Math.min(...recentHistory.map(h => h.pricePerM2)),
        maxPrice: Math.max(...recentHistory.map(h => h.pricePerM2)),
        sampleSize: recentHistory.length,
      },
    };
  }

  applyQuantityDiscount(basePrice: number, quantity: number, discounts: QuantityDiscount[]): number {
    // Find highest applicable discount
    const applicableDiscounts = discounts
      .filter(d => quantity >= d.minQuantity)
      .sort((a, b) => b.discountPercent - a.discountPercent);

    if (applicableDiscounts.length === 0) {
      return basePrice;
    }

    const discount = applicableDiscounts[0];
    return Math.round(basePrice * (100 - discount.discountPercent) / 100);
  }

  private getQualityFactor(quality: string): number {
    const factors: Record<string, number> = {
      'A': 1.0,
      'B': 0.9,
      'C': 0.8,
      'D': 0.7,
      'E': 0.6,
    };
    return factors[quality] || 1.0;
  }
}
