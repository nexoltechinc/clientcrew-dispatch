import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clipboard,
  ClipboardList,
  Clock3,
  Database,
  FileCheck,
  FileClock,
  FileText,
  Loader2,
  RefreshCw,
  User,
  UserCheck,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
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

type DashboardCardTone = 'indigo' | 'teal' | 'purple' | 'blue' | 'green' | 'amber' | 'red';

type DashboardCard = {
  id: string;
  label: string;
  value: number;
  icon: ElementType;
  tone: DashboardCardTone;
  navigateTo: string;
  subtitle: string;
};

type DashboardAlert = {
  id: string;
  title: string;
  description: string;
  tone: 'warning' | 'critical' | 'info';
};

type ActivityTone = 'blue' | 'green' | 'amber' | 'red' | 'purple';

type ActivityRow = {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  badge: string;
  tone: ActivityTone;
  icon: ElementType;
};

type DashboardSnapshot = {
  cards: DashboardCard[];
  alerts: DashboardAlert[];
  activity: ActivityRow[];
  stats: {
    jobs: number;
    technicians: number;
    dealerships: number;
    invoices: number;
  };
};

const ADMIN_REFRESH_EVENT = 'sm-dispatch:admin-refresh';

const CARD_TONE_STYLES: Record<DashboardCardTone, { card: string; icon: string; accent: string }> = {
  indigo: {
    card: 'border-indigo-100 bg-white hover:border-indigo-200',
    icon: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100',
    accent: 'text-indigo-600',
  },
  teal: {
    card: 'border-teal-100 bg-white hover:border-teal-200',
    icon: 'bg-teal-50 text-teal-600 ring-1 ring-teal-100',
    accent: 'text-teal-600',
  },
  purple: {
    card: 'border-violet-100 bg-white hover:border-violet-200',
    icon: 'bg-violet-50 text-violet-600 ring-1 ring-violet-100',
    accent: 'text-violet-600',
  },
  blue: {
    card: 'border-sky-100 bg-white hover:border-sky-200',
    icon: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
    accent: 'text-sky-600',
  },
  green: {
    card: 'border-emerald-100 bg-white hover:border-emerald-200',
    icon: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    accent: 'text-emerald-600',
  },
  amber: {
    card: 'border-amber-100 bg-white hover:border-amber-200',
    icon: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
    accent: 'text-amber-600',
  },
  red: {
    card: 'border-rose-100 bg-white hover:border-rose-200',
    icon: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
    accent: 'text-rose-600',
  },
};

const ACTIVITY_TONE_STYLES: Record<ActivityTone, { icon: string; badge: string; line: string }> = {
  blue: {
    icon: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    line: 'bg-sky-100',
  },
  green: {
    icon: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    line: 'bg-emerald-100',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    line: 'bg-amber-100',
  },
  red: {
    icon: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    line: 'bg-rose-100',
  },
  purple: {
    icon: 'bg-violet-50 text-violet-600 ring-1 ring-violet-100',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    line: 'bg-violet-100',
  },
};

