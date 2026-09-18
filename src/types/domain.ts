/**
 * Core Domain Enums and Type Definitions for Municipal Waste Monitoring System
 * Compliant with PROJECT_SPECIFICATION.md v2.2.0
 */

export const DataClassification = {
  REAL_DATA: 'REAL_DATA',
  SIMULATED_DEMO_DATA: 'SIMULATED_DEMO_DATA',
  FUTURE_INTEGRATION_DATA: 'FUTURE_INTEGRATION_DATA',
  DERIVED_DATA: 'DERIVED_DATA'
} as const;
export type DataClassification = typeof DataClassification[keyof typeof DataClassification];

export const SourceType = {
  MUNICIPAL_HRMS: 'MUNICIPAL_HRMS',
  PAYMENT_GATEWAY: 'PAYMENT_GATEWAY',
  TELEMETRY_FEED: 'TELEMETRY_FEED',
  CITIZEN_PORTAL: 'CITIZEN_PORTAL',
  MANUAL_SUPERVISOR_ENTRY: 'MANUAL_SUPERVISOR_ENTRY',
  SYNTHETIC_SEEDER: 'SYNTHETIC_SEEDER',
  DERIVATION_ENGINE: 'DERIVATION_ENGINE'
} as const;
export type SourceType = typeof SourceType[keyof typeof SourceType];

export const UserRole = {
  AUTHORITY: 'AUTHORITY',
  SUPERVISOR: 'SUPERVISOR',
  WARD_OFFICER: 'WARD_OFFICER',
  DRIVER: 'DRIVER',
  WORKER: 'WORKER',
  CITIZEN: 'CITIZEN',
  ADMIN: 'ADMIN'
} as const;
export type UserRole = typeof UserRole[keyof typeof UserRole];

export const VerificationStatus = {
  EXPECTED: 'EXPECTED',
  OBSERVED: 'OBSERVED',
  EVIDENCE_AVAILABLE: 'EVIDENCE_AVAILABLE',
  VERIFIED: 'VERIFIED',
  NOT_VERIFIED: 'NOT_VERIFIED',
  EXCEPTION: 'EXCEPTION',
  DISPUTED: 'DISPUTED'
} as const;
export type VerificationStatus = typeof VerificationStatus[keyof typeof VerificationStatus];

export const EvidenceType = {
  DOORSTEP_NFC_TAP: 'DOORSTEP_NFC_TAP',
  DOORSTEP_QR_SCAN: 'DOORSTEP_QR_SCAN',
  TIMESTAMPED_PHOTO: 'TIMESTAMPED_PHOTO',
  VEHICLE_PROXIMITY_CORRIDOR: 'VEHICLE_PROXIMITY_CORRIDOR',
  SUPERVISOR_PHYSICAL_INSPECTION: 'SUPERVISOR_PHYSICAL_INSPECTION',
  CITIZEN_AFFIRMATION: 'CITIZEN_AFFIRMATION'
} as const;
export type EvidenceType = typeof EvidenceType[keyof typeof EvidenceType];

export const PaymentObligationType = {
  MONTHLY_CONTRIBUTION: 'MONTHLY_CONTRIBUTION',
  PER_COLLECTION: 'PER_COLLECTION',
  PERIODIC_SERVICE_FEE: 'PERIODIC_SERVICE_FEE',
  AREA_CONTRIBUTION: 'AREA_CONTRIBUTION',
  OTHER_AUTHORIZED_CHARGE: 'OTHER_AUTHORIZED_CHARGE'
} as const;
export type PaymentObligationType = typeof PaymentObligationType[keyof typeof PaymentObligationType];

export const PaymentBeneficiaryType = {
  MUNICIPAL_TREASURY_ACCOUNT: 'MUNICIPAL_TREASURY_ACCOUNT',
  DESIGNATED_WORKER_ACCOUNT: 'DESIGNATED_WORKER_ACCOUNT',
  AUTHORIZED_SERVICE_CONTRACTOR: 'AUTHORIZED_SERVICE_CONTRACTOR',
  OTHER_APPROVED_BENEFICIARY: 'OTHER_APPROVED_BENEFICIARY'
} as const;
export type PaymentBeneficiaryType = typeof PaymentBeneficiaryType[keyof typeof PaymentBeneficiaryType];

export const PaymentStatus = {
  INITIATED: 'INITIATED',
  PENDING_PROVIDER: 'PENDING_PROVIDER',
  SUCCESSFUL: 'SUCCESSFUL',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED',
  RECONCILIATION_MATCHED: 'RECONCILIATION_MATCHED',
  RECONCILIATION_MISMATCH: 'RECONCILIATION_MISMATCH'
} as const;
export type PaymentStatus = typeof PaymentStatus[keyof typeof PaymentStatus];

export const ReconciliationStatus = {
  MATCHED: 'MATCHED',
  UNMATCHED_AMOUNT: 'UNMATCHED_AMOUNT',
  UNVERIFIED_BANK: 'UNVERIFIED_BANK',
  MANUAL_DISCREPANCY: 'MANUAL_DISCREPANCY'
} as const;
export type ReconciliationStatus = typeof ReconciliationStatus[keyof typeof ReconciliationStatus];

export const VehicleStatus = {
  ACTIVE: 'ACTIVE',
  MAINTENANCE: 'MAINTENANCE',
  DECOMMISSIONED: 'DECOMMISSIONED'
} as const;
export type VehicleStatus = typeof VehicleStatus[keyof typeof VehicleStatus];

export const WorkerRole = {
  DRIVER: 'DRIVER',
  SANITARY_WORKER: 'SANITARY_WORKER',
  SUPERVISOR: 'SUPERVISOR'
} as const;
export type WorkerRole = typeof WorkerRole[keyof typeof WorkerRole];

export const RunStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  INCOMPLETE: 'INCOMPLETE',
  ABORTED: 'ABORTED'
} as const;
export type RunStatus = typeof RunStatus[keyof typeof RunStatus];

export const AnomalySeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
} as const;
export type AnomalySeverity = typeof AnomalySeverity[keyof typeof AnomalySeverity];

export const AnomalyStatus = {
  UNRESOLVED: 'UNRESOLVED',
  REVIEWED_VALID: 'REVIEWED_VALID',
  INVESTIGATION_FLAGGED: 'INVESTIGATION_FLAGGED',
  RESOLVED: 'RESOLVED'
} as const;
export type AnomalyStatus = typeof AnomalyStatus[keyof typeof AnomalyStatus];

export interface DataSourceRecord {
  id: string;
  source_type: SourceType;
  classification: DataClassification;
  provider_name: string;
  external_reference_id?: string | null;
  ingested_at: string;
  ingested_by?: string | null;
  integrity_checksum?: string | null;
  metadata_json?: string | null;
}

export interface MetricResult {
  metric_name: string;
  value_percentage: number;
  numerator: number;
  denominator: number;
  formula: string;
  data_classification: DataClassification;
  computed_at: string;
  metadata?: Record<string, unknown>;
}
