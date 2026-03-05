import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IOrderRepository } from '../../infrastructure/repositories/OrderRepository';
import { IOfferRepository } from '../../infrastructure/repositories/OfferRepository';
import { ICustomerRepository } from '../../application/ports/ICustomerRepository';
import type { Order, OrderItem } from '../../domain/order/Order';
import { transitionOrder, updateItemProduction, calcOrderTotals } from '../../domain/order/Order';
import type { OrderStatus, UUID } from '../../shared/types';
import { requireUnlocked } from '../middleware/auth';
import { generateId } from '../../shared/utils/id';
import { PDFService } from '../../infrastructure/pdf/PDFService';
import { EmailSenderService } from '../../application/services/EmailSenderService';
import fs from 'fs';

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
  const productService = fastify.productService as any;
  const configRepo = fastify.systemConfigRepository as any;
  const pdfService = new PDFService(customerRepo);
  const emailService = new EmailSenderService(configRepo);

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

      // Resolve customer names
      const customerIds = new Set(orders.map(o => o.customerId));
      const customerNames = new Map<string, string>();
      for (const cid of customerIds) {
        try {
          const customer = await customerRepo.findById(cid);
          if (customer) customerNames.set(cid, customer.name);
        } catch { /* ignore */ }
      }

      const ordersWithNames = orders.map(o => ({
        ...o,
        customerName: customerNames.get(o.customerId) ?? 'Unbekannt',
      }));

      return { orders: ordersWithNames };
    }
  );

  // GET /api/orders/production - Production view (aggregated by product)
  fastify.get(
    '/orders/production',
    { preHandler: requireUnlocked },
    async () => {
      // Load all open orders (new + in_production)
      const newOrders = await orderRepo.findAll({
        status: 'new' as OrderStatus
      });
      const inProductionOrders = await orderRepo.findAll({
        status: 'in_production' as OrderStatus
      });
      const orders = [...newOrders, ...inProductionOrders];

      // Build product name cache
      const productIds = new Set<string>();
      const customerIds = new Set<string>();
      for (const order of orders) {
        customerIds.add(order.customerId);
        for (const item of order.items) {
          productIds.add(item.productId);
        }
      }

      const productNames = new Map<string, string>();
      const productRepo = fastify.productRepository as any;
      for (const pid of productIds) {
        try {
          const product = await productRepo.findById(pid);
          if (product) productNames.set(pid, product.name);
        } catch { /* ignore */ }
      }

      const customerNames = new Map<string, string>();
      for (const cid of customerIds) {
        try {
          const customer = await customerRepo.findById(cid);
          if (customer) customerNames.set(cid, customer.name);
        } catch { /* ignore */ }
      }

      // Aggregate by product dimensions + quality
      const productionMap = new Map<string, {
        productId: string;
        productName: string;
        heightMm: number;
        widthMm: number;
        lengthMm: number;
        quality: string;
        totalQuantity: number;
        totalProduced: number;
        orders: Array<{
          orderId: string;
          orderNumber: string;
          customerName: string;
          itemId: string;
          quantity: number;
          produced: number;
          lengthMm: number;
          status: string;
        }>;
      }>();

      for (const order of orders) {
        for (const item of order.items) {
          const key = `${item.productId}-${item.heightMm}-${item.widthMm}-${item.lengthMm}-${item.quality}`;

          if (!productionMap.has(key)) {
            productionMap.set(key, {
              productId: item.productId,
              productName: productNames.get(item.productId) ?? 'Unbekannt',
              heightMm: item.heightMm,
              widthMm: item.widthMm,
              lengthMm: item.lengthMm,
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
            customerName: customerNames.get(order.customerId) ?? 'Unbekannt',
            itemId: item.id,
            quantity: item.quantity,
            produced: item.quantityProduced,
            lengthMm: item.lengthMm,
            status: order.status,
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

  // GET /api/orders/:id/pdf - Get order PDF
  fastify.get<{ Params: { id: string } }>(
    '/orders/:id/pdf',
    { preHandler: requireUnlocked },
    async (request, reply) => {
      const order = await orderRepo.findById(request.params.id as UUID);
      if (!order) {
        return fastify.httpErrors.notFound('Order not found');
      }

      if (!order.pdfPath || !fs.existsSync(order.pdfPath)) {
        return fastify.httpErrors.notFound('PDF not found');
      }

      const stream = fs.createReadStream(order.pdfPath);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="order-${order.orderNumber}.pdf"`);
      return reply.send(stream);
    }
  );

  // POST /api/orders/:id/email - Send order via email
  fastify.post<{ Params: { id: string } }>(
    '/orders/:id/email',
    { preHandler: requireUnlocked },
    async (request, reply) => {
      const order = await orderRepo.findById(request.params.id as UUID);
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const customer = await customerRepo.findById(order.customerId);
      const toEmail = customer?.contactInfo?.email;
      if (!toEmail) return reply.status(400).send({ error: 'Customer has no email address' });

      if (!order.pdfPath || !fs.existsSync(order.pdfPath)) {
        return reply.status(400).send({ error: 'PDF not generated yet or file missing' });
      }

      try {
        await emailService.sendEmailWithAttachment(
          toEmail,
          `Auftrag ${order.orderNumber}`,
          `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie die Auftragsbestätigung ${order.orderNumber}.\n\nMit freundlichen Grüßen`,
          `<p>Sehr geehrte Damen und Herren,</p><p>anbei erhalten Sie die Auftragsbestätigung ${order.orderNumber}.</p><p>Mit freundlichen Grüßen</p>`,
          order.pdfPath,
          `Auftrag-${order.orderNumber}.pdf`
        );
        return { message: 'Email sent successfully' };
      } catch (error: any) {
        return reply.status(500).send({ error: error.message || 'Failed to send email' });
      }
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
      const items: OrderItem[] = await Promise.all(data.items.map(async item => {
        const product = await productService.getById(item.productId);

        let grossTotal = 0;
        let itemPricePerM2 = item.pricePerM2;

        if (product.calcMethod === 'm2_unsorted') {
          grossTotal = (item.lengthMm / 1000) * item.quantity * item.pricePerM2;
        } else if (product.calcMethod === 'volume_divided') {
          const divider = product.volumeDivider && product.volumeDivider > 0 ? product.volumeDivider : 1;
          const pricePerLfm = (product.dimensions.heightMm * product.dimensions.widthMm) / divider;
          grossTotal = pricePerLfm * (item.lengthMm / 1000) * item.quantity;
          itemPricePerM2 = pricePerLfm;
        } else {
          const areaM2 = (product.dimensions.widthMm / 1000) * (item.lengthMm / 1000);
          grossTotal = areaM2 * item.quantity * item.pricePerM2;
        }

        const netTotal = Math.round(grossTotal * 100) / 100;

        return {
          id: generateId() as UUID,
          productId: item.productId as UUID,
          heightMm: item.heightMm,
          widthMm: item.widthMm,
          lengthMm: item.lengthMm,
          quantity: item.quantity,
          quantityProduced: 0,
          quality: item.quality,
          pricePerM2: itemPricePerM2,
          netTotal,
          productionStatus: 'not_started',
        };
      }));

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

      // Generate PDF
      const sellerAddress = await configRepo.getValue('seller_address') || 'HolzERP Musterfirma\nMusterstraße 1\n12345 Musterstadt';
      const taxNumber = await configRepo.getValue('tax_number') || undefined;
      const deliveryNote = await configRepo.getValue('delivery_note') || undefined;
      try {
        const { filePath } = await pdfService.generateOrderPDF(order, sellerAddress, taxNumber, deliveryNote);
        order.pdfPath = filePath;
        await orderRepo.update(order);
      } catch (err) {
        console.error('Failed to generate order PDF', err);
      }

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

      // Auto-transition to finished if all items are completed
      if (order.productionStatus === 'completed' && order.status === 'in_production') {
        order = transitionOrder(order, 'finished');
      }

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
