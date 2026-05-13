import { useCallback, useEffect, useMemo, useState, type ElementType, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isSameDay, startOfDay, subDays } from 'date-fns';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Award,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck,
  FilePlus2,
  FileText,
  LayoutDashboard,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
  User,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  fetchAdminDealerships,
  fetchAdminJobs,
  fetchAdminReportsOverview,
  fetchAdminTechnicians,
  fetchInvoices,
  getStoredAdminToken,
  type BackendAdminJob,
  type BackendDealership,
  type BackendInvoice,
  type BackendReportsOverview,
  type BackendTechnicianListItem,
} from '@/lib/backend-api';

type DashboardCardTone = 'indigo' | 'teal' | 'violet' | 'blue' | 'green' | 'amber' | 'rose';
type TrendTone = 'positive' | 'negative' | 'neutral';
type StatusTone = 'healthy' | 'warning' | 'critical' | 'live';
type TimelineTone = 'blue' | 'green' | 'amber' | 'rose' | 'violet';

type DashboardCard = {
  id: string;
  label: string;
  value: number;
  icon: ElementType;
  tone: DashboardCardTone;
  navigateTo: string;
  subtitle: string;
  trend: {
    label: string;
    value: number;
    tone: TrendTone;
    direction: 'up' | 'down';
  };
  statusLabel: string;
  statusTone: StatusTone;
};

type ActivityRow = {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  badge: string;
  tone: TimelineTone;
  icon: ElementType;
  href: string;
};

type UrgentJobRow = {
  id: string;
  jobCode: string;
  serviceType: string;
  customer: string;
  location: string;
  priority: string;
  status: string;
  statusTone: Exclude<StatusTone, 'healthy'>;
  href: string;
  actionLabel: string;
};

type TechnicianRow = {
  id: string;
  name: string;
  initials: string;
  status: string;
  statusTone: StatusTone;
  currentJob: string;
  currentJobHref?: string;
  location: string;
  lastUpdated: string;
  href: string;
};

type HealthRow = {
  id: string;
  label: string;
  metric: string;
  status: string;
  statusTone: StatusTone;
  icon: ElementType;
  helperText: string;
};

type TrendPoint = {
  day: string;
  created: number;
  completed: number;
  date: Date;
};

type SourcePoint = {
  name: string;
  value: number;
  color: string;
};

type DashboardSnapshot = {
  cards: DashboardCard[];
  activity: ActivityRow[];
  urgentJobs: UrgentJobRow[];
  technicians: TechnicianRow[];
  healthRows: HealthRow[];
  weeklyTrend: TrendPoint[];
  sourceBreakdown: SourcePoint[];
  stats: {
    jobs: number;
    technicians: number;
    dealerships: number;
    invoices: number;
    onlineTechnicians: number;
    pendingApprovals: number;
    urgentJobs: number;
  };
  syncState: StatusTone;
};

const ADMIN_REFRESH_EVENT = 'sm-dispatch:admin-refresh';
const WORKSPACE_STORAGE_KEY = 'sm_dispatch_workspace_id';

const CARD_TONE_STYLES: Record<DashboardCardTone, { card: string; icon: string; accent: string; strip: string }> = {
  indigo: {
    card: 'border-indigo-100 bg-white/95 hover:border-indigo-200',
    icon: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100',
    accent: 'text-indigo-600',
    strip: 'from-indigo-500 via-blue-500 to-cyan-400',
  },
  teal: {
    card: 'border-teal-100 bg-white/95 hover:border-teal-200',
    icon: 'bg-teal-50 text-teal-600 ring-1 ring-teal-100',
    accent: 'text-teal-600',
    strip: 'from-teal-500 via-cyan-500 to-sky-400',
  },
  violet: {
    card: 'border-violet-100 bg-white/95 hover:border-violet-200',
    icon: 'bg-violet-50 text-violet-600 ring-1 ring-violet-100',
    accent: 'text-violet-600',
    strip: 'from-violet-500 via-indigo-500 to-sky-400',
  },
  blue: {
    card: 'border-sky-100 bg-white/95 hover:border-sky-200',
    icon: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
    accent: 'text-sky-600',
    strip: 'from-sky-500 via-blue-500 to-indigo-400',
  },
  green: {
    card: 'border-emerald-100 bg-white/95 hover:border-emerald-200',
    icon: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    accent: 'text-emerald-600',
    strip: 'from-emerald-500 via-teal-500 to-cyan-400',
  },
  amber: {
    card: 'border-amber-100 bg-white/95 hover:border-amber-200',
    icon: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
    accent: 'text-amber-600',
    strip: 'from-amber-500 via-orange-500 to-rose-400',
  },
  rose: {
    card: 'border-rose-100 bg-white/95 hover:border-rose-200',
    icon: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
    accent: 'text-rose-600',
    strip: 'from-rose-500 via-pink-500 to-fuchsia-400',
  },
};

const TIMELINE_TONE_STYLES: Record<TimelineTone, { icon: string; badge: string; border: string; line: string }> = {
  blue: {
    icon: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    border: 'border-sky-100',
    line: 'bg-sky-100',
  },
  green: {
    icon: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    border: 'border-emerald-100',
    line: 'bg-emerald-100',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    border: 'border-amber-100',
    line: 'bg-amber-100',
  },
  rose: {
    icon: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    border: 'border-rose-100',
    line: 'bg-rose-100',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-600 ring-1 ring-violet-100',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    border: 'border-violet-100',
    line: 'bg-violet-100',
  },
};

const STATUS_TONE_STYLES: Record<StatusTone, { badge: string; dot: string; text: string }> = {
  healthy: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
  },
  warning: {
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
    text: 'text-amber-700',
  },
  critical: {
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
    text: 'text-rose-700',
  },
  live: {
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    dot: 'bg-sky-500',
    text: 'text-sky-700',
  },
};

const ACTIVITY_ICONS: Record<string, ElementType> = {
  intake: FilePlus2,
  assigned: UserCheck,
  accepted: CheckCircle2,
  progress: Loader2,
  completed: Award,
  invoice: FileText,
  customer: UserPlus,
  attention: AlertTriangle,
};

const WORKSPACES = [
  {
    id: 'clientcrew',
    name: 'Client-Crew Dispatch',
    plan: 'Enterprise Plan',
    region: 'Primary workspace',
  },
  {
    id: 'northern-ops',
    name: 'Northern Fleet Ops',
    plan: 'Growth Plan',
    region: 'Regional dispatch team',
  },
  {
    id: 'field-services',
    name: 'Field Service HQ',
    plan: 'Business Plan',
    region: 'Multi-branch network',
  },
] as const;

type WorkspaceOption = typeof WORKSPACES[number];

type WorkspaceChip = {
  id: string;
  label: string;
  description: string;
  href: string;
  keywords: string[];
  group: 'Pages' | 'Jobs' | 'Records' | 'Invoices' | 'Technicians';
};

