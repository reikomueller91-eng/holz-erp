/**
 * Shared financial calculation utilities
 * Used across Offer, Order, and Invoice domains
 */

export interface LineItemWithTotal {
  netTotal: number;
}

export interface LineItemWithPrice {
  totalPrice: number;
}

export interface FinancialTotals {
  netSum: number;
  vatAmount: number;
  grossSum: number;
}

/**
 * Calculate totals from line items with netTotal property
 * Used by: Offer, Order
 */
export function calcTotals(
  items: LineItemWithTotal[],
  vatPercent: number
): FinancialTotals {
  const netSum = items.reduce((sum, item) => sum + item.netTotal, 0);
  const vatAmount = Math.round(netSum * vatPercent) / 100;
  const grossSum = netSum + vatAmount;
  
  return { netSum, vatAmount, grossSum };
}

/**
 * Calculate totals from line items with totalPrice property
 * Used by: Invoice
 */
export function calcTotalsFromPrice(
  items: LineItemWithPrice[],
  vatPercent: number
): { totalNet: number; vatAmount: number; totalGross: number } {
  const totalNet = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const vatAmount = Math.round(totalNet * vatPercent) / 100;
  const totalGross = totalNet + vatAmount;
  
  return { totalNet, vatAmount, totalGross };
}

/**
 * Format amount in cents to currency string
 */
export function formatCurrency(amountInCents: number): string {
  return `€ ${(amountInCents / 100).toFixed(2)}`;
}
