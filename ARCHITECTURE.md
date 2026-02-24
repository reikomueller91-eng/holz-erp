# HolzERP – System Architecture

> Version: 1.0 | Date: 2026-02-23 | Status: Design

---

## 1. Overview

HolzERP is a self-hosted, fully encrypted ERP system for a small sawmill/wood production business. It manages the entire business process from customer contact to invoicing and production tracking.

The system is designed around **security-first**: all business data is encrypted at rest using AES-256-GCM with keys derived via Argon2id from a master password. Without the master password, the database contains only ciphertext.

---

## 2. Architecture Style: Hexagonal (Ports & Adapters)

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRIMARY ADAPTERS                          │
│          REST API (Fastify)  │  CLI (later)  │  Webhook         │
└─────────────────┬───────────────────────────────────────────────┘
                  │ calls
┌─────────────────▼───────────────────────────────────────────────┐
│                      APPLICATION LAYER                           │
│  Use Cases / Application Services (orchestrate domain logic)     │
│                                                                  │
│  CustomerService  │  OfferService  │  OrderService               │
│  PricingService   │  InvoiceService│  ProductionService          │
│  AuthService      │  ExportService │  KleinanzeigenService       │
└─────────────────┬───────────────────────────────────────────────┘
                  │ uses
┌─────────────────▼───────────────────────────────────────────────┐
│                        DOMAIN LAYER                              │
│  Entities, Value Objects, Domain Events, Business Rules          │
│                                                                  │
│  Customer │ Product │ Offer │ Order │ Invoice │ ProductionJob    │
│  PriceCalc│ WoodSpec│ QualityGrade │ Dimensions │ PriceHistory  │
└─────────────────┬───────────────────────────────────────────────┘
                  │ via ports (interfaces)
┌─────────────────▼───────────────────────────────────────────────┐
│                     SECONDARY ADAPTERS                           │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  DB Adapter      │  │ Crypto Adptr │  │  PDF Adapter      │  │
│  │  (SQLite now,    │  │ AES-256-GCM  │  │  (Puppeteer/PDFKit│  │
│  │   PG-ready)      │  │  + Argon2id  │  │   or html-pdf)    │  │
│  └──────────────────┘  └──────────────┘  └───────────────────┘  │
│  ┌──────────────────┐  ┌──────────────┐                         │
│  │  Kleinanzeigen   │  │  File Store  │                         │
│  │  Adapter (HTTP)  │  │  (local FS)  │                         │
│  └──────────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Map

```
holz-erp/
├── backend/
│   ├── src/
│   │   ├── domain/              # Pure business logic — no I/O
│   │   │   ├── customer/
│   │   │   ├── product/
│   │   │   ├── offer/
│   │   │   ├── order/
│   │   │   ├── invoice/
│   │   │   ├── production/
│   │   │   └── pricing/
│   │   ├── application/         # Use cases, services, ports (interfaces)
│   │   │   ├── ports/           # Repository interfaces
│   │   │   └── services/        # Application services
│   │   ├── infrastructure/      # Adapters (implementations)
│   │   │   ├── db/              # Database adapter (SQLite → PG)
│   │   │   │   ├── sqlite/
│   │   │   │   ├── migrations/
│   │   │   │   └── repositories/
│   │   │   ├── crypto/          # Encryption adapter
│   │   │   ├── pdf/             # PDF generation adapter
│   │   │   ├── kleinanzeigen/   # Kleinanzeigen HTTP adapter
│   │   │   └── filestore/       # File storage adapter
│   │   ├── api/                 # Fastify REST routes, controllers
│   │   │   ├── routes/
│   │   │   ├── plugins/
│   │   │   ├── middleware/
│   │   │   └── schemas/         # JSON Schema / Zod for validation
│   │   ├── shared/              # Shared utilities, errors, types
│   │   │   ├── errors/
│   │   │   ├── types/
│   │   │   └── utils/
│   │   └── main.ts              # Entry point
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── frontend/                    # React + Vite (Phase 2)
│   └── ...
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── SPEC.md
├── ARCHITECTURE.md
└── PROGRESS.md
```

---

## 4. Domain Model

### 4.1 Core Entities

#### Customer
```
Customer {
  id: UUID
  name: string (encrypted)
  contactInfo: ContactInfo (encrypted)
  notes: string (encrypted)
  source: 'direct' | 'kleinanzeigen' | 'referral' | 'other'
  kleinanzeigenId?: string (encrypted)
  createdAt: DateTime
  updatedAt: DateTime
  isActive: boolean
}

ContactInfo {
  email?: string
  phone?: string
  address?: Address
}
```

