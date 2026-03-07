import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    Download,
    RefreshCw,
    MoreHorizontal,
    ArrowUpDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    AlertCircle,
    Clock,
    Truck,
    User,
    Calendar,
    X,
    SlidersHorizontal,
    ArrowUp,
    ArrowDown,
    Plus,
    MoreVertical,
    Car,
    MapPin,
    History,
    ArrowRight,
    Building2,
    Users,
    ClipboardList,
    LayoutDashboard,
    TrendingUp,
    ShieldCheck,
    Trash2
} from 'lucide-react';
import { calculateJobRanking, sortJobsByRanking } from '@/lib/priority';
import { exportArrayData, selectColumnsForExport, type ExportFormat } from '@/lib/export';
import { toast } from 'sonner';

import type { PriorityRule, UrgencyLevel } from '@/types';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import ColumnExportDialog from '@/components/modals/ColumnExportDialog';
import { useAuth } from '@/contexts/AuthContext';
import { DISPATCH_JOB_STATUS, normalizeDispatchJobStatus } from '@/lib/job-status';
import {
    confirmAdminJob,
    createAdminJob,
    deleteAdminJob,
    fetchAdminDealerships,
    fetchAdminPriorityRules,
    fetchAdminServices,
    fetchAdminJobs,
    fetchAdminTechnicians,
    getStoredAdminToken,
    updateAdminJobAssignment,
    type BackendAdminJob,
    type BackendDealership,
    type BackendPriorityRule,
    type BackendServiceCatalogItem,
    type BackendTechnicianListItem,
} from '@/lib/backend-api';

// --- Types ---

type JobStatus = 'admin_preview' | 'pending_admin_confirmation' | 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'unknown';
type InvoiceState = 'draft' | 'pending_approval' | 'approved' | 'synced' | 'failed' | 'void';
type Urgency = 'low' | 'normal' | 'high' | 'critical';

interface Job {
    job_id: string;
    job_code: string;
    dealership_name: string;
    service_name: string;
    service_names: string[];
    vehicle_summary: string;
    urgency: Urgency;
    assigned_technician_name: string | null;
    job_status: JobStatus;
    invoice_state: InvoiceState;
    attention_flag: boolean;
    created_at: string;
    updated_at: string;
    allowed_actions: string[];
    ranking_score?: number;
    applied_rules?: string[];
    requires_admin_confirmation?: boolean;
    admin_confirmed_at?: string | null;
    pending_assigned_technician_name?: string | null;
    pending_push_to_available?: boolean;
}



interface PaginationState {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

interface NewJobFormState {
    dealership_name: string;
    service_name: string;
    vehicle_summary: string;
    urgency: Urgency;
    assigned_technician_name: string;
    push_to_available: boolean;
}

type TechnicianOption = {
    id: string;
    name: string;
    zones: string[];
    skills: string[];
    isActive: boolean;
};

type QuickFilterCounts = {
    pendingReview: number;
    awaitingTechAcceptance: number;
    attentionRequired: number;
};

type QuickFilterKey =
    | 'pending_review'
    | 'awaiting_tech_acceptance'
    | 'attention_required';

type DealershipOption = {
    id: string;
    code: string;
    name: string;
    city: string;
};

// --- Reference Data ---

const ADMIN_JOBS_STORAGE_KEY = 'sm_dispatch_admin_jobs';
const JOB_EXPORT_COLUMNS = [
    'JobCode',
    'Customer',
    'Service',
    'Vehicle',
    'Urgency',
    'Technician',
    'JobStatus',
    'Date',
    'Time',
    'CreatedAt',
    'UpdatedAt',
];
const ADMIN_REFRESH_EVENT = 'sm-dispatch:admin-refresh';

const EMPTY_QUICK_FILTER_COUNTS: QuickFilterCounts = {
    pendingReview: 0,
    awaitingTechAcceptance: 0,
    attentionRequired: 0,
};

const normalizeText = (value: string) =>
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const textTokens = (value: string) =>
    normalizeText(value)
        .split(' ')
        .filter((token) => token.length >= 3);

const parseServiceNames = (value: string) =>
    Array.from(
        new Set(
            value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    );

const JOB_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
});

const JOB_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
});

const UUID_V4ISH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mapBackendPriorityRule = (row: BackendPriorityRule): PriorityRule => ({
    id: row.id,
    description: row.description,
    dealershipId: row.dealership_id,
    serviceId: row.service_id ?? undefined,
    targetUrgency: row.target_urgency,
    rankingScore: row.ranking_score,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const mapBackendDealershipOption = (row: BackendDealership): DealershipOption => ({
    id: row.id,
    code: row.code,
    name: (row.name || '').trim(),
    city: (row.city || '').trim(),
});

const formatJobDate = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'N/A' : JOB_DATE_FORMATTER.format(parsed);
};

const formatJobTime = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'N/A' : JOB_TIME_FORMATTER.format(parsed);
};

const toLocalDateFilterValue = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const isBackendPersistedJobId = (jobId: string) => UUID_V4ISH_PATTERN.test(jobId);

const mapBackendStatusToUiJobStatus = (status: string): JobStatus => {
    switch (normalizeDispatchJobStatus(status)) {
        case DISPATCH_JOB_STATUS.ADMIN_PREVIEW:
            return 'admin_preview';
        case DISPATCH_JOB_STATUS.PENDING_ADMIN_CONFIRMATION:
            return 'pending_admin_confirmation';
        case DISPATCH_JOB_STATUS.PENDING:
            return 'pending';
        case DISPATCH_JOB_STATUS.SCHEDULED:
            return 'scheduled';
        case DISPATCH_JOB_STATUS.IN_PROGRESS:
            return 'in_progress';
        case DISPATCH_JOB_STATUS.COMPLETED:
            return 'completed';
        case DISPATCH_JOB_STATUS.CANCELLED:
            return 'cancelled';
        case DISPATCH_JOB_STATUS.UNKNOWN:
            return 'unknown';
        default:
            return 'unknown';
    }
};

const deriveUrgencyFromBackendJob = (row: BackendAdminJob): Urgency => {
    const metadata = row.source_metadata;
    if (metadata && typeof metadata === 'object') {
        const urgent = (metadata as Record<string, unknown>).urgent;
        if (urgent === true || urgent === 'true') {
            return 'high';
        }
    }
    return 'normal';
};

const getBackendDisplayDateTimeIso = (row: BackendAdminJob): string => {
    const datePart = row.requested_service_date?.trim();
    if (!datePart) {
        return row.created_at;
    }

    const rawTime = row.requested_service_time?.trim() || '00:00:00';
    const normalizedTime = rawTime.length === 5 ? `${rawTime}:00` : rawTime.slice(0, 8);
    const localDateTime = `${datePart}T${normalizedTime}`;
    const parsed = new Date(localDateTime);
    return Number.isNaN(parsed.getTime()) ? row.created_at : localDateTime;
};

const mapBackendJobToUiJob = (row: BackendAdminJob): Job => {
    const normalizedServiceNames = Array.from(
        new Set(
            (row.service_names ?? [])
                .map((value) => value.trim())
                .filter(Boolean),
        ),
    );
    const primaryServiceName = normalizedServiceNames[0] || row.service_type?.trim() || 'Service Request';

    const uiStatus = mapBackendStatusToUiJobStatus(row.status);
    const backendTechName = row.assigned_technician_name?.trim() || null;
    const pendingTaggedTechName =
        row.pre_assigned_technician_name?.trim()
        || row.assigned_technician_name?.trim()
        || null;
    const previewTechName =
        uiStatus === 'admin_preview' || uiStatus === 'pending_admin_confirmation'
            ? pendingTaggedTechName
            : null;
    const assignedTechName =
        uiStatus === 'admin_preview' || uiStatus === 'pending_admin_confirmation'
            ? null
            : backendTechName;
    const displayDateTime = getBackendDisplayDateTimeIso(row);

    return {
        job_id: row.id,
        job_code: row.job_code,
        dealership_name: row.dealership_name?.trim() || 'Unknown Customer',
        service_name: primaryServiceName,
        service_names: normalizedServiceNames.length > 0 ? normalizedServiceNames : [primaryServiceName],
        vehicle_summary: row.vehicle?.trim() || 'Vehicle not provided',
        urgency: deriveUrgencyFromBackendJob(row),
        assigned_technician_name: assignedTechName,
        pending_assigned_technician_name: previewTechName,
        job_status: uiStatus,
        invoice_state: 'draft',
        attention_flag: false,
        created_at: displayDateTime,
        updated_at: row.updated_at || row.created_at,
        allowed_actions: (uiStatus === 'admin_preview' || uiStatus === 'pending_admin_confirmation')
            ? ['view', 'edit', 'cancel', 'assign', 'confirm']
            : ['view', 'edit', 'cancel', 'assign'],
        ranking_score: 0,
        applied_rules: [],
        requires_admin_confirmation: uiStatus === 'admin_preview' || uiStatus === 'pending_admin_confirmation',
        admin_confirmed_at:
            (uiStatus === 'admin_preview' || uiStatus === 'pending_admin_confirmation')
                ? null
                : (row.updated_at || row.created_at),
        pending_push_to_available: false,
    };
};

