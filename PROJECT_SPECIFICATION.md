# Municipal Solid Waste Collection Monitoring, Verification & Audit System
## Definitive Architectural Specification & Engineering System Design (v2.3.0 - Phase 1 Verified & Frontend Civic Design Baseline)

---

### Executive Document Metadata
- **Classification:** Public Sector Digital Infrastructure / Municipal Enterprise Systems
- **Domain:** Municipal Solid Waste Management (SWM), Urban Local Bodies (ULBs)
- **Nature of System:** Independent Operational Verification, Multi-Party Audit & Revenue Reconciliation Engine
- **Deployment Topology:** Modular Subsystem / Standalone Engine with Reverse-Proxy Integration into Municipal Portals
- **Target Compliance:** Public Audit Traceability, Zero Unsubstantiated Claims, Zero Data Fabrication

---

## 1. Requirement Classification: Confirmed vs. Requiring Authority Validation

To maintain rigorous separation between verified problem requirements and unconfirmed operational assumptions, the system formally categorizes all functional and business requirements into two explicit registries:

### 1.1 Confirmed Requirements from the Problem Statement
The following requirements are non-negotiable, verified constraints derived directly from the problem statement:
1. **Vehicle-to-Route Mapping:** Authority must independently audit which vehicle is assigned to which ward, area, and route.
2. **Worker-to-Vehicle/Route Assignment:** Authority must audit which municipal or contracted workers are assigned to each vehicle and route.
3. **Operational Vehicle Verification:** Authority must independently determine whether assigned vehicles actually operated on a given service day.
4. **Route Coverage Auditing:** Authority must independently verify whether the designated geographic area or route was actually covered.
5. **Worker Attendance & Participation:** Authority must determine whether assigned sanitary workers were present and participated.
6. **Household Service Identification:** System must track which specific households/locations were supposed to receive service, which actually received service, and which reported missed collection.
7. **Resident Payment Visibility:** Authority must track resident fee payments: who paid, how much, when, payment method, transaction reference, and payment status.
8. **Operational-Financial Reconciliation:** Three-way reconciliation between assigned service, completed service, and recorded resident payments.
9. **Operational Discrepancy & Anomaly Detection:** Automated, deterministic identification of anomalies requiring supervisory/authority attention.
10. **Historical Auditability:** Preservation of historical assignments and operational journals for legal and municipal audit reporting.
11. **Worker Information Isolation:** Drivers and sanitary workers must **never** have access to authority monitoring, executive analytics, audit logs, anomaly detection, or internal verification intelligence.
12. **Compliant Settlement Guardrail:** Any eventual payment routing to a worker's account must only be executed through an approved, compliant payment/banking integration. The system must never invent or simulate unauthorized direct fund transfers.
13. **Data Integrity Standard:** Non-negotiable rule that the system must never present unavailable, simulated, or fabricated data as real.

---

### 1.2 Business Rules Requiring Authority Validation

