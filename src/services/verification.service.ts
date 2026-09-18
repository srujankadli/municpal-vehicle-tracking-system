import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';
import { VerificationStatus, EvidenceType } from '../types/domain.js';
import { ProvenanceService } from './provenance.service.js';

export interface RecordEvidenceParams {
  id?: string;
  serviceRunId: string;
  householdId: string;
  evidenceType: EvidenceType;
  capturedAt: string;
  deviceId?: string | null;
  actorId?: string | null;
  rawPayload?: Record<string, unknown> | null;
  sourceId?: string;
}

export interface RecordEvidenceResult {
  id: string;
  isDuplicate: boolean;
}

export interface VerificationSynthesisResult {
  householdId: string;
  status: VerificationStatus;
  evidenceCount: number;
  hasPhysicalScan: boolean;
  hasProximityObservation: boolean;
  hasResidentComplaint: boolean;
  hasApprovedException: boolean;
  disclosureStatement?: string;
}

export class VerificationService {
  private db: DatabaseSync;
  private provenance: ProvenanceService;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.provenance = new ProvenanceService(this.db);
  }

  /**
   * Records a discrete piece of service evidence.
   * If an id (client_event_id) is provided and already exists,
   * it returns isDuplicate: true without inserting duplicate rows.
   */
  public recordEvidence(params: RecordEvidenceParams): RecordEvidenceResult {
    const id = params.id || crypto.randomUUID();

    // Check existing record for sequential idempotency
    const checkStmt = this.db.prepare(`SELECT id FROM service_evidence WHERE id = ?`);
    const existing = checkStmt.get(id) as { id: string } | undefined;
    if (existing) {
      return { id: existing.id, isDuplicate: true };
    }

    const sourceId = params.sourceId || this.provenance.getPrimaryDemoSourceId();
    const createdAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO service_evidence (
        id, service_run_id, household_id, evidence_type,
        captured_at, device_id, actor_id, raw_payload, source_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        id,
        params.serviceRunId,
        params.householdId,
        params.evidenceType,
        params.capturedAt,
        params.deviceId || null,
        params.actorId || null,
        params.rawPayload ? JSON.stringify(params.rawPayload) : null,
        sourceId,
        createdAt
      );
      return { id, isDuplicate: false };
    } catch (err: any) {
      // Catch concurrent collision on PRIMARY KEY (id)
      if (err?.message?.includes('UNIQUE constraint failed') || err?.message?.includes('PRIMARY KEY') || err?.code === 'SQLITE_CONSTRAINT') {
        return { id, isDuplicate: true };
      }
      throw err;
    }
  }

  /**
   * Synthesizes the authoritative verification status for a household on a specific run.
   * Enforces the non-negotiable rule: Telemetry/proximity alone DOES NOT equal VERIFIED.
   */
  public evaluateHouseholdStatus(serviceRunId: string, householdId: string): VerificationSynthesisResult {
    // 1. Check if run is assigned to household's route
    const assignmentStmt = this.db.prepare(`
      SELECT r.id as run_id, a.service_date, h.id as household_id
      FROM daily_service_runs r
      JOIN daily_assignments a ON r.assignment_id = a.id
      JOIN households h ON a.route_id = h.route_id
      WHERE r.id = ? AND h.id = ?
    `);
    const assignment = assignmentStmt.get(serviceRunId, householdId) as { service_date: string } | undefined;

    if (!assignment) {
      return {
        householdId,
        status: VerificationStatus.NOT_VERIFIED,
        evidenceCount: 0,
        hasPhysicalScan: false,
        hasProximityObservation: false,
        hasResidentComplaint: false,
        hasApprovedException: false,
        disclosureStatement: 'Household was not scheduled on the route assigned to this service run.'
      };
    }

    // 2. Fetch all evidence records for this household on this run
    const evidenceStmt = this.db.prepare(`
      SELECT evidence_type, captured_at
      FROM service_evidence
      WHERE service_run_id = ? AND household_id = ?
    `);
    const evidenceList = evidenceStmt.all(serviceRunId, householdId) as { evidence_type: string }[];

    const hasPhysicalScan = evidenceList.some(e => 
      e.evidence_type === EvidenceType.DOORSTEP_NFC_TAP || 
      e.evidence_type === EvidenceType.DOORSTEP_QR_SCAN
    );

    const hasProximityObservation = evidenceList.some(e => 
      e.evidence_type === EvidenceType.VEHICLE_PROXIMITY_CORRIDOR
    );

    // 3. Check for resident complaints for this service date
    const complaintStmt = this.db.prepare(`
      SELECT id, status FROM complaints
      WHERE household_id = ? AND service_date = ?
    `);
    const complaint = complaintStmt.get(householdId, assignment.service_date) as { id: string } | undefined;
    const hasResidentComplaint = Boolean(complaint);

    // 4. Check for documented exceptions in collection_records
    const collectionRecordStmt = this.db.prepare(`
      SELECT verification_status, exception_reason
      FROM collection_records
      WHERE service_run_id = ? AND household_id = ?
    `);
    const collRecord = collectionRecordStmt.get(serviceRunId, householdId) as {
      verification_status: string;
      exception_reason?: string | null;
    } | undefined;

    const hasApprovedException = collRecord?.verification_status === VerificationStatus.EXCEPTION;

    // 5. Apply Deterministic Municipal Policy Rules
    let status: VerificationStatus;
    let disclosureStatement: string | undefined;

    if (hasResidentComplaint && (hasPhysicalScan || hasProximityObservation)) {
      status = VerificationStatus.DISPUTED;
      disclosureStatement = 'Conflicting evidence: Field activity logged but resident filed missed-collection complaint.';
    } else if (hasResidentComplaint) {
      status = VerificationStatus.NOT_VERIFIED;
      disclosureStatement = 'Resident reported unserviced collection; no corroborating service evidence exists.';
    } else if (hasApprovedException) {
      status = VerificationStatus.EXCEPTION;
      disclosureStatement = `Service exception documented by crew and approved: ${collRecord?.exception_reason || 'Unserviceable obstacle'}.`;
    } else if (hasPhysicalScan) {
      status = VerificationStatus.VERIFIED;
      disclosureStatement = 'Collection verified via doorstep physical tag interaction by assigned crew.';
    } else if (hasProximityObservation) {
      // CRITICAL DATA INTEGRITY RULE: Proximity/telemetry ALONE is NOT verified!
      status = VerificationStatus.OBSERVED;
      disclosureStatement = 'Collection cannot be independently proven with the currently available data.';
    } else if (evidenceList.length > 0) {
      status = VerificationStatus.EVIDENCE_AVAILABLE;
      disclosureStatement = 'Corroborating evidence exists but does not meet full doorstep scan policy requirements.';
    } else {
      status = VerificationStatus.NOT_VERIFIED;
      disclosureStatement = 'Run concluded without observed activity or service evidence.';
    }

    return {
      householdId,
      status,
      evidenceCount: evidenceList.length,
      hasPhysicalScan,
      hasProximityObservation,
      hasResidentComplaint,
      hasApprovedException,
      disclosureStatement
    };
  }

  /**
   * Persists or updates the synthesis result into collection_records.
   */
  public updateHouseholdRecord(serviceRunId: string, householdId: string, status: VerificationStatus, reason?: string): void {
    const sourceId = this.provenance.getPrimaryDemoSourceId();
    const now = new Date().toISOString();

    const existingStmt = this.db.prepare(`
      SELECT id FROM collection_records WHERE service_run_id = ? AND household_id = ?
    `);
    const existing = existingStmt.get(serviceRunId, householdId) as { id: string } | undefined;

    if (existing) {
      const updateStmt = this.db.prepare(`
        UPDATE collection_records
        SET verification_status = ?, exception_reason = ?, verified_at = ?, updated_at = ?
        WHERE id = ?
      `);
      updateStmt.run(status, reason || null, now, now, existing.id);
    } else {
      const id = crypto.randomUUID();
      const insertStmt = this.db.prepare(`
        INSERT INTO collection_records (
          id, service_run_id, household_id, verification_status,
          exception_reason, verified_at, source_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(id, serviceRunId, householdId, status, reason || null, now, sourceId, now, now);
    }
  }
}
