import React from 'react';
import {
  CheckCircle2,
  Eye,
  AlertTriangle,
  XOctagon,
  Clock,
  ShieldAlert,
  FileCheck,
  Ban,
  HelpCircle,
  Truck,
  Wrench,
  Archive,
  PlayCircle,
  RotateCw
} from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

export type StatusCategory = 'verification' | 'payment' | 'anomaly' | 'vehicle' | 'run' | 'queue';

export interface StatusBadgeProps {
  status: string;
  category?: StatusCategory;
  customLabel?: string;
}

export function StatusBadge({ status, category = 'verification', customLabel }: StatusBadgeProps) {
  const { t } = useTranslation();

  // Resolve icon, color tokens, and localized text
  let icon: React.ReactNode = <HelpCircle size={14} aria-hidden="true" />;
  let color = 'var(--color-neutral)';
  let bg = 'var(--color-neutral-bg)';
  let border = 'var(--color-neutral-border)';
  let labelKey = `status.${category}.${status}`;

  switch (status) {
    // Verification Statuses
    case 'VERIFIED':
      icon = <CheckCircle2 size={14} aria-hidden="true" />;
      color = 'var(--color-success)';
      bg = 'var(--color-success-bg)';
      border = 'var(--color-success-border)';
      break;
    case 'OBSERVED':
      icon = <Eye size={14} aria-hidden="true" />;
      color = 'var(--color-info)';
      bg = 'var(--color-info-bg)';
      border = 'var(--color-info-border)';
      break;
    case 'EVIDENCE_AVAILABLE':
      icon = <FileCheck size={14} aria-hidden="true" />;
      color = 'var(--color-info)';
      bg = 'var(--color-info-bg)';
      border = 'var(--color-info-border)';
      break;
    case 'NOT_VERIFIED':
      icon = <XOctagon size={14} aria-hidden="true" />;
      color = 'var(--color-danger)';
      bg = 'var(--color-danger-bg)';
      border = 'var(--color-danger-border)';
      break;
    case 'EXCEPTION':
      icon = <AlertTriangle size={14} aria-hidden="true" />;
      color = 'var(--color-warning)';
      bg = 'var(--color-warning-bg)';
      border = 'var(--color-warning-border)';
      break;
    case 'DISPUTED':
      icon = <ShieldAlert size={14} aria-hidden="true" />;
      color = 'var(--color-disputed)';
      bg = 'var(--color-disputed-bg)';
      border = 'var(--color-disputed-border)';
      break;
    case 'EXPECTED':
      icon = <Clock size={14} aria-hidden="true" />;
      color = 'var(--color-neutral)';
      bg = 'var(--color-neutral-bg)';
      border = 'var(--color-neutral-border)';
      break;

    // Payment Statuses
    case 'SUCCESSFUL':
    case 'RECONCILIATION_MATCHED':
      icon = <CheckCircle2 size={14} aria-hidden="true" />;
      color = 'var(--color-success)';
      bg = 'var(--color-success-bg)';
      border = 'var(--color-success-border)';
      break;
    case 'FAILED':
    case 'RECONCILIATION_MISMATCH':
      icon = <XOctagon size={14} aria-hidden="true" />;
      color = 'var(--color-danger)';
      bg = 'var(--color-danger-bg)';
      border = 'var(--color-danger-border)';
      break;
    case 'INITIATED':
    case 'PENDING_PROVIDER':
      icon = <Clock size={14} aria-hidden="true" />;
      color = 'var(--color-warning)';
      bg = 'var(--color-warning-bg)';
      border = 'var(--color-warning-border)';
      break;
    case 'CANCELLED':
    case 'REFUNDED':
      icon = <Ban size={14} aria-hidden="true" />;
      color = 'var(--color-neutral)';
      bg = 'var(--color-neutral-bg)';
      border = 'var(--color-neutral-border)';
      break;

    // Anomaly Severities
    case 'CRITICAL':
    case 'HIGH':
      icon = <AlertTriangle size={14} aria-hidden="true" />;
      color = 'var(--color-danger)';
      bg = 'var(--color-danger-bg)';
      border = 'var(--color-danger-border)';
      break;
    case 'MEDIUM':
      icon = <AlertTriangle size={14} aria-hidden="true" />;
      color = 'var(--color-warning)';
      bg = 'var(--color-warning-bg)';
      border = 'var(--color-warning-border)';
      break;
    case 'LOW':
      icon = <Clock size={14} aria-hidden="true" />;
      color = 'var(--color-info)';
      bg = 'var(--color-info-bg)';
      border = 'var(--color-info-border)';
      break;

    // Vehicle Statuses
    case 'ACTIVE':
      icon = <Truck size={14} aria-hidden="true" />;
      color = 'var(--color-success)';
      bg = 'var(--color-success-bg)';
      border = 'var(--color-success-border)';
      break;
    case 'MAINTENANCE':
      icon = <Wrench size={14} aria-hidden="true" />;
      color = 'var(--color-warning)';
      bg = 'var(--color-warning-bg)';
      border = 'var(--color-warning-border)';
      break;
    case 'DECOMMISSIONED':
      icon = <Archive size={14} aria-hidden="true" />;
      color = 'var(--color-neutral)';
      bg = 'var(--color-neutral-bg)';
      border = 'var(--color-neutral-border)';
      break;

    // Run / Assignment Statuses
    case 'NOT_STARTED':
    case 'SCHEDULED':
      icon = <Clock size={14} aria-hidden="true" />;
      color = 'var(--color-neutral)';
      bg = 'var(--color-neutral-bg)';
      border = 'var(--color-neutral-border)';
      break;
    case 'IN_PROGRESS':
      icon = <PlayCircle size={14} aria-hidden="true" />;
      color = 'var(--color-info)';
      bg = 'var(--color-info-bg)';
      border = 'var(--color-info-border)';
      break;
    case 'COMPLETED':
      icon = <CheckCircle2 size={14} aria-hidden="true" />;
      color = 'var(--color-success)';
      bg = 'var(--color-success-bg)';
      border = 'var(--color-success-border)';
      break;
    case 'INCOMPLETE':
    case 'ABORTED':
      icon = <XOctagon size={14} aria-hidden="true" />;
      color = 'var(--color-danger)';
      bg = 'var(--color-danger-bg)';
      border = 'var(--color-danger-border)';
      break;

    // Queue Statuses
    case 'QUEUED':
      icon = <Clock size={14} aria-hidden="true" />;
      color = 'var(--color-warning)';
      bg = 'var(--color-warning-bg)';
      border = 'var(--color-warning-border)';
      break;
    case 'SYNCING':
      icon = <RotateCw size={14} aria-hidden="true" />;
      color = 'var(--color-info)';
      bg = 'var(--color-info-bg)';
      border = 'var(--color-info-border)';
      break;
    case 'SYNCED':
      icon = <CheckCircle2 size={14} aria-hidden="true" />;
      color = 'var(--color-success)';
      bg = 'var(--color-success-bg)';
      border = 'var(--color-success-border)';
      break;
  }

  const translatedLabel = customLabel || t(labelKey);

  return (
    <span
      className="status-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: '2px var(--space-2)',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${border}`,
        backgroundColor: bg,
        color: color,
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        lineHeight: 1.3,
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        minWidth: 0
      }}
      title={`${t('a11y.statusIndicatorPrefix')}${translatedLabel}`}
    >
      <span style={{ display: 'inline-flex', flexShrink: 0 }} aria-hidden="true">{icon}</span>
      <span>{translatedLabel}</span>
    </span>
  );
}