The following items are operational variables that **must not be invented or assumed**. They are architected as configurable domain parameters marked `BUSINESS_RULE_PENDING_VALIDATION`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              BUSINESS RULES REQUIRING AUTHORITY VALIDATION                  │
├──────────────────────────────┬──────────────────────────────┬───────────────┤
│ Business Parameter           │ Candidate Models / Options   │ Current State │
├──────────────────────────────┼──────────────────────────────┼───────────────┤
│ 1. Payment Obligation Model  │ • Monthly household charge   │ Configurable  │
│                              │ • Per-collection event fee   │ Domain Model; │
│                              │ • Periodic area contribution │ Demo uses     │
│                              │ • Volumetric / waste weight  │ labeled demo  │
│                              │ • Other municipal tariff     │ contribution  │
├──────────────────────────────┼──────────────────────────────┼───────────────┤
│ 2. Payment Beneficiary Model │ • Municipal Treasury Account │ Configurable  │
│                              │ • Designated Field Worker    │ Beneficiary   │
│                              │ • Sanitation Contractor      │ Routing       │
│                              │ • Joint Escrow / Trust       │ Architecture  │
├──────────────────────────────┼──────────────────────────────┼───────────────┤
│ 3. Worker Employment Status  │ • Permanent Municipal Staff  │ Abstract      │
│                              │ • Contracted Agency Workers  │ Worker Model  │
│                              │ • Informal Waste Collectors  │ with Type     │
│                              │ • Self-Help Group (SHG)      │ Parameter     │
├──────────────────────────────┼──────────────────────────────┼───────────────┤
│ 4. Citizen Identity Standard │ • Property Tax UID           │ Configurable  │
│                              │ • Municipal Assessment No.   │ Service UID   │
│                              │ • Electricity Consumer No.   │ Architecture  │
│                              │ • Mobile Number OTP Binding  │               │
├──────────────────────────────┼──────────────────────────────┼───────────────┤
│ 5. Collection Mandatory Rule │ • Mandatory for all premises │ Configurable  │
│                              │ • Opt-in / Commercial Only   │ Policy Flag   │
├──────────────────────────────┼──────────────────────────────┼───────────────┤
│ 6. In-Field Telemetry Device │ • Fixed AIS-140 Vehicle GPS  │ Abstract      │
│                              │ • Mobile App GPS Ping        │ Telemetry     │
│                              │ • Bluetooth/RFID Beacon      │ Ingestion     │
│                              │ • None (Manual Landmark Log) │ Boundary      │
└──────────────────────────────┴──────────────────────────────┴───────────────┘
```

---

## 2. Workspace Assessment & Technology Selection

### 2.1 Workspace Audit
- **Path:** `c:\Users\sruja\OneDrive\Desktop\Garbage`
- **Current State:** Clean / empty directory (0 files, fresh environment).
- **Available Tooling:** Node.js `v24.18.0`, NPM `11.16.0`, Python `3.14.6`, Git `2.55.0.windows.2`. No container daemon or database CLI installed in PATH.

### 2.2 Persistence Decoupling: Development vs. Production
- **Local Dev / Testing / Demo:** SQLite in WAL (Write-Ahead Logging) mode with `foreign_keys = ON` via `better-sqlite3` or Prisma. Provides zero-dependency, atomic, embedded ACID persistence.
- **Production Infrastructure:** Enterprise PostgreSQL (v16+) with PostGIS extensions.
- **Decoupling Guarantee:** Domain logic communicates through an abstract repository layer using standard ANSI SQL, ISO-8601 UTC timestamps, and fixed-precision decimals (or integer cents/paise).

---

## 3. Data Classification & Provenance Architecture

### 3.1 Four Fundamental Classifications
Every piece of information is strictly classified:
- `REAL_DATA`: Authenticated data directly from live connected devices, official municipal APIs, or authenticated users.
- `SIMULATED_DEMO_DATA`: Synthetic data generated deterministically for testing, clearly tagged across all APIs and UI views.
- `FUTURE_INTEGRATION_DATA`: Schema placeholders for systems not yet connected (e.g., live municipal HRMS, state treasury).
- `DERIVED_DATA`: Calculated indicators, aggregated metrics, or synthesized statuses computed deterministically from underlying records.

### 3.2 Provenance Ledger ("Where did this value come from?")
Every operationally significant entity references a centralized `data_sources` table:

```sql
CREATE TABLE data_sources (
    id VARCHAR(36) PRIMARY KEY,
    source_type VARCHAR(64) NOT NULL,
    -- 'MUNICIPAL_HRMS', 'PAYMENT_GATEWAY', 'TELEMETRY_FEED', 'CITIZEN_PORTAL', 'MANUAL_SUPERVISOR_ENTRY', 'SYNTHETIC_SEEDER', 'DERIVATION_ENGINE'
    classification VARCHAR(32) NOT NULL, 
    -- 'REAL_DATA', 'SIMULATED_DEMO_DATA', 'FUTURE_INTEGRATION_DATA', 'DERIVED_DATA'
    provider_name VARCHAR(128) NOT NULL,
    external_reference_id VARCHAR(128),
    ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ingested_by VARCHAR(36),
    integrity_checksum VARCHAR(64),
    metadata_json TEXT
);
```

---

## 4. Configurable Payment & Beneficiary Architecture

### 4.1 Deconstruction of Payment Concerns
To avoid making premature assumptions about whether payments belong to the municipality or to field workers, the system separates payment into seven decoupled concerns:

```
┌─────────────────────────┐
│ 1. PAYMENT PAYER        │ ── Registered Household / Resident Service UID
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 2. PAYMENT OBLIGATION   │ ── Configurable: MONTHLY_CONTRIBUTION, PER_COLLECTION,
└───────────┬─────────────┘    PERIODIC_SERVICE_FEE, or OTHER_AUTHORIZED_CHARGE
            │
            ▼
