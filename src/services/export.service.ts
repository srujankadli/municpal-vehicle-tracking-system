import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';
import { AuditService } from './audit.service.js';
import { DataClassification, UserRole } from '../types/domain.js';

export type ExportFormat = 'ndjson' | 'csv';

export type ExportDataset =
  | 'audit-events'
  | 'operational-verification'
  | 'anomalies'
  | 'payments-reconciliation'
  | 'configuration-summary';

export interface ExportFilters {
  entity_name?: string;
  actor_id?: string;
  action_type?: string;
  start_date?: string;
  end_date?: string;
  service_run_id?: string;
  verification_status?: string;
  household_id?: string;
  anomaly_id?: string;
  severity?: string;
  status?: string;
  reconciliation_status?: string;
  billing_period?: string;
}

export interface ExportResult {
  dataset: ExportDataset;
  format: ExportFormat;
  contentType: string;
  fileName: string;
  content: string;
  recordCount: number;
  orderingRule: string;
  provenanceClassification: string;
  generatedAt: string;
}

export class ExportService {
  private db: DatabaseSync;
  private auditService: AuditService;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.auditService = new AuditService(this.db);
  }

  /**
   * Escape and quote a value for deterministic RFC 4180 CSV.
   */
  private escapeCsvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Deterministically serialize records into CSV.
   */
  private serializeToCsv(
    headers: string[],
    records: Record<string, unknown>[],
    metadata: Record<string, unknown>
  ): string {
    const metaLines = Object.entries(metadata).map(
      ([key, val]) => `# ${key}: ${typeof val === 'object' ? JSON.stringify(val) : val}`
    );
    const headerLine = headers.map((h) => this.escapeCsvCell(h)).join(',');
    const rows = records.map((rec) =>
      headers.map((h) => this.escapeCsvCell(rec[h])).join(',')
    );

    return [...metaLines, headerLine, ...rows].join('\n') + '\n';
  }

  /**
   * Deterministically serialize records into NDJSON.
   */
  private serializeToNdjson(
    records: Record<string, unknown>[],
    metadata: Record<string, unknown>
  ): string {
    const metaHeader = JSON.stringify({ _export_metadata: metadata });
    const rowLines = records.map((rec) => JSON.stringify(rec));
    return [metaHeader, ...rowLines].join('\n') + '\n';
  }

  /**
   * Format integer paise to human-readable Indian Rupee representation without floating point.
   */
  private formatPaiseToRupees(paise: number): string {
    const isNegative = paise < 0;
    const abs = Math.abs(paise);
    const rupees = Math.floor(abs / 100);
    const fraction = String(abs % 100).padStart(2, '0');
    return `${isNegative ? '-' : ''}₹${rupees}.${fraction}`;
  }

  /**
   * Export Audit Trail Events
   */
  public exportAuditEvents(
    filters: ExportFilters,
    format: ExportFormat,
    actorId: string,
    actorRole: UserRole | string,
    ipAddress: string
  ): ExportResult {
    let sql = `
      SELECT id, created_at, actor_id, actor_role, action_type,
             entity_name, entity_id, before_state, after_state, ip_address
      FROM audit_events
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (filters.entity_name) {
      sql += ` AND entity_name = ?`;
      params.push(filters.entity_name);
    }
    if (filters.actor_id) {
      sql += ` AND actor_id = ?`;
      params.push(filters.actor_id);
    }
    if (filters.action_type) {
      sql += ` AND action_type = ?`;
      params.push(filters.action_type);
    }
    if (filters.start_date) {
      sql += ` AND created_at >= ?`;
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      sql += ` AND created_at <= ?`;
      params.push(filters.end_date);
    }

    const orderingRule = 'created_at ASC, id ASC';
    sql += ` ORDER BY created_at ASC, id ASC`;

    const stmt = this.db.prepare(sql);
    const rawRows = stmt.all(...params) as Record<string, unknown>[];

    const records = rawRows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      actor_id: r.actor_id,
      actor_role: r.actor_role,
      action_type: r.action_type,
      entity_name: r.entity_name,
      entity_id: r.entity_id,
      before_state: r.before_state ? JSON.parse(r.before_state as string) : null,
      after_state: r.after_state ? JSON.parse(r.after_state as string) : null,
      ip_address: r.ip_address,
      provenance_classification: DataClassification.SIMULATED_DEMO_DATA
    }));

    const generatedAt = new Date().toISOString();
    const metadata = {
      export_type: 'audit-events',
      dataset: 'audit-events',
      format,
      generated_at: generatedAt,
      record_count: records.length,
      ordering_rule: orderingRule,
      provenance_classification: DataClassification.SIMULATED_DEMO_DATA,
      applied_filters: filters,
      disclaimer: 'INTERNAL AUDIT EXPORT ONLY. APPEND-ONLY RELATIONAL JOURNALING. NOT A CRYPTOGRAPHIC OR STATUTORY CERTIFICATION. EXPORTS ARE NON-DESTRUCTIVE COPIES.'
    };

    const headers = [
      'id',
      'created_at',
      'actor_id',
      'actor_role',
      'action_type',
      'entity_name',
      'entity_id',
      'before_state',
      'after_state',
      'ip_address',
      'provenance_classification'
    ];

    const content =
      format === 'csv'
        ? this.serializeToCsv(headers, records, metadata)
        : this.serializeToNdjson(records, metadata);

    // Audit the export action
    this.auditService.logEvent({
      actorId,
      actorRole,
      actionType: 'EXPORT',
      entityName: 'audit-events',
      entityId: format,
      afterState: { recordCount: records.length, format, filters },
      ipAddress
    });

    return {
      dataset: 'audit-events',
      format,
      contentType: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
      fileName: `municipal_audit_events_${generatedAt.substring(0, 10)}.${format}`,
      content,
      recordCount: records.length,
      orderingRule,
      provenanceClassification: DataClassification.SIMULATED_DEMO_DATA,
      generatedAt
    };
  }

  /**
   * Export Operational Service Verification Records
   */
  public exportOperationalVerification(
    filters: ExportFilters,
    format: ExportFormat,
    actorId: string,
    actorRole: UserRole | string,
    ipAddress: string
  ): ExportResult {
    let sql = `
      SELECT cr.id, cr.service_run_id, cr.household_id,
             h.service_uid as household_service_uid,
             h.resident_name as household_resident_name,
             r.code as route_code,
             w.code as ward_code,
             cr.verification_status,
             cr.exception_reason,
             cr.verified_at,
             cr.created_at,
             se.evidence_type,
             se.captured_at as evidence_captured_at,
             se.device_id as evidence_device_id,
             c.complaint_type,
             c.status as complaint_status,
             ds.classification as data_classification,
             ds.source_type as source_type
      FROM collection_records cr
      JOIN daily_service_runs dsr ON dsr.id = cr.service_run_id
      JOIN daily_assignments da ON da.id = dsr.assignment_id
      JOIN routes r ON r.id = da.route_id
      JOIN areas a ON a.id = r.area_id
      JOIN wards w ON w.id = a.ward_id
      JOIN households h ON h.id = cr.household_id
      LEFT JOIN service_evidence se ON se.service_run_id = cr.service_run_id AND se.household_id = cr.household_id
      LEFT JOIN complaints c ON c.household_id = cr.household_id AND c.service_date = da.service_date
      LEFT JOIN data_sources ds ON ds.id = cr.source_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (filters.service_run_id) {
      sql += ` AND cr.service_run_id = ?`;
      params.push(filters.service_run_id);
    }
    if (filters.verification_status) {
      sql += ` AND cr.verification_status = ?`;
      params.push(filters.verification_status);
    }
    if (filters.household_id) {
      sql += ` AND (cr.household_id = ? OR h.service_uid = ?)`;
      params.push(filters.household_id, filters.household_id);
    }

    const orderingRule = 'cr.created_at ASC, cr.id ASC';
    sql += ` ORDER BY cr.created_at ASC, cr.id ASC`;

    const stmt = this.db.prepare(sql);
    const records = stmt.all(...params) as Record<string, unknown>[];

    const generatedAt = new Date().toISOString();
    const metadata = {
      export_type: 'operational-verification',
      dataset: 'operational-verification',
      format,
      generated_at: generatedAt,
      record_count: records.length,
      ordering_rule: orderingRule,
      provenance_classification: DataClassification.SIMULATED_DEMO_DATA,
      applied_filters: filters,
      disclaimer: 'INTERNAL AUDIT EXPORT ONLY. PHYSICAL DOORSTEP VERIFICATION & SENSOR PROXIMITY LEDGER. NOT A STATUTORY COMPLIANCE CERTIFICATION. EXPORTS ARE NON-DESTRUCTIVE COPIES.'
    };

    const headers = [
      'id',
      'service_run_id',
      'household_id',
      'household_service_uid',
      'household_resident_name',
      'ward_code',
      'route_code',
      'verification_status',
      'exception_reason',
      'verified_at',
      'evidence_type',
      'evidence_captured_at',
      'evidence_device_id',
      'complaint_type',
      'complaint_status',
      'data_classification',
      'source_type',
      'created_at'
    ];

    const content =
      format === 'csv'
        ? this.serializeToCsv(headers, records, metadata)
        : this.serializeToNdjson(records, metadata);

    this.auditService.logEvent({
      actorId,
      actorRole,
      actionType: 'EXPORT',
      entityName: 'operational-verification',
      entityId: format,
      afterState: { recordCount: records.length, format, filters },
      ipAddress
    });

    return {
      dataset: 'operational-verification',
      format,
      contentType: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
      fileName: `municipal_verification_records_${generatedAt.substring(0, 10)}.${format}`,
      content,
      recordCount: records.length,
      orderingRule,
      provenanceClassification: DataClassification.SIMULATED_DEMO_DATA,
      generatedAt
    };
  }

  /**
   * Export Operational Anomalies
   */
  public exportAnomalies(
    filters: ExportFilters,
    format: ExportFormat,
    actorId: string,
    actorRole: UserRole | string,
    ipAddress: string
  ): ExportResult {
    let sql = `
      SELECT oa.id, oa.anomaly_id, oa.severity, oa.description, oa.status,
             oa.service_run_id, oa.detected_at, oa.resolved_at, oa.resolved_by,
             oa.trigger_evidence,
             ds.classification as data_classification,
             ds.source_type as source_type
      FROM operational_anomalies oa
      LEFT JOIN data_sources ds ON ds.id = oa.source_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (filters.anomaly_id) {
      sql += ` AND oa.anomaly_id = ?`;
      params.push(filters.anomaly_id);
    }
    if (filters.severity) {
      sql += ` AND oa.severity = ?`;
      params.push(filters.severity);
    }
    if (filters.status) {
      sql += ` AND oa.status = ?`;
      params.push(filters.status);
    }
    if (filters.service_run_id) {
      sql += ` AND oa.service_run_id = ?`;
      params.push(filters.service_run_id);
    }

    const orderingRule = 'oa.detected_at ASC, oa.id ASC';
    sql += ` ORDER BY oa.detected_at ASC, oa.id ASC`;

    const stmt = this.db.prepare(sql);
    const rawRows = stmt.all(...params) as Record<string, unknown>[];

    const records = rawRows.map((r) => ({
      id: r.id,
      anomaly_id: r.anomaly_id,
      severity: r.severity,
      description: r.description,
      status: r.status,
      service_run_id: r.service_run_id,
      detected_at: r.detected_at,
      resolved_at: r.resolved_at,
      resolved_by: r.resolved_by,
      trigger_evidence: r.trigger_evidence ? JSON.parse(r.trigger_evidence as string) : null,
      data_classification: r.data_classification || DataClassification.SIMULATED_DEMO_DATA,
      source_type: r.source_type || 'DERIVATION_ENGINE'
    }));

    const generatedAt = new Date().toISOString();
    const metadata = {
      export_type: 'anomalies',
      dataset: 'anomalies',
      format,
      generated_at: generatedAt,
      record_count: records.length,
      ordering_rule: orderingRule,
      provenance_classification: DataClassification.SIMULATED_DEMO_DATA,
      applied_filters: filters,
      disclaimer: 'INTERNAL AUDIT EXPORT ONLY. ALGORITHMIC ANOMALY SURVEILLANCE JOURNAL (ANOM-01 TO ANOM-07). EXPORTS ARE NON-DESTRUCTIVE COPIES.'
    };

    const headers = [
      'id',
      'anomaly_id',
      'severity',
      'description',
      'status',
      'service_run_id',
      'detected_at',
      'resolved_at',
      'resolved_by',
      'trigger_evidence',
      'data_classification',
      'source_type'
    ];

    const content =
      format === 'csv'
        ? this.serializeToCsv(headers, records, metadata)
        : this.serializeToNdjson(records, metadata);

    this.auditService.logEvent({
      actorId,
      actorRole,
      actionType: 'EXPORT',
      entityName: 'anomalies',
      entityId: format,
      afterState: { recordCount: records.length, format, filters },
      ipAddress
    });

    return {
      dataset: 'anomalies',
      format,
      contentType: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
      fileName: `municipal_anomalies_${generatedAt.substring(0, 10)}.${format}`,
      content,
      recordCount: records.length,
      orderingRule,
      provenanceClassification: DataClassification.SIMULATED_DEMO_DATA,
      generatedAt
    };
  }

  /**
   * Export Payments & Financial Reconciliation
   */
  public exportPaymentsReconciliation(
    filters: ExportFilters,
    format: ExportFormat,
    actorId: string,
    actorRole: UserRole | string,
    ipAddress: string
  ): ExportResult {
    let sql = `
      SELECT rp.id as payment_id,
             rp.household_id,
             h.service_uid as household_service_uid,
             rp.obligation_id,
             po.obligation_type,
             po.billing_period,
             rp.amount_paise,
             rp.currency,
             rp.payment_method,
             rp.provider_name,
             rp.provider_transaction_ref,
             rp.status as payment_status,
             rp.initiated_at,
             rp.confirmed_at,
             rp.beneficiary_type,
             rp.beneficiary_driver_id,
             w.full_name as beneficiary_driver_name,
             w.employee_code as beneficiary_driver_code,
             pr.id as reconciliation_id,
             pr.status as reconciliation_status,
             pr.bank_statement_ref,
             pr.statement_amount_paise,
             pr.reconciled_at,
             pr.reconciled_by,
             pr.notes as reconciliation_notes,
             ds.classification as data_classification,
             ds.source_type as source_type
      FROM resident_payments rp
      JOIN payment_obligations po ON po.id = rp.obligation_id
      JOIN households h ON h.id = rp.household_id
      LEFT JOIN workers w ON w.id = rp.beneficiary_driver_id
      LEFT JOIN payment_reconciliations pr ON pr.payment_id = rp.id
      LEFT JOIN data_sources ds ON ds.id = rp.source_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (filters.status) {
      sql += ` AND rp.status = ?`;
      params.push(filters.status);
    }
    if (filters.reconciliation_status) {
      sql += ` AND pr.status = ?`;
      params.push(filters.reconciliation_status);
    }
    if (filters.household_id) {
      sql += ` AND (rp.household_id = ? OR h.service_uid = ?)`;
      params.push(filters.household_id, filters.household_id);
    }
    if (filters.billing_period) {
      sql += ` AND po.billing_period = ?`;
      params.push(filters.billing_period);
    }

    const orderingRule = 'rp.initiated_at ASC, rp.id ASC';
    sql += ` ORDER BY rp.initiated_at ASC, rp.id ASC`;

    const stmt = this.db.prepare(sql);
    const rawRows = stmt.all(...params) as Record<string, unknown>[];

    const records = rawRows.map((r) => {
      const paise = Number(r.amount_paise);
      const stmtPaise = r.statement_amount_paise !== null && r.statement_amount_paise !== undefined
        ? Number(r.statement_amount_paise)
        : null;

      return {
        payment_id: r.payment_id,
        household_id: r.household_id,
        household_service_uid: r.household_service_uid,
        obligation_id: r.obligation_id,
        obligation_type: r.obligation_type,
        billing_period: r.billing_period,
        amount_paise: paise,
        amount_inr_formatted: this.formatPaiseToRupees(paise),
        currency: r.currency,
        payment_method: r.payment_method,
        provider_name: r.provider_name,
        provider_transaction_ref: r.provider_transaction_ref,
        payment_status: r.payment_status,
        initiated_at: r.initiated_at,
        confirmed_at: r.confirmed_at,
        beneficiary_type: r.beneficiary_type,
        reconciliation_id: r.reconciliation_id,
        reconciliation_status: r.reconciliation_status || 'NOT_RECONCILED',
        bank_statement_ref: r.bank_statement_ref,
        statement_amount_paise: stmtPaise,
        statement_amount_inr_formatted: stmtPaise !== null ? this.formatPaiseToRupees(stmtPaise) : null,
        reconciled_at: r.reconciled_at,
        reconciled_by: r.reconciled_by,
        reconciliation_notes: r.reconciliation_notes,
        data_classification: r.data_classification || DataClassification.SIMULATED_DEMO_DATA,
        source_type: r.source_type || 'PAYMENT_GATEWAY'
      };
    });

    const generatedAt = new Date().toISOString();
    const metadata = {
      export_type: 'payments-reconciliation',
      dataset: 'payments-reconciliation',
      format,
      generated_at: generatedAt,
      record_count: records.length,
      ordering_rule: orderingRule,
      provenance_classification: DataClassification.SIMULATED_DEMO_DATA,
      applied_filters: filters,
      disclaimer: 'INTERNAL AUDIT EXPORT ONLY. CANONICAL MONETARY VALUES PRESERVED IN INTEGER PAISE (NO FLOATING POINT ROUNDING). NOT A BANK/STATUTORY SETTLEMENT CERTIFICATE. EXPORTS ARE NON-DESTRUCTIVE COPIES.'
    };

    const headers = [
      'payment_id',
      'household_id',
      'household_service_uid',
      'obligation_id',
      'obligation_type',
      'billing_period',
      'amount_paise',
      'amount_inr_formatted',
      'currency',
      'payment_method',
      'provider_name',
      'provider_transaction_ref',
      'payment_status',
      'initiated_at',
      'confirmed_at',
      'beneficiary_type',
      'reconciliation_id',
      'reconciliation_status',
      'bank_statement_ref',
      'statement_amount_paise',
      'statement_amount_inr_formatted',
      'reconciled_at',
      'reconciled_by',
      'reconciliation_notes',
      'data_classification',
      'source_type'
    ];

    const content =
      format === 'csv'
        ? this.serializeToCsv(headers, records, metadata)
        : this.serializeToNdjson(records, metadata);

    this.auditService.logEvent({
      actorId,
      actorRole,
      actionType: 'EXPORT',
      entityName: 'payments-reconciliation',
      entityId: format,
      afterState: { recordCount: records.length, format, filters },
      ipAddress
    });

    return {
      dataset: 'payments-reconciliation',
      format,
      contentType: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
      fileName: `municipal_payments_reconciliation_${generatedAt.substring(0, 10)}.${format}`,
      content,
      recordCount: records.length,
      orderingRule,
      provenanceClassification: DataClassification.SIMULATED_DEMO_DATA,
      generatedAt
    };
  }

  /**
   * Export Operational Configuration Summary
   * (Redacts passwords, secrets, salts, tokens, and raw personal identifiers)
   */
  public exportConfigurationSummary(
    format: ExportFormat,
    actorId: string,
    actorRole: UserRole | string,
    ipAddress: string
  ): ExportResult {
    // 1. Wards
    const wards = this.db.prepare(`SELECT id, code, name, created_at FROM wards ORDER BY code ASC, id ASC`).all();

    // 2. Routes
    const routes = this.db.prepare(`SELECT id, area_id, code, name, created_at FROM routes ORDER BY code ASC, id ASC`).all();

    // 3. Vehicles
    const vehicles = this.db.prepare(`SELECT id, registration_number, vehicle_type, capacity_metric_tons, operational_status, created_at FROM vehicles ORDER BY registration_number ASC, id ASC`).all();

    // 4. Workers (Redacted: no personal phone number or credentials)
    const workers = this.db.prepare(`SELECT id, employee_code, full_name, role, is_active, created_at FROM workers ORDER BY employee_code ASC, id ASC`).all();

    // 5. Active Master Assignments
    const masterAssignments = this.db.prepare(`
      SELECT ma.id, ma.route_id, r.code as route_code, ma.vehicle_id, v.registration_number,
             ma.driver_id, d.employee_code as driver_code, ma.supervisor_id, s.employee_code as supervisor_code,
             ma.valid_from, ma.valid_to, ma.is_current, ma.created_at
      FROM master_assignments ma
      JOIN routes r ON r.id = ma.route_id
      JOIN vehicles v ON v.id = ma.vehicle_id
      JOIN workers d ON d.id = ma.driver_id
      JOIN workers s ON s.id = ma.supervisor_id
      ORDER BY r.code ASC, ma.valid_from ASC, ma.id ASC
    `).all();

    const summaryRecords: Record<string, unknown>[] = [];

    wards.forEach((w: any) => {
      summaryRecords.push({
        config_domain: 'WARD',
        entity_id: w.id,
        identifier: w.code,
        label: w.name,
        details: { code: w.code, name: w.name },
        status: 'ACTIVE',
        created_at: w.created_at
      });
    });

    routes.forEach((r: any) => {
      summaryRecords.push({
        config_domain: 'ROUTE',
        entity_id: r.id,
        identifier: r.code,
        label: r.name,
        details: { area_id: r.area_id, code: r.code, name: r.name },
        status: 'ACTIVE',
        created_at: r.created_at
      });
    });

    vehicles.forEach((v: any) => {
      summaryRecords.push({
        config_domain: 'VEHICLE',
        entity_id: v.id,
        identifier: v.registration_number,
        label: `${v.vehicle_type} (${v.registration_number})`,
        details: { capacity_tons: v.capacity_metric_tons, vehicle_type: v.vehicle_type },
        status: v.operational_status,
        created_at: v.created_at
      });
    });

    workers.forEach((wrk: any) => {
      summaryRecords.push({
        config_domain: 'WORKER',
        entity_id: wrk.id,
        identifier: wrk.employee_code,
        label: wrk.full_name,
        details: { role: wrk.role },
        status: wrk.is_active ? 'ACTIVE' : 'INACTIVE',
        created_at: wrk.created_at
      });
    });

    masterAssignments.forEach((ma: any) => {
      summaryRecords.push({
        config_domain: 'MASTER_ASSIGNMENT',
        entity_id: ma.id,
        identifier: `${ma.route_code}_${ma.registration_number}`,
        label: `Route ${ma.route_code} -> Vehicle ${ma.registration_number}`,
        details: {
          driver_code: ma.driver_code,
          supervisor_code: ma.supervisor_code,
          valid_from: ma.valid_from,
          valid_to: ma.valid_to
        },
        status: ma.is_current ? 'CURRENT' : 'HISTORICAL',
        created_at: ma.created_at
      });
    });

    const orderingRule = 'config_domain ASC, identifier ASC, entity_id ASC';
    summaryRecords.sort((a, b) => {
      const domDiff = String(a.config_domain).localeCompare(String(b.config_domain));
      if (domDiff !== 0) return domDiff;
      const idDiff = String(a.identifier).localeCompare(String(b.identifier));
      if (idDiff !== 0) return idDiff;
      return String(a.entity_id).localeCompare(String(b.entity_id));
    });

    const generatedAt = new Date().toISOString();
    const metadata = {
      export_type: 'configuration-summary',
      dataset: 'configuration-summary',
      format,
      generated_at: generatedAt,
      record_count: summaryRecords.length,
      ordering_rule: orderingRule,
      provenance_classification: DataClassification.SIMULATED_DEMO_DATA,
      redaction_notice: 'PASSWORDS, SALTS, AUTHENTICATION TOKENS, AND RAW CONTACT DATA ARE STRICTLY EXCLUDED FROM CONFIGURATION EXPORTS.',
      disclaimer: 'INTERNAL AUDIT EXPORT ONLY. CURRENT REGISTERED MUNICIPAL CONFIGURATION (WARDS, ROUTES, FLEET, ROSTER). NOT A STATUTORY/LEGAL CERTIFICATION. EXPORTS ARE NON-DESTRUCTIVE COPIES.'
    };

    const headers = [
      'config_domain',
      'entity_id',
      'identifier',
      'label',
      'details',
      'status',
      'created_at'
    ];

    const content =
      format === 'csv'
        ? this.serializeToCsv(headers, summaryRecords, metadata)
        : this.serializeToNdjson(summaryRecords, metadata);

    this.auditService.logEvent({
      actorId,
      actorRole,
      actionType: 'EXPORT',
      entityName: 'configuration-summary',
      entityId: format,
      afterState: { recordCount: summaryRecords.length, format },
      ipAddress
    });

    return {
      dataset: 'configuration-summary',
      format,
      contentType: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
      fileName: `municipal_configuration_summary_${generatedAt.substring(0, 10)}.${format}`,
      content,
      recordCount: summaryRecords.length,
      orderingRule,
      provenanceClassification: DataClassification.SIMULATED_DEMO_DATA,
      generatedAt
    };
  }

  /**
   * Unified dispatcher for all dataset exports.
   */
  public exportDataset(
    dataset: ExportDataset,
    format: ExportFormat,
    filters: ExportFilters,
    actorId: string,
    actorRole: UserRole | string,
    ipAddress: string
  ): ExportResult {
    switch (dataset) {
      case 'audit-events':
        return this.exportAuditEvents(filters, format, actorId, actorRole, ipAddress);
      case 'operational-verification':
        return this.exportOperationalVerification(filters, format, actorId, actorRole, ipAddress);
      case 'anomalies':
        return this.exportAnomalies(filters, format, actorId, actorRole, ipAddress);
      case 'payments-reconciliation':
        return this.exportPaymentsReconciliation(filters, format, actorId, actorRole, ipAddress);
      case 'configuration-summary':
        return this.exportConfigurationSummary(format, actorId, actorRole, ipAddress);
      default:
        throw new Error(`Unsupported export dataset: ${dataset}`);
    }
  }
}
