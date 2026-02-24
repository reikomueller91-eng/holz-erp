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
import { registerHealthRoutes } from './routes/health.routes';
import { registerAuthRoutes } from './routes/auth.routes';
import { registerCustomerRoutes } from './routes/customers';
import { registerProductRoutes } from './routes/products';
import { HolzError } from '../shared/errors';
import { logger } from '../shared/utils/logger';

export interface ServerDeps {
  db: IDatabase;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { db } = deps;

  const server = Fastify({
    logger: logger as unknown as boolean, // reuse pino instance
    trustProxy: true,
  });

  // ─── Services ─────────────────────────────────────────────────
  const authService = new AuthService(db, keyStore);
  const cryptoService = new CryptoService(keyStore);

  // ─── Repositories ─────────────────────────────────────────────
  const customerRepository = new CustomerRepository(db, cryptoService);
  const productRepository = new ProductRepository(db, cryptoService);

  // ─── Application Services ──────────────────────────────────────
  const customerService = new CustomerService(customerRepository);
  const productService = new ProductService(productRepository);

  // ─── Decorate server with shared services ─────────────────────
  server.decorate('db', db);
  server.decorate('authService', authService);
  server.decorate('cryptoService', cryptoService);
  server.decorate('keyStore', keyStore);

  // ─── Plugins ──────────────────────────────────────────────────
  server.register(helmet, {
    contentSecurityPolicy: false, // handled by Caddy
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

  // ─── Routes ───────────────────────────────────────────────────
  server.register(async (app) => {
    registerHealthRoutes(app);
    registerAuthRoutes(app, { authService });
    registerCustomerRoutes(app, { customerService });
    registerProductRoutes(app, { productService });
  }, { prefix: '/api' });

  // ─── Error Handler ────────────────────────────────────────────
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof HolzError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }

    // Fastify validation errors
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

// ─── Type augmentation ────────────────────────────────────────────
declare module 'fastify' {
  interface FastifyInstance {
    db: IDatabase;
    authService: AuthService;
    cryptoService: CryptoService;
    keyStore: typeof keyStore;
    customerService: CustomerService;
    productService: ProductService;
  }
}
