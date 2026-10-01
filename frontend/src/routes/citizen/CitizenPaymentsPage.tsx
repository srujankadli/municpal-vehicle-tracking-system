import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { apiClient, ApiClientError } from '../../api/client';
import type { PaymentObligation, ResidentPayment } from '../../types/citizen';
import { Panel } from '../../components/ui/Panel';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Building,
  AlertCircle,
  X,
  ExternalLink
} from 'lucide-react';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';

export const CitizenPaymentsPage: React.FC = () => {
  const { t, formatCurrency, formatDate, formatTime } = useTranslation();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [obligations, setObligations] = useState<PaymentObligation[]>([]);
  const [payments, setPayments] = useState<ResidentPayment[]>([]);

  // Payment Initiation Modal State
  const [activeModalObligation, setActiveModalObligation] = useState<PaymentObligation | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'UPI' | 'NET_BANKING' | 'CARD' | 'AUTHORIZED_COUNTER'>('UPI');
  const [initiating, setInitiating] = useState(false);
  const [initiationResult, setInitiationResult] = useState<ResidentPayment | null>(null);
  const [initiationError, setInitiationError] = useState<string | null>(null);

  const modalContainerRef = useModalFocusTrap({
    isOpen: !!activeModalObligation,
    onClose: () => {
      setActiveModalObligation(null);
      setInitiationResult(null);
      setInitiationError(null);
    }
  });

  const householdId = session?.householdId;

  const loadFinancialData = useCallback(async () => {
    if (!householdId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch obligations (Anti-IDOR protected)
      const obRes = await apiClient.get<{ obligations: PaymentObligation[] }>(
        `/finance/obligations/${householdId}`
      );
      setObligations(obRes.obligations || []);

      // 2. Fetch payment history (Anti-IDOR protected)
      const payRes = await apiClient.get<{ payments: ResidentPayment[] }>(
        `/finance/payments/${householdId}`
      );
      setPayments(payRes.payments || []);
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
    loadFinancialData();
  }, [loadFinancialData]);

  const handleInitiatePayment = async () => {
    if (!householdId || !activeModalObligation) return;

    try {
      setInitiating(true);
      setInitiationError(null);
      setInitiationResult(null);

      const idempotencyKey = `IDEM-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const res = await apiClient.post<{
        success: boolean;
        payment: ResidentPayment;
        data_classification: string;
      }>('/finance/payments/initiate', {
        household_id: householdId,
        obligation_id: activeModalObligation.id,
        amount_paise: activeModalObligation.amount_paise,
        payment_method: selectedMethod,
        idempotency_key: idempotencyKey
      });

      // Crucial verification invariant: Payment status returned by backend is INITIATED.
      // Frontend NEVER marks payment SUCCESSFUL on button click!
      setInitiationResult(res.payment);
      await loadFinancialData();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setInitiationError(err.message);
      } else {
        setInitiationError(t('errors.networkError'));
      }
    } finally {
      setInitiating(false);
    }
  };

  const closeModal = () => {
    setActiveModalObligation(null);
    setInitiationResult(null);
    setInitiationError(null);
  };

  useEffect(() => {
    if (!activeModalObligation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModalObligation]);

  if (!householdId) {
    return (
      <Panel title={t('portals.citizen.paymentsTitle')}>
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
          {t('portals.citizen.paymentsTitle')}
        </h3>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          {t('portals.citizen.paymentsSubtitle')}
        </p>
      </div>

      {error && <Alert type="danger" message={error} />}

      {/* Active Payment Obligations */}
      <Panel title={t('portals.citizen.obligationsTitle')}>
        {loading ? (
          <LoadingSpinner text={t('common.loading')} />
        ) : obligations.length === 0 ? (
          <EmptyState
            title={t('portals.citizen.noObligations')}
            description={t('portals.citizen.paymentsSubtitle')}
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
                    {t('portals.citizen.billingPeriod')}
                  </th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    Type
                  </th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.beneficiary')}
                  </th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.amount')}
                  </th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {obligations.map((ob) => (
                  <tr key={ob.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {ob.billing_period}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem' }}>
                      <code style={{ fontSize: '0.75rem', padding: '2px 4px', backgroundColor: 'var(--color-surface-subtle)' }}>
                        {ob.obligation_type}
                      </code>
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.75rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {ob.beneficiary_driver_name
                          ? `Assigned Driver — ${ob.beneficiary_driver_name} (${ob.beneficiary_driver_code || 'EMP-DRV'})`
                          : 'Assigned Collection Driver'}
                      </div>
                      {ob.assigned_vehicle_reg && (
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                          Vehicle: {ob.assigned_vehicle_reg} • Route: {ob.assigned_route_name || 'Assigned Route'}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: '0.9375rem' }}>
                      {formatCurrency(ob.amount_paise)}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem' }}>
                      <Button
                        variant="primary"
                        onClick={() => {
                          setActiveModalObligation(ob);
                          setInitiationResult(null);
                          setInitiationError(null);
                        }}
                        style={{ fontSize: '0.75rem', padding: '0.3125rem 0.625rem' }}
                      >
                        <CreditCard size={14} aria-hidden="true" />
                        <span>{t('portals.citizen.payNow')}</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Payment History & Receipts */}
      <Panel title={t('portals.citizen.paymentHistoryTitle')}>
        {loading ? (
          <LoadingSpinner text={t('common.loading')} />
        ) : payments.length === 0 ? (
          <EmptyState
            title={t('portals.citizen.noPayments')}
            description={t('portals.citizen.paymentsSubtitle')}
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
                    {t('portals.citizen.amount')}
                  </th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.paymentMethod')}
                  </th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.txnRef')}
                  </th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    Payment Status
                  </th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.reconciliation')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.625rem 0.75rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formatDate(p.initiated_at)} {formatTime(p.initiated_at)}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(p.amount_paise)}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-surface-subtle)', border: '1px solid var(--color-border)' }}>
                        {p.payment_method}
                      </span>
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {p.transaction_ref || 'Pending Gateway'}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem' }}>
                      <StatusBadge category="payment" status={p.status} />
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.75rem' }}>
                      {p.reconciliation_status === 'MATCHED' ? (
                        <span style={{ color: 'var(--color-success)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <CheckCircle2 size={12} /> Bank Scroll Corroborated
                        </span>
                      ) : p.reconciliation_status === 'UNMATCHED_AMOUNT' ? (
                        <span style={{ color: 'var(--color-danger)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <AlertCircle size={12} /> Bank Deposit Mismatch
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          Awaiting Bank Statement
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Payment Initiation Modal */}
      {activeModalObligation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1000,
          }}
        >
          <div
            ref={modalContainerRef}
            tabIndex={-1}
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              maxWidth: '520px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CreditCard size={20} color="var(--color-primary)" />
                <h3 id="payment-modal-title" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {t('portals.citizen.modalTitle')}
                </h3>
              </div>
              <button
                onClick={closeModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                aria-label={t('common.cancel')}
              >
                <X size={20} />
              </button>
            </div>

            {/* Simulated Demo Notice */}
            <div
              style={{
                padding: '0.75rem',
                backgroundColor: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                color: '#b45309',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'flex-start',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>
                <strong>DEMO ENVIRONMENT NOTICE:</strong>
                <p style={{ margin: '0.25rem 0 0' }}>
                  {t('portals.citizen.modalDemoNotice')}
                </p>
              </div>
            </div>

            {/* Bill & Driver Beneficiary Summary */}
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'var(--color-surface-subtle)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.625rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block' }}>
                    {t('portals.citizen.billingPeriod')}: {activeModalObligation.billing_period}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {activeModalObligation.obligation_type}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '1.375rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-primary)' }}>
                    {formatCurrency(activeModalObligation.amount_paise)}
                  </span>
                </div>
              </div>

              {/* Explicit Assigned Driver Beneficiary Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', fontSize: '0.8125rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>Beneficiary:</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {activeModalObligation.beneficiary_driver_name
                      ? `Assigned Collection Driver — ${activeModalObligation.beneficiary_driver_name} (${activeModalObligation.beneficiary_driver_code || 'EMP-DRV'})`
                      : 'Assigned Collection Driver'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>Vehicle:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                    {activeModalObligation.assigned_vehicle_reg || 'DL-01-GA-1001'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>Collection Route:</span>
                  <span style={{ color: 'var(--color-text-primary)' }}>
                    {activeModalObligation.assigned_route_name || 'Gandhi Road Main Route'}
                  </span>
                </div>
              </div>
            </div>

            {/* Result state vs Initiation form */}
            {initiationResult ? (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid var(--color-info)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={18} color="var(--color-info)" />
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                    Session Initiated: <code style={{ color: 'var(--color-primary)' }}>{initiationResult.id}</code>
                  </span>
                </div>

                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  <StatusBadge category="payment" status={initiationResult.status} />
                  <p style={{ margin: '0.5rem 0 0' }}>
                    {t('portals.citizen.modalInitiatedNotice', { id: initiationResult.id })}
                  </p>
                </div>

                <Button variant="primary" onClick={closeModal} style={{ alignSelf: 'flex-end', marginTop: '0.5rem' }}>
                  {t('common.cancel')}
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {initiationError && <Alert type="danger" message={initiationError} />}

                <div>
                  <label
                    htmlFor="payment-method-select"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}
                  >
                    {t('portals.citizen.modalMethodLabel')}
                  </label>
                  <select
                    id="payment-method-select"
                    value={selectedMethod}
                    onChange={(e) => setSelectedMethod(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="UPI">UPI (Unified Payments Interface)</option>
                    <option value="NET_BANKING">Net Banking (Nationalized Banks)</option>
                    <option value="CARD">Debit / Credit Card</option>
                    <option value="AUTHORIZED_COUNTER">Authorized Municipal Counter</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <Button variant="outline" onClick={closeModal} disabled={initiating}>
                    {t('common.cancel')}
                  </Button>
                  <Button variant="primary" onClick={handleInitiatePayment} disabled={initiating}>
                    <span>{initiating ? t('portals.citizen.modalProcessing') : t('portals.citizen.modalInitiate')}</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