#### Product
```
Product {
  id: UUID
  name: string
  woodType: WoodType         # Eiche, Kiefer, Fichte, etc.
  qualityGrade: QualityGrade # A, B, C, Rustikal, etc.
  dimensions: Dimensions     # height mm × width mm
  description?: string
  isActive: boolean
}

Dimensions {
  heightMm: number
  widthMm: number
  lengthMm?: number          # optional, can vary per order
}

# Area = height * width * length (in m²) — basis for pricing
```

#### Offer
```
Offer {
  id: UUID
  version: number
  customerId: UUID
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
  lineItems: OfferLineItem[]
  validUntil: Date
  notes?: string (encrypted)
  pdfPath?: string
  createdAt: DateTime
  updatedAt: DateTime
}

OfferLineItem {
  productId: UUID
  lengthMm: number
  quantityPieces: number
  unitPricePerM2: number     # €/m²
  totalPrice: number         # computed
  notes?: string
}
```

#### Order
```
Order {
  id: UUID
  offerId: UUID
  customerId: UUID
  status: 'pending' | 'in_production' | 'ready' | 'delivered' | 'cancelled'
  productionJobs: ProductionJob[]
  createdAt: DateTime
  updatedAt: DateTime
}
```

#### Invoice
```
Invoice {
  id: UUID
  version: number
  orderId: UUID
  customerId: UUID
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  lineItems: InvoiceLineItem[]
  totalNet: number
  taxRate: number
  totalGross: number
  dueDate: Date
  paidAt?: DateTime
  finalizedAt?: DateTime     # immutable after this
  pdfPath?: string
  createdAt: DateTime
}
```

#### ProductionJob
```
ProductionJob {
  id: UUID
  orderId: UUID
  lineItemRef: string
  product: ProductSnapshot   # snapshot at time of production
  targetQuantity: number
  producedQuantity: number
  status: 'queued' | 'in_progress' | 'done' | 'issue'
  notes?: string
  startedAt?: DateTime
  completedAt?: DateTime
}
```

#### PriceHistory
```
PriceHistory {
  id: UUID
  productId: UUID
  pricePerM2: number
  effectiveFrom: Date
  effectiveTo?: Date
  reason?: string
}
```

---

## 5. Encryption Architecture

### 5.1 Threat Model
- Attacker gains read access to disk (SQLite file leaked, backup stolen)
- Should see: only ciphertext, never business data
- Master password never stored; key never persisted

### 5.2 Key Derivation
```
MasterPassword → Argon2id(salt=stored_in_db, m=65536, t=3, p=4) → MasterKey (32 bytes)
```

### 5.3 Encryption Scheme
```
MasterKey → AES-256-GCM(iv=random 12 bytes, aad=record_type:id) → ciphertext + authTag
```

Storage format per encrypted field:
```
{
  "v": 1,
  "alg": "aes-256-gcm",
  "iv": "<base64>",
  "tag": "<base64>",
  "data": "<base64 ciphertext>"
}
```
Stored as JSON string in DB column.

### 5.4 Lock/Unlock Flow
```
App Start → LOCKED state (all data encrypted in DB)
   │
   ▼
User POSTs /api/auth/unlock { masterPassword }
   │
   ▼
Argon2id derives MasterKey → held in memory (process.memoryStore)
   │
   ▼
UNLOCKED state → requests can decrypt/encrypt via CryptoService
   │
   ▼
POST /api/auth/lock → MasterKey zeroed from memory
   │
   ▼
LOCKED state again
```

### 5.5 What Is NOT Encrypted
- Record IDs (UUID)
- Timestamps (createdAt, updatedAt)
- Status enums (offer.status, order.status, etc.)
- Non-sensitive product dimensions (heightMm, widthMm)
- Price amounts (debatable — encrypted in v2 if needed)

---

## 6. API Design

### 6.1 Auth Endpoints
```
POST /api/auth/setup        # First-run: set master password
POST /api/auth/unlock       # Unlock with master password
POST /api/auth/lock         # Lock (wipe key from memory)
GET  /api/auth/status       # locked | unlocked
POST /api/auth/change-password
```

