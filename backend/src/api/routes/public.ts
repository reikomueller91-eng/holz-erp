import { FastifyInstance } from 'fastify';
import { generateId } from '../../shared/utils/id';
import type { UUID } from '../../shared/types';
import type { IDatabase } from '../../application/ports/IDatabase';
import { TelegramService } from '../../infrastructure/telegram/TelegramService';
import fs from 'fs';


function getClientIp(request: any): string {
    return request.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || request.headers['x-real-ip']
        || request.ip
        || 'unknown';
}

function logAccess(db: IDatabase, linkId: string, action: string, request: any): void {
    const ip = getClientIp(request);
    const userAgent = request.headers['user-agent'] || 'unknown';
    db.run(
        'INSERT INTO link_access_log (id, link_id, action, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [generateId(), linkId, action, ip, userAgent, new Date().toISOString()]
    );
}

export async function publicRoutes(fastify: FastifyInstance) {
    const { documentLinkService, notificationRepository: notificationRepo, systemConfigRepository: configRepo, db } = fastify;
    const telegramService = new TelegramService(configRepo, fastify.cryptoService);

    // GET /api/public/documents/:token - Serve PDF files directly
    fastify.get<{ Params: { token: string }; Querystring: { pw?: string } }>(
        '/documents/:token',
        async (request, reply) => {
            const { token } = request.params;
            const { pw } = request.query;

            if (!pw) {
                return reply.status(401).send({ error: 'Password required' });
            }

            const link = await documentLinkService.validateAndAccessLink(token, pw);
            if (!link) {
                return reply.status(403).send({ error: 'Invalid or expired link' });
            }

            logAccess(db, link.id, 'download_pdf', request);

            let pdfPath: string | undefined;
            let filename = 'document.pdf';

            // Resolve the latest possible document from the link using raw SQL (no system unlock needed)
            if (link.invoiceId) {
                const row = db.queryOne<{ invoice_number: string; pdf_path: string | null }>(
                    'SELECT invoice_number, pdf_path FROM invoices WHERE id = ?',
                    [link.invoiceId]
                );
                if (row?.pdf_path) {
                    pdfPath = row.pdf_path;
                    filename = `invoice-${row.invoice_number}.pdf`;
                }
            } else if (link.orderId) {
                const row = db.queryOne<{ order_number: string; pdf_path: string | null }>(
                    'SELECT order_number, pdf_path FROM orders WHERE id = ?',
                    [link.orderId]
                );
                if (row?.pdf_path) {
                    pdfPath = row.pdf_path;
                    filename = `order-${row.order_number}.pdf`;
                }
            } else if (link.offerId) {
                const row = db.queryOne<{ offer_number: string; pdf_path: string | null }>(
                    'SELECT offer_number, pdf_path FROM offers WHERE id = ?',
                    [link.offerId]
                );
                if (row?.pdf_path) {
                    pdfPath = row.pdf_path;
                    filename = `offer-${row.offer_number}.pdf`;
                }
            }

            if (!pdfPath || !fs.existsSync(pdfPath)) {
                return reply.status(404).send({ error: 'Document PDF not found' });
            }

            const stream = fs.createReadStream(pdfPath);
            reply.header('Content-Type', 'application/pdf');
            reply.header('Content-Disposition', `inline; filename="${filename}"`);
            return reply.send(stream);
        }
    );

    // GET /api/public/offers/:token - Full offer info + invoice status for customer portal
    fastify.get<{ Params: { token: string }; Querystring: { pw?: string } }>(
        '/offers/:token',
        async (request, reply) => {
            const { token } = request.params;
            const { pw } = request.query;

            if (!pw) {
                return reply.status(401).send({ error: 'Password required' });
            }

            const link = await documentLinkService.validateAndAccessLink(token, pw);
            if (!link || !link.offerId) {
                return reply.status(403).send({ error: 'Invalid or expired link' });
            }

            logAccess(db, link.id, 'view_offer', request);

            // Read public data snapshot (stored unencrypted when PDF was generated - no system unlock needed)
            if (!link.publicData) {
                return reply.status(404).send({ error: 'Angebotsdaten nicht verfügbar. Bitte PDF zuerst im System generieren.' });
            }

            let offerData: any;
            try {
                offerData = JSON.parse(link.publicData);
            } catch {
                return reply.status(500).send({ error: 'Fehler beim Lesen der Angebotsdaten.' });
            }

            // Check offer validity using configurable days
            const validityDaysStr = await configRepo.getValue('offer_link_validity_days');
            const validityDays = validityDaysStr ? parseInt(validityDaysStr, 10) : 14;

            const validUntilDate = offerData.validUntil
                ? new Date(offerData.validUntil)
                : new Date(new Date(offerData.date).getTime() + validityDays * 24 * 60 * 60 * 1000);
            const now = new Date();
            const isExpired = now > validUntilDate;

            // Read current offer status from DB directly (unencrypted columns)
            const offerRow = db.queryOne<{ status: string; customer_response: string | null; customer_response_at: string | null }>(
                'SELECT status, customer_response, customer_response_at FROM offers WHERE id = ?',
                [link.offerId]
            );

            // Check if invoice exists for this offer (offer → order → invoice chain)
            let invoiceInfo: { invoiceId: string; invoiceNumber: string; date: string; grossSum: number; pdfAvailable: boolean } | null = null;

            if (link.invoiceId) {
                // Use invoice data from publicData if available (has correct grossSum)
                if (offerData.invoice) {
                    invoiceInfo = {
                        invoiceId: offerData.invoice.invoiceId,
                        invoiceNumber: offerData.invoice.invoiceNumber,
                        date: offerData.invoice.date,
                        grossSum: offerData.invoice.grossSum,
                        pdfAvailable: offerData.invoice.pdfAvailable ?? true,
                    };
                } else {
                    // Fallback: read invoice row directly (unencrypted columns only)
                    const invoiceRow = db.queryOne<{ id: string; invoice_number: string; date: string; pdf_path: string | null }>(
                        'SELECT id, invoice_number, date, pdf_path FROM invoices WHERE id = ?',
                        [link.invoiceId]
                    );
                    if (invoiceRow) {
                        invoiceInfo = {
                            invoiceId: invoiceRow.id,
                            invoiceNumber: invoiceRow.invoice_number,
                            date: invoiceRow.date,
                            grossSum: offerData.grossSum, // Fallback to offer grossSum if no invoice publicData
                            pdfAvailable: !!invoiceRow.pdf_path && fs.existsSync(invoiceRow.pdf_path),
                        };
                    }
                }
            }

            return reply.send({
                offerNumber: offerData.offerNumber,
                date: offerData.date,
                validUntil: offerData.validUntil || validUntilDate.toISOString().split('T')[0],
                customerAddress: offerData.customerAddress,
                sellerAddress: offerData.sellerAddress,
                items: offerData.items || [],
                netSum: offerData.netSum,
                vatPercent: offerData.vatPercent,
                vatAmount: offerData.vatAmount,
                grossSum: offerData.grossSum,
                desiredCompletionDate: offerData.desiredCompletionDate,
                notes: offerData.notes,
                status: offerRow?.status || offerData.status,
                customerResponse: offerRow?.customer_response ?? null,
                customerResponseAt: offerRow?.customer_response_at ?? null,
                isExpired,
                invoice: invoiceInfo,
            });
        }
    );

    // POST /api/public/offers/:token/respond - Accept or reject an offer via QR code
    fastify.post<{
        Params: { token: string };
        Querystring: { pw?: string };
        Body: { response: 'accepted' | 'rejected'; comment?: string };
    }>(
        '/offers/:token/respond',
        async (request, reply) => {
            const { token } = request.params;
            const { pw } = request.query;
            const { response, comment } = request.body;

            if (!pw) {
                return reply.status(401).send({ error: 'Password required' });
            }

            if (!response || !['accepted', 'rejected'].includes(response)) {
                return reply.status(400).send({ error: 'Response must be "accepted" or "rejected"' });
            }

            const link = await documentLinkService.validateAndAccessLink(token, pw);
            if (!link || !link.offerId) {
                return reply.status(403).send({ error: 'Invalid or expired link' });
            }

            logAccess(db, link.id, `respond_${response}`, request);

            // Read offer status directly from DB (unencrypted columns - no system unlock needed)
            const offerRow = db.queryOne<{
                id: string;
                offer_number: string;
                status: string;
                date: string;
                valid_until: string | null;
                customer_response: string | null;
                customer_response_at: string | null;
            }>(
                'SELECT id, offer_number, status, date, valid_until, customer_response, customer_response_at FROM offers WHERE id = ?',
                [link.offerId]
            );

            if (!offerRow) {
                return reply.status(404).send({ error: 'Offer not found' });
            }

            // Check if already responded
            if (offerRow.customer_response) {
                return reply.status(409).send({
                    error: 'Already responded',
                    message: `Dieses Angebot wurde bereits ${offerRow.customer_response === 'accepted' ? 'angenommen' : 'abgelehnt'}.`,
                    customerResponse: offerRow.customer_response,
                    customerResponseAt: offerRow.customer_response_at,
                });
            }

            // Check offer validity using configurable days
            const validityDaysStr = await configRepo.getValue('offer_link_validity_days');
            const validityDays = validityDaysStr ? parseInt(validityDaysStr, 10) : 14;

            const validUntilDate = offerRow.valid_until
                ? new Date(offerRow.valid_until)
                : new Date(new Date(offerRow.date).getTime() + validityDays * 24 * 60 * 60 * 1000);
            const now = new Date();

            if (now > validUntilDate) {
                return reply.status(410).send({
                    error: 'Offer expired',
                    message: 'Die Angebotsgültigkeit ist abgelaufen. Das Angebot kann nicht mehr angenommen oder abgelehnt werden.',
                });
            }

            // Only allow response if offer is in 'sent' status
            if (offerRow.status !== 'sent') {
                return reply.status(400).send({
                    error: 'Invalid offer status',
                    message: 'Dieses Angebot kann nicht mehr beantwortet werden.',
                });
            }

            // Update offer with customer response (raw SQL - only unencrypted columns)
            const responseAt = now.toISOString();
            db.run(
                'UPDATE offers SET customer_response = ?, customer_response_at = ?, customer_comment = ?, updated_at = ? WHERE id = ?',
                [response, responseAt, comment ?? null, responseAt, link.offerId]
            );

            // Create notification for the ERP user
            const responseLabel = response === 'accepted' ? 'angenommen' : 'abgelehnt';
            const notificationMessage = comment
                ? `Angebot ${offerRow.offer_number} wurde vom Kunden ${responseLabel}. Kommentar: ${comment}`
                : `Angebot ${offerRow.offer_number} wurde vom Kunden ${responseLabel}.`;

            await notificationRepo.save({
                id: generateId() as UUID,
                type: response === 'accepted' ? 'offer_accepted' : 'offer_rejected',
                title: `Angebot ${offerRow.offer_number} ${responseLabel}`,
                message: notificationMessage,
                referenceType: 'offer',
                referenceId: offerRow.id,
                isRead: false,
                createdAt: responseAt,
            });

            // Send Telegram notification (non-blocking, fire-and-forget)
            const telegramEmoji = response === 'accepted' ? '✅' : '❌';
            const telegramText = comment
                ? `${telegramEmoji} <b>Angebot ${offerRow.offer_number}</b> wurde vom Kunden <b>${responseLabel}</b>.\n\n💬 Kommentar: ${comment}`
                : `${telegramEmoji} <b>Angebot ${offerRow.offer_number}</b> wurde vom Kunden <b>${responseLabel}</b>.`;
            telegramService.sendMessage(telegramText).catch(() => { /* ignore */ });

            return reply.send({
                success: true,
                message: response === 'accepted'
                    ? 'Vielen Dank! Das Angebot wurde erfolgreich angenommen.'
                    : 'Das Angebot wurde abgelehnt. Vielen Dank für Ihre Rückmeldung.',
                customerResponse: response,
                customerResponseAt: responseAt,
            });
        }
    );
}
