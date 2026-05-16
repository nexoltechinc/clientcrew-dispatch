import { useCallback, useEffect, useMemo, useState, type ElementType, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck,
  History,
  Inbox,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  UserCircle2,
  UserCog,
  Users,
  Wrench,
  X,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TechnicianPreviewModal } from '@/components/modals/TechnicianPreviewModal';
import {
  fetchAdminDealerships,
  fetchAdminCustomerConversationSummary,
  fetchAdminJobs,
  fetchAdminTechnicians,
  fetchInvoices,
  getStoredAdminToken,
  type BackendCustomerConversationSummary,
  type BackendAdminJob,
  type BackendDealership,
  type BackendInvoice,
  type BackendTechnicianListItem,
} from '@/lib/backend-api';

type StatusTone = 'healthy' | 'warning' | 'critical' | 'live';

type WorkspaceOption = {
  id: string;
  name: string;
  plan: string;
  region: string;
};

type ChromeCounts = {
  pendingIntakes: number;
  invoiceApprovals: number;
  urgentJobs: number;
  onlineTechnicians: number;
  overdueInvoices: number;
  liveJobs: number;
  customerConversationUnread: number;
  customerConversationUrgent: number;
};

type SearchItem = {
  group: 'Pages' | 'Jobs' | 'Records' | 'Invoices' | 'Technicians';
  label: string;
  description: string;
  href: string;
  keywords: string[];
  icon: ElementType;
};

type NotificationItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  tone: StatusTone;
  icon: ElementType;
};

type ChromeData = {
  jobs: BackendAdminJob[];
  technicians: BackendTechnicianListItem[];
  dealerships: BackendDealership[];
  invoices: BackendInvoice[];
  customerConversationSummary: BackendCustomerConversationSummary | null;
  loadedAt: string | null;
  syncTone: StatusTone;
};

const ADMIN_REFRESH_EVENT = 'dispatchiq:admin-refresh';
const WORKSPACE_STORAGE_KEY = 'dispatchiq_workspace_id';

