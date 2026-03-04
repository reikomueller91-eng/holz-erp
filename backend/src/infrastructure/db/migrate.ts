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
  {
    name: '003_offers_orders_schema',
    up: `
      -- Offers (complete schema for Phase 3)
      CREATE TABLE IF NOT EXISTS offers (
        id TEXT PRIMARY KEY,
        offer_number TEXT NOT NULL UNIQUE,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        date TEXT NOT NULL,
        valid_until TEXT,
        inquiry_source TEXT NOT NULL,
        inquiry_contact TEXT,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        encrypted_data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_offers_customer_id ON offers(customer_id);
      CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
      CREATE INDEX IF NOT EXISTS idx_offers_offer_number ON offers(offer_number);

      -- Offer Versions (for version history)
      CREATE TABLE IF NOT EXISTS offer_versions (
        offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        encrypted_data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT,
        PRIMARY KEY (offer_id, version)
      );

      -- Orders
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        offer_id TEXT REFERENCES offers(id),
        customer_id TEXT NOT NULL REFERENCES customers(id),
        status TEXT NOT NULL DEFAULT 'new',
        encrypted_data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_offer_id ON orders(offer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
    `,
    down: `
      DROP TABLE IF EXISTS orders;
      DROP TABLE IF NOT EXISTS offer_versions;
      DROP TABLE IF NOT EXISTS offers;
    `,
  },
  {
    name: '004_invoice_schema',
    up: `
      -- Invoices (Phase 4)
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT NOT NULL UNIQUE,
        version INTEGER NOT NULL DEFAULT 1,
        order_id TEXT NOT NULL REFERENCES orders(id),
        customer_id TEXT NOT NULL REFERENCES customers(id),
        status TEXT NOT NULL DEFAULT 'draft',
        encrypted_data TEXT NOT NULL,
        date TEXT NOT NULL,
        due_date TEXT,
        paid_at TEXT,
        finalized_at TEXT,
        pdf_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);

      -- Invoice Versions (for version history)
      CREATE TABLE IF NOT EXISTS invoice_versions (
        invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        encrypted_data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT,
        PRIMARY KEY (invoice_id, version)
      );
    `,
    down: `
      DROP TABLE IF EXISTS invoice_versions;
      DROP TABLE IF EXISTS invoices;
    `,
  },
  {
    name: '005_offer_pdf_path',
    up: `
      ALTER TABLE offers ADD COLUMN pdf_path TEXT;
    `,
  },
  {
    name: '006_products_calc_method',
    up: `
      ALTER TABLE products ADD COLUMN calc_method TEXT NOT NULL DEFAULT 'm2_sorted';
      ALTER TABLE products ADD COLUMN volume_divider INTEGER;
    `,
  },
  {
    name: '007_orders_pdf_path',
    up: `
      ALTER TABLE orders ADD COLUMN pdf_path TEXT;
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
