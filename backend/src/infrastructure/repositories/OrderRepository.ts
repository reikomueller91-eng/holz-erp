import { Order, OrderProps } from '../../domain/models/Order';
import { IDatabase } from '../../application/ports/IDatabase';
import { ICryptoService } from '../../application/ports/ICryptoService';
import { EncryptedField } from '../../shared/types';

export interface IOrderRepository {
  findAll(options?: { status?: string; customerId?: string; limit?: number; offset?: number }): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
  findByProduct(productId: string): Promise<Order[]>;
  findByOfferId(offerId: string): Promise<Order | null>;
  findByOrderNumber(orderNumber: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  update(order: Order): Promise<void>;
}

interface OrderRow {
  id: string;
  order_number: string;
  offer_id?: string;
  status: string;
  customer_id: string;
  encrypted_data: string;
  created_at: string;
  updated_at: string;
  finished_at?: string;
}

interface OrderEncryptedData {
  items: Array<{
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
    productionStatus: string;
  }>;
  netSum: number;
  vatPercent: number;
  vatAmount: number;
  grossSum: number;
  productionStatus: string;
  notes?: string;
}

export class OrderRepository implements IOrderRepository {
  constructor(
    private db: IDatabase,
    private crypto: ICryptoService
  ) {}

  async findAll(options: { status?: string; customerId?: string; limit?: number; offset?: number } = {}): Promise<Order[]> {
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params: unknown[] = [];

    if (options.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }

    if (options.customerId) {
      sql += ' AND customer_id = ?';
      params.push(options.customerId);
    }

    sql += ' ORDER BY created_at DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const rows = await this.db.query<OrderRow>(sql, params);
    return Promise.all(rows.map(row => this.rowToOrder(row)));
  }

  async findById(id: string): Promise<Order | null> {
    const row = await this.db.queryOne<OrderRow>(
      'SELECT * FROM orders WHERE id = ?',
      [id]
    );
    if (!row) return null;
    return this.rowToOrder(row);
  }

  async findByProduct(productId: string): Promise<Order[]> {
    const rows = await this.db.query<OrderRow>(
      'SELECT * FROM orders WHERE status IN (?, ?, ?) ORDER BY created_at DESC',
      ['in_production', 'finished', 'invoiced']
    );
    
    const orders = await Promise.all(rows.map(row => this.rowToOrder(row)));
    
    return orders.filter(order => 
      order.getItems().some(item => item.productId === productId)
    );
  }

  async findByOfferId(offerId: string): Promise<Order | null> {
    const row = await this.db.queryOne<OrderRow>(
      'SELECT * FROM orders WHERE offer_id = ?',
      [offerId]
    );
    if (!row) return null;
    return this.rowToOrder(row);
  }

  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    const row = await this.db.queryOne<OrderRow>(
      'SELECT * FROM orders WHERE order_number = ?',
      [orderNumber]
    );
    if (!row) return null;
    return this.rowToOrder(row);
  }

  async save(order: Order): Promise<void> {
    const props = order.toJSON();
    const payload = this.orderToEncryptedData(props);
    const encrypted: EncryptedField = this.crypto.encryptJson(payload);
    const encryptedData: string = this.crypto.serializeField(encrypted);

    await this.db.run(
      `INSERT INTO orders (id, order_number, offer_id, status, customer_id, encrypted_data, created_at, updated_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        props.id,
        props.orderNumber,
        props.offerId || null,
        props.status,
        props.customerId,
        encryptedData,
        props.createdAt.toISOString(),
        props.updatedAt.toISOString(),
        props.finishedAt?.toISOString() || null
      ]
    );
  }

  async update(order: Order): Promise<void> {
    const props = order.toJSON();
    const payload = this.orderToEncryptedData(props);
    const encrypted: EncryptedField = this.crypto.encryptJson(payload);
    const encryptedData: string = this.crypto.serializeField(encrypted);

    await this.db.run(
      `UPDATE orders 
       SET status = ?, customer_id = ?, encrypted_data = ?, updated_at = ?, finished_at = ?
       WHERE id = ?`,
      [
        props.status,
        props.customerId,
        encryptedData,
        props.updatedAt.toISOString(),
        props.finishedAt?.toISOString() || null,
        props.id
      ]
    );
  }

  private rowToOrder(row: OrderRow): Order {
    const field: EncryptedField = this.crypto.parseField(row.encrypted_data);
    const data = this.crypto.decryptJson<OrderEncryptedData>(field);

    return new Order({
      id: row.id,
      orderNumber: row.order_number,
      offerId: row.offer_id,
      status: row.status as OrderProps['status'],
      customerId: row.customer_id,
      items: data.items.map(item => ({
        ...item,
        productionStatus: item.productionStatus as OrderProps['items'][0]['productionStatus']
      })),
      netSum: data.netSum,
      vatPercent: data.vatPercent,
      vatAmount: data.vatAmount,
      grossSum: data.grossSum,
      productionStatus: data.productionStatus as OrderProps['productionStatus'],
      notes: data.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      finishedAt: row.finished_at ? new Date(row.finished_at) : undefined
    });
  }

  private orderToEncryptedData(props: OrderProps): OrderEncryptedData {
    return {
      items: props.items,
      netSum: props.netSum,
      vatPercent: props.vatPercent,
      vatAmount: props.vatAmount,
      grossSum: props.grossSum,
      productionStatus: props.productionStatus,
      notes: props.notes
    };
  }
}

export const createOrderRepository = (
  db: IDatabase,
  crypto: ICryptoService
): IOrderRepository => {
  return new OrderRepository(db, crypto);
};
