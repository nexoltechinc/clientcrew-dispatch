export const DISPATCH_JOB_STATUS = {
  UNKNOWN: 'UNKNOWN',
  ADMIN_PREVIEW: 'ADMIN_PREVIEW',
  READY_FOR_TECH: 'READY_FOR_TECH',
  PENDING_ADMIN_CONFIRMATION: 'PENDING_ADMIN_CONFIRMATION',
  PENDING_REVIEW: 'PENDING_REVIEW',
  PENDING: 'PENDING',
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  DELAYED: 'DELAYED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type DispatchJobStatus = typeof DISPATCH_JOB_STATUS[keyof typeof DISPATCH_JOB_STATUS];

const STATUS_ALIASES: Record<string, DispatchJobStatus> = {
  admin_review: DISPATCH_JOB_STATUS.ADMIN_PREVIEW,
  admin_preview: DISPATCH_JOB_STATUS.ADMIN_PREVIEW,
  ready_for_tech: DISPATCH_JOB_STATUS.READY_FOR_TECH,
  ready_for_tech_acceptance: DISPATCH_JOB_STATUS.PENDING,
  pending_admin_confirmation: DISPATCH_JOB_STATUS.PENDING_ADMIN_CONFIRMATION,
  pending_review: DISPATCH_JOB_STATUS.PENDING_REVIEW,
  pending: DISPATCH_JOB_STATUS.PENDING,
  scheduled: DISPATCH_JOB_STATUS.SCHEDULED,
  in_progress: DISPATCH_JOB_STATUS.IN_PROGRESS,
  delayed: DISPATCH_JOB_STATUS.DELAYED,
  completed: DISPATCH_JOB_STATUS.COMPLETED,
  cancelled: DISPATCH_JOB_STATUS.CANCELLED,
};

export function normalizeDispatchJobStatus(value: string | null | undefined): DispatchJobStatus {
  const normalized = (value || '').trim().toLowerCase();
  return STATUS_ALIASES[normalized] ?? DISPATCH_JOB_STATUS.UNKNOWN;
}
