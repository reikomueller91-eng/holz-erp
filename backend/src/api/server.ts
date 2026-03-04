import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { IDatabase } from '../application/ports/IDatabase';
import { AuthService } from '../application/services/AuthService';
import { CustomerService } from '../application/services/CustomerService';
import { ProductService } from '../application/services/ProductService';
import { CryptoService } from '../infrastructure/crypto/CryptoService';
import { keyStore } from '../infrastructure/crypto/KeyStore';
import { CustomerRepository } from '../infrastructure/repositories/CustomerRepository';
import { ProductRepository } from '../infrastructure/repositories/ProductRepository';
import { OrderRepository } from '../infrastructure/repositories/OrderRepository';
import { OfferRepository } from '../infrastructure/repositories/OfferRepository';
import { InvoiceRepository } from '../infrastructure/repositories/InvoiceRepository';
import { SystemConfigRepository } from '../infrastructure/repositories/SystemConfigRepository';
import { PricingService } from '../application/services/PricingService';
import { registerHealthRoutes } from './routes/health.routes';
import { registerAuthRoutes } from './routes/auth.routes';
import { registerCustomerRoutes } from './routes/customers';
import { productRoutes } from './routes/products';
import { orderRoutes } from './routes/orders';
import { offerRoutes } from './routes/offers';
import { pricingRoutes } from './routes/pricing';
import { invoiceRoutes } from './routes/invoices';
import { buildSettingsRoutes } from './routes/settings';
import { HolzError } from '../shared/errors';
import { logger } from '../shared/utils/logger';
import { ZodError } from 'zod';

export interface ServerDeps {
  db: IDatabase;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { db } = deps;

  const server = Fastify({
    logger: logger as unknown as boolean,
    trustProxy: true,
  });

  // ─── Services ─────────────────────────────────────────────────
  const authService = new AuthService(db, keyStore);
  const cryptoService = new CryptoService(keyStore);

  // ─── Repositories ─────────────────────────────────────────────
  const customerRepository = new CustomerRepository(db, cryptoService);
  const productRepository = new ProductRepository(db, cryptoService);
  const orderRepository = new OrderRepository(db, cryptoService);
  const offerRepository = new OfferRepository(db, cryptoService);
  const invoiceRepository = new InvoiceRepository(db, cryptoService);
  const systemConfigRepository = new SystemConfigRepository(db);

  // ─── Application Services ──────────────────────────────────────
  const customerService = new CustomerService(customerRepository);
  const productService = new ProductService(productRepository);
  const pricingService = new PricingService(orderRepository);

  // ─── Decorate server with shared services ─────────────────────
  server.decorate('db', db);
  server.decorate('authService', authService);
  server.decorate('cryptoService', cryptoService);
  server.decorate('keyStore', keyStore);

  // ─── Plugins ──────────────────────────────────────────────────
  server.register(helmet, {
    contentSecurityPolicy: false,
  });

  server.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? false,
    credentials: true,
  });

  server.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });

  // Decorate with services for routes
  server.decorate('customerService', customerService);
  server.decorate('productService', productService);
  server.decorate('pricingService', pricingService);
  server.decorate('customerRepository', customerRepository);
  server.decorate('productRepository', productRepository);
  server.decorate('orderRepository', orderRepository);
  server.decorate('offerRepository', offerRepository);
  server.decorate('invoiceRepository', invoiceRepository);
  server.decorate('systemConfigRepository', systemConfigRepository);

  // ─── Routes ───────────────────────────────────────────────────
  server.register(async (app) => {
    registerHealthRoutes(app);
    registerAuthRoutes(app, { authService });
    registerCustomerRoutes(app, { customerService });
    await productRoutes(app);
    await orderRoutes(app);
    await offerRoutes(app);
    await pricingRoutes(app);
    await invoiceRoutes(app);
    app.register(buildSettingsRoutes(systemConfigRepository));
  }, { prefix: '/api' });

  // ─── Error Handler ────────────────────────────────────────────
  server.setErrorHandler((error, _request, reply) => {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const issues = error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: issues[0]?.message || 'Validation failed',
        details: issues,
      });
    }

    if (error instanceof HolzError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
      });
    }

    logger.error(error, 'Unhandled error');
    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  // ─── 404 Handler ──────────────────────────────────────────────
  server.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: 'NOT_FOUND', message: 'Route not found' });
  });

  return server;
}
