import React from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { StatusBadge } from '../ui/StatusBadge';
import { formatTime } from '../../i18n/formatters';
import type { WorkerAssignment } from '../../types/worker';
import { Truck, MapPin, Calendar, Clock, CheckCircle2 } from 'lucide-react';

export interface AssignmentCardProps {
  assignment: WorkerAssignment;
  roleName: string;
}

export const AssignmentCard: React.FC<AssignmentCardProps> = ({ assignment, roleName }) => {
  const { t, locale } = useTranslation();

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-primary)',
              display: 'block',
              marginBottom: '0.25rem',
            }}
          >
            Today's Operational Roster &bull; {roleName}
          </span>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
            {assignment.route_name}
          </h2>
        </div>
        <StatusBadge
          category="verification"
          status={
            assignment.status === 'COMPLETED'
              ? 'VERIFIED'
              : assignment.status === 'IN_PROGRESS'
              ? 'OBSERVED'
              : 'EXPECTED'
          }
          customLabel={assignment.status}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem',
          backgroundColor: 'var(--color-surface-subtle)',
          padding: '0.875rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Truck size={18} style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
          <div>
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'block' }}>
              Vehicle Reg
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              {assignment.registration_number}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={18} style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
          <div>
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'block' }}>
              Scheduled Departure
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {formatTime(assignment.scheduled_start, locale)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Calendar size={18} style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
          <div>
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'block' }}>
              Service Date
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {assignment.service_date}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MapPin size={18} style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
          <div>
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'block' }}>
              Route Code
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {assignment.route_id}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
