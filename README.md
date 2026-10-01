# Municipal Solid Waste Collection Monitoring, Verification & Audit System

A government-facing enterprise platform for tracking, algorithmic verification, and audit of municipal solid waste collection operations across urban wards.

---

## 1. System Overview

The Municipal Solid Waste Collection Monitoring System provides end-to-end operational visibility, physical collection verification, driver payment attribution, and deterministic anomaly detection for municipal corporations.

### Core Architectural Invariants:
1. **Epistemic Invariant (`OBSERVED != VERIFIED`)**:
   - Vehicle GPS corridor proximity records an operational observation (`OBSERVED`), but is never sufficient proof of doorstep collection.
   - Verified collection (`VERIFIED`) strictly mandates physical interaction: a physical doorstep scan (`DOORSTEP_NFC_TAP` or `DOORSTEP_QR_SCAN`) recorded by an assigned crew during an active shift, with no resident grievance contestation.
2. **Driver Beneficiary Snapshot Model**:
   - Household &rarr; Route &rarr; Valid Master Assignment &rarr; Assigned Driver &rarr; Immutable `beneficiary_driver_id` snapshot on obligations and payment records.
3. **Fail-Closed Ward Access**:
   - Supervisory and Ward Officer roles are strictly scoped to their assigned municipal ward. If `wardId` is missing, access fails closed with HTTP 403.
4. **Deterministic Anomaly Surveillance Engine (`ANOM-01` to `ANOM-07`)**:
   - Automated, objective discrepancy detection across fleet schedules, physical scans, citizen grievances, bank reconciliations, and vehicle route assignments.

---

## 2. Technology Stack

- **Backend Runtime**: Node.js 22+ (ES Modules, TypeScript 5.8)
- **HTTP Server**: Fastify 5.2 (High-throughput, schema-validated routing)
- **Database**:
  - Default: SQLite 3 via `node:sqlite` (DatabaseSync, WAL mode, foreign keys enforced)
  - Optional / Scaled: PostgreSQL 16+ via pg adapter
- **Security & Validation**: Zod 3.24, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cors`, HMAC-SHA256 signatures
- **Frontend SPA**: React 19, TypeScript, React Router 7, Vite 8, Lucide React, Leaflet
- **Internationalization (i18n)**: English (baseline) and Hindi (mirror parity)
- **Testing**: Node.js native test runner (`node:test`, `tsx --test`), Playwright Chromium

---

## 3. Role-Based Access Control (RBAC)

The system enforces 7 distinct operational roles:

| Role | Portal / View | Primary Responsibilities & Permissions |
| :--- | :--- | :--- |
| **CITIZEN** | `/citizen` | View personal household collection status, inspect payment obligations, file missed-collection complaints. Strict anti-IDOR protection. |
| **WORKER** | `/worker` | Field crew terminal: view daily assignment roster, execute run lifecycle (`NOT_STARTED` &rarr; `IN_PROGRESS` &rarr; `COMPLETED`), log doorstep NFC/QR evidence. |
| **DRIVER** | `/worker` (or `/driver`) | View vehicle assignment, route corridors, active service run. Isolated from citizen complaints and financial ledgers. |
| **SUPERVISOR** | `/authority` | Ward-scoped Operations Center: route monitoring, household rosters, manual verification overrides (with mandatory audit reason). |
| **WARD_OFFICER** | `/authority` | Ward-scoped Fleet and Route inventory management. Scoped to assigned ward. |
| **AUTHORITY** | `/authority` | Municipal Commissioner executive view: citywide fleet metrics (FOA), collection reconciliation ratios (CRR), route completion (RC), anomaly surveillance, bank settlement scrolls. |
| **ADMIN** | `/authority` | Full administrative governance: grievance resolution (`RESOLVE_COMPLAINT`), system configuration, append-only audit trail review. |

---

## 4. Canonical Anomaly Rules (ANOM-01 to ANOM-07)

The system implements 7 canonical deterministic operational anomaly rules:

- **ANOM-01**: **Assigned Vehicle Inactivity** — Scheduled daily assignment >90 minutes overdue without start/departure. Evaluated automatically via background worker.
- **ANOM-02**: **Rapid-Fire Scan Anomaly** — Consecutive physical doorstep scans logged for distinct households with delta $t < 5$ seconds.
- **ANOM-03**: **Uncorroborated Collection Dispute** — Citizen files a missed-collection complaint for a service date where crew logged `VERIFIED` or `OBSERVED`, automatically transitioning verification to `DISPUTED`.
- **ANOM-04**: **Payment Reference Collision** — Payment gateway transaction reference matches another existing payment.
- **ANOM-05**: **Bank Settlement Discrepancy** — Bank statement deposit amount differs from gateway transaction settlement.
- **ANOM-06**: **Route Abandonment** — Service run marked `COMPLETED` but route completion rate is <60%.
- **ANOM-07**: **Assignment Conflict** — Same vehicle or driver assigned to multiple distinct routes on the same service date.

---

## 5. Local Development Setup

### Prerequisites
- Node.js 22.0.0 or higher
- npm 10+
- Google Chrome / Chromium (for Playwright browser tests)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
For local development, the default values in `.env.example` run out-of-the-box.

### Step 3: Initialize Database & Seed Baseline Data
```bash
# Run relational migrations
npm run migrate

# Seed deterministic demonstration fixtures (10 routes, 4 vehicles, 7 roles)
npm run seed
```

### Step 4: Run Development Servers
```bash
# Start backend API (runs on http://127.0.0.1:3000 with auto-reload)
npm run dev

