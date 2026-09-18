-- ====================================================================
-- Municipal Solid Waste Collection Monitoring, Verification & Audit
-- Normalized Relational Schema (Post-Review v2.2.0 Compliant)
-- Database Target: SQLite (Dev/Test/Demo) / PostgreSQL 16+ Portable
-- ====================================================================

-- 1. Provenance Registry
CREATE TABLE IF NOT EXISTS data_sources (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN (
        'MUNICIPAL_HRMS', 'PAYMENT_GATEWAY', 'TELEMETRY_FEED', 
        'CITIZEN_PORTAL', 'MANUAL_SUPERVISOR_ENTRY', 'SYNTHETIC_SEEDER', 'DERIVATION_ENGINE'
    )),
    classification TEXT NOT NULL CHECK (classification IN (
        'REAL_DATA', 'SIMULATED_DEMO_DATA', 'FUTURE_INTEGRATION_DATA', 'DERIVED_DATA'
    )),
    provider_name TEXT NOT NULL,
    external_reference_id TEXT,
    ingested_at TEXT NOT NULL,
    ingested_by TEXT,
    integrity_checksum TEXT,
    metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_data_sources_class ON data_sources(classification);

-- 2. Authentication & Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN (
        'AUTHORITY', 'SUPERVISOR', 'WARD_OFFICER', 'DRIVER', 'WORKER', 'CITIZEN', 'ADMIN'
    )),
    ward_id TEXT,
    household_id TEXT,
    worker_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 3. Master Data (Wards, Areas, Routes, Households)
