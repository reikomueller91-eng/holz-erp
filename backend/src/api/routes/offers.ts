import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { IOfferRepository } from '../../infrastructure/repositories/OfferRepository';
import { ICustomerRepository } from '../../application/ports/ICustomerRepository';
import { IProductRepository } from '../../application/ports/IProductRepository';
import { Offer, OfferItem } from '../../domain/models/Offer';
import { OfferStatus } from '../../application/types';
import { requireUnlocked } from '../middleware/auth';
import { generateId } from '../../shared/utils/id';
import { IPricingService } from '../../application/services/PricingService';

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
  inquirySource: z.enum(['Email', 'WhatsApp', 'Phone', 'Kleinanzeigen', 'Other']),
  inquiryContact: z.string().optional(),
  sellerAddress: z.string(),
  customerAddress: z.string(),
  validUntil: z.string().datetime().optional(),
  items: z.array(OfferItemSchema).min(1),
  notes: z.string().optional(),
  vatPercent: z.number().default(19)
});

const UpdateOfferSchema = z.object({
  inquirySource: z.enum(['Email', 'WhatsApp', 'Phone', 'Kleinanzeigen', 'Other']).optional(),
  inquiryContact: z.string().optional(),
  validUntil: z.string().datetime().optional(),
  items: z.array(OfferItemSchema).optional(),
  notes: z.string().optional(),
  vatPercent: z.number().optional()
});

const calculateTotals = (items: OfferItem[], vatPercent: number) => {
  const netSum = items.reduce((sum, item) => sum + item.netTotal, 0);
  const vatAmount = Math.round(netSum * (vatPercent / 100));
  const grossSum = netSum + vatAmount;
  return { netSum, vatAmount, grossSum };
};