┌─────────────────────────┐
│ 3. PAYMENT PROVIDER     │ ── Certified Payment Aggregator (UPI, Gateway, Treasury)
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 4. RECIPIENT /          │ ── Configurable Beneficiary:
│    BENEFICIARY          │    • MUNICIPAL_TREASURY_ACCOUNT
└───────────┬─────────────┘    • DESIGNATED_WORKER_ACCOUNT
            │                  • AUTHORIZED_SERVICE_CONTRACTOR
            ▼                  • OTHER_APPROVED_BENEFICIARY
┌─────────────────────────┐
│ 5. PAYMENT LEDGER       │ ── Immutable Double-Entry Municipal Accounting Ledger
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 6. RECONCILIATION       │ ── Automated matching of Bank Settlement vs Gateway Ref
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 7. SETTLEMENT           │ ── Compliant banking transfer executed EXCLUSIVELY via
└─────────────────────────┘    an approved banking gateway; NEVER internally by this app
```

### 4.2 Authoritative Payment Status Model
A resident clicking "Pay" generates only an `INITIATED` record. The authoritative status source is the payment provider's cryptographic webhook callback:
- `INITIATED`: Payment request created; awaiting gateway session.
- `PENDING_PROVIDER`: Resident redirected to payment provider; awaiting callback.
- `SUCCESSFUL`: Authoritative HMAC-SHA256 verified webhook received from gateway.
- `FAILED`: Payment provider reported failure (declined, timeout, error).
- `CANCELLED`: Payment intent expired or cancelled by user.
- `REFUNDED`: Formally refunded by authorized finance administrator.
- `DISPUTED`: Contested by resident through banking institution.
- `RECONCILIATION_MATCHED`: Settlement credit verified against bank statement scroll.
- `RECONCILIATION_MISMATCH`: Gateway transaction has no deposit match, or deposit amount differs.

---

## 5. Service Verification & Evidence Model

### 5.1 The Epistemological Boundary & Policy Rule
> **The system must NEVER state "Garbage was collected" without sufficient defined evidence.**
- Vehicle presence $\neq$ garbage collection completed.
- GPS stationary dwell time $\neq$ proof of physical collection.
- QR/NFC scan alone $\neq$ incontrovertible proof that waste was physically loaded (it proves physical tag interaction by a device at a specific time).

When available technology cannot conclusively prove physical collection, the system **explicitly declares in the audit record and UI**:
> *"Collection cannot be independently proven with the currently available data."*

### 5.2 Verification States
For every scheduled household on a service date, the system evaluates one of seven strict states:
1. `EXPECTED`: Household was scheduled for collection on the assigned route for date $D$.
2. `OBSERVED`: Digital activity logged in vicinity (vehicle entered corridor, dwell time logged), but doorstep physical interaction not verified.
   *System Disclosure:* *"Collection cannot be independently proven with the currently available data."*
3. `EVIDENCE_AVAILABLE`: One or more corroborating evidence records exist (doorstep NFC tap, timestamped scan).
4. `VERIFIED`: Evidence satisfies the defined **Municipal Verification Policy** (valid doorstep scan by assigned crew within active shift window, zero resident dispute).
5. `NOT_VERIFIED`: Run concluded without observed activity or evidence.
6. `EXCEPTION`: Legitimate barrier documented by crew and verified by supervisor (e.g., road closed, locked gate).
7. `DISPUTED`: Crew claimed collection or activity observed, but resident lodged an unrefuted missed-collection grievance within the SLA window.

---

## 6. Worker Privacy & Role-Based Access Control

### 6.1 Framing: Independent Operational Verification, Not Employee Surveillance
- Telemetry strictly monitors municipal equipment during active operational shifts.
- Field workers receive only the operational information necessary to perform their duties.
- Complete logical separation: Workers have **zero access** to authority monitoring, executive analytics, audit logs, anomaly detection, or citizen payment ledgers.

### 6.2 Strict Access Boundaries

| Role | Operational Roster & Route | Submit Service Event / Scan | Authority Dashboards & KPIs | Anomaly Intelligence | Audit Trail | Citizen Payment Records |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Driver / Worker** | **ALLOW** | **ALLOW** | **DENY (403)** | **DENY (403)** | **DENY (403)** | **DENY (403)** |
| **Supervisor** | **ALLOW** | **ALLOW** | Operational Only | Operational Only | **DENY (403)** | **DENY (403)** |
| **Ward Officer** | **ALLOW** | **ALLOW** | Ward Scope | Ward Scope | **DENY (403)** | **DENY (403)** |
| **Municipal Authority** | **ALLOW** | Read Only | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** |
| **Resident** | Own Area Landmark | N/A | **DENY (403)** | **DENY (403)** | **DENY (403)** | Own Bills Only |

---

## 7. Abstract Telemetry Ingestion Boundary

Decoupled from any proprietary hardware or vendor:
$$\text{Vehicle / Telemetry Provider} \longrightarrow \text{Telemetry Ingestion Adapter} \longrightarrow \text{Validated Telemetry Events} \longrightarrow \text{Operational Verification Engine}$$
If no external telemetry provider is connected, the system reports `TELEMETRY_UNAVAILABLE`. It never synthesizes fake real-time GPS coordinates.

---

## 8. Historical Data, Temporal Assignments & Audit Immutability

1. **Temporal Master Assignments:** Vehicle and worker assignments use `valid_from` and `valid_to` date ranges with an `is_current` boolean flag.
2. **Immutable Daily Snapshots:** Daily service runs bind vehicle, crew, and route for date $D$ as an immutable record. Reassignments create new supersede records rather than overwriting past history.
3. **Append-Only Auditing:** Every administrative action inserts an `audit_events` row with actor ID, role, action type, IP address, and before/after JSON snapshots.

---

## 9. Mathematical Metric Formulations (All Derived Data)

All metrics are deterministically computed and classified strictly as `DERIVED_DATA`.

### 9.1 Metric 1: Route Service Completion Rate ($RC$)
- **Formula:** $RC = \left( \frac{H_{\text{verified}} + H_{\text{exception}}}{H_{\text{scheduled}}} \right) \times 100\%$ (where $H_{\text{scheduled}} > 0$; $0.00\%$ if $H_{\text{scheduled}} = 0$).
- **Numerator:** Count of scheduled route households in `VERIFIED` state (physical doorstep scan confirmed) plus approved `EXCEPTION` records.
- **Denominator:** Total active scheduled households along the designated route ($H_{\text{scheduled}}$).
- **Data Sources:** `collection_records`, `daily_service_runs`, `households`.
- **What It Proves:** The proportion of scheduled dwellings on the route that received verified physical doorstep service or had an authorized exception documented.
- **What It Does NOT Prove:** It does NOT measure vehicle GPS distance traveled, wheel rotation, spatial path traversal, waste tonnage collected, or segregation quality.

### 9.2 Metric 2: Service Discrepancy Rate ($SDR$)
- **Formula:** $SDR = \left( \frac{H_{\text{disputed}} + H_{\text{not\_verified\_with\_complaint}}}{H_{\text{scheduled}}} \right) \times 100\%$.
- **Numerator:** Count of distinct dwellings on the route with `DISPUTED` verification status or unserviced `NOT_VERIFIED` status with a formal resident complaint filed for that service date.
- **Denominator:** Total active scheduled households along the route ($H_{\text{scheduled}}$).
- **Data Sources:** `collection_records`, `complaints`, `daily_assignments`.
- **What It Proves:** The rate of formal citizen-reported service failures and contested collections against the scheduled route baseline.
- **What It Does NOT Prove:** Does not capture unreported missed collections or informal verbal feedback outside the digital complaint register.

### 9.3 Metric 3: Fleet Operational Availability ($FOA$)
- **Formula:** $FOA = \left( \frac{V_{\text{active}}}{V_{\text{operable}}} \right) \times 100\%$.
- **Numerator:** Number of distinct operable vehicles assigned and deployed on an active service run (`IN_PROGRESS`, `COMPLETED`, or `INCOMPLETE`) on date $D$.
- **Denominator:** Total non-decommissioned fleet vehicles registered in `vehicles`.
- **Data Sources:** `vehicles`, `daily_assignments`, `daily_service_runs`.
- **What It Proves:** The percentage of the municipality's available fleet asset base actively deployed in field operations.
- **What It Does NOT Prove:** Does not measure fuel economy, engine telemetry wear, or mid-route mechanical health.

### 9.4 Metric 4: Collection Reconciliation Ratio ($CRR$)
- **Formula:** $CRR = \left( \frac{\sum \text{Amount}(P_{\text{reconciled\_matched}})}{\sum \text{Amount}(B_{\text{levied}})} \right) \times 100\%$ (calculated in exact integer paise).
- **Numerator:** Sum of resident payment amounts (in paise) verified in `RECONCILIATION_MATCHED` status against bank statement deposits.
- **Denominator:** Sum of all active billing obligations (in paise) levied for the billing period in `payment_obligations`.
- **Data Sources:** `resident_payments`, `payment_reconciliations`, `payment_obligations`.
- **What It Proves:** The exact percentage of levied municipal solid waste obligations that have been received and independently corroborated against bank settlement scrolls.
- **What It Does NOT Prove:** Does not capture unrecorded informal cash collections or off-book transactions outside the authorized municipal ledger.

---

## 10. Deterministic Anomaly Detection Engine

Zero opaque AI; deterministic operational condition rules only:
- **ANOM-01 (Assigned Vehicle Inactivity):** Operational condition where run status remains `NOT_STARTED` $> 90\text{ mins}$ past scheduled start time without departure event.
- **ANOM-02 (Suspected Rapid-Scan Anomaly):** Operational condition where consecutive doorstep scans are logged with $\Delta t < 5\text{ seconds}$ between distinct dwellings; flagged for supervisory scan review without asserting intent.
- **ANOM-03 (Service Collection Dispute Condition):** Inconsistency condition where collection was marked `VERIFIED` by crew, but resident filed an unserviced complaint within the SLA window; flagged for dispute review.
- **ANOM-04 (Payment Provider Reference Collision):** Security condition where incoming gateway transaction ID already exists under another payment record; transaction blocked pending review.
- **ANOM-05 (Bank Settlement Discrepancy):** Financial reconciliation exception where bank statement deposit amount differs from gateway confirmed settlement amount ($\Delta \neq 0$).
- **ANOM-06 (Route Truncation Review Condition):** Operational condition where run is marked `COMPLETED`, but Route Service Completion Rate $RC < 60\%$; flagged for route review.
- **ANOM-07 (Vehicle Double-Booking Conflict):** Resource conflict condition where the same vehicle is assigned to multiple overlapping routes on the same date.

---

## 11. Final Phase 1 Scope & Boundary

### 11.1 Phase 1 Scope (Foundational Backend, Data & Security Layer)
1. **Repository & Tooling Setup:** TypeScript, Node.js `v24.x`, Fastify/Express backend, and abstracted SQLite (WAL mode) persistence.
2. **Relational Schema & Migrations:**
   - `data_sources` (centralized provenance tracking)
   - Master data (`wards`, `areas`, `routes`, `households`)
   - Temporal assignments (`vehicles`, `workers`, `master_assignments`)
   - Operations & Evidence (`daily_assignments`, `assignment_workers`, `daily_service_runs`, `collection_records`)
   - Citizen grievances (`complaints`)
   - Configurable Payment Ledger (`payment_obligations`, `resident_payments`, `payment_reconciliations`)
   - Audit & Anomalies (`audit_events`, `operational_anomalies`)
3. **Deterministic Seeding Engine:** Multi-scenario seed dataset linked to `SIMULATED_DEMO_DATA` provenance records.
4. **Core Metric & Anomaly Logic:** Unit-tested calculators for $RC, SDR, FOA, CRR$ and rules ANOM-01 to ANOM-07.
5. **Security & RBAC Foundation:** JWT authentication, role middleware, and permission verification suite.
6. **Automated Test Suite:** Comprehensive unit and integration tests for all models, math, and security boundaries.

### 11.2 Explicitly Excluded from Phase 1
- ❌ Fake live GPS feeds, animated maps, or pretend IoT trackers.
- ❌ Fake direct banking payouts or fabricated banking API connections.
- ❌ Full production UI before backend contracts and security layers are verified.
- ❌ AI/ML models or opaque predictive algorithms.
- ❌ Unsupported claims of real-world physical verification.

### 11.3 Phase 1 Acceptance Criteria (VERIFIED - 53/53 Tests Passing)
1. Automated test suite passes 100% of unit tests for mathematical metric calculations ($RC, SDR, FOA, CRR$) including zero-count boundary conditions.
2. 100% of seeded records trace back to a `data_sources` record with `classification = 'SIMULATED_DEMO_DATA'`.
3. RBAC middleware tests verify that field worker tokens receive HTTP 403 when attempting to access authority monitoring endpoints.
4. Payment lifecycle tests prove that a payment record cannot transition to `SUCCESSFUL` without an authoritative cryptographic signature.
5. Temporal assignment immutability verified: modifying an active assignment does not alter past historical records.
6. Deterministic anomaly rules ANOM-01 through ANOM-07 trigger reliably under test conditions.

---

## 12. Frontend Architecture & Visual Design System: Urban Civic / Smart Municipality

When frontend implementation is authorized (Phase 2), the client application must strictly follow this visual design specification. This is a **core product design requirement**, not a cosmetic preference.

### 12.1 Primary Design Direction
The application must visually communicate **Smart City + Urban Infrastructure + Municipal Operations + Public Service + Trust + Transparency + Accountability**.
It must look like a serious, modern digital system that a municipal commissioner or state urban development department would deploy.

**Explicitly Prohibited Visual Tropes:**
- ❌ Futuristic AI aesthetics, space/cosmic backgrounds, or star fields.
- ❌ Glowing neon accents, purple/blue AI gradients, or glowing edges.
- ❌ Dark glassmorphism as the primary design motif.
- ❌ Floating holographic cards or excessive animated particles.
- ❌ Robot or AI imagery, sci-fi command-center HUDs, or generic SaaS AI dashboard templates.

### 12.2 Primary Theme: Default Light
The **DEFAULT** theme must be **LIGHT**.
- **First Impression:** Clean, bright, civic, urban, data-oriented, highly accessible.
- **Surfaces:** Clean white/off-white (`#FFFFFF`, `#F8FAFC`), subtle neutral backgrounds (`#F1F5F9`), crisp borders (`#E2E8F0`), restrained shadows.
- **Layout:** High information density without visual clutter; professional data tables, clean charts, structured status indicators, and map-oriented information grouping.
- **Containers:** Structural cards used strictly where they improve information grouping, avoiding arbitrary rounded floating card aesthetics.

