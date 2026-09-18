import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { apiClient, ApiClientError } from '../../api/client';
import type { CitizenComplaint } from '../../types/citizen';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import {
  MessageSquareWarning,
  Send,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  FileText
} from 'lucide-react';

export const CitizenComplaintsPage: React.FC = () => {
  const { t, formatDate, formatTime } = useTranslation();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [disputeAlert, setDisputeAlert] = useState<string | null>(null);

  const [complaints, setComplaints] = useState<CitizenComplaint[]>([]);

  // Form State
  const [serviceDate, setServiceDate] = useState('2026-09-14');
  const [complaintType, setComplaintType] = useState('MISSED_COLLECTION');
  const [remarks, setRemarks] = useState('');

  const householdId = session?.householdId;

  const loadComplaints = useCallback(async () => {
    if (!householdId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      // Backend automatically filters by citizen household_id in session
      const res = await apiClient.get<{ complaints: CitizenComplaint[]; data_classification: string }>(
        '/complaints'
      );
      setComplaints(res.complaints || []);
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(t('errors.networkError'));
      }
    } finally {
      setLoading(false);
    }
  }, [householdId, t]);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!householdId) return;

    if (remarks.trim().length < 5) {
      setError('Please provide at least 5 characters describing the issue.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccessMessage(null);
      setDisputeAlert(null);

      const res = await apiClient.post<{
        success: boolean;
        complaint_id: string;
        dispute_triggered: boolean;
        data_classification: string;
      }>('/complaints', {
        household_id: householdId,
        service_date: serviceDate,
        complaint_type: complaintType,
        resident_remarks: remarks.trim()
      });

      if (res.dispute_triggered) {
        setDisputeAlert(t('portals.citizen.disputeAlert'));
      } else {
        setSuccessMessage(t('portals.citizen.complaintSuccess'));
      }

      setRemarks('');
      await loadComplaints();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(t('errors.networkError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!householdId) {
    return (
      <Panel title={t('portals.citizen.complaintsTitle')}>
        <EmptyState
          title={t('portals.citizen.unassignedHousehold')}
          description={t('portals.citizen.placeholderText')}
        />
      </Panel>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div
        style={{
          padding: '1rem 1.25rem',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {t('portals.citizen.complaintsTitle')}
        </h3>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          {t('portals.citizen.complaintsSubtitle')}
        </p>
      </div>

      {error && <Alert type="danger" message={error} />}
      {successMessage && <Alert type="success" message={successMessage} />}
      {disputeAlert && <Alert type="warning" message={disputeAlert} />}

      {/* Form: Lodge Grievance */}
      <Panel title={t('portals.citizen.lodgeComplaint')}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            <div>
              <label
                htmlFor="complaint-service-date"
                style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}
              >
                {t('portals.citizen.serviceDate')}
              </label>
              <input
                id="complaint-service-date"
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="complaint-type-select"
                style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}
              >
                {t('portals.citizen.complaintType')}
              </label>
              <select
                id="complaint-type-select"
                value={complaintType}
                onChange={(e) => setComplaintType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              >
                <option value="MISSED_COLLECTION">MISSED_COLLECTION — Unserviced Premises</option>
                <option value="PARTIAL_COLLECTION">PARTIAL_COLLECTION — Partial Waste Removed</option>
                <option value="SPILLAGE">SPILLAGE — Waste Spilled on Street</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="complaint-remarks"
              style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}
            >
              {t('portals.citizen.remarksLabel')}
            </label>
            <textarea
              id="complaint-remarks"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={t('portals.citizen.remarksPlaceholder')}
              required
              minLength={5}
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
            style={{ alignSelf: 'flex-start', padding: '0.5rem 1.25rem' }}
          >
            <Send size={16} aria-hidden="true" />
            <span>{submitting ? t('common.loading') : t('portals.citizen.submitComplaint')}</span>
          </Button>
        </form>
      </Panel>

      {/* History of Registered Complaints */}
      <Panel title={t('portals.citizen.complaintHistory')}>
        {loading ? (
          <LoadingSpinner text={t('common.loading')} />
        ) : complaints.length === 0 ? (
          <EmptyState
            title={t('portals.citizen.noComplaints')}
            description={t('portals.citizen.complaintsSubtitle')}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8125rem',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-subtle)' }}>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.filedAt')}
                  </th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.serviceDate')}
                  </th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.complaintType')}
                  </th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.remarksLabel')}
                  </th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.complaintStatus')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.625rem 0.75rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formatDate(c.filed_at)} {formatTime(c.filed_at)}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {c.service_date}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', fontWeight: 500 }}>
                      <code style={{ fontSize: '0.75rem', padding: '2px 4px', backgroundColor: 'var(--color-surface-subtle)' }}>
                        {c.complaint_type}
                      </code>
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', color: 'var(--color-text-primary)', maxWidth: '300px' }}>
                      {c.resident_remarks}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'rgba(234, 179, 8, 0.15)',
                          color: '#b45309',
                          border: '1px solid rgba(234, 179, 8, 0.3)',
                        }}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};
