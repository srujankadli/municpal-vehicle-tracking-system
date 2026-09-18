import React, { type ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  ariaLabel?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  style,
  disabled,
  ariaLabel,
  ...rest
}: ButtonProps) {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: 'var(--color-primary)',
          color: 'var(--color-primary-foreground)',
          borderColor: 'var(--color-primary)'
        };
      case 'secondary':
        return {
          backgroundColor: 'var(--color-surface-subtle)',
          color: 'var(--color-text-primary)',
          borderColor: 'var(--color-border)'
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: 'var(--color-primary)',
          borderColor: 'var(--color-border)'
        };
      case 'danger':
        return {
          backgroundColor: 'var(--color-danger)',
          color: '#ffffff',
          borderColor: 'var(--color-danger)'
        };
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return { padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--text-xs)' };
      case 'lg':
        return { padding: 'var(--space-3) var(--space-6)', fontSize: 'var(--text-base)' };
      case 'md':
      default:
        return { padding: 'var(--space-2) var(--space-4)', fontSize: 'var(--text-sm)' };
    }
  };

  return (
    <button
      disabled={disabled}
      aria-label={ariaLabel || rest['aria-label']}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        fontFamily: 'inherit',
        fontWeight: 500,
        borderRadius: 'var(--radius-sm)',
        borderWidth: '1px',
        borderStyle: 'solid',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        minWidth: 0,
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style
      }}
      {...rest}
    >
      {icon && <span style={{ display: 'inline-flex', flexShrink: 0 }} aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
