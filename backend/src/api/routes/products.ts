import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ProductService, CreateProductInput, UpdateProductInput, SetPriceInput } from '../../application/services/ProductService';
import type { UUID } from '../../shared/types';
import { WOOD_TYPES, QUALITY_GRADES } from '../../shared/types';
import { LockedError } from '../../shared/errors';

interface ProductRouteDeps {
  productService: ProductService;
}

// ─── Validation schemas ────────────────────────────────────────────

const CreateProductBody = z.object({
  name: z.string().min(1).max(200),
  woodType: z.enum(WOOD_TYPES),
  qualityGrade: z.enum(QUALITY_GRADES),
  heightMm: z.number().int().positive(),
  widthMm: z.number().int().positive(),
  description: z.string().max(2000).optional(),
  initialPricePerM2: z.number().positive().optional(),
  priceReason: z.string().optional(),
});

const UpdateProductBody = z.object({
  name: z.string().min(1).max(200).optional(),
  woodType: z.enum(WOOD_TYPES).optional(),
  qualityGrade: z.enum(QUALITY_GRADES).optional(),
  heightMm: z.number().int().positive().optional(),
  widthMm: z.number().int().positive().optional(),
  description: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
});

const SetPriceBody = z.object({
  pricePerM2: z.number().positive(),
  effectiveFrom: z.string().datetime().optional(),
  reason: z.string().max(500).optional(),
});

const ListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  includeInactive: z.coerce.boolean().default(false),
  woodType: z.enum(WOOD_TYPES).optional(),
  qualityGrade: z.enum(QUALITY_GRADES).optional(),
});

// ─── Guard: require unlocked ────────────────────────────────────────

function requireUnlocked(server: FastifyInstance): void {
  if (!server.keyStore.isUnlocked()) {
    throw new LockedError();
  }
}

/**
 * Product CRUD + pricing routes.
 *
 * All endpoints require the system to be unlocked.
 * Registered at prefix /api → endpoints are /api/products/...
 */
export function registerProductRoutes(
  server: FastifyInstance,
  deps: ProductRouteDeps,
): void {
  const { productService } = deps;

  // GET /api/products
  server.get('/products', async (request, reply) => {
    requireUnlocked(server);
    const query = ListQuerySchema.parse(request.query);
    const result = productService.list({
      page: query.page,
      pageSize: query.pageSize,
      includeInactive: query.includeInactive,
      ...(query.woodType !== undefined ? { woodType: query.woodType } : {}),
      ...(query.qualityGrade !== undefined ? { qualityGrade: query.qualityGrade } : {}),
    });
    return reply.send(result);
  });

  // GET /api/products/:id
  server.get<{ Params: { id: string } }>(
    '/products/:id',
    async (request, reply) => {
      requireUnlocked(server);
      const product = productService.getById(request.params.id as UUID);
      const currentPrice = productService.getCurrentPrice(product.id);
      return reply.send({ ...product, currentPricePerM2: currentPrice?.pricePerM2 ?? null });
    },
  );

  // POST /api/products
  server.post('/products', async (request, reply) => {
    requireUnlocked(server);
    const body = CreateProductBody.parse(request.body);
    // Explicit construction required due to exactOptionalPropertyTypes: true
    const input: CreateProductInput = {
      name: body.name,
      woodType: body.woodType,
      qualityGrade: body.qualityGrade,
      heightMm: body.heightMm,
      widthMm: body.widthMm,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.initialPricePerM2 !== undefined ? { initialPricePerM2: body.initialPricePerM2 } : {}),
      ...(body.priceReason !== undefined ? { priceReason: body.priceReason } : {}),
    };
    const product = productService.create(input);
    return reply.status(201).send(product);
  });

  // PUT /api/products/:id
  server.put<{ Params: { id: string } }>(
    '/products/:id',
    async (request, reply) => {
      requireUnlocked(server);
      const body = UpdateProductBody.parse(request.body);
      // Explicit construction required due to exactOptionalPropertyTypes: true
      const input: UpdateProductInput = {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.woodType !== undefined ? { woodType: body.woodType } : {}),
        ...(body.qualityGrade !== undefined ? { qualityGrade: body.qualityGrade } : {}),
        ...(body.heightMm !== undefined ? { heightMm: body.heightMm } : {}),
        ...(body.widthMm !== undefined ? { widthMm: body.widthMm } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      };
      const product = productService.update(request.params.id as UUID, input);
      return reply.send(product);
    },
  );

  // DELETE /api/products/:id  (soft delete)
  server.delete<{ Params: { id: string } }>(
    '/products/:id',
    async (request, reply) => {
      requireUnlocked(server);
      productService.delete(request.params.id as UUID);
      return reply.status(204).send();
    },
  );

  // GET /api/products/:id/price-history
  server.get<{ Params: { id: string } }>(
    '/products/:id/price-history',
    async (request, reply) => {
      requireUnlocked(server);
      const history = productService.getPriceHistory(request.params.id as UUID);
      return reply.send({ data: history });
    },
  );

  // POST /api/products/:id/price  — set new price (closes previous)
  server.post<{ Params: { id: string } }>(
    '/products/:id/price',
    async (request, reply) => {
      requireUnlocked(server);
      const body = SetPriceBody.parse(request.body);
      // Explicit construction required due to exactOptionalPropertyTypes: true
      const input: SetPriceInput = {
        pricePerM2: body.pricePerM2,
        ...(body.effectiveFrom !== undefined ? { effectiveFrom: body.effectiveFrom } : {}),
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
      };
      const entry = productService.setPrice(request.params.id as UUID, input);
      return reply.status(201).send(entry);
    },
  );
}
