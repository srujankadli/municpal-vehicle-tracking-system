import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';
import { ProvenanceService } from './provenance.service.js';
import { MetricsService } from './metrics.service.js';
import { AnomalySeverity, AnomalyStatus } from '../types/domain.js';

export interface AnomalyRecord {
  id: string;
  service_run_id?: string | null;
  anomaly_id: string;
  severity: AnomalySeverity;
  description: string;
  trigger_evidence: string;
  status: AnomalyStatus;
  detected_at: string;
  source_id: string;
}

export class AnomalyService {
  private db: DatabaseSync;
  private provenance: ProvenanceService;
  private metrics: MetricsService;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.provenance = new ProvenanceService(this.db);
    this.metrics = new MetricsService(this.db);
  }

  public recordAnomaly(params: {
    service_run_id?: string | null;
    anomaly_id: string;
    severity: AnomalySeverity;
    description: string;
    trigger_evidence: Record<string, unknown>;
  }): AnomalyRecord {
    const id = crypto.randomUUID();
    const detectedAt = new Date().toISOString();
    const sourceId = this.provenance.getPrimaryDemoSourceId();

    const stmt = this.db.prepare(`
      INSERT INTO operational_anomalies (
        id, service_run_id, anomaly_id, severity,
        description, trigger_evidence, status, detected_at, source_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const evidenceStr = JSON.stringify(params.trigger_evidence);

    stmt.run(
      id,
      params.service_run_id || null,
      params.anomaly_id,
      params.severity,
      params.description,
      evidenceStr,
      AnomalyStatus.UNRESOLVED,
      detectedAt,
      sourceId
    );

    return {
      id,
      service_run_id: params.service_run_id,
      anomaly_id: params.anomaly_id,
      severity: params.severity,
      description: params.description,
      trigger_evidence: evidenceStr,
      status: AnomalyStatus.UNRESOLVED,
      detected_at: detectedAt,
      source_id: sourceId
    };
  }

  /**
   * ANOM-01: Assigned Vehicle Inactivity
   * Run status remains NOT_STARTED > 90 mins past scheduled start time.
   */
  public evaluateAssignedVehicleInactivity(assignmentId: string, currentIsoTime?: string): AnomalyRecord | null {
    const now = currentIsoTime ? new Date(currentIsoTime).getTime() : Date.now();

    const stmt = this.db.prepare(`
      SELECT a.id as assignment_id, a.scheduled_start, a.vehicle_id, r.id as run_id, r.run_status
      FROM daily_assignments a
      LEFT JOIN daily_service_runs r ON a.id = r.assignment_id
      WHERE a.id = ?
    `);
    const row = stmt.get(assignmentId) as {
      assignment_id: string;
      scheduled_start: string;
      vehicle_id: string;
      run_id?: string | null;
      run_status?: string | null;
    } | undefined;

    if (!row) return null;

    const scheduledTime = new Date(row.scheduled_start).getTime();
    const delayMinutes = (now - scheduledTime) / (60 * 1000);

    const isNotStarted = !row.run_status || row.run_status === 'NOT_STARTED';

    if (delayMinutes > 90 && isNotStarted) {
      return this.recordAnomaly({
        service_run_id: row.run_id || null,
        anomaly_id: 'ANOM-01',
        severity: AnomalySeverity.HIGH,
        description: `Vehicle departure delayed by ${Math.round(delayMinutes)} minutes past scheduled start time without departure event.`,
        trigger_evidence: {
          assignment_id: row.assignment_id,
          vehicle_id: row.vehicle_id,
          scheduled_start: row.scheduled_start,
          evaluated_time: new Date(now).toISOString(),
          delay_minutes: Math.round(delayMinutes),
          run_status: row.run_status || 'NOT_STARTED'
        }
      });
    }

    return null;
  }

  /**
   * ANOM-02: Rapid-Fire Scan Anomaly
   * Consecutive doorstep scans logged with delta t < 5 seconds between distinct dwellings.
   */
  public evaluateRapidScanAnomaly(serviceRunId: string): AnomalyRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, household_id, captured_at
      FROM service_evidence
      WHERE service_run_id = ? AND evidence_type IN ('DOORSTEP_NFC_TAP', 'DOORSTEP_QR_SCAN')
      ORDER BY captured_at ASC
    `);
    const scans = stmt.all(serviceRunId) as { id: string; household_id: string; captured_at: string }[];

    const detected: AnomalyRecord[] = [];

    for (let i = 1; i < scans.length; i++) {
      const prev = scans[i - 1]!;
      const curr = scans[i]!;

      if (prev.household_id !== curr.household_id) {
        const t1 = new Date(prev.captured_at).getTime();
        const t2 = new Date(curr.captured_at).getTime();
        const deltaSec = (t2 - t1) / 1000;

        if (deltaSec >= 0 && deltaSec < 5) {
          detected.push(
            this.recordAnomaly({
              service_run_id: serviceRunId,
              anomaly_id: 'ANOM-02',
              severity: AnomalySeverity.HIGH,
              description: `Rapid consecutive physical scans detected between distinct dwellings (${deltaSec.toFixed(1)}s interval); flagged for supervisory scan review.`,
              trigger_evidence: {
                previous_evidence_id: prev.id,
                current_evidence_id: curr.id,
                previous_household_id: prev.household_id,
                current_household_id: curr.household_id,
                previous_time: prev.captured_at,
                current_time: curr.captured_at,
                delta_seconds: deltaSec
              }
            })
          );
        }
      }
    }

    return detected;
  }

  /**
   * ANOM-03: Uncorroborated Collection Dispute
   * Crew logged collection as VERIFIED, but resident filed unserviced complaint.
   */
  public evaluateUncorroboratedDispute(serviceRunId: string): AnomalyRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        cr.household_id, 
        cr.verification_status, 
        c.id as complaint_id, 
        c.filed_at,
        c.resident_remarks
      FROM collection_records cr
      JOIN daily_service_runs r ON cr.service_run_id = r.id
      JOIN daily_assignments a ON r.assignment_id = a.id
      JOIN complaints c ON cr.household_id = c.household_id AND a.service_date = c.service_date
      WHERE cr.service_run_id = ?
        AND cr.verification_status = 'VERIFIED'
    `);
    const rows = stmt.all(serviceRunId) as {
      household_id: string;
      verification_status: string;
      complaint_id: string;
      filed_at: string;
      resident_remarks: string;
    }[];

    const detected: AnomalyRecord[] = [];

    for (const row of rows) {
      detected.push(
        this.recordAnomaly({
          service_run_id: serviceRunId,
          anomaly_id: 'ANOM-03',
          severity: AnomalySeverity.MEDIUM,
          description: `Discrepancy: Collection marked VERIFIED by crew, but resident filed missed-collection complaint requiring review.`,
          trigger_evidence: {
            household_id: row.household_id,
            complaint_id: row.complaint_id,
            filed_at: row.filed_at,
            resident_remarks: row.resident_remarks
          }
        })
      );
    }

    return detected;
  }

  /**
   * ANOM-04: Payment Gateway Ref Collision
   * Incoming transaction ID already exists under another payment record.
   */
  public evaluateGatewayRefCollision(incomingRef: string, currentPaymentId: string): AnomalyRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, household_id, status, amount_paise
      FROM resident_payments
      WHERE provider_transaction_ref = ? AND id != ?
    `);
    const existing = stmt.get(incomingRef, currentPaymentId) as {
      id: string;
      household_id: string;
      status: string;
      amount_paise: number;
    } | undefined;

    if (existing) {
      return this.recordAnomaly({
        service_run_id: null,
        anomaly_id: 'ANOM-04',
        severity: AnomalySeverity.CRITICAL,
        description: `Payment provider reference collision: Transaction ref ${incomingRef} already belongs to payment ${existing.id}; transaction blocked pending review.`,
        trigger_evidence: {
          colliding_reference: incomingRef,
          existing_payment_id: existing.id,
          attempted_payment_id: currentPaymentId,
          existing_household_id: existing.household_id
        }
      });
    }

    return null;
  }

  /**
   * ANOM-05: Bank Settlement Discrepancy
   * Bank statement deposit amount differs from gateway confirmed settlement.
   */
  public evaluateSettlementDiscrepancy(reconciliationId: string): AnomalyRecord | null {
    const stmt = this.db.prepare(`
      SELECT 
        r.id as reconciliation_id,
        r.payment_id,
        r.statement_amount_paise,
        p.amount_paise as payment_amount_paise,
        p.provider_transaction_ref
      FROM payment_reconciliations r
      JOIN resident_payments p ON r.payment_id = p.id
      WHERE r.id = ?
    `);
    const row = stmt.get(reconciliationId) as {
      reconciliation_id: string;
      payment_id: string;
      statement_amount_paise: number;
      payment_amount_paise: number;
      provider_transaction_ref: string;
    } | undefined;

    if (!row) return null;

    if (row.statement_amount_paise !== row.payment_amount_paise) {
      const delta = row.statement_amount_paise - row.payment_amount_paise;
      return this.recordAnomaly({
        service_run_id: null,
        anomaly_id: 'ANOM-05',
        severity: AnomalySeverity.CRITICAL,
        description: `Bank deposit amount differs from gateway settlement amount by ${(delta / 100).toFixed(2)} INR; flagged as financial reconciliation exception.`,
        trigger_evidence: {
          reconciliation_id: row.reconciliation_id,
          payment_id: row.payment_id,
          provider_ref: row.provider_transaction_ref,
          statement_amount_paise: row.statement_amount_paise,
          payment_amount_paise: row.payment_amount_paise,
          delta_paise: delta
        }
      });
    }

    return null;
  }

  /**
   * ANOM-06: Route Truncation / Abandonment
   * Run marked COMPLETED, but Route Completion Rate RC < 60%.
   */
  public evaluateRouteAbandonment(serviceRunId: string): AnomalyRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, run_status
      FROM daily_service_runs
      WHERE id = ?
    `);
    const run = stmt.get(serviceRunId) as { id: string; run_status: string } | undefined;
    if (!run || run.run_status !== 'COMPLETED') return null;

    const rc = this.metrics.calculateRouteCompletionRate(serviceRunId);

    if (rc.value_percentage < 60.0) {
      return this.recordAnomaly({
        service_run_id: serviceRunId,
        anomaly_id: 'ANOM-06',
        severity: AnomalySeverity.HIGH,
        description: `Route marked COMPLETED but completion rate is only ${rc.value_percentage}%, below 60% threshold. Flagged for route truncation review.`,
        trigger_evidence: {
          service_run_id: serviceRunId,
          completion_rate: rc.value_percentage,
          numerator: rc.numerator,
          denominator: rc.denominator
        }
      });
    }

    return null;
  }

  /**
   * ANOM-07: Assignment Conflict
   * Same vehicle or driver assigned to multiple distinct routes on the same service date.
   */
  public evaluateAssignmentConflicts(serviceDate: string): AnomalyRecord[] {
    const stmt = this.db.prepare(`
      SELECT vehicle_id, driver_id, COUNT(*) as count, GROUP_CONCAT(route_id) as routes
      FROM daily_assignments
      WHERE service_date = ?
      GROUP BY vehicle_id
      HAVING COUNT(*) > 1
    `);
    const conflicts = stmt.all(serviceDate) as {
      vehicle_id: string;
      driver_id: string;
      count: number;
      routes: string;
    }[];

    const detected: AnomalyRecord[] = [];

    for (const conflict of conflicts) {
      detected.push(
        this.recordAnomaly({
          service_run_id: null,
          anomaly_id: 'ANOM-07',
          severity: AnomalySeverity.HIGH,
          description: `Vehicle double-booking detected: Vehicle ${conflict.vehicle_id} assigned to multiple routes (${conflict.routes}) on ${serviceDate}.`,
          trigger_evidence: {
            service_date: serviceDate,
            vehicle_id: conflict.vehicle_id,
            assignment_count: conflict.count,
            routes: conflict.routes.split(',')
          }
        })
      );
    }

    return detected;
  }
}