### 12.3 Theme Switching & Persistence
- **Supported Modes:** `LIGHT` (default), `DARK`, `SYSTEM`.
- **Implementation:** Visible, accessible switcher in the global application bar. Switching themes must dynamically swap semantic design tokens (CSS custom properties) across surfaces, typography contrast, borders, and charts.
- **Persistence:** User preference persisted in `localStorage` and respected across reloads.

### 12.4 Dark Theme: Urban Night Operations
- Dark mode must represent **Urban Night / Municipal Operations**, **not** a sci-fi/cosmic space theme.
- **Surfaces:** Deep municipal slate and dark charcoal (`#0F172A`, `#1E293B`), restrained neutral borders (`#334155`), professional contrast ratios complying with WCAG AAA/AA.
- **Strictly Avoided:** Star fields, cosmic nebulae, glowing neon lines, and luminous glowing borders.

### 12.5 Urban & Municipal Visual Language
Visual identity rooted in municipal geography and infrastructure:
- Geographic hierarchy: Ward Boundaries $\rightarrow$ Operational Areas $\rightarrow$ Collection Corridors / Routes $\rightarrow$ Dwellings.
- Physical infrastructure iconography: Compactor trucks, tippers, sanitation depots, municipal weighbridges, doorstep NFC checkpoints.
- Civic accountability cues: Service verification seals, audit trail timestamps, public grievance resolution badges.

