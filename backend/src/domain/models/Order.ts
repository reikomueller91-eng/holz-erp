import { AggregateRoot } from '../core/AggregateRoot';

export type OrderStatus = 'new' | 'in_production' | 'finished' | 'invoiced' | 'paid' | 'picked_up';
export type ProductionStatus = 'not_started' | 'in_progress' | 'completed';

export interface OrderItem {
  id: string;
  productId: string;
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

export interface OrderProps {
  id: string;
  orderNumber: string;
  offerId?: string;
  status: OrderStatus;
  customerId: string;
  items: OrderItem[];
  netSum: number;
  vatPercent: number;
  vatAmount: number;
  grossSum: number;
  productionStatus: ProductionStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  finishedAt?: Date;
}

export class Order extends AggregateRoot {
  private props: OrderProps;

  constructor(props: OrderProps) {
    super();
    this.props = { ...props };
    this.validate();
  }

  private validate(): void {
    if (!this.props.orderNumber) throw new Error('Order number is required');
    if (!this.props.customerId) throw new Error('Customer ID is required');
    if (!this.props.items || this.props.items.length === 0) {
      throw new Error('Order must have at least one item');
    }
  }

  // Getters
  getId(): string { return this.props.id; }
  getOrderNumber(): string { return this.props.orderNumber; }
  getOfferId(): string | undefined { return this.props.offerId; }
  getStatus(): OrderStatus { return this.props.status; }
  getCustomerId(): string { return this.props.customerId; }
  getItems(): OrderItem[] { return [...this.props.items]; }
  getNetSum(): number { return this.props.netSum; }
  getVatPercent(): number { return this.props.vatPercent; }
  getVatAmount(): number { return this.props.vatAmount; }
  getGrossSum(): number { return this.props.grossSum; }
  getProductionStatus(): ProductionStatus { return this.props.productionStatus; }
  getNotes(): string | undefined { return this.props.notes; }
  getCreatedAt(): Date { return this.props.createdAt; }
  getUpdatedAt(): Date { return this.props.updatedAt; }
  getFinishedAt(): Date | undefined { return this.props.finishedAt; }

  // Domain operations
  updateItemProduction(itemId: string, quantityProduced: number): void {
    const item = this.props.items.find(i => i.id === itemId);
    if (!item) throw new Error('Item not found');
    
    if (quantityProduced < 0 || quantityProduced > item.quantity) {
      throw new Error('Invalid production quantity');
    }

    const oldQuantity = item.quantityProduced;
    item.quantityProduced = quantityProduced;
    
    // Update item production status
    if (quantityProduced === 0) {
      item.productionStatus = 'not_started';
    } else if (quantityProduced < item.quantity) {
      item.productionStatus = 'in_progress';
    } else {
      item.productionStatus = 'completed';
    }

    this.updateOrderProductionStatus();
    this.props.updatedAt = new Date();

    this.addDomainEvent({
      type: 'ORDER_ITEM_PRODUCTION_UPDATED',
      payload: {
        orderId: this.props.id,
        itemId,
        oldQuantity,
        newQuantity: quantityProduced
      }
    });
  }

  private updateOrderProductionStatus(): void {
    const allCompleted = this.props.items.every(i => i.productionStatus === 'completed');
    const anyInProgress = this.props.items.some(i => i.productionStatus === 'in_progress');
    const anyNotStarted = this.props.items.some(i => i.productionStatus === 'not_started');

    if (allCompleted) {
      this.props.productionStatus = 'completed';
      this.props.status = 'finished';
      this.props.finishedAt = new Date();
    } else if (anyInProgress) {
      this.props.productionStatus = 'in_progress';
      this.props.status = 'in_production';
    } else if (anyNotStarted) {
      this.props.productionStatus = 'not_started';
    }
  }

  markAsInvoiced(): void {
    if (this.props.productionStatus !== 'completed') {
      throw new Error('Cannot invoice unfinished order');
    }
    this.props.status = 'invoiced';
    this.props.updatedAt = new Date();
    
    this.addDomainEvent({
      type: 'ORDER_INVOICED',
      payload: { orderId: this.props.id }
    });
  }

  markAsPaid(): void {
    if (this.props.status !== 'invoiced') {
      throw new Error('Cannot pay uninvoiced order');
    }
    this.props.status = 'paid';
    this.props.updatedAt = new Date();
  }

  markAsPickedUp(): void {
    if (this.props.status !== 'paid') {
      throw new Error('Cannot pick up unpaid order');
    }
    this.props.status = 'picked_up';
    this.props.updatedAt = new Date();
  }

  updateNotes(notes: string): void {
    this.props.notes = notes;
    this.props.updatedAt = new Date();
  }

  // Factory method
  static create(props: Omit<OrderProps, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Order {
    return new Order({
      ...props,
      id: props.id || crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  toJSON(): OrderProps {
    return { ...this.props };
  }
}
