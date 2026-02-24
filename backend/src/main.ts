import 'dotenv/config';
import { buildServer } from './api/server';
import { createDatabase } from './infrastructure/db/sqlite/SqliteDatabase';
import { runMigrations } from './infrastructure/db/migrate';
import { logger } from './shared/utils/logger';

async function main() {
  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  const dbPath = process.env['DB_PATH'] ?? ':memory:';

  logger.info({ dbPath }, 'Initializing database');

  const db = createDatabase(dbPath);
  await runMigrations(db);

  const server = buildServer({ db });

  try {
    await server.listen({ port, host: '0.0.0.0' });
    logger.info({ port }, 'HolzERP backend started');
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    await server.close();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
