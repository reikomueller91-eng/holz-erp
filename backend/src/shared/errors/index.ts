/**
 * HolzERP – Domain & Application Error Classes
 */

export class HolzError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

// ─── Auth Errors ─────────────────────────────────────────────────
export class LockedError extends HolzError {
  constructor() {
    super('System is locked. Unlock with master password.', 'LOCKED', 403);
  }
}

export class InvalidPasswordError extends HolzError {
  constructor() {
    super('Invalid master password.', 'INVALID_PASSWORD', 401);
  }
}

export class AlreadySetupError extends HolzError {
  constructor() {
    super('System is already set up.', 'ALREADY_SETUP', 409);
  }
}

export class NotSetupError extends HolzError {
  constructor() {
    super('System is not set up yet. Run setup first.', 'NOT_SETUP', 400);
  }
}

export class UnauthorizedError extends HolzError {
  constructor() {
    super('Unauthorized.', 'UNAUTHORIZED', 401);
  }
}

// ─── Domain Errors ───────────────────────────────────────────────
export class NotFoundError extends HolzError {
  constructor(entity: string, id: string) {
    super(`${entity} with id '${id}' not found.`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends HolzError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class ConflictError extends HolzError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export class ImmutableError extends HolzError {
  constructor(entity: string) {
    super(
      `${entity} is finalized and cannot be modified.`,
      'IMMUTABLE',
      409,
    );
  }
}

export class InvalidTransitionError extends HolzError {
  constructor(entity: string, from: string, to: string) {
    super(
      `Cannot transition ${entity} from '${from}' to '${to}'.`,
      'INVALID_TRANSITION',
      409,
    );
  }
}

// ─── Infrastructure Errors ───────────────────────────────────────
export class DatabaseError extends HolzError {
  constructor(message: string, public readonly cause?: unknown) {
    super(`Database error: ${message}`, 'DB_ERROR', 500);
  }
}

export class EncryptionError extends HolzError {
  constructor(message: string) {
    super(`Encryption error: ${message}`, 'ENCRYPTION_ERROR', 500);
  }
}
