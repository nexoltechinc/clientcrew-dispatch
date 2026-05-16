import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BadgeInfo,
  Bot,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Inbox,
  Link2,
  MessageSquare,
  PenLine,
  RefreshCw,
  Send,
  ShieldAlert,
  Tag,
  UserCog,
  UserRound,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  addAdminCustomerConversationNote,
  assignAdminCustomerConversation,
  closeAdminCustomerConversation,
  convertAdminCustomerConversationToJob,
  createAdminCustomerConversationIntake,
  fetchAdminCustomerConversation,
  fetchAdminCustomerConversationSummary,
  fetchAdminCustomerConversations,
  fetchAdminJobs,
  fetchAdminTechnicians,
  getStoredAdminToken,
  joinAdminCustomerConversation,
  linkAdminCustomerConversationIntake,
  linkAdminCustomerConversationJob,
  markAdminCustomerConversationRead,
  markAdminCustomerConversationUrgent,
  replyAdminCustomerConversation,
  escalateAdminCustomerConversation,
  updateAdminCustomerConversationStatus,
  type BackendAdminJob,
  type BackendCustomerConversationCollectedFields,
  type BackendCustomerConversationDetail,
  type BackendCustomerConversationListItem,
  type BackendCustomerConversationMessage,
  type BackendCustomerConversationStatus,
  type BackendCustomerConversationSummary,
  type BackendCustomerConversationUrgency,
  type BackendTechnicianListItem,
} from '@/lib/backend-api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

type InboxFilters = {
  status: string;
  assigned_agent: string;
  urgency: string;
  service_type: string;
  source_channel: string;
  date_from: string;
  date_to: string;
  unread_only: boolean;
  search: string;
};

type IntakeFormState = {
  status: 'new' | 'reviewed';
  customer_name: string;
  contact_person: string;
  phone: string;
  email: string;
  requested_service_text: string;
  matched_service_id: string;
  matched_service_name: string;
  vehicle_description: string;
  vehicle_unit_or_stock_number: string;
  preferred_date: string;
  preferred_time: string;
  location_branch: string;
  urgency: BackendCustomerConversationUrgency;
  notes: string;
};

type ConvertFormState = {
  dealership_name: string;
  service_name: string;
  service_names_csv: string;
  vehicle_summary: string;
  requested_service_date: string;
  requested_service_time: string;
  pre_assigned_technician_id: string;
  notes: string;
  create_intake_first: boolean;
};

type ServiceCandidate = NonNullable<BackendCustomerConversationCollectedFields['matched_service_candidates']>[number];

const STATUS_LABELS: Record<BackendCustomerConversationStatus, string> = {
  bot_active: 'Bot Active',
  waiting_for_agent: 'Waiting for Agent',
  agent_joined: 'Agent Joined',
  intake_created: 'Intake Created',
  converted_to_job: 'Converted to Job',
  waiting_for_customer: 'Waiting for Customer',
  closed: 'Closed',
  escalated: 'Escalated',
  missed: 'Missed',
};

const SOURCE_LABELS: Record<string, string> = {
  website_chatbot: 'Website Chatbot',
  customer_portal: 'Customer Portal',
  booking_form: 'Booking Form',
  status_page: 'Status Page',
};

const URGENCY_LABELS: Record<BackendCustomerConversationUrgency, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const STATUS_TONES: Record<BackendCustomerConversationStatus, string> = {
  bot_active: 'border-slate-200 bg-slate-50 text-slate-700',
  waiting_for_agent: 'border-amber-200 bg-amber-50 text-amber-700',
  agent_joined: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  intake_created: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  converted_to_job: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  waiting_for_customer: 'border-orange-200 bg-orange-50 text-orange-700',
  closed: 'border-slate-200 bg-slate-100 text-slate-600',
  escalated: 'border-rose-200 bg-rose-50 text-rose-700',
  missed: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
};

const URGENCY_TONES: Record<BackendCustomerConversationUrgency, string> = {
  low: 'border-slate-200 bg-slate-50 text-slate-700',
  normal: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  high: 'border-orange-200 bg-orange-50 text-orange-700',
  urgent: 'border-rose-200 bg-rose-50 text-rose-700',
};

