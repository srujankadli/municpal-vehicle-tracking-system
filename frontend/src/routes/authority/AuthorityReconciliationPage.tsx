import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { apiClient } from '../../api/client';
import { Panel } from '../../components/ui/Panel';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { MetricCard } from '../../components/authority/MetricCard';
import { formatCurrency, formatDate, formatTime } from '../../i18n/formatters';
import type {
  PaymentObligation,
  ResidentPayment,
  MasterHousehold,
  MetricResult
} from '../../types/operations';
import {
  CreditCard,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  HelpCircle,
  X,
  FileCheck,
  Building,
  DollarSign,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';

export const AuthorityReconciliationPage: React.FC = () => {
  const { t, locale } = useTranslation();
  const { user } = useAuth();

  const isAuthorityOrAdmin = user?.role === 'AUTHORITY' || user?.role === 'ADMIN';

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // House-based selection (as finance endpoints require household_id)
  const [households, setHouseholds] = useState<MasterHousehold[]>([]);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string>('house-demo-101');

  // Financial records for selected household
  const [obligations, setObligations] = useState<PaymentObligation[]>([]);
  const [payments, setPayments] = useState<ResidentPayment[]>([]);

  // CRR metric directly from backend
  const [crrMetric, setCrrMetric] = useState<MetricResult | null>(null);

  // Reconcile Action Modal
  const [reconcilingPayment, setReconcilingPayment] = useState<ResidentPayment | null>(null);
  const [bankRef, setBankRef] = useState<string>('');
  const [statementAmountRupees, setStatementAmountRupees] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submittingReconcile, setSubmittingReconcile] = useState<boolean>(false);
  const [reconcileFeedback, setReconcileFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const reconcileModalRef = useModalFocusTrap({
    isOpen: !!reconcilingPayment,
    onClose: () => {
      setReconcilingPayment(null);
      setReconcileFeedback(null);
    }
  });

  // Load households list and initial CRR metric
  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [hhRes, crrRes] = await Promise.all([
        apiClient.get<{ households: MasterHousehold[] }>('/api/v1/master/households'),
        apiClient.get<MetricResult>('/api/v1/metrics/collection-reconciliation?billing_period=2026-09')
      ]);

      const hhList = hhRes.households || [];
      setHouseholds(hhList);
      setCrrMetric(crrRes || null);
      if (hhList.length > 0 && !selectedHouseholdId) {
        setSelectedHouseholdId(hhList[0]!.id);
      }
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!reconcilingPayment) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReconcilingPayment(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reconcilingPayment]);

  // Fetch obligations and payments for selected household
  const fetchHouseholdFinancials = async (isRefresh = false) => {
    if (!selectedHouseholdId) return;
    if (isRefresh) setRefreshing(true);
    setError(null);
    setReconcileFeedback(null);

    try {
      const [obRes, payRes] = await Promise.all([
        apiClient.get<{ obligations: PaymentObligation[] }>(`/api/v1/finance/obligations/${selectedHouseholdId}`),
        apiClient.get<{ payments: ResidentPayment[] }>(`/api/v1/finance/payments/${selectedHouseholdId}`)
      ]);

      setObligations(obRes.obligations || []);
      setPayments(payRes.payments || []);
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (selectedHouseholdId) {
      fetchHouseholdFinancials();
    }
  }, [selectedHouseholdId]);

  // Open Reconcile Modal
  const handleOpenReconcile = (payment: ResidentPayment) => {
    setReconcilingPayment(payment);
    setBankRef(`BANK-SCROLL-2026-SEP-${payment.id.substring(0, 4).toUpperCase()}`);
    // Pre-fill statement amount with exact payment amount in rupees
    setStatementAmountRupees((payment.amount_paise / 100).toFixed(2));
    setNotes('Statement line matched against municipal bank scroll.');
    setReconcileFeedback(null);
  };

  // Submit Reconciliation with Bank Scroll
  const handleSubmitReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcilingPayment) return;

    const parsedRupees = parseFloat(statementAmountRupees);
    if (isNaN(parsedRupees) || parsedRupees <= 0) {
      setReconcileFeedback({ type: 'error', message: 'Please provide a valid positive statement amount.' });
      return;
    }

    const statementAmountPaise = Math.round(parsedRupees * 100);

    setSubmittingReconcile(true);
    setReconcileFeedback(null);

    try {
      const res = await apiClient.post<{ success: boolean; reconciliation: any }>(
        '/api/v1/finance/reconcile',
        {
          payment_id: reconcilingPayment.id,
          bank_statement_ref: bankRef.trim(),
          statement_amount_paise: statementAmountPaise,
          notes: notes.trim() || undefined
        }
      );

      const isMismatch = res.reconciliation?.anomalyDetected || res.reconciliation?.status === 'UNMATCHED_AMOUNT';

      if (isMismatch) {
        setReconcileFeedback({
          type: 'error',
          message: t('portals.authority.reconciliation.reconcileDiscrepancy')
        });
      } else {
        setReconcileFeedback({
          type: 'success',
          message: t('portals.authority.reconciliation.reconcileSuccess')
        });
      }

      setReconcilingPayment(null);
      // Refresh current household and CRR metric
      fetchHouseholdFinancials(true);
      const updatedCrr = await apiClient.get<MetricResult>('/api/v1/metrics/collection-reconciliation?billing_period=2026-09');
      setCrrMetric(updatedCrr);
    } catch (err: any) {
      setReconcileFeedback({ type: 'error', message: err.message || t('errors.networkError') });
    } finally {
      setSubmittingReconcile(false);
    }
  };

  const obligationColumns: Column<PaymentObligation>[] = [
    {
      key: 'billing_period',
      header: t('portals.authority.reconciliation.billingPeriod'),
      render: (ob) => (
        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{ob.billing_period}</span>
      )
    },
    {
      key: 'obligation_type',
      header: 'Type',
      render: (ob) => (
        <span style={{ fontSize: '0.8125rem' }}>{ob.obligation_type.replace(/_/g, ' ')}</span>
      )
    },
    {
      key: 'amount_paise',
      header: t('portals.authority.reconciliation.amount'),
      isNumeric: true,
      render: (ob) => (
        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
          {formatCurrency(ob.amount_paise, locale)}
        </span>
      )
    },
    {
      key: 'beneficiary',
      header: 'Beneficiary',
      render: (ob) => (
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {ob.beneficiary_driver_name
            ? `Assigned Driver — ${ob.beneficiary_driver_name} (${ob.beneficiary_driver_code || 'EMP-DRV-001'})`
            : 'Assigned Driver — Ramesh Kumar (EMP-DRV-001)'}
        </span>
      )
    },
    {
      key: 'assignment',
      header: 'Vehicle & Route',
      render: (ob) => (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{ob.assigned_vehicle_reg || 'DL-01-GA-1001'}</span>
          {' • '}
          {ob.assigned_route_name || 'Gandhi Road Main Route'}
        </span>
      )
    }
  ];

  const paymentColumns: Column<ResidentPayment>[] = [
    {
      key: 'id',
      header: 'Payment ID',
      render: (p) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.8125rem' }}>
          {p.id.substring(0, 12)}...
        </span>
      )
    },
    {
      key: 'beneficiary',
      header: 'Beneficiary',
      render: (p) => (
        <div style={{ fontSize: '0.75rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {p.beneficiary_driver_name
              ? `Assigned Driver — ${p.beneficiary_driver_name} (${p.beneficiary_driver_code || 'EMP-DRV-001'})`
              : 'Assigned Driver — Ramesh Kumar (EMP-DRV-001)'}
          </span>
        </div>
      )
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      render: (p) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          {p.assigned_vehicle_reg || 'DL-01-GA-1001'}
        </span>
      )
    },
    {
      key: 'route',
      header: 'Route',
      render: (p) => (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          {p.assigned_route_name || 'Gandhi Road Main Route'}
        </span>
      )
    },
    {
      key: 'amount_paise',
      header: 'Payment',
      isNumeric: true,
      render: (p) => (
        <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
          {formatCurrency(p.amount_paise, locale)}
        </span>
      )
    },
    {
      key: 'payment_method',
      header: 'Payment Instrument',
      render: (p) => (
        <span style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>{p.payment_method}</span>
      )
    },
    {
      key: 'status',
      header: 'Payment State',
      render: (p) => (
        <StatusBadge category="payment" status={p.status} />
      )
    },
    {
      key: 'reconciliation_status',
      header: 'Settlement / Reconciliation',
      render: (p) => {
        if (!p.reconciliation_status) {
          return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>UNRECONCILED</span>;
        }
        const isMatched = p.reconciliation_status === 'MATCHED';
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: isMatched ? 'var(--color-success)' : 'var(--color-danger)'
            }}
          >
            {isMatched ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
            <span>{p.reconciliation_status}</span>
          </span>
        );
      }
    },
    {
      key: 'bank_statement_ref',
      header: t('portals.authority.reconciliation.bankStatementRef'),
      render: (p) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          {p.bank_statement_ref || '—'}
        </span>
      )
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (p) => {
        if (!isAuthorityOrAdmin) {
          return (
            <span
              title={t('portals.authority.reconciliation.reconcileForbidden')}
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-muted)',
                padding: '2px 4px',
                border: '1px dashed var(--color-border)',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              Auditor Only
            </span>
          );
        }

        return (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenReconcile(p)}
            title={t('portals.authority.reconciliation.reconcileAction')}
          >
            <FileCheck size={13} aria-hidden="true" />
            <span>{t('portals.authority.reconciliation.reconcileAction')}</span>
          </Button>
        );
      }
    }
  ];

  if (loading && households.length === 0) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header and Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {t('portals.authority.reconciliation.title')}
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {t('portals.authority.reconciliation.subtitle')}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchHouseholdFinancials(true);
            apiClient.get<MetricResult>('/api/v1/metrics/collection-reconciliation?billing_period=2026-09')
              .then(setCrrMetric)
              .catch(() => {});
          }}
          disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
        >
          <RotateCcw size={14} className={refreshing ? 'spinning' : ''} aria-hidden="true" />
          <span>{refreshing ? t('common.loading') : t('common.retry')}</span>
        </Button>
      </div>

      {error && <Alert type="error" message={error} />}
      {reconcileFeedback && (
        <Alert
          type={reconcileFeedback.type}
          message={reconcileFeedback.message}
        />
      )}

      {/* Disclosures: Provenance & Financial System Boundaries */}
      <Alert
        type="info"
        title={t('shell.demoBanner')}
        message={t('portals.authority.reconciliation.provenanceNotice')}
      />

      <Alert
        type="warning"
        title="Payment Integrity Policy"
        message={t('portals.authority.reconciliation.bankingNotice')}
      />

      {/* CRR Metric Card (Direct backend consumption in integer paise) */}
      <div style={{ maxWidth: '420px' }}>
        <MetricCard
          title={t('portals.authority.reconciliation.crrCardTitle')}
          metric={crrMetric}
          description={t('portals.authority.reconciliation.crrCardSubtitle')}
          caveat={t('portals.authority.reconciliation.crrCardCaveat')}
          unit="paise"
        />
      </div>

      {/* Household Selector */}
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building size={16} style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
            <label htmlFor="household-selector" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              {t('portals.authority.reconciliation.selectHousehold')}:
            </label>
            <select
              id="household-selector"
              value={selectedHouseholdId}
              onChange={(e) => setSelectedHouseholdId(e.target.value)}
              style={{
                padding: '0.4375rem 0.75rem',
                fontSize: '0.8125rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                fontWeight: 600
              }}
            >
              {households.map((hh) => (
                <option key={hh.id} value={hh.id}>
                  {hh.service_uid} &mdash; {hh.resident_name}
                </option>
              ))}
            </select>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Premises ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{selectedHouseholdId}</code>
          </span>
        </div>
      </Panel>

      {/* Obligations Table */}
      <Panel title={t('portals.authority.reconciliation.obligationsTitle')}>
        <DataTable
          columns={obligationColumns}
          data={obligations}
          keyExtractor={(ob) => ob.id}
          caption={t('portals.authority.reconciliation.obligationsTitle')}
          emptyMessage={t('portals.authority.reconciliation.noObligationsFound')}
        />
      </Panel>

      {/* Resident Payments & Reconciliation Table */}
      <Panel title={t('portals.authority.reconciliation.paymentsTitle')}>
        <DataTable
          columns={paymentColumns}
          data={payments}
          keyExtractor={(p) => p.id}
          caption={t('portals.authority.reconciliation.paymentsTitle')}
          emptyMessage={t('portals.authority.reconciliation.noPaymentsFound')}
        />
      </Panel>

      {/* Bank Reconciliation Modal */}
      {reconcilingPayment && (
        <div
          ref={reconcileModalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reconcile-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReconcilingPayment(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              maxWidth: '520px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--color-border)'
              }}
            >
              <h3 id="reconcile-modal-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                {t('portals.authority.reconciliation.reconcileModalTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setReconcilingPayment(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitReconcile}>
              <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Alert
                  type="info"
                  title="Administrative Settlement Corroboration"
                  message={t('portals.authority.reconciliation.reconcileModalNotice')}
                />

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Payment Being Corroborated</span>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    Payment ID: {reconcilingPayment.id}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                    Gateway Settled Amount: <strong>{formatCurrency(reconcilingPayment.amount_paise, locale)}</strong>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="bank-ref-input"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}
                  >
                    {t('portals.authority.reconciliation.bankRefLabel')}
                  </label>
                  <input
                    id="bank-ref-input"
                    type="text"
                    value={bankRef}
                    onChange={(e) => setBankRef(e.target.value)}
                    placeholder={t('portals.authority.reconciliation.bankRefPlaceholder')}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.8125rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-mono)'
                    }}
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="statement-amount-input"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}
                  >
                    {t('portals.authority.reconciliation.statementAmountLabel')}
                  </label>
                  <input
                    id="statement-amount-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={statementAmountRupees}
                    onChange={(e) => setStatementAmountRupees(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.8125rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-mono)'
                    }}
                    required
                  />
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                    Will be stored in exact integer paise ({Math.round((parseFloat(statementAmountRupees) || 0) * 100)} paise) without floating-point error.
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="reconcile-notes-input"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}
                  >
                    {t('portals.authority.reconciliation.notesLabel')}
                  </label>
                  <input
                    id="reconcile-notes-input"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.8125rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)'
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  padding: '0.875rem 1.25rem',
                  borderTop: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem'
                }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setReconcilingPayment(null)}
                  disabled={submittingReconcile}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={submittingReconcile || !bankRef.trim() || !statementAmountRupees}
                >
                  {submittingReconcile ? t('common.loading') : t('portals.authority.reconciliation.submitReconcile')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
