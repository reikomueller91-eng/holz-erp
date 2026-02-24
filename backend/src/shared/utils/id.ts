import { randomUUID } from 'crypto';

/**
 * Generate a unique ID using crypto.randomUUID
 */
export const generateId = (): string => {
  return randomUUID();
};

/**
 * Alias for generateId for UUID type compatibility
 */
export const newUUID = (): string => {
  return randomUUID();
};

/**
 * Get current ISO timestamp
 */
export const nowISO = (): string => {
  return new Date().toISOString();
};

/**
 * Generate a sequential number with prefix
 */
export const generateNumber = (prefix: string, sequence: number): string => {
  return `${prefix}${String(sequence).padStart(6, '0')}`;
};

/**
 * Generate a timestamp-based ID
 */
export const generateTimestampId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};
