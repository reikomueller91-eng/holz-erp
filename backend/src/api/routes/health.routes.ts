import type { FastifyInstance } from 'fastify';
import { keyStore } from '../../infrastructure/crypto/KeyStore';

export function registerHealthRoutes(server: FastifyInstance): void {
  server.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              version: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] ?? '0.1.0',
      });
    },
  );

  server.get('/health/lock-state', async (_request, reply) => {
    const state = keyStore.isUnlocked() ? 'unlocked' : 'locked';
    return reply.send({ state });
  });
}
