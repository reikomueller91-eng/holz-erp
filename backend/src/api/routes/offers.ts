import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Offer, OfferItem } from '../../domain/offer/Offer';
import { transitionOffer, createOfferVersion, calcOfferTotals } from '../../domain/offer/Offer';
import type { OfferStatus, UUID, ISODateTime } from '../../shared/types';
import { requireUnlocked } from '../middleware/auth';
import { generateId } from '../../shared/utils/id';
import { PDFService } from '../../infrastructure/pdf/PDFService';
import type { Order, OrderItem } from '../../domain/order/Order';
import { calcOrderTotals } from '../../domain/order/Order';
import { EmailSenderService } from '../../application/services/EmailSenderService';
import { DEFAULT_SELLER_ADDRESS } from '../../shared/constants';
// @ts-ignore - qrcode has no type declarations
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

// Validation schemas
// The frontend sends lineItems instead of items, and omits addresses and dimensions
const OfferLineItemSchema = z.object({
    productId: z.string(),
    lengthMm: z.number().int().positive(),
    quantityPieces: z.number().int().positive(),
    unitPricePerM2: z.number().positive(),
});

const CreateOfferSchema = z.object({
    customerId: z.string().optional(),
    sellerAddress: z.string().optional(),
    customerAddress: z.string().optional(),
    inquirySource: z.string().default('direct'),
    inquiryContact: z.string().optional(),
    lineItems: z.array(OfferLineItemSchema).min(1),
    validUntil: z.string().optional(),
    desiredCompletionDate: z.string().optional(),
    notes: z.string().optional(),
    vatPercent: z.number().optional()
});

const UpdateOfferSchema = z.object({
    lineItems: z.array(OfferLineItemSchema).optional(),
    sellerAddress: z.string().optional(),
    customerAddress: z.string().optional(),
    validUntil: z.string().optional(),
    desiredCompletionDate: z.string().optional(),
    notes: z.string().optional()
});

const ChangeStatusSchema = z.object({
    status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'cancelled', 'converted'])
});

