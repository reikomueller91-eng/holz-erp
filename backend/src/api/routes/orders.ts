import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { IOrderRepository } from '../../infrastructure/repositories/OrderRepository';
import { IOfferRepository } from '../../infrastructure/repositories/OfferRepository';
import { ICustomerRepository } from '../../application/ports/ICustomerRepository';
import { Order, OrderItem } from '../../domain/models/Order';
import { OrderStatus } from '../../application/types';
import { requireUnlocked } from '../middleware/auth';
import { generateId } from '../../shared/utils/id';

// Validation schemas
const OrderItemSchema = z.object({
  productId: z.string(),
  heightMm: z.number().int().positive(),
  widthMm: z.number().int().positive(),
  lengthMm: z.number().int().positive(),
  quantity: z.number().int().positive(),
  quality: z.string().default('A'),
  pricePerM2: z.number().positive()
});

const CreateOrderSchema = z.object({
  offerId: z.string().optional(),
  customerId: z.string(),
  items: z.array(OrderItemSchema).min(1),
  notes: z.string().optional(),
  vatPercent: z.number().default(19)
});

const UpdateProductionSchema = z.object({
  itemId: z.string(),
  quantityProduced: z.number().int().min(0)
});

const calculateTotals = (items: OrderItem[], vatPercent: number) => {
  const netSum = items.reduce((sum, item) => sum + item.netTotal, 0);
  const vatAmount = Math.round(netSum * (vatPercent / 100));
  const grossSum = netSum + vatAmount;
  return { netSum, vatAmount, grossSum };
};