### 12.6 Authority Dashboard: Municipal Operations Center
Structured strictly around **Today's Operations** rather than decorative vanity metrics. Every primary metric must directly answer an immediate operational question:
- **Fleet Operability:** `18 / 20 operational` (with direct drill-down into workshop/maintenance logs).
- **Route Verification:** `16 / 20 verified` (with drill-down into unserviced corridors).
- **Service Exceptions:** `27 missed collections reported` (with direct citizen grievance links).
- **Financial Reconciliation:** `₹XX,XXX reconciled against bank scrolls` (with mismatch alerts).
- **Operational Anomalies:** `5 requiring attention` (ordered by severity: High/Medium/Low).

### 12.7 Cartographic & Route Visualization Standards
- Geographic visualizations must render true municipal boundaries, routes, collection corridors, and exception clusters.
- Map layers must follow civic cartographic styling: subdued road networks, clear ward boundary lines, and high-contrast status markers.
- **Integrity Rule:** No fake live GPS animation. Replayed or simulated telemetry must be prominently and indelibly labeled: `SIMULATED DEMO DATA`.

### 12.8 Semantic Status System
Every operational status must combine **accessible contrast color + descriptive text label + distinct icon** (never color alone):
| Status Classification | Semantic Token | Icon | Example Operational Use |
| :--- | :--- | :--- | :--- |
| **VERIFIED / SUCCESS** | `status-success` | Check Circle | Doorstep physical NFC/QR scan corroborated |
| **OBSERVED / INFO** | `status-info` | Eye / Radio | Vehicle telemetry corridor detected; doorstep unproven |
| **ATTENTION / WARNING**| `status-warning` | Alert Triangle | Route delayed $> 90$ mins; pending reconciliation |
| **NOT VERIFIED / ERROR**| `status-danger` | X Octagon | Missed collection; unserviced scheduled dwelling |
| **DISPUTED / GRIEVANCE**| `status-disputed`| Flag / Shield Alert| Physical scan recorded but citizen logged complaint |
| **EXPECTED / NEUTRAL** | `status-neutral` | Clock / Circle | Route scheduled for execution; not yet dispatched |

