import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ISystemConfigRepository } from '../../infrastructure/repositories/SystemConfigRepository';
import { requireUnlocked } from '../middleware/auth';

const UpdateSettingsSchema = z.object({
    sellerAddress: z.string().min(1, "Absenderadresse darf nicht leer sein").optional(),
    vatPercent: z.number().min(0).max(100).optional(),
    taxNumber: z.string().optional(),
    deliveryNote: z.string().optional(),
    smtpHost: z.string().optional(),
    smtpPort: z.number().optional(),
    smtpUser: z.string().optional(),
    smtpPassword: z.string().optional(),
});

export function buildSettingsRoutes(configRepo: ISystemConfigRepository): FastifyPluginAsync {
    return async (fastify: FastifyInstance) => {
        // GET /api/settings - Get all public settings
        fastify.get(
            '/settings',
            { preHandler: requireUnlocked },
            async () => {
                const config = await configRepo.getAll();
                return {
                    sellerAddress: config['seller_address'] || 'HolzERP Musterfirma\nMusterstraße 1\n12345 Musterstadt',
                    vatPercent: config['vat_percent'] ? parseFloat(config['vat_percent']) : 19,
                    taxNumber: config['tax_number'] || '',
                    deliveryNote: config['delivery_note'] || 'Der Kunde ist für die Ladungssicherung verantwortlich.',
                    smtpHost: config['smtp_host'] || '',
                    smtpPort: config['smtp_port'] ? parseInt(config['smtp_port'], 10) : 587,
                    smtpUser: config['smtp_user'] || '',
                    smtpPassword: config['smtp_password'] || '',
                };
            }
        );

        // PUT /api/settings - Update settings
        fastify.put<{ Body: z.infer<typeof UpdateSettingsSchema> }>(
            '/settings',
            { preHandler: requireUnlocked },
            async (request, reply) => {
                const data = UpdateSettingsSchema.parse(request.body);
                if (data.sellerAddress !== undefined) {
                    await configRepo.setValue('seller_address', data.sellerAddress);
                }
                if (data.vatPercent !== undefined) {
                    await configRepo.setValue('vat_percent', String(data.vatPercent));
                }
                if (data.taxNumber !== undefined) {
                    await configRepo.setValue('tax_number', data.taxNumber);
                }
                if (data.deliveryNote !== undefined) {
                    await configRepo.setValue('delivery_note', data.deliveryNote);
                }
                if (data.smtpHost !== undefined) {
                    await configRepo.setValue('smtp_host', data.smtpHost);
                }
                if (data.smtpPort !== undefined) {
                    await configRepo.setValue('smtp_port', String(data.smtpPort));
                }
                if (data.smtpUser !== undefined) {
                    await configRepo.setValue('smtp_user', data.smtpUser);
                }
                if (data.smtpPassword !== undefined) {
                    await configRepo.setValue('smtp_password', data.smtpPassword);
                }
                return reply.status(200).send({ message: 'Settings updated successfully' });
            }
        );
    };
}
