# HolzERP – Build Progress

## Session: holz-erp-phase1 (2026-02-23)

### Status: ✅ Phase 1 Complete

---

## Completed Tasks

### ✅ 1. Read SPEC.md
Full understanding of requirements: CRM, Products, Offers, Orders, Production, Invoices, Kleinanzeigen, full encryption at rest.

### ✅ 2. ARCHITECTURE.md
Created comprehensive 600+ line architecture document covering:
- Hexagonal (ports & adapters) architecture diagram
- Full module map / directory structure
- Domain model (all entities with fields)
- Encryption architecture (Argon2id + AES-256-GCM, lock/unlock flow, threat model)
- Full REST API design (all endpoints)
- Database schema (all tables with SQL)
- Security architecture (memory safety, JWT, rate limiting)
- Deployment diagram (Caddy → Frontend/Backend → SQLite)
- Pricing intelligence algorithm
- Phase roadmap (10 phases)
- Technology decisions table

### ✅ 3. Docker Configuration
- `docker-compose.yml` — production (Caddy + Backend + Frontend)
- `docker-compose.dev.yml` — development (hot reload + adminer)
- `backend/Dockerfile` — multi-stage (development → builder → production)
- `caddy/Caddyfile` — reverse proxy + security headers
- `.env.example` — documented environment variables
- `.gitignore` — proper exclusions (never commit .db or .env)

### ✅ 4. Backend Grundstruktur
**Config files:**
- `backend/package.json` — all dependencies (Fastify, argon2, better-sqlite3, zod, etc.)
- `backend/tsconfig.json` — strict TypeScript + path aliases
- `backend/tsconfig.build.json` — production build config

**Source files (35 files total):**

#### Shared Layer
- `src/shared/types/index.ts` — branded types, enums, status unions, EncryptedField
- `src/shared/errors/index.ts` — HolzError hierarchy (LockedError, NotFoundError, ImmutableError, etc.)
- `src/shared/utils/logger.ts` — pino logger with redaction
- `src/shared/utils/id.ts` — UUID + timestamp utilities

#### Domain Layer (Pure business logic)
- `src/domain/customer/Customer.ts` — Customer entity + encrypted payload schema
- `src/domain/product/Product.ts` — Product, Dimensions, PriceHistory, area/price calc
- `src/domain/offer/Offer.ts` — Offer, OfferLineItem, state machine transitions
- `src/domain/order/Order.ts` — Order entity + state machine
- `src/domain/invoice/Invoice.ts` — Invoice, finalization, totals calc
- `src/domain/production/ProductionJob.ts` — ProductionJob + ProductSnapshot
- `src/domain/pricing/PricingEngine.ts` — stub for Phase 3

#### Application Layer (Ports)
- `src/application/ports/ICryptoService.ts` — encryption abstraction
- `src/application/ports/IDatabase.ts` — DB abstraction (SQLite ↔ PG)
- `src/application/ports/IKeyStore.ts` — in-memory key management port
- `src/application/ports/ICustomerRepository.ts` — customer persistence port
- `src/application/ports/IProductRepository.ts` — product persistence port

#### Application Layer (Services)
- `src/application/services/AuthService.ts` — setup/unlock/lock/change-password with Argon2id
- `src/application/services/CustomerService.ts` — customer CRUD use cases
- `src/application/services/ProductService.ts` — product CRUD + pricing use cases

#### Infrastructure Layer
- `src/infrastructure/crypto/CryptoService.ts` — AES-256-GCM implementation
- `src/infrastructure/crypto/KeyStore.ts` — singleton in-memory key store with zero-on-lock
- `src/infrastructure/db/sqlite/SqliteDatabase.ts` — better-sqlite3 adapter
- `src/infrastructure/db/migrate.ts` — migration runner + full initial schema
- `src/infrastructure/repositories/CustomerRepository.ts` — SQLite customer repo (fully encrypted)
- `src/infrastructure/repositories/ProductRepository.ts` — SQLite product repo (name/desc encrypted)

#### API Layer
- `src/api/server.ts` — Fastify server with plugins, error handler, DI wiring
- `src/api/routes/health.routes.ts` — GET /api/health, GET /api/health/lock-state
- `src/api/routes/auth.routes.ts` — POST /api/auth/{setup,unlock,lock,change-password}
- `src/api/routes/customers.ts` — Full CRUD: GET/POST/PUT/DELETE /api/customers
- `src/api/routes/products.ts` — Full CRUD + pricing: /api/products + /api/products/:id/price

#### Entry Point
- `src/main.ts` — bootstraps DB, runs migrations, starts Fastify, graceful shutdown

