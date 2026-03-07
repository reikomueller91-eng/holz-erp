import type { PriceCalculationMethod } from '../../domain/product/Product';

/**
 * Input item for the rounding solver.
 * Each item has a product with dimensions + calcMethod, plus length/price that can be adjusted.
 */
export interface RoundingItem {
  productId: string;
  calcMethod: PriceCalculationMethod;
  widthMm: number;           // Product width (needed for m2_sorted)
  lengthMm: number;          // Current length in mm (adjustable)
  quantityPieces: number;    // Quantity (NOT adjustable)
  unitPricePerM2: number;    // Price per unit (adjustable)
}

export interface RoundingRequest {
  items: RoundingItem[];
  vatPercent: number;
  /** "euro" → round down to full €, "5euro" → round down to nearest 5€ */
  roundingMethod: 'euro' | '5euro';
  /** Acceptable difference between target and achieved gross, in €. Default: 0.03 */
  tolerance?: number;
  /** Max time for the solver in ms. Default: 2500 */
  timeoutMs?: number;
}

export interface RoundingResultItem {
  productId: string;
  lengthMm: number;
  quantityPieces: number;
  unitPricePerM2: number;
  /** Gross total for this item */
  itemGross: number;
}

export interface RoundingResult {
  success: boolean;
  message: string;
  /** The target gross that was computed from current gross + rounding method */
  targetGross: number;
  /** The achieved gross after adjustments */
  achievedGross: number;
  netSum: number;
  vatAmount: number;
  grossSum: number;
  items: RoundingResultItem[];
}

// ─── Helpers ───────────────────────────────────────────────────

/** Calculate gross total for a single item based on its calcMethod */
function calcItemGross(item: RoundingItem): number {
  if (item.calcMethod === 'm2_sorted') {
    const areaM2 = (item.widthMm / 1000) * (item.lengthMm / 1000);
    return areaM2 * item.quantityPieces * item.unitPricePerM2;
  }
  // m2_unsorted and volume_divided
  return (item.lengthMm / 1000) * item.quantityPieces * item.unitPricePerM2;
}

/** Calculate total gross for all items */
function calcTotalGross(items: RoundingItem[]): number {
  return items.reduce((sum, item) => sum + calcItemGross(item), 0);
}

/** Round down to target based on method */
function computeTargetGross(currentGross: number, method: 'euro' | '5euro'): number {
  if (method === '5euro') {
    return Math.floor(currentGross / 5) * 5;
  }
  return Math.floor(currentGross);
}

/** Recalculate netto + MwSt from gross */
function calcTotals(grossSum: number, vatPercent: number) {
  const netSum = Math.round((grossSum / (1 + vatPercent / 100)) * 100) / 100;
  const vatAmount = Math.round((grossSum - netSum) * 100) / 100;
  return { netSum, vatAmount, grossSum: Math.round(grossSum * 100) / 100 };
}

// ─── Solver ────────────────────────────────────────────────────

/**
 * Greedy solver that adjusts item lengths and prices to reach a target gross.
 *
 * Strategy:
 * 1. Calculate how much we need to reduce (delta)
 * 2. Try reducing each item's price by small steps (0.01€)
 * 3. Try reducing each item's length by small steps (1mm)
 * 4. If reducing doesn't work (target is above current), try increasing
 * 5. Distribute changes as evenly as possible across items
 * 6. Timeout after the specified duration
 */
