import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ProductService } from '../../application/services/ProductService';
import type { UUID } from '../../shared/types';
import { WOOD_TYPES, QUALITY_GRADES } from '../../shared/types';
import { requireUnlocked } from '../middleware/auth';

// Accept both field names for flexibility
const CreateProductBody = z.object({
  name: z.string().min(1).max(200),
  woodType: z.enum(WOOD_TYPES),
  qualityGrade: z.enum(QUALITY_GRADES),
  heightMm: z.number().int().positive(),
  widthMm: z.number().int().positive(),
  description: z.string().max(2000).optional(),
  // Accept both field names
  initialPricePerM2: z.number().positive().optional(),
  currentPricePerM2: z.number().positive().optional(),
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
  currentPricePerM2: z.number().positive().optional(),
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

  // GET /api/products - return flat array for frontend
  fastify.get(
    '/products',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Querystring: z.infer<typeof ListQuerySchema> }>) => {
      const query = ListQuerySchema.parse(request.query);
      const products = await productService.list(query);
      
      // Flatten and add currentPricePerM2 to each product
      const productsWithPrice = await Promise.all(
        products.map(async (product) => {
          const priceHistory = await productService.getPriceHistory(product.id);
          const currentPrice = priceHistory[0];
          return {
            ...product,
            // Flatten dimensions
            heightMm: product.dimensions.heightMm,
            widthMm: product.dimensions.widthMm,
            currentPricePerM2: currentPrice?.pricePerM2 ?? 0,
          };
        })
      );
      
      return productsWithPrice; // Return array directly
    }
  );

  // GET /api/products/:id
  fastify.get(
    '/products/:id',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const product = await productService.getById(request.params.id as UUID);
      const priceHistory = await productService.getPriceHistory(product.id);
      const currentPrice = priceHistory[0];
      
      return {
        ...product,
        heightMm: product.dimensions.heightMm,
        widthMm: product.dimensions.widthMm,
        currentPricePerM2: currentPrice?.pricePerM2 ?? 0,
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

      // Add initial price if provided (accept both field names)
      const price = body.initialPricePerM2 ?? body.currentPricePerM2;
      if (price) {
        await productService.addPrice({
          productId: product.id,
          pricePerM2: price,
          effectiveFrom: new Date().toISOString(),
          reason: body.priceReason,
        });
      }

      const priceHistory = await productService.getPriceHistory(product.id);
      const currentPrice = priceHistory[0];

      return {
        ...product,
        heightMm: product.dimensions.heightMm,
        widthMm: product.dimensions.widthMm,
        currentPricePerM2: currentPrice?.pricePerM2 ?? 0,
      };
    }
  );

  // PUT /api/products/:id
  fastify.put(
    '/products/:id',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof UpdateProductBody> }>) => {
      const body = UpdateProductBody.parse(request.body);
      
      const updates: Record<string, unknown> = {};
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

      // Update price if provided
      if (body.currentPricePerM2 !== undefined) {
        await productService.addPrice({
          productId: product.id,
          pricePerM2: body.currentPricePerM2,
          effectiveFrom: new Date().toISOString(),
          reason: 'Price update',
        });
      }

      const priceHistory = await productService.getPriceHistory(product.id);
      const currentPrice = priceHistory[0];

      return {
        ...product,
        heightMm: product.dimensions.heightMm,
        widthMm: product.dimensions.widthMm,
        currentPricePerM2: currentPrice?.pricePerM2 ?? 0,
      };
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
      return history;
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

      return entry;
    }
  );
}
