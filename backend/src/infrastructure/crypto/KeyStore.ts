import type { IKeyStore } from '../../application/ports/IKeyStore';
import { LockedError } from '../../shared/errors';
import { logger } from '../../shared/utils/logger';

/**
 * In-memory key store.
 * Holds the AES-256 master key while the system is unlocked.
 * On lock, the buffer is zeroed and dereferenced.
 *
 * Security note: Node.js GC may not zero the old buffer immediately,
 * but this is the best we can do in userspace JS.
 */
export class KeyStore implements IKeyStore {
  private key: Buffer | null = null;

  setKey(key: Buffer): void {
    // Zero any previously held key before replacing
    if (this.key) {
      this.key.fill(0);
    }
    // Copy into a new buffer (don't hold a reference to caller's buffer)
    this.key = Buffer.alloc(key.length);
    key.copy(this.key);
    logger.debug('Master key loaded into KeyStore');
  }

  getKey(): Buffer {
    if (!this.key) {
      throw new LockedError();
    }
    return this.key;
  }

  isUnlocked(): boolean {
    return this.key !== null;
  }

  lock(): void {
    if (this.key) {
      this.key.fill(0);
      this.key = null;
      logger.info('System locked — master key zeroed from memory');
    }
  }
}

// Singleton — one KeyStore per process
export const keyStore = new KeyStore();