CREATE TABLE IF NOT EXISTS wards (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS areas (
    id TEXT PRIMARY KEY,
    ward_id TEXT NOT NULL REFERENCES wards(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    corridor_geojson TEXT,
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
    service_uid TEXT NOT NULL UNIQUE,
    resident_name TEXT NOT NULL,
    phone_masked TEXT NOT NULL,
    address_line TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    nfc_tag_uid TEXT UNIQUE,
    qr_code_uid TEXT UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_households_route ON households(route_id);
CREATE INDEX IF NOT EXISTS idx_households_service_uid ON households(service_uid);

-- 4. Fleet & Workers
CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    registration_number TEXT NOT NULL UNIQUE,
    vehicle_type TEXT NOT NULL,
    capacity_metric_tons REAL,
    operational_status TEXT NOT NULL CHECK (operational_status IN ('ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED')),
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    employee_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('DRIVER', 'SANITARY_WORKER', 'SUPERVISOR')),
    contact_number_masked TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 5. Temporal Master Assignments (Historical Versioning)
CREATE TABLE IF NOT EXISTS master_assignments (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    driver_id TEXT NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    supervisor_id TEXT NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    valid_from TEXT NOT NULL, -- ISO-8601 Date
    valid_to TEXT,           -- NULL indicates current active assignment
    is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL,
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX IF NOT EXISTS idx_master_assign_current ON master_assignments(is_current, route_id);

-- 6. Daily Operational Journal
CREATE TABLE IF NOT EXISTS daily_assignments (
    id TEXT PRIMARY KEY,
    service_date TEXT NOT NULL, -- YYYY-MM-DD
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    driver_id TEXT NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    supervisor_id TEXT NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    scheduled_start TEXT NOT NULL, -- ISO-8601 UTC
    status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    notes TEXT,
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    CONSTRAINT uk_daily_assignment UNIQUE(service_date, route_id, vehicle_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_assign_date ON daily_assignments(service_date);

CREATE TABLE IF NOT EXISTS assignment_workers (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL REFERENCES daily_assignments(id) ON DELETE CASCADE,
    worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    attendance_status TEXT NOT NULL DEFAULT 'PRESENT' CHECK (attendance_status IN ('PRESENT', 'ABSENT', 'REPLACED')),
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    CONSTRAINT uk_assignment_worker UNIQUE(assignment_id, worker_id)
);

CREATE TABLE IF NOT EXISTS daily_service_runs (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL UNIQUE REFERENCES daily_assignments(id) ON DELETE RESTRICT,
    actual_start_time TEXT,
    actual_end_time TEXT,
    run_status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (run_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'INCOMPLETE', 'ABORTED')),
    completion_percentage REAL NOT NULL DEFAULT 0.00,
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 7. Service Evidence & Collection Records (Decoupled Evidence Model)
CREATE TABLE IF NOT EXISTS service_evidence (
    id TEXT PRIMARY KEY,
    service_run_id TEXT NOT NULL REFERENCES daily_service_runs(id) ON DELETE RESTRICT,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
    evidence_type TEXT NOT NULL CHECK (evidence_type IN (
        'DOORSTEP_NFC_TAP', 'DOORSTEP_QR_SCAN', 'TIMESTAMPED_PHOTO', 
        'VEHICLE_PROXIMITY_CORRIDOR', 'SUPERVISOR_PHYSICAL_INSPECTION', 'CITIZEN_AFFIRMATION'
    )),
    captured_at TEXT NOT NULL,
    device_id TEXT,
    actor_id TEXT,
    raw_payload TEXT,
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_run ON service_evidence(service_run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_household ON service_evidence(household_id);

CREATE TABLE IF NOT EXISTS collection_records (
    id TEXT PRIMARY KEY,
    service_run_id TEXT NOT NULL REFERENCES daily_service_runs(id) ON DELETE RESTRICT,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
    verification_status TEXT NOT NULL CHECK (verification_status IN (
        'EXPECTED', 'OBSERVED', 'EVIDENCE_AVAILABLE', 'VERIFIED', 'NOT_VERIFIED', 'EXCEPTION', 'DISPUTED'
    )),
    exception_reason TEXT,
    verified_at TEXT,
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT uk_run_household UNIQUE(service_run_id, household_id)
);
CREATE INDEX IF NOT EXISTS idx_coll_records_run ON collection_records(service_run_id);
CREATE INDEX IF NOT EXISTS idx_coll_records_status ON collection_records(verification_status);

-- 8. Complaints & Citizen Grievances
CREATE TABLE IF NOT EXISTS complaints (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
    service_date TEXT NOT NULL,
    complaint_type TEXT NOT NULL DEFAULT 'MISSED_COLLECTION',
    resident_remarks TEXT,
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'INVESTIGATING', 'RESOLVED', 'REJECTED')),
    filed_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT REFERENCES workers(id),
    resolution_notes TEXT,
    source_id TEXT NOT NULL REFERENCES data_sources(id)
);
CREATE INDEX IF NOT EXISTS idx_complaints_house ON complaints(household_id);
CREATE INDEX IF NOT EXISTS idx_complaints_date ON complaints(service_date);

-- 9. Configurable Payment Ledger (Paise/Integer Arithmetic)
CREATE TABLE IF NOT EXISTS payment_obligations (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
    obligation_type TEXT NOT NULL CHECK (obligation_type IN (
        'MONTHLY_CONTRIBUTION', 'PER_COLLECTION', 'PERIODIC_SERVICE_FEE', 'AREA_CONTRIBUTION', 'OTHER_AUTHORIZED_CHARGE'
    )),
    amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
    billing_period TEXT NOT NULL, -- e.g., '2026-09'
    beneficiary_model TEXT NOT NULL CHECK (beneficiary_model IN (
        'MUNICIPAL_TREASURY_ACCOUNT', 'DESIGNATED_WORKER_ACCOUNT', 'AUTHORIZED_SERVICE_CONTRACTOR', 'OTHER_APPROVED_BENEFICIARY'
    )),
    is_active INTEGER NOT NULL DEFAULT 1,
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_obligations_house ON payment_obligations(household_id);

CREATE TABLE IF NOT EXISTS resident_payments (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
    obligation_id TEXT NOT NULL REFERENCES payment_obligations(id) ON DELETE RESTRICT,
    amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI', 'NET_BANKING', 'CARD', 'AUTHORIZED_COUNTER')),
    provider_name TEXT NOT NULL,
    provider_transaction_ref TEXT UNIQUE,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN (
        'INITIATED', 'PENDING_PROVIDER', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'REFUNDED', 'DISPUTED', 'RECONCILIATION_MATCHED', 'RECONCILIATION_MISMATCH'
    )),
    initiated_at TEXT NOT NULL,
    confirmed_at TEXT,
    beneficiary_type TEXT NOT NULL CHECK (beneficiary_type IN (
        'MUNICIPAL_TREASURY_ACCOUNT', 'DESIGNATED_WORKER_ACCOUNT', 'AUTHORIZED_SERVICE_CONTRACTOR', 'OTHER_APPROVED_BENEFICIARY'
    )),
    source_id TEXT NOT NULL REFERENCES data_sources(id)
);
CREATE INDEX IF NOT EXISTS idx_payments_household ON resident_payments(household_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON resident_payments(status);

CREATE TABLE IF NOT EXISTS payment_reconciliations (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL REFERENCES resident_payments(id) ON DELETE RESTRICT,
    bank_statement_ref TEXT,
    statement_amount_paise INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('MATCHED', 'UNMATCHED_AMOUNT', 'UNVERIFIED_BANK', 'MANUAL_DISCREPANCY')),
    reconciled_at TEXT NOT NULL,
    reconciled_by TEXT NOT NULL,
    notes TEXT,
    source_id TEXT NOT NULL REFERENCES data_sources(id)
);

-- 10. Append-Only Audit Trail
CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action_type TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_state TEXT, -- JSON serialized snapshot
    after_state TEXT,  -- JSON serialized snapshot
    ip_address TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_name, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);

-- 11. Deterministic Operational Anomalies
CREATE TABLE IF NOT EXISTS operational_anomalies (
    id TEXT PRIMARY KEY,
    service_run_id TEXT REFERENCES daily_service_runs(id),
    anomaly_id TEXT NOT NULL CHECK (anomaly_id IN (
        'ANOM-01', 'ANOM-02', 'ANOM-03', 'ANOM-04', 'ANOM-05', 'ANOM-06', 'ANOM-07'
    )),
    severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    description TEXT NOT NULL,
    trigger_evidence TEXT NOT NULL, -- JSON formatted explanation and records
    status TEXT NOT NULL DEFAULT 'UNRESOLVED' CHECK (status IN ('UNRESOLVED', 'REVIEWED_VALID', 'INVESTIGATION_FLAGGED', 'RESOLVED')),
    detected_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT,
    source_id TEXT NOT NULL REFERENCES data_sources(id)
);
CREATE INDEX IF NOT EXISTS idx_anomalies_run ON operational_anomalies(service_run_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON operational_anomalies(status);

-- 12. Telemetry Ingestion Ledger (Vendor-Agnostic Adapter Buffer)
CREATE TABLE IF NOT EXISTS telemetry_events (
    id TEXT PRIMARY KEY,
    vehicle_registration TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    speed_kmh REAL NOT NULL,
    engine_status TEXT NOT NULL CHECK (engine_status IN ('ON', 'OFF')),
    raw_hash TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES data_sources(id),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_veh_time ON telemetry_events(vehicle_registration, timestamp);
