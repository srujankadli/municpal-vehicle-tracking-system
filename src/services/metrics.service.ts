import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';
import { DataClassification, type MetricResult } from '../types/domain.js';

export class MetricsService {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  /**
   * Metric 1: Route Completion Rate (RC)
   * RC = ((H_verified + H_exception) / H_scheduled) * 100%
   */
  public calculateRouteCompletionRate(serviceRunId: string): MetricResult {
    // 1. Get run and assignment info
    const runStmt = this.db.prepare(`
      SELECT r.id as run_id, a.route_id, a.service_date
      FROM daily_service_runs r
      JOIN daily_assignments a ON r.assignment_id = a.id
      WHERE r.id = ?
    `);
    const run = runStmt.get(serviceRunId) as { run_id: string; route_id: string; service_date: string } | undefined;

    if (!run) {
      return {
        metric_name: 'Route Completion Rate (RC)',
        value_percentage: 0.00,
        numerator: 0,
        denominator: 0,
        formula: 'RC = ((H_verified + H_exception) / H_scheduled) * 100%',
        data_classification: DataClassification.DERIVED_DATA,
        computed_at: new Date().toISOString(),
        metadata: { error: 'Service run not found' }
      };
    }

    // 2. Count scheduled households for this route
    const scheduledStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM households
      WHERE route_id = ? AND is_active = 1
    `);
    const scheduledRow = scheduledStmt.get(run.route_id) as { count: number };
    const hScheduled = Number(scheduledRow.count);

    if (hScheduled === 0) {
      return {
        metric_name: 'Route Completion Rate (RC)',
        value_percentage: 0.00,
        numerator: 0,
        denominator: 0,
        formula: 'RC = ((H_verified + H_exception) / H_scheduled) * 100%',
        data_classification: DataClassification.DERIVED_DATA,
        computed_at: new Date().toISOString(),
        metadata: { route_id: run.route_id, service_run_id: serviceRunId }
      };
    }

    // 3. Count verified and exception households
    const evidenceStmt = this.db.prepare(`
      SELECT 
        SUM(CASE WHEN verification_status = 'VERIFIED' THEN 1 ELSE 0 END) as verified_count,
        SUM(CASE WHEN verification_status = 'EXCEPTION' THEN 1 ELSE 0 END) as exception_count
      FROM collection_records
      WHERE service_run_id = ?
    `);
    const evidenceRow = evidenceStmt.get(serviceRunId) as { verified_count: number | null; exception_count: number | null };
    const hVerified = Number(evidenceRow?.verified_count || 0);
    const hException = Number(evidenceRow?.exception_count || 0);

    const numerator = hVerified + hException;
    const rawPercentage = (numerator / hScheduled) * 100;
    const roundedPercentage = Math.round(rawPercentage * 100) / 100;

    return {
      metric_name: 'Route Completion Rate (RC)',
      value_percentage: roundedPercentage,
      numerator,
      denominator: hScheduled,
      formula: 'RC = ((H_verified + H_exception) / H_scheduled) * 100%',
      data_classification: DataClassification.DERIVED_DATA,
      computed_at: new Date().toISOString(),
      metadata: { h_verified: hVerified, h_exception: hException, h_scheduled: hScheduled }
    };
  }

  /**
   * Metric 2: Service Discrepancy Rate (SDR)
   * SDR = ((H_missed + H_disputed) / H_scheduled) * 100%
   */
  public calculateServiceDiscrepancyRate(serviceRunId: string): MetricResult {
    const runStmt = this.db.prepare(`
      SELECT r.id as run_id, a.route_id, a.service_date
      FROM daily_service_runs r
      JOIN daily_assignments a ON r.assignment_id = a.id
      WHERE r.id = ?
    `);
    const run = runStmt.get(serviceRunId) as { run_id: string; route_id: string; service_date: string } | undefined;

    if (!run) {
      return {
        metric_name: 'Service Discrepancy Rate (SDR)',
        value_percentage: 0.00,
        numerator: 0,
        denominator: 0,
        formula: 'SDR = ((H_missed + H_disputed) / H_scheduled) * 100%',
        data_classification: DataClassification.DERIVED_DATA,
        computed_at: new Date().toISOString(),
        metadata: { error: 'Service run not found' }
      };
    }

    const scheduledStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM households
      WHERE route_id = ? AND is_active = 1
    `);
    const scheduledRow = scheduledStmt.get(run.route_id) as { count: number };
    const hScheduled = Number(scheduledRow.count);

    if (hScheduled === 0) {
      return {
        metric_name: 'Service Discrepancy Rate (SDR)',
        value_percentage: 0.00,
        numerator: 0,
        denominator: 0,
        formula: 'SDR = ((H_missed + H_disputed) / H_scheduled) * 100%',
        data_classification: DataClassification.DERIVED_DATA,
        computed_at: new Date().toISOString(),
        metadata: { route_id: run.route_id, service_run_id: serviceRunId }
      };
    }

