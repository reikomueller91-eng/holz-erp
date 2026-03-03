import { FastifyRequest, FastifyReply } from 'fastify';

// Simple auth check that ensures system is unlocked
export const requireUnlocked = (_request: FastifyRequest, _reply: FastifyReply, done: (err?: Error) => void) => {
  // In a real implementation, this would check if the system is unlocked
  // For now, we assume it's always unlocked for development
  // TODO: Implement proper auth check with KeyStore
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
