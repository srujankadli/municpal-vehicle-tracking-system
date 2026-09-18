# Municipal Solid Waste Monitoring Platform
## Production Deployment & Containerization Guide

**Classification**: Municipal Enterprise Systems / Operations Guide
**Status**: Batch 5 Deployment Packaging

---

### 1. Overview & Architectural Boundaries

This document provides deployment guidelines for the Municipal Solid Waste Collection Monitoring, Verification & Audit Engine.

#### Epistemic and Operational Disclaimers
1. **Packaging vs. Live Deployment**: Containerization artifacts (Dockerfile, docker-compose.yml) are deployment packaging artifacts. They do NOT constitute an authorized live deployment to a municipal environment.
2. **Local Simulation vs. Municipal Production**: The local docker-compose.yml provides a local developer simulation environment combining the Node.js backend with an ephemeral PostgreSQL container. It does NOT represent an actual municipal high-availability database cluster, off-site backup system, or cloud infrastructure.
3. **External Dependencies**: Real municipal production requires separate, authority-managed PostgreSQL hosting, TLS certificates, firewall rules, and automated backup routines.

---

### 2. Local Development Workflow (SQLite)

In local development and automated testing, the platform utilizes embedded SQLite (WAL mode, foreign keys enforced) requiring zero external daemons or container services:

`ash
# 1. Install dependencies
npm install

# 2. Execute migrations against local SQLite
npm run migrate

# 3. Seed demonstration fixtures (SIMULATED_DEMO_DATA)
npm run seed

# 4. Start development backend and frontend
npm run dev
npm run dev:frontend

# 5. Run test suites
npm test
`

---

### 3. Local Production Simulation Workflow (Docker Compose)

A complete local production simulation can be executed using Docker Compose, which provisions the application container alongside a local PostgreSQL 16 database:

`ash
# 1. Build and start the simulation cluster
docker compose up -d --build

# 2. Inspect running container status
docker compose ps

# 3. Inspect application logs (structured JSON logs)
docker compose logs -f app

# 4. Check application liveness (/healthz)
curl -i http://localhost:3000/healthz

# 5. Check persistence readiness (/readyz)
curl -i http://localhost:3000/readyz

# 6. Graceful shutdown
docker compose down
`

---

### 4. Production Database Configuration (PostgreSQL)

When deploying to a real municipal production environment, the backend container connects to an enterprise PostgreSQL instance via environment variables:

| Variable | Description | Example / Allowed Values |
| :--- | :--- | :--- |
| NODE_ENV | Must be set to production | production |
| PORT | Listening HTTP port | 3000 |
| HOST | Bind address (use 0.0.0.0 in container) | 0.0.0.0 |
| DB_CLIENT | Persistence client selector | postgres |
| DATABASE_URL | PostgreSQL connection string | postgresql://user:pass@host:5432/db |
| DB_POOL_MIN | Minimum connections in pool | 2 |
| DB_POOL_MAX | Maximum connections in pool | 10 |
| JWT_SECRET | Secret for signing auth tokens (>= 32 chars) | High-entropy random secret |
| WEBHOOK_HMAC_SECRET | Secret for verifying payment webhooks | High-entropy random secret |
| CORS_ORIGIN | Allowed web origins | https://swm.city.gov.in |
| HSTS_ENABLED | HTTP Strict Transport Security flag | true |
| RATE_LIMIT_ENABLED | Request rate limiting toggle | true |
| RATE_LIMIT_MAX | Max requests per time window | 100 |
| RATE_LIMIT_WINDOW_MS | Rate limiting sliding window in ms | 60000 |
| LOG_LEVEL | Logging verbosity | info, warn, error |

#### Strict Secret Validation Invariants
The application startup strictly validates that default development secrets are NEVER used in production mode (NODE_ENV=production). Attempting to start the application with default secrets will cause an immediate fatal exit ([CONFIG_SECURITY_FATAL]).

---

### 5. Database Migration Process

The database schema is managed via the deterministic Migration CLI (src/db/migrate.ts):
1. **Forward Migrations**: npm run migrate applies all pending versioned SQL migrations deterministically in ascending sequence.
2. **Metadata Tracking**: Applied migrations are permanently recorded in the schema_migrations table.
3. **Production Seeding Guard**: Synthetic demo data (npm run seed) is strictly blocked in production mode. It will unconditionally abort unless the explicit emergency bypass flag --allow-demo-seeding-in-production is supplied.
4. **Zero Destructive Migrations**: The migration runner explicitly forbids destructive commands (drop, reset, truncate) in production.

---

### 6. Container Architecture & Security Invariants

The production Dockerfile enforces standard enterprise security controls:
1. **Multi-Stage Build**: Development dependencies (typescript, @types/*, vite) are excluded from the runtime container, resulting in a minimal attack surface.
2. **Non-Root Execution**: The container runs under the unprivileged standard node user (UID/GID 1000). Root execution is prevented.
3. **No Embedded Secrets**: The Dockerfile contains zero passwords, secrets, or .env files. Secrets are injected at runtime via container environment variables or volume secrets.
4. **Healthcheck Probe**: The container healthcheck executes wget --spider http://127.0.0.1:3000/healthz. This probe evaluates process responsiveness without coupling to external network or database state.
5. **Structured Logging**: Application logs are output directly to stdout in structured JSON format, ready for ingestion by log collectors.

---

### 7. Known Production Limitations & Operational Dependencies

1. **Process-Local Rate Limiting**:
   - The HTTP rate limiter (@fastify/rate-limit) operates in-memory on a per-process basis.
   - Horizontal scaling across multiple container instances requires a future distributed cache (e.g., Redis) if globally coordinated request quotas are required.
2. **Backup and Disaster Recovery**:
   - The container deployment does not provide managed database backups.
   - Production PostgreSQL backup schedules (e.g. daily pg_dump, continuous WAL archiving, off-site replication, and formal RPO/RTO SLAs) must be managed by the municipal IT infrastructure team.
3. **Frontend Asset Serving**:
   - The frontend is compiled to static production assets in dist-frontend/ via npm run build:frontend.
   - In production, these static files should be served via an edge CDN or a reverse proxy (e.g., NGINX / Caddy) configured with TLS termination and reverse-proxy routing to the backend /api and /healthz endpoints.