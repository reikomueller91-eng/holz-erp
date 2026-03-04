import 'fastify';
import type { IKeyStore } from '../application/ports/IKeyStore';
import type { IDatabase } from '../application/ports/IDatabase';
import type { ICryptoService } from '../application/ports/ICryptoService';
import type { ICustomerRepository } from '../application/ports/ICustomerRepository';
import type { IProductRepository } from '../application/ports/IProductRepository';
import type { IOrderRepository } from '../infrastructure/repositories/OrderRepository';
import type { IOfferRepository } from '../infrastructure/repositories/OfferRepository';
import type { IInvoiceRepository } from '../infrastructure/repositories/InvoiceRepository';
import type { ISystemConfigRepository } from '../infrastructure/repositories/SystemConfigRepository';
import type { ProductService } from '../application/services/ProductService';
import type { PricingService } from '../application/services/PricingService';
import type { FastifyError } from '@fastify/error';

declare module 'fastify' {
  interface FastifyInstance {
    // Core infrastructure
    keyStore: IKeyStore;
    db: IDatabase;
    crypto: ICryptoService;

    // Repositories
    customerRepository: ICustomerRepository;
    productRepository: IProductRepository;
    orderRepository: IOrderRepository;
    offerRepository: IOfferRepository;
    invoiceRepository: IInvoiceRepository;
    systemConfigRepository: ISystemConfigRepository;

    // Services
    productService: ProductService;
    pricingService: PricingService;

    // HTTP Errors plugin
    httpErrors: {
      badRequest(message?: string): FastifyError;
      unauthorized(message?: string): FastifyError;
      forbidden(message?: string): FastifyError;
      notFound(message?: string): FastifyError;
      conflict(message?: string): FastifyError;
      internalServerError(message?: string): FastifyError;
    };
  }
}
