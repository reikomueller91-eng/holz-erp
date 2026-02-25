import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { IOfferRepository } from '../../infrastructure/repositories/OfferRepository';
import { ICustomerRepository } from '../../application/ports/ICustomerRepository';
import type { Offer, OfferItem } from '../../domain/offer/Offer';
import { transitionOffer, createOfferVersion, calcOfferTotals } from '../../domain/offer/Offer';
import type { OfferStatus, UUID } from '../../shared/types';
import { requireUnlocked } from '../middleware/auth';
import { generateId } from '../../shared/utils/id';

// Validation schemas
const OfferItemSchema = z.object({
  productId: z.string(),
  heightMm: z.number().int().positive(),
  widthMm: z.number().int().positive(),
  lengthMm: z.number().int().positive(),
  quantity: z.number().int().positive(),
  quality: z.string().default('A'),
  pricePerM2: z.number().positive()
});

const CreateOfferSchema = z.object({
  customerId: z.string(),
  sellerAddress: z.string(),
  customerAddress: z.string(),
  inquirySource: z.string().default('direct'),
  inquiryContact: z.string().optional(),
  items: z.array(OfferItemSchema).min(1),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  vatPercent: z.number().default(19)
});

const UpdateOfferSchema = z.object({
  items: z.array(OfferItemSchema).optional(),
  sellerAddress: z.string().optional(),
  customerAddress: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional()
});

const ChangeStatusSchema = z.object({
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'cancelled', 'converted'])
});

export async function offerRoutes(fastify: FastifyInstance) {
  const offerRepo = fastify.offerRepository as IOfferRepository;
  const customerRepo = fastify.customerRepository as ICustomerRepository;

  // GET /api/offers - List all offers
  fastify.get(
    '/offers',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Querystring: { status?: string; customerId?: string; limit?: string; offset?: string } }>) => {
      const { status, customerId, limit, offset } = request.query;
      
      const offers = await offerRepo.findAll({
        status: status as OfferStatus | undefined,
        customerId: customerId as UUID | undefined,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
      });

      return { offers };
    }
  );

  // GET /api/offers/:id - Get single offer with version history
  fastify.get(
    '/offers/:id',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const offer = await offerRepo.findById(request.params.id as UUID);
      if (!offer) {
        return fastify.httpErrors.notFound('Offer not found');
      }

      const versions = await offerRepo.getVersionHistory(offer.id);
      
      return {
        offer,
        versions,
      };
    }
  );

  // POST /api/offers - Create offer
  fastify.post(
    '/offers',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Body: z.infer<typeof CreateOfferSchema> }>) => {
      const data = CreateOfferSchema.parse(request.body);

      // Generate offer number
      const offerCount = (await offerRepo.findAll()).length;
      const offerNumber = `OFF-${String(offerCount + 1).padStart(6, '0')}`;

      // Build items
      const items: OfferItem[] = data.items.map(item => {
        const areaM2 = (item.heightMm / 1000) * (item.widthMm / 1000) * (item.lengthMm / 1000);
        const netTotal = Math.round(areaM2 * item.quantity * item.pricePerM2);

        return {
          id: generateId() as UUID,
          productId: item.productId as UUID,
          heightMm: item.heightMm,
          widthMm: item.widthMm,
          lengthMm: item.lengthMm,
          quantity: item.quantity,
          quality: item.quality,
          pricePerM2: item.pricePerM2,
          netTotal,
        };
      });

      const totals = calcOfferTotals(items, data.vatPercent);

      const offer: Offer = {
        id: generateId() as UUID,
        offerNumber,
        version: 1,
        customerId: data.customerId as UUID,
        status: 'draft',
        date: new Date().toISOString().split('T')[0],
        validUntil: data.validUntil,
        inquirySource: data.inquirySource,
        inquiryContact: data.inquiryContact,
        sellerAddress: data.sellerAddress,
        customerAddress: data.customerAddress,
        items,
        ...totals,
        vatPercent: data.vatPercent,
        notes: data.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await offerRepo.save(offer);

      return { offer };
    }
  );

  // PUT /api/offers/:id - Update offer (creates new version)
  fastify.put(
    '/offers/:id',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof UpdateOfferSchema> }>) => {
      const data = UpdateOfferSchema.parse(request.body);
      
      let offer = await offerRepo.findById(request.params.id as UUID);
      if (!offer) {
        return fastify.httpErrors.notFound('Offer not found');
      }

      // Save current version before update
      const version = createOfferVersion(offer);
      await offerRepo.saveVersion(offer.id, version);

      // Update offer
      const updates: Partial<Offer> = {
        version: offer.version + 1,
        updatedAt: new Date().toISOString(),
      };

      if (data.sellerAddress) updates.sellerAddress = data.sellerAddress;
      if (data.customerAddress) updates.customerAddress = data.customerAddress;
      if (data.validUntil !== undefined) updates.validUntil = data.validUntil;
      if (data.notes !== undefined) updates.notes = data.notes;

      if (data.items) {
        const items: OfferItem[] = data.items.map(item => {
          const areaM2 = (item.heightMm / 1000) * (item.widthMm / 1000) * (item.lengthMm / 1000);
          const netTotal = Math.round(areaM2 * item.quantity * item.pricePerM2);

          return {
            id: generateId() as UUID,
            productId: item.productId as UUID,
            heightMm: item.heightMm,
            widthMm: item.widthMm,
            lengthMm: item.lengthMm,
            quantity: item.quantity,
            quality: item.quality,
            pricePerM2: item.pricePerM2,
            netTotal,
          };
        });

        const totals = calcOfferTotals(items, offer.vatPercent);
        updates.items = items;
        Object.assign(updates, totals);
      }

      offer = { ...offer, ...updates };
      await offerRepo.update(offer);

      return { offer };
    }
  );

  // POST /api/offers/:id/status - Change offer status
  fastify.post(
    '/offers/:id/status',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof ChangeStatusSchema> }>) => {
      const data = ChangeStatusSchema.parse(request.body);
      
      let offer = await offerRepo.findById(request.params.id as UUID);
      if (!offer) {
        return fastify.httpErrors.notFound('Offer not found');
      }

      offer = transitionOffer(offer, data.status as OfferStatus);
      await offerRepo.update(offer);

      return { offer };
    }
  );

  // GET /api/offers/:id/versions/:version - Get specific version
  fastify.get(
    '/offers/:id/versions/:version',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string; version: string } }>) => {
      const versions = await offerRepo.getVersionHistory(request.params.id as UUID);
      const versionNum = parseInt(request.params.version);
      const version = versions.find(v => v.version === versionNum);
      
      if (!version) {
        return fastify.httpErrors.notFound('Version not found');
      }

      return { version };
    }
  );
}
