import React from 'react';
import { clsx } from 'clsx';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge = ({ children, variant = 'default', size = 'md', className }: BadgeProps) => {
  const variants = {
    default: 'bg-gray-100 text-gray-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
  };
  
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };
  
  return (
    <span className={clsx('inline-flex items-center font-medium rounded-full', variants[variant], sizes[size], className)}>
      {children}
    </span>
  );
};

export const StatusBadge = ({ status }: { status: string }) => {
  const variants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
    CONFIRMED: 'success',
    PENDING: 'warning',
    COMPLETED: 'info',
    CANCELLED: 'danger',
    NO_SHOW: 'danger',
    TRIAL: 'info',
    ACTIVE: 'success',
    EXPIRED: 'warning',
    SUSPENDED: 'danger',
  };

  return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
};
