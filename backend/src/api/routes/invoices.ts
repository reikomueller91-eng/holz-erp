import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PDFService } from '../../infrastructure/pdf/PDFService';
import type { Invoice, InvoiceLineItem } from '../../domain/invoice/Invoice';
import { transitionInvoice, finalizeInvoice, createInvoiceVersion, calcInvoiceTotals, generateInvoiceNumber } from '../../domain/invoice/Invoice';
import type { InvoiceStatus, UUID } from '../../shared/types';
import { requireUnlocked } from '../middleware/auth';
import { generateId } from '../../shared/utils/id';
import { EmailSenderService } from '../../application/services/EmailSenderService';
import type { ProductService } from '../../application/services/ProductService';
import { DEFAULT_SELLER_ADDRESS } from '../../shared/constants';
import fs from 'fs';
import path from 'path';
// @ts-ignore - qrcode has no type declarations
import QRCode from 'qrcode';

const InvoiceItemSchema = z.object({
  orderItemId: z.string().optional(),
  productId: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().default('Stk'),
  unitPrice: z.number().positive(),
});

const CreateInvoiceSchema = z.object({
  orderId: z.string().optional(),
  customerId: z.string().optional(),
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
  const { invoiceRepository: invoiceRepo, orderRepository: orderRepo, customerRepository: customerRepo,
          systemConfigRepository: configRepo, documentLinkService, documentHistoryRepository: historyRepo } = fastify;
  const pdfService = new PDFService(customerRepo);
  const emailService = new EmailSenderService(configRepo, fastify.cryptoService);

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

      // Enrich with customer name
      const enriched = await Promise.all(invoices.map(async (invoice) => {
        const customer = await customerRepo.findById(invoice.customerId);
        return {
          ...invoice,
          customerName: customer?.name || 'Unbekannt',
        };
      }));

      return { invoices: enriched };
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
        historyRepo.log('invoice', invoice.id, 'email_sent', { to: toEmail });
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
      const sellerAddress = await configRepo.getValue('seller_address') || DEFAULT_SELLER_ADDRESS;

      const invoiceCount = (await invoiceRepo.findAll()).length;
      const invoiceNumber = generateInvoiceNumber(invoiceCount);

      let customerAddrStr = 'Keine Adresse';
      if (customer) {
        const addr = customer.contactInfo?.address;
        const street = addr?.street ? `${addr.street}\n` : '';
        const city = addr?.postalCode ? `${addr.postalCode} ${addr.city || ''}` : (addr?.city || '');
        customerAddrStr = `${customer.name}\n${street}${city}`.trim();
      }

      // Order prices (pricePerM2, netTotal) are already GROSS (Brutto) values.
      // Invoice calcInvoiceTotals expects NET values and adds VAT on top.
      // So we must convert order gross → net before creating invoice line items.
      const vatFactor = 1 + order.vatPercent / 100;

      const lineItems: InvoiceLineItem[] = order.items.map((item, index) => {
        const netUnitPrice = Math.round((item.pricePerM2 / vatFactor) * 100) / 100;
        const netTotal = Math.round((item.netTotal / vatFactor) * 100) / 100;
        return {
          id: generateId() as UUID,
          invoiceId: '' as UUID,
          orderItemId: item.id,
          productId: item.productId,
          description: `Pos ${index + 1}: ${item.widthMm}x${item.heightMm}mm, ${item.lengthMm}mm lang`,
          quantity: item.quantity,
          unit: 'Stk',
          unitPrice: netUnitPrice,
          totalPrice: netTotal,
          sortOrder: index,
        };
      });

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

      // Log history
      historyRepo.log('invoice', invoice.id, 'created', { invoiceNumber: invoice.invoiceNumber, fromOrderId: order.id });

      return { invoice };
    }
  );

  // POST /api/invoices - Create invoice (with or without order)
  fastify.post<{ Body: z.infer<typeof CreateInvoiceSchema> }>(
    '/invoices',
    { preHandler: requireUnlocked },
    async (request) => {
      const data = CreateInvoiceSchema.parse(request.body);

      let customerId: UUID | undefined;
      let order = null;

      if (data.orderId) {
        // Invoice from order
        order = await orderRepo.findById(data.orderId as UUID);
        if (!order) {
          return { error: 'Order not found' };
        }
        customerId = order.customerId;
      } else if (data.customerId) {
        // Direct invoice with customer
        const customer = await customerRepo.findById(data.customerId as UUID);
        if (!customer) {
          return { error: 'Customer not found' };
        }
        customerId = data.customerId as UUID;
      } else {
        return { error: 'Either orderId or customerId must be provided' };
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
        orderId: data.orderId ? data.orderId as UUID : undefined,
        customerId: customerId!,
        status: 'draft',
        date: new Date().toISOString().split('T')[0],
        dueDate: data.dueDate,
        sellerAddress: data.sellerAddress || await configRepo.getValue('seller_address') || DEFAULT_SELLER_ADDRESS,
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
      historyRepo.log('invoice', invoice.id, 'created', { invoiceNumber: invoice.invoiceNumber, orderId: data.orderId || null, customerId, direct: !data.orderId });

      // Track price updates for products used in direct invoices
      if (!data.orderId) {
        const productService = fastify.productService as ProductService;
        for (const item of data.items) {
          if (item.productId) {
            try {
              const priceHistory = await productService.getPriceHistory(item.productId as UUID);
              const currentPrice = priceHistory[0]?.pricePerM2 ?? 0;
              if (currentPrice !== item.unitPrice && item.unitPrice > 0) {
                await productService.addPrice({
                  productId: item.productId as UUID,
                  pricePerM2: item.unitPrice,
                  effectiveFrom: new Date().toISOString(),
                  reason: `Preisanpassung über Direktrechnung ${invoice.invoiceNumber}`,
                });
              }
            } catch (err) {
              console.error(`Failed to update price history for product ${item.productId}:`, err);
            }
          }
        }
      }

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
      historyRepo.log('invoice', invoice.id, data.status as any, { invoiceNumber: invoice.invoiceNumber });

      return { invoice };
    }
  );

  // POST /api/invoices/:id/mark-paid - Mark invoice as paid
  fastify.post<{ Params: { id: string } }>(
    '/invoices/:id/mark-paid',
    { preHandler: requireUnlocked },
    async (request) => {
      let invoice = await invoiceRepo.findById(request.params.id as UUID);
      if (!invoice) {
        return { error: 'Invoice not found' };
      }

      invoice = transitionInvoice(invoice, 'paid');
      await invoiceRepo.update(invoice);
      historyRepo.log('invoice', invoice.id, 'paid', { invoiceNumber: invoice.invoiceNumber });

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
      historyRepo.log('invoice', invoice.id, 'finalized', { invoiceNumber: invoice.invoiceNumber });

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
        const validityDaysStr = await configRepo.getValue('offer_link_validity_days');
        const validityDays = validityDaysStr ? parseInt(validityDaysStr, 10) : 14;
        let docLink = null;
        let secureLink = '';

        if (invoice.orderId) {
          // First try by orderId (which may have been set during offer→order conversion)
          docLink = await documentLinkService.getExistingLink({ orderId: invoice.orderId as UUID });

          // If not found by orderId, try to trace back via offer
          if (!docLink) {
            const order = await orderRepo.findById(invoice.orderId as UUID);
            if (order?.offerId) {
              docLink = await documentLinkService.getExistingLink({ offerId: order.offerId as UUID });
            }
          }
        }

        if (!docLink) {
          const { link, rawPassword } = await documentLinkService.createLink({ invoiceId: invoice.id });
          docLink = link;
          secureLink = `${mainDomain.replace(/\/$/, '')}/public/offer/${docLink.token}?pw=${rawPassword}`;
          await documentLinkService.saveEncryptedUrl(docLink, secureLink);
        } else {
          // Tie this existing link to the new Invoice
          docLink.invoiceId = invoice.id;
          // Force-reactivate even if expired (invoice must be accessible!)
          const newExpiration = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();
          docLink.expiresAt = newExpiration;
          await documentLinkService.forceUpdateLink(docLink);

          const decrypted = documentLinkService.getDecryptedUrl(docLink);
          if (decrypted) {
            secureLink = decrypted;
          } else {
            console.error('Could not decrypt existing document link URL. Re-generating...');
            const { link, rawPassword } = await documentLinkService.createLink({ invoiceId: invoice.id });
            docLink = link;
            secureLink = `${mainDomain.replace(/\/$/, '')}/public/offer/${docLink.token}?pw=${rawPassword}`;
            await documentLinkService.saveEncryptedUrl(docLink, secureLink);
          }
        }

        const documentLinkUrl = secureLink;

        const logoPath = await configRepo.getValue('logo_path') || undefined;
        const { filePath, fileName } = await pdfService.generateInvoicePDF(invoice, taxNumber, deliveryNote, documentLinkUrl, logoPath);

        // Store public data snapshot for customer portal (invoice grossSum for correct display)
        if (docLink) {
          const existingPublicData = docLink.publicData ? JSON.parse(docLink.publicData) : {};
          const publicData = {
            ...existingPublicData,
            invoice: {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              date: invoice.date,
              dueDate: invoice.dueDate,
              netSum: invoice.totalNet,
              vatPercent: invoice.vatPercent,
              vatAmount: invoice.vatAmount,
              grossSum: invoice.totalGross,
              pdfAvailable: true,
            },
          };
          await documentLinkService.savePublicData(docLink, publicData);
        }

        // Update invoice with PDF path
        const updatedInvoice = { ...invoice, pdfPath: filePath };
        await invoiceRepo.update(updatedInvoice);
        historyRepo.log('invoice', invoice.id, 'pdf_generated', { fileName });

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

  // GET /api/invoices/:id/qrlink - Get the secure link for the invoice QR code
  fastify.get<{ Params: { id: string } }>(
    '/invoices/:id/qrlink',
    { preHandler: requireUnlocked },
    async (request) => {
      // Don't show QR code if no host/domain is configured
      const mainDomain = await configRepo.getValue('main_domain');
      if (!mainDomain) {
        return { secureLink: null, qrDataUrl: null };
      }

      const invoice = await invoiceRepo.findById(request.params.id as UUID);
      if (!invoice) {
        return { error: 'Invoice not found' };
      }

      // Try to find the document link for this invoice
      let docLink = await documentLinkService.getExistingLink({ invoiceId: invoice.id });

      if (!docLink && invoice.orderId) {
        docLink = await documentLinkService.getExistingLink({ orderId: invoice.orderId as UUID });
        if (!docLink) {
          const order = await orderRepo.findById(invoice.orderId as UUID);
          if (order?.offerId) {
            docLink = await documentLinkService.getExistingLink({ offerId: order.offerId as UUID });
          }
        }
      }

      if (!docLink) {
        return { secureLink: null, qrDataUrl: null };
      }

      const decrypted = documentLinkService.getDecryptedUrl(docLink);
      if (!decrypted) {
        return { secureLink: null, qrDataUrl: null };
      }

      let qrDataUrl: string | null = null;
      try {
        qrDataUrl = await QRCode.toDataURL(decrypted, { width: 200, margin: 1 });
      } catch { /* ignore */ }

      return { secureLink: decrypted, qrDataUrl };
    }
  );

  // GET /api/invoices/:id/timeline - Full history timeline (offer → order → invoice)
  fastify.get<{ Params: { id: string } }>(
    '/invoices/:id/timeline',
    { preHandler: requireUnlocked },
    async (request) => {
      const invoice = await invoiceRepo.findById(request.params.id as UUID);
      if (!invoice) {
        return { error: 'Invoice not found' };
      }

      const timeline = await historyRepo.getTimeline(invoice.id);

      // Also include access logs from the document link
      let accessLogs: Array<{ id: string; action: string; ipAddress: string; userAgent: string; createdAt: string }> = [];
      const db = fastify.db;

      // Find document link for this invoice (or linked offer/order)
      let docLink = await documentLinkService.getExistingLink({ invoiceId: invoice.id });
      if (!docLink && invoice.orderId) {
        docLink = await documentLinkService.getExistingLink({ orderId: invoice.orderId as UUID });
        if (!docLink) {
          const order = await orderRepo.findById(invoice.orderId as UUID);
          if (order?.offerId) {
            docLink = await documentLinkService.getExistingLink({ offerId: order.offerId as UUID });
          }
        }
      }

      if (docLink) {
        const logs = db.query<{ id: string; action: string; ip_address: string; user_agent: string; created_at: string }>(
          `SELECT id, action, ip_address, user_agent, created_at FROM link_access_log WHERE link_id = ? ORDER BY created_at ASC`,
          [docLink.id]
        );
        accessLogs = logs.map(log => ({
          id: log.id,
          action: log.action,
          ipAddress: log.ip_address,
          userAgent: log.user_agent,
          createdAt: log.created_at,
        }));
      }

      // Also gather context: linked offer/order info
      let offerInfo: any = null;
      let orderInfo: any = null;

      if (invoice.orderId) {
        const order = await orderRepo.findById(invoice.orderId as UUID);
        if (order) {
          orderInfo = {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            createdAt: order.createdAt,
            finishedAt: order.finishedAt,
          };

          if (order.offerId) {
            const offer = await fastify.offerRepository.findById(order.offerId as UUID);
            if (offer) {
              offerInfo = {
                id: offer.id,
                offerNumber: offer.offerNumber,
                status: offer.status,
                date: offer.date,
                createdAt: offer.createdAt,
                customerResponse: offer.customerResponse,
                customerResponseAt: offer.customerResponseAt,
              };
            }
          }
        }
      }

      // Get customer info
      const customer = await customerRepo.findById(invoice.customerId);
      const customerInfo = customer ? {
        id: customer.id,
        name: customer.name,
      } : null;

      return {
        timeline,
        accessLogs,
        offerInfo,
        orderInfo,
        customerInfo,
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          createdAt: invoice.createdAt,
          paidAt: invoice.paidAt,
        },
      };
    }
  );
}