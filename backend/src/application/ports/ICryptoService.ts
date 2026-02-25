import type { EncryptedField } from '../../shared/types';

/**
 * Port: CryptoService
 * Abstraction over the encryption adapter.
 * Implemented by: infrastructure/crypto/CryptoService
 */
export interface ICryptoService {
  /** Encrypt plaintext string → EncryptedField */
  encrypt(plaintext: string): EncryptedField;

  /** Decrypt EncryptedField → plaintext string */
  decrypt(field: EncryptedField): string;

  /** Encrypt an arbitrary object (JSON serialized then encrypted) */
  encryptJson<T>(obj: T): EncryptedField;

  /** Decrypt an EncryptedField → parsed JSON object */
  decryptJson<T>(field: EncryptedField): T;

  /** Parse a stored encrypted field string → EncryptedField */
  parseField(stored: string): EncryptedField;

  /** Serialize EncryptedField → string for DB storage */
  serializeField<T>(obj: T): Promise<string>;

  /** Deserialize stored encrypted string → decrypted object */
  deserializeField<T>(stored: string): Promise<T>;
}
