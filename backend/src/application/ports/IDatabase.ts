/**
 * Port: IDatabase
 * Minimal SQL abstraction for swapping SQLite ↔ PostgreSQL.
 * Adapters: infrastructure/db/sqlite/SqliteDatabase
 */
export interface IDatabase {
  /** Execute a query that returns rows */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];

  /** Execute a query that returns a single row (or undefined) */
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined;

  /** Execute a statement (INSERT, UPDATE, DELETE) */
  run(sql: string, params?: unknown[]): { lastInsertRowid: bigint | number; changes: number };

  /** Execute multiple statements in a transaction */
  transaction<T>(fn: () => T): T;

  /** Execute a raw statement (for migrations) */
  exec(sql: string): void;

  /** Close the database connection */
  close(): void;
}
