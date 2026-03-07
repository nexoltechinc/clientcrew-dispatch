import { cn } from '@/lib/utils';
import type { InvoiceState } from '@/types';

interface InvoiceBadgeProps {
  state: InvoiceState;
  className?: string;
}

const stateConfig: Record<InvoiceState, { label: string; className: string }> = {
  NOT_STARTED: {
    label: 'Not Started',
    className: 'badge-invoice-not-started',
  },
  PENDING_APPROVAL: {
    label: 'Pending Approval',
    className: 'badge-invoice-pending',
  },
  CREATING: {
    label: 'Creating',
    className: 'badge-invoice-creating',
  },
  CREATED: {
    label: 'Created',
    className: 'badge-invoice-created',
  },
  VERIFIED: {
    label: 'Verified',
    className: 'badge-invoice-verified',
  },
  NEEDS_MANUAL_VERIFICATION: {
    label: 'Needs Verification',
    className: 'badge-invoice-failed',
  },
  FAILED: {
    label: 'Failed',
    className: 'badge-invoice-failed',
  },
};

export function InvoiceBadge({ state, className }: InvoiceBadgeProps) {
  const config = stateConfig[state];
  
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
