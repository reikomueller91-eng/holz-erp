import type { Order, OrderItem, ProductionStatus } from '../../domain/order/Order';
import type { IDatabase } from '../../application/ports/IDatabase';
import type { ICryptoService } from '../../application/ports/ICryptoService';
import type { UUID, OrderStatus } from '../../shared/types';

export interface IOrderRepository {
  findAll(options?: { status?: OrderStatus; customerId?: UUID; limit?: number; offset?: number }): Promise<Order[]>;
  findById(id: UUID): Promise<Order | null>;
  findByProduct(productId: UUID): Promise<Order[]>;
  findByProduct(productId: UUID): Promise<Order[]>;
  findByOfferId(offerId: UUID): Promise<Order | null>;
  findByOrderNumber(orderNumber: string): Promise<Order | null>;
  findByCustomer(customerId: UUID): Promise<Order[]>;
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
  pdf_path?: string;
  desired_completion_date?: string;
}

interface OrderEncryptedData {
  items: OrderItem[];
  netSum: number;
  vatPercent: number;
  vatAmount: number;
  grossSum: number;
  productionStatus: ProductionStatus;
  notes?: string;
}

export class OrderRepository implements IOrderRepository {
  constructor(
    private db: IDatabase,
    private crypto: ICryptoService
  ) { }

  async findAll(options: { status?: OrderStatus; customerId?: UUID; limit?: number; offset?: number } = {}): Promise<Order[]> {
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

    const rows = this.db.query<OrderRow>(sql, params);
    return Promise.all(rows.map(row => this.rowToOrder(row)));
  }

  async findById(id: UUID): Promise<Order | null> {
    const row = this.db.queryOne<OrderRow>('SELECT * FROM orders WHERE id = ?', [id]);
    return row ? this.rowToOrder(row) : null;
  }

  async findByProduct(productId: UUID): Promise<Order[]> {
    const rows = this.db.query<OrderRow>('SELECT * FROM orders');
    const orders = await Promise.all(rows.map(row => this.rowToOrder(row)));
    return orders.filter(order =>
      order.items.some(item => item.productId === productId)
    );
  }

  async findByOfferId(offerId: UUID): Promise<Order | null> {
    const row = this.db.queryOne<OrderRow>('SELECT * FROM orders WHERE offer_id = ?', [offerId]);
    return row ? this.rowToOrder(row) : null;
  }

  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    const row = this.db.queryOne<OrderRow>('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
    return row ? this.rowToOrder(row) : null;
  }

  async findByCustomer(customerId: UUID): Promise<Order[]> {
    const rows = this.db.query<OrderRow>('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC', [customerId]);
    return Promise.all(rows.map(row => this.rowToOrder(row)));
  }

  async save(order: Order): Promise<void> {
    const encryptedData = this.crypto.serializeField<OrderEncryptedData>({
      items: order.items,
      netSum: order.netSum,
      vatPercent: order.vatPercent,
      vatAmount: order.vatAmount,
      grossSum: order.grossSum,
      productionStatus: order.productionStatus,
      notes: order.notes,
    });

    this.db.run(
      `INSERT INTO orders (
        id, order_number, offer_id, status, customer_id, encrypted_data,
        created_at, updated_at, finished_at, pdf_path, desired_completion_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order.id,
        order.orderNumber,
        order.offerId ?? null,
        order.status,
        order.customerId,
        encryptedData,
        order.createdAt,
        order.updatedAt,
        order.finishedAt ?? null,
        order.pdfPath ?? null,
        order.desiredCompletionDate ?? null,
      ]
    );
  }

  async update(order: Order): Promise<void> {
    const encryptedData = this.crypto.serializeField<OrderEncryptedData>({
      items: order.items,
      netSum: order.netSum,
      vatPercent: order.vatPercent,
      vatAmount: order.vatAmount,
      grossSum: order.grossSum,
      productionStatus: order.productionStatus,
      notes: order.notes,
    });

    this.db.run(
      `UPDATE orders SET
        status = ?,
        encrypted_data = ?,
        updated_at = ?,
        finished_at = ?,
        pdf_path = ?,
        desired_completion_date = ?
      WHERE id = ?`,
      [
        order.status,
        encryptedData,
        order.updatedAt,
        order.finishedAt ?? null,
        order.pdfPath ?? null,
        order.desiredCompletionDate ?? null,
        order.id,
      ]
    );
  }

  private async rowToOrder(row: OrderRow): Promise<Order> {
    const decrypted = this.crypto.deserializeField<OrderEncryptedData>(row.encrypted_data);

    return {
      id: row.id as UUID,
      orderNumber: row.order_number,
      offerId: row.offer_id as UUID | undefined,
      status: row.status as OrderStatus,
      customerId: row.customer_id as UUID,
      items: decrypted.items,
      netSum: decrypted.netSum,
      vatPercent: decrypted.vatPercent,
      vatAmount: decrypted.vatAmount,
      grossSum: decrypted.grossSum,
      productionStatus: decrypted.productionStatus,
      desiredCompletionDate: row.desired_completion_date,
      notes: decrypted.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      finishedAt: row.finished_at,
      pdfPath: row.pdf_path,
    };
  }
}
