import type { UUID, ISODateTime, OrderStatus } from '../../shared/types';
import { InvalidTransitionError } from '../../shared/errors';

export type ProductionStatus = 'not_started' | 'in_progress' | 'completed';

export interface OrderItem {
  id: UUID;
  productId: UUID;
  heightMm: number;
  widthMm: number;
  lengthMm: number;
  quantity: number;
  quantityProduced: number;
  quality: string;
  pricePerM2: number;
  netTotal: number;
  productionStatus: ProductionStatus;
}

export interface Order {
  id: UUID;
  orderNumber: string;
  offerId?: UUID;
  status: OrderStatus;
  customerId: UUID;
  items: OrderItem[];
  netSum: number;
  vatPercent: number;
  vatAmount: number;
  grossSum: number;
  productionStatus: ProductionStatus;
  desiredCompletionDate?: string;
  notes?: string;
  pdfPath?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  finishedAt?: ISODateTime;
}

// ─── Valid Status Transitions ────────────────────────────────────
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ['in_production', 'cancelled'],
  in_production: ['finished', 'cancelled'],
  finished: ['picked_up', 'cancelled'],
  picked_up: [],
  cancelled: [],
};

export function transitionOrder(order: Order, to: OrderStatus): Order {
  const allowed = VALID_TRANSITIONS[order.status];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError('Order', order.status, to);
  }

  const updates: Partial<Order> = {
    status: to,
    updatedAt: new Date().toISOString() as ISODateTime,
  };

  // Set finishedAt when transitioning to finished
  if (to === 'finished') {
    updates.finishedAt = new Date().toISOString() as ISODateTime;
  }

  return { ...order, ...updates };
}

export function updateItemProduction(
  order: Order,
  itemId: UUID,
  quantityProduced: number
): Order {
  const items = order.items.map(item => {
    if (item.id !== itemId) return item;

    const newQuantityProduced = Math.min(quantityProduced, item.quantity);
    const productionStatus: ProductionStatus =
      newQuantityProduced === 0 ? 'not_started' :
        newQuantityProduced < item.quantity ? 'in_progress' :
          'completed';

    return {
      ...item,
      quantityProduced: newQuantityProduced,
      productionStatus,
    };
  });

  // Calculate overall production status
  const allCompleted = items.every(i => i.productionStatus === 'completed');
  const someStarted = items.some(i => i.productionStatus !== 'not_started');
  const productionStatus: ProductionStatus =
    allCompleted ? 'completed' :
      someStarted ? 'in_progress' :
        'not_started';

  return {
    ...order,
    items,
    productionStatus,
    updatedAt: new Date().toISOString() as ISODateTime,
  };
}

export function calcOrderTotals(items: OrderItem[], vatPercent: number): {
  netSum: number;
  vatAmount: number;
  grossSum: number;
} {
  // Since the user enters prices as Brutto, the item.netTotal field now actually holds the Gross value.
  const grossSum = items.reduce((sum, item) => sum + item.netTotal, 0);
  const netSum = Math.round((grossSum / (1 + vatPercent / 100)) * 100) / 100;
  const vatAmount = Math.round((grossSum - netSum) * 100) / 100;

  return { netSum, vatAmount, grossSum };
}
