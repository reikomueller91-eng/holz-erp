import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { IDatabase } from '../ports/IDatabase';
import type { IKeyStore } from '../ports/IKeyStore';
import type { LockState } from '../../shared/types';
import {
  InvalidPasswordError,
  AlreadySetupError,
  NotSetupError,
} from '../../shared/errors';
import { logger } from '../../shared/utils/logger';

// Argon2id parameters (OWASP recommended minimum)
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MiB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,      // 256-bit output = AES-256 key
  raw: true,           // return raw Buffer, not encoded hash
};

/**
 * AuthService — handles master password lifecycle.
 *
 * Setup flow:
 *   1. POST /api/auth/setup { masterPassword } → store hash + salt
 *   2. POST /api/auth/unlock { masterPassword } → derive key, load into KeyStore
 *   3. POST /api/auth/lock → zero key from KeyStore
 */
export class AuthService {
  constructor(
    private readonly db: IDatabase,
    private readonly keyStore: IKeyStore,
  ) {}

  getState(): LockState {
    const setupComplete = this.db.queryOne<{ value: string }>(
      "SELECT value FROM system_config WHERE key = 'setup_complete'",
    );
    if (!setupComplete || setupComplete.value !== '1') {
      return 'not_setup';
    }
    return this.keyStore.isUnlocked() ? 'unlocked' : 'locked';
  }

  async setup(masterPassword: string): Promise<void> {
    const state = this.getState();
    if (state !== 'not_setup') {
      throw new AlreadySetupError();
    }

    logger.info('Running first-time setup');

    // Generate a random salt for Argon2
    const salt = randomBytes(32);

    // Derive key (used to verify correct password in unlock)
    // We store a verification hash, not the raw key
    const verificationHash = await argon2.hash(masterPassword, {
      ...ARGON2_OPTIONS,
      raw: false, // store encodedHash for verification
      salt,
    });

    this.db.transaction(() => {
      this.db.run(
        "INSERT INTO system_config (key, value) VALUES ('argon2_salt', ?)",
        [salt.toString('hex')],
      );
      this.db.run(
        "INSERT INTO system_config (key, value) VALUES ('password_hash', ?)",
        [verificationHash],
      );
      this.db.run(
        "INSERT INTO system_config (key, value) VALUES ('setup_complete', '1')",
      );
      this.db.run(
        "INSERT INTO system_config (key, value) VALUES ('app_version', '0.1.0')",
      );
    });

    logger.info('Setup complete — unlocking now');
    await this.unlock(masterPassword);
  }

  async unlock(masterPassword: string): Promise<void> {
    const state = this.getState();
    if (state === 'not_setup') throw new NotSetupError();

    const saltRow = this.db.queryOne<{ value: string }>(
      "SELECT value FROM system_config WHERE key = 'argon2_salt'",
    );
    const hashRow = this.db.queryOne<{ value: string }>(
      "SELECT value FROM system_config WHERE key = 'password_hash'",
    );

    if (!saltRow || !hashRow) throw new NotSetupError();

    const salt = Buffer.from(saltRow.value, 'hex');

    // Verify password against stored hash
    const valid = await argon2.verify(hashRow.value, masterPassword);
    if (!valid) {
      logger.warn('Failed unlock attempt — wrong password');
      throw new InvalidPasswordError();
    }

    // Derive the actual encryption key (raw 32 bytes)
    const rawKey = (await argon2.hash(masterPassword, {
      ...ARGON2_OPTIONS,
      raw: true,
      salt,
    })) as Buffer;

    this.keyStore.setKey(rawKey);
    rawKey.fill(0); // zero the local copy

    logger.info('System unlocked');
  }

  lock(): void {
    this.keyStore.lock();
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    // Verify current password
    const hashRow = this.db.queryOne<{ value: string }>(
      "SELECT value FROM system_config WHERE key = 'password_hash'",
    );
    if (!hashRow) throw new NotSetupError();

    const valid = await argon2.verify(hashRow.value, currentPassword);
    if (!valid) throw new InvalidPasswordError();

    // Re-encrypt all data would be needed for a real key rotation.
    // For MVP: just update the hash and re-derive the key on next unlock.
    // TODO: implement full key rotation (re-encrypt all data with new key)

    const newSalt = randomBytes(32);
    const newHash = await argon2.hash(newPassword, {
      ...ARGON2_OPTIONS,
      raw: false,
      salt: newSalt,
    });

    this.db.transaction(() => {
      this.db.run(
        "UPDATE system_config SET value = ? WHERE key = 'argon2_salt'",
        [newSalt.toString('hex')],
      );
      this.db.run(
        "UPDATE system_config SET value = ? WHERE key = 'password_hash'",
        [newHash],
      );
    });

    // Re-unlock with new password
    this.keyStore.lock();
    await this.unlock(newPassword);
    logger.info('Password changed successfully');
  }
}