---

## Project Stats
- **Files created:** ~40
- **Lines of code:** ~2,400 (TypeScript)
- **Lines of architecture:** ~600 (Markdown)
- **TypeScript errors:** 0 ✅

---

## Session: holz-erp-phase2 (2026-02-24)

### Status: ✅ Phase 2 Complete

---

## Phase 2 Completed Tasks

### ✅ 1. npm install
All 477 packages installed successfully.

### ✅ 2. TypeScript compilation fixed
Fixed 6 TypeScript errors caused by `exactOptionalPropertyTypes: true` in tsconfig:

**Root cause:** Zod `.optional()` parses to `T | undefined`, but `exactOptionalPropertyTypes: true`
requires truly-absent optional properties (no explicit `undefined`). All fixes use explicit
conditional spreads (`...(value !== undefined ? { key: value } : {})`) and `as` casts for
nested types (e.g. `ContactInfo` with its own optional sub-fields).

**Files fixed:**
- `src/api/routes/customers.ts` — create/update inputs built explicitly
- `src/api/routes/products.ts` — create/update/setPrice inputs built explicitly
- `src/infrastructure/repositories/ProductRepository.ts` — `rowToPriceHistory` refactored
  to use imperative property assignment instead of conditional spread return (avoids
  indexed-access `PriceHistory['effectiveTo']` resolving to `ISODateTime | undefined`)

### ✅ 3. Customer Repository (`src/infrastructure/repositories/CustomerRepository.ts`)
Already implemented in Phase 1 skeleton, reviewed and verified correct:
- `findById` / `findAll` / `count` — read with pagination
- `create` — encrypts full payload (name, contactInfo, notes, source, kleinanzeigenId) as
  single `encrypted_data` JSON blob using AES-256-GCM via CryptoService
- `update` — re-encrypts full payload on write; only id + timestamps + is_active in plaintext
- `softDelete` — sets `is_active = 0`

### ✅ 4. Customer Routes (`src/api/routes/customers.ts`)
- `GET /api/customers` — paginated list (includeInactive, page, pageSize)
- `GET /api/customers/:id` — single customer
- `POST /api/customers` — create with Zod validation
- `PUT /api/customers/:id` — update with partial Zod validation
- `DELETE /api/customers/:id` — soft delete (204)
- All routes guard with `requireUnlocked()` (throws LockedError → 403)

### ✅ 5. Product Repository (`src/infrastructure/repositories/ProductRepository.ts`)
Already implemented in Phase 1 skeleton, reviewed and verified correct:
- Products: name + description encrypted in `encrypted_data` column
- Searchable fields (wood_type, quality_grade, height_mm, width_mm) kept in plaintext
- `getCurrentPrice` / `getPriceHistory` / `addPriceEntry` — full price history with
  automatic closing of previous open price entry on new price set

### ✅ 6. Product Routes (`src/api/routes/products.ts`)
- `GET /api/products` — paginated list (woodType, qualityGrade, includeInactive filters)
- `GET /api/products/:id` — single product + currentPricePerM2
- `POST /api/products` — create with optional initialPricePerM2
- `PUT /api/products/:id` — partial update
- `DELETE /api/products/:id` — soft delete (204)
- `GET /api/products/:id/price-history` — full price history
- `POST /api/products/:id/price` — set new price (closes previous)

---

## Encryption Summary

| Entity | Encrypted fields | Plaintext fields |
|--------|-----------------|-----------------|
| Customer | name, contactInfo, notes, source, kleinanzeigenId (all in single `encrypted_data` blob) | id, is_active, created_at, updated_at |
| Product | name, description (in `encrypted_data`) | id, wood_type, quality_grade, height_mm, width_mm, is_active, timestamps |
| PriceHistory | none | all fields (price data not sensitive at this stage) |

---

## Next Session: Phase 3

Tasks for next agent session:
1. Implement Offer domain routes (`/api/offers`) + OfferRepository
2. Implement Order routes (`/api/orders`) + OrderRepository
3. Add integration tests for auth + customer + product flows
4. Consider JWT middleware for all protected routes (currently only checks keyStore.isUnlocked())
5. Implement PricingEngine (`src/domain/pricing/PricingEngine.ts`)

Key files to read at session start:
- `ARCHITECTURE.md` (full design — especially section 6.4, 6.5 for Offer/Order API design)
- `PROGRESS.md` (this file)
- `backend/src/domain/offer/Offer.ts` (Offer entity + state machine)
- `backend/src/domain/order/Order.ts` (Order entity)
- `backend/src/application/services/CustomerService.ts` (pattern to follow for OfferService)