### 6.2 Customer Endpoints
```
GET    /api/customers
GET    /api/customers/:id
POST   /api/customers
PUT    /api/customers/:id
DELETE /api/customers/:id   # soft delete
GET    /api/customers/:id/offers
GET    /api/customers/:id/orders
```

### 6.3 Product Endpoints
```
GET    /api/products
GET    /api/products/:id
POST   /api/products
PUT    /api/products/:id
DELETE /api/products/:id    # soft delete
GET    /api/products/:id/price-history
POST   /api/products/:id/price           # set new price
```

### 6.4 Offer Endpoints
```
GET    /api/offers
GET    /api/offers/:id
POST   /api/offers
PUT    /api/offers/:id       # only draft/sent
POST   /api/offers/:id/send  # status → sent
POST   /api/offers/:id/accept # status → accepted, creates Order
POST   /api/offers/:id/reject
POST   /api/offers/:id/pdf   # generate/regen PDF
GET    /api/offers/:id/pdf   # download PDF
```

### 6.5 Order Endpoints
```
GET    /api/orders
GET    /api/orders/:id
POST   /api/orders/:id/production-jobs
GET    /api/orders/:id/production-jobs
POST   /api/orders/:id/invoice  # generate invoice from order
```

### 6.6 Invoice Endpoints
```
GET    /api/invoices
GET    /api/invoices/:id
PUT    /api/invoices/:id        # only drafts
POST   /api/invoices/:id/finalize
POST   /api/invoices/:id/send
POST   /api/invoices/:id/mark-paid
POST   /api/invoices/:id/pdf
GET    /api/invoices/:id/pdf
```

### 6.7 Production Endpoints
```
GET    /api/production          # all production jobs, filterable
GET    /api/production/:id
PATCH  /api/production/:id      # update status, producedQuantity
POST   /api/production/:id/start
POST   /api/production/:id/complete
```

### 6.8 Pricing Endpoints
```
GET    /api/pricing/suggest     # ?productId=&customerId=&quantity=
GET    /api/pricing/history     # price trend analytics
```

---

## 7. Database Schema (SQLite)

### 7.1 Design Principles
- All sensitive text columns stored as BLOB/TEXT containing encrypted JSON
- Use a `db/` abstraction layer (interface `IDatabase`) → swap SQLite ↔ PostgreSQL by swapping adapter
- Migrations via `db-migrate` or custom migration runner

### 7.2 Tables

```sql
-- System / Auth
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
  -- stores: argon2_salt, app_version, setup_complete, etc.
);

-- Customers
CREATE TABLE customers (
  id TEXT PRIMARY KEY,           -- UUID
  encrypted_data TEXT NOT NULL,  -- JSON: name, contact, notes, source, kleinanzeigenId
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Products
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,            -- not encrypted (product catalog)
  wood_type TEXT NOT NULL,
  quality_grade TEXT NOT NULL,
  height_mm INTEGER NOT NULL,
  width_mm INTEGER NOT NULL,
  description TEXT,              -- not encrypted
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Price History
CREATE TABLE price_history (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  price_per_m2 REAL NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

-- Offers
CREATE TABLE offers (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'draft',
  valid_until TEXT,
  encrypted_notes TEXT,
  pdf_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE offer_line_items (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  length_mm INTEGER NOT NULL,
  quantity_pieces INTEGER NOT NULL,
  unit_price_per_m2 REAL NOT NULL,
  total_price REAL NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Orders
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Production Jobs
CREATE TABLE production_jobs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  line_item_ref TEXT NOT NULL,
  product_snapshot TEXT NOT NULL, -- encrypted JSON snapshot
  target_quantity INTEGER NOT NULL,
  produced_quantity INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  notes TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Invoices
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  order_id TEXT NOT NULL REFERENCES orders(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'draft',
  total_net REAL NOT NULL,
  tax_rate REAL NOT NULL DEFAULT 0.19,
  total_gross REAL NOT NULL,
  due_date TEXT,
  paid_at TEXT,
  finalized_at TEXT,
  pdf_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE invoice_line_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id TEXT,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

---

## 8. Security Architecture

### 8.1 Memory Safety
- MasterKey stored as `Buffer` in a singleton `KeyStore` service
- On lock: buffer is zeroed with `key.fill(0)` then set to null
- No key material in logs, error messages, or HTTP responses
- Fastify request logging redacts `Authorization` headers

### 8.2 Transport Security
- TLS termination at reverse proxy (Caddy/nginx in docker-compose)
- Internal API: HTTP (docker network only)
- HTTPS required in production

### 8.3 Auth / Session
- JWT tokens (short-lived: 15 min) + refresh token (httpOnly cookie, 8h)
- JWT signed with a per-session ephemeral secret derived from MasterKey
- On lock: all active JWTs invalidated (new secret derived on next unlock)

### 8.4 Rate Limiting
- Unlock endpoint: max 5 attempts/minute (brute force protection)
- Global: 100 req/min per IP

---

## 9. Deployment Architecture

```
Internet
    │
    ▼