    // Count disputed records in collection_records or households with filed missed complaints
    const discrepancyStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT cr.household_id) as count
      FROM collection_records cr
      LEFT JOIN complaints c ON cr.household_id = c.household_id AND c.service_date = ?
      WHERE cr.service_run_id = ?
        AND (cr.verification_status = 'DISPUTED' 
             OR (cr.verification_status = 'NOT_VERIFIED' AND c.id IS NOT NULL))
    `);
    const row = discrepancyStmt.get(run.service_date, serviceRunId) as { count: number };
    const numerator = Number(row?.count || 0);

    const rawPercentage = (numerator / hScheduled) * 100;
    const roundedPercentage = Math.round(rawPercentage * 100) / 100;

    return {
      metric_name: 'Service Discrepancy Rate (SDR)',
      value_percentage: roundedPercentage,
      numerator,
      denominator: hScheduled,
      formula: 'SDR = ((H_missed + H_disputed) / H_scheduled) * 100%',
      data_classification: DataClassification.DERIVED_DATA,
      computed_at: new Date().toISOString(),
      metadata: { service_date: run.service_date, route_id: run.route_id }
    };
  }

  /**
   * Metric 3: Fleet Operational Availability (FOA)
   * FOA = (V_active / V_operable) * 100%
   */
  public calculateFleetOperationalAvailability(serviceDate: string): MetricResult {
    // Operable vehicles: non-decommissioned
    const operableStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM vehicles
      WHERE operational_status != 'DECOMMISSIONED'
    `);
    const operableRow = operableStmt.get() as { count: number };
    const vOperable = Number(operableRow.count);

    if (vOperable === 0) {
      return {
        metric_name: 'Fleet Operational Availability (FOA)',
        value_percentage: 0.00,
        numerator: 0,
        denominator: 0,
        formula: 'FOA = (V_active / V_operable) * 100%',
        data_classification: DataClassification.DERIVED_DATA,
        computed_at: new Date().toISOString(),
        metadata: { service_date: serviceDate }
      };
    }

    // Active vehicles: assigned and associated with a started run on service date
    const activeStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT a.vehicle_id) as count
      FROM daily_assignments a
      JOIN daily_service_runs r ON a.id = r.assignment_id
      WHERE a.service_date = ?
        AND r.run_status IN ('IN_PROGRESS', 'COMPLETED', 'INCOMPLETE')
    `);
    const activeRow = activeStmt.get(serviceDate) as { count: number };
    const vActive = Number(activeRow?.count || 0);

    const rawPercentage = (vActive / vOperable) * 100;
    const roundedPercentage = Math.round(rawPercentage * 100) / 100;

    return {
      metric_name: 'Fleet Operational Availability (FOA)',
      value_percentage: roundedPercentage,
      numerator: vActive,
      denominator: vOperable,
      formula: 'FOA = (V_active / V_operable) * 100%',
      data_classification: DataClassification.DERIVED_DATA,
      computed_at: new Date().toISOString(),
      metadata: { service_date: serviceDate, v_active: vActive, v_operable: vOperable }
    };
  }

  /**
   * Metric 4: Collection Reconciliation Ratio (CRR)
   * CRR = (Sum(Amount(P_reconciled_matched)) / Sum(Amount(B_levied))) * 100%
   * Uses exact integer arithmetic in paise!
   */
  public calculateCollectionReconciliationRatio(billingPeriod: string): MetricResult {
    // Total billed obligations for period (in paise)
    const billedStmt = this.db.prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) as total_paise
      FROM payment_obligations
      WHERE billing_period = ? AND is_active = 1
    `);
    const billedRow = billedStmt.get(billingPeriod) as { total_paise: number };
    const bLeviedPaise = Number(billedRow.total_paise);

    if (bLeviedPaise === 0) {
      return {
        metric_name: 'Collection Reconciliation Ratio (CRR)',
        value_percentage: 0.00,
        numerator: 0,
        denominator: 0,
        formula: 'CRR = (Sum(P_reconciled_matched) / Sum(B_levied)) * 100%',
        data_classification: DataClassification.DERIVED_DATA,
        computed_at: new Date().toISOString(),
        metadata: { billing_period: billingPeriod, unit: 'paise' }
      };
    }

    // Total confirmed and reconciled payments (in paise)
    const reconciledStmt = this.db.prepare(`
      SELECT COALESCE(SUM(p.amount_paise), 0) as total_paise
      FROM resident_payments p
      JOIN payment_obligations o ON p.obligation_id = o.id
      JOIN payment_reconciliations r ON p.id = r.payment_id
      WHERE o.billing_period = ?
        AND p.status IN ('SUCCESSFUL', 'RECONCILIATION_MATCHED')
        AND r.status = 'MATCHED'
    `);
    const reconciledRow = reconciledStmt.get(billingPeriod) as { total_paise: number };
    const pReconciledPaise = Number(reconciledRow.total_paise);

    const rawPercentage = (pReconciledPaise / bLeviedPaise) * 100;
    const roundedPercentage = Math.round(rawPercentage * 100) / 100;

    return {
      metric_name: 'Collection Reconciliation Ratio (CRR)',
      value_percentage: roundedPercentage,
      numerator: pReconciledPaise,
      denominator: bLeviedPaise,
      formula: 'CRR = (Sum(P_reconciled_matched) / Sum(B_levied)) * 100%',
      data_classification: DataClassification.DERIVED_DATA,
      computed_at: new Date().toISOString(),
      metadata: {
        billing_period: billingPeriod,
        reconciled_paise: pReconciledPaise,
        billed_paise: bLeviedPaise,
        reconciled_inr: (pReconciledPaise / 100).toFixed(2),
        billed_inr: (bLeviedPaise / 100).toFixed(2)
      }
    };
  }
}