### 12.9 Typography & Number Display
- Clean, modern, highly readable sans-serif font stack (`Inter`, system civic font stack).
- Monospace or tabular figures (`font-variant-numeric: tabular-nums`) for currency (integer paise/rupees), timestamps, vehicle registration numbers, and operational counts.
- Clear typographic hierarchy designed for fast scanning by field supervisors and audit officers.

### 12.10 Iconography System
- Standardized, consistent SVG icon set (Lucide / Tabler style).
- Domain icons: Municipal Truck, Route/Path, Ward Boundary, Worker Badge, Household Dwelling, Bank Scroll / Currency, Grievance Megaphone, Verification Check, Audit Shield, Warning Triangle.
- Decorative AI chips, sparkle icons, and robot avatars are strictly prohibited.

### 12.11 Three Portals, Unified Design System
All three role-based portals share the identical design tokens, component library, and visual language:
1. **Authority & Executive Portal:** Dense, analytical, multi-pane layout; comprehensive route drill-downs, financial reconciliation, anomaly alerts, and audit search.
2. **Field Worker & Driver Portal:** Simple, touch-friendly, high-contrast, task-oriented interface displaying solely the worker's own daily assignment, route sequence, and scan submission interface. Strictly zero access to executive KPIs or anomalies.
3. **Citizen Portal:** Clean, trustworthy, public-service interface enabling residents to inspect their own household collection history, file missed-collection complaints, and view/pay municipal dues.