const mergeBackendJobsIntoLocalStore = (backendRows: BackendAdminJob[]) => {
    const localJobs = loadPersistedJobs();
    const localByCode = new Map(localJobs.map((job) => [job.job_code, job]));
    const nextJobs = backendRows.map((row) => {
        const incoming = mapBackendJobToUiJob(row);
        const existing = localByCode.get(incoming.job_code);
        if (!existing) {
            return incoming;
        }

        // Keep UI-only decorations, but make backend rows authoritative.
        return {
            ...existing,
            ...incoming,
            invoice_state: existing.invoice_state ?? incoming.invoice_state,
            attention_flag: existing.attention_flag ?? incoming.attention_flag,
            ranking_score: existing.ranking_score ?? incoming.ranking_score,
            applied_rules: existing.applied_rules ?? incoming.applied_rules,
            allowed_actions: existing.allowed_actions?.length ? existing.allowed_actions : incoming.allowed_actions,
        };
    });

    persistJobs(nextJobs);
    return true;
};

const normalizeAssignedTechnicianStatus = (job: Job): Job => {
    if (job.assigned_technician_name && job.job_status === 'pending') {
        return { ...job, job_status: 'scheduled' };
    }
    return job;
};

const loadPersistedJobs = (): Job[] => {
    try {
        const raw = localStorage.getItem(ADMIN_JOBS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        const jobs = parsed as Job[];
        let didNormalize = false;
        const normalizedJobs = jobs.map((job) => {
            const normalized = normalizeAssignedTechnicianStatus(job);
            if (normalized !== job) {
                didNormalize = true;
            }
            return normalized;
        });

        if (didNormalize) {
            localStorage.setItem(ADMIN_JOBS_STORAGE_KEY, JSON.stringify(normalizedJobs));
        }

        return normalizedJobs;
    } catch {
        return [];
    }
};

const persistJobs = (jobs: Job[]) => {
    localStorage.setItem(ADMIN_JOBS_STORAGE_KEY, JSON.stringify(jobs));
};

const isPendingReviewJob = (job: Job) =>
    job.job_status === 'admin_preview'
    || job.job_status === 'pending_admin_confirmation'
    || (job.requires_admin_confirmation === true && !job.admin_confirmed_at);

const isAwaitingTechAcceptanceJob = (job: Job) => job.job_status === 'pending';

const isAttentionRequiredJob = (job: Job) => job.attention_flag;

const isTerminalJob = (job: Job) => job.job_status === 'completed' || job.job_status === 'cancelled';

const isAssignableJob = (job: Job) => !isTerminalJob(job);

const matchesQuickFilter = (job: Job, filter: QuickFilterKey) => {
    switch (filter) {
        case 'pending_review':
            return isPendingReviewJob(job);
        case 'awaiting_tech_acceptance':
            return isAwaitingTechAcceptanceJob(job);
        case 'attention_required':
            return isAttentionRequiredJob(job);
        default:
            return true;
    }
};

const calculateQuickFilterCounts = (jobs: Job[]): QuickFilterCounts => (
    jobs.reduce<QuickFilterCounts>((counts, job) => {
        const needsAdminReview = isPendingReviewJob(job);
        const awaitingTechAcceptance = isAwaitingTechAcceptanceJob(job);
        const needsAttention = isAttentionRequiredJob(job);

        if (needsAdminReview) counts.pendingReview += 1;
        if (awaitingTechAcceptance) counts.awaitingTechAcceptance += 1;
        if (needsAttention) counts.attentionRequired += 1;

        return counts;
    }, { ...EMPTY_QUICK_FILTER_COUNTS })
);

const appendAuditLog = (
    _event_type: string,
    _summary: string,
    _payload_json: Record<string, unknown>,
    _severity: 'info' | 'warning' | 'critical' = 'info'
) => {
    // Audit logging intentionally disabled.
};

// --- Components ---

function StatusBadge({ status, type }: { status: string; type: 'job' | 'invoice' | 'urgency' }) {
    const styles: Record<string, string> = {
        // Job Status
        admin_preview: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
        pending_admin_confirmation: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
        pending: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
        scheduled: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
        in_progress: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
        completed: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
        cancelled: 'bg-gray-50 dark:bg-gray-900/20 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-800 font-medium',
        unknown: 'bg-zinc-50 dark:bg-zinc-900/20 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800',

        // Invoice State
        draft: 'bg-gray-50 dark:bg-gray-900/20 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800',
        pending_approval: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800',
        approved: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
        synced: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
        failed: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
        void: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 border-gray-200 dark:border-gray-700 line-through',

        // Urgency
        low: 'bg-slate-100 dark:bg-slate-900/20 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800',
        normal: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
        high: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800',
        critical: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 animate-pulse',

    };

    const labels: Record<string, string> = {
        admin_preview: 'Admin Preview',
        pending_admin_confirmation: 'Pending Admin Confirmation',
        pending: 'Pending', scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled', unknown: 'Unknown',
        draft: 'Draft', pending_approval: 'Needs Approval', approved: 'Approved', synced: 'Synced', failed: 'Failed', void: 'Void',
        low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical'
    };

    return (
        <Badge variant="outline" className={cn('capitalize font-medium border shadow-sm', styles[status] || 'bg-muted text-foreground')}>
            {labels[status] || status.replace('_', ' ')}
        </Badge>
    );
}

export default function JobsPage() {
    const navigate = useNavigate();
    const { technicianAccounts } = useAuth();
    const [backendTechnicianRows, setBackendTechnicianRows] = useState<BackendTechnicianListItem[]>([]);
    const [technicianDetailsById, setTechnicianDetailsById] = useState<Record<string, { zones: string[]; skills: string[] }>>({});
    const technicianOptions = useMemo<TechnicianOption[]>(
        () => {
            if (backendTechnicianRows.length > 0) {
                return backendTechnicianRows.map((tech) => ({
                    id: tech.id,
                    name: tech.name,
                    zones: tech.zones.map((zone) => zone.name),
                    skills: tech.skills.map((skill) => skill.name),
                    isActive: tech.status === 'active',
                }));
            }

            return technicianAccounts.map((tech) => ({
                id: tech.id,
                name: tech.name,
                zones: technicianDetailsById[tech.id]?.zones ?? [],
                skills: technicianDetailsById[tech.id]?.skills ?? [],
                isActive: tech.isActive,
            }));
        },
        [backendTechnicianRows, technicianAccounts, technicianDetailsById],
    );
    const [serviceCatalog, setServiceCatalog] = useState<Array<{ id: string; name: string }>>([]);
    const [dealershipOptions, setDealershipOptions] = useState<DealershipOption[]>([]);
    const [dispatchRankingRules, setDispatchRankingRules] = useState<PriorityRule[]>([]);
    const dealershipNames = useMemo(
        () => dealershipOptions.map((entry) => entry.name),
        [dealershipOptions],
    );
    const serviceNames = useMemo(
        () => serviceCatalog.map((entry) => entry.name),
        [serviceCatalog],
    );
    const initialNewJobForm: NewJobFormState = {
        dealership_name: dealershipNames[0] ?? '',
        service_name: serviceNames[0] ?? '',
        vehicle_summary: '2024 Ford F-150',
        urgency: 'normal',
        assigned_technician_name: 'unassigned',
        push_to_available: true,
    };

    // State
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<Job[]>([]);
    const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [createJobOpen, setCreateJobOpen] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [assignSidebarOpen, setAssignSidebarOpen] = useState(false);
    const [jobToAssign, setJobToAssign] = useState<Job | null>(null);
    const [bulkAssignJobIds, setBulkAssignJobIds] = useState<string[]>([]);
    const [selectedTechnicianName, setSelectedTechnicianName] = useState<string>('unassigned');
    const [newJobForm, setNewJobForm] = useState<NewJobFormState>(initialNewJobForm);
    const [quickFilterCounts, setQuickFilterCounts] = useState<QuickFilterCounts>(EMPTY_QUICK_FILTER_COUNTS);
    const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilterKey | null>(null);
    const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const refreshInFlightRef = useRef(false);
    const lastRefreshStartedAtRef = useRef(0);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState('');

    const assignJobZone = useMemo(() => {
        if (!jobToAssign) return '';
        return dealershipOptions.find((dealership) => dealership.name === jobToAssign.dealership_name)?.city ?? '';
    }, [dealershipOptions, jobToAssign]);

    const eligibleTechnicianIds = useMemo(() => {
        if (!jobToAssign) return new Set<string>();
        if (bulkAssignJobIds.length > 1) return new Set<string>();

        const requiredZone = normalizeText(assignJobZone);
        const service = normalizeText(jobToAssign.service_name);
        const serviceWords = textTokens(jobToAssign.service_name);

        return new Set(
            technicianOptions
                .filter((tech) => {
                    const hasZone =
                        requiredZone.length > 0 &&
                        tech.zones.some((zone) => normalizeText(zone) === requiredZone);
                    if (!hasZone) return false;

                    const hasSkill = tech.skills.some((skill) => {
                        const normalizedSkill = normalizeText(skill);
                        if (!normalizedSkill) return false;
                        if (service.includes(normalizedSkill) || normalizedSkill.includes(service)) return true;

                        const skillWords = textTokens(skill);
                        return skillWords.some((word) => serviceWords.includes(word));
                    });

                    return hasSkill;
                })
                .map((tech) => tech.id),
        );
    }, [assignJobZone, bulkAssignJobIds.length, jobToAssign, technicianOptions]);

    useEffect(() => {
        const token = getStoredAdminToken();
        if (!token) {
            setBackendTechnicianRows([]);
            setTechnicianDetailsById({});
            return;
        }

        let cancelled = false;
        const loadTechnicianDetails = async () => {
            try {
                const backendRows = await fetchAdminTechnicians(token);
                if (cancelled) {
                    return;
                }

                setBackendTechnicianRows(backendRows);
                const nextDetails: Record<string, { zones: string[]; skills: string[] }> = {};
                backendRows.forEach((row) => {
                    nextDetails[row.id] = {
                        zones: row.zones.map((zone) => zone.name),
                        skills: row.skills.map((skill) => skill.name),
                    };
                });
                setTechnicianDetailsById(nextDetails);
            } catch {
                if (!cancelled) {
                    setBackendTechnicianRows([]);
                    setTechnicianDetailsById({});
                }
            }
        };

        void loadTechnicianDetails();
        return () => {
            cancelled = true;
        };
    }, [technicianAccounts]);

    useEffect(() => {
        const token = getStoredAdminToken();
        if (!token) {
            setDealershipOptions([]);
            return;
        }

        let cancelled = false;
        const loadDealershipOptions = async () => {
            try {
                const rows = await fetchAdminDealerships(token);
                if (cancelled) {
                    return;
                }

                setDealershipOptions(
                    rows
                        .map(mapBackendDealershipOption)
                        .filter((row) => row.name.length > 0),
                );
            } catch {
                if (!cancelled) {
                    setDealershipOptions([]);
                }
            }
        };

        void loadDealershipOptions();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const token = getStoredAdminToken();
        if (!token) {
            setServiceCatalog([]);
            return;
        }

        let cancelled = false;
        const loadServiceCatalog = async () => {
            try {
                const rows = await fetchAdminServices(token, false);
                if (cancelled) return;
                const next = rows.map((row: BackendServiceCatalogItem) => ({
                    id: row.id,
                    name: (row.name || '').trim(),
                })).filter((row) => row.name.length > 0);
                setServiceCatalog(next);
            } catch {
                if (!cancelled) setServiceCatalog([]);
            }
        };

        void loadServiceCatalog();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const token = getStoredAdminToken();
        if (!token) {
            setDispatchRankingRules([]);
            return;
        }

        let cancelled = false;
        const loadPriorityRules = async () => {
            try {
                const rows = await fetchAdminPriorityRules(token);
                if (cancelled) return;
                setDispatchRankingRules(rows.map(mapBackendPriorityRule));
            } catch {
                if (!cancelled) setDispatchRankingRules([]);
            }
        };

        void loadPriorityRules();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (dealershipNames.length === 0) return;
        setNewJobForm((prev) => {
            if (prev.dealership_name) return prev;
            return { ...prev, dealership_name: dealershipNames[0] ?? '' };
        });
    }, [dealershipNames]);

    useEffect(() => {
        if (serviceNames.length === 0) return;
        setNewJobForm((prev) => {
            if (prev.service_name) return prev;
            return { ...prev, service_name: serviceNames[0] ?? '' };
        });
    }, [serviceNames]);

    const syncLegacyConfirmedLocalJobsToBackend = async (
        token: string,
        backendRows: BackendAdminJob[],
    ): Promise<BackendAdminJob[]> => {
        const backendCodes = new Set(backendRows.map((row) => row.job_code));
        const legacyScheduledJobs = loadPersistedJobs().filter((job) => (
            !isBackendPersistedJobId(job.job_id)
            && !backendCodes.has(job.job_code)
            && job.job_status === 'scheduled'
            && Boolean(job.assigned_technician_name?.trim())
        ));

        if (legacyScheduledJobs.length === 0) {
            return backendRows;
        }

        let syncedAny = false;
        for (const localJob of legacyScheduledJobs) {
            const assignedName = localJob.assigned_technician_name?.trim();
            if (!assignedName) continue;

            const assignedTech = technicianOptions.find((tech) => tech.name === assignedName);
            if (!assignedTech) continue;

            try {
                const created = await createAdminJob(token, {
                    job_code: localJob.job_code,
                    dealership_name: localJob.dealership_name,
                    service_name: localJob.service_name,
                    service_names: localJob.service_names,
                    vehicle_summary: localJob.vehicle_summary,
                    pre_assigned_technician_id: assignedTech.id,
                });
                const confirmed = await confirmAdminJob(token, created.id);
                reconcilePersistedJobIdByCode(localJob.job_code, confirmed.id);
                syncedAny = true;
            } catch (error) {
                console.warn('Failed to backfill local confirmed job to backend', localJob.job_code, error);
            }
        }

        if (!syncedAny) {
            return backendRows;
        }

        return fetchAdminJobs(token);
    };

    const syncBackendJobsFromApi = async (showErrorToast = false) => {
        const token = getStoredAdminToken();
        if (!token) {
            return false;
        }

        try {
            const backendJobs = await fetchAdminJobs(token);
            const syncedBackendJobs = await syncLegacyConfirmedLocalJobsToBackend(token, backendJobs);
            return mergeBackendJobsIntoLocalStore(syncedBackendJobs);
        } catch (error) {
            if (showErrorToast) {
                const message = error instanceof Error ? error.message : 'Failed to refresh jobs from backend';
                toast.error(message);
            }
            return false;
        }
    };

    const fetchData = ({ background = false }: { background?: boolean } = {}) => {
        if (fetchTimerRef.current) {
            clearTimeout(fetchTimerRef.current);
            fetchTimerRef.current = null;
        }

        if (!background || data.length === 0) {
            setLoading(true);
        }

        // Simulate API Latency and Server-Side Filtering
        fetchTimerRef.current = setTimeout(() => {
            const allJobs = [...loadPersistedJobs()];
            setQuickFilterCounts(calculateQuickFilterCounts(allJobs));

            let filtered = [...allJobs];

            // Filter logic (simulating backend)
            if (searchQuery) {
                const lower = searchQuery.toLowerCase();
                filtered = filtered.filter(j =>
                    j.job_code.toLowerCase().includes(lower) ||
                    j.dealership_name.toLowerCase().includes(lower) ||
                    j.vehicle_summary.toLowerCase().includes(lower)
                );
            }
            if (urgencyFilter !== 'all') filtered = filtered.filter(j => j.urgency === urgencyFilter);
            if (dateFilter) filtered = filtered.filter(j => toLocalDateFilterValue(j.created_at) === dateFilter);
            if (activeQuickFilter) filtered = filtered.filter(j => matchesQuickFilter(j, activeQuickFilter));

            // Sort by priority score (descending)
            filtered = [...filtered].sort((a, b) => (b.ranking_score || 0) - (a.ranking_score || 0));

            const total = filtered.length;
            const computedTotalPages = Math.ceil(total / pagination.pageSize);
            const totalPages = total === 0 ? 1 : computedTotalPages;
            const nextPage = total === 0 ? 1 : Math.min(pagination.page, totalPages);
            const start = (nextPage - 1) * pagination.pageSize;
            const paginatedData = filtered.slice(start, start + pagination.pageSize);

            setData(paginatedData);
            setPagination(prev => ({ ...prev, page: nextPage, total, totalPages }));
            setLoading(false);
            fetchTimerRef.current = null;
        }, 600);
    };

    const refreshJobs = ({
        showErrorToast = false,
        background = true,
    }: {
        showErrorToast?: boolean;
        background?: boolean;
    } = {}) => {
        if (refreshInFlightRef.current) {
            return;
        }

        refreshInFlightRef.current = true;
        lastRefreshStartedAtRef.current = Date.now();
        void (async () => {
            try {
                await syncBackendJobsFromApi(showErrorToast);
                fetchData({ background });
            } finally {
                refreshInFlightRef.current = false;
            }
        })();
    };

    useEffect(() => {
        fetchData();
    }, [pagination.page, pagination.pageSize, searchQuery, urgencyFilter, dateFilter, activeQuickFilter]);

    useEffect(() => {
        refreshJobs({ background: false });
    }, []);

    useEffect(() => {
        const maybeRefreshInBackground = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                return;
            }
            refreshJobs({ background: true });
        };

        const intervalId = window.setInterval(() => {
            maybeRefreshInBackground();
        }, 30000);
        const onFocus = () => {
            if (Date.now() - lastRefreshStartedAtRef.current < 15000) {
                return;
            }
            maybeRefreshInBackground();
        };
        const onHeaderRefresh = () => {
            refreshJobs({ showErrorToast: true, background: false });
        };
        window.addEventListener('focus', onFocus);
        window.addEventListener(ADMIN_REFRESH_EVENT, onHeaderRefresh);
        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener(ADMIN_REFRESH_EVENT, onHeaderRefresh);
        };
    }, []);

    useEffect(() => {
        return () => {
            if (fetchTimerRef.current) {
                clearTimeout(fetchTimerRef.current);
                fetchTimerRef.current = null;
            }
        };
    }, []);

    // Handlers
    const handleSelectAll = (checked: boolean | 'indeterminate') => {
        const visibleJobIds = data.map((job) => job.job_id);
        setSelectedRows((prev) => {
            const next = new Set(prev);
            if (checked === true) {
                visibleJobIds.forEach((id) => next.add(id));
                return next;
            }
            visibleJobIds.forEach((id) => next.delete(id));
            return next;
        });
    };

    const handleSelectRow = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedRows);
        if (checked) newSelected.add(id);
        else newSelected.delete(id);
        setSelectedRows(newSelected);
    };

    const clearFilters = () => {
        setSearchQuery('');
        setUrgencyFilter('all');
        setDateFilter('');
        setActiveQuickFilter(null);
        setPagination(p => ({ ...p, page: 1 }));
    };

    const handleQuickFilterChipClick = (filterKey: QuickFilterKey) => {
        setPagination((prev) => ({ ...prev, page: 1 }));
        setActiveQuickFilter((prev) => (prev === filterKey ? null : filterKey));
    };

    const handleCreateJob = async () => {
        const dealershipName = newJobForm.dealership_name.trim();
        const serviceNamesInput = parseServiceNames(newJobForm.service_name);
        const serviceName = serviceNamesInput[0] ?? '';
        const vehicleSummary = newJobForm.vehicle_summary.trim();

        if (!dealershipName || !serviceName || !vehicleSummary) {
            alert('Customer, service, and vehicle are required.');
            return;
        }

        const dealership = dealershipOptions.find((entry) => entry.name === dealershipName);
        const service = serviceCatalog.find((entry) => entry.name === serviceName);
        const vehicleMake = vehicleSummary.split(' ')[1] || '';

        const urgencyMap: Record<Urgency, UrgencyLevel> = {
            low: 'LOW',
            normal: 'MEDIUM',
            high: 'HIGH',
            critical: 'CRITICAL',
        };
        const reverseUrgencyMap: Record<UrgencyLevel, Urgency> = {
            LOW: 'low',
            MEDIUM: 'normal',
            HIGH: 'high',
            CRITICAL: 'critical',
        };

        const priorityResult = calculateJobRanking({
            dealershipId: dealership?.id || '',
            serviceId: service?.id || '',
            urgency: urgencyMap[newJobForm.urgency],
            vehicleMake,
        }, dispatchRankingRules);

        const pendingAssignedTechnicianName =
            newJobForm.assigned_technician_name === 'unassigned'
                ? null
                : newJobForm.assigned_technician_name;
        const selectedTechnician =
            pendingAssignedTechnicianName
                ? technicianOptions.find((tech) => tech.name === pendingAssignedTechnicianName) ?? null
                : null;

        if (pendingAssignedTechnicianName && !selectedTechnician) {
            toast.error('Selected technician could not be found. Please refresh and try again.');
            return;
        }

        let createdBackendJob: BackendAdminJob | null = null;
        const token = getStoredAdminToken();
        if (token) {
            try {
                createdBackendJob = await createAdminJob(token, {
                    dealership_name: dealershipName,
                    service_name: serviceName,
                    service_names: serviceNamesInput,
                    vehicle_summary: vehicleSummary,
                    pre_assigned_technician_id: selectedTechnician?.id ?? null,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to create job';
                toast.error(message);
                return;
            }
        }

        const nowIso = new Date().toISOString();
        const baseUiJob = createdBackendJob
            ? mapBackendJobToUiJob(createdBackendJob)
            : ({
                job_id: `job-local-${Date.now()}`,
                job_code: `SM2-NEW-${String(Date.now()).slice(-6)}`,
                dealership_name: dealershipName,
                service_name: serviceName,
                service_names: serviceNamesInput.length > 0 ? serviceNamesInput : [serviceName],
                vehicle_summary: vehicleSummary,
                urgency: reverseUrgencyMap[priorityResult.finalUrgency] || newJobForm.urgency,
                assigned_technician_name: null,
                pending_assigned_technician_name: pendingAssignedTechnicianName,
                job_status: 'admin_preview',
                invoice_state: 'draft',
                attention_flag: false,
                created_at: nowIso,
                updated_at: nowIso,
                allowed_actions: ['view', 'edit', 'cancel', 'assign', 'confirm'],
                ranking_score: priorityResult.score,
                applied_rules: priorityResult.appliedRules,
                requires_admin_confirmation: true,
                admin_confirmed_at: null,
                pending_push_to_available: Boolean(newJobForm.push_to_available),
            } as Job);

        const newJob: Job = {
            ...baseUiJob,
            urgency: reverseUrgencyMap[priorityResult.finalUrgency] || baseUiJob.urgency,
            ranking_score: priorityResult.score,
            applied_rules: priorityResult.appliedRules,
            pending_push_to_available: Boolean(newJobForm.push_to_available),
        };

        const nextPersisted = [
            newJob,
            ...loadPersistedJobs().filter((row) => row.job_code !== newJob.job_code),
        ];
        persistJobs(nextPersisted);

        appendAuditLog(
            'job.created',
            `Job ${newJob.job_code} created and sent to admin preview`,
            {
                job_id: newJob.job_id,
                job_code: newJob.job_code,
                dealership_name: newJob.dealership_name,
                service_name: newJob.service_name,
                status: newJob.job_status,
                pushed_to_available_queue_after_confirmation: newJobForm.push_to_available,
                persisted_to_backend: Boolean(createdBackendJob),
            }
        );

        setCreateJobOpen(false);
        setNewJobForm(initialNewJobForm);
        setPagination((prev) => ({ ...prev, page: 1 }));
        refreshJobs({ showErrorToast: true, background: false });
    };

    const updatePersistedJob = (jobId: string, updater: (job: Job) => Job) => {
        const current = loadPersistedJobs();
        const next = current.map((job) => (job.job_id === jobId ? updater(job) : job));
        persistJobs(next);
        return next.find((job) => job.job_id === jobId) ?? null;
    };

    const reconcilePersistedJobIdByCode = (jobCode: string, nextJobId: string) => {
        const current = loadPersistedJobs();
        const next = current.map((row) => {
            if (row.job_code !== jobCode) return row;
            return { ...row, job_id: nextJobId };
        });
        persistJobs(next);
    };

    const handleConfirmJob = async (job: Job) => {
        if (job.job_status !== 'admin_preview' && job.job_status !== 'pending_admin_confirmation') {
            toast.info('Only jobs pending admin confirmation can be confirmed.');
            return;
        }
        const taggedTechnicianName =
            job.pending_assigned_technician_name?.trim()
            || job.assigned_technician_name?.trim()
            || '';
        if (!taggedTechnicianName) {
            toast.warning('Assign a technician before confirming this job.');
            return;
        }

        if (!window.confirm(`Confirm ${job.job_code} and send it to technician portal?`)) {
            return;
        }

        let confirmedJobId = job.job_id;
        let confirmedBackendJob: BackendAdminJob | null = null;
        const token = getStoredAdminToken();
        if (isBackendPersistedJobId(job.job_id) && !token) {
            toast.error('Admin session is required to confirm synced jobs.');
            return;
        }
        if (token) {
            try {
                const backendRows = await fetchAdminJobs(token);
                let backendJob = backendRows.find((row) => row.job_code === job.job_code);
                if (!backendJob && !isBackendPersistedJobId(job.job_id)) {
                    const selectedTechnician =
                        taggedTechnicianName
                            ? technicianOptions.find((tech) => tech.name === taggedTechnicianName) ?? null
                            : null;
                    if (taggedTechnicianName && !selectedTechnician) {
                        toast.error('Assigned technician was not found. Please re-assign and confirm again.');
                        return;
                    }

                    backendJob = await createAdminJob(token, {
                        job_code: job.job_code,
                        dealership_name: job.dealership_name,
                        service_name: job.service_name,
                        service_names: job.service_names,
                        vehicle_summary: job.vehicle_summary,
                        pre_assigned_technician_id: selectedTechnician?.id ?? null,
                    });
                }
                if (backendJob) {
                    confirmedBackendJob = await confirmAdminJob(token, backendJob.id);
                    confirmedJobId = backendJob.id;
                    reconcilePersistedJobIdByCode(job.job_code, backendJob.id);
                } else if (isBackendPersistedJobId(job.job_id)) {
                    toast.error('Job not found in backend. Please refresh jobs.');
                    fetchData();
                    return;
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to confirm job';
                toast.error(message);
                return;
            }
        }

        if (confirmedBackendJob) {
            const mapped = mapBackendJobToUiJob(confirmedBackendJob);
            updatePersistedJob(confirmedJobId, (current) => ({
                ...current,
                ...mapped,
                invoice_state: current.invoice_state ?? mapped.invoice_state,
                attention_flag: current.attention_flag ?? mapped.attention_flag,
                ranking_score: current.ranking_score ?? mapped.ranking_score,
                applied_rules: current.applied_rules ?? mapped.applied_rules,
            }));
        } else {
            const nowIso = new Date().toISOString();
            const nextPendingAssignedName =
                job.pending_assigned_technician_name
                ?? job.assigned_technician_name
                ?? null;
            updatePersistedJob(confirmedJobId, (current) => ({
                ...current,
                assigned_technician_name: nextPendingAssignedName,
                pending_assigned_technician_name: null,
                job_status: nextPendingAssignedName ? 'scheduled' : 'pending',
                requires_admin_confirmation: false,
                admin_confirmed_at: nowIso,
                pending_push_to_available: false,
                updated_at: nowIso,
                allowed_actions: ['view', 'edit', 'cancel', 'assign'],
            }));
        }

        appendAuditLog(
            'job.confirmed',
            `Job ${job.job_code} confirmed and pushed to technician queue`,
            {
                job_id: confirmedJobId,
                job_code: job.job_code,
                assigned_technician_name:
                    confirmedBackendJob?.assigned_technician_name
                    ?? job.pending_assigned_technician_name
                    ?? job.assigned_technician_name
                    ?? null,
            },
        );
        toast.success(`${job.job_code} confirmed and sent to technician portal`);
        refreshJobs({ showErrorToast: true, background: false });
    };

    const handleAssignTechnician = (job: Job) => {
        if (!isAssignableJob(job)) {
            toast.warning('Completed or cancelled jobs cannot be assigned.');
            return;
        }
        setBulkAssignJobIds([]);
        setJobToAssign(job);
        setSelectedTechnicianName(job.assigned_technician_name ?? job.pending_assigned_technician_name ?? 'unassigned');
        setAssignSidebarOpen(true);
    };

    const handleBulkAssignTechnician = () => {
        if (selectedRows.size === 0) {
            toast.info('Select at least one job to assign a technician.');
            return;
        }

        const selectedJobs = loadPersistedJobs()
            .filter((job) => selectedRows.has(job.job_id))
            .filter((job) => isAssignableJob(job));

        if (selectedJobs.length === 0) {
            toast.warning('Selected jobs cannot be assigned because they are completed or cancelled.');
            return;
        }

        const anchorJob = selectedJobs[0];
        setBulkAssignJobIds(selectedJobs.map((job) => job.job_id));
        setJobToAssign(anchorJob);
        setSelectedTechnicianName(anchorJob.assigned_technician_name ?? anchorJob.pending_assigned_technician_name ?? 'unassigned');
        setAssignSidebarOpen(true);
    };

    const submitTechnicianAssignment = async () => {
        const targetJobIds = bulkAssignJobIds.length > 0
            ? bulkAssignJobIds
            : (jobToAssign ? [jobToAssign.job_id] : []);

        if (targetJobIds.length === 0) {
            toast.info('No jobs selected for assignment.');
            return;
        }

        let nextAssignedName: string | null = null;
        let nextAssignedId: string | null = null;
        if (selectedTechnicianName !== 'unassigned') {
            const found = technicianOptions.find((tech) => tech.name === selectedTechnicianName);
            if (!found) {
                window.alert('Invalid technician selected.');
                return;
            }
            if (!found.isActive) {
                toast.error('Selected technician is inactive. Choose an active technician.');
                return;
            }
            nextAssignedName = found.name;
            nextAssignedId = found.id;
        }

        const targetJobIdSet = new Set(targetJobIds);
        const current = loadPersistedJobs();
        const candidateJobs = current.filter((job) => targetJobIdSet.has(job.job_id) && isAssignableJob(job));
        if (candidateJobs.length === 0) {
            toast.warning('No selected jobs could be updated.');
            return;
        }

        const backendJobs = candidateJobs.filter((job) => isBackendPersistedJobId(job.job_id));
        let successfulBackendJobIds = new Set<string>();
        let failedBackendCount = 0;
        let failedBackendReasons: string[] = [];
        if (backendJobs.length > 0) {
            const token = getStoredAdminToken();
            if (!token) {
                toast.error('Admin session is missing. Please sign in again and retry.');
                return;
            }
            if (nextAssignedId && !UUID_V4ISH_PATTERN.test(nextAssignedId)) {
                toast.error('Technician list is not synced with backend yet. Refresh and try again.');
                return;
            }

            const results = await Promise.allSettled(
                backendJobs.map((job) =>
                    updateAdminJobAssignment(token, job.job_id, { assigned_technician_id: nextAssignedId }),
                ),
            );
            successfulBackendJobIds = new Set(
                backendJobs
                    .filter((_, index) => results[index]?.status === 'fulfilled')
                    .map((job) => job.job_id),
            );
            failedBackendCount = results.filter((result) => result.status === 'rejected').length;
            failedBackendReasons = results
                .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
                .map((result) => result.reason instanceof Error ? result.reason.message : 'Backend assignment update failed');
        }

        const applyUpdateToJobIds = new Set(
            candidateJobs
                .filter((job) => !isBackendPersistedJobId(job.job_id) || successfulBackendJobIds.has(job.job_id))
                .map((job) => job.job_id),
        );
        if (applyUpdateToJobIds.size === 0) {
            toast.error(failedBackendReasons[0] ?? 'Assignment could not be saved. Please try again.');
            return;
        }

        const nowIso = new Date().toISOString();
        const updatedJobCodes: string[] = [];
        const updatedJobIds: string[] = [];
        const next = current.map((job) => {
            if (!applyUpdateToJobIds.has(job.job_id)) {
                return job;
            }

            updatedJobCodes.push(job.job_code);
            updatedJobIds.push(job.job_id);
            const nextJobStatus: JobStatus =
                nextAssignedName
                    ? (job.job_status === 'pending' ? 'scheduled' : job.job_status)
                    : (job.job_status === 'scheduled' ? 'pending' : job.job_status);
            return {
                ...job,
                assigned_technician_name: nextAssignedName,
                pending_assigned_technician_name: null,
                job_status: nextJobStatus,
                updated_at: nowIso,
            };
        });

        persistJobs(next);

        appendAuditLog(
            updatedJobIds.length > 1 ? 'job.assigned.bulk' : 'job.assigned',
            updatedJobIds.length > 1
                ? `Technician assignment updated for ${updatedJobIds.length} jobs`
                : `Technician assignment updated for ${updatedJobCodes[0]}`,
            {
                job_ids: updatedJobIds,
                job_codes: updatedJobCodes,
                assigned_technician_name: nextAssignedName,
            },
        );

        if (failedBackendCount > 0) {
            const firstBackendError = failedBackendReasons[0];
            toast.warning(
                firstBackendError
                    ? `Saved ${updatedJobIds.length} assignment(s), but ${failedBackendCount} backend update(s) failed: ${firstBackendError}`
                    : `Saved ${updatedJobIds.length} assignment(s), but ${failedBackendCount} backend update(s) failed.`,
            );
        } else {
            toast.success(
                updatedJobIds.length > 1
                    ? `Assigned technician to ${updatedJobIds.length} jobs`
                    : `Assignment saved for ${updatedJobCodes[0]}`,
            );
        }

        setAssignSidebarOpen(false);
        setJobToAssign(null);
        setBulkAssignJobIds([]);
        setSelectedTechnicianName('unassigned');
        setSelectedRows((prev) => {
            const nextSelection = new Set(prev);
            updatedJobIds.forEach((id) => nextSelection.delete(id));
            return nextSelection;
        });
        refreshJobs({ showErrorToast: true, background: true });
    };

    const handleBulkRemoveJobs = async () => {
        if (selectedRows.size === 0) {
            toast.info('Select at least one job to remove.');
            return;
        }

        const selectedJobIdSet = new Set(selectedRows);
        const currentJobs = loadPersistedJobs();
        const jobsToRemove = currentJobs.filter((job) => selectedJobIdSet.has(job.job_id));

        if (jobsToRemove.length === 0) {
            toast.warning('No selected jobs were found.');
            return;
        }

        const confirmMessage = jobsToRemove.length === 1
            ? `Remove job ${jobsToRemove[0].job_code}?`
            : `Remove ${jobsToRemove.length} selected jobs?`;

        if (!window.confirm(`${confirmMessage} This cannot be undone.`)) {
            return;
        }

        const backendJobsToRemove = jobsToRemove.filter((job) => isBackendPersistedJobId(job.job_id));
        const localOnlyJobsToRemove = jobsToRemove.filter((job) => !isBackendPersistedJobId(job.job_id));

        const backendDeletedJobIds = new Set<string>();
        const backendDeleteFailures: Array<{ job_id: string; job_code: string; reason: string }> = [];

        if (backendJobsToRemove.length > 0) {
            const token = getStoredAdminToken();
            if (!token) {
                toast.error('Admin session is required to remove synced jobs.');
                return;
            }

            const deleteResults = await Promise.allSettled(
                backendJobsToRemove.map(async (job) => {
                    await deleteAdminJob(token, job.job_id);
                    return job;
                }),
            );

            deleteResults.forEach((result, index) => {
                const job = backendJobsToRemove[index];
                if (result.status === 'fulfilled') {
                    backendDeletedJobIds.add(job.job_id);
                    return;
                }

                backendDeleteFailures.push({
                    job_id: job.job_id,
                    job_code: job.job_code,
                    reason: result.reason instanceof Error ? result.reason.message : 'Delete failed',
                });
            });
        }

        const successfullyRemovedJobs = [
            ...localOnlyJobsToRemove,
            ...backendJobsToRemove.filter((job) => backendDeletedJobIds.has(job.job_id)),
        ];

        if (successfullyRemovedJobs.length === 0) {
            toast.error(
                backendDeleteFailures.length > 0
                    ? backendDeleteFailures[0].reason
                    : 'No selected jobs could be removed.',
            );
            return;
        }

        const removedJobIds = successfullyRemovedJobs.map((job) => job.job_id);
        const removedJobCodes = successfullyRemovedJobs.map((job) => job.job_code);
        const removedJobIdSet = new Set(removedJobIds);

        const nextJobs = currentJobs.filter((job) => !removedJobIdSet.has(job.job_id));
        persistJobs(nextJobs);
        appendAuditLog(
            removedJobIds.length > 1 ? 'job.removed.bulk' : 'job.removed',
            removedJobIds.length > 1
                ? `${removedJobIds.length} jobs removed`
                : `Job ${removedJobCodes[0]} removed`,
            {
                job_ids: removedJobIds,
                job_codes: removedJobCodes,
            },
            'warning',
        );

        if (jobToAssign && removedJobIdSet.has(jobToAssign.job_id)) {
            setAssignSidebarOpen(false);
            setJobToAssign(null);
            setBulkAssignJobIds([]);
            setSelectedTechnicianName('unassigned');
        }

        setSelectedRows(new Set());
        setPagination((prev) => ({ ...prev, page: 1 }));
        toast.success(
            removedJobIds.length > 1
                ? `${removedJobIds.length} jobs removed`
                : `${removedJobCodes[0]} removed`,
        );
        if (backendDeleteFailures.length > 0) {
            toast.warning(
                backendDeleteFailures.length > 1
                    ? `${backendDeleteFailures.length} jobs could not be removed`
                    : `${backendDeleteFailures[0].job_code} could not be removed`,
            );
        }
        refreshJobs({ showErrorToast: true, background: false });
    };
    const getJobsForExport = () => (
        selectedRows.size > 0
            ? loadPersistedJobs().filter((job) => selectedRows.has(job.job_id))
            : data
    );

    const getJobExportRows = (jobsToExport: Job[]) => jobsToExport.map((job) => ({
        JobCode: job.job_code,
        Customer: job.dealership_name,
        Service: job.service_name,
        Vehicle: job.vehicle_summary,
        Urgency: job.urgency,
        Technician: job.assigned_technician_name || '',
        JobStatus: job.job_status,
        Date: formatJobDate(job.created_at),
        Time: formatJobTime(job.created_at),
        CreatedAt: job.created_at,
        UpdatedAt: job.updated_at,
    }));

    const handleExport = (selectedColumns: string[], format: ExportFormat = 'csv') => {
        const exportRows = getJobExportRows(getJobsForExport());
        const exportData = selectColumnsForExport(exportRows, selectedColumns);
        const filename = selectedRows.size > 0 ? 'jobs_selected_export' : 'jobs_export';
        exportArrayData(exportData, filename, format);
    };

    const isBulkAssignMode = bulkAssignJobIds.length > 0;
    const bulkAssignSelectionCount = bulkAssignJobIds.length;
    const footerStart = pagination.total === 0 ? 0 : ((pagination.page - 1) * pagination.pageSize) + 1;
    const footerEnd = pagination.total === 0 ? 0 : Math.min(pagination.page * pagination.pageSize, pagination.total);
    const visibleSelectedCount = data.filter((job) => selectedRows.has(job.job_id)).length;
    const headerCheckboxState: boolean | 'indeterminate' = data.length === 0
        ? false
        : visibleSelectedCount === data.length
            ? true
            : visibleSelectedCount > 0
                ? 'indeterminate'
                : false;
    const activeFilterCount = [
        Boolean(searchQuery.trim()),
        urgencyFilter !== 'all',
        Boolean(dateFilter),
        activeQuickFilter !== null,
    ].filter(Boolean).length;
    const summaryCards = [
        {
            key: 'visible',
            label: 'Visible Results',
            value: pagination.total,
            icon: LayoutDashboard,
            iconClassName: 'text-[#2F8E92]',
            badgeClassName: 'border-[#2F8E92]/20 bg-[#2F8E92]/10 text-[#2F8E92]',
        },
        {
            key: 'review',
            label: 'Pending Review',
            value: quickFilterCounts.pendingReview,
            icon: ClipboardList,
            iconClassName: 'text-violet-600',
            badgeClassName: 'border-violet-200 bg-violet-50 text-violet-700',
        },
        {
            key: 'awaiting',
            label: 'Awaiting Tech',
            value: quickFilterCounts.awaitingTechAcceptance,
            icon: Truck,
            iconClassName: 'text-blue-600',
            badgeClassName: 'border-blue-200 bg-blue-50 text-blue-700',
        },
    ] as const;
    const queueQuickFilters = [
        {
            key: 'pending_review' as const,
            label: 'Pending Review',
            count: quickFilterCounts.pendingReview,
            icon: ClipboardList,
            activeClassName: 'border-violet-300 bg-violet-50 text-violet-700',
        },
        {
            key: 'awaiting_tech_acceptance' as const,
            label: 'Awaiting Tech',
            count: quickFilterCounts.awaitingTechAcceptance,
            icon: Truck,
            activeClassName: 'border-blue-300 bg-blue-50 text-blue-700',
        },
    ] as const;

    return (
        <div className="flex flex-col h-full space-y-6">

            {/* 1. Header Area */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">Jobs</h1>
                    <p className="text-sm text-muted-foreground font-medium">Monitor and manage all dispatch jobs</p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Badge variant="outline" className="h-6 rounded-full border-[#2F8E92]/20 bg-[#2F8E92]/5 text-[#2F8E92]">
                            <History className="mr-1.5 h-3 w-3" />
                            Live sync every 30s
                        </Badge>
                        {selectedRows.size > 0 ? (
                            <Badge variant="outline" className="h-6 rounded-full border-border bg-card text-foreground">
                                <Users className="mr-1.5 h-3 w-3" />
                                {selectedRows.size} selected
                            </Badge>
                        ) : null}
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-xl border-border bg-card px-4 shadow-sm hover:bg-muted"
                        onClick={() => refreshJobs({ showErrorToast: true, background: false })}
                        disabled={loading}
                    >
                        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                        Refresh
                    </Button>
                    <Button
                        size="sm"
                        className="h-9 gap-2 rounded-xl bg-[#2F8E92] px-4 shadow-sm hover:bg-[#267276]"
                        onClick={() => setCreateJobOpen(true)}
                    >
                        <Plus className="w-4 h-4" />
                        New Job
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2 rounded-xl border-border bg-card px-4 shadow-sm hover:bg-muted"
                        onClick={() => setExportModalOpen(true)}
                    >
                        <Download className="w-4 h-4 text-muted-foreground" />
                        Export CSV
                    </Button>
                </div>
            </div>

            <Dialog open={createJobOpen} onOpenChange={setCreateJobOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Create New Job</DialogTitle>
                        <DialogDescription>
                            New jobs are created in Admin Preview. Admin confirmation is required before any technician assignment or dispatch queue push.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Customer</Label>
                                <Select
                                    value={newJobForm.dealership_name}
                                    onValueChange={(value) => setNewJobForm((prev) => ({ ...prev, dealership_name: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select customer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {dealershipNames.map((dealership) => (
                                            <SelectItem key={dealership} value={dealership}>{dealership}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Service</Label>
                                <Input
                                    value={newJobForm.service_name}
                                    onChange={(event) => setNewJobForm((prev) => ({ ...prev, service_name: event.target.value }))}
                                    placeholder={serviceNames.length > 0 ? `${serviceNames[0]}, ${serviceNames[1] || 'Second service'}` : 'Enter one or more services, comma separated'}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Enter one or more services separated by commas.
                                </p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Vehicle Summary</Label>
                            <Input
                                value={newJobForm.vehicle_summary}
                                onChange={(event) => setNewJobForm((prev) => ({ ...prev, vehicle_summary: event.target.value }))}
                                placeholder="e.g. 2024 Audi A4"
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Urgency</Label>
                                <Select
                                    value={newJobForm.urgency}
                                    onValueChange={(value) => setNewJobForm((prev) => ({ ...prev, urgency: value as Urgency }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="normal">Normal</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="critical">Critical</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Assigned Technician</Label>
                                <Select
                                    value={newJobForm.assigned_technician_name}
                                    onValueChange={(value) => setNewJobForm((prev) => ({ ...prev, assigned_technician_name: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned">Unassigned</SelectItem>
                                        {technicianOptions.map((tech) => (
                                            <SelectItem key={tech.id} value={tech.name}>{tech.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setCreateJobOpen(false);
                                setNewJobForm(initialNewJobForm);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button className="bg-[#2F8E92] hover:bg-[#267276]" onClick={handleCreateJob}>
                            Create in Preview
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Sheet
                open={assignSidebarOpen}
                onOpenChange={(open) => {
                    setAssignSidebarOpen(open);
                    if (!open) {
                        setJobToAssign(null);
                        setBulkAssignJobIds([]);
                        setSelectedTechnicianName('unassigned');
                    }
                }}
            >
                <SheetContent side="right" className="w-full sm:max-w-2xl p-0">
                    <SheetHeader className="border-b px-5 py-4">
                        <SheetTitle>Assign Technician</SheetTitle>
                        <SheetDescription>
                            {isBulkAssignMode
                                ? `Select technician for ${bulkAssignSelectionCount} selected ${bulkAssignSelectionCount === 1 ? 'job' : 'jobs'}`
                                : (jobToAssign ? `Select technician for ${jobToAssign.job_code}` : 'Select technician for this job')}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="px-5 py-4 border-b bg-muted/20">
                        {jobToAssign ? (
                            <div className="space-y-1.5 text-sm">
                                <div className="font-semibold text-foreground">{jobToAssign.service_name}</div>
                                <div className="text-muted-foreground">{jobToAssign.dealership_name}</div>
                                <div className="text-muted-foreground">{jobToAssign.vehicle_summary}</div>
                                <div className="text-xs font-medium text-[#2F8E92]">
                                    Required zone: {assignJobZone || 'Unknown'} | Required skill: {jobToAssign.service_name}
                                </div>
                                {isBulkAssignMode && bulkAssignSelectionCount > 1 ? (
                                    <div className="text-xs text-muted-foreground">
                                        Applying to this job and {bulkAssignSelectionCount - 1} more selected jobs.
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>

                    <div className="p-4 space-y-3 overflow-y-auto">
                        <button
                            type="button"
                            onClick={() => setSelectedTechnicianName('unassigned')}
                            className={cn(
                                'w-full text-left rounded-lg border p-3 transition-colors',
                                selectedTechnicianName === 'unassigned'
                                    ? 'border-[#2F8E92] bg-[#2F8E92]/5'
                                    : 'border-border hover:bg-muted/40'
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <div className="font-medium text-sm">Unassigned</div>
                                <Badge variant="outline" className="text-xs">No tech</Badge>
                            </div>
                        </button>

                        {technicianOptions.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                No technicians available.
                            </div>
                        ) : null}

                        {technicianOptions
                            .slice()
                            .sort((a, b) => {
                                const aMatched = eligibleTechnicianIds.has(a.id) ? 1 : 0;
                                const bMatched = eligibleTechnicianIds.has(b.id) ? 1 : 0;
                                return bMatched - aMatched;
                            })
                            .map((tech) => (
                                <button
                                    key={tech.id}
                                    type="button"
                                    onClick={() => {
                                        if (!tech.isActive) {
                                            return;
                                        }
                                        setSelectedTechnicianName(tech.name);
                                    }}
                                    className={cn(
                                        'w-full text-left rounded-lg border p-3 transition-colors',
                                        !tech.isActive && 'cursor-not-allowed opacity-60 border-dashed bg-muted/20',
                                        selectedTechnicianName === tech.name
                                            ? 'border-[#2F8E92] bg-[#2F8E92]/5'
                                            : 'border-border hover:bg-muted/40'
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                                                {tech.name}
                                                {!tech.isActive ? (
                                                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                                        Inactive
                                                    </Badge>
                                                ) : eligibleTechnicianIds.has(tech.id) ? (
                                                    <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        Recommended
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px]">
                                                        Manual assign
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {tech.zones.map((zone) => (
                                                    <Badge key={`${tech.id}-zone-${zone}`} variant="outline" className="text-[10px]">
                                                        {zone}
                                                    </Badge>
                                                ))}
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {tech.skills.map((skill) => (
                                                    <Badge key={`${tech.id}-skill-${skill}`} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
                                                        {skill}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="w-5 h-5 rounded-full border flex items-center justify-center mt-0.5">
                                            {selectedTechnicianName === tech.name && tech.isActive && (
                                                <div className="w-2.5 h-2.5 rounded-full bg-[#2F8E92]" />
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                    </div>

                    <SheetFooter className="border-t px-5 py-4 sm:flex-row sm:justify-end gap-2">
                        <Button variant="outline" onClick={() => setAssignSidebarOpen(false)}>Cancel</Button>
                        <Button className="bg-[#2F8E92] hover:bg-[#267276]" onClick={submitTechnicianAssignment}>
                            {isBulkAssignMode ? `Apply to ${bulkAssignSelectionCount} Selected` : 'Save Assignment'}
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>

            <ColumnExportDialog
                open={exportModalOpen}
                onOpenChange={setExportModalOpen}
                title="Export Jobs"
                description="Select the job columns you want in your CSV."
                availableColumns={JOB_EXPORT_COLUMNS}
                onConfirm={handleExport}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {summaryCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <Card
                            key={card.key}
                            className="relative overflow-hidden border-border/70 bg-card shadow-sm backdrop-blur"
                        >
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                            <div className="p-4 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                        {card.label}
                                    </div>
                                    <div className="mt-1 text-2xl font-bold text-foreground">{card.value}</div>
                                </div>
                                <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl border', card.badgeClassName)}>
                                    <Icon className={cn('h-5 w-5', card.iconClassName)} />
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>

            {/* 2. Filter Bar (Enterprise Grade) */}
            <Card className="relative overflow-hidden border-border/70 bg-card shadow-sm backdrop-blur">
                <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-r from-[#2F8E92]/6 via-transparent to-blue-500/5 pointer-events-none" />
                <div className="relative p-4 md:p-5 space-y-4">
                    <div className="flex flex-col lg:flex-row gap-4">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <Input
                            placeholder="Search by Job Code, VIN, Stock, or Customer..."
                            className="h-10 pl-9 rounded-xl bg-muted/20 border-border focus:bg-background transition-all shadow-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0">
                        <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                            <SelectTrigger className="h-10 w-[170px] rounded-xl bg-background border-dashed border-border text-foreground shadow-sm">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                    <SelectValue placeholder="Urgency" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Urgency</SelectItem>
                                <SelectItem value="critical">Critical</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="normal">Normal</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="relative">
                            <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                                type="date"
                                value={dateFilter}
                                onChange={(event) => setDateFilter(event.target.value)}
                                className="h-10 w-[180px] rounded-xl pl-9 bg-background border-dashed border-border text-foreground shadow-sm"
                                aria-label="Filter by date"
                            />
                        </div>

                        {(urgencyFilter !== 'all' || dateFilter || searchQuery || activeQuickFilter !== null) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={clearFilters}
                                className="h-10 rounded-xl text-red-500 hover:text-red-600 hover:bg-red-50 px-3"
                            >
                                <X className="w-4 h-4 mr-1" /> Clear
                            </Button>
                        )}
                    </div>
                </div>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                Queue Filters
                            </div>
                            {queueQuickFilters.map((filter) => {
                                const Icon = filter.icon;
                                const isActive = activeQuickFilter === filter.key;
                                return (
                                    <Button
                                        key={filter.key}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleQuickFilterChipClick(filter.key)}
                                        className={cn(
                                            'h-9 rounded-xl border-border bg-card px-3 text-foreground hover:bg-muted shadow-sm',
                                            isActive && filter.activeClassName,
                                        )}
                                    >
                                        <Icon className="mr-2 h-3.5 w-3.5" />
                                        {filter.label}
                                        <span
                                            className={cn(
                                                'ml-2 inline-flex min-w-5 items-center justify-center rounded-full border px-1.5 text-[10px] font-semibold leading-4',
                                                isActive
                                                    ? 'border-current/20 bg-white/70'
                                                    : 'border-border bg-muted text-muted-foreground',
                                            )}
                                        >
                                            {filter.count}
                                        </span>
                                    </Button>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline" className="h-8 rounded-full border-border bg-card text-muted-foreground">
                                <TrendingUp className="mr-1.5 h-3 w-3" />
                                Sorted by rank
                            </Badge>
                            {activeFilterCount > 0 ? (
                                <Badge variant="outline" className="h-8 rounded-full border-border bg-card text-foreground">
                                    {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
                                </Badge>
                            ) : null}
                        </div>
                    </div>
                </div>
            </Card>

            {/* 3. Jobs Table */}
            <div className="relative flex-1 min-h-[560px] bg-card border border-border/70 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-r from-[#2F8E92]/5 via-transparent to-blue-500/5" />
                {loading ? (
                    <div className="p-4 md:p-5 space-y-4 min-h-[420px]">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Skeleton className="h-9 rounded-xl" />
                            <Skeleton className="h-9 rounded-xl" />
                            <Skeleton className="h-9 rounded-xl" />
                        </div>
                        {Array.from({ length: 10 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-lg" />
                        ))}
                    </div>
                ) : data.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-muted-foreground min-h-[420px]">
                        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                            <Search className="w-8 h-8 text-muted-foreground/70" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">No jobs found</h3>
                        <p className="text-sm mt-1 max-w-sm text-center text-muted-foreground">
                            We couldn't find any jobs matching your filters. Try adjusting your search criteria.
                        </p>
                        <Button variant="outline" className="mt-4 rounded-xl bg-card" onClick={clearFilters}>
                            Clear all filters
                        </Button>
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto min-h-[420px]">
                        <Table>
                            <TableHeader className="bg-muted/80 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                                <TableRow>
                                    <TableHead className="w-[40px] pl-4">
                                        <Checkbox
                                            checked={headerCheckboxState}
                                            onCheckedChange={handleSelectAll}
                                        />
                                    </TableHead>
                                    <TableHead className="w-[200px]">
                                        <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs font-bold text-muted-foreground uppercase tracking-wider hover:bg-muted">
                                            Job Details <ArrowUpDown className="ml-2 h-3 w-3" />
                                        </Button>
                                    </TableHead>
                                    <TableHead className="w-[180px] font-semibold text-xs text-muted-foreground uppercase tracking-wider">Customer</TableHead>
                                    <TableHead className="w-[200px] font-semibold text-xs text-muted-foreground uppercase tracking-wider">Vehicle</TableHead>
                                    <TableHead className="w-[180px] font-semibold text-xs text-muted-foreground uppercase tracking-wider">Technician</TableHead>
                                    <TableHead className="w-[120px] font-semibold text-xs text-muted-foreground uppercase tracking-wider">Urgency</TableHead>
                                    <TableHead className="w-[100px] font-semibold text-xs text-muted-foreground uppercase tracking-wider">Ranking</TableHead>

                                    <TableHead className="w-[140px] font-semibold text-xs text-muted-foreground uppercase tracking-wider">Status</TableHead>

                                    <TableHead className="w-[140px] font-semibold text-xs text-muted-foreground uppercase tracking-wider">Date</TableHead>
                                    <TableHead className="w-[120px] font-semibold text-xs text-muted-foreground uppercase tracking-wider">Time</TableHead>
                                    <TableHead className="w-[220px] text-right font-semibold text-xs text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((job) => (
                                    <TableRow
                                        key={job.job_id}
                                        className={cn(
                                            "group cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40",
                                            "even:bg-muted/10",
                                            job.attention_flag && "bg-red-500/5 hover:bg-red-500/10"
                                        )}
                                    >
                                        <TableCell className="pl-4 relative">
                                            {/* Attention Indicator */}
                                            {job.attention_flag && (
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-sm" />
                                            )}
                                            <Checkbox
                                                checked={selectedRows.has(job.job_id)}
                                                onCheckedChange={(checked) => handleSelectRow(job.job_id, checked as boolean)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-foreground group-hover:text-[#2F8E92] transition-colors">{job.job_code}</span>
                                                <span className="text-xs text-muted-foreground">{job.service_name}</span>
                                                {job.attention_flag && (
                                                    <span className="text-[10px] font-bold text-red-600 flex items-center gap-1 mt-1">
                                                        <AlertCircle className="w-3 h-3" /> Attention
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Building2Icon className="w-4 h-4 text-muted-foreground" />
                                                <span className="text-sm font-medium text-foreground">{job.dealership_name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm text-foreground font-medium">{job.vehicle_summary}</div>
                                        </TableCell>
                                        <TableCell>
                                            {job.assigned_technician_name ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-700">
                                                        {job.assigned_technician_name.substring(0, 2)}
                                                    </div>
                                                    <span className="text-sm text-foreground">{job.assigned_technician_name}</span>
                                                </div>
                                            ) : (job.job_status === 'admin_preview' || job.job_status === 'pending_admin_confirmation') && job.pending_assigned_technician_name ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-700">
                                                        {job.pending_assigned_technician_name.substring(0, 2)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm text-violet-700">{job.pending_assigned_technician_name}</span>
                                                        <span className="text-[10px] text-violet-500">Pending admin confirmation</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground italic">Unassigned</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={job.urgency} type="urgency" />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <Badge className="w-fit bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                                                    Rank: {job.ranking_score}
                                                </Badge>


                                                {job.applied_rules && job.applied_rules.length > 0 && (
                                                    <span className="text-[10px] text-muted-foreground mt-1 truncate max-w-[80px]" title={job.applied_rules.join(', ')}>
                                                        {job.applied_rules.length} rules
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <StatusBadge status={job.job_status} type="job" />
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm text-foreground">{formatJobDate(job.created_at)}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm text-muted-foreground">{formatJobTime(job.created_at)}</div>
                                        </TableCell>
                                        <TableCell className="text-right pr-4">
                                            <div className="flex items-center justify-end gap-2">
                                                {(job.job_status === 'admin_preview' || job.job_status === 'pending_admin_confirmation') && Boolean(
                                                    (job.pending_assigned_technician_name ?? job.assigned_technician_name)?.trim()
                                                ) && (
                                                    <Button
                                                        size="sm"
                                                        className="h-8 rounded-lg bg-[#2F8E92] hover:bg-[#267276] text-white shadow-sm"
                                                        onClick={() => void handleConfirmJob(job)}
                                                    >
                                                        Confirm
                                                    </Button>
                                                )}
                                                {isAssignableJob(job) ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 rounded-lg border-border bg-card hover:bg-muted"
                                                        onClick={() => handleAssignTechnician(job)}
                                                    >
                                                        {job.job_status === 'scheduled' && Boolean(job.assigned_technician_name?.trim())
                                                            ? 'Re-assign tech'
                                                            : 'Assign tech'}
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {/* Pagination & Footer */}
                <div className="border-t border-border/70 bg-muted/40 px-4 py-3 md:px-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span>
                            Showing <span className="font-medium text-foreground">{footerStart}</span> to <span className="font-medium text-foreground">{footerEnd}</span> of <span className="font-medium text-foreground">{pagination.total}</span> entries
                        </span>
                        {selectedRows.size > 0 ? (
                            <Badge variant="outline" className="h-7 rounded-full border-border bg-card text-foreground">
                                <Users className="mr-1.5 h-3 w-3" />
                                {selectedRows.size} selected
                            </Badge>
                        ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 md:gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Rows per page</span>
                            <Select
                                value={pagination.pageSize.toString()}
                                onValueChange={(val) => setPagination(prev => ({ ...prev, pageSize: Number(val), page: 1 }))}
                            >
                                <SelectTrigger className="w-[74px] h-8 rounded-lg bg-card border-border">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg border-border bg-card"
                                disabled={pagination.page === 1}
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <div className="text-sm font-medium px-2 text-foreground">
                                Page {pagination.page} of {pagination.totalPages}
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg border-border bg-card"
                                disabled={pagination.page >= pagination.totalPages}
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 5. Bulk Actions (Floating) */}
            {selectedRows.size > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-6 z-50 animate-in slide-in-from-bottom-4 duration-200">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 px-2 py-0.5 rounded text-sm font-bold">{selectedRows.size}</div>
                        <span className="text-sm font-medium">Selected</span>
                    </div>
                    <div className="h-4 w-px bg-white/20" />
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" className="hover:bg-white/10 text-white hover:text-white h-8" onClick={handleBulkAssignTechnician}>
                            <User className="w-4 h-4 mr-2" />
                            Assign Selected
                        </Button>
                        <Button size="sm" variant="ghost" className="hover:bg-white/10 text-white hover:text-white h-8" onClick={() => setExportModalOpen(true)}>
                            <Download className="w-4 h-4 mr-2" />
                            Export Selected
                        </Button>
                        <Button size="sm" variant="ghost" className="hover:bg-red-500/20 text-white hover:text-white h-8" onClick={handleBulkRemoveJobs}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remove Selected
                        </Button>
                    </div>
                    <div className="ml-2">
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 rounded-full hover:bg-white/20 text-gray-400 hover:text-white"
                            onClick={() => setSelectedRows(new Set())}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

// Icon Helper
function Building2Icon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
            <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
            <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
            <path d="M10 6h4" />
            <path d="M10 10h4" />
            <path d="M10 14h4" />
            <path d="M10 18h4" />
        </svg>
    )
}