function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeAgo(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function titleCaseStatus(status: string): string {
  return status
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatJobServiceSummary(job: BackendAdminJob): string {
  if (job.service_names && job.service_names.length > 0) {
    return job.service_names.join(', ');
  }
  return job.service_type || 'Service update';
}

function buildActivity(job: BackendAdminJob): ActivityRow {
  const status = (job.status || 'pending').toLowerCase();
  const technicianName = job.assigned_technician_name || job.pre_assigned_technician_name || 'Technician';
  const dealership = job.dealership_name || 'Unknown customer';
  const serviceSummary = formatJobServiceSummary(job);
  const vehicleSummary = job.vehicle ? ` - ${job.vehicle}` : '';
  const timestamp = job.updated_at || job.created_at;

  if (status === 'completed') {
    return {
      id: `${job.id}-completed`,
      title: `Job completed: ${job.job_code}`,
      description: `${technicianName} completed ${serviceSummary} for ${dealership}${vehicleSummary}.`,
      timestamp: timeAgo(timestamp),
      badge: 'Completed',
      tone: 'green',
      icon: CheckCircle2,
    };
  }

  if (status === 'in_progress' || status === 'assigned') {
    return {
      id: `${job.id}-in-progress`,
      title: `Technician accepted ${job.job_code}`,
      description: `${technicianName} is working on ${serviceSummary} for ${dealership}${vehicleSummary}.`,
      timestamp: timeAgo(timestamp),
      badge: 'In Progress',
      tone: 'blue',
      icon: Loader2,
    };
  }

  if (status === 'pending') {
    return {
      id: `${job.id}-pending`,
      title: `Awaiting tech acceptance: ${job.job_code}`,
      description: `${dealership} is waiting for technician confirmation on ${serviceSummary}.`,
      timestamp: timeAgo(timestamp),
      badge: 'Pending',
      tone: 'purple',
      icon: UserCheck,
    };
  }

  if (status === 'admin_preview' || status === 'pending_admin_confirmation' || status === 'pending_review') {
    return {
      id: `${job.id}-review`,
      title: `Admin review required: ${job.job_code}`,
      description: `${dealership} request needs confirmation before dispatch.`,
      timestamp: timeAgo(timestamp),
      badge: 'Review',
      tone: 'amber',
      icon: Clock3,
    };
  }

  if (status === 'delayed' || status === 'cancelled') {
    return {
      id: `${job.id}-attention`,
      title: `Attention required: ${job.job_code}`,
      description: `${dealership} has a ${titleCaseStatus(status).toLowerCase()} job requiring action.`,
      timestamp: timeAgo(timestamp),
      badge: titleCaseStatus(status),
      tone: 'red',
      icon: AlertTriangle,
    };
  }

  return {
    id: `${job.id}-default`,
    title: `${titleCaseStatus(status)} update: ${job.job_code}`,
    description: `${dealership} - ${serviceSummary}${vehicleSummary}`,
    timestamp: timeAgo(timestamp),
    badge: titleCaseStatus(status),
    tone: 'blue',
    icon: ClipboardList,
  };
}

function buildSnapshot(input: {
  reports: BackendReportsOverview;
  jobs: BackendAdminJob[];
  invoices: BackendInvoice[];
  technicians: BackendTechnicianListItem[];
  dealerships: BackendDealership[];
}): DashboardSnapshot {
  const { reports, jobs, invoices, technicians, dealerships } = input;
  const normalizedStatuses = jobs.map((job) => (job.status || '').toLowerCase());

  const pendingReviewCount = normalizedStatuses.filter((status) => (
    status === 'admin_preview' || status === 'pending_admin_confirmation' || status === 'pending_review'
  )).length;
  const awaitingTechAcceptanceCount = normalizedStatuses.filter((status) => status === 'pending').length;
  const inProgressCount = normalizedStatuses.filter((status) => status === 'in_progress' || status === 'assigned').length;
  const delayedCount = normalizedStatuses.filter((status) => status === 'delayed' || status === 'cancelled').length;
  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'overdue').length;
  const draftInvoices = invoices.filter((invoice) => invoice.status === 'draft').length;
  const createdInvoices = invoices.filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'cancelled').length;
  const attentionRequiredCount = pendingReviewCount + delayedCount + overdueInvoices;

  const cards: DashboardCard[] = [
    {
      id: 'jobs-today',
      label: 'Jobs Today',
      value: reports.kpis.jobs_created,
      icon: ClipboardList,
      tone: 'blue',
      navigateTo: '/admin/jobs?status=today',
      subtitle: 'Daily intake',
    },
    {
      id: 'pending-review',
      label: 'Pending Review',
      value: pendingReviewCount,
      icon: Clock3,
      tone: 'amber',
      navigateTo: '/admin/jobs?status=pending_review',
      subtitle: 'Needs admin check',
    },
    {
      id: 'awaiting-tech',
      label: 'Awaiting Tech Acceptance',
      value: awaitingTechAcceptanceCount,
      icon: UserCheck,
      tone: 'purple',
      navigateTo: '/admin/jobs?status=awaiting_tech',
      subtitle: 'Not yet accepted',
    },
    {
      id: 'in-progress',
      label: 'In Progress',
      value: inProgressCount,
      icon: Loader2,
      tone: 'blue',
      navigateTo: '/admin/jobs?status=in_progress',
      subtitle: 'Active field work',
    },
    {
      id: 'completed-today',
      label: 'Completed Today',
      value: reports.kpis.jobs_completed,
      icon: CheckCircle2,
      tone: 'green',
      navigateTo: '/admin/jobs?status=completed',
      subtitle: 'Closed successfully',
    },
    {
      id: 'approval-required',
      label: 'Invoice Approval Required',
      value: reports.kpis.pending_approvals,
      icon: AlertCircle,
      tone: 'amber',
      navigateTo: '/admin/invoice-approvals',
      subtitle: 'Ready for review',
    },
    {
      id: 'invoice-creating',
      label: 'Invoice Creating',
      value: draftInvoices,
      icon: FileClock,
      tone: 'indigo',
      navigateTo: '/admin/invoice-history',
      subtitle: 'In draft pipeline',
    },
    {
      id: 'invoice-created',
      label: 'Invoice Created',
      value: createdInvoices,
      icon: FileCheck,
      tone: 'green',
      navigateTo: '/admin/invoice-history',
      subtitle: 'Ready in history',
    },
    {
      id: 'attention-required',
      label: 'Attention Required',
      value: attentionRequiredCount,
      icon: AlertTriangle,
      tone: attentionRequiredCount > 0 ? 'red' : 'teal',
      navigateTo: '/admin/jobs?status=attention_required',
      subtitle: 'Needs immediate action',
    },
  ];

  const alerts: DashboardAlert[] = [];
  if (pendingReviewCount > 0) {
    alerts.push({
      id: 'pending-review',
      title: 'Jobs waiting for admin review',
      description: `${pendingReviewCount} job(s) are still in admin preview or review status.`,
      tone: 'warning',
    });
  }
  if (reports.kpis.pending_approvals > 0) {
    alerts.push({
      id: 'invoice-approvals',
      title: 'Invoices pending approval',
      description: `${reports.kpis.pending_approvals} completed job(s) are ready for approval.`,
      tone: 'warning',
    });
  }
  if (overdueInvoices > 0) {
    alerts.push({
      id: 'overdue-invoices',
      title: 'Overdue invoices detected',
      description: `${overdueInvoices} invoice(s) are overdue and need attention.`,
      tone: 'critical',
    });
  }

  const activity = jobs
    .slice()
    .sort((left, right) => (
      new Date(right.updated_at || right.created_at).getTime()
      - new Date(left.updated_at || left.created_at).getTime()
    ))
    .slice(0, 12)
    .map(buildActivity);

  return {
    cards,
    alerts,
    activity,
    stats: {
      jobs: jobs.length,
      technicians: technicians.length,
      dealerships: dealerships.length,
      invoices: invoices.length,
    },
  };
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
        {Array.from({ length: 9 }).map((_, index) => (
          <Skeleton key={index} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.65fr_1fr] gap-6">
        <Skeleton className="h-[520px] w-full rounded-2xl" />
        <Skeleton className="h-[520px] w-full rounded-2xl" />
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

  const todayRange = useMemo(() => {
    const today = toDateInputValue(new Date());
    return { fromDate: today, toDate: today };
  }, []);

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
      const [reports, jobs, invoices, technicians, dealerships] = await Promise.all([
        fetchAdminReportsOverview(token, {
          from_date: todayRange.fromDate,
          to_date: todayRange.toDate,
        }),
        fetchAdminJobs(token),
        fetchInvoices(token),
        fetchAdminTechnicians(token),
        fetchAdminDealerships(token),
      ]);

      setSnapshot(buildSnapshot({ reports, jobs, invoices, technicians, dealerships }));
      setLastUpdated(new Date());
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load dashboard data.');
      setSnapshot(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [todayRange.fromDate, todayRange.toDate]);

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

  if (loading) {
    return <DashboardSkeleton />;
  }

  const quickActions = [
    { label: 'View All Jobs', description: 'Open the full jobs board', icon: Clipboard, path: '/admin/jobs' },
    { label: 'Invoice Approvals', description: 'Review and approve invoices', icon: FileCheck, path: '/admin/invoice-approvals' },
    { label: 'Technician Roster', description: 'View technicians and status', icon: Users, path: '/admin/technicians' },
    { label: 'Customer Directory', description: 'Manage customer records', icon: User, path: '/admin/dealerships' },
  ] as const;

  const healthRows = [
    { id: 'jobs', label: 'Jobs in DB', value: snapshot?.stats.jobs ?? 0, icon: Database },
    { id: 'techs', label: 'Technicians', value: snapshot?.stats.technicians ?? 0, icon: Users },
    { id: 'customers', label: 'Customers', value: snapshot?.stats.dealerships ?? 0, icon: User },
    { id: 'invoices', label: 'Invoices', value: snapshot?.stats.invoices ?? 0, icon: FileText },
  ] as const;

  return (
    <div className="mx-auto max-w-[1640px] space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-r from-[#4F46E5] via-[#6366F1] to-[#8B5CF6] p-6 text-white shadow-[0_20px_45px_rgba(79,70,229,0.28)]">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 left-1/3 h-52 w-52 rounded-full bg-[#14B8A6]/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dispatch Operations Dashboard</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Badge className="border-0 bg-emerald-500/25 px-3 py-1 text-xs font-semibold text-emerald-100 backdrop-blur">
              Live Backend Sync
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadDashboard({ background: true })}
              disabled={refreshing}
              className="h-9 border-white/30 bg-white/10 text-white hover:bg-white/20"
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
        <div className="relative mt-4 text-xs text-indigo-100">
          Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '--'}
        </div>
      </section>

      {error ? (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div>{error}</div>
          </CardContent>
        </Card>
      ) : null}

      {snapshot?.alerts.length ? (
        <section className="space-y-3">
          {snapshot.alerts.map((alert) => (
            <Card
              key={alert.id}
              className={cn(
                'shadow-sm',
                alert.tone === 'critical' && 'border-rose-200 bg-rose-50',
                alert.tone === 'warning' && 'border-amber-200 bg-amber-50',
                alert.tone === 'info' && 'border-emerald-200 bg-emerald-50',
              )}
            >
              <CardContent className="flex items-start gap-3 p-4">
                {alert.tone === 'critical' ? <AlertCircle className="mt-0.5 h-5 w-5 text-rose-700" /> : null}
                {alert.tone === 'warning' ? <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" /> : null}
                {alert.tone === 'info' ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" /> : null}
                <div>
                  <div className="text-sm font-semibold text-slate-900">{alert.title}</div>
                  <div className="text-sm text-slate-600">{alert.description}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {snapshot?.cards.map((card) => {
          const tone = CARD_TONE_STYLES[card.tone];
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => navigate(card.navigateTo)}
              className={cn(
                'group rounded-2xl border p-5 text-left shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_36px_rgba(15,23,42,0.12)]',
                tone.card,
              )}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{card.subtitle}</p>
                </div>
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tone.icon)}>
                  <card.icon className={cn('h-5 w-5', card.id === 'in-progress' && 'group-hover:animate-spin')} />
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div className="text-4xl font-bold tracking-tight text-slate-900">{card.value}</div>
                <ArrowRight className={cn('h-4 w-4 opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100', tone.accent)} />
              </div>
            </button>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.65fr_1fr]">
        <Card className="overflow-hidden border-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardContent className="p-0">
            <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100/50 px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
                  <p className="text-sm text-slate-500">Live timeline of technician and job workflow updates.</p>
                </div>
                <Button variant="ghost" size="sm" className="text-slate-700" onClick={() => navigate('/admin/jobs')}>
                  Open Jobs <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[520px]">
              <div className="space-y-5 px-6 py-5">
                {snapshot?.activity.length ? (
                  snapshot.activity.map((event, index) => {
                    const tone = ACTIVITY_TONE_STYLES[event.tone];
                    const Icon = event.icon;
                    const isLast = index === snapshot.activity.length - 1;
                    return (
                      <div key={event.id} className="relative pl-12">
                        {!isLast ? (
                          <div className={cn('absolute left-[18px] top-10 h-[calc(100%-4px)] w-px', tone.line)} />
                        ) : null}
                        <div className={cn('absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-xl', tone.icon)}>
                          <Icon className={cn('h-4 w-4', event.icon === Loader2 && 'animate-spin')} />
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="text-sm font-semibold text-slate-900">{event.title}</div>
                            <Badge variant="outline" className={cn('text-[11px] font-semibold', tone.badge)}>
                              {event.badge}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{event.description}</p>
                          <p className="mt-2 text-xs font-medium text-slate-500">{event.timestamp}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                    No recent activity found.
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden border-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <CardContent className="p-0">
              <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100/50 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Quick Actions</h2>
                <p className="text-sm text-slate-500">Jump to key dispatch workflows.</p>
              </div>
              <div className="space-y-3 p-5">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => navigate(action.path)}
                    className="group flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50/40 hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-600">
                        <action.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{action.label}</div>
                        <div className="text-xs text-slate-500">{action.description}</div>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 transition-all duration-200 group-hover:translate-x-1 group-hover:text-indigo-600" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <CardContent className="p-0">
              <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100/50 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">System Health</h2>
                <p className="text-sm text-slate-500">Operational counters and backend connectivity status.</p>
              </div>
              <div className="space-y-3 p-5">
                {healthRows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                        <row.icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">{row.label}</span>
                    </div>
                    <span className="text-lg font-bold text-slate-900">{row.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <Activity className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium text-emerald-900">Backend Sync</span>
                  </div>
                  <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">Live</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