### 12.12 Responsive Design
- Fully responsive across desktop, tablet, and mobile breakpoints.
- Authority views optimized for wide desktop operations center displays with responsive fallbacks for tablets.
- Field Worker and Citizen portals engineered with a mobile-first, touch-friendly posture for handheld and smartphone devices.

### 12.13 Demo Data Visibility & Integrity
Whenever simulated or demo records are rendered in any portal:
- A persistent, crisp banner or badge must state: `"Demo Environment - SIMULATED DATA"`.
- Simulated vehicle positions, test workers, and synthetic transactions must never be disguised as real municipal assets.

### 12.14 Accessibility (WCAG 2.1 AA Compliance)
- Adequate contrast ratios ($\ge 4.5:1$ for normal text, $\ge 3:1$ for large text and UI components).
- Visible keyboard focus indicators across all interactive elements (`focus-visible`).
- Semantic HTML (`<main>`, `<nav>`, `<section>`, `<article>`, `<table>`).
- Full ARIA labels for icon-only buttons and live regions (`aria-live="polite"`) for real-time status changes.

### 12.15 Animation Guidelines
- Animations must be purposeful, micro-interactions only ($\le 200\text{ms}$ ease-out).
- Subtle transitions for dropdowns, tabs, dialogs, and table row updates.
- Strictly no continuous looping animations, pulsing neon glows, or floating particle backgrounds.

