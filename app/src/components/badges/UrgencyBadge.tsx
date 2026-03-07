import { cn } from '@/lib/utils';
import type { UrgencyLevel } from '@/types';

interface UrgencyBadgeProps {
  urgency: UrgencyLevel;
  className?: string;
}

const urgencyConfig: Record<UrgencyLevel, { label: string; className: string }> = {
  CRITICAL: {
    label: 'Critical',
    className: 'badge-urgency-critical',
  },
  HIGH: {
    label: 'High',
    className: 'badge-urgency-high',
  },
  MEDIUM: {
    label: 'Medium',
    className: 'badge-urgency-medium',
  },
  LOW: {
    label: 'Low',
    className: 'badge-urgency-low',
  },
};

export function UrgencyBadge({ urgency, className }: UrgencyBadgeProps) {
  const config = urgencyConfig[urgency];
  
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
