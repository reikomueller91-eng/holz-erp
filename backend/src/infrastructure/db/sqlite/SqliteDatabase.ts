import Database from 'better-sqlite3';
import type { IDatabase } from '../../../application/ports/IDatabase';
import { DatabaseError } from '../../../shared/errors';

/**
 * SQLite adapter implementing IDatabase.
 * Uses better-sqlite3 (synchronous API — perfectly fine for single-user).
 */
export class SqliteDatabase implements IDatabase {
  private db: Database.Database;

  constructor(path: string) {
    try {
      this.db = new Database(path);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');
    } catch (err) {
      throw new DatabaseError(`Failed to open database at ${path}`, err);
    }
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    try {
      return this.db.prepare(sql).all(...params) as T[];
    } catch (err) {
      throw new DatabaseError(`Query failed: ${sql}`, err);
    }
  }

  queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): T | undefined {
    try {
      return this.db.prepare(sql).get(...params) as T | undefined;
    } catch (err) {
      throw new DatabaseError(`QueryOne failed: ${sql}`, err);
    }
  }

  run(
    sql: string,
    params: unknown[] = [],
  ): { lastInsertRowid: bigint | number; changes: number } {
    try {
      const result = this.db.prepare(sql).run(...params);
      return {
        lastInsertRowid: result.lastInsertRowid,
        changes: result.changes,
      };
    } catch (err) {
      throw new DatabaseError(`Run failed: ${sql}`, err);
    }
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  exec(sql: string): void {
    try {
      this.db.exec(sql);
    } catch (err) {
      throw new DatabaseError(`Exec failed`, err);
    }
  }

  close(): void {
    this.db.close();
  }
}

export function createDatabase(path: string): IDatabase {
  return new SqliteDatabase(path);
}
