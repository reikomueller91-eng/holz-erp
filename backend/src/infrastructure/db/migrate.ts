import type { IDatabase } from '../../application/ports/IDatabase';
import { logger } from '../../shared/utils/logger';

interface MigrationRow {
  id: number;
  name: string;
  applied_at: string;
}

interface Migration {
  name: string;
  up: string;
  down?: string;
}

const MIGRATIONS: Migration[] = [
  {
    name: '001_initial_schema',
    up: `
      -- System config
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Customers
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        encrypted_data TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);

      -- Products
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        wood_type TEXT NOT NULL,
        quality_grade TEXT NOT NULL,
        height_mm INTEGER NOT NULL,
        width_mm INTEGER NOT NULL,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

      -- Price History
      CREATE TABLE IF NOT EXISTS price_history (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        price_per_m2 REAL NOT NULL,
        effective_from TEXT NOT NULL,
        effective_to TEXT,
        reason TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON price_history(product_id);

      -- Offers
      CREATE TABLE IF NOT EXISTS offers (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        status TEXT NOT NULL DEFAULT 'draft',
        valid_until TEXT,
        encrypted_notes TEXT,
        pdf_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_offers_customer_id ON offers(customer_id);
      CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);

      -- Offer Line Items
      CREATE TABLE IF NOT EXISTS offer_line_items (
        id TEXT PRIMARY KEY,
        offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id),
        length_mm INTEGER NOT NULL,
        quantity_pieces INTEGER NOT NULL,
        unit_price_per_m2 REAL NOT NULL,
        total_price REAL NOT NULL,
        notes TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_offer_line_items_offer_id ON offer_line_items(offer_id);

      -- Orders
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        offer_id TEXT NOT NULL REFERENCES offers(id),
        customer_id TEXT NOT NULL REFERENCES customers(id),
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

      -- Production Jobs
      CREATE TABLE IF NOT EXISTS production_jobs (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id),
        line_item_ref TEXT NOT NULL,
        product_snapshot TEXT NOT NULL,
        target_quantity INTEGER NOT NULL,
        produced_quantity INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'queued',
        notes TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_production_jobs_order_id ON production_jobs(order_id);
      CREATE INDEX IF NOT EXISTS idx_production_jobs_status ON production_jobs(status);

      -- Invoices
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        order_id TEXT NOT NULL REFERENCES orders(id),
        customer_id TEXT NOT NULL REFERENCES customers(id),
        status TEXT NOT NULL DEFAULT 'draft',
        total_net REAL NOT NULL,
        tax_rate REAL NOT NULL DEFAULT 0.19,
        total_gross REAL NOT NULL,
        due_date TEXT,
        paid_at TEXT,
        finalized_at TEXT,
        pdf_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

      -- Invoice Line Items
      CREATE TABLE IF NOT EXISTS invoice_line_items (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        product_id TEXT,
        description TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);
    `,
    down: `
      DROP TABLE IF EXISTS invoice_line_items;
      DROP TABLE IF EXISTS invoices;
      DROP TABLE IF EXISTS production_jobs;
      DROP TABLE IF EXISTS orders;
      DROP TABLE IF EXISTS offer_line_items;
      DROP TABLE IF EXISTS offers;
      DROP TABLE IF EXISTS price_history;
      DROP TABLE IF EXISTS products;
      DROP TABLE IF EXISTS customers;
      DROP TABLE IF EXISTS system_config;
    `,
  },
  {
    name: '002_product_encrypted_data',
    up: `
      -- Add encrypted_data column to products (stores name + description encrypted).
      -- The existing name column is kept for DB-level filtering/logging.
      ALTER TABLE products ADD COLUMN encrypted_data TEXT;
    `,
  },
];

export async function runMigrations(db: IDatabase): Promise<void> {
  // Create migrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db.query<MigrationRow>('SELECT name FROM migrations').map((r) => r.name),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) {
      continue;
    }

    logger.info({ migration: migration.name }, 'Applying migration');
    db.transaction(() => {
      db.exec(migration.up);
      db.run('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', [
        migration.name,
        new Date().toISOString(),
      ]);
    });
    logger.info({ migration: migration.name }, 'Migration applied');
  }
}
