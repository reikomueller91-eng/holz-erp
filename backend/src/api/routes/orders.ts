import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { IOrderRepository } from '../../infrastructure/repositories/OrderRepository';
import { IOfferRepository } from '../../infrastructure/repositories/OfferRepository';
import { ICustomerRepository } from '../../application/ports/ICustomerRepository';
import type { Order, OrderItem } from '../../domain/order/Order';
import { transitionOrder, updateItemProduction, calcOrderTotals } from '../../domain/order/Order';
import type { OrderStatus, UUID } from '../../shared/types';
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

const ChangeStatusSchema = z.object({
  status: z.enum(['new', 'in_production', 'finished', 'invoiced', 'paid', 'picked_up', 'cancelled'])
});

export async function orderRoutes(fastify: FastifyInstance) {
  const orderRepo = fastify.orderRepository as IOrderRepository;
  const offerRepo = fastify.offerRepository as IOfferRepository;
  const customerRepo = fastify.customerRepository as ICustomerRepository;

  // GET /api/orders - List all orders
  fastify.get<{ Querystring: { status?: string; customerId?: string; limit?: string; offset?: string } }>(
    '/orders',
    { preHandler: requireUnlocked },
    async (request) => {
      const { status, customerId, limit, offset } = request.query;
      
      const orders = await orderRepo.findAll({
        status: status as OrderStatus | undefined,
        customerId: customerId as UUID | undefined,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
      });

      return { orders };
    }
  );

  // GET /api/orders/production - Production view (aggregated by product)
  fastify.get(
    '/orders/production',
    { preHandler: requireUnlocked },
    async () => {
      const orders = await orderRepo.findAll({ 
        status: 'in_production' as OrderStatus 
      });

      // Aggregate by product
      const productionMap = new Map<string, {
        productId: string;
        heightMm: number;
        widthMm: number;
        quality: string;
        totalQuantity: number;
        totalProduced: number;
        orders: Array<{ orderId: string; orderNumber: string; itemId: string; quantity: number; produced: number }>;
      }>();

      for (const order of orders) {
        for (const item of order.items) {
          const key = `${item.productId}-${item.heightMm}-${item.widthMm}-${item.quality}`;
          
          if (!productionMap.has(key)) {
            productionMap.set(key, {
              productId: item.productId,
              heightMm: item.heightMm,
              widthMm: item.widthMm,
              quality: item.quality,
              totalQuantity: 0,
              totalProduced: 0,
              orders: [],
            });
          }

          const entry = productionMap.get(key)!;
          entry.totalQuantity += item.quantity;
          entry.totalProduced += item.quantityProduced;
          entry.orders.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            itemId: item.id,
            quantity: item.quantity,
            produced: item.quantityProduced,
          });
        }
      }

      return {
        production: Array.from(productionMap.values()),
      };
    }
  );

  // GET /api/orders/:id - Get single order
  fastify.get<{ Params: { id: string } }>(
    '/orders/:id',
    { preHandler: requireUnlocked },
    async (request) => {
      const order = await orderRepo.findById(request.params.id as UUID);
      if (!order) {
        return fastify.httpErrors.notFound('Order not found');
      }

      const customer = await customerRepo.findById(order.customerId);
      
      return {
        order,
        customer,
      };
    }
  );

  // POST /api/orders - Create order
  fastify.post<{ Body: z.infer<typeof CreateOrderSchema> }>(
    '/orders',
    { preHandler: requireUnlocked },
    async (request) => {
      const data = CreateOrderSchema.parse(request.body);

      // Generate order number
      const orderCount = (await orderRepo.findAll()).length;
      const orderNumber = `ORD-${String(orderCount + 1).padStart(6, '0')}`;

      // Build items
      const items: OrderItem[] = data.items.map(item => {
        const areaM2 = (item.heightMm / 1000) * (item.widthMm / 1000) * (item.lengthMm / 1000);
        const netTotal = Math.round(areaM2 * item.quantity * item.pricePerM2);

        return {
          id: generateId() as UUID,
          productId: item.productId as UUID,
          heightMm: item.heightMm,
          widthMm: item.widthMm,
          lengthMm: item.lengthMm,
          quantity: item.quantity,
          quantityProduced: 0,
          quality: item.quality,
          pricePerM2: item.pricePerM2,
          netTotal,
          productionStatus: 'not_started',
        };
      });

      const totals = calcOrderTotals(items, data.vatPercent);

      const order: Order = {
        id: generateId() as UUID,
        orderNumber,
        offerId: data.offerId as UUID | undefined,
        status: 'new',
        customerId: data.customerId as UUID,
        items,
        ...totals,
        vatPercent: data.vatPercent,
        productionStatus: 'not_started',
        notes: data.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await orderRepo.save(order);

      // If created from offer, mark offer as converted
      if (data.offerId) {
        const offer = await offerRepo.findById(data.offerId as UUID);
        if (offer) {
          const converted = transitionOrder as any; // Type hack for now
          await offerRepo.update(converted);
        }
      }

      return { order };
    }
  );

  // POST /api/orders/:id/production - Update production progress
  fastify.post<{ Params: { id: string }; Body: z.infer<typeof UpdateProductionSchema> }>(
    '/orders/:id/production',
    { preHandler: requireUnlocked },
    async (request) => {
      const data = UpdateProductionSchema.parse(request.body);
      
      let order = await orderRepo.findById(request.params.id as UUID);
      if (!order) {
        return fastify.httpErrors.notFound('Order not found');
      }

      order = updateItemProduction(order, data.itemId as UUID, data.quantityProduced);
      await orderRepo.update(order);

      return { order };
    }
  );

  // POST /api/orders/:id/status - Change order status
  fastify.post<{ Params: { id: string }; Body: z.infer<typeof ChangeStatusSchema> }>(
    '/orders/:id/status',
    { preHandler: requireUnlocked },
    async (request) => {
      const data = ChangeStatusSchema.parse(request.body);
      
      let order = await orderRepo.findById(request.params.id as UUID);
      if (!order) {
        return fastify.httpErrors.notFound('Order not found');
      }

      order = transitionOrder(order, data.status as OrderStatus);
      await orderRepo.update(order);

      return { order };
    }
  );
}