┌─────────────────┐
│   Caddy (TLS)   │   ← reverse proxy, auto HTTPS
│   :443          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐         ┌──────────────────┐
│  Frontend       │         │   Backend API     │
│  Nginx:80       │────────▶│   Fastify:3000    │
│  (React SPA)    │         │                  │
└─────────────────┘         └────────┬─────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │   SQLite DB      │
                            │   /data/holz.db  │
                            │   (volume mount) │
                            └──────────────────┘
                                     │
                            ┌──────────────────┐
                            │   File Store     │
                            │   /data/files/   │
                            │   (PDFs, etc.)   │
                            └──────────────────┘
```

All services communicate on a private Docker network. Only Caddy is exposed externally.

---

## 10. Pricing Intelligence

### 10.1 Price Suggestion Algorithm
```
1. Get current price for product → PriceHistory.latest(productId)
2. Get historical orders for same customer+product → avg price paid
3. Get market trend (last 6 months avg) → linear regression slope
4. Suggest: max(currentPrice, historicalAvg) with trend adjustment
5. Surface confidence score (based on data density)
```

### 10.2 Area Calculation
```
areaM2 = (heightMm / 1000) * (widthMm / 1000) * (lengthMm / 1000)
totalPrice = areaM2 * unitPricePerM2 * quantityPieces
```

---

## 11. Production Interface (Mobile-First)

### 11.1 Design Goals
- Big touch targets (≥ 48px)
- Keypad input for quantities (no text keyboard where possible)
- Swipe to change production job status
- Offline-capable (PWA with service worker, later)
- High contrast for workshop lighting

### 11.2 Production Flow
```
Order List → Select Order → Job List → Tap Job
→ Start Job (status: in_progress)
→ Keypad: enter produced quantity
→ Mark Done / Report Issue
```

---

## 12. Kleinanzeigen Integration

### 12.1 Scope
- Manual trigger: "Import from Kleinanzeigen"
- Parse incoming contact/lead data
- Create Customer record automatically
- Link customer to Kleinanzeigen listing ID

### 12.2 Implementation
- HTTP adapter for Kleinanzeigen API (or scraper if no API)
- Configurable via environment (API key, search criteria)
- No automatic sync (manual pull-based)

---

## 13. Technology Decisions

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Node.js 20+ LTS | Stability, ecosystem |
| Language | TypeScript | Type safety, refactoring |
| HTTP Framework | Fastify | Performance, schema validation, plugin system |
| ORM/DB | Raw SQL + custom abstraction | Full control, easy PG migration |
| DB (now) | SQLite (better-sqlite3) | Zero config, single file, perfect for self-hosted |
| DB (later) | PostgreSQL | When multi-user/concurrent needed |
| Encryption | Argon2id + AES-256-GCM | State of the art, Node built-in crypto |
| Validation | Zod + Fastify JSON Schema | Runtime type safety |
| PDF | Puppeteer or PDFKit | TBD: Puppeteer for HTML→PDF fidelity |
| Frontend | React + Vite | Phase 2 |
| Containerization | Docker + Docker Compose | Self-hosted deployment |
| Reverse Proxy | Caddy | Auto HTTPS, simple config |
| Testing | Vitest + Supertest | Fast, ESM-native |

---

## 14. Phase Roadmap

| Phase | Scope |
|---|---|
| **Phase 1** (current) | Architecture, Docker setup, Backend skeleton |
| **Phase 2** | Domain models, DB migrations, Auth + Crypto |
| **Phase 3** | Customer, Product, Pricing APIs |
| **Phase 4** | Offer system + PDF generation |
| **Phase 5** | Order + Production APIs |
| **Phase 6** | Invoice system |
| **Phase 7** | React frontend (all modules) |
| **Phase 8** | Kleinanzeigen integration |
| **Phase 9** | Mobile PWA + offline |
| **Phase 10** | Multi-user, PostgreSQL migration |
