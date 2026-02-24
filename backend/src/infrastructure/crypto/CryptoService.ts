import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { ICryptoService } from '../../application/ports/ICryptoService';
import type { EncryptedField } from '../../shared/types';
import { EncryptionError, LockedError } from '../../shared/errors';
import type { IKeyStore } from '../../application/ports/IKeyStore';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

/**
 * AES-256-GCM encryption service.
 * Key is retrieved from the KeyStore (throws LockedError if locked).
 */
export class CryptoService implements ICryptoService {
  constructor(private readonly keyStore: IKeyStore) {}

  encrypt(plaintext: string): EncryptedField {
    const key = this.getKey();
    const iv = randomBytes(IV_LENGTH);

    try {
      const cipher = createCipheriv(ALGORITHM, key, iv, {
        authTagLength: TAG_LENGTH,
      });

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      const tag = cipher.getAuthTag();

      return {
        v: 1,
        alg: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: encrypted.toString('base64'),
      };
    } catch (err) {
      throw new EncryptionError(`Encryption failed: ${String(err)}`);
    }
  }

  decrypt(field: EncryptedField): string {
    const key = this.getKey();

    try {
      const iv = Buffer.from(field.iv, 'base64');
      const tag = Buffer.from(field.tag, 'base64');
      const ciphertext = Buffer.from(field.data, 'base64');

      const decipher = createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: TAG_LENGTH,
      });
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (err) {
      throw new EncryptionError(
        `Decryption failed — wrong key or tampered data: ${String(err)}`,
      );
    }
  }

  encryptJson<T>(obj: T): EncryptedField {
    return this.encrypt(JSON.stringify(obj));
  }

  decryptJson<T>(field: EncryptedField): T {
    return JSON.parse(this.decrypt(field)) as T;
  }

  parseField(stored: string): EncryptedField {
    try {
      return JSON.parse(stored) as EncryptedField;
    } catch {
      throw new EncryptionError('Failed to parse encrypted field JSON');
    }
  }

  serializeField(field: EncryptedField): string {
    return JSON.stringify(field);
  }

  private getKey(): Buffer {
    if (!this.keyStore.isUnlocked()) {
      throw new LockedError();
    }
    return this.keyStore.getKey();
  }
}
