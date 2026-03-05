import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Offer, OfferItem } from '../../domain/offer/Offer';
import { transitionOffer, createOfferVersion, calcOfferTotals } from '../../domain/offer/Offer';
import type { OfferStatus, UUID } from '../../shared/types';
import { requireUnlocked } from '../middleware/auth';
import { generateId } from '../../shared/utils/id';
// import type { ProductService } from '../../application/services/ProductService';
import { PDFService } from '../../infrastructure/pdf/PDFService';
import { IOrderRepository } from '../../infrastructure/repositories/OrderRepository';
import type { Order, OrderItem } from '../../domain/order/Order';
import { calcOrderTotals } from '../../domain/order/Order';
import { EmailSenderService } from '../../application/services/EmailSenderService';
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
    customerId: z.string(),
    sellerAddress: z.string().optional(),
    customerAddress: z.string().optional(),
    inquirySource: z.string().default('direct'),
    inquiryContact: z.string().optional(),
    lineItems: z.array(OfferLineItemSchema).min(1),
    validUntil: z.string().optional(),
    notes: z.string().optional(),
    vatPercent: z.number().optional()
});

const UpdateOfferSchema = z.object({
    lineItems: z.array(OfferLineItemSchema).optional(),
    sellerAddress: z.string().optional(),
    customerAddress: z.string().optional(),
    validUntil: z.string().optional(),
    notes: z.string().optional()
});

const ChangeStatusSchema = z.object({
    status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'cancelled', 'converted'])
});

