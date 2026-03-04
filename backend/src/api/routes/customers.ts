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

// Support both flat and nested contact info
const CreateCustomerBody = z.object({
  name: z.string().min(1).max(200),
  // Nested contactInfo (optional)
  contactInfo: ContactInfoSchema.optional(),
  // Flat fields (for simpler frontend)
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(), // Simple string address
  notes: z.string().max(5000).optional(),
  source: z.enum(CUSTOMER_SOURCES).optional(),
  kleinanzeigenId: z.string().optional(),
});

const UpdateCustomerBody = z.object({
  name: z.string().min(1).max(200).optional(),
  contactInfo: ContactInfoSchema.optional(),
  // Flat fields
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
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

// Helper: merge flat fields into contactInfo
function buildContactInfo(body: {
  contactInfo?: { email?: string; phone?: string; address?: { street?: string; city?: string; postalCode?: string; country?: string } };
  email?: string;
  phone?: string;
  address?: string;
}): CustomerContactInfo | undefined {
  const hasFlat = body.email || body.phone || body.address;
  const hasNested = body.contactInfo;

  if (!hasFlat && !hasNested) return undefined;

  // Prefer nested, merge flat
  const contactInfo: CustomerContactInfo = {
    email: body.contactInfo?.email || body.email || undefined,
    phone: body.contactInfo?.phone || body.phone || undefined,
    address: body.contactInfo?.address || (body.address ? { street: body.address } : undefined),
  };

  // Clean up empty strings
  if (contactInfo.email === '') contactInfo.email = undefined;
  if (contactInfo.phone === '') contactInfo.phone = undefined;

  return contactInfo;
}

// Helper: format customer for frontend (inject flat fields)
function formatCustomer(customer: any) {
  return {
    ...customer,
    email: customer.contactInfo?.email,
    phone: customer.contactInfo?.phone,
    address: customer.contactInfo?.address?.street,
  };
}

/**
 * Customer CRUD routes.
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
    return reply.send(result.data.map(formatCustomer)); // Return mapped array
  });

  // GET /api/customers/:id
  server.get<{ Params: { id: string } }>(
    '/customers/:id',
    async (request, reply) => {
      requireUnlocked(server);
      const customer = customerService.getById(request.params.id as UUID);
      return reply.send(formatCustomer(customer));
    },
  );

  // POST /api/customers
  server.post('/customers', async (request, reply) => {
    requireUnlocked(server);
    const body = CreateCustomerBody.parse(request.body);

    const contactInfo = buildContactInfo(body);

    const input: CreateCustomerInput = {
      name: body.name,
      ...(contactInfo ? { contactInfo } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.kleinanzeigenId !== undefined ? { kleinanzeigenId: body.kleinanzeigenId } : {}),
    };

    const customer = customerService.create(input);
    return reply.status(201).send(formatCustomer(customer));
  });

  // PUT /api/customers/:id
  server.put<{ Params: { id: string } }>(
    '/customers/:id',
    async (request, reply) => {
      requireUnlocked(server);
      const body = UpdateCustomerBody.parse(request.body);

      const contactInfo = buildContactInfo(body);

      const input: UpdateCustomerInput = {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(contactInfo ? { contactInfo } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.source !== undefined ? { source: body.source } : {}),
        ...(body.kleinanzeigenId !== undefined ? { kleinanzeigenId: body.kleinanzeigenId } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      };

      const customer = customerService.update(request.params.id as UUID, input);
      return reply.send(formatCustomer(customer));
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