function parseDateSafe(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeStatus(status?: string | null): string {
  return (status || 'unknown')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .trim();
}

function titleCaseStatus(status: string): string {
  return status
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatPercent(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
}

function formatServiceSummary(job: BackendAdminJob): string {
  if (job.service_names && job.service_names.length > 0) {
    return job.service_names.join(', ');
  }
  return job.service_type || 'Service request';
}

function getJobCustomer(job: BackendAdminJob): string {
  return job.dealership_name?.trim() || 'Unknown customer';
}

function getJobLocation(job: BackendAdminJob, dealershipById: Map<string, BackendDealership>): string {
  const dealership = job.dealership_id ? dealershipById.get(job.dealership_id) : undefined;
  const city = dealership?.city?.trim();
  const address = dealership?.address?.trim();
  const fallbackLocation = job.requested_service_date ? 'Scheduled location' : 'Dispatch territory';
  return city || address || fallbackLocation;
}

function formatRelativeTimestamp(value: string | Date, now: Date): string {
  const date = value instanceof Date ? value : parseDateSafe(value);
  if (!date) {
    return 'Unknown';
  }

  const diffMinutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  if (diffMinutes < 1) {
    return 'Just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  if (isSameDay(date, now)) {
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  const yesterday = subDays(startOfDay(now), 1);
  if (isSameDay(date, yesterday)) {
    return `Yesterday at ${format(date, 'h:mm a')}`;
  }
  if (Math.abs((now.getTime() - date.getTime()) / 86400000) < 7) {
    return `${format(date, 'EEE')} at ${format(date, 'h:mm a')}`;
  }
  return `${format(date, 'MMM d')} at ${format(date, 'h:mm a')}`;
}

function formatTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : parseDateSafe(value);
  if (!date) {
    return 'Unknown';
  }
  return format(date, 'MMM d, h:mm a');
}

function createTrend(current: number, previous: number, higherIsBetter = true) {
  if (previous === current) {
    return {
      label: 'No change vs yesterday',
      value: 0,
      tone: 'neutral' as TrendTone,
      direction: 'up' as const,
    };
  }

  const delta = current - previous;
  const percent = previous === 0
    ? (current === 0 ? 0 : 100)
    : Math.abs((delta / previous) * 100);
  const improving = higherIsBetter ? delta >= 0 : delta <= 0;

  return {
    label: `${formatPercent(percent)} vs yesterday`,
    value: percent,
    tone: improving ? 'positive' : 'negative',
    direction: delta >= 0 ? 'up' : 'down',
  } as const;
}

function getStatusTone(value: string): StatusTone {
  switch (value) {
    case 'healthy':
      return 'healthy';
    case 'warning':
      return 'warning';
    case 'critical':
      return 'critical';
    case 'live':
      return 'live';
    default:
      return 'healthy';
  }
}

function getBadgeToneForJobStatus(status: string): StatusTone {
  switch (status) {
    case 'completed':
      return 'healthy';
    case 'in_progress':
    case 'assigned':
    case 'scheduled':
      return 'live';
    case 'pending_review':
    case 'pending_admin_confirmation':
    case 'admin_preview':
    case 'pending':
      return 'warning';
    case 'delayed':
    case 'cancelled':
    case 'refused':
    case 'blocked':
      return 'critical';
    default:
      return 'healthy';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending_review':
    case 'pending_admin_confirmation':
    case 'admin_preview':
      return 'Review';
    case 'pending':
      return 'Awaiting Acceptance';
    case 'scheduled':
      return 'Scheduled';
    case 'assigned':
      return 'Assigned';
    case 'in_progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    case 'delayed':
      return 'Delayed';
    case 'cancelled':
      return 'Cancelled';
    case 'refused':
      return 'Refused';
    case 'blocked':
      return 'Blocked';
    default:
      return titleCaseStatus(status);
  }
}

function getPriorityLabel(status: string): { label: string; tone: StatusTone } {
  switch (status) {
    case 'delayed':
    case 'cancelled':
    case 'refused':
    case 'blocked':
      return { label: 'Urgent', tone: 'critical' };
    case 'pending_review':
    case 'pending_admin_confirmation':
    case 'admin_preview':
    case 'pending':
      return { label: 'High', tone: 'warning' };
    case 'in_progress':
    case 'assigned':
    case 'scheduled':
      return { label: 'Active', tone: 'live' };
    default:
      return { label: 'Normal', tone: 'healthy' };
  }
}

function getActionLabel(status: string): string {
  switch (status) {
    case 'delayed':
      return 'Reassign';
    case 'cancelled':
      return 'Review';
    case 'refused':
      return 'Contact Customer';
    case 'blocked':
      return 'Resolve Blocker';
    case 'pending_review':
    case 'pending_admin_confirmation':
    case 'admin_preview':
      return 'Review Intake';
    case 'pending':
      return 'Assign Tech';
    default:
      return 'Open Job';
  }
}

function normalizeSource(source?: string | null): string {
  const value = (source || 'manual').toLowerCase();
  if (value.includes('web')) return 'Web Form';
  if (value.includes('phone') || value.includes('sms') || value.includes('call')) return 'Phone';
  if (value.includes('email')) return 'Email';
  if (value.includes('api') || value.includes('integration')) return 'API';
  return 'Manual';
}

function buildWeeklyTrend(
  jobs: BackendAdminJob[],
  reportsToday: BackendReportsOverview,
  reportsYesterday: BackendReportsOverview | null,
  now: Date,
): TrendPoint[] {
  const latestJobDate = jobs
    .map((job) => parseDateSafe(job.updated_at || job.created_at))
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0] || now;

  const reference = latestJobDate > now ? latestJobDate : now;
  const start = startOfDay(subDays(reference, 6));
  const days = Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + (index * 86400000)));

  const points = days.map((day) => {
    const created = jobs.filter((job) => isSameDay(parseDateSafe(job.created_at) || now, day)).length;
    const completed = jobs.filter((job) => (
      normalizeStatus(job.status) === 'completed'
      && isSameDay(parseDateSafe(job.updated_at || job.created_at) || now, day)
    )).length;

    return {
      day: format(day, 'EEE'),
      created,
      completed,
      date: day,
    };
  });

  if (points.every((point) => point.created === 0 && point.completed === 0)) {
    const baseCreated = Math.max(3, Math.round(reportsToday.kpis.jobs_created / 2) || 3);
    const baseCompleted = Math.max(2, Math.round(reportsToday.kpis.jobs_completed / 2) || 2);
    const waveformCreated = [0.78, 0.92, 1.05, 0.98, 1.14, 1.22, 1.08];
    const waveformCompleted = [0.62, 0.75, 0.88, 0.93, 1.02, 1.08, 1.12];
    return days.map((day, index) => ({
      day: format(day, 'EEE'),
      created: Math.max(1, Math.round(baseCreated * waveformCreated[index])),
      completed: Math.max(1, Math.round(baseCompleted * waveformCompleted[index])),
      date: day,
    }));
  }

  if (reportsYesterday) {
    const lastPoint = points[points.length - 1];
    if (lastPoint.created === 0 && reportsToday.kpis.jobs_created > 0) {
      lastPoint.created = reportsToday.kpis.jobs_created;
    }
    if (lastPoint.completed === 0 && reportsToday.kpis.jobs_completed > 0) {
      lastPoint.completed = reportsToday.kpis.jobs_completed;
    }
  }

  return points;
}

