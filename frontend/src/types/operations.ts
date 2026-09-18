/**
 * Type definitions for Authority Operations and Master Data
 * Backed 100% by Phase 1 Fastify endpoints
 */

export interface MetricResult {
  metric_name: string;
  value_percentage: number;
  numerator: number;
  denominator: number;
  formula: string;
  data_classification: string;
  computed_at: string;
  metadata?: Record<string, unknown>;
}

export interface DailyAssignment {
  id: string;
  service_date: string;
  route_id: string;
  vehicle_id: string;
  driver_id: string;
  supervisor_id: string;
  scheduled_start: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  source_id: string;
  created_at: string;
  created_by: string;
}

export interface OperationalAnomaly {
  id: string;
  service_run_id: string | null;
  anomaly_id: string; // ANOM-01 through ANOM-07
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  trigger_evidence_json: string;
  status: 'UNRESOLVED' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  source_id: string;
}

export interface ComplaintRecord {
  id: string;
  household_id: string;
  service_date: string;
  complaint_type: string;
  resident_remarks: string;
  status: 'SUBMITTED' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  filed_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  source_id: string;
}

export interface MasterVehicle {
  id: string;
  registration_number: string;
  vehicle_type: string;
  capacity_metric_tons?: number;
  capacity_tons?: number;
  operational_status: 'ACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
  source_id: string;
  created_at: string;
  updated_at: string;
}

export interface MasterWard {
  id: string;
  code: string;
  name: string;
  source_id: string;
  created_at: string;
  updated_at: string;
}

export interface MasterWorker {
  id: string;
  employee_code: string;
  full_name: string;
  role: 'DRIVER' | 'SANITARY_WORKER' | 'SUPERVISOR';
  contact_number_masked: string;
  is_active: number;
  source_id: string;
  created_at: string;
  updated_at: string;
}

export interface MasterRoute {
  id: string;
  area_id: string;
  code: string;
  name: string;
  description: string | null;
  corridor_geojson?: string | null;
  source_id: string;
  created_at: string;
  updated_at: string;
}

export interface MasterHousehold {
  id: string;
  route_id: string;
  service_uid: string;
  resident_name: string;
  phone_masked: string;
  address_line: string;
  latitude: number | null;
  longitude: number | null;
  nfc_tag_uid: string | null;
  qr_code_uid: string | null;
  is_active: number;
  source_id: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceRunDetail {
  id: string;
  assignment_id: string;
  actual_start: string | null;
  actual_end: string | null;
  run_status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'INCOMPLETE';
  completion_percentage: number;
  service_date: string;
  route_id: string;
  vehicle_id: string;
  driver_id: string;
  supervisor_id: string;
}

export interface HouseholdVerificationSynthesis {
  householdId?: string;
  status: 'EXPECTED' | 'OBSERVED' | 'EVIDENCE_AVAILABLE' | 'VERIFIED' | 'NOT_VERIFIED' | 'EXCEPTION' | 'DISPUTED';
  evidenceCount?: number;
  evidence_count?: number;
  hasPhysicalScan?: boolean;
  hasProximityObservation?: boolean;
  hasResidentComplaint?: boolean;
  has_grievance?: boolean;
  hasApprovedException?: boolean;
  disclosureStatement?: string;
  notes?: string;
}

export interface ServiceEvidenceItem {
  id: string;
  service_run_id: string;
  household_id: string;
  evidence_type: 'DOORSTEP_NFC_TAP' | 'DOORSTEP_QR_SCAN' | 'VEHICLE_PROXIMITY_CORRIDOR';
  captured_at: string;
  device_id: string | null;
  actor_id: string | null;
  raw_payload?: string | Record<string, unknown> | null;
  source_id: string;
  created_at: string;
}

export interface PaymentObligation {
  id: string;
  household_id: string;
  billing_period: string; // YYYY-MM
  amount_paise: number;
  obligation_type: string;
  beneficiary_type: string;
  is_active: number;
  source_id: string;
  created_at: string;
}

export interface ResidentPayment {
  id: string;
  obligation_id: string;
  household_id: string;
  amount_paise: number;
  payment_method: string;
  status: string;
  provider_transaction_ref: string | null;
  reconciliation_status?: string | null;
  bank_statement_ref?: string | null;
  initiated_at: string;
  confirmed_at: string | null;
  source_id: string;
}

export interface PaymentReconciliation {
  id: string;
  payment_id: string;
  bank_statement_ref: string;
  statement_amount_paise: number;
  status: 'MATCHED' | 'UNMATCHED_AMOUNT' | 'UNVERIFIED_BANK' | 'MANUAL_DISCREPANCY';
  reconciled_at: string;
  reconciled_by: string;
  notes: string | null;
  source_id: string;
}

export interface AuditEventRow {
  id: string;
  actor_id: string;
  actor_role: string;
  action_type: string;
  entity_name: string;
  entity_id: string;
  before_state: string | null;
  after_state: string | null;
  ip_address: string;
  created_at: string;
}
