import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IInvoiceRepository } from '../../infrastructure/repositories/InvoiceRepository';
import { IOrderRepository } from '../../infrastructure/repositories/OrderRepository';
import { ICustomerRepository } from '../../application/ports/ICustomerRepository';
import { PDFService } from '../../infrastructure/pdf/PDFService';
import { transitionOrder } from '../../domain/order/Order';
import type { Invoice, InvoiceLineItem } from '../../domain/invoice/Invoice';
import { transitionInvoice, finalizeInvoice, createInvoiceVersion, calcInvoiceTotals, generateInvoiceNumber } from '../../domain/invoice/Invoice';
import type { InvoiceStatus, UUID } from '../../shared/types';
import { requireUnlocked } from '../middleware/auth';
import { generateId } from '../../shared/utils/id';
import { EmailSenderService } from '../../application/services/EmailSenderService';
import fs from 'fs';
import path from 'path';
import type { DocumentLinkService } from '../../application/services/DocumentLinkService';

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
  const configRepo = fastify.systemConfigRepository as any;
  const documentLinkService = fastify.documentLinkService as DocumentLinkService;
  const pdfService = new PDFService(customerRepo);
  const emailService = new EmailSenderService(configRepo);

  // GET /api/invoices - List all invoices
  fastify.get<{ Querystring: { status?: string; customerId?: string; limit?: string; offset?: string } }>(
    '/invoices',
    { preHandler: requireUnlocked },
    async (request) => {
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
  fastify.get<{ Params: { id: string } }>(
    '/invoices/:id',
    { preHandler: requireUnlocked },
    async (request) => {
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
  fastify.get<{ Params: { id: string } }>(
    '/invoices/:id/pdf',
    { preHandler: requireUnlocked },
    async (request, reply) => {
      const invoice = await invoiceRepo.findById(request.params.id as UUID);
      if (!invoice) {
        return reply.status(404).send({ error: 'Invoice not found' });
      }

      // We explicitly check the property `pdfPath`, which we know we set during generation.
      const anyInvoice = invoice as any;
      if (!anyInvoice.pdfPath || !fs.existsSync(anyInvoice.pdfPath)) {
        return reply.status(404).send({ error: 'PDF not generated yet or file missing' });
      }

      const stream = fs.createReadStream(anyInvoice.pdfPath);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename=${path.basename(anyInvoice.pdfPath)}`);
      return reply.send(stream);
    }
  );

  // POST /api/invoices/:id/email - Send invoice via email
  fastify.post<{ Params: { id: string } }>(
    '/invoices/:id/email',
    { preHandler: requireUnlocked },
    async (request, reply) => {
      const invoice = await invoiceRepo.findById(request.params.id as UUID);
      if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });

      const customer = await customerRepo.findById(invoice.customerId);
      const toEmail = customer?.contactInfo?.email;
      if (!toEmail) return reply.status(400).send({ error: 'Customer has no email address' });

      const anyInvoice = invoice as any;
      if (!anyInvoice.pdfPath || !fs.existsSync(anyInvoice.pdfPath)) {
        return reply.status(400).send({ error: 'PDF not generated yet or file missing' });
      }

      try {
        await emailService.sendEmailWithAttachment(
          toEmail,
          `Rechnung ${invoice.invoiceNumber}`,
          `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie die Rechnung ${invoice.invoiceNumber}.\n\nMit freundlichen Grüßen`,
          `<p>Sehr geehrte Damen und Herren,</p><p>anbei erhalten Sie die Rechnung ${invoice.invoiceNumber}.</p><p>Mit freundlichen Grüßen</p>`,
          anyInvoice.pdfPath,
          `Rechnung-${invoice.invoiceNumber}.pdf`
        );
        return { message: 'Email sent successfully' };
      } catch (error: any) {
        return reply.status(500).send({ error: error.message || 'Failed to send email' });
      }
    }
  );

  // POST /api/orders/:id/invoice - Create invoice straight from order
  fastify.post<{ Params: { id: string } }>(
    '/orders/:id/invoice',
    { preHandler: requireUnlocked },
    async (request) => {
      const order = await orderRepo.findById(request.params.id as UUID);
      if (!order) {
        return fastify.httpErrors.notFound('Order not found');
      }

      const customer = await customerRepo.findById(order.customerId);
      const sellerAddress = await configRepo.getValue('seller_address') || 'HolzERP Musterfirma\nMusterstraße 1\n12345 Musterstadt';

      const invoiceCount = (await invoiceRepo.findAll()).length;
      const invoiceNumber = generateInvoiceNumber(invoiceCount);

      let customerAddrStr = 'Keine Adresse';
      if (customer) {
        const addr = customer.contactInfo?.address;
        const street = addr?.street ? `${addr.street}\n` : '';
        const city = addr?.postalCode ? `${addr.postalCode} ${addr.city || ''}` : (addr?.city || '');
        customerAddrStr = `${customer.name}\n${street}${city}`.trim();
      }

      const lineItems: InvoiceLineItem[] = order.items.map((item, index) => ({
        id: generateId() as UUID,
        invoiceId: '' as UUID,
        orderItemId: item.id,
        productId: item.productId,
        description: `Pos ${index + 1}: ${item.widthMm}x${item.heightMm}mm, ${item.lengthMm}mm lang`,
        quantity: item.quantity,
        unit: 'Stk',
        unitPrice: item.pricePerM2,
        totalPrice: item.netTotal,
        sortOrder: index,
      }));

      const totals = calcInvoiceTotals(lineItems, order.vatPercent);

      const invoice: Invoice = {
        id: generateId() as UUID,
        invoiceNumber,
        version: 1,
        orderId: order.id,
        customerId: order.customerId,
        status: 'draft',
        date: new Date().toISOString().split('T')[0],
        sellerAddress,
        customerAddress: customerAddrStr,
        lineItems,
        ...totals,
        vatPercent: order.vatPercent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      lineItems.forEach(item => item.invoiceId = invoice.id);
      await invoiceRepo.save(invoice);

      const updatedOrder = transitionOrder(order, 'invoiced');
      await orderRepo.update(updatedOrder);

      return { invoice };
    }
  );

  // POST /api/invoices - Create invoice
  fastify.post<{ Body: z.infer<typeof CreateInvoiceSchema> }>(
    '/invoices',
    { preHandler: requireUnlocked },
    async (request) => {
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
        sellerAddress: data.sellerAddress || await configRepo.getValue('seller_address') || 'HolzERP Musterfirma\nMusterstraße 1\n12345 Musterstadt',
        customerAddress: data.customerAddress || 'Keine Adresse',
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
  fastify.put<{ Params: { id: string }; Body: z.infer<typeof UpdateInvoiceSchema> }>(
    '/invoices/:id',
    { preHandler: requireUnlocked },
    async (request) => {
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
  fastify.post<{ Params: { id: string }; Body: z.infer<typeof ChangeStatusSchema> }>(
    '/invoices/:id/status',
    { preHandler: requireUnlocked },
    async (request) => {
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
  fastify.post<{ Params: { id: string } }>(
    '/invoices/:id/finalize',
    { preHandler: requireUnlocked },
    async (request) => {
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

  // POST /api/invoices/:id/pdf - Generate PDF
  fastify.post<{ Params: { id: string } }>(
    '/invoices/:id/pdf',
    { preHandler: requireUnlocked },
    async (request) => {
      const invoice = await invoiceRepo.findById(request.params.id as UUID);
      if (!invoice) {
        return { error: 'Invoice not found' };
      }

      try {
        const taxNumber = await configRepo.getValue('tax_number') || undefined;
        const deliveryNote = await configRepo.getValue('delivery_note') || undefined;

        // Manage Document Link
        const mainDomain = await configRepo.getValue('main_domain') || 'http://localhost:3000';
        let docLink = null;
        let secureLink = '';

        if (invoice.orderId) {
          // Look up by orderId (which could have come from offerId)
          docLink = await documentLinkService.getExistingLink({ orderId: invoice.orderId as UUID });
        }

        if (!docLink) {
          const { link, rawPassword } = await documentLinkService.createLink({ invoiceId: invoice.id });
          docLink = link;
          secureLink = `${mainDomain.replace(/\/$/, '')}/api/public/documents/${docLink.token}?pw=${rawPassword}`;
          await documentLinkService.saveEncryptedUrl(docLink, secureLink);
        } else {
          // Tie this existing link to the new Invoice!
          docLink.invoiceId = invoice.id;
          // Always refresh expiration to +14 days from Invoice generation
          await documentLinkService.extendExpiration(docLink, new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString());

          const decrypted = documentLinkService.getDecryptedUrl(docLink);
          if (decrypted) {
            secureLink = decrypted;
          } else {
            console.error('Could not decrypt existing document link URL. Re-generating...');
            const { link, rawPassword } = await documentLinkService.createLink({ invoiceId: invoice.id });
            docLink = link;
            secureLink = `${mainDomain.replace(/\/$/, '')}/api/public/documents/${docLink.token}?pw=${rawPassword}`;
            await documentLinkService.saveEncryptedUrl(docLink, secureLink);
          }
        }

        const documentLinkUrl = secureLink;

        const { filePath, fileName } = await pdfService.generateInvoicePDF(invoice, taxNumber, deliveryNote, documentLinkUrl);

        // Update invoice with PDF path
        const updatedInvoice = { ...invoice, pdfPath: filePath };
        await invoiceRepo.update(updatedInvoice);

        return {
          message: 'PDF generated successfully',
          fileName,
          filePath,
          secureLink: documentLinkUrl,
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
  fastify.get<{ Params: { id: string; version: string } }>(
    '/invoices/:id/versions/:version',
    { preHandler: requireUnlocked },
    async (request) => {
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