### 12.16 Strict Backend Alignment
The UI must be an exact reflection of the verified backend API contracts:
`Fastify Endpoints` $\rightarrow$ `Domain Types` $\rightarrow$ `RBAC Middleware` $\rightarrow$ `Data Provenance Labels` $\rightarrow$ `UI State`.
Under no circumstances may frontend components hardcode synthetic dashboard totals or bypass backend authorization rules.

### 12.17 Design Acceptance Checklist (16 Criteria)
Before considering the frontend design complete:
1. [ ] Light theme is the default on fresh load.
2. [ ] Theme switching (Light/Dark/System) dynamically updates all tokens without page reload.
3. [ ] Theme preference persists across browser sessions (`localStorage`).
4. [ ] Dark theme renders as professional Urban Night, not sci-fi/cosmic.
5. [ ] No cosmic, space, neon, or floating particle elements exist.
6. [ ] No generic AI dashboard or chat-widget aesthetic exists.
7. [ ] Authority portal renders as a functional Municipal Operations Center.
8. [ ] Worker portal is simple, field-oriented, and mobile-friendly.
9. [ ] Citizen portal is simple, transparent, and trustworthy.
10. [ ] Simulated demo data is explicitly and visibly labeled.
11. [ ] All statuses use text + icon + accessible color (never color alone).
12. [ ] Responsive layouts operate smoothly across mobile, tablet, and desktop.
13. [ ] WCAG 2.1 AA accessibility standards (contrast, keyboard nav, focus rings) pass audit.
14. [ ] Maps follow urban cartographic styling with clear civic boundaries.
15. [ ] No fabricated live GPS feeds or fake bank integrations are displayed.
16. [ ] All components derive from a unified, reusable design token system.

