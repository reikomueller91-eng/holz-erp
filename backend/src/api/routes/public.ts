import { FastifyInstance } from 'fastify';
import { DocumentLinkService } from '../../application/services/DocumentLinkService';
import { IOrderRepository } from '../../infrastructure/repositories/OrderRepository';
import { IInvoiceRepository } from '../../infrastructure/repositories/InvoiceRepository';
import { IOfferRepository } from '../../infrastructure/repositories/OfferRepository';
import fs from 'fs';


export async function publicRoutes(fastify: FastifyInstance) {
    const documentLinkService = fastify.documentLinkService as DocumentLinkService;
    const orderRepo = fastify.orderRepository as IOrderRepository;
    const invoiceRepo = fastify.invoiceRepository as IInvoiceRepository;
    const offerRepo = fastify.offerRepository as IOfferRepository;

    // GET /api/public/documents/:token
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

            let pdfPath: string | undefined;
            let filename = 'document.pdf';

            // Resolve the latest possible document from the link
            if (link.invoiceId) {
                const invoice = await invoiceRepo.findById(link.invoiceId as any);
                if (invoice?.pdfPath) {
                    pdfPath = invoice.pdfPath;
                    filename = `invoice-${invoice.invoiceNumber}.pdf`;
                }
            } else if (link.orderId) {
                const order = await orderRepo.findById(link.orderId as any);
                if (order?.pdfPath) {
                    pdfPath = order.pdfPath;
                    filename = `order-${order.orderNumber}.pdf`;
                }
            } else if (link.offerId) {
                const offer = await offerRepo.findById(link.offerId as any);
                if (offer?.pdfPath) {
                    pdfPath = offer.pdfPath;
                    filename = `offer-${offer.offerNumber}.pdf`;
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
}
