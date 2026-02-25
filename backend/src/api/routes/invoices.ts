import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { IInvoiceRepository } from '../../infrastructure/repositories/InvoiceRepository';
import { IOrderRepository } from '../../infrastructure/repositories/OrderRepository';
import { ICustomerRepository } from '../../application/ports/ICustomerRepository';
import { PDFService } from '../../infrastructure/pdf/PDFService';
import type { Invoice, InvoiceLineItem } from '../../domain/invoice/Invoice';
import { transitionInvoice, finalizeInvoice, createInvoiceVersion, calcInvoiceTotals, generateInvoiceNumber } from '../../domain/invoice/Invoice';
import type { InvoiceStatus, UUID } from '../../shared/types';
import { requireUnlocked } from '../middleware/auth';
import { generateId } from '../../shared/utils/id';

const InvoiceItemSchema = z.object({
  orderItemId: z.string().optional(),
  productId: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().default('Stk'),
  unitPrice: z.number().positive(),
});

const CreateInvoiceSchema = z.object({
  orderId: z.string(),
  sellerAddress: z.string().min(1),
  customerAddress: z.string().min(1),
  items: z.array(InvoiceItemSchema).min(1),
  dueDate: z.string().optional(),
  vatPercent: z.number().default(19),
  notes: z.string().optional(),
});

const UpdateInvoiceSchema = z.object({
  sellerAddress: z.string().optional(),
  customerAddress: z.string().optional(),
  items: z.array(InvoiceItemSchema).optional(),
  dueDate: z.string().optional(),
  vatPercent: z.number().optional(),
});

const ChangeStatusSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']),
});