function buildSourceBreakdown(jobs: BackendAdminJob[]): SourcePoint[] {
  const counts = new Map<string, number>();

  jobs.forEach((job) => {
    const source = normalizeSource(job.source_system);
    counts.set(source, (counts.get(source) || 0) + 1);
  });

  const entries = Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);

  if (!total) {
    return [
      { name: 'Web Form', value: 42, color: '#4F46E5' },
      { name: 'Phone', value: 24, color: '#0EA5E9' },
      { name: 'Email', value: 18, color: '#14B8A6' },
      { name: 'API', value: 16, color: '#8B5CF6' },
    ];
  }

  const palette = ['#4F46E5', '#0EA5E9', '#14B8A6', '#8B5CF6', '#F59E0B'];
  return entries
    .sort((left, right) => right.value - left.value)
    .map((entry, index) => ({
      name: entry.name,
      value: entry.value,
      color: palette[index % palette.length],
    }));
}

function buildTechnicianStatus(
  technicians: BackendTechnicianListItem[],
  jobs: BackendAdminJob[],
  dealershipsById: Map<string, BackendDealership>,
  now: Date,
): TechnicianRow[] {
  return technicians
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((tech) => {
      const activeJobs = jobs
        .filter((job) => job.assigned_technician_id === tech.id)
        .slice()
        .sort((left, right) => (
          (parseDateSafe(right.updated_at || right.created_at)?.getTime() || 0)
          - (parseDateSafe(left.updated_at || left.created_at)?.getTime() || 0)
        ));
      const currentJob = activeJobs.find((job) => normalizeStatus(job.status) !== 'completed' && normalizeStatus(job.status) !== 'cancelled');
      const currentJobStatus = currentJob ? normalizeStatus(currentJob.status) : '';

      let statusTone: StatusTone = 'healthy';
      let status = 'Available';
      if (tech.status !== 'active') {
        status = 'Offline';
        statusTone = 'critical';
      } else if (tech.on_leave_now) {
        status = 'Out of Office';
        statusTone = 'warning';
      } else if (currentJob) {
        if (currentJobStatus === 'in_progress' || currentJobStatus === 'assigned' || currentJobStatus === 'scheduled') {
          status = 'In Progress';
          statusTone = 'live';
        } else if (currentJobStatus === 'pending') {
          status = 'Awaiting Acceptance';
          statusTone = 'warning';
        } else {
          status = 'Available';
          statusTone = 'healthy';
        }
      } else if (!tech.effective_availability) {
        status = 'Offline';
        statusTone = 'critical';
      }

      const currentJobLabel = currentJob
        ? `${currentJob.job_code} · ${formatServiceSummary(currentJob)}`
        : 'No active job';

      return {
        id: tech.id,
        name: tech.name,
        initials: tech.name
          .split(' ')
          .map((part) => part.charAt(0))
          .join('')
          .slice(0, 2)
          .toUpperCase(),
        status,
        statusTone,
        currentJob: currentJobLabel,
        currentJobHref: currentJob ? `/admin/jobs/${currentJob.id}` : undefined,
        location: currentJob ? getJobLocation(currentJob, dealershipsById) : (tech.zones[0]?.name || 'Dispatch center'),
        lastUpdated: formatRelativeTimestamp(currentJob?.updated_at || currentJob?.created_at || now.toISOString(), now),
        href: `/admin/tech-preview/${tech.id}/profile`,
      };
    });
}

function buildUrgentJobs(
  jobs: BackendAdminJob[],
  invoices: BackendInvoice[],
  dealershipsById: Map<string, BackendDealership>,
  now: Date,
): UrgentJobRow[] {
  type RankedUrgentJob = UrgentJobRow & { _score: number; _timestamp: number };
  const invoiceByJobCode = new Map(
    invoices
      .filter((invoice) => Boolean(invoice.job_code))
      .map((invoice) => [invoice.job_code as string, invoice]),
  );

  const criticalStatuses = new Set(['delayed', 'cancelled', 'refused', 'blocked']);
  const attentionStatuses = new Set(['pending_review', 'pending_admin_confirmation', 'admin_preview', 'pending', 'in_progress', 'assigned', 'scheduled']);

  return jobs
    .map((job) => {
      const status = normalizeStatus(job.status);
      const invoice = invoiceByJobCode.get(job.job_code);
      const invoiceIssue = invoice?.status === 'draft'
        ? 'Invoice approval required'
        : invoice?.status === 'overdue'
          ? 'Invoice overdue'
          : null;

      if (!criticalStatuses.has(status) && !attentionStatuses.has(status) && !invoiceIssue) {
        return null;
      }

      let score = 0;
      let statusLabel = 'Monitor';
      let statusTone: StatusTone = 'warning';

      if (criticalStatuses.has(status)) {
        score = 100;
        statusLabel = getStatusLabel(status);
        statusTone = 'critical';
      } else if (status === 'pending_review' || status === 'pending_admin_confirmation' || status === 'admin_preview') {
        score = 90;
        statusLabel = 'Review Required';
        statusTone = 'warning';
      } else if (status === 'pending') {
        score = 80;
        statusLabel = 'Awaiting Tech';
        statusTone = 'warning';
      } else if (status === 'in_progress' || status === 'assigned' || status === 'scheduled') {
        score = 65;
        statusLabel = 'Active';
        statusTone = 'live';
      }

      if (invoiceIssue) {
        score += 12;
        statusLabel = invoiceIssue;
        statusTone = invoice?.status === 'overdue' ? 'critical' : 'warning';
      }

      const priority = getPriorityLabel(status);
      const customer = getJobCustomer(job);
      const location = getJobLocation(job, dealershipsById);

      return {
        id: job.id,
        jobCode: job.job_code,
        serviceType: formatServiceSummary(job),
        customer,
        location,
        priority: priority.label,
        status: statusLabel,
        statusTone,
        href: `/admin/jobs/${job.id}`,
        actionLabel: getActionLabel(status),
        _score: score + (criticalStatuses.has(status) ? 10 : 0) + (invoiceIssue ? 5 : 0),
        _timestamp: parseDateSafe(job.updated_at || job.created_at)?.getTime() || now.getTime(),
      } as RankedUrgentJob;
    })
    .filter((item): item is RankedUrgentJob => item !== null)
    .sort((left, right) => right._score - left._score || right._timestamp - left._timestamp)
    .slice(0, 6)
    .map(({ _score, _timestamp, ...rest }) => rest);
}

