import type { ICustomerRepository, CustomerListOptions } from '../ports/ICustomerRepository';
import type { Customer, CustomerContactInfo } from '../../domain/customer/Customer';
import { createCustomer } from '../../domain/customer/Customer';
import type { UUID, PaginatedResult, CustomerSource } from '../../shared/types';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { newUUID } from '../../shared/utils/id';

export interface CreateCustomerInput {
  name: string;
  contactInfo?: CustomerContactInfo;
  notes?: string;
  source?: CustomerSource;
  kleinanzeigenId?: string;
  rating?: number;
}

export interface UpdateCustomerInput {
  name?: string;
  contactInfo?: CustomerContactInfo;
  notes?: string;
  source?: CustomerSource;
  kleinanzeigenId?: string;
  isActive?: boolean;
  rating?: number | null;
}

/**
 * CustomerService – orchestrates customer use cases.
 * Depends on ICustomerRepository (port) — no direct DB access.
 */
export class CustomerService {
  constructor(private readonly repo: ICustomerRepository) { }

  getById(id: UUID): Customer {
    const customer = this.repo.findById(id);
    if (!customer) throw new NotFoundError('Customer', id);
    return customer;
  }

  list(options?: CustomerListOptions): PaginatedResult<Customer> {
    return this.repo.findAll(options);
  }

  create(input: CreateCustomerInput): Customer {
    if (!input.name?.trim()) {
      throw new ValidationError('Customer name is required');
    }

    const customer = createCustomer({
      id: newUUID(),
      name: input.name.trim(),
      contactInfo: input.contactInfo ?? {},
      notes: input.notes ?? '',
      source: input.source ?? 'direct',
      ...(input.kleinanzeigenId !== undefined
        ? { kleinanzeigenId: input.kleinanzeigenId }
        : {}),
      ...(input.rating !== undefined
        ? { rating: input.rating }
        : {}),
    });

    return this.repo.create(customer);
  }

  update(id: UUID, input: UpdateCustomerInput): Customer {
    // Verify exists
    this.getById(id);

    if (input.name !== undefined && !input.name.trim()) {
      throw new ValidationError('Customer name cannot be empty');
    }

    return this.repo.update(id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.contactInfo !== undefined ? { contactInfo: input.contactInfo } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.kleinanzeigenId !== undefined
        ? { kleinanzeigenId: input.kleinanzeigenId }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.rating !== undefined ? { rating: input.rating ?? undefined } : {}),
    });
  }

  delete(id: UUID): void {
    this.repo.softDelete(id);
  }

  count(includeInactive = false): number {
    return this.repo.count(includeInactive);
  }
}
