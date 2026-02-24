import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IPricingService } from '../../application/services/PricingService';
import { requireUnlocked } from '../middleware/auth';

const CalculatePriceSchema = z.object({
  productId: z.string(),
  lengthMm: z.number().int().positive(),
  quantity: z.number().int().positive(),
  pricePerM2: z.number().positive(),
  qualityOverride: z.string().optional()
});

const PriceSuggestionSchema = z.object({
  productId: z.string(),
  customerId: z.string().optional()
});

export const pricingRoutes = (
  pricingService: IPricingService
) => async (fastify: FastifyInstance): Promise<void> => {
  
  // Calculate price
  fastify.post('/calculate', {
    preHandler: requireUnlocked(),
    schema: {
      body: {
        type: 'object',
        required: ['productId', 'lengthMm', 'quantity', 'pricePerM2'],
        properties: {
          productId: { type: 'string' },
          lengthMm: { type: 'number' },
          quantity: { type: 'number' },
          pricePerM2: { type: 'number' },
          qualityOverride: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      const result = CalculatePriceSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid input', details: result.error.errors });
      }

      try {
        // Get product from product service/repo
        const product = await fastify.productRepo.findById(result.data.productId);
        if (!product) {
          return reply.code(404).send({ error: 'Product not found' });
        }

        const calculation = pricingService.calculatePriceForProduct(
          product,
          result.data.lengthMm,
          result.data.quantity,
          result.data.pricePerM2,
          result.data.qualityOverride
        );

        return reply.send({
          success: true,
          calculation
        });
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: 'Calculation failed' });
      }
    }
  });

  // Get price history for product
  fastify.post('/history', {
    preHandler: requireUnlocked(),
    handler: async (request, reply) => {
      const result = PriceSuggestionSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid input' });
      }

      try {
        const history = await pricingService.getPriceHistory(
          result.data.productId,
          result.data.customerId
        );

        return reply.send({
          success: true,
          history
        });
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: 'Failed to get history' });
      }
    }
  });

  // Get price suggestion
  fastify.post('/suggest', {
    preHandler: requireUnlocked(),
    handler: async (request, reply) => {
      const result = PriceSuggestionSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid input' });
      }

      try {
        // Get product current price (would need ProductService/Repo method)
        // For now using a default or the route would need pricePerM2 added to schema
        const basePrice = 100; // Placeholder - should get from product price history

        const suggestion = await pricingService.suggestPrice(
          result.data.productId,
          basePrice,
          result.data.customerId
        );

        return reply.send({
          success: true,
          suggestion
        });
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: 'Failed to get suggestion' });
      }
    }
  });
};

declare module 'fastify' {
  interface FastifyInstance {
    productRepo: any;
  }
}