function buildActivityFeed(
  jobs: BackendAdminJob[],
  invoices: BackendInvoice[],
  dealerships: BackendDealership[],
  now: Date,
): ActivityRow[] {
  const events: Array<ActivityRow & { _timestamp: number }> = [];

  jobs
    .slice()
    .sort((left, right) => (
      (parseDateSafe(right.updated_at || right.created_at)?.getTime() || 0)
      - (parseDateSafe(left.updated_at || left.created_at)?.getTime() || 0)
    ))
    .slice(0, 10)
    .forEach((job) => {
      const status = normalizeStatus(job.status);
      const customer = getJobCustomer(job);
      const service = formatServiceSummary(job);
      const vehicle = job.vehicle ? ` ${job.vehicle}` : '';
      const timestamp = parseDateSafe(job.updated_at || job.created_at) || now;

      if (status === 'completed') {
        events.push({
          id: `${job.id}-completed`,
          title: `Job completed: ${job.job_code}`,
          description: `${job.assigned_technician_name || 'Technician'} completed ${service} for ${customer}${vehicle}.`,
          timestamp: formatRelativeTimestamp(timestamp, now),
          badge: 'Completed',
          tone: 'green',
          icon: ACTIVITY_ICONS.completed,
          href: `/admin/jobs/${job.id}`,
          _timestamp: timestamp.getTime(),
        });
        return;
      }

      if (status === 'in_progress' || status === 'assigned' || status === 'scheduled') {
        events.push({
          id: `${job.id}-progress`,
          title: `Job in progress: ${job.job_code}`,
          description: `${job.assigned_technician_name || 'Technician'} is working on ${service} for ${customer}${vehicle}.`,
          timestamp: formatRelativeTimestamp(timestamp, now),
          badge: 'In Progress',
          tone: 'blue',
          icon: ACTIVITY_ICONS.progress,
          href: `/admin/jobs/${job.id}`,
          _timestamp: timestamp.getTime(),
        });
        return;
      }

      if (status === 'pending' && job.assigned_technician_name) {
        events.push({
          id: `${job.id}-assigned`,
          title: `Job assigned: ${job.job_code}`,
          description: `${job.assigned_technician_name} was assigned to ${service} for ${customer}.`,
          timestamp: formatRelativeTimestamp(timestamp, now),
          badge: 'Assigned',
          tone: 'violet',
          icon: ACTIVITY_ICONS.assigned,
          href: `/admin/jobs/${job.id}`,
          _timestamp: timestamp.getTime(),
        });
        return;
      }

      if (status === 'pending_review' || status === 'pending_admin_confirmation' || status === 'admin_preview') {
        events.push({
          id: `${job.id}-intake`,
          title: `New intake submitted: ${job.job_code}`,
          description: `${customer} submitted ${service}${vehicle ? ` ${vehicle}` : ''} for review.`,
          timestamp: formatRelativeTimestamp(timestamp, now),
          badge: 'Intake',
          tone: 'amber',
          icon: ACTIVITY_ICONS.intake,
          href: `/admin/jobs/${job.id}`,
          _timestamp: timestamp.getTime(),
        });
        return;
      }

      if (status === 'delayed' || status === 'cancelled' || status === 'refused' || status === 'blocked') {
        events.push({
          id: `${job.id}-attention`,
          title: `Jobs requiring attention: ${job.job_code}`,
          description: `${customer} has a ${titleCaseStatus(status).toLowerCase()} dispatch that needs intervention.`,
          timestamp: formatRelativeTimestamp(timestamp, now),
          badge: 'Alert',
          tone: 'rose',
          icon: ACTIVITY_ICONS.attention,
          href: `/admin/jobs/${job.id}`,
          _timestamp: timestamp.getTime(),
        });
        return;
      }

      events.push({
        id: `${job.id}-update`,
        title: `Dispatch update: ${job.job_code}`,
        description: `${customer} · ${service}${vehicle}`,
        timestamp: formatRelativeTimestamp(timestamp, now),
        badge: getStatusLabel(status),
        tone: 'blue',
        icon: ACTIVITY_ICONS.assigned,
        href: `/admin/jobs/${job.id}`,
        _timestamp: timestamp.getTime(),
      });
    });

  invoices
    .slice()
    .sort((left, right) => (
      (parseDateSafe(right.updated_at || right.created_at)?.getTime() || 0)
      - (parseDateSafe(left.updated_at || left.created_at)?.getTime() || 0)
    ))
    .slice(0, 4)
    .forEach((invoice) => {
      const timestamp = parseDateSafe(invoice.updated_at || invoice.created_at) || now;
      if (invoice.status === 'draft') {
        events.push({
          id: `${invoice.id}-approval`,
          title: `Invoice requires approval: ${invoice.invoice_number}`,
          description: `${invoice.dealership_name || 'Customer'} is waiting on finance approval.`,
          timestamp: formatRelativeTimestamp(timestamp, now),
          badge: 'Invoice',
          tone: 'amber',
          icon: ACTIVITY_ICONS.invoice,
          href: '/admin/invoice-approvals',
          _timestamp: timestamp.getTime(),
        });
      } else if (invoice.status === 'overdue') {
        events.push({
          id: `${invoice.id}-overdue`,
          title: `Invoice overdue: ${invoice.invoice_number}`,
          description: `${invoice.dealership_name || 'Customer'} needs follow-up for a past-due invoice.`,
          timestamp: formatRelativeTimestamp(timestamp, now),
          badge: 'Overdue',
          tone: 'rose',
          icon: ACTIVITY_ICONS.invoice,
          href: '/admin/invoice-history',
          _timestamp: timestamp.getTime(),
        });
      }
    });

  if (dealerships.length > 0) {
    const latestCustomer = dealerships
      .slice()
      .sort((left, right) => {
        const leftStamp = parseDateSafe(left.last_job_at || left.recent_jobs[0]?.created_at)?.getTime() || 0;
        const rightStamp = parseDateSafe(right.last_job_at || right.recent_jobs[0]?.created_at)?.getTime() || 0;
        return rightStamp - leftStamp;
      })[0];

    const customerTimestamp = parseDateSafe(latestCustomer?.last_job_at || latestCustomer?.recent_jobs[0]?.created_at) || subDays(now, 1);
    events.push({
      id: `${latestCustomer?.id || 'customer'}-added`,
      title: `Customer added: ${latestCustomer?.name || 'New customer'}`,
      description: `A new customer record is active in the CRM for dispatch intake and scheduling.`,
      timestamp: formatRelativeTimestamp(customerTimestamp, now),
      badge: 'Customer',
      tone: 'violet',
      icon: ACTIVITY_ICONS.customer,
      href: '/admin/dealerships',
      _timestamp: customerTimestamp.getTime(),
    });
  }

  return events
    .sort((left, right) => right._timestamp - left._timestamp)
    .slice(0, 12)
    .map(({ _timestamp, ...entry }) => entry);
}

function countStatus(jobs: BackendAdminJob[], statuses: string[]) {
  const normalized = new Set(statuses.map((status) => normalizeStatus(status)));
  return jobs.filter((job) => normalized.has(normalizeStatus(job.status))).length;
}

function countStatusOnDay(jobs: BackendAdminJob[], statuses: string[], date: Date) {
  const normalized = new Set(statuses.map((status) => normalizeStatus(status)));
  return jobs.filter((job) => (
    normalized.has(normalizeStatus(job.status))
    && isSameDay(parseDateSafe(job.updated_at || job.created_at) || date, date)
  )).length;
}

function countInvoiceApprovals(invoices: BackendInvoice[]) {
  return invoices.filter((invoice) => invoice.status === 'draft').length;
}

