import type { Customer } from '../../domain/customer/Customer';
import type { UUID, PaginatedResult } from '../../shared/types';

export interface CustomerListOptions {
  page?: number;
  pageSize?: number;
  includeInactive?: boolean;
}

/**
 * Port: ICustomerRepository
 * Defines the contract for customer persistence.
 * Implemented by: infrastructure/repositories/CustomerRepository
 */
export interface ICustomerRepository {
  findById(id: UUID): Customer | undefined;
  findAll(options?: CustomerListOptions): PaginatedResult<Customer>;
  create(customer: Customer): Customer;
  update(id: UUID, updates: Partial<Omit<Customer, 'id' | 'createdAt'>>): Customer;
  softDelete(id: UUID): void;
  count(includeInactive?: boolean): number;
}
