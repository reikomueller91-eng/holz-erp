import { FastifyRequest, FastifyReply } from 'fastify';
import { keyStore } from '../../infrastructure/crypto/KeyStore';

/**
 * Fastify preHandler hook that ensures the system is unlocked.
 * Rejects with 423 Locked if the master key is not loaded.
 */
export const requireUnlocked = (_request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
  if (!keyStore.isUnlocked()) {
    reply.status(423).send({
      error: 'SYSTEM_LOCKED',
      message: 'System ist gesperrt. Bitte zuerst mit dem Master-Passwort entsperren.',
    });
    return;
  }
  done();
};

// Placeholder for future auth requirements
export interface AuthContext {
  userId?: string;
  isAuthenticated: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}