export const orderRoutes = (
  orderRepo: IOrderRepository,
  offerRepo: IOfferRepository,
  customerRepo: ICustomerRepository
) => async (fastify: FastifyInstance): Promise<void> => {

  // List all orders
  fastify.get('/', {
    preHandler: requireUnlocked(),
    handler: async (request, reply) => {
      const { status, customerId, limit, offset } = request.query as any;
      
      const orders = await orderRepo.findAll({
        status,
        customerId,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined
      });

      return reply.send({
        success: true,
        count: orders.length,
        orders: orders.map(o => ({
          id: o.getId(),
          orderNumber: o.getOrderNumber(),
          status: o.getStatus(),
          productionStatus: o.getProductionStatus(),
          customerId: o.getCustomerId(),
          offerId: o.getOfferId(),
          netSum: o.getNetSum(),
          grossSum: o.getGrossSum(),
          createdAt: o.getCreatedAt(),
          updatedAt: o.getUpdatedAt(),
          finishedAt: o.getFinishedAt()
        }))
      });
    }
  });

  // Get production list (open items)
  fastify.get('/production', {
    preHandler: requireUnlocked(),
    handler: async (_request, reply) => {
      const orders = await orderRepo.findAll({
        status: 'in_production'
      });

      // Aggregate production items
      const productionItems = [];
      for (const order of orders) {
        const customer = await customerRepo.findById(order.getCustomerId());
        
        for (const item of order.getItems()) {
          if (item.productionStatus !== 'completed') {
            productionItems.push({
              orderId: order.getId(),
              orderNumber: order.getOrderNumber(),
              itemId: item.id,
              customerName: customer?.name || 'Unknown',
              heightMm: item.heightMm,
              widthMm: item.widthMm,
              lengthMm: item.lengthMm,
              quantityTotal: item.quantity,
              quantityProduced: item.quantityProduced,
              quantityRemaining: item.quantity - item.quantityProduced,
              quality: item.quality,
              status: item.productionStatus
            });
          }
        }
      }

      return reply.send({
        success: true,
        items: productionItems
      });
    }
  });

  // Get order by ID
  fastify.get('/:id', {
    preHandler: requireUnlocked(),
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const order = await orderRepo.findById(request.params.id);
      if (!order) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      const customer = await customerRepo.findById(order.getCustomerId());

      return reply.send({
        success: true,
        order: order.toJSON(),
        customer: customer ? {
          id: customer.id,
          customerNumber: customer.id.slice(0, 8),
          displayName: customer.name,
          contactInfo: customer.contactInfo
        } : null
      });
    }
  });

  // Create order from offer or scratch
  fastify.post('/', {
    preHandler: requireUnlocked(),
    handler: async (request, reply) => {
      const result = CreateOrderSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid input', details: result.error.errors });
      }

      const data = result.data;
      let offer = null;

      // If from offer, validate and use offer data
      if (data.offerId) {
        offer = await offerRepo.findById(data.offerId);
        if (!offer) {
          return reply.code(404).send({ error: 'Offer not found' });
        }
        if (offer.getStatus() !== 'accepted') {
          return reply.code(400).send({ error: 'Offer must be accepted before creating order' });
        }
        offer.markAsConverted('', ''); // Mark offer as converted
        await offerRepo.update(offer);
      }

      // Validate customer
      const customer = await customerRepo.findById(data.customerId);
      if (!customer) {
        return reply.code(404).send({ error: 'Customer not found' });
      }

      // Build order items
      const orderItems: OrderItem[] = data.items.map(item => ({
        id: generateId(),
        productId: item.productId,
        heightMm: item.heightMm,
        widthMm: item.widthMm,
        lengthMm: item.lengthMm,
        quantity: item.quantity,
        quantityProduced: 0,
        quality: item.quality,
        pricePerM2: item.pricePerM2,
        netTotal: Math.round(
          (item.heightMm * item.widthMm / 1000000) * 
          (item.lengthMm / 1000) * 
          item.pricePerM2 * 
          item.quantity
        ),
        productionStatus: 'not_started'
      }));

      const { netSum, vatAmount, grossSum } = calculateTotals(orderItems, data.vatPercent);

      const order = Order.create({
        orderNumber: `B${Date.now()}`,
        offerId: data.offerId,
        status: 'new' as OrderStatus,
        customerId: data.customerId,
        items: orderItems,
        netSum,
        vatPercent: data.vatPercent,
        vatAmount,
        grossSum,
        productionStatus: 'not_started',
        notes: data.notes
      });

      await orderRepo.save(order);

      return reply.code(201).send({
        success: true,
        order: order.toJSON()
      });
    }
  });

  // Update production quantity
  fastify.post('/:id/production', {
    preHandler: requireUnlocked(),
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const order = await orderRepo.findById(request.params.id);
      if (!order) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      if (order.getStatus() === 'finished' || order.getStatus() === 'picked_up') {
        return reply.code(400).send({ error: 'Cannot modify finished order' });
      }

      const result = UpdateProductionSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid input' });
      }

      const { itemId, quantityProduced } = result.data;

      try {
        order.updateItemProduction(itemId, quantityProduced);
        await orderRepo.update(order);

        return reply.send({
          success: true,
          item: order.getItems().find(i => i.id === itemId),
          orderStatus: order.getStatus(),
          productionStatus: order.getProductionStatus()
        });
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  });

  // Update order status
  fastify.post('/:id/status', {
    preHandler: requireUnlocked(),
    handler: async (request: FastifyRequest<{ Params: { id: string }; Body: { status: string } }>, reply) => {
      const order = await orderRepo.findById(request.params.id);
      if (!order) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      const { status } = request.body;

      try {
        switch (status) {
          case 'invoiced':
            order.markAsInvoiced();
            break;
          case 'paid':
            order.markAsPaid();
            break;
          case 'picked_up':
            order.markAsPickedUp();
            break;
          default:
            return reply.code(400).send({ error: 'Invalid status' });
        }

        await orderRepo.update(order);

        return reply.send({
          success: true,
          status: order.getStatus()
        });
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  });

  // Update order notes
  fastify.put('/:id/notes', {
    preHandler: requireUnlocked(),
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const order = await orderRepo.findById(request.params.id);
      if (!order) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      const { notes } = request.body as { notes: string };
      order.updateNotes(notes);
      await orderRepo.update(order);

      return reply.send({
        success: true,
        notes: order.getNotes()
      });
    }
  });
};