export const offerRoutes = (
  offerRepo: IOfferRepository,
  customerRepo: ICustomerRepository,
  productRepo: IProductRepository,
  pricingService: IPricingService
) => async (fastify: FastifyInstance): Promise<void> => {

  // List all offers
  fastify.get('/', {
    preHandler: requireUnlocked(),
    handler: async (request, reply) => {
      const { status, customerId, limit, offset } = request.query as any;
      
      const offers = await offerRepo.findAll({
        status,
        customerId,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined
      });

      return reply.send({
        success: true,
        count: offers.length,
        offers: offers.map(o => ({
          id: o.getId(),
          offerNumber: o.getOfferNumber(),
          version: o.getVersion(),
          status: o.getStatus(),
          date: o.getDate(),
          customerId: o.getCustomerId(),
          inquirySource: o.getInquirySource(),
          netSum: o.getNetSum(),
          grossSum: o.getGrossSum(),
          createdAt: o.getCreatedAt(),
          updatedAt: o.getUpdatedAt()
        }))
      });
    }
  });

  // Get offer by ID
  fastify.get('/:id', {
    preHandler: requireUnlocked(),
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const offer = await offerRepo.findById(request.params.id);
      if (!offer) {
        return reply.code(404).send({ error: 'Offer not found' });
      }

      // Get customer details
      const customer = await customerRepo.findById(offer.getCustomerId());

      return reply.send({
        success: true,
        offer: {
          ...offer.toJSON(),
          versions: offer.getVersionHistory().map(v => ({
            version: v.version,
            createdAt: v.createdAt,
            createdBy: v.createdBy,
            changes: v.changes
          }))
        },
        customer: customer ? {
          id: customer.id,
          customerNumber: customer.id.slice(0, 8),
          displayName: customer.name
        } : null
      });
    }
  });

  // Create new offer
  fastify.post('/', {
    preHandler: requireUnlocked(),
    handler: async (request, reply) => {
      const result = CreateOfferSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid input', details: result.error.errors });
      }

      const data = result.data;

      // Validate customer exists
      const customer = await customerRepo.findById(data.customerId);
      if (!customer) {
        return reply.code(404).send({ error: 'Customer not found' });
      }

      // Build offer items
      const offerItems: OfferItem[] = [];
      for (const item of data.items) {
        const product = await productRepo.findById(item.productId);
        if (!product) {
          return reply.code(404).send({ error: `Product ${item.productId} not found` });
        }

        // Calculate price using pricing service
        const calculation = pricingService.calculatePrice(
          product.dimensions.heightMm,
          product.dimensions.widthMm,
          item.lengthMm,
          item.quantity,
          item.pricePerM2,
          item.quality
        );

        offerItems.push({
          id: generateId(),
          productId: item.productId,
          heightMm: item.heightMm,
          widthMm: item.widthMm,
          lengthMm: item.lengthMm,
          quantity: item.quantity,
          quality: item.quality,
          pricePerM2: item.pricePerM2,
          netTotal: calculation.finalTotal
        });
      }

      const { netSum, vatAmount, grossSum } = calculateTotals(offerItems, data.vatPercent);

      const offer = Offer.create({
        offerNumber: `A${Date.now()}`, // Generate offer number
        status: 'draft' as OfferStatus,
        date: new Date(),
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
        inquirySource: data.inquirySource,
        inquiryContact: data.inquiryContact,
        customerId: data.customerId,
        sellerAddress: data.sellerAddress,
        customerAddress: data.customerAddress,
        items: offerItems,
        netSum,
        vatPercent: data.vatPercent,
        vatAmount,
        grossSum,
        notes: data.notes
      });

      await offerRepo.save(offer);

      return reply.code(201).send({
        success: true,
        offer: offer.toJSON()
      });
    }
  });

  // Update offer
  fastify.put('/:id', {
    preHandler: requireUnlocked(),
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const offer = await offerRepo.findById(request.params.id);
      if (!offer) {
        return reply.code(404).send({ error: 'Offer not found' });
      }

      if (!offer.isEditable()) {
        return reply.code(400).send({ error: 'Offer cannot be modified in current state' });
      }

      const result = UpdateOfferSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid input' });
      }

      const data = result.data;
      const changes: string[] = [];

      // Build updated items if provided
      let updatedItems = offer.getItems();
      let updatedVatPercent = offer.getVatPercent();

      if (data.items) {
        changes.push(`Updated ${data.items.length} items`);
        updatedItems = [];
        for (const item of data.items) {
          const product = await productRepo.findById(item.productId);
          if (!product) {
            return reply.code(404).send({ error: `Product ${item.productId} not found` });
          }

          const calculation = pricingService.calculatePrice(
            product.dimensions.heightMm,
            product.dimensions.widthMm,
            item.lengthMm,
            item.quantity,
            item.pricePerM2,
            item.quality
          );

          updatedItems.push({
            id: generateId(),
            productId: item.productId,
            heightMm: item.heightMm,
            widthMm: item.widthMm,
            lengthMm: item.lengthMm,
            quantity: item.quantity,
            quality: item.quality,
            pricePerM2: item.pricePerM2,
            netTotal: calculation.finalTotal
          });
        }
      }

      if (data.vatPercent !== undefined && data.vatPercent !== offer.getVatPercent()) {
        changes.push(`VAT changed from ${offer.getVatPercent()}% to ${data.vatPercent}%`);
        updatedVatPercent = data.vatPercent;
      }

      if (data.notes !== undefined && data.notes !== offer.getNotes()) {
        changes.push('Notes updated');
      }

      const { netSum, vatAmount, grossSum } = calculateTotals(updatedItems, updatedVatPercent);

      offer.update({
        inquirySource: data.inquirySource,
        inquiryContact: data.inquiryContact,
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
        items: updatedItems,
        netSum,
        vatPercent: updatedVatPercent,
        vatAmount,
        grossSum,
        notes: data.notes
      }, changes);

      await offerRepo.update(offer);

      return reply.send({
        success: true,
        offer: offer.toJSON()
      });
    }
  });

  // Change offer status
  fastify.post('/:id/status', {
    preHandler: requireUnlocked(),
    handler: async (request: FastifyRequest<{ Params: { id: string }; Body: { status: string } }>, reply) => {
      const offer = await offerRepo.findById(request.params.id);
      if (!offer) {
        return reply.code(404).send({ error: 'Offer not found' });
      }

      const { status } = request.body;

      try {
        switch (status) {
          case 'sent':
            offer.markAsSent();
            break;
          case 'accepted':
            offer.markAsAccepted();
            break;
          case 'rejected':
            offer.markAsRejected();
            break;
          default:
            return reply.code(400).send({ error: 'Invalid status' });
        }

        await offerRepo.update(offer);

        return reply.send({
          success: true,
          status: offer.getStatus()
        });
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  });

  // Get specific version
  fastify.get('/:id/versions/:version', {
    preHandler: requireUnlocked(),
    handler: async (request: FastifyRequest<{ Params: { id: string; version: string } }>, reply) => {
      const offer = await offerRepo.findById(request.params.id);
      if (!offer) {
        return reply.code(404).send({ error: 'Offer not found' });
      }

      const version = offer.getVersionByNumber(parseInt(request.params.version));
      if (!version) {
        return reply.code(404).send({ error: 'Version not found' });
      }

      return reply.send({
        success: true,
        version
      });
    }
  });
};
