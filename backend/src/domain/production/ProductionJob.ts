import type { UUID, ISODateTime, ProductionJobStatus } from '../../shared/types';
import { InvalidTransitionError, ValidationError } from '../../shared/errors';

/** Snapshot of product at time of production (denormalized for immutability) */
export interface ProductSnapshot {
  productId: UUID;
  name: string;
  woodType: string;
  qualityGrade: string;
  heightMm: number;
  widthMm: number;
  lengthMm: number;
}

export interface ProductionJob {
  id: UUID;
  orderId: UUID;
  lineItemRef: string;
  productSnapshot: ProductSnapshot;
  targetQuantity: number;
  producedQuantity: number;
  status: ProductionJobStatus;
  notes?: string;
  startedAt?: ISODateTime;
  completedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

const VALID_TRANSITIONS: Record<ProductionJobStatus, ProductionJobStatus[]> = {
  queued: ['in_progress'],
  in_progress: ['done', 'issue'],
  done: [],
  issue: ['in_progress', 'done'],
};

export function startProductionJob(job: ProductionJob): ProductionJob {
  const now = new Date().toISOString() as ISODateTime;
  const allowed = VALID_TRANSITIONS[job.status];
  if (!allowed.includes('in_progress')) {
    throw new InvalidTransitionError('ProductionJob', job.status, 'in_progress');
  }
  return { ...job, status: 'in_progress', startedAt: now, updatedAt: now };
}

export function completeProductionJob(
  job: ProductionJob,
  producedQuantity: number,
): ProductionJob {
  const now = new Date().toISOString() as ISODateTime;
  if (producedQuantity < 0) {
    throw new ValidationError('Produced quantity cannot be negative.');
  }
  const allowed = VALID_TRANSITIONS[job.status];
  if (!allowed.includes('done')) {
    throw new InvalidTransitionError('ProductionJob', job.status, 'done');
  }
  return {
    ...job,
    status: 'done',
    producedQuantity,
    completedAt: now,
    updatedAt: now,
  };
}
