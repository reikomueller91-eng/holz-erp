# HolzERP 🪵

> Custom sawn wood production management system — self-hosted, fully encrypted.

## Features

- 🔐 **Full encryption at rest** (AES-256-GCM, Argon2id key derivation)
- 👥 **Customer Management** (CRM)
- 📦 **Product Catalog** (wood type × quality grade × dimensions)
- 💰 **Smart Pricing** (area-based, historical intelligence)
- 📋 **Offer System** (versioned, PDF generation)
- 📦 **Order Management** (from accepted offers)
- 🏭 **Production Tracking** (mobile-first, keypad-optimized)
- 🧾 **Invoice System** (versioned, immutable after finalization)
- 🔗 **Kleinanzeigen Integration**
- 🐳 **Docker-based self-hosted deployment**

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js 20 + TypeScript + Fastify |
| Database | SQLite (better-sqlite3, PostgreSQL-ready) |
| Encryption | Argon2id + AES-256-GCM (Node built-in crypto) |
| Frontend | React + Vite *(Phase 2)* |
| Reverse Proxy | Caddy (auto HTTPS) |
| Containers | Docker + Docker Compose |

## Quick Start

```bash
# 1. Clone & configure
cp .env.example .env
# Edit .env with your settings

# 2. Start
docker compose up -d

# 3. Setup (first run — set your master password)
curl -X POST https://your-domain/api/auth/setup \
  -H 'Content-Type: application/json' \
  -d '{"masterPassword":"your-secure-password"}'
```

## Development

```bash
cd backend
npm install
npm run dev
```

API runs at `http://localhost:3000`. Check `/api/health` to confirm.

## Security Model

HolzERP is **locked by default**. All business data is encrypted with AES-256-GCM. The encryption key is derived from your master password using Argon2id and held only in memory while unlocked. Locking wipes the key from memory immediately.

**Never loses your master password** — there is no recovery mechanism by design.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

## Status

| Phase | Status |
|---|---|
| Phase 1: Architecture + Docker + Backend skeleton | ✅ Complete |
| Phase 2: Domain models + Auth + Crypto + Customer/Product CRUD | ✅ Complete |
| Phase 3: Pricing + Offer system + Order system | ✅ Complete |
| Phase 4: Invoice system + PDF | ✅ Complete |
| Phase 5: Production UI (keypad-optimized) | ⏳ Planned |
| Phase 6: React frontend | ⏳ Planned |
| Phase 7: Kleinanzeigen Integration | ⏳ Planned |

## License

MIT