export async function offerRoutes(fastify: FastifyInstance) {
    const { offerRepository: offerRepo, customerRepository: customerRepo, productService, systemConfigRepository: configRepo,
            orderRepository: orderRepo, documentHistoryRepository: historyRepo } = fastify;
    const pdfService = new PDFService(customerRepo);
    const emailService = new EmailSenderService(configRepo, fastify.cryptoService);

    // ─── Shared helpers ─────────────────────────────────────────

    /** Build a multi-line customer address string from customer data */
    function buildCustomerAddress(customer: { name: string; contactInfo?: any }): string {
        let address = customer.name;
        if (customer.contactInfo?.address?.street) {
            address += '\n' + customer.contactInfo.address.street;
        }
        if (customer.contactInfo?.address?.postalCode && customer.contactInfo?.address?.city) {
            address += '\n' + customer.contactInfo.address.postalCode + ' ' + customer.contactInfo.address.city;
        }
        if (customer.contactInfo?.address?.country) {
            address += '\n' + customer.contactInfo.address.country;
        }
        return address;
    }

    /** Convert a line item + product into an OfferItem with calculated grossTotal */
    async function buildOfferItem(item: { productId: string; lengthMm: number; quantityPieces: number; unitPricePerM2: number }): Promise<OfferItem> {
        const product = await productService.getById(item.productId as UUID);

        let grossTotal = 0;
        if (product.calcMethod === 'm2_sorted') {
            const areaM2 = (product.dimensions.widthMm / 1000) * (item.lengthMm / 1000);
            grossTotal = areaM2 * item.quantityPieces * item.unitPricePerM2;
        } else {
            // m2_unsorted and volume_divided use the same formula
            grossTotal = (item.lengthMm / 1000) * item.quantityPieces * item.unitPricePerM2;
        }

        return {
            id: generateId() as UUID,
            productId: item.productId as UUID,
            heightMm: product.dimensions.heightMm,
            widthMm: product.dimensions.widthMm,
            lengthMm: item.lengthMm,
            quantity: item.quantityPieces,
            quality: 'A',
            pricePerM2: item.unitPricePerM2,
            netTotal: Math.round(grossTotal * 100) / 100,
        };
    }

    /** Track price changes for offer line items in the price history */
    async function trackPriceChanges(lineItems: Array<{ productId: string; unitPricePerM2: number }>, reason: string): Promise<void> {
        for (const item of lineItems) {
            try {
                const priceHistory = await productService.getPriceHistory(item.productId as UUID);
                const latestPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].pricePerM2 : null;
                if (latestPrice !== null && Math.abs(item.unitPricePerM2 - latestPrice) > 0.001) {
                    await productService.addPrice({
                        productId: item.productId as UUID,
                        pricePerM2: item.unitPricePerM2,
                        effectiveFrom: new Date().toISOString() as any,
                        reason,
                    });
                }
            } catch { /* ignore - don't fail because of price history */ }
        }
    }

    // Helper: map backend Offer to what the frontend expects
    async function formatOffer(offer: Offer) {
        const customer = offer.customerId ? await customerRepo.findById(offer.customerId) : null;

        const lineItems = await Promise.all(offer.items.map(async item => {
            const product = await productService.getById(item.productId).catch(() => null);
            return {
                id: item.id,
                productId: item.productId,
                productName: product ? product.name : 'Unbekanntes Produkt',
                lengthMm: item.lengthMm,
                quantityPieces: item.quantity,
                unitPricePerM2: item.pricePerM2,
                totalPrice: item.netTotal,
            };
        }));

        return {
            ...offer,
            customer,
            customerName: customer ? customer.name : (offer.customerId ? 'Unbekannter Kunde' : 'Anonym'),
            lineItems,
            totalAmount: offer.grossSum,
            desiredCompletionDate: offer.desiredCompletionDate,
            customerResponse: offer.customerResponse ?? null,
            customerResponseAt: offer.customerResponseAt ?? null,
            customerComment: offer.customerComment ?? null,
        };
    }

    // GET /api/offers - List all offers
    fastify.get<{ Querystring: { status?: string; customerId?: string; limit?: string; offset?: string } }>(
        '/offers',
        { preHandler: requireUnlocked },
        async (request) => {
            const { status, customerId, limit, offset } = request.query;

            const offers = await offerRepo.findAll({
                status: status as OfferStatus | undefined,
                customerId: customerId as UUID | undefined,
                limit: limit ? parseInt(limit) : undefined,
                offset: offset ? parseInt(offset) : undefined,
            });

            return await Promise.all(offers.map(formatOffer));
        }
    );

    // GET /api/offers/:id - Get single offer with version history
    fastify.get<{ Params: { id: string } }>(
        '/offers/:id',
        { preHandler: requireUnlocked },
        async (request) => {
            const offer = await offerRepo.findById(request.params.id as UUID);
            if (!offer) {
                return fastify.httpErrors.notFound('Offer not found');
            }

            return await formatOffer(offer);
        }
    );

    // POST /api/offers - Create offer
    fastify.post<{ Body: z.infer<typeof CreateOfferSchema> }>(
        '/offers',
        { preHandler: requireUnlocked },
        async (request) => {
            const data = CreateOfferSchema.parse(request.body);

            // Read VAT from config if not provided by caller
            const configuredVat = await configRepo.getValue('vat_percent');
            const vatPercent = data.vatPercent ?? (configuredVat ? parseFloat(configuredVat) : 19);

            const sellerAddress = await configRepo.getValue('seller_address') || DEFAULT_SELLER_ADDRESS;

            let customerAddress = data.customerAddress || '';
            let customer = null;

            if (data.customerId) {
                // Named offer with customer
                customer = await customerRepo.findById(data.customerId as UUID);
                if (!customer) {
                    return fastify.httpErrors.notFound('Customer not found');
                }

                if (!customerAddress) {
                    customerAddress = buildCustomerAddress(customer);
                }
            } else {
                // Anonymous offer
                customerAddress = customerAddress || 'Anonym';
            }

            // Generate offer number
            const offerCount = (await offerRepo.findAll()).length;
            const currentYear = new Date().getFullYear();
            const offerNumber = `${currentYear}-${String(offerCount + 1).padStart(4, '0')}`;

            // Build items
            const items: OfferItem[] = await Promise.all(data.lineItems.map(buildOfferItem));

            // Add price history entries for items with non-standard prices
            await trackPriceChanges(data.lineItems, 'Angebotskorrektur');

            const totals = calcOfferTotals(items, vatPercent);

            const offer: Offer = {
                id: generateId() as UUID,
                offerNumber,
                version: 1,
                customerId: data.customerId ? data.customerId as UUID : undefined,
                status: 'draft',
                date: new Date().toISOString().split('T')[0] as any,
                validUntil: data.validUntil as any,
                desiredCompletionDate: data.desiredCompletionDate as any,
                inquirySource: data.inquirySource,
                inquiryContact: data.inquiryContact,
                sellerAddress,
                customerAddress,
                items,
                ...totals,
                vatPercent,
                notes: data.notes,
                createdAt: new Date().toISOString() as any,
                updatedAt: new Date().toISOString() as any,
            };

            await offerRepo.save(offer);
            historyRepo.log('offer', offer.id, 'created', { offerNumber: offer.offerNumber, customerId: offer.customerId || null });

            return await formatOffer(offer);
        }
    );

    // PUT /api/offers/:id - Update offer (creates new version)
    fastify.put<{ Params: { id: string }; Body: z.infer<typeof UpdateOfferSchema> }>(
        '/offers/:id',
        { preHandler: requireUnlocked },
        async (request) => {
            const data = UpdateOfferSchema.parse(request.body);

            let offer = await offerRepo.findById(request.params.id as UUID);
            if (!offer) {
                return fastify.httpErrors.notFound('Offer not found');
            }

            // Only draft offers can be edited
            if (offer.status !== 'draft') {
                return fastify.httpErrors.badRequest('Nur Angebote im Entwurfsstatus können bearbeitet werden');
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
            if (data.desiredCompletionDate !== undefined) updates.desiredCompletionDate = data.desiredCompletionDate as any;
            if (data.notes !== undefined) updates.notes = data.notes;

            if (data.lineItems) {
                const items: OfferItem[] = await Promise.all(data.lineItems.map(buildOfferItem));

                // Add price history entries for items with non-standard prices
                await trackPriceChanges(data.lineItems, 'Angebotskorrektur (Bearbeitung)');

                const totals = calcOfferTotals(items, offer.vatPercent);
                updates.items = items;
                Object.assign(updates, totals);
            }

            offer = { ...offer, ...updates };
            await offerRepo.update(offer);

            return await formatOffer(offer);
        }
    );

    // POST /api/offers/:id/status - Change offer status
    fastify.post<{ Params: { id: string }; Body: z.infer<typeof ChangeStatusSchema> }>(
        '/offers/:id/status',
        { preHandler: requireUnlocked },
        async (request) => {
            const data = ChangeStatusSchema.parse(request.body);

            let offer = await offerRepo.findById(request.params.id as UUID);
            if (!offer) {
                return fastify.httpErrors.notFound('Offer not found');
            }

            offer = transitionOffer(offer, data.status as OfferStatus);
            await offerRepo.update(offer);
            historyRepo.log('offer', offer.id, data.status as any, { offerNumber: offer.offerNumber });

            return await formatOffer(offer);
        }
    );

    // POST /api/offers/:id/accept-manual - Accept offer on behalf of the customer (e.g. phone call)
    const ManualAcceptSchema = z.object({
        comment: z.string().optional(),
    });

    fastify.post<{ Params: { id: string }; Body: z.infer<typeof ManualAcceptSchema> }>(
        '/offers/:id/accept-manual',
        { preHandler: requireUnlocked },
        async (request) => {
            const data = ManualAcceptSchema.parse(request.body);

            let offer = await offerRepo.findById(request.params.id as UUID);
            if (!offer) {
                return fastify.httpErrors.notFound('Offer not found');
            }

            if (offer.status !== 'sent' && offer.status !== 'draft') {
                return fastify.httpErrors.badRequest(`Angebot kann im Status "${offer.status}" nicht angenommen werden`);
            }

            // Transition to accepted
            offer = transitionOffer(offer, 'accepted');

            // Set customer response fields (as if customer accepted)
            offer.customerResponse = 'accepted';
            offer.customerResponseAt = new Date().toISOString() as ISODateTime;
            offer.customerComment = data.comment || 'Manuell im Auftrag des Kunden angenommen';

            await offerRepo.update(offer);
            historyRepo.log('offer', offer.id, 'accepted_manual', {
                offerNumber: offer.offerNumber,
                comment: offer.customerComment,
            });

            return await formatOffer(offer);
        }
    );

    // GET /api/offers/:id/versions/:version - Get specific version
    fastify.get<{ Params: { id: string; version: string } }>(
        '/offers/:id/versions/:version',
        { preHandler: requireUnlocked },
        async (request) => {
            const versions = await offerRepo.getVersionHistory(request.params.id as UUID);
            const versionNum = parseInt(request.params.version);
            const version = versions.find(v => v.version === versionNum);

            if (!version) {
                return fastify.httpErrors.notFound('Version not found');
            }

            return { version };
        }
    );

    // POST /api/offers/:id/assign-customer - Assign a customer to an anonymous offer
    fastify.post<{ Params: { id: string }; Body: { customerId: string } }>(
        '/offers/:id/assign-customer',
        { preHandler: requireUnlocked },
        async (request) => {
            const { customerId } = request.body;
            if (!customerId) {
                return fastify.httpErrors.badRequest('customerId ist erforderlich');
            }

            const offer = await offerRepo.findById(request.params.id as UUID);
            if (!offer) {
                return fastify.httpErrors.notFound('Offer not found');
            }

            const customer = await customerRepo.findById(customerId as UUID);
            if (!customer) {
                return fastify.httpErrors.notFound('Customer not found');
            }

            // Build customer address
            const customerAddress = buildCustomerAddress(customer);

            offer.customerId = customerId as UUID;
            offer.customerAddress = customerAddress;
            offer.updatedAt = new Date().toISOString() as any;
            await offerRepo.update(offer);

            historyRepo.log('offer', offer.id, 'customer_assigned', { offerNumber: offer.offerNumber, customerId, customerName: customer.name });

            return await formatOffer(offer);
        }
    );

    // POST /api/offers/:id/convert - Convert accepted offer to order
    fastify.post<{ Params: { id: string } }>(
        '/offers/:id/convert',
        { preHandler: requireUnlocked },
        async (request) => {
            const offer = await offerRepo.findById(request.params.id as UUID);
            if (!offer) {
                return fastify.httpErrors.notFound('Offer not found');
            }

            if (offer.status !== 'accepted' && offer.status !== 'draft') {
                return fastify.httpErrors.badRequest('Nur akzeptierte oder Entwurfs-Angebote können umgewandelt werden');
            }

            if (!offer.customerId) {
                return fastify.httpErrors.badRequest('Anonyme Angebote müssen zuerst einem Kunden zugeordnet werden');
            }

            // Build order items from offer items
            const orderItems: OrderItem[] = offer.items.map(item => ({
                id: generateId() as UUID,
                productId: item.productId,
                heightMm: item.heightMm,
                widthMm: item.widthMm,
                lengthMm: item.lengthMm,
                quantity: item.quantity,
                quantityProduced: 0,
                quality: item.quality || 'A',
                pricePerM2: item.pricePerM2,
                netTotal: item.netTotal,
                productionStatus: 'not_started' as const,
            }));

            const totals = calcOrderTotals(orderItems, offer.vatPercent);
            const orderCount = (await orderRepo.findAll()).length;
            const currentYear = new Date().getFullYear();
            const orderNumber = `${currentYear}-${String(orderCount + 1).padStart(4, '0')}`;

            const order: Order = {
                id: generateId() as UUID,
                orderNumber,
                offerId: offer.id,
                status: 'new',
                customerId: offer.customerId!,
                items: orderItems,
                ...totals,
                vatPercent: offer.vatPercent,
                productionStatus: 'not_started',
                desiredCompletionDate: offer.desiredCompletionDate,
                notes: [offer.notes, offer.customerComment ? `Kundenkommentar: ${offer.customerComment}` : ''].filter(Boolean).join('\n') || undefined,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await orderRepo.save(order);
            historyRepo.log('order', order.id, 'created', { orderNumber: order.orderNumber, fromOfferId: offer.id });

            // Mark offer as converted
            const updatedOffer = { ...offer, status: 'converted' as any };
            await offerRepo.update(updatedOffer);
            historyRepo.log('offer', offer.id, 'converted', { orderId: order.id });

            // Transfer document link: tie existing offer link to the new order
            const existingLink = await fastify.documentLinkService.getExistingLink({ offerId: offer.id });
            if (existingLink) {
                existingLink.orderId = order.id;
                await fastify.documentLinkService.forceUpdateLink(existingLink);
            }

            return { order, orderId: order.id };
        }
    );

    // POST /api/offers/:id/pdf - Generate PDF
    fastify.post<{ Params: { id: string } }>(
        '/offers/:id/pdf',
        { preHandler: requireUnlocked },
        async (request) => {
            const offer = await offerRepo.findById(request.params.id as UUID);
            if (!offer) {
                return fastify.httpErrors.notFound('Offer not found');
            }

            try {
                const taxNumber = await configRepo.getValue('tax_number') || undefined;
                const deliveryNote = await configRepo.getValue('delivery_note') || undefined;
                const mainDomain = await configRepo.getValue('main_domain') || 'http://localhost:3000';
                const validityDaysStr = await configRepo.getValue('offer_link_validity_days');
                const validityDays = validityDaysStr ? parseInt(validityDaysStr, 10) : 14;

                // Manage Document Link - single unified link for offer portal
                let docLink = await fastify.documentLinkService.getExistingLink({ offerId: offer.id });
                let offerPortalLink = '';

                if (!docLink) {
                    const { link, rawPassword } = await fastify.documentLinkService.createLink({ offerId: offer.id });
                    docLink = link;
                    // Use configurable validity days or offer's validUntil
                    const expirationStr = offer.validUntil || new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();
                    await fastify.documentLinkService.extendExpiration(docLink, expirationStr);

                    offerPortalLink = `${mainDomain}/public/offer/${docLink.token}?pw=${rawPassword}`;
                    await fastify.documentLinkService.saveEncryptedUrl(docLink, offerPortalLink);
                } else {
                    const decrypted = fastify.documentLinkService.getDecryptedUrl(docLink);
                    if (decrypted) {
                        offerPortalLink = decrypted;
                    } else {
                        throw new Error('Could not decrypt existing document link URL');
                    }
                }

                const { filePath, fileName } = await pdfService.generateOfferPDF(offer, taxNumber, deliveryNote, offerPortalLink, await configRepo.getValue('logo_path') || undefined);

                // Store unencrypted snapshot of offer data for public access (no system unlock needed)
                const publicOfferData = {
                    offerNumber: offer.offerNumber,
                    date: offer.date,
                    validUntil: offer.validUntil,
                    customerAddress: offer.customerAddress,
                    sellerAddress: offer.sellerAddress,
                    items: offer.items.map(item => ({
                        productId: item.productId,
                        heightMm: item.heightMm,
                        widthMm: item.widthMm,
                        lengthMm: item.lengthMm,
                        quantity: item.quantity,
                        quality: item.quality,
                        pricePerM2: item.pricePerM2,
                        netTotal: item.netTotal,
                    })),
                    netSum: offer.netSum,
                    vatPercent: offer.vatPercent,
                    vatAmount: offer.vatAmount,
                    grossSum: offer.grossSum,
                    desiredCompletionDate: offer.desiredCompletionDate,
                    notes: offer.notes,
                    status: offer.status,
                };
                await fastify.documentLinkService.savePublicData(docLink, publicOfferData);

                // Update offer with PDF path
                const updatedOffer = { ...offer, pdfPath: filePath };
                await offerRepo.update(updatedOffer);
                historyRepo.log('offer', offer.id, 'pdf_generated', { fileName });

                return {
                    message: 'PDF generated successfully',
                    fileName,
                    filePath,
                    secureLink: offerPortalLink,
                };
            } catch (error) {
                return fastify.httpErrors.internalServerError(String(error));
            }
        }
    );

    // GET /api/offers/:id/pdf - Get PDF
    fastify.get<{ Params: { id: string } }>(
        '/offers/:id/pdf',
        { preHandler: requireUnlocked },
        async (request, reply) => {
            const offer = await offerRepo.findById(request.params.id as UUID);
            if (!offer) {
                return reply.status(404).send({ error: 'Offer not found' });
            }

            // We explicitly check the property `pdfPath`, which we know we set during generation.
            const anyOffer = offer as any;
            if (!anyOffer.pdfPath || !fs.existsSync(anyOffer.pdfPath)) {
                return reply.status(404).send({ error: 'PDF not generated yet or file missing' });
            }

            const stream = fs.createReadStream(anyOffer.pdfPath);
            reply.header('Content-Type', 'application/pdf');
            reply.header('Content-Disposition', `inline; filename=${path.basename(anyOffer.pdfPath)}`);
            return reply.send(stream);
        }
    );

    // POST /api/offers/:id/email - Send offer via email
    fastify.post<{ Params: { id: string } }>(
        '/offers/:id/email',
        { preHandler: requireUnlocked },
        async (request, reply) => {
            const offer = await offerRepo.findById(request.params.id as UUID);
            if (!offer) return reply.status(404).send({ error: 'Offer not found' });

            if (!offer.customerId) return reply.status(400).send({ error: 'Anonyme Angebote können nicht per E-Mail versendet werden' });

            const customer = await customerRepo.findById(offer.customerId!);
            const toEmail = customer?.contactInfo?.email;
            if (!toEmail) return reply.status(400).send({ error: 'Customer has no email address' });

            const anyOffer = offer as any;
            if (!anyOffer.pdfPath || !fs.existsSync(anyOffer.pdfPath)) {
                return reply.status(400).send({ error: 'PDF not generated yet or file missing' });
            }

            try {
                await emailService.sendEmailWithAttachment(
                    toEmail,
                    `Angebot ${offer.offerNumber}`,
                    `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie das Angebot ${offer.offerNumber}.\n\nMit freundlichen Grüßen`,
                    `<p>Sehr geehrte Damen und Herren,</p><p>anbei erhalten Sie das Angebot ${offer.offerNumber}.</p><p>Mit freundlichen Grüßen</p>`,
                    anyOffer.pdfPath,
                    `Angebot-${offer.offerNumber}.pdf`
                );
                historyRepo.log('offer', offer.id, 'email_sent', { to: toEmail });
                return { message: 'Email sent successfully' };
            } catch (error: any) {
                return reply.status(500).send({ error: error.message || 'Failed to send email' });
            }
        }
    );

    // GET /api/offers/:id/qrlink - Get the secure link and QR code for the offer
    fastify.get<{ Params: { id: string } }>(
        '/offers/:id/qrlink',
        { preHandler: requireUnlocked },
        async (request) => {
            // Don't show QR code if no host/domain is configured
            const mainDomain = await configRepo.getValue('main_domain');
            if (!mainDomain) {
                return { secureLink: null, qrDataUrl: null };
            }

            const offer = await offerRepo.findById(request.params.id as UUID);
            if (!offer) {
                return { secureLink: null, qrDataUrl: null };
            }

            const docLink = await fastify.documentLinkService.getExistingLink({ offerId: offer.id });
            if (!docLink) {
                return { secureLink: null, qrDataUrl: null };
            }

            const decrypted = fastify.documentLinkService.getDecryptedUrl(docLink);
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

    // GET /api/offers/:id/access-log - Get access log for an offer's document link
    fastify.get<{ Params: { id: string } }>(
        '/offers/:id/access-log',
        { preHandler: requireUnlocked },
        async (request) => {
            const offerId = request.params.id;
            const db = fastify.db;

            // Find all document links for this offer
            const links = db.query(
                'SELECT id FROM document_links WHERE offer_id = ?',
                [offerId]
            ) as { id: string }[];

            if (!links.length) {
                return { logs: [] };
            }

            const linkIds = links.map((l: { id: string }) => l.id);
            const placeholders = linkIds.map(() => '?').join(',');

            const logs = db.query(
                `SELECT id, link_id, action, ip_address, user_agent, created_at
                 FROM link_access_log
                 WHERE link_id IN (${placeholders})
                 ORDER BY created_at DESC`,
                linkIds
            ) as Array<{
                id: string;
                link_id: string;
                action: string;
                ip_address: string;
                user_agent: string;
                created_at: string;
            }>;

            return {
                logs: logs.map(log => ({
                    id: log.id,
                    action: log.action,
                    ipAddress: log.ip_address,
                    userAgent: log.user_agent,
                    createdAt: log.created_at,
                })),
            };
        }
    );
}