export async function offerRoutes(fastify: FastifyInstance) {
    const { offerRepository: offerRepo, customerRepository: customerRepo, productService, systemConfigRepository: configRepo } = fastify;
    const orderRepo = fastify.orderRepository as IOrderRepository;
    const pdfService = new PDFService(customerRepo);
    const emailService = new EmailSenderService(configRepo);

    // Helper: map backend Offer to what the frontend expects
    async function formatOffer(offer: Offer) {
        const customer = await customerRepo.findById(offer.customerId);

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
            customerName: customer ? customer.name : 'Unbekannter Kunde',
            lineItems,
            totalAmount: offer.grossSum,
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

            // Fetch customer to autofill addresses if omitting
            const customer = await customerRepo.findById(data.customerId as UUID);
            if (!customer) {
                return fastify.httpErrors.notFound('Customer not found');
            }

            const sellerAddress = await configRepo.getValue('seller_address') || 'HolzERP Musterfirma\nMusterstraße 1\n12345 Musterstadt';

            let customerAddress = data.customerAddress;
            if (!customerAddress) {
                customerAddress = customer.name;
                if (customer.contactInfo?.address?.street) {
                    customerAddress += '\n' + customer.contactInfo.address.street;
                }
                if (customer.contactInfo?.address?.postalCode && customer.contactInfo?.address?.city) {
                    customerAddress += '\n' + customer.contactInfo.address.postalCode + ' ' + customer.contactInfo.address.city;
                }
                if (customer.contactInfo?.address?.country) {
                    customerAddress += '\n' + customer.contactInfo.address.country;
                }
            }

            // Generate offer number
            const offerCount = (await offerRepo.findAll()).length;
            const currentYear = new Date().getFullYear();
            const offerNumber = `${currentYear}-${String(offerCount + 1).padStart(4, '0')}`;

            // Build items
            const items: OfferItem[] = await Promise.all(data.lineItems.map(async item => {
                const product = await productService.getById(item.productId as UUID);

                let grossTotal = 0;

                if (product.calcMethod === 'm2_unsorted') {
                    // lengthMm acts as area (m2 * 1000). e.g. 10m2 -> lengthMm=10000
                    grossTotal = (item.lengthMm / 1000) * item.quantityPieces * item.unitPricePerM2;
                } else if (product.calcMethod === 'volume_divided') {
                    // item.unitPricePerM2 is pre-populated by the frontend with (H*W)/Divider, but can be overridden
                    grossTotal = (item.lengthMm / 1000) * item.quantityPieces * item.unitPricePerM2;
                } else {
                    // m2_sorted (Standard)
                    const areaM2 = (product.dimensions.widthMm / 1000) * (item.lengthMm / 1000);
                    grossTotal = areaM2 * item.quantityPieces * item.unitPricePerM2;
                }

                const netTotal = Math.round(grossTotal * 100) / 100;

                return {
                    id: generateId() as UUID,
                    productId: item.productId as UUID,
                    heightMm: product.dimensions.heightMm,
                    widthMm: product.dimensions.widthMm,
                    lengthMm: item.lengthMm,
                    quantity: item.quantityPieces,
                    quality: 'A',
                    pricePerM2: item.unitPricePerM2,
                    netTotal,
                };
            }));

            // Add price history entries for items with non-standard prices
            for (const item of data.lineItems) {
                try {
                    const priceHistory = await productService.getPriceHistory(item.productId as UUID);
                    const latestPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].pricePerM2 : null;
                    if (latestPrice !== null && Math.abs(item.unitPricePerM2 - latestPrice) > 0.001) {
                        await productService.addPrice({
                            productId: item.productId as UUID,
                            pricePerM2: item.unitPricePerM2,
                            effectiveFrom: new Date().toISOString() as any,
                            reason: 'Angebotskorrektur',
                        });
                    }
                } catch { /* ignore - don't fail offer creation because of price history */ }
            }

            const totals = calcOfferTotals(items, vatPercent);

            const offer: Offer = {
                id: generateId() as UUID,
                offerNumber,
                version: 1,
                customerId: data.customerId as UUID,
                status: 'draft',
                date: new Date().toISOString().split('T')[0] as any,
                validUntil: data.validUntil as any,
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
            if (data.notes !== undefined) updates.notes = data.notes;

            if (data.lineItems) {
                const items: OfferItem[] = await Promise.all(data.lineItems.map(async item => {
                    const product = await productService.getById(item.productId as UUID);

                    let grossTotal = 0;

                    if (product.calcMethod === 'm2_unsorted') {
                        grossTotal = (item.lengthMm / 1000) * item.quantityPieces * item.unitPricePerM2;
                    } else if (product.calcMethod === 'volume_divided') {
                        grossTotal = (item.lengthMm / 1000) * item.quantityPieces * item.unitPricePerM2;
                    } else {
                        const areaM2 = (product.dimensions.widthMm / 1000) * (item.lengthMm / 1000);
                        grossTotal = areaM2 * item.quantityPieces * item.unitPricePerM2;
                    }

                    const netTotal = Math.round(grossTotal * 100) / 100;

                    return {
                        id: generateId() as UUID,
                        productId: item.productId as UUID,
                        heightMm: product.dimensions.heightMm,
                        widthMm: product.dimensions.widthMm,
                        lengthMm: item.lengthMm,
                        quantity: item.quantityPieces,
                        quality: 'A',
                        pricePerM2: item.unitPricePerM2,
                        netTotal,
                    };
                }));

                // Add price history entries for items with non-standard prices
                for (const item of data.lineItems) {
                    try {
                        const priceHistory = await productService.getPriceHistory(item.productId as UUID);
                        const latestPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].pricePerM2 : null;
                        if (latestPrice !== null && Math.abs(item.unitPricePerM2 - latestPrice) > 0.001) {
                            await productService.addPrice({
                                productId: item.productId as UUID,
                                pricePerM2: item.unitPricePerM2,
                                effectiveFrom: new Date().toISOString() as any,
                                reason: 'Angebotskorrektur (Bearbeitung)',
                            });
                        }
                    } catch { /* ignore - don't fail offer update because of price history */ }
                }

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
                customerId: offer.customerId,
                items: orderItems,
                ...totals,
                vatPercent: offer.vatPercent,
                productionStatus: 'not_started',
                notes: offer.notes,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await orderRepo.save(order);

            // Mark offer as converted
            const updatedOffer = { ...offer, status: 'converted' as any };
            await offerRepo.update(updatedOffer);

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

                // Manage Document Link
                let docLink = await fastify.documentLinkService.getExistingLink({ offerId: offer.id });
                let secureLink = '';

                if (!docLink) {
                    const { link, rawPassword } = await fastify.documentLinkService.createLink({ offerId: offer.id });
                    docLink = link;
                    // For Offers, we can use validUntil or default 14 days
                    const expirationStr = offer.validUntil || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
                    await fastify.documentLinkService.extendExpiration(docLink, expirationStr);

                    secureLink = `${mainDomain}/public/documents/${docLink.token}?pw=${rawPassword}`;
                    await fastify.documentLinkService.saveEncryptedUrl(docLink, secureLink);
                } else {
                    const decrypted = fastify.documentLinkService.getDecryptedUrl(docLink);
                    if (decrypted) {
                        secureLink = decrypted;
                    } else {
                        throw new Error('Could not decrypt existing document link URL');
                    }
                }

                const { filePath, fileName } = await pdfService.generateOfferPDF(offer, taxNumber, deliveryNote, secureLink);

                // Update offer with PDF path
                const updatedOffer = { ...offer, pdfPath: filePath };
                await offerRepo.update(updatedOffer);

                return {
                    message: 'PDF generated successfully',
                    fileName,
                    filePath,
                    secureLink,
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

            const customer = await customerRepo.findById(offer.customerId);
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
                return { message: 'Email sent successfully' };
            } catch (error: any) {
                return reply.status(500).send({ error: error.message || 'Failed to send email' });
            }
        }
    );
}