export async function invoiceRoutes(fastify: FastifyInstance) {
  const invoiceRepo = fastify.invoiceRepository as IInvoiceRepository;
  const orderRepo = fastify.orderRepository as IOrderRepository;
  const customerRepo = fastify.customerRepository as ICustomerRepository;
  const pdfService = new PDFService(customerRepo);

  // GET /api/invoices - List all invoices
  fastify.get(
    '/invoices',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Querystring: { status?: string; customerId?: string; limit?: string; offset?: string } }>) => {
      const { status, customerId, limit, offset } = request.query;
      
      const invoices = await invoiceRepo.findAll({
        status: status as InvoiceStatus | undefined,
        customerId: customerId as UUID | undefined,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
      });

      return { invoices };
    }
  );

  // GET /api/invoices/:id - Get single invoice
  fastify.get(
    '/invoices/:id',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const invoice = await invoiceRepo.findById(request.params.id as UUID);
      if (!invoice) {
        return { error: 'Invoice not found' };
      }

      const customer = await customerRepo.findById(invoice.customerId);
      const versions = await invoiceRepo.getVersionHistory(invoice.id);
      
      return {
        invoice,
        customer,
        versions,
      };
    }
  );

  // GET /api/invoices/:id/pdf - Get invoice PDF
  fastify.get(
    '/invoices/:id/pdf',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const invoice = await invoiceRepo.findById(request.params.id as UUID);
      if (!invoice) {
        return reply.status(404).send({ error: 'Invoice not found' });
      }

      if (!invoice.pdfPath) {
        return reply.status(404).send({ error: 'PDF not generated yet' });
      }

      return { pdfPath: invoice.pdfPath };
    }
  );

  // POST /api/invoices - Create invoice
  fastify.post(
    '/invoices',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Body: z.infer<typeof CreateInvoiceSchema> }>) => {
      const data = CreateInvoiceSchema.parse(request.body);

      const order = await orderRepo.findById(data.orderId as UUID);
      if (!order) {
        return { error: 'Order not found' };
      }

      const invoiceCount = (await invoiceRepo.findAll()).length;
      const invoiceNumber = generateInvoiceNumber(invoiceCount);

      const lineItems: InvoiceLineItem[] = data.items.map((item, index) => ({
        id: generateId() as UUID,
        invoiceId: '' as UUID,
        orderItemId: item.orderItemId as UUID | undefined,
        productId: item.productId as UUID | undefined,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: Math.round(item.quantity * item.unitPrice * 100) / 100,
        sortOrder: index,
      }));

      const totals = calcInvoiceTotals(lineItems, data.vatPercent);

      const invoice: Invoice = {
        id: generateId() as UUID,
        invoiceNumber,
        version: 1,
        orderId: data.orderId as UUID,
        customerId: order.customerId,
        status: 'draft',
        date: new Date().toISOString().split('T')[0],
        dueDate: data.dueDate,
        sellerAddress: data.sellerAddress,
        customerAddress: data.customerAddress,
        lineItems,
        ...totals,
        vatPercent: data.vatPercent,
        pdfPath: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      lineItems.forEach(item => item.invoiceId = invoice.id);

      await invoiceRepo.save(invoice);

      return { invoice };
    }
  );

  // PUT /api/invoices/:id - Update invoice
  fastify.put(
    '/invoices/:id',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof UpdateInvoiceSchema> }>) => {
      const data = UpdateInvoiceSchema.parse(request.body);
      
      let invoice = await invoiceRepo.findById(request.params.id as UUID);
      if (!invoice) {
        return { error: 'Invoice not found' };
      }

      if (invoice.status !== 'draft') {
        const version = createInvoiceVersion(invoice);
        await invoiceRepo.saveVersion(invoice.id, version);
      }

      const updates: Partial<Invoice> = {
        version: invoice.status === 'draft' ? invoice.version : invoice.version + 1,
        updatedAt: new Date().toISOString(),
      };

      if (data.sellerAddress !== undefined) updates.sellerAddress = data.sellerAddress;
      if (data.customerAddress !== undefined) updates.customerAddress = data.customerAddress;
      if (data.dueDate !== undefined) updates.dueDate = data.dueDate;

      if (data.items) {
        const lineItems: InvoiceLineItem[] = data.items.map((item, index) => ({
          id: generateId() as UUID,
          invoiceId: invoice!.id,
          orderItemId: item.orderItemId as UUID | undefined,
          productId: item.productId as UUID | undefined,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: Math.round(item.quantity * item.unitPrice * 100) / 100,
          sortOrder: index,
        }));

        const vatPercent = data.vatPercent ?? invoice.vatPercent;
        const totals = calcInvoiceTotals(lineItems, vatPercent);
        
        updates.lineItems = lineItems;
        updates.vatPercent = vatPercent;
        Object.assign(updates, totals);
      } else if (data.vatPercent !== undefined) {
        const totals = calcInvoiceTotals(invoice.lineItems, data.vatPercent);
        updates.vatPercent = data.vatPercent;
        Object.assign(updates, totals);
      }

      invoice = { ...invoice, ...updates };
      await invoiceRepo.update(invoice);

      return { invoice };
    }
  );

  // POST /api/invoices/:id/status - Change invoice status
  fastify.post(
    '/invoices/:id/status',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof ChangeStatusSchema> }>) => {
      const data = ChangeStatusSchema.parse(request.body);
      
      let invoice = await invoiceRepo.findById(request.params.id as UUID);
      if (!invoice) {
        return { error: 'Invoice not found' };
      }

      invoice = transitionInvoice(invoice, data.status as InvoiceStatus);
      await invoiceRepo.update(invoice);

      return { invoice };
    }
  );

  // POST /api/invoices/:id/finalize - Finalize invoice
  fastify.post(
    '/invoices/:id/finalize',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      let invoice = await invoiceRepo.findById(request.params.id as UUID);
      if (!invoice) {
        return { error: 'Invoice not found' };
      }

      if (invoice.status !== 'sent') {
        return { error: 'Invoice must be sent before finalizing' };
      }

      invoice = finalizeInvoice(invoice);
      await invoiceRepo.update(invoice);

      return { invoice };
    }
  );

  // POST /api/invoices/:id/generate-pdf - Generate PDF
  fastify.post(
    '/invoices/:id/generate-pdf',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const invoice = await invoiceRepo.findById(request.params.id as UUID);
      if (!invoice) {
        return { error: 'Invoice not found' };
      }

      try {
        const { filePath, fileName } = await pdfService.generateInvoicePDF(invoice);
        
        // Update invoice with PDF path
        const updatedInvoice = { ...invoice, pdfPath: filePath };
        await invoiceRepo.update(updatedInvoice);

        return { 
          message: 'PDF generated successfully',
          fileName,
          filePath,
        };
      } catch (error) {
        return { 
          error: 'Failed to generate PDF',
          details: String(error),
        };
      }
    }
  );

  // GET /api/invoices/:id/versions/:version - Get specific version
  fastify.get(
    '/invoices/:id/versions/:version',
    { preHandler: requireUnlocked },
    async (request: FastifyRequest<{ Params: { id: string; version: string } }>) => {
      const versions = await invoiceRepo.getVersionHistory(request.params.id as UUID);
      const versionNum = parseInt(request.params.version);
      const version = versions.find(v => v.version === versionNum);
      
      if (!version) {
        return { error: 'Version not found' };
      }

      return { version };
    }
  );
}