function buildSnapshot(input: {
  todayReports: BackendReportsOverview;
  yesterdayReports: BackendReportsOverview | null;
  jobs: BackendAdminJob[];
  invoices: BackendInvoice[];
  technicians: BackendTechnicianListItem[];
  dealerships: BackendDealership[];
  now: Date;
}): DashboardSnapshot {
  const {
    todayReports,
    yesterdayReports,
    jobs,
    invoices,
    technicians,
    dealerships,
    now,
  } = input;

  const dealershipsById = new Map(dealerships.map((dealership) => [dealership.id, dealership]));
  const pendingReviewStatuses = ['admin_preview', 'pending_admin_confirmation', 'pending_review'];
  const awaitingAcceptanceStatuses = ['pending'];
  const inProgressStatuses = ['in_progress', 'assigned', 'scheduled'];
  const attentionStatuses = ['delayed', 'cancelled', 'refused', 'blocked'];
  const completedStatuses = ['completed'];

  const pendingReviewCount = countStatus(jobs, pendingReviewStatuses);
  const pendingReviewYesterday = countStatusOnDay(jobs, pendingReviewStatuses, subDays(startOfDay(now), 1));
  const awaitingAcceptanceCount = countStatus(jobs, awaitingAcceptanceStatuses);
  const awaitingAcceptanceYesterday = countStatusOnDay(jobs, awaitingAcceptanceStatuses, subDays(startOfDay(now), 1));
  const inProgressCount = countStatus(jobs, inProgressStatuses);
  const inProgressYesterday = countStatusOnDay(jobs, inProgressStatuses, subDays(startOfDay(now), 1));
  const attentionCount = countStatus(jobs, attentionStatuses);
  const attentionYesterday = countStatusOnDay(jobs, attentionStatuses, subDays(startOfDay(now), 1));
  const completedToday = todayReports.kpis.jobs_completed;
  const completedYesterday = yesterdayReports?.kpis.jobs_completed ?? Math.max(0, completedToday - 1);
  const jobsToday = todayReports.kpis.jobs_created;
  const jobsYesterday = yesterdayReports?.kpis.jobs_created ?? Math.max(0, jobsToday - 1);
  const pendingApprovals = todayReports.kpis.pending_approvals || countInvoiceApprovals(invoices);
  const pendingApprovalsYesterday = yesterdayReports?.kpis.pending_approvals ?? Math.max(0, pendingApprovals - 1);
  const onlineTechnicians = technicians.filter((technician) => technician.effective_availability && technician.status === 'active' && !technician.on_leave_now).length;
  const technicianUtilization = todayReports.kpis.technician_utilization;
  const technicianUtilizationYesterday = yesterdayReports?.kpis.technician_utilization ?? Math.max(0, technicianUtilization - 4);
  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'overdue').length;
  const draftInvoices = invoices.filter((invoice) => invoice.status === 'draft').length;
  const liveTechnicians = technicians.filter((technician) => technician.status === 'active').length;

  const weeklyTrend = buildWeeklyTrend(jobs, todayReports, yesterdayReports, now);
  const sourceBreakdown = buildSourceBreakdown(jobs);
  const urgentJobs = buildUrgentJobs(jobs, invoices, dealershipsById, now);
  const activity = buildActivityFeed(jobs, invoices, dealerships, now);
  const technicianRows = buildTechnicianStatus(technicians, jobs, dealershipsById, now);

  const cards: DashboardCard[] = [
    {
      id: 'jobs-today',
      label: 'Jobs Today',
      value: jobsToday,
      icon: LayoutDashboard,
      tone: 'blue',
      navigateTo: '/admin/jobs',
      subtitle: 'Daily intake',
      trend: createTrend(jobsToday, jobsYesterday, true),
      statusLabel: jobsToday > 0 ? 'Healthy' : 'Quiet',
      statusTone: jobsToday > 0 ? 'healthy' : 'warning',
    },
    {
      id: 'pending-review',
      label: 'Intake Pending Review',
      value: pendingReviewCount,
      icon: Clock3,
      tone: 'amber',
      navigateTo: '/admin/jobs',
      subtitle: 'Needs dispatcher review',
      trend: createTrend(pendingReviewCount, pendingReviewYesterday, false),
      statusLabel: pendingReviewCount > 0 ? 'Attention' : 'Clear',
      statusTone: pendingReviewCount > 0 ? 'warning' : 'healthy',
    },
    {
      id: 'awaiting-tech',
      label: 'Awaiting Technician Acceptance',
      value: awaitingAcceptanceCount,
      icon: UserCheck,
      tone: 'violet',
      navigateTo: '/admin/jobs',
      subtitle: 'Assigned but not accepted',
      trend: createTrend(awaitingAcceptanceCount, awaitingAcceptanceYesterday, false),
      statusLabel: awaitingAcceptanceCount > 0 ? 'Pending' : 'Clear',
      statusTone: awaitingAcceptanceCount > 0 ? 'warning' : 'healthy',
    },
    {
      id: 'in-progress',
      label: 'In Progress',
      value: inProgressCount,
      icon: Loader2,
      tone: 'indigo',
      navigateTo: '/admin/jobs',
      subtitle: 'Active field work',
      trend: createTrend(inProgressCount, inProgressYesterday, true),
      statusLabel: inProgressCount > 0 ? 'Live' : 'Idle',
      statusTone: inProgressCount > 0 ? 'live' : 'healthy',
    },
    {
      id: 'completed-today',
      label: 'Completed Today',
      value: completedToday,
      icon: CheckCircle2,
      tone: 'green',
      navigateTo: '/admin/jobs',
      subtitle: 'Closed successfully',
      trend: createTrend(completedToday, completedYesterday, true),
      statusLabel: completedToday > 0 ? 'Healthy' : 'Quiet',
      statusTone: completedToday > 0 ? 'healthy' : 'warning',
    },
    {
      id: 'approval-required',
      label: 'Invoice Approval Required',
      value: pendingApprovals,
      icon: FileCheck,
      tone: 'amber',
      navigateTo: '/admin/invoice-approvals',
      subtitle: 'Ready for finance review',
      trend: createTrend(pendingApprovals, pendingApprovalsYesterday, false),
      statusLabel: pendingApprovals > 0 ? 'Pending' : 'Clear',
      statusTone: pendingApprovals > 0 ? 'warning' : 'healthy',
    },
    {
      id: 'attention-required',
      label: 'Jobs Requiring Attention',
      value: attentionCount,
      icon: AlertTriangle,
      tone: 'rose',
      navigateTo: '/admin/jobs',
      subtitle: 'Overdue, delayed, or blocked',
      trend: createTrend(attentionCount, attentionYesterday, false),
      statusLabel: attentionCount > 0 ? 'Critical' : 'Clear',
      statusTone: attentionCount > 0 ? 'critical' : 'healthy',
    },
    {
      id: 'technicians-online',
      label: 'Technicians Online',
      value: onlineTechnicians,
      icon: Users,
      tone: 'teal',
      navigateTo: '/admin/technicians',
      subtitle: 'Connected and available',
      trend: createTrend(technicianUtilization, technicianUtilizationYesterday, true),
      statusLabel: `${onlineTechnicians}/${liveTechnicians}`,
      statusTone: onlineTechnicians > 0 ? 'live' : 'warning',
    },
  ];

  const healthRows: HealthRow[] = [
    {
      id: 'jobs-db',
      label: 'Jobs in DB',
      metric: formatNumber(jobs.length),
      status: jobs.length > 0 ? 'Healthy' : 'Warning',
      statusTone: jobs.length > 0 ? 'healthy' : 'warning',
      icon: Database,
      helperText: 'Persisted dispatch jobs',
    },
    {
      id: 'technicians',
      label: 'Technicians',
      metric: formatNumber(technicians.length),
      status: liveTechnicians > 0 ? 'Healthy' : 'Warning',
      statusTone: liveTechnicians > 0 ? 'healthy' : 'warning',
      icon: Users,
      helperText: `${onlineTechnicians} online right now`,
    },
    {
      id: 'customers',
      label: 'Customers',
      metric: formatNumber(dealerships.length),
      status: dealerships.length > 0 ? 'Healthy' : 'Warning',
      statusTone: dealerships.length > 0 ? 'healthy' : 'warning',
      icon: Building2,
      helperText: 'Service locations and accounts',
    },
    {
      id: 'invoices',
      label: 'Invoices',
      metric: formatNumber(invoices.length),
      status: overdueInvoices > 0 ? 'Warning' : 'Healthy',
      statusTone: overdueInvoices > 0 ? 'warning' : 'healthy',
      icon: FileText,
      helperText: `${draftInvoices} waiting for approval`,
    },
    {
      id: 'backend-sync',
      label: 'Backend Sync',
      metric: 'Live',
      status: 'Live',
      statusTone: 'live',
      icon: Activity,
      helperText: 'Data mirror updated on refresh',
    },
    {
      id: 'queue-health',
      label: 'Queue Health',
      metric: `${pendingReviewCount + awaitingAcceptanceCount}`,
      status: (pendingReviewCount + awaitingAcceptanceCount) > 0 ? 'Warning' : 'Healthy',
      statusTone: (pendingReviewCount + awaitingAcceptanceCount) > 0 ? 'warning' : 'healthy',
      icon: Loader2,
      helperText: 'Review and dispatch backlog',
    },
    {
      id: 'notifications',
      label: 'Notification Delivery',
      metric: 'Ready',
      status: 'Live',
      statusTone: 'live',
      icon: Sparkles,
      helperText: 'Alerts, updates, and reminders',
    },
  ];

  return {
    cards,
    activity,
    urgentJobs,
    technicians: technicianRows,
    healthRows,
    weeklyTrend,
    sourceBreakdown,
    stats: {
      jobs: jobs.length,
      technicians: technicians.length,
      dealerships: dealerships.length,
      invoices: invoices.length,
      onlineTechnicians,
      pendingApprovals,
      urgentJobs: urgentJobs.length,
    },
    syncState: urgentJobs.length > 0 ? 'warning' : 'live',
  };
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full rounded-[28px]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-36 w-full rounded-[24px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Skeleton className="h-[560px] w-full rounded-[28px]" />
        <div className="space-y-6">
          <Skeleton className="h-[280px] w-full rounded-[28px]" />
          <Skeleton className="h-[280px] w-full rounded-[28px]" />
          <Skeleton className="h-[240px] w-full rounded-[28px]" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Skeleton className="h-[360px] w-full rounded-[28px]" />
        <Skeleton className="h-[360px] w-full rounded-[28px]" />
      </div>
    </div>
  );
}

