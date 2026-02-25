import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ProductService } from '../../application/services/ProductService';
import type { UUID } from '../../shared/types';
import { WOOD_TYPES, QUALITY_GRADES } from '../../shared/types';
import { requireUnlocked } from '../middleware/auth';

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
  effectiveFrom: z.string().optional(),
  reason: z.string().max(500).optional(),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  isActive: z.coerce.boolean().optional(),
  woodType: z.enum(WOOD_TYPES).optional(),
  qualityGrade: z.enum(QUALITY_GRADES).optional(),
});

export async function productRoutes(fastify: FastifyInstance) {
  const productService = fastify.productService as ProductService;

  // GET /api/products
  fastify.get(
    '/products',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Querystring: z.infer<typeof ListQuerySchema> }>) => {
      const query = ListQuerySchema.parse(request.query);
      const products = await productService.list(query);
      return { products };
    }
  );

  // GET /api/products/:id
  fastify.get(
    '/products/:id',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const product = await productService.getById(request.params.id as UUID);
      const priceHistory = await productService.getPriceHistory(product.id);
      const currentPrice = priceHistory[0]; // Most recent
      
      return {
        product,
        currentPricePerM2: currentPrice?.pricePerM2 ?? null,
      };
    }
  );

  // POST /api/products
  fastify.post(
    '/products',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Body: z.infer<typeof CreateProductBody> }>) => {
      const body = CreateProductBody.parse(request.body);
      const product = await productService.create(body);

      // Add initial price if provided
      if (body.initialPricePerM2) {
        await productService.addPrice({
          productId: product.id,
          pricePerM2: body.initialPricePerM2,
          effectiveFrom: new Date().toISOString(),
          reason: body.priceReason,
        });
      }

      return { product };
    }
  );

  // PUT /api/products/:id
  fastify.put(
    '/products/:id',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof UpdateProductBody> }>) => {
      const body = UpdateProductBody.parse(request.body);
      
      const updates: any = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.woodType !== undefined) updates.woodType = body.woodType;
      if (body.qualityGrade !== undefined) updates.qualityGrade = body.qualityGrade;
      if (body.description !== undefined) updates.description = body.description;
      if (body.isActive !== undefined) updates.isActive = body.isActive;
      
      if (body.heightMm !== undefined || body.widthMm !== undefined) {
        const current = await productService.getById(request.params.id as UUID);
        updates.dimensions = {
          heightMm: body.heightMm ?? current.dimensions.heightMm,
          widthMm: body.widthMm ?? current.dimensions.widthMm,
        };
      }

      const product = await productService.update(request.params.id as UUID, updates);
      return { product };
    }
  );

  // DELETE /api/products/:id
  fastify.delete(
    '/products/:id',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      await productService.delete(request.params.id as UUID);
      return { success: true };
    }
  );

  // GET /api/products/:id/price-history
  fastify.get(
    '/products/:id/price-history',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const history = await productService.getPriceHistory(request.params.id as UUID);
      return { history };
    }
  );

  // POST /api/products/:id/price
  fastify.post(
    '/products/:id/price',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof SetPriceBody> }>) => {
      const body = SetPriceBody.parse(request.body);
      
      const entry = await productService.addPrice({
        productId: request.params.id as UUID,
        pricePerM2: body.pricePerM2,
        effectiveFrom: body.effectiveFrom || new Date().toISOString(),
        reason: body.reason,
      });

      return { entry };
    }
  );
}
