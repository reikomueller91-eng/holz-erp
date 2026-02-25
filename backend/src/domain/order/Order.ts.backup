import type { UUID, ISODateTime, OrderStatus } from '../../shared/types';
import { InvalidTransitionError } from '../../shared/errors';

export interface Order {
  id: UUID;
  offerId: UUID;
  customerId: UUID;
  status: OrderStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function transitionOrder(order: Order, to: OrderStatus): Order {
  const allowed = VALID_TRANSITIONS[order.status];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError('Order', order.status, to);
  }
  return {
    ...order,
    status: to,
    updatedAt: new Date().toISOString() as ISODateTime,
  };
}