export function solveGrossRounding(request: RoundingRequest): RoundingResult {
  const tolerance = request.tolerance ?? 0.03;
  const timeoutMs = request.timeoutMs ?? 2500;
  const startTime = Date.now();

  // Deep-clone items so we don't mutate originals
  const items: RoundingItem[] = request.items.map(i => ({ ...i }));

  const currentGross = calcTotalGross(items);
  const targetGross = computeTargetGross(currentGross, request.roundingMethod);

  // If already within tolerance, no changes needed
  if (Math.abs(currentGross - targetGross) <= tolerance) {
    const totals = calcTotals(currentGross, request.vatPercent);
    return {
      success: true,
      message: 'Bruttobetrag liegt bereits im Zielbereich.',
      targetGross,
      achievedGross: Math.round(currentGross * 100) / 100,
      ...totals,
      items: items.map(i => ({
        productId: i.productId,
        lengthMm: i.lengthMm,
        quantityPieces: i.quantityPieces,
        unitPricePerM2: i.unitPricePerM2,
        itemGross: Math.round(calcItemGross(i) * 100) / 100,
      })),
    };
  }

  // If target is higher than current (shouldn't happen with floor, but safety)
  if (targetGross > currentGross) {
    return {
      success: false,
      message: 'Ziel-Brutto ist höher als der aktuelle Bruttobetrag. Abrundung nicht möglich.',
      targetGross,
      achievedGross: Math.round(currentGross * 100) / 100,
      ...calcTotals(currentGross, request.vatPercent),
      items: items.map(i => ({
        productId: i.productId,
        lengthMm: i.lengthMm,
        quantityPieces: i.quantityPieces,
        unitPricePerM2: i.unitPricePerM2,
        itemGross: Math.round(calcItemGross(i) * 100) / 100,
      })),
    };
  }

  // We need to reduce by this much
  let delta = currentGross - targetGross;

  // Strategy: iterate through items and try small adjustments
  // Phase 1: Try price reductions (0.01€ steps)
  // Phase 2: Try length reductions (1mm steps)
  // Repeat until within tolerance or timeout

  let bestItems = items.map(i => ({ ...i }));
  let bestDiff = delta;

  const maxIterations = 100000;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    // Check timeout
    if (Date.now() - startTime > timeoutMs) break;

    const currentTotal = calcTotalGross(items);
    const diff = currentTotal - targetGross;

    // Check if we're within tolerance
    if (Math.abs(diff) <= tolerance) {
      // Found a solution!
      const totals = calcTotals(currentTotal, request.vatPercent);
      return {
        success: true,
        message: `Brutto erfolgreich angepasst. Differenz: ${diff >= 0 ? '+' : ''}${diff.toFixed(3)}€`,
        targetGross,
        achievedGross: Math.round(currentTotal * 100) / 100,
        ...totals,
        items: items.map(i => ({
          productId: i.productId,
          lengthMm: i.lengthMm,
          quantityPieces: i.quantityPieces,
          unitPricePerM2: i.unitPricePerM2,
          itemGross: Math.round(calcItemGross(i) * 100) / 100,
        })),
      };
    }

    // Track best solution so far
    if (Math.abs(diff) < bestDiff) {
      bestDiff = Math.abs(diff);
      bestItems = items.map(i => ({ ...i }));
    }

    if (diff > 0) {
      // We're still above target → reduce something

      // Find item where a small change has the best effect
      let bestChangeIdx = -1;
      let bestChangeType: 'price' | 'length' = 'price';
      let bestChangeEffect = Infinity; // We want the change closest to diff but not over

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Try price reduction: -0.01€
        if (item.unitPricePerM2 > 0.01) {
          const oldGross = calcItemGross(item);
          const saved = { ...item };
          item.unitPricePerM2 = Math.round((item.unitPricePerM2 - 0.01) * 100) / 100;
          const newGross = calcItemGross(item);
          const effect = oldGross - newGross;
          Object.assign(item, saved); // restore

          // Don't overshoot too much; prefer changes that bring us close to 0
          const newDiff = diff - effect;
          if (Math.abs(newDiff) < Math.abs(bestChangeEffect)) {
            bestChangeIdx = i;
            bestChangeType = 'price';
            bestChangeEffect = newDiff;
          }
        }

        // Try length reduction: -1mm
        if (item.lengthMm > 1) {
          const oldGross = calcItemGross(item);
          const saved = { ...item };
          item.lengthMm -= 1;
          const newGross = calcItemGross(item);
          const effect = oldGross - newGross;
          Object.assign(item, saved); // restore

          const newDiff = diff - effect;
          if (Math.abs(newDiff) < Math.abs(bestChangeEffect)) {
            bestChangeIdx = i;
            bestChangeType = 'length';
            bestChangeEffect = newDiff;
          }
        }
      }

      if (bestChangeIdx === -1) break; // No more changes possible

      // Apply best change
      if (bestChangeType === 'price') {
        items[bestChangeIdx].unitPricePerM2 = Math.round((items[bestChangeIdx].unitPricePerM2 - 0.01) * 100) / 100;
      } else {
        items[bestChangeIdx].lengthMm -= 1;
      }

    } else {
      // We're below target → increase something slightly

      let bestChangeIdx = -1;
      let bestChangeType: 'price' | 'length' = 'price';
      let bestChangeEffect = -Infinity;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Try price increase: +0.01€
        {
          const oldGross = calcItemGross(item);
          const saved = { ...item };
          item.unitPricePerM2 = Math.round((item.unitPricePerM2 + 0.01) * 100) / 100;
          const newGross = calcItemGross(item);
          const effect = newGross - oldGross;
          Object.assign(item, saved);

          const newDiff = diff + effect; // diff is negative, effect is positive
          if (Math.abs(newDiff) < Math.abs(bestChangeEffect)) {
            bestChangeIdx = i;
            bestChangeType = 'price';
            bestChangeEffect = newDiff;
          }
        }

        // Try length increase: +1mm
        {
          const oldGross = calcItemGross(item);
          const saved = { ...item };
          item.lengthMm += 1;
          const newGross = calcItemGross(item);
          const effect = newGross - oldGross;
          Object.assign(item, saved);

          const newDiff = diff + effect;
          if (Math.abs(newDiff) < Math.abs(bestChangeEffect)) {
            bestChangeIdx = i;
            bestChangeType = 'length';
            bestChangeEffect = newDiff;
          }
        }
      }

      if (bestChangeIdx === -1) break;

      if (bestChangeType === 'price') {
        items[bestChangeIdx].unitPricePerM2 = Math.round((items[bestChangeIdx].unitPricePerM2 + 0.01) * 100) / 100;
      } else {
        items[bestChangeIdx].lengthMm += 1;
      }
    }
  }

  // If we got here, check best solution found
  const bestTotal = calcTotalGross(bestItems);
  const bestDiffFinal = Math.abs(bestTotal - targetGross);

  if (bestDiffFinal <= tolerance) {
    const totals = calcTotals(bestTotal, request.vatPercent);
    return {
      success: true,
      message: `Brutto angepasst. Differenz: ${(bestTotal - targetGross) >= 0 ? '+' : ''}${(bestTotal - targetGross).toFixed(3)}€`,
      targetGross,
      achievedGross: Math.round(bestTotal * 100) / 100,
      ...totals,
      items: bestItems.map(i => ({
        productId: i.productId,
        lengthMm: i.lengthMm,
        quantityPieces: i.quantityPieces,
        unitPricePerM2: i.unitPricePerM2,
        itemGross: Math.round(calcItemGross(i) * 100) / 100,
      })),
    };
  }

  // Failed
  const failTotal = calcTotalGross(items);
  return {
    success: false,
    message: `Konnte den Zielbetrag von ${targetGross.toFixed(2)}€ nicht innerhalb der Toleranz von ±${tolerance.toFixed(2)}€ erreichen. Bester Versuch: ${bestTotal.toFixed(2)}€ (Diff: ${bestDiffFinal.toFixed(3)}€).`,
    targetGross,
    achievedGross: Math.round(failTotal * 100) / 100,
    ...calcTotals(failTotal, request.vatPercent),
    items: items.map(i => ({
      productId: i.productId,
      lengthMm: i.lengthMm,
      quantityPieces: i.quantityPieces,
      unitPricePerM2: i.unitPricePerM2,
      itemGross: Math.round(calcItemGross(i) * 100) / 100,
    })),
  };
}
