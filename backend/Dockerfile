# HolzERP Backend Dockerfile
# Multi-stage build: development → builder → production

# ─── Base ────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# Install native build tools (needed for argon2, better-sqlite3)
RUN apk add --no-cache --no-check-certificate python3 make g++ sqlite-dev

# ─── Dependencies ────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ─── Development ─────────────────────────────────────────────────
FROM deps AS development
ENV NODE_ENV=development

COPY . .

EXPOSE 3000 9229

# ts-node-dev for hot reload with source maps
CMD ["npm", "run", "dev"]

# ─── Builder ─────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN npm run build

# ─── Production Deps ─────────────────────────────────────────────
FROM base AS prod-deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ─── Production ──────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Install runtime-only native deps
RUN apk add --no-cache --no-check-certificate sqlite-libs

# Copy production npm deps only
COPY package.json package-lock.json* ./
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Create data directory
RUN mkdir -p /data/files && chown -R node:node /data /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/main.js"]
