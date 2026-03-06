import type { Notification, NotificationType } from '../../domain/notification/Notification';
import type { IDatabase } from '../../application/ports/IDatabase';
import type { UUID } from '../../shared/types';

export interface INotificationRepository {
  findAll(options?: { isRead?: boolean; limit?: number; offset?: number }): Promise<Notification[]>;
  findById(id: UUID): Promise<Notification | null>;
  save(notification: Notification): Promise<void>;
  markRead(id: UUID): Promise<void>;
  markAllRead(): Promise<void>;
  countUnread(): number;
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  reference_type?: string;
  reference_id?: string;
  is_read: number;
  created_at: string;
}

export class NotificationRepository implements INotificationRepository {
  constructor(private db: IDatabase) {}

  async findAll(options: { isRead?: boolean; limit?: number; offset?: number } = {}): Promise<Notification[]> {
    let sql = 'SELECT * FROM notifications WHERE 1=1';
    const params: unknown[] = [];

    if (options.isRead !== undefined) {
      sql += ' AND is_read = ?';
      params.push(options.isRead ? 1 : 0);
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

    const rows = this.db.query<NotificationRow>(sql, params);
    return rows.map(row => this.rowToNotification(row));
  }

  async findById(id: UUID): Promise<Notification | null> {
    const row = this.db.queryOne<NotificationRow>('SELECT * FROM notifications WHERE id = ?', [id]);
    return row ? this.rowToNotification(row) : null;
  }

  async save(notification: Notification): Promise<void> {
    this.db.run(
      `INSERT INTO notifications (id, type, title, message, reference_type, reference_id, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        notification.id,
        notification.type,
        notification.title,
        notification.message,
        notification.referenceType ?? null,
        notification.referenceId ?? null,
        notification.isRead ? 1 : 0,
        notification.createdAt,
      ]
    );
  }

  async markRead(id: UUID): Promise<void> {
    this.db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
  }

  async markAllRead(): Promise<void> {
    this.db.run('UPDATE notifications SET is_read = 1 WHERE is_read = 0', []);
  }

  countUnread(): number {
    const row = this.db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0', []);
    return row?.count ?? 0;
  }

  private rowToNotification(row: NotificationRow): Notification {
    return {
      id: row.id as UUID,
      type: row.type as NotificationType,
      title: row.title,
      message: row.message,
      referenceType: row.reference_type as Notification['referenceType'],
      referenceId: row.reference_id as UUID | undefined,
      isRead: row.is_read === 1,
      createdAt: row.created_at,
    };
  }
}
