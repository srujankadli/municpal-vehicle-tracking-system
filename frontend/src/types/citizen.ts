/**
 * Domain types for Phase 2.4 - Citizen Public Service Portal
 * Compliant with PROJECT_SPECIFICATION.md v2.3.0
 */

export interface CitizenHousehold {
  id: string;
  route_id: string;
  service_uid: string;
  resident_name: string;
  phone_masked: string;
  address_line: string;
  latitude: number;
  longitude: number;
  nfc_tag_uid?: string;
  qr_code_uid?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CitizenRoute {
  id: string;
  area_id: string;
  code: string;
  name: string;
  path_geojson?: string | null;
}

export interface ServiceSynthesis {
  householdId: string;
  status: 'EXPECTED' | 'OBSERVED' | 'EVIDENCE_AVAILABLE' | 'VERIFIED' | 'NOT_VERIFIED' | 'EXCEPTION' | 'DISPUTED';
  evidenceCount: number;
  hasPhysicalScan: boolean;
  hasProximityObservation: boolean;
  hasResidentComplaint: boolean;
  hasApprovedException: boolean;
  disclosureStatement?: string;
}

export interface CitizenComplaint {
  id: string;
  household_id: string;
  service_date: string;
  complaint_type: string;
  resident_remarks: string;
  status: string;
  filed_at: string;
  resolved_at?: string | null;
  resolution_notes?: string | null;
}

export interface PaymentObligation {
  id: string;
  household_id: string;
  obligation_type: string;
  amount_paise: number;
  billing_period: string;
  beneficiary_type: string;
  is_active: number;
}

export interface ResidentPayment {
  id: string;
  household_id: string;
  obligation_id: string;
  amount_paise: number;
  currency: string;
  payment_method: string;
  provider_name?: string | null;
  transaction_ref?: string | null;
  idempotency_key?: string | null;
  status: string;
  initiated_at: string;
  completed_at?: string | null;
  beneficiary_type?: string | null;
  reconciliation_status?: string | null;
  bank_statement_ref?: string | null;
}