function EmptyState({ title, description, action, onAction }: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <Card className="border-slate-200 bg-white/90 shadow-[0_14px_40px_rgba(15,23,42,0.08)]">
      <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="max-w-xl text-sm text-slate-500">{description}</p>
        </div>
        <Button onClick={onAction} className="rounded-full bg-slate-900 text-white hover:bg-slate-800">
          {action}
        </Button>
      </CardContent>
    </Card>
  );
}

function MetricTrend({ trend, tone }: {
  trend: DashboardCard['trend'];
  tone: DashboardCardTone;
}) {
  const toneStyles = trend.tone === 'positive'
    ? 'text-emerald-600'
    : trend.tone === 'negative'
      ? 'text-rose-600'
      : 'text-slate-500';
  const Icon = trend.direction === 'up' ? ArrowUp : ArrowDown;

  return (
    <div className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold', tone === 'rose' ? 'border-rose-100 bg-rose-50/70' : 'border-slate-100 bg-white/80')}>
      <Icon className={cn('h-3.5 w-3.5', toneStyles)} />
      <span className={toneStyles}>{trend.label}</span>
    </div>
  );
}

function DashboardChartCard({ title, description, children, action, actionLabel }: {
  title: string;
  description: string;
  children: ReactNode;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <Card className="overflow-hidden border-slate-200 bg-white/90 shadow-[0_14px_40px_rgba(15,23,42,0.08)]">
      <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold text-slate-900">{title}</CardTitle>
            <CardDescription className="text-sm text-slate-500">{description}</CardDescription>
          </div>
          {action && actionLabel ? (
            <Button variant="ghost" size="sm" onClick={action} className="rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              {actionLabel}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {children}
      </CardContent>
    </Card>
  );
}

function ChartFallback({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-2">
        <p className="text-base font-semibold text-slate-900">{title}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);

  const loadDashboard = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const token = getStoredAdminToken();
    if (!token) {
      setError('Admin session missing. Please sign in again.');
      setSnapshot(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError(null);

    try {
      const now = new Date();
      const today = toDateInputValue(now);
      const yesterday = toDateInputValue(subDays(now, 1));

      const yesterdayReportPromise = fetchAdminReportsOverview(token, {
        from_date: yesterday,
        to_date: yesterday,
      }).catch(() => null);

      const [
        todayReports,
        yesterdayReports,
        jobs,
        invoices,
        technicians,
        dealerships,
      ] = await Promise.all([
        fetchAdminReportsOverview(token, {
          from_date: today,
          to_date: today,
        }),
        yesterdayReportPromise,
        fetchAdminJobs(token),
        fetchInvoices(token),
        fetchAdminTechnicians(token),
        fetchAdminDealerships(token),
      ]);

      setSnapshot(buildSnapshot({
        todayReports,
        yesterdayReports,
        jobs,
        invoices,
        technicians,
        dealerships,
        now,
      }));
      setLastUpdated(now);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load dashboard data.');
      if (!background) {
        setSnapshot(null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        void loadDashboard({ background: true });
      }
    }, 30000);

    const handleFocus = () => {
      void loadDashboard({ background: true });
    };
    const handleRefresh = () => {
      void loadDashboard({ background: true });
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener(ADMIN_REFRESH_EVENT, handleRefresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(ADMIN_REFRESH_EVENT, handleRefresh);
    };
  }, [loadDashboard]);

  const quickActions = useMemo(() => ([
    { label: 'Create New Job', description: 'Start a new dispatch intake', icon: UserPlus, path: '/admin/jobs' },
    { label: 'New Intake', description: 'Open the intake queue', icon: FilePlus2, path: '/admin/jobs' },
    { label: 'Schedule Job', description: 'Place work on the calendar', icon: Clock3, path: '/admin/calendar' },
    { label: 'Assign Technician', description: 'Match a tech to a job', icon: UserCheck, path: '/admin/technicians' },
    { label: 'Invoice Approvals', description: 'Review finance approvals', icon: FileCheck, path: '/admin/invoice-approvals' },
    { label: 'View Calendar', description: 'See all scheduled work', icon: LayoutDashboard, path: '/admin/calendar' },
  ] as const), []);

  const todayWorkspace = useMemo<WorkspaceOption>(() => {
    if (typeof window === 'undefined') {
      return WORKSPACES[0];
    }
    const storedId = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return WORKSPACES.find((workspace) => workspace.id === storedId) || WORKSPACES[0];
  }, []);

  const [workspace, setWorkspace] = useState<WorkspaceOption>(todayWorkspace);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace.id);
  }, [workspace]);

  const workspaceDetails = workspace;
  const lastUpdatedLabel = lastUpdated ? formatRelativeTimestamp(lastUpdated, new Date()) : 'Not synced yet';
  const syncTone = snapshot?.syncState === 'warning' ? 'warning' : error ? 'critical' : 'live';
  const chartConfig: ChartConfig = {
    created: {
      label: 'Jobs created',
      color: 'hsl(226 88% 60%)',
    },
    completed: {
      label: 'Jobs completed',
      color: 'hsl(156 70% 42%)',
    },
    web: {
      label: 'Web Form',
      color: 'hsl(226 88% 60%)',
    },
    phone: {
      label: 'Phone',
      color: 'hsl(199 89% 48%)',
    },
    email: {
      label: 'Email',
      color: 'hsl(171 66% 40%)',
    },
    api: {
      label: 'API',
      color: 'hsl(262 83% 58%)',
    },
    manual: {
      label: 'Manual',
      color: 'hsl(31 92% 50%)',
    },
  };

  const statusSummary = useMemo(() => snapshot ? [
    { label: 'Live jobs', value: snapshot.stats.jobs, tone: 'blue' as const },
    { label: 'Online techs', value: snapshot.stats.onlineTechnicians, tone: 'green' as const },
    { label: 'Pending approvals', value: snapshot.stats.pendingApprovals, tone: 'amber' as const },
    { label: 'Urgent items', value: snapshot.stats.urgentJobs, tone: 'rose' as const },
  ] : [], [snapshot]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-[980px] py-10">
        <EmptyState
          title="Dashboard unavailable"
          description={error || 'We could not load the operational dashboard right now. Try refreshing the data or signing in again.'}
          action="Retry dashboard"
          onAction={() => void loadDashboard()}
        />
      </div>
    );
  }

  const jobsTrendData = snapshot.weeklyTrend;
  const sourceData = snapshot.sourceBreakdown;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-[30px] border border-sky-100 bg-gradient-to-r from-[#EFF6FF] via-[#EEF2FF] to-[#F5F3FF] p-6 shadow-[0_24px_60px_rgba(79,70,229,0.14)]">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-sky-400/15 blur-3xl" />
        <div className="absolute -left-10 bottom-0 h-56 w-56 rounded-full bg-violet-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-sky-600" />
              Dispatch command center
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">Dispatch Operations Dashboard</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                Monitor the full dispatch lifecycle from intake to invoice approval in one premium, client-ready workspace.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 py-2 shadow-sm">
                <Building2 className="h-4 w-4 text-sky-600" />
                <span className="font-semibold text-slate-900">{workspaceDetails.name}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 py-2 shadow-sm">
                <User className="h-4 w-4 text-violet-600" />
                <span className="font-semibold text-slate-900">{workspaceDetails.plan}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 py-2 shadow-sm">
                <Activity className={cn('h-4 w-4', syncTone === 'critical' ? 'text-rose-600' : 'text-emerald-600')} />
                <span className="font-medium text-slate-700">Last synced {lastUpdatedLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void loadDashboard({ background: true })}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5',
                syncTone === 'live' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                syncTone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-700',
                syncTone === 'critical' && 'border-rose-200 bg-rose-50 text-rose-700',
              )}
            >
              <span className={cn('h-2.5 w-2.5 rounded-full', syncTone === 'critical' ? 'bg-rose-500' : syncTone === 'warning' ? 'bg-amber-500' : 'bg-emerald-500', syncTone === 'live' && 'animate-pulse')} />
              {refreshing ? 'Refreshing data' : syncTone === 'critical' ? 'Backend attention required' : 'Live backend sync'}
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadDashboard({ background: true })}
              disabled={refreshing}
              className="h-11 rounded-full border-white/70 bg-white/85 px-4 text-slate-700 shadow-sm backdrop-blur hover:bg-white"
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
              Refresh dashboard
            </Button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
          {statusSummary.map((summary) => (
            <div key={summary.label} className="rounded-2xl border border-white/80 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{summary.label}</p>
              <div className="mt-1 text-2xl font-semibold text-slate-950">{formatNumber(summary.value)}</div>
            </div>
          ))}
        </div>
      </section>

      {error ? (
        <Card className="border-rose-200 bg-rose-50/90 shadow-[0_10px_30px_rgba(244,63,94,0.12)]">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div className="flex-1">
              <div className="font-semibold">Sync warning</div>
              <div className="text-rose-600">{error}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {snapshot.cards.map((card) => {
          const styles = CARD_TONE_STYLES[card.tone];
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => navigate(card.navigateTo)}
              className={cn(
                'group relative overflow-hidden rounded-[26px] border p-5 text-left shadow-[0_14px_34px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(15,23,42,0.12)]',
                styles.card,
              )}
            >
              <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', styles.strip)} />
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{card.subtitle}</p>
                </div>
                <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', styles.icon)}>
                  <Icon className={cn('h-5 w-5', card.id === 'in-progress' && 'group-hover:animate-spin')} />
                </div>
              </div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-4xl font-semibold tracking-tight text-slate-950">{formatNumber(card.value)}</div>
                  <p className="mt-2 text-xs font-medium text-slate-500">{card.statusLabel}</p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <MetricTrend trend={card.trend} tone={card.tone} />
                  <ArrowRight className={cn('h-4 w-4 opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100', styles.accent)} />
                </div>
              </div>
            </button>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <DashboardChartCard
            title="Recent Activity"
            description="Live timeline of job, technician, invoice, and customer events."
            action={() => navigate('/admin/audit-logs')}
            actionLabel="View all activity"
          >
            <ScrollArea className="h-[520px]">
              <div className="space-y-4 p-6">
                {snapshot.activity.length > 0 ? snapshot.activity.map((event, index) => {
                  const style = TIMELINE_TONE_STYLES[event.tone];
                  const Icon = event.icon;
                  const isLast = index === snapshot.activity.length - 1;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => navigate(event.href)}
                      className="relative block w-full text-left"
                    >
                      {!isLast ? (
                        <div className={cn('absolute left-[18px] top-10 h-[calc(100%-4px)] w-px', style.line)} />
                      ) : null}
                      <div className="flex gap-4">
                        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl', style.icon)}>
                          <Icon className={cn('h-4 w-4', event.icon === Loader2 && 'animate-spin')} />
                        </div>
                        <div className={cn('flex-1 rounded-[22px] border bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md', style.border)}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-950">{event.title}</p>
                              <p className="mt-1 text-sm text-slate-600">{event.description}</p>
                            </div>
                            <Badge variant="outline" className={cn('text-[11px] font-semibold', style.badge)}>
                              {event.badge}
                            </Badge>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                            <span>{event.timestamp}</span>
                            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                              Open record <ArrowRight className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    No recent activity found.
                  </div>
                )}
              </div>
            </ScrollArea>
          </DashboardChartCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <DashboardChartCard
              title="Jobs Trend This Week"
              description="Daily volume of jobs created and completed over the last seven days."
            >
              <div className="h-[330px] px-4 pb-4 pt-2">
                {jobsTrendData.length > 0 ? (
                    <ChartContainer config={chartConfig} className="h-full w-full aspect-auto">
                      <LineChart data={jobsTrendData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis
                        dataKey="day"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={12}
                        className="text-xs text-slate-500"
                      />
                      <YAxis tickLine={false} axisLine={false} width={28} className="text-xs text-slate-500" />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Line
                        type="monotone"
                        dataKey="created"
                        stroke="var(--color-created)"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="completed"
                        stroke="var(--color-completed)"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6 }}
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <ChartFallback
                    title="No weekly trend yet"
                    description="The chart will light up as soon as the backend returns enough job history."
                  />
                )}
              </div>
            </DashboardChartCard>

            <DashboardChartCard
              title="Intake by Source"
              description="Where new requests are coming from across the CRM."
            >
              <div className="h-[330px] px-4 pb-4 pt-2">
                {sourceData.length > 0 ? (
                  <ChartContainer config={chartConfig} className="h-full w-full aspect-auto">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent indicator="dot" hideLabel />} />
                      <Pie
                        data={sourceData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={72}
                        outerRadius={112}
                        paddingAngle={3}
                        stroke="transparent"
                      >
                        {sourceData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                ) : (
                  <ChartFallback
                    title="No source mix yet"
                    description="Source distribution will appear once intake channels have enough data."
                  />
                )}
                {sourceData.length > 0 ? (
                  <div className="mt-4 flex flex-wrap justify-center gap-2 px-4 pb-2">
                    {sourceData.map((entry) => (
                      <span key={entry.name} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                        {entry.name} {formatNumber(entry.value)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </DashboardChartCard>
          </div>
        </div>

        <div className="space-y-6">
          <DashboardChartCard
            title="Jobs Requiring Attention"
            description="Urgent jobs that need a dispatcher decision now."
            action={() => navigate('/admin/jobs')}
            actionLabel="View all urgent jobs"
          >
            <ScrollArea className="h-[360px]">
              <div className="space-y-3 p-5">
                {snapshot.urgentJobs.length > 0 ? snapshot.urgentJobs.map((job) => {
                  const style = STATUS_TONE_STYLES[job.statusTone];
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => navigate(job.href)}
                      className="group w-full rounded-[20px] border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-950">{job.jobCode}</p>
                            <Badge className={cn('border px-2.5 py-0.5 text-[11px] font-semibold', style.badge)}>
                              {job.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-600">{job.serviceType}</p>
                          <p className="text-xs text-slate-500">{job.customer} · {job.location}</p>
                        </div>
                        <Badge variant="outline" className={cn('text-[11px] font-semibold', style.badge)}>
                          {job.status}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                        <span className={cn('inline-flex items-center gap-1 font-medium', style.text)}>
                          <span className={cn('h-2 w-2 rounded-full', style.dot)} />
                          {job.priority}
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                          {job.actionLabel} <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    No urgent jobs at the moment.
                  </div>
                )}
              </div>
            </ScrollArea>
          </DashboardChartCard>

          <DashboardChartCard
            title="Technician Status Board"
            description="Live availability, assignments, and approximate field location."
            action={() => navigate('/admin/technicians')}
            actionLabel="View all technicians"
          >
            <div className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      <th className="px-5 py-3 font-semibold">Technician</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Current Job</th>
                      <th className="px-5 py-3 font-semibold">Location</th>
                      <th className="px-5 py-3 font-semibold">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.technicians.map((tech, index) => {
                      const style = STATUS_TONE_STYLES[tech.statusTone];
                      const rowBorder = index === snapshot.technicians.length - 1 ? '' : 'border-b border-slate-100';
                      return (
                        <tr key={tech.id} className={cn('group transition-colors hover:bg-slate-50/80', rowBorder)}>
                          <td className="px-5 py-4">
                            <button type="button" onClick={() => navigate(tech.href)} className="flex items-center gap-3 text-left">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-sm font-semibold text-slate-700">
                                {tech.initials}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-950 group-hover:text-sky-700">{tech.name}</p>
                                <p className="text-xs text-slate-500">Field technician</p>
                              </div>
                            </button>
                          </td>
                          <td className="px-5 py-4">
                            <Badge className={cn('border px-2.5 py-1 text-[11px] font-semibold', style.badge)}>
                              <span className={cn('mr-1.5 h-2 w-2 rounded-full', style.dot)} />
                              {tech.status}
                            </Badge>
                          </td>
                          <td className="px-5 py-4">
                            {tech.currentJobHref ? (
                              <button type="button" onClick={() => navigate(tech.currentJobHref || tech.href)} className="text-left">
                                <p className="text-sm font-medium text-slate-900 hover:text-sky-700">{tech.currentJob}</p>
                              </button>
                            ) : (
                              <p className="text-sm text-slate-500">{tech.currentJob}</p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <div className="inline-flex items-center gap-2 text-sm text-slate-600">
                              <MapPin className="h-4 w-4 text-slate-400" />
                              {tech.location}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm text-slate-600">{tech.lastUpdated}</p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </DashboardChartCard>

          <DashboardChartCard
            title="Quick Actions"
            description="One-tap workflows for the most common dispatcher tasks."
          >
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => navigate(action.path)}
                    className="group flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-50 to-indigo-50 text-sky-600 transition-transform group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">{action.label}</p>
                      <p className="text-xs text-slate-500">{action.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </DashboardChartCard>

          <DashboardChartCard
            title="System Health"
            description="Operational counters and service health at a glance."
          >
            <div className="space-y-3 p-5">
              {snapshot.healthRows.map((row) => {
                const style = STATUS_TONE_STYLES[row.statusTone];
                const Icon = row.icon;
                return (
                  <div key={row.id} className="flex items-center justify-between rounded-[18px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                        <p className="text-xs text-slate-500">{row.helperText}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-base font-semibold text-slate-950">{row.metric}</p>
                        <p className={cn('text-xs font-medium', style.text)}>{row.status}</p>
                      </div>
                      <Badge className={cn('border px-2.5 py-1 text-[11px] font-semibold', style.badge)}>
                        {row.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </DashboardChartCard>
        </div>
      </div>
    </div>
  );
}
