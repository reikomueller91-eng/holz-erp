# HolzERP – Specification

Full specification saved from user request 2026-02-23.

## Summary
Custom sawn wood production management system:
- Customer Management (CRM)
- Product Model (height × width, wood type, quality)
- Pricing Logic (area-based, historical intelligence)
- Offer System (versioned, PDF generation)
- Order Management (from accepted offers)
- Production/Fulfillment (keypad-optimized, mobile-ready)
- Invoice System (versioned, immutable after finalization)
- Kleinanzeigen Integration
- Full encryption at rest (AES-256-GCM, Argon2id)
- Docker-based self-hosted deployment
- Fully open-source

## Key Constraints
- Locked state by default (no readable data without master password)
- All business data encrypted at rest
- REST API (GraphQL-ready)
- Modular/hexagonal architecture
- Single-user initially, multi-user ready
- Mobile-first, keypad-optimized production interface
