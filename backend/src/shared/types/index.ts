/**
 * HolzERP – Shared Types & Value Objects
 */

// ─── Branded Types ───────────────────────────────────────────────
export type UUID = string;
export type ISODateTime = string;
export type ISODate = string;

// ─── Pagination ──────────────────────────────────────────────────
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Encrypted Field ─────────────────────────────────────────────
export interface EncryptedField {
  v: 1;
  alg: 'aes-256-gcm';
  iv: string;   // base64
  tag: string;  // base64
  data: string; // base64
}

// ─── Domain: Wood Types ──────────────────────────────────────────
export const WOOD_TYPES = [
  'Eiche',
  'Kiefer',
  'Fichte',
  'Lärche',
  'Buche',
  'Esche',
  'Ahorn',
  'Walnuss',
  'Tanne',
  'Douglasie',
  'Sonstige',
] as const;
export type WoodType = (typeof WOOD_TYPES)[number];

// ─── Domain: Quality Grades ──────────────────────────────────────
export const QUALITY_GRADES = ['A', 'B', 'C', 'Rustikal', 'Sonstige'] as const;
export type QualityGrade = (typeof QUALITY_GRADES)[number];

// ─── Domain: Statuses ────────────────────────────────────────────
export const OFFER_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'cancelled',
  'converted',
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const ORDER_STATUSES = [
  'new',
  'in_production',
  'finished',
  'picked_up',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const INVOICE_STATUSES = [
  'draft',
  'sent',
  'paid',
  'overdue',
  'cancelled',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PRODUCTION_JOB_STATUSES = [
  'queued',
  'in_progress',
  'done',
  'issue',
] as const;
export type ProductionJobStatus = (typeof PRODUCTION_JOB_STATUSES)[number];

export const CUSTOMER_SOURCES = [
  'direct',
  'kleinanzeigen',
  'referral',
  'other',
] as const;
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];

// ─── System State ────────────────────────────────────────────────
export type LockState = 'locked' | 'unlocked' | 'not_setup';