# In a separate terminal, start frontend dev server (runs on http://127.0.0.1:5173)
npm run dev:frontend
```

---

## 6. Testing & Quality Assurance

The application includes an automated test matrix with 215 verified assertions:

```bash
# Run the complete standard unit & integration test suite (116 tests)
npm test

# Run backend test suite only
npm run test:backend

# Run frontend component & contract tests only
npm run test:frontend

# Run RBAC & scope-integrity test suite (24 tests)
npx tsx --test tests/rbac_scope_integrity.test.ts

# Run canonical anomaly detection test suite (7 tests)
npx tsx --test tests/anomalies.test.ts

# Run production-readiness runtime browser audit (19 tests)
npx tsx --test tests/production_readiness_audit.test.ts

# Run final security, session integrity & acceptance audit (49 tests)
npx tsx --test tests/final_security_and_session_audit.test.ts
```

---

## 7. Production Build & Deployment Procedure

### Production Build
```bash
# Compiles backend TypeScript (dist/) and builds frontend SPA (dist-frontend/)
npm run build
```

### Production Deployment Procedure:
1. **Provision Persistent Volume for SQLite**:
   > [!IMPORTANT]
   > SQLite stores data in a local file (default: `./data/municipal_waste.db`).
   > In containerized environments (Docker, Kubernetes, AWS ECS, Fly.io, Render), ensure the directory specified by `DATABASE_PATH` is mounted on a **persistent storage volume**. Ephemeral storage will result in database reset upon container restart.

2. **Configure Environment Variables**:
   Set production values in your host or container environment:
   ```bash
   NODE_ENV=production
   PORT=3000
   HOST=0.0.0.0
   DATABASE_PATH=/var/data/municipal_waste.db
   JWT_SECRET=<secure-random-string-min-32-chars>
   WEBHOOK_HMAC_SECRET=<secure-random-string-min-32-chars>
   CORS_ORIGIN=https://municipal-waste.gov.in
   HSTS_ENABLED=true
   LOG_LEVEL=info
   ```

3. **Run Schema Migrations & Baseline Seeder**:
   ```bash
   npm run migrate
   # Optionally seed baseline operational fixtures:
   npm run seed
   ```

4. **Serve Frontend**:
   Deploy the compiled `dist-frontend/` directory using an Nginx, Caddy, or cloud CDN reverse proxy, directing all `/api/*` requests to the Fastify backend:
   ```nginx
   server {
       listen 443 ssl http2;
       server_name municipal-waste.gov.in;

       root /var/www/dist-frontend;
       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }

       location /api/ {
           proxy_pass http://127.0.0.1:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       location /healthz {
           proxy_pass http://127.0.0.1:3000/healthz;
       }

       location /readyz {
           proxy_pass http://127.0.0.1:3000/readyz;
       }
   }
   ```

5. **Start Backend Service**:
   ```bash
   node dist/index.js
   ```

### Render Cloud Deployment:
The repository includes a ready-to-use Render Blueprint (`render.yaml`) configuring two decoupled services:
- **Backend API**: Render Web Service (`Starter` plan with 1 GB persistent disk mounted at `/var/data`, `DATABASE_PATH=/var/data/municipal_waste.db`, health check `/healthz`).
- **Frontend SPA**: Render Static Site (`dist-frontend/`, rewrite rule `/*` -> `/index.html`).

#### Secure Production Deployment Sequence:
1. Provision both the backend Web Service and frontend Static Site in Render.
2. Obtain the assigned frontend Static Site HTTPS URL (e.g. `https://municipal-waste-frontend.onrender.com`).
3. Set the backend `CORS_ORIGIN` environment variable to the exact HTTPS frontend origin.
   - *Security Rule*: Never use `CORS_ORIGIN=*` in production, even temporarily.
   - *Security Rule*: Never leave production `CORS_ORIGIN` blank.
4. Obtain the assigned backend Web Service HTTPS URL (e.g. `https://municipal-waste-backend.onrender.com`).
5. Set `VITE_API_BASE_URL` in the frontend Static Site environment to the backend URL followed by `/api/v1` (e.g. `https://municipal-waste-backend.onrender.com/api/v1`).
6. Trigger a frontend manual redeploy (**Clear build cache & deploy**), ensuring Vite embeds the production API base URL at build time.

---

## 8. Health Check Probes & Observability

The backend provides zero-credential health probes:

- **Liveness Probe**: `GET /healthz`
  - Returns `200 OK` with JSON `{ "status": "ok", "timestamp": "..." }`.
  - Determines Node.js event loop responsiveness without database access.
- **Readiness Probe**: `GET /readyz`
  - Returns `200 OK` if the SQLite/PostgreSQL connection responds to `SELECT 1;`.
  - Returns `503 Service Unavailable` if the database is unreachable.
- **Root Metadata**: `GET /`
  - Returns service status, version, and explicit `SIMULATED_DEMO_DATA` disclaimer.

---

## 9. Security & Hardening Checklist

- [x] Zero hardcoded production secrets (strictly rejected by `src/config/index.ts` in production mode).
- [x] Fail-closed ward isolation on all Supervisory and Ward Officer endpoints.
- [x] Citizen Anti-IDOR authorization on household status and financial obligation endpoints.
- [x] Cryptographic HMAC-SHA256 signature verification on payment provider webhooks.
- [x] Strict prepared-statement SQL parameterization neutralizing SQL injection.
- [x] XSS-safe DOM rendering with HTML entity escaping.
- [x] Rate limiting (`@fastify/rate-limit`) on public authentication and webhook routes.
- [x] Append-only audit logging (`audit_events`) recording actor, target, timestamp, and before/after states.

---

## 10. License & Disclaimers

All demonstration data fixtures carry explicit `SIMULATED_DEMO_DATA` provenance tags for evaluation and testing purposes.
