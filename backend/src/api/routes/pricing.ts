import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PricingService } from '../../application/services/PricingService';
import type { UUID } from '../../shared/types';
import { requireUnlocked } from '../middleware/auth';

const CalculatePriceSchema = z.object({
  heightMm: z.number().int().positive(),
  widthMm: z.number().int().positive(),
  lengthMm: z.number().int().positive(),
  quantity: z.number().int().positive(),
  basePricePerM2: z.number().positive(),
  quality: z.string().optional(),
});

const PriceHistorySchema = z.object({
  productId: z.string(),
  customerId: z.string().optional(),
});

const SuggestPriceSchema = z.object({
  productId: z.string(),
  basePrice: z.number().positive(),
  customerId: z.string().optional(),
});

export async function pricingRoutes(fastify: FastifyInstance) {
  const pricingService = fastify.pricingService as PricingService;

  // POST /api/pricing/calculate
  fastify.post<{ Body: z.infer<typeof CalculatePriceSchema> }>(
    '/pricing/calculate',
    { preHandler: requireUnlocked },
    async (request) => {
      const data = CalculatePriceSchema.parse(request.body);
      
      const result = pricingService.calculatePrice(
        data.heightMm,
        data.widthMm,
        data.lengthMm,
        data.quantity,
        data.basePricePerM2,
        data.quality
      );

      return { result };
    }
  );

  // POST /api/pricing/history
  fastify.post<{ Body: z.infer<typeof PriceHistorySchema> }>(
    '/pricing/history',
    { preHandler: requireUnlocked },
    async (request) => {
      const data = PriceHistorySchema.parse(request.body);
      
      const history = await pricingService.getPriceHistory(
        data.productId as UUID,
        data.customerId as UUID | undefined
      );

      return { history };
    }
  );

  // POST /api/pricing/suggest
  fastify.post<{ Body: z.infer<typeof SuggestPriceSchema> }>(
    '/pricing/suggest',
    { preHandler: requireUnlocked },
    async (request) => {
      const data = SuggestPriceSchema.parse(request.body);
      
      const suggestion = await pricingService.suggestPrice(
        data.productId as UUID,
        data.basePrice,
        data.customerId as UUID | undefined
      );

      return { suggestion };
    }
  );
}