const WORKSPACES: WorkspaceOption[] = [
  {
    id: 'clientcrew',
    name: 'DispatchIQ',
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
];

const NAV_SECTIONS: Array<{
  title: string;
  items: Array<{
    path: string;
    matchPath: string;
    label: string;
    icon: ElementType;
    badgeKey?: keyof ChromeCounts;
  }>;
}> = [
  {
    title: 'Operations',
    items: [
      { path: '/admin', matchPath: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/admin/jobs?view=intake', matchPath: '/admin/jobs', label: 'Intake Queue', icon: Inbox, badgeKey: 'pendingIntakes' },
      { path: '/admin/calendar', matchPath: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
      { path: '/admin/jobs', matchPath: '/admin/jobs', label: 'Jobs', icon: Briefcase },
    ],
  },
  {
    title: 'Revenue',
    items: [
      { path: '/admin/invoice-approvals', matchPath: '/admin/invoice-approvals', label: 'Invoice Approvals', icon: FileCheck, badgeKey: 'invoiceApprovals' },
      { path: '/admin/invoice-history', matchPath: '/admin/invoice-history', label: 'Invoice History', icon: History },
    ],
  },
  {
    title: 'CRM',
    items: [
      { path: '/admin/customer-conversations', matchPath: '/admin/customer-conversations', label: 'Customer Conversations', icon: Inbox, badgeKey: 'customerConversationUnread' },
      { path: '/admin/dealerships?view=locations', matchPath: '/admin/dealerships', label: 'Locations', icon: MapPin },
      { path: '/admin/technicians', matchPath: '/admin/technicians', label: 'Technicians', icon: Users },
      { path: '/admin/technician-accounts', matchPath: '/admin/technician-accounts', label: 'Tech Accounts', icon: UserCog },
      { path: '/admin/dealerships', matchPath: '/admin/dealerships', label: 'Customers', icon: UserCircle2 },
      { path: '/admin/services', matchPath: '/admin/services', label: 'Services', icon: Wrench },
    ],
  },
  {
    title: 'Insights',
    items: [
      { path: '/admin/reports', matchPath: '/admin/reports', label: 'Reports', icon: BarChart3 },
      { path: '/admin/audit-logs', matchPath: '/admin/audit-logs', label: 'Audit Logs', icon: Sparkles },
      { path: '/admin/settings', matchPath: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const PAGE_SEARCH_ITEMS: SearchItem[] = [
  { group: 'Pages', label: 'Dashboard', description: 'Command center overview', href: '/admin', keywords: ['dashboard', 'overview', 'home'], icon: LayoutDashboard },
  { group: 'Pages', label: 'Calendar', description: 'Scheduling and availability', href: '/admin/calendar', keywords: ['calendar', 'schedule', 'availability'], icon: CalendarDays },
  { group: 'Pages', label: 'Jobs', description: 'Dispatch board and filters', href: '/admin/jobs', keywords: ['jobs', 'dispatch', 'queue'], icon: Briefcase },
  { group: 'Pages', label: 'Invoice Approvals', description: 'Finance review queue', href: '/admin/invoice-approvals', keywords: ['invoice', 'approvals', 'finance'], icon: FileCheck },
  { group: 'Pages', label: 'Customer Conversations', description: 'Dispatch inbox for customer chatbot and portal requests', href: '/admin/customer-conversations', keywords: ['customer conversations', 'chat', 'inbox', 'support', 'portal'], icon: Inbox },
  { group: 'Pages', label: 'Technicians', description: 'Field team roster', href: '/admin/technicians', keywords: ['technicians', 'crew', 'field team'], icon: Users },
  { group: 'Pages', label: 'Customers', description: 'CRM customer records', href: '/admin/dealerships', keywords: ['customers', 'dealerships', 'locations'], icon: UserCircle2 },
  { group: 'Pages', label: 'Reports', description: 'Analytics and performance', href: '/admin/reports', keywords: ['reports', 'analytics', 'performance'], icon: BarChart3 },
  { group: 'Pages', label: 'Audit Logs', description: 'System activity timeline', href: '/admin/audit-logs', keywords: ['audit', 'logs', 'activity'], icon: History },
  { group: 'Pages', label: 'Settings', description: 'Configuration and branding', href: '/admin/settings', keywords: ['settings', 'branding', 'configuration'], icon: Settings },
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatRelativeTime(value: string | Date, now: Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  const diffMinutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  if (diffMinutes < 1) {
    return 'Just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  const yesterday = new Date(now.getTime() - 86400000);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (diffHours < 168) {
    return `${date.toLocaleDateString([], { weekday: 'short' })} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function titleCaseStatus(status: string): string {
  return status
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeStatus(status?: string | null): string {
  return (status || 'unknown')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function formatJobSummary(job: BackendAdminJob): string {
  if (job.service_names && job.service_names.length > 0) {
    return job.service_names.join(', ');
  }
  return job.service_type || 'Service request';
}

function jobLocation(job: BackendAdminJob, dealerships: BackendDealership[]) {
  const dealership = dealerships.find((item) => item.id === job.dealership_id);
  return dealership?.city?.trim() || dealership?.address?.trim() || 'Dispatch territory';
}

function getCounts(
  jobs: BackendAdminJob[],
  technicians: BackendTechnicianListItem[],
  invoices: BackendInvoice[],
  customerConversationSummary: BackendCustomerConversationSummary | null,
): ChromeCounts {
  const pendingIntakes = jobs.filter((job) => {
    const status = normalizeStatus(job.status);
    return status === 'pending_review' || status === 'pending_admin_confirmation' || status === 'admin_preview' || status === 'pending';
  }).length;

  const invoiceApprovals = invoices.filter((invoice) => invoice.status === 'draft').length;
  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'overdue').length;
  const urgentJobs = jobs.filter((job) => {
    const status = normalizeStatus(job.status);
    return status === 'delayed' || status === 'cancelled' || status === 'refused' || status === 'blocked';
  }).length + overdueInvoices;

  const onlineTechnicians = technicians.filter((tech) => (
    tech.status === 'active' && tech.effective_availability && !tech.on_leave_now
  )).length;

  const liveJobs = jobs.filter((job) => {
    const status = normalizeStatus(job.status);
    return status === 'in_progress' || status === 'assigned' || status === 'scheduled';
  }).length;

  const customerConversationUnread = customerConversationSummary?.unread ?? 0;
  const customerConversationUrgent = customerConversationSummary?.urgent ?? 0;

  return {
    pendingIntakes,
    invoiceApprovals,
    urgentJobs,
    onlineTechnicians,
    overdueInvoices,
    liveJobs,
    customerConversationUnread,
    customerConversationUrgent,
  };
}

function buildNotifications(counts: ChromeCounts, syncTone: StatusTone): NotificationItem[] {
  const items: NotificationItem[] = [];

  if (syncTone === 'critical') {
    items.push({
      id: 'sync-error',
      label: 'Backend sync issue',
      description: 'The latest data refresh reported an error.',
      href: '/admin/settings',
      tone: 'critical',
      icon: AlertTriangle,
    });
  }
  if (counts.urgentJobs > 0) {
    items.push({
      id: 'urgent-jobs',
      label: 'Urgent jobs pending',
      description: `${counts.urgentJobs} job(s) require dispatch attention.`,
      href: '/admin/jobs',
      tone: 'critical',
      icon: AlertTriangle,
    });
  }
  if (counts.pendingIntakes > 0) {
    items.push({
      id: 'pending-intakes',
      label: 'Intake queue building',
      description: `${counts.pendingIntakes} intake item(s) are waiting for review.`,
      href: '/admin/jobs?view=intake',
      tone: 'warning',
      icon: Clock3,
    });
  }
  if (counts.invoiceApprovals > 0) {
    items.push({
      id: 'invoice-approvals',
      label: 'Invoices ready for approval',
      description: `${counts.invoiceApprovals} invoice(s) are awaiting finance review.`,
      href: '/admin/invoice-approvals',
      tone: 'warning',
      icon: FileCheck,
    });
  }
  if (counts.overdueInvoices > 0) {
    items.push({
      id: 'overdue-invoices',
      label: 'Overdue invoices detected',
      description: `${counts.overdueInvoices} invoice(s) need follow-up.`,
      href: '/admin/invoice-history',
      tone: 'critical',
      icon: AlertTriangle,
    });
  }
  if (counts.onlineTechnicians === 0) {
    items.push({
      id: 'no-techs',
      label: 'Technicians offline',
      description: 'No technicians are currently marked available.',
      href: '/admin/technicians',
      tone: 'warning',
      icon: Users,
    });
  }
  if (counts.customerConversationUnread > 0) {
    items.push({
      id: 'customer-conversations-unread',
      label: 'Unread customer conversations',
      description: `${counts.customerConversationUnread} conversation(s) are waiting for an admin reply.`,
      href: '/admin/customer-conversations',
      tone: 'warning',
      icon: Inbox,
    });
  }
  if (counts.customerConversationUrgent > 0) {
    items.push({
      id: 'customer-conversations-urgent',
      label: 'Urgent customer conversations',
      description: `${counts.customerConversationUrgent} conversation(s) are marked urgent.`,
      href: '/admin/customer-conversations',
      tone: 'critical',
      icon: AlertTriangle,
    });
  }

  return items;
}

function buildSearchItems(data: ChromeData, counts: ChromeCounts): SearchItem[] {
  const items = [...PAGE_SEARCH_ITEMS];

  data.jobs.slice(0, 20).forEach((job) => {
    const status = normalizeStatus(job.status);
    const customer = job.dealership_name?.trim() || 'Unknown customer';
    items.push({
      group: 'Jobs',
      label: job.job_code,
      description: `${customer} · ${formatJobSummary(job)} · ${titleCaseStatus(status)}`,
      href: `/admin/jobs/${job.id}`,
      keywords: [job.job_code, customer, formatJobSummary(job), status, job.vehicle || ''],
      icon: Briefcase,
    });
  });

  data.technicians.forEach((tech) => {
    const location = tech.zones.map((zone) => zone.name).join(', ');
    items.push({
      group: 'Technicians',
      label: tech.name,
      description: `${tech.status === 'active' ? 'Active' : 'Inactive'} · ${location || 'No assigned zone'}`,
      href: `/admin/tech-preview/${tech.id}/profile`,
      keywords: [tech.name, tech.email, tech.phone || '', location],
      icon: Users,
    });
  });

  data.dealerships.forEach((dealership) => {
    items.push({
      group: 'Records',
      label: dealership.name,
      description: `${dealership.city || dealership.address || 'Customer record'} · ${dealership.status}`,
      href: '/admin/dealerships',
      keywords: [dealership.name, dealership.city || '', dealership.address || '', dealership.code],
      icon: Building2,
    });
  });

  data.invoices.slice(0, 20).forEach((invoice) => {
    items.push({
      group: 'Invoices',
      label: invoice.invoice_number,
      description: `${invoice.dealership_name || 'Customer'} · ${invoice.status}`,
      href: invoice.status === 'draft' ? '/admin/invoice-approvals' : '/admin/invoice-history',
      keywords: [invoice.invoice_number, invoice.dealership_name || '', invoice.job_code || '', invoice.status],
      icon: FileCheck,
    });
  });

  return items.sort((left, right) => left.label.localeCompare(right.label));
}

function scoreSearchItem(item: SearchItem, query: string): number {
  if (!query) {
    return 1;
  }
  const needle = normalizeText(query);
  const haystack = normalizeText([item.label, item.description, ...item.keywords].join(' '));
  if (haystack.includes(needle)) {
    return 100;
  }
  const tokens = needle.split(' ').filter(Boolean);
  if (tokens.length === 0) {
    return 0;
  }
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  if (hits === 0) {
    return 0;
  }
  return (hits / tokens.length) * 70 + (haystack.startsWith(needle) ? 15 : 0);
}

function formatLastUpdated(value: string | null) {
  if (!value) {
    return 'Not synced yet';
  }
  return formatRelativeTime(value, new Date());
}

function WorkspaceSelector({
  workspace,
  onWorkspaceChange,
  compact = false,
  className,
}: {
  workspace: WorkspaceOption;
  onWorkspaceChange: (workspace: WorkspaceOption) => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center justify-between gap-3 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white',
            compact && 'w-full rounded-[22px] px-4 py-3',
            className,
          )}
          >
          <div className="min-w-0">
            <p className={cn('truncate text-xs font-semibold uppercase tracking-[0.18em]', compact ? 'text-white/70' : 'text-slate-500')}>
              {compact ? 'Organization' : 'Workspace'}
            </p>
            <p className={cn('truncate text-sm font-semibold', compact ? 'text-white' : 'text-slate-950')}>{workspace.name}</p>
          </div>
          <ChevronDown className={cn('h-4 w-4', compact ? 'text-white/70' : 'text-slate-400')} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-2xl border-slate-200 p-2 shadow-xl">
        <DropdownMenuLabel className="px-2 py-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Switch organization</p>
            <p className="text-sm text-slate-600">Pick a workspace for this session.</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={workspace.id} onValueChange={(value) => {
          const next = WORKSPACES.find((item) => item.id === value);
          if (next) {
            onWorkspaceChange(next);
          }
        }}>
          {WORKSPACES.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id} className="rounded-xl px-3 py-3">
              <div className="flex w-full flex-col items-start gap-0.5">
                <span className="text-sm font-semibold text-slate-900">{option.name}</span>
                <span className="text-xs text-slate-500">{option.plan} - {option.region}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlobalSearch({ items }: { items: SearchItem[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  const groupedResults = useMemo(() => {
    const scores = items
      .map((item) => ({ item, score: scoreSearchItem(item, query) }))
      .filter((entry) => query.trim() === '' || entry.score > 0)
      .sort((left, right) => right.score - left.score || left.item.label.localeCompare(right.item.label));

    const groups: Record<string, SearchItem[]> = {
      Pages: [],
      Jobs: [],
      Records: [],
      Invoices: [],
      Technicians: [],
    };

    scores.forEach(({ item }) => {
      groups[item.group].push(item);
    });

    return groups;
  }, [items, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white"
        >
          <Search className="h-4 w-4 text-slate-400" />
          <span className="min-w-0 flex-1 truncate text-sm text-slate-500">
            Search jobs, technicians, customers, invoices...
          </span>
          <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 xl:inline">
            Ctrl K
          </kbd>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(94vw,860px)] rounded-3xl border-slate-200 p-0 shadow-[0_30px_80px_rgba(15,23,42,0.18)]" align="center" sideOffset={12}>
        <Command shouldFilter={false} className="rounded-3xl">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search jobs, technicians, customers, invoices, and pages..."
          />
          <CommandList className="max-h-[420px] overflow-y-auto p-2">
            <CommandEmpty>No matches found.</CommandEmpty>
            {(['Pages', 'Jobs', 'Records', 'Invoices', 'Technicians'] as const).map((group) => {
              const groupItems = groupedResults[group];
              if (groupItems.length === 0) {
                return null;
              }
              return (
                <CommandGroup key={group} heading={group} className="px-1 py-1">
                  {groupItems.slice(0, 6).map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={`${group}-${item.label}-${item.href}`}
                        value={`${item.label} ${item.description}`}
                        onSelect={() => {
                          setOpen(false);
                          navigate(item.href);
                        }}
                        className="mb-1 rounded-2xl px-3 py-3"
                      >
                        <div className="flex w-full items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-slate-950">{item.label}</span>
                              <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-2 py-0 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                {item.group}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function NotificationMenu({ items }: { items: NotificationItem[] }) {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {items.length > 0 ? (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {items.length}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 rounded-3xl border-slate-200 p-2 shadow-xl">
        <DropdownMenuLabel className="px-2 py-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Notifications</p>
            <p className="text-sm text-slate-600">Live operational alerts and reminders.</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length > 0 ? items.map((item) => {
          const Icon = item.icon;
          const toneStyles = item.tone === 'critical'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : item.tone === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-sky-200 bg-sky-50 text-sky-700';
          return (
            <DropdownMenuItem
              key={item.id}
              className="mb-1 rounded-2xl px-3 py-3 focus:bg-slate-50"
              onClick={() => navigate(item.href)}
            >
              <div className="flex w-full items-start gap-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border', toneStyles)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-950">{item.label}</span>
                    <Badge variant="outline" className={cn('rounded-full px-2 py-0 text-[10px] uppercase tracking-[0.18em]', toneStyles)}>
                      {item.tone}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                </div>
              </div>
            </DropdownMenuItem>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
            No new notifications.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ planLabel }: { planLabel: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const roleLabel = user?.role === 'admin' ? 'Admin' : 'Technician';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/90 p-1.5 pl-2.5 pr-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white"
          >
            <Avatar className="h-8 w-8 border border-slate-200">
              <AvatarImage src={user?.avatar} alt={user?.name} />
              <AvatarFallback className="bg-slate-100 text-xs font-bold text-slate-700">
                {user?.name?.split(' ').map((part) => part[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden min-w-0 text-left md:block">
              <p className="truncate text-sm font-semibold text-slate-950">{user?.name || 'Admin'}</p>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-2 py-0 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {roleLabel}
                </Badge>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 rounded-3xl border-slate-200 p-2 shadow-xl">
          <DropdownMenuLabel className="px-2 py-2">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border border-slate-200">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback className="bg-slate-100 text-xs font-bold text-slate-700">
                  {user?.name?.split(' ').map((part) => part[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{user?.name || 'Admin User'}</p>
                <p className="truncate text-xs text-slate-500">{roleLabel}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white">
                {roleLabel}
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {planLabel}
              </Badge>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/admin/settings')} className="cursor-pointer rounded-2xl px-3 py-2.5">
            <Settings className="mr-2 h-4 w-4" />
            Profile settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPreviewModalOpen(true)} className="cursor-pointer rounded-2xl px-3 py-2.5">
            <Eye className="mr-2 h-4 w-4" />
            View as Technician
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} className="cursor-pointer rounded-2xl px-3 py-2.5 text-rose-600 focus:text-rose-600 focus:bg-rose-50">
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TechnicianPreviewModal
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
      />
    </>
  );
}

function Sidebar({
  isOpen,
  onClose,
  workspace,
  onWorkspaceChange,
  counts,
}: {
  isOpen: boolean;
  onClose: () => void;
  workspace: WorkspaceOption;
  onWorkspaceChange: (workspace: WorkspaceOption) => void;
  counts: ChromeCounts;
}) {
  const location = useLocation();

  return (
    <>
      {isOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={onClose} />
      ) : null}

      <aside
        className={cn(
          'admin-sidebar fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-slate-200 bg-white/95 shadow-[0_20px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 text-white shadow-lg shadow-sky-500/20">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-950">DispatchIQ</h1>
            <p className="text-xs font-medium text-slate-500">Operations Center</p>
          </div>
          <button
            type="button"
            className="ml-auto rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 lg:hidden"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-2">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const currentPath = `${location.pathname}${location.search}`;
                  const isActive = item.path.includes('?')
                    ? currentPath === item.path
                    : location.pathname === item.matchPath || (
                      item.matchPath !== '/admin' && location.pathname.startsWith(item.matchPath)
                    );
                  const badgeValue = item.badgeKey ? counts[item.badgeKey] : 0;

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={cn(
                        'group flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-all duration-200',
                        isActive
                          ? 'border-transparent bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 text-white shadow-[0_16px_30px_rgba(79,70,229,0.28)]'
                          : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900',
                      )}
                    >
                      <Icon className={cn('h-4.5 w-4.5 shrink-0', isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600')} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {badgeValue > 0 ? (
                        <span className={cn(
                          'ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
                          isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600',
                        )}>
                          {badgeValue}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Active workspace</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-950">{workspace.name}</h2>
                <p className="truncate text-xs text-slate-500">{workspace.plan} · {workspace.region}</p>
              </div>
              <Building2 className="h-5 w-5 shrink-0 text-slate-400" />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function buildHeaderTitle(pathname: string, search: string): string {
  const fullPath = `${pathname}${search}`;
  if (fullPath === '/admin/jobs?view=intake') {
    return 'Intake Queue';
  }
  if (fullPath === '/admin/dealerships?view=locations') {
    return 'Locations';
  }
  if (pathname.startsWith('/admin/tech-preview')) {
    return 'Technician Preview';
  }
  if (pathname.startsWith('/admin/jobs/') && pathname !== '/admin/jobs') {
    return 'Job Detail';
  }
  if (pathname === '/admin' || pathname === '/admin/') {
    return 'Dashboard';
  }

  const flatItems = NAV_SECTIONS.flatMap((section) => section.items);
  const matched = flatItems
    .sort((left, right) => right.matchPath.length - left.matchPath.length)
    .find((item) => pathname === item.matchPath || (item.matchPath !== '/admin' && pathname.startsWith(item.matchPath)));

  return matched?.label || 'Dashboard';
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceOption>(() => {
    if (typeof window === 'undefined') {
      return WORKSPACES[0];
    }
    const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return WORKSPACES.find((item) => item.id === stored) || WORKSPACES[0];
  });
  const [chromeData, setChromeData] = useState<ChromeData>({
    jobs: [],
    technicians: [],
    dealerships: [],
    invoices: [],
    customerConversationSummary: null,
    loadedAt: null,
    syncTone: 'live',
  });
  const [chromeError, setChromeError] = useState<string | null>(null);
  const [loadingChrome, setLoadingChrome] = useState(true);
  const [refreshingChrome, setRefreshingChrome] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const loadChromeData = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (background) {
      setRefreshingChrome(true);
    } else {
      setLoadingChrome(true);
    }

    const token = getStoredAdminToken();
    if (!token) {
      setChromeError('Admin session missing. Please sign in again.');
      setChromeData((prev) => ({
        ...prev,
        jobs: [],
        technicians: [],
        dealerships: [],
        invoices: [],
        customerConversationSummary: null,
        loadedAt: null,
        syncTone: 'critical',
      }));
      setLoadingChrome(false);
      setRefreshingChrome(false);
      return;
    }

    try {
      const [jobs, technicians, dealerships, invoices, customerConversationSummary] = await Promise.all([
        fetchAdminJobs(token),
        fetchAdminTechnicians(token),
        fetchAdminDealerships(token),
        fetchInvoices(token),
        fetchAdminCustomerConversationSummary(token),
      ]);

      setChromeData({
        jobs,
        technicians,
        dealerships,
        invoices,
        customerConversationSummary,
        loadedAt: new Date().toISOString(),
        syncTone: 'live',
      });
      setChromeError(null);
    } catch (error) {
      setChromeError(error instanceof Error ? error.message : 'Failed to load admin chrome.');
      setChromeData((prev) => ({
        ...prev,
        syncTone: background ? 'warning' : 'critical',
      }));
    } finally {
      setLoadingChrome(false);
      setRefreshingChrome(false);
    }
  }, []);

  useEffect(() => {
    void loadChromeData();

    const handleRefresh = () => {
      void loadChromeData({ background: true });
    };

    const handleFocus = () => {
      void loadChromeData({ background: true });
    };

    window.addEventListener(ADMIN_REFRESH_EVENT, handleRefresh);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener(ADMIN_REFRESH_EVENT, handleRefresh);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadChromeData]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace.id);
  }, [workspace]);

  const counts = useMemo(
    () => getCounts(chromeData.jobs, chromeData.technicians, chromeData.invoices, chromeData.customerConversationSummary),
    [chromeData.jobs, chromeData.technicians, chromeData.invoices, chromeData.customerConversationSummary],
  );
  const searchItems = useMemo(() => buildSearchItems(chromeData, counts), [chromeData, counts]);
  const notifications = useMemo(() => buildNotifications(counts, chromeData.syncTone), [counts, chromeData.syncTone]);
  const headerTitle = buildHeaderTitle(location.pathname, location.search);
  const lastSyncedLabel = chromeData.loadedAt ? formatLastUpdated(chromeData.loadedAt) : 'Not synced yet';
  const roleLabel = user?.role === 'admin' ? 'Admin' : 'Technician';
  const isDataBusy = loadingChrome || refreshingChrome;

  return (
    <div className="admin-shell min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)]">
      <div className="flex min-h-screen">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          workspace={workspace}
          onWorkspaceChange={setWorkspace}
          counts={counts}
        />

        <main className="flex min-w-0 flex-1 flex-col lg:pl-72">
          <header className="admin-topbar sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <div className="grid gap-3 px-4 py-3 lg:px-8 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm hover:bg-white lg:hidden"
                  onClick={() => setSidebarOpen((value) => !value)}
                  aria-label="Toggle navigation"
                >
                  {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">DispatchIQ</p>
                  <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950">{headerTitle}</h1>
                  <p className="truncate text-xs text-slate-500">Operations center for field dispatch, intake, and finance.</p>
                </div>
              </div>

              <div className="min-w-0">
                <GlobalSearch items={searchItems} />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="hidden xl:block">
                  <WorkspaceSelector workspace={workspace} onWorkspaceChange={setWorkspace} />
                </div>
                <Badge variant="outline" className="hidden rounded-full border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 2xl:inline-flex">
                  {roleLabel}
                </Badge>
                <Badge variant="outline" className="hidden rounded-full border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 2xl:inline-flex">
                  {workspace.plan}
                </Badge>
                <NotificationMenu items={notifications} />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-full border-slate-200 bg-white/90 text-slate-600 shadow-sm hover:bg-white"
                  onClick={() => window.dispatchEvent(new CustomEvent(ADMIN_REFRESH_EVENT))}
                  disabled={isDataBusy}
                  title="Refresh workspace data"
                >
                  <RefreshCw className={cn('h-4 w-4', isDataBusy && 'animate-spin')} />
                </Button>
                <span className="hidden rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm 2xl:inline-flex">
                  Updated {lastSyncedLabel}
                </span>
                <UserMenu planLabel={workspace.plan} />
              </div>
            </div>
          </header>

          {chromeError ? (
            <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:px-8">
              {chromeError}
            </div>
          ) : null}

          <div className="admin-content flex-1 overflow-y-auto p-4 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

