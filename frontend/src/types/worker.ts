/**
 * Type definitions specifically for Field Worker & Driver Terminals
 * Compliant with Phase 1 Fastify contracts and zero-fabrication standards
 */

export interface WorkerAssignment {
  id: string;
  service_date: string;
  route_id: string;
  vehicle_id: string;
  scheduled_start: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  route_name: string;
  registration_number: string;
}

export type EvidenceType = 
  | 'DOORSTEP_NFC_TAP'
  | 'DOORSTEP_QR_SCAN'
  | 'TIMESTAMPED_PHOTO'
  | 'VEHICLE_PROXIMITY_CORRIDOR'
  | 'SUPERVISOR_PHYSICAL_INSPECTION'
  | 'CITIZEN_AFFIRMATION';

export interface SubmitEvidencePayload {
  household_id: string;
  evidence_type: EvidenceType;
  captured_at: string;
  device_id?: string;
  raw_payload?: Record<string, unknown>;
}

export interface SubmitEvidenceResponse {
  success: boolean;
  evidence_id: string;
  synthesis: {
    status: 'EXPECTED' | 'OBSERVED' | 'EVIDENCE_AVAILABLE' | 'VERIFIED' | 'NOT_VERIFIED' | 'EXCEPTION' | 'DISPUTED';
    evidence_count: number;
    has_grievance: boolean;
    notes?: string;
  };
  anomalies_detected: boolean;
  data_classification: string;
}
