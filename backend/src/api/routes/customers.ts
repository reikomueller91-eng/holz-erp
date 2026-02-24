import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CustomerService, CreateCustomerInput, UpdateCustomerInput } from '../../application/services/CustomerService';
import type { CustomerContactInfo } from '../../domain/customer/Customer';
import type { UUID } from '../../shared/types';
import { CUSTOMER_SOURCES } from '../../shared/types';
import { LockedError } from '../../shared/errors';

interface CustomerRouteDeps {
  customerService: CustomerService;
}

// ─── Validation schemas ────────────────────────────────────────────

const AddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

const ContactInfoSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: AddressSchema.optional(),
});

const CreateCustomerBody = z.object({
  name: z.string().min(1).max(200),
  contactInfo: ContactInfoSchema.optional(),
  notes: z.string().max(5000).optional(),
  source: z.enum(CUSTOMER_SOURCES).optional(),
  kleinanzeigenId: z.string().optional(),
});

const UpdateCustomerBody = z.object({
  name: z.string().min(1).max(200).optional(),
  contactInfo: ContactInfoSchema.optional(),
  notes: z.string().max(5000).optional(),
  source: z.enum(CUSTOMER_SOURCES).optional(),
  kleinanzeigenId: z.string().optional(),
  isActive: z.boolean().optional(),
});

const ListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  includeInactive: z.coerce.boolean().default(false),
});

// ─── Guard: require unlocked ────────────────────────────────────────

function requireUnlocked(server: FastifyInstance): void {
  if (!server.keyStore.isUnlocked()) {
    throw new LockedError();
  }
}

/**
 * Customer CRUD routes.
 *
 * All endpoints require the system to be unlocked (master password
 * must have been POSTed to /api/auth/unlock first).
 *
 * Registered at prefix /api → endpoints are /api/customers/...
 */
export function registerCustomerRoutes(
  server: FastifyInstance,
  deps: CustomerRouteDeps,
): void {
  const { customerService } = deps;

  // GET /api/customers
  server.get('/customers', async (request, reply) => {
    requireUnlocked(server);
    const query = ListQuerySchema.parse(request.query);
    const result = customerService.list(query);
    return reply.send(result);
  });

  // GET /api/customers/:id
  server.get<{ Params: { id: string } }>(
    '/customers/:id',
    async (request, reply) => {
      requireUnlocked(server);
      const customer = customerService.getById(request.params.id as UUID);
      return reply.send(customer);
    },
  );

  // POST /api/customers
  server.post('/customers', async (request, reply) => {
    requireUnlocked(server);
    const body = CreateCustomerBody.parse(request.body);
    // Explicit construction required due to exactOptionalPropertyTypes: true
    const input: CreateCustomerInput = {
      name: body.name,
      // Cast needed: Zod optional fields yield T|undefined, but exactOptionalPropertyTypes
      // requires truly-absent optionals. Runtime behaviour is correct.
      ...(body.contactInfo !== undefined ? { contactInfo: body.contactInfo as CustomerContactInfo } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.kleinanzeigenId !== undefined ? { kleinanzeigenId: body.kleinanzeigenId } : {}),
    };
    const customer = customerService.create(input);
    return reply.status(201).send(customer);
  });

  // PUT /api/customers/:id
  server.put<{ Params: { id: string } }>(
    '/customers/:id',
    async (request, reply) => {
      requireUnlocked(server);
      const body = UpdateCustomerBody.parse(request.body);
      // Explicit construction required due to exactOptionalPropertyTypes: true
      const input: UpdateCustomerInput = {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.contactInfo !== undefined ? { contactInfo: body.contactInfo as CustomerContactInfo } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.source !== undefined ? { source: body.source } : {}),
        ...(body.kleinanzeigenId !== undefined ? { kleinanzeigenId: body.kleinanzeigenId } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      };
      const customer = customerService.update(request.params.id as UUID, input);
      return reply.send(customer);
    },
  );

  // DELETE /api/customers/:id  (soft delete)
  server.delete<{ Params: { id: string } }>(
    '/customers/:id',
    async (request, reply) => {
      requireUnlocked(server);
      customerService.delete(request.params.id as UUID);
      return reply.status(204).send();
    },
  );
}