const SOURCE_TONES: Record<string, string> = {
  website_chatbot: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  customer_portal: 'border-slate-200 bg-slate-50 text-slate-700',
  booking_form: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  status_page: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const INITIAL_FILTERS: InboxFilters = {
  status: '',
  assigned_agent: '',
  urgency: '',
  service_type: '',
  source_channel: '',
  date_from: '',
  date_to: '',
  unread_only: false,
  search: '',
};

const EMPTY_INTAKE_FORM: IntakeFormState = {
  status: 'new',
  customer_name: '',
  contact_person: '',
  phone: '',
  email: '',
  requested_service_text: '',
  matched_service_id: '',
  matched_service_name: '',
  vehicle_description: '',
  vehicle_unit_or_stock_number: '',
  preferred_date: '',
  preferred_time: '',
  location_branch: '',
  urgency: 'normal',
  notes: '',
};

const EMPTY_CONVERT_FORM: ConvertFormState = {
  dealership_name: '',
  service_name: '',
  service_names_csv: '',
  vehicle_summary: '',
  requested_service_date: '',
  requested_service_time: '',
  pre_assigned_technician_id: '',
  notes: '',
  create_intake_first: true,
};

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const now = new Date();
  const diffMinutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateOnly(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function toDateInputValue(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function toTimeInputValue(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 5);
}

function joinServiceNames(candidate: ServiceCandidate | undefined, fallback: string): string {
  if (candidate) return candidate.name;
  return fallback;
}

function normalizeStatus(value?: string | null): BackendCustomerConversationStatus | string {
  return (value || '').toLowerCase().replace(/[\s-]+/g, '_');
}

function statusLabel(status: string): string {
  return STATUS_LABELS[normalizeStatus(status) as BackendCustomerConversationStatus] ?? 'Unknown';
}

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function urgencyLabel(urgency: string): string {
  const normalized = (urgency || 'normal') as BackendCustomerConversationUrgency;
  return URGENCY_LABELS[normalized] ?? 'Normal';
}

function initIntakeForm(detail: BackendCustomerConversationDetail): IntakeFormState {
  const candidates = detail.collected_fields.matched_service_candidates;
  const fallbackServiceId = detail.collected_fields.matched_service_id ?? candidates[0]?.id ?? '';
  const fallbackServiceName = detail.collected_fields.matched_service_name ?? candidates.find((candidate) => candidate.id === fallbackServiceId)?.name ?? '';
  return {
    status: detail.linked_intake?.status === 'reviewed' ? 'reviewed' : 'new',
    customer_name: detail.customer_profile.dealership_name ?? detail.customer_name ?? '',
    contact_person: detail.customer_profile.contact_person ?? detail.contact_person ?? '',
    phone: detail.customer_profile.phone ?? detail.phone ?? '',
    email: detail.customer_profile.email ?? detail.email ?? '',
    requested_service_text: detail.collected_fields.requested_service_text ?? detail.requested_service ?? '',
    matched_service_id: fallbackServiceId,
    matched_service_name: fallbackServiceName,
    vehicle_description: detail.collected_fields.vehicle_description ?? '',
    vehicle_unit_or_stock_number: detail.collected_fields.vehicle_unit_or_stock_number ?? '',
    preferred_date: toDateInputValue(detail.collected_fields.preferred_date ?? detail.linked_intake?.preferred_date),
    preferred_time: toTimeInputValue(detail.collected_fields.preferred_time ?? detail.linked_intake?.preferred_time),
    location_branch: detail.collected_fields.service_location_or_branch ?? detail.linked_intake?.location_branch ?? '',
    urgency: detail.collected_fields.urgency ?? 'normal',
    notes: detail.collected_fields.special_notes ?? detail.linked_intake?.notes ?? '',
  };
}

function initConvertForm(detail: BackendCustomerConversationDetail): ConvertFormState {
  const candidates = detail.collected_fields.matched_service_candidates;
  const candidate = candidates[0];
  return {
    dealership_name: detail.customer_profile.dealership_name ?? detail.customer_name ?? '',
    service_name: detail.collected_fields.matched_service_name ?? candidate?.name ?? detail.requested_service ?? '',
    service_names_csv: detail.collected_fields.requested_service_text ?? '',
    vehicle_summary: detail.collected_fields.vehicle_description ?? detail.linked_intake?.vehicle_description ?? '',
    requested_service_date: toDateInputValue(detail.collected_fields.preferred_date ?? detail.linked_intake?.preferred_date),
    requested_service_time: toTimeInputValue(detail.collected_fields.preferred_time ?? detail.linked_intake?.preferred_time),
    pre_assigned_technician_id: '',
    notes: detail.collected_fields.special_notes ?? detail.linked_intake?.notes ?? '',
    create_intake_first: !detail.linked_intake,
  };
}

function ConversationListItem({
  item,
  selected,
  onClick,
}: {
  item: BackendCustomerConversationListItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl border p-3 text-left transition-all duration-200',
        selected
          ? 'border-cyan-300 bg-cyan-50/70 shadow-sm ring-1 ring-cyan-200'
          : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-slate-50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-950">{item.customer_name || item.dealership_name || 'Unknown customer'}</p>
            {item.unread_count > 0 ? (
              <Badge className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                {item.unread_count} unread
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">
            {item.contact_person || 'No contact'}{item.phone ? ` · ${item.phone}` : ''}{item.email ? ` · ${item.email}` : ''}
          </p>
        </div>
        <Badge variant="outline" className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]', SOURCE_TONES[item.source_channel])}>
          {sourceLabel(item.source_channel)}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline" className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]', STATUS_TONES[normalizeStatus(item.status) as BackendCustomerConversationStatus] ?? 'border-slate-200 bg-slate-50 text-slate-700')}>
          {statusLabel(item.status)}
        </Badge>
        <Badge variant="outline" className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]', URGENCY_TONES[item.urgency])}>
          {urgencyLabel(item.urgency)}
        </Badge>
      </div>

      <div className="mt-3 space-y-1">
        <p className="line-clamp-2 text-sm text-slate-700">{item.last_message_preview || item.requested_service || 'No message preview available.'}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span>{item.assigned_admin_label || 'Unassigned'}</span>
          <span>Created {formatRelativeTime(item.created_at)}</span>
          <span>Updated {formatRelativeTime(item.last_activity_at)}</span>
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ message }: { message: BackendCustomerConversationMessage }) {
  const isCustomer = message.sender_type === 'customer';
  const isAdmin = message.sender_type === 'admin';
  const isBot = message.sender_type === 'bot';
  const isSystem = message.sender_type === 'system';

  return (
    <div
      className={cn(
        'flex w-full',
        isCustomer ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl border px-4 py-3 text-sm shadow-sm',
          isCustomer && 'border-cyan-200 bg-cyan-50 text-slate-900',
          isAdmin && 'border-emerald-200 bg-emerald-50 text-slate-900',
          isBot && 'border-slate-200 bg-white text-slate-900',
          isSystem && 'border-dashed border-slate-300 bg-slate-50 text-slate-600',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {message.sender_label || message.sender_type}
          </p>
          <p className="text-[11px] text-slate-400">{formatDateTime(message.created_at)}</p>
        </div>
        <p className="mt-2 whitespace-pre-wrap leading-6">{message.body}</p>
        {message.attachment_url ? (
          <a
            href={message.attachment_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-white"
          >
            <Link2 className="h-3.5 w-3.5" />
            {message.attachment_name || 'Attachment'}
          </a>
        ) : null}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
          {message.delivered_at ? <span>Delivered</span> : null}
          {message.read_at ? <span>Read</span> : null}
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
  subtitle,
}: {
  title: string;
  icon: typeof Inbox;
  children: ReactNode;
  subtitle?: string;
}) {
  return (
    <Card className="rounded-3xl border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export default function CustomerConversationsPage() {
  const navigate = useNavigate();
  const params = useParams<{ conversationId?: string }>();
  const routeConversationId = params.conversationId ?? null;
  const token = getStoredAdminToken();

  const [summary, setSummary] = useState<BackendCustomerConversationSummary | null>(null);
  const [conversations, setConversations] = useState<BackendCustomerConversationListItem[]>([]);
  const [detail, setDetail] = useState<BackendCustomerConversationDetail | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(routeConversationId);
  const [technicians, setTechnicians] = useState<BackendTechnicianListItem[]>([]);
  const [jobs, setJobs] = useState<BackendAdminJob[]>([]);

  const [filters, setFilters] = useState<InboxFilters>(INITIAL_FILTERS);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [assignmentLabel, setAssignmentLabel] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [linkIntakeNumber, setLinkIntakeNumber] = useState('');
  const [linkJobCode, setLinkJobCode] = useState('');
  const [reviewedInactiveAccount, setReviewedInactiveAccount] = useState(false);

  const [intakeDialogOpen, setIntakeDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [intakeForm, setIntakeForm] = useState<IntakeFormState>(EMPTY_INTAKE_FORM);
  const [convertForm, setConvertForm] = useState<ConvertFormState>(EMPTY_CONVERT_FORM);

  const activeConversation = detail;
  const statusIsClosed = activeConversation?.status === 'closed';

  const linkableJobs = useMemo(() => {
    return jobs.filter((job) => {
      const normalized = normalizeStatus(job.status);
      return normalized !== 'completed' && normalized !== 'cancelled';
    });
  }, [jobs]);

  useEffect(() => {
    if (routeConversationId) {
      setSelectedConversationId(routeConversationId);
    }
  }, [routeConversationId]);

  useEffect(() => {
    if (!token) {
      setPageError('Admin session missing. Please sign in again.');
      return;
    }

    let alive = true;
    const loadReferenceData = async () => {
      try {
        const [techRows, jobRows] = await Promise.all([
          fetchAdminTechnicians(token),
          fetchAdminJobs(token),
        ]);
        if (!alive) return;
        setTechnicians(techRows);
        setJobs(jobRows);
      } catch (error) {
        if (!alive) return;
        setPageError(error instanceof Error ? error.message : 'Failed to load admin reference data.');
      }
    };

    void loadReferenceData();
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;

    let alive = true;
    const timer = window.setTimeout(async () => {
      setListLoading(true);
      try {
        const [summaryRow, listRows] = await Promise.all([
          fetchAdminCustomerConversationSummary(token),
          fetchAdminCustomerConversations(token, {
            status: filters.status || undefined,
            assigned_agent: filters.assigned_agent || undefined,
            urgency: filters.urgency || undefined,
            service_type: filters.service_type || undefined,
            source_channel: filters.source_channel || undefined,
            date_from: filters.date_from || undefined,
            date_to: filters.date_to || undefined,
            unread_only: filters.unread_only,
            search: filters.search || undefined,
          }),
        ]);
        if (!alive) return;
        setSummary(summaryRow);
        setConversations(listRows);
        setPageError(null);

        if (!routeConversationId && !selectedConversationId && listRows.length > 0) {
          const firstConversation = listRows[0];
          setSelectedConversationId(firstConversation.id);
          navigate(`/admin/customer-conversations/${firstConversation.id}`, { replace: true });
        }
      } catch (error) {
        if (!alive) return;
        const message = error instanceof Error ? error.message : 'Failed to load customer conversations.';
        setPageError(message);
        toast.error(message);
      } finally {
        if (alive) {
          setListLoading(false);
        }
      }
    }, 180);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [filters, navigate, routeConversationId, selectedConversationId, token]);

  useEffect(() => {
    if (!token || !selectedConversationId) {
      setDetail(null);
      setConversationError(null);
      return;
    }

    let alive = true;
    const loadDetail = async () => {
      setDetailLoading(true);
      setConversationError(null);
      try {
        let row = await fetchAdminCustomerConversation(token, selectedConversationId);
        if (!alive) return;
        setAssignmentLabel(row.assigned_admin_label ?? '');
        setReplyText('');
        setNoteText('');
        setStatusNote('');
        setLinkIntakeNumber(row.linked_intake?.intake_number ?? '');
        setLinkJobCode(row.linked_job?.job_code ?? '');
        setReviewedInactiveAccount(false);
        if (row.unread_count > 0) {
          row = await markAdminCustomerConversationRead(token, selectedConversationId);
          if (!alive) return;
          setConversations((current) =>
            current.map((item) => (item.id === row.id ? { ...item, unread_count: 0 } : item)),
          );
          setSummary((current) =>
            current ? { ...current, unread: Math.max(0, current.unread - 1) } : current,
          );
          window.dispatchEvent(new CustomEvent('dispatchiq:admin-refresh'));
        }
        setDetail(row);
      } catch (error) {
        if (!alive) return;
        const message = error instanceof Error ? error.message : 'Failed to load customer conversation.';
        setConversationError(message);
        toast.error(message);
        setDetail(null);
      } finally {
        if (alive) {
          setDetailLoading(false);
        }
      }
    };

    void loadDetail();
    return () => {
      alive = false;
    };
  }, [selectedConversationId, token]);

  useEffect(() => {
    if (!activeConversation) return;
    setIntakeForm(initIntakeForm(activeConversation));
    setConvertForm(initConvertForm(activeConversation));
  }, [activeConversation?.id]);

  const serviceCandidates = activeConversation?.collected_fields.matched_service_candidates ?? [];
  const confirmedService = serviceCandidates.find((candidate) => candidate.id === intakeForm.matched_service_id) ?? serviceCandidates[0];

  const refreshSelectedConversation = async () => {
    if (!token || !selectedConversationId) return;
    const [summaryRow, listRows, refreshed] = await Promise.all([
      fetchAdminCustomerConversationSummary(token),
      fetchAdminCustomerConversations(token, {
        status: filters.status || undefined,
        assigned_agent: filters.assigned_agent || undefined,
        urgency: filters.urgency || undefined,
        service_type: filters.service_type || undefined,
        source_channel: filters.source_channel || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        unread_only: filters.unread_only,
        search: filters.search || undefined,
      }),
      fetchAdminCustomerConversation(token, selectedConversationId),
    ]);
    setSummary(summaryRow);
    setConversations(listRows);
    setDetail(refreshed);
    window.dispatchEvent(new CustomEvent('dispatchiq:admin-refresh'));
  };

  const withBusyAction = async (key: string, task: () => Promise<void>) => {
    if (!token || !selectedConversationId) return;
    setActionBusy(key);
    try {
      await task();
      await refreshSelectedConversation();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed.';
      toast.error(message);
    } finally {
      setActionBusy(null);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    navigate(`/admin/customer-conversations/${conversationId}`);
  };

  const handleReply = async () => {
    const message = replyText.trim();
    if (!token || !selectedConversationId || !message) return;
    await withBusyAction('reply', async () => {
      await replyAdminCustomerConversation(token, selectedConversationId, { message });
      setReplyText('');
      toast.success('Reply sent to customer');
    });
  };

  const handleJoin = async () => {
    if (!token || !selectedConversationId) return;
    await withBusyAction('join', async () => {
      await joinAdminCustomerConversation(token, selectedConversationId);
      toast.success('Joined the conversation');
    });
  };

  const handleAssignToMe = async () => {
    if (!token || !selectedConversationId) return;
    await withBusyAction('assign-me', async () => {
      await assignAdminCustomerConversation(token, selectedConversationId, { assign_to_me: true });
      toast.success('Assigned to you');
    });
  };

  const handleReassign = async () => {
    if (!token || !selectedConversationId) return;
    const label = assignmentLabel.trim();
    if (!label) {
      toast.error('Enter an admin or agent label first.');
      return;
    }
    await withBusyAction('reassign', async () => {
      await assignAdminCustomerConversation(token, selectedConversationId, { assigned_agent_label: label });
      toast.success('Conversation reassigned');
    });
  };

  const handleClearAssignment = async () => {
    if (!token || !selectedConversationId) return;
    await withBusyAction('clear-assignment', async () => {
      await assignAdminCustomerConversation(token, selectedConversationId, { clear_assignment: true });
      setAssignmentLabel('');
      toast.success('Assignment cleared');
    });
  };

  const handleStatusUpdate = async (status: BackendCustomerConversationStatus) => {
    if (!token || !selectedConversationId) return;
    await withBusyAction(`status-${status}`, async () => {
      await updateAdminCustomerConversationStatus(token, selectedConversationId, {
        status,
        reason: statusNote.trim() || undefined,
      });
      if (status === 'waiting_for_customer' || status === 'closed' || status === 'escalated') {
        setStatusNote('');
      }
      toast.success(`Conversation marked as ${statusLabel(status)}`);
    });
  };

  const handleCloseConversation = async () => {
    if (!token || !selectedConversationId) return;
    await withBusyAction('close-conversation', async () => {
      await closeAdminCustomerConversation(token, selectedConversationId, statusNote.trim() || null);
      setStatusNote('');
      toast.success('Conversation closed');
    });
  };

  const handleEscalateConversation = async () => {
    if (!token || !selectedConversationId) return;
    await withBusyAction('escalate-conversation', async () => {
      await escalateAdminCustomerConversation(token, selectedConversationId, statusNote.trim() || null);
      setStatusNote('');
      toast.success('Conversation escalated');
    });
  };

  const handleMarkUrgent = async () => {
    if (!token || !selectedConversationId) return;
    await withBusyAction('urgent', async () => {
      await markAdminCustomerConversationUrgent(token, selectedConversationId);
      toast.success('Conversation marked urgent');
    });
  };

  const handleAddNote = async () => {
    const note = noteText.trim();
    if (!token || !selectedConversationId || !note) return;
    await withBusyAction('note', async () => {
      await addAdminCustomerConversationNote(token, selectedConversationId, note);
      setNoteText('');
      toast.success('Internal note added');
    });
  };

  const handleLinkIntake = async () => {
    if (!token || !selectedConversationId) return;
    const value = linkIntakeNumber.trim();
    if (!value) {
      toast.error('Enter an intake number first.');
      return;
    }
    await withBusyAction('link-intake', async () => {
      await linkAdminCustomerConversationIntake(token, selectedConversationId, { intake_number: value });
      toast.success('Linked existing intake');
    });
  };

  const handleLinkJob = async () => {
    if (!token || !selectedConversationId) return;
    const value = linkJobCode.trim();
    if (!value) {
      toast.error('Select or enter a job code first.');
      return;
    }
    await withBusyAction('link-job', async () => {
      await linkAdminCustomerConversationJob(token, selectedConversationId, { job_code: value });
      toast.success('Linked existing job');
    });
  };

  const handleCreateIntake = async () => {
    if (!token || !selectedConversationId || !activeConversation) return;
    if (activeConversation.is_inactive_account_warning && !reviewedInactiveAccount) {
      toast.error('Review the inactive account warning before creating intake.');
      return;
    }
    if (activeConversation.is_service_match_ambiguous && !intakeForm.matched_service_id) {
      toast.error('Choose a service match before creating intake.');
      return;
    }

    setActionBusy('create-intake');
    try {
      await createAdminCustomerConversationIntake(token, selectedConversationId, {
        status: intakeForm.status,
        customer_name: intakeForm.customer_name.trim() || null,
        contact_person: intakeForm.contact_person.trim() || null,
        phone: intakeForm.phone.trim() || null,
        email: intakeForm.email.trim() || null,
        requested_service_text: intakeForm.requested_service_text.trim() || null,
        matched_service_id: intakeForm.matched_service_id || null,
        matched_service_name: intakeForm.matched_service_name.trim() || null,
        vehicle_description: intakeForm.vehicle_description.trim() || null,
        vehicle_unit_or_stock_number: intakeForm.vehicle_unit_or_stock_number.trim() || null,
        preferred_date: intakeForm.preferred_date || null,
        preferred_time: intakeForm.preferred_time || null,
        location_branch: intakeForm.location_branch.trim() || null,
        urgency: intakeForm.urgency,
        notes: intakeForm.notes.trim() || null,
      });
      setIntakeDialogOpen(false);
      setReviewedInactiveAccount(false);
      toast.success('Intake created');
      await refreshSelectedConversation();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save intake.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleConvertToJob = async () => {
    if (!token || !selectedConversationId || !activeConversation) return;
    if (activeConversation.is_inactive_account_warning && !reviewedInactiveAccount) {
      toast.error('Review the inactive account warning before converting to a job.');
      return;
    }
    if (activeConversation.is_service_match_ambiguous && !convertForm.service_name.trim()) {
      toast.error('Choose a service name before converting to a job.');
      return;
    }

    const serviceNames = Array.from(
      new Set(
        [convertForm.service_name, ...convertForm.service_names_csv.split(',')]
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );

    setActionBusy('convert-job');
    try {
      await convertAdminCustomerConversationToJob(token, selectedConversationId, {
        dealership_name: convertForm.dealership_name.trim() || null,
        service_name: convertForm.service_name.trim() || null,
        service_names: serviceNames,
        vehicle_summary: convertForm.vehicle_summary.trim() || null,
        requested_service_date: convertForm.requested_service_date || null,
        requested_service_time: convertForm.requested_service_time || null,
        pre_assigned_technician_id: convertForm.pre_assigned_technician_id || null,
        notes: convertForm.notes.trim() || null,
        create_intake_first: convertForm.create_intake_first,
      });
      setConvertDialogOpen(false);
      setReviewedInactiveAccount(false);
      toast.success('Conversation converted into a job');
      await refreshSelectedConversation();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to convert to job.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleOpenIntakeDialog = () => {
    if (!activeConversation) return;
    setIntakeForm(initIntakeForm(activeConversation));
    setIntakeDialogOpen(true);
  };

  const handleOpenConvertDialog = () => {
    if (!activeConversation) return;
    setConvertForm(initConvertForm(activeConversation));
    setConvertDialogOpen(true);
  };

  const conversationCounts = summary
    ? [
        { label: 'Unread', value: summary.unread, tone: 'border-rose-200 bg-rose-50 text-rose-700' },
        { label: 'Waiting for Agent', value: summary.waiting_for_agent, tone: 'border-amber-200 bg-amber-50 text-amber-700' },
        { label: 'Urgent', value: summary.urgent, tone: 'border-rose-200 bg-rose-50 text-rose-700' },
        { label: 'Missed', value: summary.missed, tone: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#eefaf9_100%)] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-700">
              <Inbox className="h-3.5 w-3.5" />
              Customer Conversations
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Customer inbox and intake control center</h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Review chatbot requests, reply in real time, create intake records, and convert qualified conversations into jobs without exposing internal dispatch details to customers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="rounded-full border-slate-200 bg-white/90 text-slate-700 shadow-sm hover:bg-white"
              onClick={() => {
                void refreshSelectedConversation();
              }}
              disabled={listLoading || detailLoading}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', (listLoading || detailLoading) && 'animate-spin')} />
              Refresh
            </Button>
            {conversationCounts.map((item) => (
              <Badge key={item.label} variant="outline" className={cn('rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]', item.tone)}>
                {item.label}: {item.value}
              </Badge>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Queue status</p>
            <p className="mt-2 text-sm text-slate-600">
              {summary ? `${summary.total} conversation${summary.total === 1 ? '' : 's'} in the inbox.` : 'Loading conversation queue...'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Current selection</p>
            <p className="mt-2 text-sm text-slate-600">
              {activeConversation ? `${activeConversation.reference_number} · ${statusLabel(activeConversation.status)}` : 'No conversation selected yet.'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Last activity</p>
            <p className="mt-2 text-sm text-slate-600">
              {activeConversation ? formatDateTime(activeConversation.last_activity_at) : 'Waiting for a selection'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Routing source</p>
            <p className="mt-2 text-sm text-slate-600">
              {activeConversation ? sourceLabel(activeConversation.source_channel) : 'Website chat, portal, or booking form'}
            </p>
          </div>
        </div>
      </div>

      {pageError ? (
        <Card className="rounded-3xl border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {pageError}
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        <section className="space-y-4">
          <SectionCard
            title="Filters"
            icon={BadgeInfo}
            subtitle="Narrow the inbox by queue, source, urgency, service, or unread state."
          >
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="search">Search</Label>
                  <Input
                    id="search"
                    value={filters.search}
                    onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                    placeholder="Customer, dealership, phone, email, job code, reference, service"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status-filter">Status</Label>
                  <Select value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}>
                    <SelectTrigger id="status-filter">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="urgency-filter">Urgency</Label>
                  <Select value={filters.urgency} onValueChange={(value) => setFilters((current) => ({ ...current, urgency: value }))}>
                    <SelectTrigger id="urgency-filter">
                      <SelectValue placeholder="All urgency levels" />
                    </SelectTrigger>
                    <SelectContent>
              {Object.entries(URGENCY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source-filter">Source</Label>
                  <Select value={filters.source_channel} onValueChange={(value) => setFilters((current) => ({ ...current, source_channel: value }))}>
                    <SelectTrigger id="source-filter">
                      <SelectValue placeholder="All sources" />
                    </SelectTrigger>
                    <SelectContent>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="service-filter">Service type</Label>
                  <Input
                    id="service-filter"
                    value={filters.service_type}
                    onChange={(event) => setFilters((current) => ({ ...current, service_type: event.target.value }))}
                    placeholder="PPF, tint, detailing, wash, roadside..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assigned-filter">Assigned agent</Label>
                  <Input
                    id="assigned-filter"
                    value={filters.assigned_agent}
                    onChange={(event) => setFilters((current) => ({ ...current, assigned_agent: event.target.value }))}
                    placeholder="Dispatcher or admin label"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="date-from">Date from</Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={filters.date_from}
                    onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date-to">Date to</Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={filters.date_to}
                    onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">Unread only</p>
                  <p className="text-xs text-slate-500">Show conversations still waiting on a response.</p>
                </div>
                <Checkbox
                  checked={filters.unread_only}
                  onCheckedChange={(checked) => setFilters((current) => ({ ...current, unread_only: checked === true }))}
                />
              </div>

              <Button
                variant="outline"
                className="rounded-full border-slate-200"
                onClick={() => setFilters(INITIAL_FILTERS)}
              >
                Reset filters
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            title="Conversation Queue"
            icon={Inbox}
            subtitle={listLoading ? 'Loading conversations...' : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'} match the current filter set.`}
          >
            <ScrollArea className="h-[44rem] pr-2">
              <div className="space-y-3">
                {listLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <Skeleton className="h-4 w-44" />
                      <Skeleton className="mt-3 h-4 w-full" />
                      <Skeleton className="mt-2 h-4 w-3/4" />
                    </div>
                  ))
                ) : conversations.length > 0 ? (
                  conversations.map((item) => (
                    <ConversationListItem
                      key={item.id}
                      item={item}
                      selected={item.id === selectedConversationId}
                      onClick={() => handleSelectConversation(item.id)}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                    <Inbox className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm font-medium text-slate-900">No conversations found</p>
                    <p className="mt-1 text-sm text-slate-500">Try widening the filters or waiting for new customer messages.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </SectionCard>
        </section>

        <section className="space-y-4">
          <SectionCard
            title={activeConversation ? `Conversation ${activeConversation.reference_number}` : 'Conversation Thread'}
            icon={MessageSquare}
            subtitle={activeConversation ? `${statusLabel(activeConversation.status)} · ${sourceLabel(activeConversation.source_channel)} · Updated ${formatRelativeTime(activeConversation.last_activity_at)}` : 'Select a conversation from the inbox to review the thread.'}
          >
            {conversationError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {conversationError}
              </div>
            ) : null}

            {detailLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-11/12 rounded-2xl" />
                <Skeleton className="h-20 w-4/5 rounded-2xl" />
              </div>
            ) : activeConversation ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]', STATUS_TONES[normalizeStatus(activeConversation.status) as BackendCustomerConversationStatus] ?? 'border-slate-200 bg-slate-50 text-slate-700')}>
                    {statusLabel(activeConversation.status)}
                  </Badge>
                  <Badge variant="outline" className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]', URGENCY_TONES[activeConversation.urgency])}>
                    {urgencyLabel(activeConversation.urgency)}
                  </Badge>
                  <Badge variant="outline" className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]', SOURCE_TONES[activeConversation.source_channel])}>
                    {sourceLabel(activeConversation.source_channel)}
                  </Badge>
                  {activeConversation.assigned_admin_label ? (
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      Assigned to {activeConversation.assigned_admin_label}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Unassigned
                    </Badge>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    className="rounded-full border-slate-200"
                    onClick={() => {
                      void handleJoin();
                    }}
                    disabled={statusIsClosed || actionBusy === 'join'}
                  >
                    <Bot className="mr-2 h-4 w-4" />
                    Join conversation
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full border-slate-200"
                    onClick={() => {
                      void handleAssignToMe();
                    }}
                    disabled={statusIsClosed || actionBusy === 'assign-me'}
                  >
                    <UserCog className="mr-2 h-4 w-4" />
                    Assign to me
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full border-slate-200"
                    onClick={() => {
                      void handleMarkUrgent();
                    }}
                    disabled={actionBusy === 'urgent'}
                  >
                    <AlertCircle className="mr-2 h-4 w-4" />
                    Mark urgent
                  </Button>
                </div>

                <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Reply to customer</p>
                      <p className="text-sm text-slate-500">Keep the response customer-safe and avoid internal dispatch details.</p>
                    </div>
                    {statusIsClosed ? (
                      <Badge className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Closed</Badge>
                    ) : null}
                  </div>
                  <Textarea
                    className="mt-4 min-h-[120px] rounded-2xl border-slate-200 bg-white"
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder="Type the customer reply here..."
                    disabled={statusIsClosed || actionBusy === 'reply'}
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">Attachments are supported if the backend provides a file URL.</p>
                    <Button
                      onClick={() => {
                        void handleReply();
                      }}
                      disabled={statusIsClosed || !replyText.trim() || actionBusy === 'reply'}
                      className="rounded-full bg-cyan-600 px-5 text-white hover:bg-cyan-700"
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Send reply
                    </Button>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="min-w-[220px] flex-1">
                    <Label htmlFor="status-note">Status reason or follow-up note</Label>
                    <Textarea
                      id="status-note"
                      className="mt-2 min-h-[96px] rounded-2xl border-slate-200"
                      value={statusNote}
                      onChange={(event) => setStatusNote(event.target.value)}
                      placeholder="Optional reason for waiting, closing, or escalation"
                    />
                  </div>
                  <div className="flex min-w-[220px] flex-1 flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="rounded-full border-slate-200"
                      onClick={() => {
                        void handleStatusUpdate('waiting_for_customer');
                      }}
                      disabled={actionBusy === 'status-waiting_for_customer'}
                    >
                      <Clock3 className="mr-2 h-4 w-4" />
                      Waiting for customer
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full border-slate-200"
                      onClick={() => {
                        void handleEscalateConversation();
                      }}
                      disabled={actionBusy === 'escalate-conversation'}
                    >
                      <ShieldAlert className="mr-2 h-4 w-4" />
                      Escalate
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full border-slate-200"
                      onClick={() => {
                        void handleCloseConversation();
                      }}
                      disabled={actionBusy === 'close-conversation'}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Close conversation
                    </Button>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Thread</p>
                      <p className="text-sm text-slate-500">Bot, customer, admin, and system messages are kept in one traceable timeline.</p>
                    </div>
                    <Button
                      variant="outline"
                      className="rounded-full border-slate-200"
                      onClick={() => {
                        void refreshSelectedConversation();
                      }}
                      disabled={actionBusy !== null}
                    >
                      <RefreshCw className={cn('mr-2 h-4 w-4', actionBusy !== null && 'animate-spin')} />
                      Refresh thread
                    </Button>
                  </div>

                  <ScrollArea className="max-h-[40rem] pr-2">
                    <div className="space-y-4">
                      {activeConversation.messages.length > 0 ? (
                        activeConversation.messages.map((message) => (
                          <MessageBubble key={message.id} message={message} />
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                          No messages yet.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                <MessageSquare className="mx-auto h-10 w-10 text-slate-300" />
                <h2 className="mt-4 text-lg font-semibold text-slate-950">Pick a conversation</h2>
                <p className="mt-2 text-sm text-slate-500">Select a customer thread on the left to review the chatbot history and take action.</p>
              </div>
            )}
          </SectionCard>

          {activeConversation ? (
            <div className="xl:hidden">
              <ContextRail
                detail={activeConversation}
                intakeForm={intakeForm}
                setIntakeForm={setIntakeForm}
                convertForm={convertForm}
                setConvertForm={setConvertForm}
                technicians={technicians}
                jobs={linkableJobs}
                reviewedInactiveAccount={reviewedInactiveAccount}
                setReviewedInactiveAccount={setReviewedInactiveAccount}
                noteText={noteText}
                setNoteText={setNoteText}
                assignmentLabel={assignmentLabel}
                setAssignmentLabel={setAssignmentLabel}
                linkIntakeNumber={linkIntakeNumber}
                setLinkIntakeNumber={setLinkIntakeNumber}
                linkJobCode={linkJobCode}
                setLinkJobCode={setLinkJobCode}
                onOpenIntake={handleOpenIntakeDialog}
                onOpenConvert={handleOpenConvertDialog}
                onAddNote={() => { void handleAddNote(); }}
                onCreateIntake={() => { void handleCreateIntake(); }}
                onConvertToJob={() => { void handleConvertToJob(); }}
                onLinkIntake={() => { void handleLinkIntake(); }}
                onLinkJob={() => { void handleLinkJob(); }}
                onReassign={() => { void handleReassign(); }}
                onAssignToMe={() => { void handleAssignToMe(); }}
                onClearAssignment={() => { void handleClearAssignment(); }}
                actionBusy={actionBusy}
              />
            </div>
          ) : null}
        </section>

        <aside className="hidden xl:block">
          {activeConversation ? (
            <ContextRail
              detail={activeConversation}
              intakeForm={intakeForm}
              setIntakeForm={setIntakeForm}
              convertForm={convertForm}
              setConvertForm={setConvertForm}
              technicians={technicians}
              jobs={linkableJobs}
              reviewedInactiveAccount={reviewedInactiveAccount}
              setReviewedInactiveAccount={setReviewedInactiveAccount}
              noteText={noteText}
              setNoteText={setNoteText}
              assignmentLabel={assignmentLabel}
              setAssignmentLabel={setAssignmentLabel}
              linkIntakeNumber={linkIntakeNumber}
              setLinkIntakeNumber={setLinkIntakeNumber}
              linkJobCode={linkJobCode}
              setLinkJobCode={setLinkJobCode}
              onOpenIntake={handleOpenIntakeDialog}
              onOpenConvert={handleOpenConvertDialog}
              onAddNote={() => { void handleAddNote(); }}
              onCreateIntake={() => { void handleCreateIntake(); }}
              onConvertToJob={() => { void handleConvertToJob(); }}
              onLinkIntake={() => { void handleLinkIntake(); }}
              onLinkJob={() => { void handleLinkJob(); }}
              onReassign={() => { void handleReassign(); }}
              onAssignToMe={() => { void handleAssignToMe(); }}
              onClearAssignment={() => { void handleClearAssignment(); }}
              actionBusy={actionBusy}
            />
          ) : (
            <Card className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
              Select a conversation to see customer profile and intake actions.
            </Card>
          )}
        </aside>
      </div>

      <Dialog open={intakeDialogOpen} onOpenChange={setIntakeDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Create or update intake</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <CircleAlert className="h-4 w-4" />
                Create an intake from the chatbot-collected data. This is admin-only and does not expose internal fields to the customer.
              </div>
            </div>
            {activeConversation?.is_inactive_account_warning ? (
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <ShieldAlert className="mt-0.5 h-4 w-4" />
                  <div className="space-y-2">
                    <p className="font-medium">Inactive account review required</p>
                    <label className="flex items-center gap-2 text-sm text-rose-700">
                      <Checkbox checked={reviewedInactiveAccount} onCheckedChange={(checked) => setReviewedInactiveAccount(checked === true)} />
                      I reviewed the inactive account warning before saving this intake.
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="intake-status">Status</Label>
              <Select value={intakeForm.status} onValueChange={(value) => setIntakeForm((current) => ({ ...current, status: value as 'new' | 'reviewed' }))}>
                <SelectTrigger id="intake-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-customer">Customer / dealership name</Label>
              <Input id="intake-customer" value={intakeForm.customer_name} onChange={(event) => setIntakeForm((current) => ({ ...current, customer_name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-contact">Contact person</Label>
              <Input id="intake-contact" value={intakeForm.contact_person} onChange={(event) => setIntakeForm((current) => ({ ...current, contact_person: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-phone">Phone</Label>
              <Input id="intake-phone" value={intakeForm.phone} onChange={(event) => setIntakeForm((current) => ({ ...current, phone: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-email">Email</Label>
              <Input id="intake-email" type="email" value={intakeForm.email} onChange={(event) => setIntakeForm((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="intake-requested-service">Requested service</Label>
              <Textarea id="intake-requested-service" value={intakeForm.requested_service_text} onChange={(event) => setIntakeForm((current) => ({ ...current, requested_service_text: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-service-match">Confirmed service match</Label>
              <Select value={intakeForm.matched_service_id} onValueChange={(value) => {
                const nextCandidate = serviceCandidates.find((candidate) => candidate.id === value);
                setIntakeForm((current) => ({
                  ...current,
                  matched_service_id: value,
                  matched_service_name: nextCandidate?.name ?? current.matched_service_name,
                }));
              }}>
                <SelectTrigger id="intake-service-match">
                  <SelectValue placeholder="Confirm the match" />
                </SelectTrigger>
                <SelectContent>
                  {serviceCandidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-urgency">Urgency</Label>
              <Select value={intakeForm.urgency} onValueChange={(value) => setIntakeForm((current) => ({ ...current, urgency: value as BackendCustomerConversationUrgency }))}>
                <SelectTrigger id="intake-urgency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(URGENCY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-date">Preferred date</Label>
              <Input id="intake-date" type="date" value={intakeForm.preferred_date} onChange={(event) => setIntakeForm((current) => ({ ...current, preferred_date: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-time">Preferred time</Label>
              <Input id="intake-time" type="time" value={intakeForm.preferred_time} onChange={(event) => setIntakeForm((current) => ({ ...current, preferred_time: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-location">Location / branch</Label>
              <Input id="intake-location" value={intakeForm.location_branch} onChange={(event) => setIntakeForm((current) => ({ ...current, location_branch: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-vehicle-unit">Vehicle unit / stock number</Label>
              <Input id="intake-vehicle-unit" value={intakeForm.vehicle_unit_or_stock_number} onChange={(event) => setIntakeForm((current) => ({ ...current, vehicle_unit_or_stock_number: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="intake-vehicle">Vehicle description</Label>
              <Textarea id="intake-vehicle" value={intakeForm.vehicle_description} onChange={(event) => setIntakeForm((current) => ({ ...current, vehicle_description: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="intake-notes">Notes</Label>
              <Textarea id="intake-notes" value={intakeForm.notes} onChange={(event) => setIntakeForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIntakeDialogOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handleCreateIntake();
              }}
              disabled={actionBusy === 'create-intake' || (activeConversation?.is_inactive_account_warning ? !reviewedInactiveAccount : false)}
              className="rounded-full bg-cyan-600 text-white hover:bg-cyan-700"
            >
              {actionBusy === 'create-intake' ? 'Saving...' : 'Save intake'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Convert to job</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <Wrench className="h-4 w-4" />
                Pre-fill a job from this conversation. The technician is only assigned if you choose one.
              </div>
            </div>
            {activeConversation?.is_inactive_account_warning ? (
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <ShieldAlert className="mt-0.5 h-4 w-4" />
                  <div className="space-y-2">
                    <p className="font-medium">Inactive account review required</p>
                    <label className="flex items-center gap-2 text-sm text-rose-700">
                      <Checkbox checked={reviewedInactiveAccount} onCheckedChange={(checked) => setReviewedInactiveAccount(checked === true)} />
                      I reviewed the inactive account warning before converting this conversation.
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="convert-dealership">Customer / dealership</Label>
              <Input id="convert-dealership" value={convertForm.dealership_name} onChange={(event) => setConvertForm((current) => ({ ...current, dealership_name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="convert-service">Primary service</Label>
              <Input id="convert-service" value={convertForm.service_name} onChange={(event) => setConvertForm((current) => ({ ...current, service_name: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="convert-services">Additional services</Label>
              <Textarea
                id="convert-services"
                value={convertForm.service_names_csv}
                onChange={(event) => setConvertForm((current) => ({ ...current, service_names_csv: event.target.value }))}
                placeholder="Comma-separated services to attach to the job"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="convert-vehicle">Vehicle summary</Label>
              <Textarea id="convert-vehicle" value={convertForm.vehicle_summary} onChange={(event) => setConvertForm((current) => ({ ...current, vehicle_summary: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="convert-date">Requested date</Label>
              <Input id="convert-date" type="date" value={convertForm.requested_service_date} onChange={(event) => setConvertForm((current) => ({ ...current, requested_service_date: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="convert-time">Requested time</Label>
              <Input id="convert-time" type="time" value={convertForm.requested_service_time} onChange={(event) => setConvertForm((current) => ({ ...current, requested_service_time: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="convert-tech">Pre-assigned technician</Label>
              <Select value={convertForm.pre_assigned_technician_id} onValueChange={(value) => setConvertForm((current) => ({ ...current, pre_assigned_technician_id: value }))}>
                <SelectTrigger id="convert-tech">
                  <SelectValue placeholder="No technician selected" />
                </SelectTrigger>
                <SelectContent>
                  {technicians
                    .filter((technician) => technician.status === 'active')
                    .map((technician) => (
                      <SelectItem key={technician.id} value={technician.id}>
                        {technician.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="convert-create-intake">Create intake first</Label>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Checkbox
                  checked={convertForm.create_intake_first}
                  onCheckedChange={(checked) => setConvertForm((current) => ({ ...current, create_intake_first: checked === true }))}
                  id="convert-create-intake"
                />
                <span className="text-sm text-slate-600">Create or update the intake before generating the job</span>
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="convert-notes">Notes</Label>
              <Textarea id="convert-notes" value={convertForm.notes} onChange={(event) => setConvertForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handleConvertToJob();
              }}
              disabled={actionBusy === 'convert-job' || (activeConversation?.is_inactive_account_warning ? !reviewedInactiveAccount : false)}
              className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {actionBusy === 'convert-job' ? 'Converting...' : 'Convert to job'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContextRail({
  detail,
  intakeForm,
  setIntakeForm,
  convertForm,
  setConvertForm,
  technicians,
  jobs,
  reviewedInactiveAccount,
  setReviewedInactiveAccount,
  noteText,
  setNoteText,
  assignmentLabel,
  setAssignmentLabel,
  linkIntakeNumber,
  setLinkIntakeNumber,
  linkJobCode,
  setLinkJobCode,
  onOpenIntake,
  onOpenConvert,
  onAddNote,
  onCreateIntake,
  onConvertToJob,
  onLinkIntake,
  onLinkJob,
  onReassign,
  onAssignToMe,
  onClearAssignment,
  actionBusy,
}: {
  detail: BackendCustomerConversationDetail;
  intakeForm: IntakeFormState;
  setIntakeForm: Dispatch<SetStateAction<IntakeFormState>>;
  convertForm: ConvertFormState;
  setConvertForm: Dispatch<SetStateAction<ConvertFormState>>;
  technicians: BackendTechnicianListItem[];
  jobs: BackendAdminJob[];
  reviewedInactiveAccount: boolean;
  setReviewedInactiveAccount: Dispatch<SetStateAction<boolean>>;
  noteText: string;
  setNoteText: Dispatch<SetStateAction<string>>;
  assignmentLabel: string;
  setAssignmentLabel: Dispatch<SetStateAction<string>>;
  linkIntakeNumber: string;
  setLinkIntakeNumber: Dispatch<SetStateAction<string>>;
  linkJobCode: string;
  setLinkJobCode: Dispatch<SetStateAction<string>>;
  onOpenIntake: () => void;
  onOpenConvert: () => void;
  onAddNote: () => void;
  onCreateIntake: () => void;
  onConvertToJob: () => void;
  onLinkIntake: () => void;
  onLinkJob: () => void;
  onReassign: () => void;
  onAssignToMe: () => void;
  onClearAssignment: () => void;
  actionBusy: string | null;
}) {
  const activeIntake = detail.linked_intake;
  const matchedServiceCandidates = detail.collected_fields.matched_service_candidates;
  const sortedNotes = [...detail.internal_notes].reverse();
  return (
    <div className="space-y-4">
      <SectionCard
        title="Customer profile"
        icon={UserRound}
        subtitle="Customer-safe summary and account match."
      >
        <div className="space-y-3 text-sm text-slate-600">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-4 w-4 text-slate-400" />
            <div>
              <p className="font-medium text-slate-900">{detail.customer_profile.dealership_name || detail.customer_name || 'Unknown customer'}</p>
              <p>{detail.customer_profile.dealership_status ? `Account status: ${detail.customer_profile.dealership_status}` : 'No account status available'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 h-4 w-4 text-slate-400" />
            <div>
              <p>{detail.customer_profile.contact_person || 'No contact person provided'}</p>
              <p>{detail.customer_profile.phone || detail.phone || 'No phone captured'}{detail.customer_profile.email || detail.email ? ` · ${detail.customer_profile.email || detail.email}` : ''}</p>
            </div>
          </div>
          {detail.customer_profile.account_warning ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                <p className="text-sm font-medium">Inactive account warning</p>
              </div>
              <p className="mt-1 text-sm">{detail.customer_profile.account_warning}</p>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <Checkbox checked={reviewedInactiveAccount} onCheckedChange={(checked) => setReviewedInactiveAccount(checked === true)} />
                I reviewed this warning
              </label>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Matched job</p>
              <p className="mt-1 text-sm text-slate-900">{detail.customer_profile.matched_job_code || 'None'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Matched intake</p>
              <p className="mt-1 text-sm text-slate-900">{detail.customer_profile.matched_intake_number || 'None'}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Collected details"
        icon={Tag}
        subtitle="What the chatbot already captured for the dispatcher."
      >
        <div className="space-y-3 text-sm text-slate-600">
          <Row label="Requested service" value={detail.collected_fields.requested_service_text || detail.requested_service || 'Not captured'} />
          <Row label="Matched service" value={detail.collected_fields.matched_service_name || 'Not matched yet'} />
          {matchedServiceCandidates.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="service-confirmation">Confirm match</Label>
              <Select value={intakeForm.matched_service_id} onValueChange={(value) => {
                const candidate = matchedServiceCandidates.find((item) => item.id === value);
                setIntakeForm((current) => ({
                  ...current,
                  matched_service_id: value,
                  matched_service_name: candidate?.name ?? current.matched_service_name,
                }));
                setConvertForm((current) => ({
                  ...current,
                  service_name: candidate?.name ?? current.service_name,
                }));
              }}>
                <SelectTrigger id="service-confirmation">
                  <SelectValue placeholder="Select a service match" />
                </SelectTrigger>
                <SelectContent>
                  {matchedServiceCandidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {detail.is_service_match_ambiguous ? (
                <p className="text-xs text-amber-700">Multiple service matches were found. Confirm one before creating intake or converting to a job.</p>
              ) : null}
            </div>
          ) : null}
          <Row label="Preferred date/time" value={`${formatDateOnly(detail.collected_fields.preferred_date ?? undefined)}${detail.collected_fields.preferred_time ? ` · ${detail.collected_fields.preferred_time}` : ''}`} />
          <Row label="Location / branch" value={detail.collected_fields.service_location_or_branch || 'Not captured'} />
          <Row label="Vehicle" value={detail.collected_fields.vehicle_description || 'Not captured'} />
          <Row label="Unit / stock #" value={detail.collected_fields.vehicle_unit_or_stock_number || 'Optional field not provided'} />
          <Row label="Urgency" value={urgencyLabel(detail.collected_fields.urgency)} />
          {detail.collected_fields.special_notes ? <Row label="Special notes" value={detail.collected_fields.special_notes} /> : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Assignment"
        icon={UserCog}
        subtitle="Join, assign, or clear the current owner."
      >
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
            <Button variant="outline" className="rounded-full border-slate-200" onClick={onAssignToMe} disabled={detail.status === 'closed' || actionBusy === 'assign-me'}>
              Assign to me
            </Button>
            <Button variant="outline" className="rounded-full border-slate-200" onClick={onClearAssignment} disabled={detail.status === 'closed' || actionBusy === 'clear-assignment'}>
              Clear assignment
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment-label">Assign or reassign by label</Label>
            <Input
              id="assignment-label"
              value={assignmentLabel}
              onChange={(event) => setAssignmentLabel(event.target.value)}
              placeholder="Dispatcher name or team label"
            />
          </div>
          <Button className="w-full rounded-full bg-slate-900 text-white hover:bg-slate-800" onClick={onReassign} disabled={!assignmentLabel.trim() || detail.status === 'closed' || actionBusy === 'reassign'}>
            Reassign
          </Button>
          <div className="text-xs text-slate-500">
            Current owner: {detail.assigned_admin_label || 'Unassigned'}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Intake and job actions"
        icon={Wrench}
        subtitle="Create intake records, link existing records, or convert to a job."
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full bg-cyan-600 text-white hover:bg-cyan-700" onClick={onOpenIntake}>
              Create intake
            </Button>
            <Button className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={onOpenConvert}>
              Convert to job
            </Button>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="link-intake">Link existing intake</Label>
            <div className="flex gap-2">
              <Input id="link-intake" value={linkIntakeNumber} onChange={(event) => setLinkIntakeNumber(event.target.value)} placeholder="Intake number" />
              <Button variant="outline" className="rounded-full border-slate-200" onClick={onLinkIntake} disabled={!linkIntakeNumber.trim() || detail.status === 'closed' || actionBusy === 'link-intake'}>
                Link
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-job">Link existing job</Label>
            <Select value={linkJobCode} onValueChange={setLinkJobCode}>
              <SelectTrigger id="link-job">
                <SelectValue placeholder="Select a job" />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((job) => (
                  <SelectItem key={job.id} value={job.job_code}>
                    {job.job_code} · {job.dealership_name || 'Unknown customer'} · {job.service_type || 'Service'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="w-full rounded-full border-slate-200" onClick={onLinkJob} disabled={!linkJobCode.trim() || detail.status === 'closed' || actionBusy === 'link-job'}>
              Link job
            </Button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            Linked intake: {activeIntake?.intake_number || 'None'} · Linked job: {detail.linked_job?.job_code || 'None'}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Internal notes"
        icon={PenLine}
        subtitle="Admin-only notes never appear in the customer portal."
      >
        <div className="space-y-3">
          <Textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="Add an internal note for dispatch or management..."
            className="min-h-[100px] rounded-2xl border-slate-200"
          />
          <Button className="w-full rounded-full bg-slate-900 text-white hover:bg-slate-800" onClick={onAddNote} disabled={!noteText.trim() || actionBusy === 'note'}>
            Add note
          </Button>
          <div className="space-y-2">
            {sortedNotes.length > 0 ? (
              sortedNotes.map((note) => (
                <div key={note.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-900">{note.author_admin_label || 'Admin'}</p>
                    <p className="text-[11px] text-slate-400">{formatDateTime(note.created_at)}</p>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-6">{note.note_body}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                No internal notes yet.
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{value}</p>
    </div>
  );
}
