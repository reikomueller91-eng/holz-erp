import 'dotenv/config';
import { buildServer } from './api/server';
import { createDatabase } from './infrastructure/db/sqlite/SqliteDatabase';
import { runMigrations } from './infrastructure/db/migrate';
import { logger } from './shared/utils/logger';
import { createEmailWorker } from './infrastructure/email/EmailWorker';

interface ProductData {
  id: string;
  name: string;
  woodType: string;
  qualityGrade: string;
  heightMm: number;
  widthMm: number;
  currentPricePerM2: number;
}

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

  // Start Email Worker if configured
  const emailWorker = createEmailWorker(process.env as Record<string, string>);
  
  if (emailWorker) {
    setTimeout(async () => {
      const productService = (server as any).productService;
      
      if (productService) {
        await emailWorker.start(
          async () => {
            const products = await productService.list({});
            return products.map((p: any) => ({
              id: p.id,
              name: p.name,
              woodType: p.woodType,
              qualityGrade: p.qualityGrade,
              heightMm: p.dimensions.heightMm,
              widthMm: p.dimensions.widthMm,
              currentPricePerM2: 0,
            } as ProductData));
          },
          async (data) => {
            const ticketNumber = `ANGEBOT-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
            console.log('📝 Würde Angebot erstellen für:', data.customerEmail, 'mit Ticket:', ticketNumber);
            return { id: 'temp', ticketNumber };
          }
        );
      }
    }, 5000);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    if (emailWorker) {
      emailWorker.stop();
    }
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