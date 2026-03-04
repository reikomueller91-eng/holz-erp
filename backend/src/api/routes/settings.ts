import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ISystemConfigRepository } from '../../infrastructure/repositories/SystemConfigRepository';
import { requireUnlocked } from '../middleware/auth';

const UpdateSettingsSchema = z.object({
    sellerAddress: z.string().min(1, "Absenderadresse darf nicht leer sein"),
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
                };
            }
        );

        // PUT /api/settings - Update settings
        fastify.put<{ Body: z.infer<typeof UpdateSettingsSchema> }>(
            '/settings',
            { preHandler: requireUnlocked },
            async (request, reply) => {
                const data = UpdateSettingsSchema.parse(request.body);
                await configRepo.setValue('seller_address', data.sellerAddress);
                return reply.status(200).send({ message: 'Settings updated successfully' });
            }
        );
    };
}
