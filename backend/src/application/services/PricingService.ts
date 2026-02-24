import { OrderRepository } from '../../infrastructure/repositories/OrderRepository';
import { Product } from '../../domain/product/Product';
import { PriceSuggestion, PriceCalculationResult, HistoricalPriceEntry } from '../types';

export interface IPricingService {
  // Calculate with individual parameters
  calculatePrice(
    heightMm: number,
    widthMm: number,
    lengthMm: number,
    quantity: number,
    basePricePerM2: number,
    qualityOverride?: string
  ): PriceCalculationResult;
  
  // Calculate using Product object
  calculatePriceForProduct(
    product: Product,
    lengthMm: number,
    quantity: number,
    basePricePerM2: number,
    qualityOverride?: string
  ): PriceCalculationResult;
  
  getPriceHistory(productId: string, customerId?: string): Promise<HistoricalPriceEntry[]>;
  
  suggestPrice(productId: string, basePrice: number, customerId?: string): Promise<PriceSuggestion>;
  
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
    private orderRepo: OrderRepository,
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

  /**
   * Calculate price based on area formula:
   * (height × width) / divisor × length × quantity
   */
  calculatePrice(
    heightMm: number,
    widthMm: number,
    lengthMm: number,
    quantity: number,
    basePricePerM2: number,
    qualityOverride?: string
  ): PriceCalculationResult {
    const areaMm2 = heightMm * widthMm;
    const areaM2 = areaMm2 / this.pricingConfig.defaultDivisor;
    
    // Get price per m² (either current or adjusted for quality)
    let pricePerM2 = basePricePerM2;
    
    // Quality adjustment could modify the base price
    if (qualityOverride) {
      // Simple quality adjustment based on grade
      pricePerM2 = this.adjustPriceForQuality(pricePerM2, qualityOverride);
    }
    
    // Calculate base price for one unit
    const pricePerUnit = Math.round(areaM2 * lengthMm / 1000 * pricePerM2); // length in meters
    
    // Apply quantity discounts
    const totalBeforeDiscount = pricePerUnit * quantity;
    const discountedTotal = this.applyQuantityDiscount(
      totalBeforeDiscount,
      quantity,
      this.pricingConfig.quantityDiscounts
    );
    
    const discountAmount = totalBeforeDiscount - discountedTotal;
    
    return {
      areaMm2,
      areaM2,
      pricePerM2,
      lengthM: lengthMm / 1000,
      quantity,
      pricePerUnit,
      totalBeforeDiscount,
      discountAmount,
      discountPercent: discountAmount > 0 
        ? Math.round((discountAmount / totalBeforeDiscount) * 100) 
        : 0,
      finalTotal: discountedTotal
    };
  }

  /**
   * Calculate price using Product object
   */
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
      qualityOverride
    );
  }

  /**
   * Get historical prices for this product from previous orders
   */
  async getPriceHistory(
    productId: string,
    customerId?: string
  ): Promise<HistoricalPriceEntry[]> {
    const orders = await this.orderRepo.findByProduct(productId);
    
    const entries: HistoricalPriceEntry[] = [];
    
    for (const order of orders) {
      const items = order.getItems().filter(item => 
        item.productId === productId
      );
      
      for (const item of items) {
        entries.push({
          date: order.getCreatedAt().toISOString(),
          orderId: order.getId(),
          customerId: order.getCustomerId(),
          customerName: 'Customer ' + order.getCustomerId().slice(0, 8),
          quality: item.quality,
          lengthMm: item.lengthMm,
          pricePerM2: item.pricePerM2,
          quantity: item.quantity,
          isReturningCustomer: customerId ? order.getCustomerId() === customerId : false
        });
      }
    }
    
    // Sort by date descending (newest first)
    return entries.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  /**
   * Suggest price based on history and current pricing
   */
  async suggestPrice(productId: string, basePrice: number, customerId?: string): Promise<PriceSuggestion> {
    const history = await this.getPriceHistory(productId, customerId);
    const currentPrice = basePrice;
    
    // Calculate statistics from history
    const prices = history.map(h => h.pricePerM2);
    const avgPrice = prices.length > 0 
      ? prices.reduce((a, b) => a + b, 0) / prices.length 
      : currentPrice;
    
    const minPrice = prices.length > 0 ? Math.min(...prices) : currentPrice;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : currentPrice;
    
    // Check if this customer bought before
    const previousPurchases = customerId 
      ? history.filter(h => h.customerId === customerId)
      : [];
    
    const suggestedPrice = previousPurchases.length > 0
      ? previousPurchases[0].pricePerM2
      : currentPrice;
    
    return {
      currentPrice,
      suggestedPrice,
      averagePrice: Math.round(avgPrice),
      minPrice,
      maxPrice,
      historyCount: history.length,
      previousPurchases: previousPurchases.length,
      recentHistory: history.slice(0, 10)
    };
  }

  /**
   * Apply quantity discounts
   */
  applyQuantityDiscount(
    basePrice: number,
    quantity: number,
    discounts: QuantityDiscount[]
  ): number {
    // Sort discounts by minQuantity descending to get best discount first
    const sortedDiscounts = [...discounts].sort((a, b) => 
      b.minQuantity - a.minQuantity
    );
    
    for (const discount of sortedDiscounts) {
      if (quantity >= discount.minQuantity) {
        return Math.round(basePrice * (1 - discount.discountPercent / 100));
      }
    }
    
    return basePrice;
  }

  private adjustPriceForQuality(pricePerM2: number, quality: string): number {
    const gradeValue = this.gradeToNumber(quality);
    // Base grade C (3) as reference point
    const adjustment = (gradeValue - 3) * 0.1;
    return Math.round(pricePerM2 * (1 + adjustment));
  }

  private gradeToNumber(grade: string): number {
    const grades: Record<string, number> = { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1 };
    return grades[grade.toUpperCase()] || 3;
  }
}

export const createPricingService = (
  orderRepo: OrderRepository,
  config?: Partial<PricingConfig>
): IPricingService => {
  return new PricingService(orderRepo, config);
};
