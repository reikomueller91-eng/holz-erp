# HolzERP – Build Progress

## Overview

- Phase 1: Architecture + Docker + Backend skeleton ✅ Complete
- Phase 2: Customer, Product, Auth, Crypto ✅ Complete  
- Phase 3: Pricing, Offers, Orders ✅ Complete
- Phase 4: Invoice system + PDF ⏳ Planned
- Phase 5: Production UI (keypad-optimized) ⏳ Planned
- Phase 6: React Frontend ⏳ Planned
- Phase 7: Kleinanzeigen Integration ⏳ Planned

---

## Session: holz-erp-phase3 (2026-02-24)

### Status: ✅ Phase 3 Complete

---

## Phase 3 Completed Tasks

### ✅ 1. PricingService (`src/application/services/PricingService.ts`)
- Area-based price calculation: `(height × width) / divisor × length × quantity`
- Quality grade adjustments (A-E)
- Quantity discount tiers (10→5%, 50→10%, 100→15%)
- Price history analysis for intelligent suggestions
- `calculatePrice()` — core calculation with all parameters
- `calculatePriceForProduct()` — convenience wrapper using Product object
- `getPriceHistory()` — fetches historical prices from orders
- `suggestPrice()` — recommends price based on history and customer context

### ✅ 2. Pricing Routes (`src/api/routes/pricing.ts`)
- `POST /api/pricing/calculate` — Calculate price for dimensions
- `POST /api/pricing/history` — Get price history for product
- `POST /api/pricing/suggest` — Get intelligent price suggestion

### ✅ 3. Offer Domain Model (`src/domain/models/Offer.ts`)
- Full Offer entity with version history support
- State machine: draft → sent → accepted → rejected → converted
- Offer items with dimensions, quality, pricing
- Version tracking (every change creates new version)
- `update()` — creates new version with change tracking
- `markAsSent()` / `markAsAccepted()` / `markAsRejected()` / `markAsConverted()`

### ✅ 4. Offer Repository (`src/infrastructure/repositories/OfferRepository.ts`)
- Full encrypted storage using AES-256-GCM
- `encrypted_data` column contains: sellerAddress, customerAddress, items, totals
- Plaintext columns: id, status, customer_id, timestamps
- `findAll()` / `findById()` / `findByOfferNumber()` / `findByCustomer()`
- `save()` / `update()` / `getVersionHistory()` / `saveVersion()`
- Version history stored in separate `offer_versions` table

### ✅ 5. Offer Routes (`src/api/routes/offers.ts`)
- `GET /api/offers` — List with filters (status, customerId, pagination)
- `GET /api/offers/:id` — Get offer with version history
- `POST /api/offers` — Create offer from customer + items
- `PUT /api/offers/:id` — Update offer (creates new version)
- `POST /api/offers/:id/status` — Change status (sent/accepted/rejected)
- `GET /api/offers/:id/versions/:version` — Get specific version

### ✅ 6. Order Domain Model (`src/domain/models/Order.ts`)
- Order entity with production tracking
- States: new → in_production → finished → invoiced → paid → picked_up
- Production status: not_started → in_progress → completed
- Items track: quantity, quantityProduced, productionStatus
- `updateItemProduction()` — incrementally update produced quantity
- `markAsInvoiced()` / `markAsPaid()` / `markAsPickedUp()`

### ✅ 7. Order Repository (`src/infrastructure/repositories/OrderRepository.ts`)
- Full encrypted storage (items, totals, production status in `encrypted_data`)
- Plaintext: id, status, customer_id, timestamps, finished_at
- `findAll()` / `findById()` / `findByProduct()` / `findByOfferId()` / `findByOrderNumber()`
- `save()` / `update()`
- Filters by status for production views

### ✅ 8. Order Routes (`src/api/routes/orders.ts`)
- `GET /api/orders` — List orders with filters
- `GET /api/orders/production` — Production view (all open items aggregated)
- `GET /api/orders/:id` — Get order with customer info
- `POST /api/orders` — Create order (from offer or scratch)
- `POST /api/orders/:id/production` — Update production quantity for item
- `POST /api/orders/:id/status` — Change order status

### ✅ 9. TypeScript Verification
- All 3 phases compile with **0 TypeScript errors**
- Fixed all `exactOptionalPropertyTypes` issues
- Proper UUID branded type usage (via shared/types/index.ts)
- Correct ICryptoService interface usage (encryptJson → serializeField)
- Correct IDatabase interface usage (run/query/queryOne, no execute)

---

## Encryption Architecture (All Phases)

| Entity | Encrypted fields | Plaintext fields |
|--------|-----------------|-----------------|
| Customer | name, contactInfo, notes, source, kleinanzeigenId | id, is_active, timestamps |
| Product | name, description | id, wood_type, quality_grade, dimensions, is_active, timestamps |
| Offer | sellerAddress, customerAddress, items, totals, notes | id, offer_number, status, customer_id, timestamps |
| Order | items, totals, productionStatus, notes | id, order_number, status, customer_id, timestamps, finished_at |

---

## REST API Summary

### Auth
- `POST /api/auth/setup` — Initial master password
- `POST /api/auth/unlock` — Unlock system
- `POST /api/auth/lock` — Lock system
- `POST /api/auth/change-password` — Change master password

### Customers
- `GET /api/customers` — List (paginated, filters)
- `POST /api/customers` — Create
- `GET /api/customers/:id` — Get
- `PUT /api/customers/:id` — Update
- `DELETE /api/customers/:id` — Soft delete

### Products
- `GET /api/products` — List (paginated, filters)
- `POST /api/products` — Create
- `GET /api/products/:id` — Get + current price
- `PUT /api/products/:id` — Update
- `DELETE /api/products/:id` — Soft delete
- `GET /api/products/:id/price-history` — Price history
- `POST /api/products/:id/price` — Set new price

### Pricing
- `POST /api/pricing/calculate` — Calculate price
- `POST /api/pricing/history` — Price history
- `POST /api/pricing/suggest` — Intelligent suggestion

### Offers
- `GET /api/offers` — List (paginated, filters)
- `POST /api/offers` — Create
- `GET /api/offers/:id` — Get with version history
- `PUT /api/offers/:id` — Update (creates version)
- `POST /api/offers/:id/status` — Change status
- `GET /api/offers/:id/versions/:version` — Get version

### Orders
- `GET /api/orders` — List
- `GET /api/orders/production` — Production view
- `POST /api/orders` — Create (from offer or scratch)
- `GET /api/orders/:id` — Get with customer info
- `POST /api/orders/:id/production` — Update production progress
- `POST /api/orders/:id/status` — Change status

---

## Next Session: Phase 4

Tasks for next agent session:
1. Invoice domain model + repository + routes
2. PDF generation for offers and invoices
3. Template system for PDF layouts
4. Invoice finalization (immutable after finalize)

Key files to read:
- `ARCHITECTURE.md` (section on Invoices and PDF generation)
- `backend/src/domain/invoice/Invoice.ts` (existing stub)
- `backend/src/infrastructure/repositories/OrderRepository.ts` (pattern for InvoiceRepository)

---

## Project Stats (All Phases)
- **Total files:** ~60
- **Lines of code:** ~3,200 (TypeScript)
- **Lines of architecture:** ~600 (Markdown)
- **TypeScript errors:** 0 ✅
- **Tests:** ⏳ Not yet implemented
