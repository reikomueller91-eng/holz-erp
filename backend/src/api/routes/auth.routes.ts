import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../../application/services/AuthService';
import { z } from 'zod';

interface AuthRouteDeps {
  authService: AuthService;
}

const PasswordBody = z.object({
  masterPassword: z.string().min(12, 'Password must be at least 12 characters'),
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, 'New password must be at least 12 characters'),
});

export function registerAuthRoutes(
  server: FastifyInstance,
  deps: AuthRouteDeps,
): void {
  const { authService } = deps;

  // GET /api/auth/status
  server.get('/auth/status', async (_req, reply) => {
    const state = authService.getState();
    return reply.send({ state });
  });

  // POST /api/auth/setup  — first-run only
  server.post(
    '/auth/setup',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const body = PasswordBody.parse(request.body);
      await authService.setup(body.masterPassword);
      return reply.status(201).send({ message: 'Setup complete. System is now unlocked.' });
    },
  );

  // POST /api/auth/unlock
  server.post(
    '/auth/unlock',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' }, // brute force protection
      },
    },
    async (request, reply) => {
      const body = PasswordBody.parse(request.body);
      await authService.unlock(body.masterPassword);
      return reply.send({ message: 'System unlocked.' });
    },
  );

  // POST /api/auth/lock
  server.post('/auth/lock', async (_request, reply) => {
    authService.lock();
    return reply.send({ message: 'System locked.' });
  });

  // POST /api/auth/change-password
  server.post(
    '/auth/change-password',
    {
      config: {
        rateLimit: { max: 3, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const body = ChangePasswordBody.parse(request.body);
      await authService.changePassword(body.currentPassword, body.newPassword);
      return reply.send({ message: 'Password changed successfully.' });
    },
  );
}
