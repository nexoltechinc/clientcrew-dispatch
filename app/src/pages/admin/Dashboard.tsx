import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileCheck,
  FileClock,
  FileText,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
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

type DashboardCardTone = 'green' | 'blue' | 'orange' | 'red';

type DashboardCard = {
  id: string;
  label: string;
  value: number;
  icon: React.ElementType;
  tone: DashboardCardTone;
  navigateTo: string;
};

type DashboardAlert = {
  id: string;
  title: string;
  description: string;
  tone: 'warning' | 'critical' | 'info';
};

type ActivityRow = {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  badge: string;
  tone: 'info' | 'success' | 'warning';
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

function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeAgo(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }

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

function toneClasses(tone: DashboardCardTone): string {
  if (tone === 'green') return 'border-emerald-200 bg-white hover:border-emerald-300';
  if (tone === 'orange') return 'border-amber-200 bg-white hover:border-amber-300';
  if (tone === 'red') return 'border-rose-200 bg-white hover:border-rose-300';
  return 'border-blue-200 bg-white hover:border-blue-300';
}

function iconToneClasses(tone: DashboardCardTone): string {
  if (tone === 'green') return 'bg-emerald-100 text-emerald-700';
  if (tone === 'orange') return 'bg-amber-100 text-amber-700';
  if (tone === 'red') return 'bg-rose-100 text-rose-700';
  return 'bg-blue-100 text-blue-700';
}

function buildSnapshot(input: {
  reports: BackendReportsOverview;
  jobs: BackendAdminJob[];
  invoices: BackendInvoice[];
  technicians: BackendTechnicianListItem[];
  dealerships: BackendDealership[];
}): DashboardSnapshot {
  const { reports, jobs, invoices, technicians, dealerships } = input;
  const pendingReviewCount = jobs.filter((job) => (
    ['admin_preview', 'pending_admin_confirmation', 'pending_review'].includes(job.status)
  )).length;
  const awaitingTechAcceptanceCount = jobs.filter((job) => job.status === 'pending').length;
  const inProgressCount = jobs.filter((job) => job.status === 'in_progress').length;
  const delayedCount = jobs.filter((job) => job.status === 'delayed').length;
  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'overdue').length;
  const draftInvoices = invoices.filter((invoice) => invoice.status === 'draft').length;
  const createdInvoices = invoices.filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'cancelled').length;
  const attentionRequiredCount = pendingReviewCount + delayedCount + overdueInvoices;

  const cards: DashboardCard[] = [
    { id: 'jobs-today', label: 'Jobs Today', value: reports.kpis.jobs_created, icon: ClipboardList, tone: 'blue', navigateTo: '/admin/jobs?status=today' },
    { id: 'pending-review', label: 'Pending Review', value: pendingReviewCount, icon: FileCheck, tone: 'orange', navigateTo: '/admin/jobs?status=pending_review' },
    { id: 'awaiting-tech', label: 'Awaiting Tech Acceptance', value: awaitingTechAcceptanceCount, icon: Users, tone: 'orange', navigateTo: '/admin/jobs?status=awaiting_tech' },
    { id: 'in-progress', label: 'In Progress', value: inProgressCount, icon: PlayCircle, tone: 'blue', navigateTo: '/admin/jobs?status=in_progress' },
    { id: 'completed-today', label: 'Completed Today', value: reports.kpis.jobs_completed, icon: CheckCircle2, tone: 'green', navigateTo: '/admin/jobs?status=completed' },
    { id: 'approval-required', label: 'Invoice Approval Required', value: reports.kpis.pending_approvals, icon: ShieldAlert, tone: 'orange', navigateTo: '/admin/invoice-approvals' },
    { id: 'invoice-creating', label: 'Invoice Creating', value: draftInvoices, icon: FileClock, tone: 'blue', navigateTo: '/admin/invoice-history' },
    { id: 'invoice-created', label: 'Invoice Created', value: createdInvoices, icon: FileText, tone: 'green', navigateTo: '/admin/invoice-history' },
    { id: 'attention-required', label: 'Attention Required', value: attentionRequiredCount, icon: AlertTriangle, tone: attentionRequiredCount > 0 ? 'red' : 'green', navigateTo: '/admin/jobs?status=attention_required' },
  ];

  const alerts: DashboardAlert[] = [];
  if (pendingReviewCount > 0) {
    alerts.push({
      id: 'pending-review',
      title: 'Jobs are waiting for admin review',
      description: `${pendingReviewCount} job(s) are still in the admin preview or review pipeline.`,
      tone: 'warning',
    });
  }
  if (reports.kpis.pending_approvals > 0) {
    alerts.push({
      id: 'invoice-approvals',
      title: 'Invoices need approval',
      description: `${reports.kpis.pending_approvals} completed job(s) are ready for invoice approval.`,
      tone: 'warning',
    });
  }
  if (overdueInvoices > 0) {
    alerts.push({
      id: 'overdue-invoices',
      title: 'Overdue invoices detected',
      description: `${overdueInvoices} invoice(s) are currently overdue and need attention.`,
      tone: 'critical',
    });
  }
  const activity = jobs
    .slice()
    .sort((left, right) => (
      new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime()
    ))
    .slice(0, 10)
    .map((job) => {
      const statusLabel = titleCaseStatus(job.status);
      const isCompleted = job.status === 'completed';
      const isWarning = ['pending_review', 'delayed', 'cancelled'].includes(job.status);
      return {
        id: job.id,
        title: `${statusLabel}: ${job.job_code}`,
        description: `${job.dealership_name || 'Unknown customer'}${job.service_type ? ` • ${job.service_type}` : ''}${job.vehicle ? ` • ${job.vehicle}` : ''}`,
        timestamp: timeAgo(job.updated_at || job.created_at),
        badge: statusLabel,
        tone: isCompleted ? 'success' : (isWarning ? 'warning' : 'info'),
      } satisfies ActivityRow;
    });

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
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
        {Array.from({ length: 9 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-6">
        <Skeleton className="h-[420px] w-full rounded-xl" />
        <Skeleton className="h-[420px] w-full rounded-xl" />
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

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground font-medium">
            Live operational metrics from the Neon-backed admin APIs.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="hidden sm:block text-xs text-muted-foreground">
            Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '--'}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => void loadDashboard({ background: true })}
            title="Refresh dashboard"
            disabled={refreshing}
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-4 text-sm text-rose-700">{error}</CardContent>
        </Card>
      ) : null}

      {snapshot?.alerts.length ? (
        <section className="space-y-3">
          {snapshot.alerts.map((alert) => (
            <Card
              key={alert.id}
              className={cn(
                'border shadow-sm',
                alert.tone === 'critical' && 'border-rose-200 bg-rose-50',
                alert.tone === 'warning' && 'border-amber-200 bg-amber-50',
                alert.tone === 'info' && 'border-emerald-200 bg-emerald-50',
              )}
            >
              <CardContent className="p-4 flex items-start gap-3">
                {alert.tone === 'critical' ? <AlertCircle className="w-5 h-5 text-rose-700 mt-0.5" /> : null}
                {alert.tone === 'warning' ? <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5" /> : null}
                {alert.tone === 'info' ? <CheckCircle2 className="w-5 h-5 text-emerald-700 mt-0.5" /> : null}
                <div>
                  <div className="font-semibold text-sm text-foreground">{alert.title}</div>
                  <div className="text-sm text-muted-foreground">{alert.description}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {snapshot?.cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className={cn(
              'rounded-xl border p-5 text-left shadow-sm transition hover:shadow-md',
              toneClasses(card.tone),
            )}
            onClick={() => navigate(card.navigateTo)}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-muted-foreground">{card.label}</span>
              <div className={cn('rounded-lg p-2', iconToneClasses(card.tone))}>
                <card.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-4xl font-bold tracking-tight">{card.value}</div>
          </button>
        ))}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-6">
        <Card className="border-border shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-6 pt-6 pb-3">
              <div>
                <h2 className="text-lg font-semibold">Recent Activity</h2>
                <p className="text-sm text-muted-foreground">Latest job updates from the backend.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/jobs')}>
                View Jobs <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <ScrollArea className="h-[420px]">
              <div className="px-6 pb-6 space-y-3">
                {snapshot?.activity.length ? snapshot.activity.map((event) => (
                  <div key={event.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-sm">{event.title}</div>
                      <Badge
                        variant="outline"
                        className={cn(
                          event.tone === 'success' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          event.tone === 'warning' && 'bg-amber-50 text-amber-700 border-amber-200',
                          event.tone === 'info' && 'bg-blue-50 text-blue-700 border-blue-200',
                        )}
                      >
                        {event.badge}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">{event.description}</div>
                    <div className="text-xs text-muted-foreground mt-2">{event.timestamp}</div>
                  </div>
                )) : (
                  <div className="px-2 py-6 text-sm text-muted-foreground">No recent activity found.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Quick Actions</h2>
                <p className="text-sm text-muted-foreground">Open the live operational screens.</p>
              </div>
              <Button className="w-full justify-start" variant="outline" onClick={() => navigate('/admin/jobs')}>
                <Briefcase className="w-4 h-4 mr-2" /> View All Jobs
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => navigate('/admin/invoice-approvals')}>
                <ShieldAlert className="w-4 h-4 mr-2" /> Invoice Approvals
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => navigate('/admin/technicians')}>
                <Users className="w-4 h-4 mr-2" /> Technician Roster
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => navigate('/admin/dealerships')}>
                <Building2 className="w-4 h-4 mr-2" /> Customer Directory
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold">System Health</h2>
                <p className="text-sm text-muted-foreground">Counts loaded from the active backend session.</p>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Jobs in DB</span>
                <span className="font-semibold">{snapshot?.stats.jobs ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Technicians</span>
                <span className="font-semibold">{snapshot?.stats.technicians ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Customers</span>
                <span className="font-semibold">{snapshot?.stats.dealerships ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Invoices</span>
                <span className="font-semibold">{snapshot?.stats.invoices ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
                <span className="text-muted-foreground">Backend sync</span>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  Live
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
