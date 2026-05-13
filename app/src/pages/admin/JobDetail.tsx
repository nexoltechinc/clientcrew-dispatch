import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Calendar,
    CheckCircle2,
    Clock,
    Car,
    User,
    AlertTriangle,
    FileText,
    DollarSign,
    Shield,
    MoreVertical,
    Download,
    ExternalLink,
    History,
    AlertCircle,
    Loader2,
    CheckSquare,
    X,
    RefreshCw,
    Search,
    Code
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { formatPhoneForDisplay, formatUsPhoneInput, phoneExampleFormat, toUsPhoneFormat } from '@/lib/phone';
import { fetchAdminJobs, getStoredAdminToken, updateAdminJob, type BackendAdminJob } from '@/lib/backend-api';

// --- Types ---

type JobStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
type InvoiceState = 'draft' | 'pending_approval' | 'creating' | 'approved' | 'synced' | 'failed' | 'needs_manual_verification' | 'not_started';
type Urgency = 'low' | 'normal' | 'high' | 'critical';

interface TimelineEvent {
    id: string;
    type: string;
    title: string;
    actor: 'SYSTEM' | 'ADMIN' | 'TECH' | 'MAKE';
    timestamp: string;
    description: string;
    payload?: any;
}

interface Technician {
    id: string;
    name: string;
    zone: string;
    skillMatch: boolean;
    status: 'available' | 'busy' | 'offline';
    workload: number; // 0-100
}

interface JobDetail {
    job_id: string;
    job_code: string;
    status: JobStatus;
    invoice_state: InvoiceState;
    urgency: Urgency;
    created_at: string;
    updated_at: string;

    dealership: {
        name: string;
        contact_phone: string;
        service_type: string;
        service_names: string[];
    };

    vehicle: {
        make: string;
        model: string;
        year: string;
        vin: string;
        stock: string;
        raw_text: string;
        parsing_confidence: number;
    };

    technician?: {
        id: string;
        name: string;
        phone: string;
        status: string;
    };

    invoice: {
        id?: string;
        items: Array<{ description: string; quantity: number; unit_price: number; total: number }>;
        subtotal: number;
        tax: number;
        total: number;
        sync_id?: string;
        pdf_url?: string;
    };

    allowed_actions: string[];
    timeline: TimelineEvent[];
}

// --- Mock Data ---

const MOCK_JOB: JobDetail = {
    job_id: 'job-123',
    job_code: 'DIQ-2024-1021',
    status: 'pending',
    invoice_state: 'pending_approval',
    urgency: 'high',
    created_at: '2024-03-20T09:15:00Z',
    updated_at: '2024-03-20T10:30:00Z',

    dealership: {
        name: 'Northwind Auto',
        contact_phone: '(555) 123-4567',
        service_type: 'Key Programming',
        service_names: ['Key Programming'],
    },

    vehicle: {
        make: 'Ford',
        model: 'F-150',
        year: '2023',
        vin: '1FTEW1E...5928',
        stock: 'STK-9921',
        raw_text: '2023 Ford F150 needing spare key program. Stock #STK-9921.',
        parsing_confidence: 0.82,
    },

    invoice: {
        items: [
            { description: 'Transponder Key Program', quantity: 1, unit_price: 150.00, total: 150.00 },
            { description: 'Service Call Fee', quantity: 1, unit_price: 45.00, total: 45.00 },
        ],
        subtotal: 195.00,
        tax: 15.60,
        total: 210.60,
    },

    allowed_actions: ['assign_tech', 'cancel_job', 'approve_invoice', 'edit_details'],

    timeline: [
        { id: '1', type: 'MESSAGE_RECEIVED', title: 'Request Received', actor: 'SYSTEM', timestamp: '09:15 AM', description: 'Parsed from dispatch email.', payload: { raw_subject: 'Service Req: Metro Ford' } },
        { id: '2', type: 'PARSED', title: 'Parsing Completed', actor: 'MAKE', timestamp: '09:15 AM', description: 'Extracted vehicle and customer info.', payload: { confidence: 0.82 } },
        { id: '3', type: 'STATUS_CHANGED', title: 'Job Created', actor: 'SYSTEM', timestamp: '09:16 AM', description: 'Status set to PENDING.' },
    ]
};

const ELIGIBLE_TECHS: Technician[] = [
    { id: 't1', name: 'Taylor Brooks', zone: 'North', skillMatch: true, status: 'available', workload: 20 },
    { id: 't2', name: 'Jordan Lee', zone: 'North', skillMatch: true, status: 'busy', workload: 80 },
    { id: 't3', name: 'Casey Patel', zone: 'East', skillMatch: false, status: 'available', workload: 10 },
];

function normalizeJobStatus(status?: string | null): JobStatus {
    switch ((status || '').toLowerCase()) {
        case 'scheduled':
            return 'scheduled';
        case 'in_progress':
            return 'in_progress';
        case 'completed':
            return 'completed';
        case 'cancelled':
            return 'cancelled';
        default:
            return 'pending';
    }
}

function normalizeInvoiceState(source: BackendAdminJob): InvoiceState {
    const raw = typeof source.source_metadata?.invoice_state === 'string'
        ? String(source.source_metadata.invoice_state).toLowerCase()
        : '';
    switch (raw) {
        case 'draft':
        case 'pending_approval':
        case 'creating':
        case 'approved':
        case 'synced':
        case 'failed':
        case 'needs_manual_verification':
        case 'not_started':
            return raw;
        default:
            return source.assigned_technician_name ? 'pending_approval' : 'not_started';
    }
}

function normalizeUrgency(source: BackendAdminJob): Urgency {
    const raw = typeof source.source_metadata?.urgency === 'string'
        ? String(source.source_metadata.urgency).toLowerCase()
        : '';
    switch (raw) {
        case 'low':
        case 'normal':
        case 'high':
        case 'critical':
            return raw;
        default:
            return 'normal';
    }
}

function buildAllowedActions(source: BackendAdminJob): string[] {
    const normalizedStatus = normalizeJobStatus(source.status);
    if (normalizedStatus === 'completed' || normalizedStatus === 'cancelled') {
        return [];
    }
    return [
        ...(!source.assigned_technician_id ? ['assign_tech'] : []),
        'edit_details',
        'approve_invoice',
        'cancel_job',
    ];
}

function buildTimeline(source: BackendAdminJob): TimelineEvent[] {
    const timeline: TimelineEvent[] = [
        {
            id: `${source.id}-created`,
            type: 'STATUS_CHANGED',
            title: 'Job Loaded',
            actor: 'SYSTEM',
            timestamp: new Date(source.created_at).toLocaleString(),
            description: `Current status is ${normalizeJobStatus(source.status).replace(/_/g, ' ')}.`,
            payload: source.source_metadata ?? undefined,
        },
    ];

    if (source.assigned_technician_name) {
        timeline.unshift({
            id: `${source.id}-tech`,
            type: 'TECH_ASSIGNED',
            title: 'Technician Assigned',
            actor: 'ADMIN',
            timestamp: new Date(source.updated_at).toLocaleString(),
            description: `${source.assigned_technician_name} is currently assigned to this job.`,
        });
    }

    if (source.updated_at !== source.created_at) {
        timeline.unshift({
            id: `${source.id}-updated`,
            type: 'DETAILS_UPDATED',
            title: 'Job Updated',
            actor: 'SYSTEM',
            timestamp: new Date(source.updated_at).toLocaleString(),
            description: 'Job details were refreshed from the backend.',
        });
    }

    return timeline;
}

function mapBackendJobToDetail(source: BackendAdminJob): JobDetail {
    const serviceNames = Array.from(
        new Set(
            (source.service_names ?? [])
                .map((value) => value.trim())
                .filter(Boolean),
        ),
    );
    const primaryService = serviceNames[0] || source.service_type || 'Unspecified Service';
    const vehicleSummary = (source.vehicle || '').trim();
    const [vehicleYear = '', vehicleMake = '', ...vehicleModelParts] = vehicleSummary.split(/\s+/).filter(Boolean);
    const vehicleModel = vehicleModelParts.join(' ');

    return {
        job_id: source.id,
        job_code: source.job_code,
        status: normalizeJobStatus(source.status),
        invoice_state: normalizeInvoiceState(source),
        urgency: normalizeUrgency(source),
        created_at: source.created_at,
        updated_at: source.updated_at,
        dealership: {
            name: source.dealership_name || 'Unknown Customer',
            contact_phone: formatPhoneForDisplay(''),
            service_type: primaryService,
            service_names: serviceNames.length > 0 ? serviceNames : [primaryService],
        },
        vehicle: {
            make: vehicleMake,
            model: vehicleModel,
            year: vehicleYear,
            vin: '',
            stock: '',
            raw_text: vehicleSummary || 'No vehicle summary available.',
            parsing_confidence: 0,
        },
        technician: source.assigned_technician_id ? {
            id: source.assigned_technician_id,
            name: source.assigned_technician_name || 'Assigned Technician',
            phone: '',
            status: 'assigned',
        } : undefined,
        invoice: {
            items: [],
            subtotal: 0,
            tax: 0,
            total: 0,
        },
        allowed_actions: buildAllowedActions(source),
        timeline: buildTimeline(source),
    };
}

// --- Components ---

function StatusBadge({ status, type }: { status: string; type: 'job' | 'invoice' | 'urgency' }) {
    const styles: Record<string, string> = {
        // Job Status
        pending: 'bg-orange-100 text-orange-700 border-orange-200',
        scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
        in_progress: 'bg-blue-500 text-white border-blue-600',
        completed: 'bg-green-100 text-green-700 border-green-200',
        cancelled: 'bg-gray-100 text-gray-700 border-gray-200',

        // Invoice State
        not_started: 'bg-gray-100 text-gray-500 border-gray-200',
        draft: 'bg-gray-50 text-gray-600 border-gray-200',
        pending_approval: 'bg-orange-50 text-orange-700 border-orange-200',
        creating: 'bg-blue-50 text-blue-700 border-blue-200',
        approved: 'bg-blue-50 text-blue-700 border-blue-200',
        synced: 'bg-green-50 text-green-700 border-green-200',
        failed: 'bg-red-50 text-red-700 border-red-200',
        needs_manual_verification: 'bg-red-100 text-red-800 border-red-200',

        // Urgency
        low: 'bg-slate-100 text-slate-600 border-slate-200',
        normal: 'bg-blue-50 text-blue-600 border-blue-200',
        high: 'bg-orange-50 text-orange-600 border-orange-200',
        critical: 'bg-red-50 text-red-600 border-red-200 animate-pulse',
    };

    const labels: Record<string, string> = {
        pending: 'Pending', scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
        not_started: 'Not Started', draft: 'Draft', pending_approval: 'Needs Approval', creating: 'Creating...', approved: 'Approved', synced: 'Synced', failed: 'Failed', needs_manual_verification: 'Verify Manually',
        low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical'
    };

    return (
        <Badge variant="outline" className={cn('capitalize font-medium border shadow-sm rounded-md px-2.5 py-0.5', styles[status] || 'bg-muted text-foreground')}>
            {labels[status] || status.replace(/_/g, ' ')}
        </Badge>
    );
}

function TimelineItem({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
    const [expanded, setExpanded] = useState(false);

    const icons: Record<string, any> = {
        MESSAGE_RECEIVED: FileText,
        PARSED: Code,
        STATUS_CHANGED: RefreshCw,
        TECH_ASSIGNED: User,
        INVOICE_APPROVAL_REQUESTED: DollarSign,
        DETAILS_UPDATED: RefreshCw,
        DEFAULT: Clock
    };

    const Icon = icons[event.type] || icons.DEFAULT;

    return (
        <div className="relative pl-8 pb-8 last:pb-0">
            {!isLast && <div className="absolute left-[11px] top-8 bottom-0 w-px bg-border" />}
            <div className={cn(
                "absolute left-0 top-1 w-6 h-6 rounded-full border flex items-center justify-center bg-background z-10",
                event.actor === 'SYSTEM' ? 'border-border text-muted-foreground' :
                    event.actor === 'ADMIN' ? 'border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' :
                        event.actor === 'TECH' ? 'border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' :
                            'border-purple-200 dark:border-purple-900 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30'
            )}>
                <Icon className="w-3 h-3" />
            </div>

            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{event.title}</span>
                    <span className="text-xs text-muted-foreground font-mono">{event.timestamp}</span>
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-auto font-medium text-muted-foreground bg-muted/50">{event.actor}</Badge>
                </div>
                <p className="text-sm text-muted-foreground pb-1">{event.description}</p>

                {event.payload && (
                    <div className="mt-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-gray-500 hover:text-gray-900 p-0"
                            onClick={() => setExpanded(!expanded)}
                        >
                            {expanded ? 'Hide Details' : 'View Payload'}
                        </Button>
                        {expanded && (
                            <div className="mt-2 p-3 bg-gray-900 text-gray-50 rounded-md text-xs font-mono overflow-auto max-h-40">
                                <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Main Page Component ---

export default function JobDetailPage() {
    const navigate = useNavigate();
    const { jobId } = useParams();
    const [job, setJob] = useState<JobDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);

    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        dealershipName: '',
        dealershipPhone: '',
        serviceType: '',
        vehicleYear: '',
        vehicleMake: '',
        vehicleModel: '',
        vehicleVin: '',
        vehicleStock: ''
    });

    const buildEditFormFromJob = (source: JobDetail) => ({
        dealershipName: source.dealership.name,
        dealershipPhone: formatPhoneForDisplay(source.dealership.contact_phone),
        serviceType: source.dealership.service_type,
        vehicleYear: source.vehicle.year,
        vehicleMake: source.vehicle.make,
        vehicleModel: source.vehicle.model,
        vehicleVin: source.vehicle.vin,
        vehicleStock: source.vehicle.stock
    });

    const loadJob = useCallback((background = false) => {
        const adminToken = getStoredAdminToken();
        if (!adminToken) {
            setLoadError('Admin session missing. Please login again.');
            setLoading(false);
            setRefreshing(false);
            return;
        }

        if (background) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        setLoadError(null);

        void fetchAdminJobs(adminToken)
            .then((jobs) => {
                const matchedJob = jobs.find((item) => item.id === jobId || item.job_code === jobId);
                if (!matchedJob) {
                    throw new Error('Job not found.');
                }
                setJob(mapBackendJobToDetail(matchedJob));
            })
            .catch((error) => {
                const message = error instanceof Error ? error.message : 'Unable to load job details.';
                setLoadError(message);
                if (!background) {
                    setJob(null);
                }
            })
            .finally(() => {
                setLoading(false);
                setRefreshing(false);
            });
    }, [jobId]);

    useEffect(() => {
        loadJob(false);
    }, [jobId, loadJob]);

    // Sync Form State
    useEffect(() => {
        if (job) {
            setEditForm(buildEditFormFromJob(job));
        }
    }, [job]);

    if (loading || !job) {
        return (
            <div className="space-y-6 max-w-[1600px] mx-auto p-6">
                {loading ? (
                    <>
                        <Skeleton className="h-20 w-full" />
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Skeleton className="h-[600px] col-span-2" />
                            <Skeleton className="h-[600px]" />
                        </div>
                    </>
                ) : (
                    <Card className="p-6 border-red-200 bg-red-50/80">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-red-700">Unable to load job</h2>
                                <p className="text-sm text-red-600">{loadError || 'Job details are unavailable right now.'}</p>
                            </div>
                            <Button variant="outline" size="sm" className="h-9 gap-2 border-red-200 text-red-700 hover:text-red-800" onClick={() => loadJob(false)}>
                                <RefreshCw className="w-4 h-4" />
                                Refresh
                            </Button>
                        </div>
                    </Card>
                )}
            </div>
        );
    }

    // Action Handlers
    const handleAssignTech = (techId: string) => {
        setAssignModalOpen(false);
        setJob((prev) => prev ? ({
            ...prev,
            status: 'scheduled',
            assigned_technician_name: 'Taylor Brooks',
            technician: { id: techId, name: 'Taylor Brooks', phone: '+1(555) 999-8888', status: 'assigned' },
            timeline: [
                { id: Date.now().toString(), type: 'TECH_ASSIGNED', title: 'Technician Assigned', actor: 'ADMIN', timestamp: 'Just now', description: 'Assigned Taylor Brooks to job.' },
                ...prev.timeline
            ]
        }) : null);
    };

    const handleSaveDetails = async () => {
        if (!job) return;

        const formattedDealershipPhone = toUsPhoneFormat(editForm.dealershipPhone);
        if (!formattedDealershipPhone || formattedDealershipPhone !== editForm.dealershipPhone.trim()) {
            alert(`Phone must be in this format: ${phoneExampleFormat}.`);
            return;
        }

        const token = getStoredAdminToken();
        if (!token) {
            alert('Admin session missing. Please login again.');
            return;
        }

        const serviceNames = Array.from(
            new Set(
                editForm.serviceType
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
            ),
        );
        if (serviceNames.length === 0) {
            alert('At least one service is required.');
            return;
        }

        const vehicleParts = [
            editForm.vehicleYear.trim(),
            editForm.vehicleMake.trim(),
            editForm.vehicleModel.trim(),
        ].filter(Boolean);

        try {
            const updated = await updateAdminJob(token, job.job_id, {
                dealership_name: editForm.dealershipName.trim(),
                service_name: serviceNames[0],
                service_names: serviceNames,
                vehicle_summary: vehicleParts.join(' '),
            });
            setJob((prev) => prev ? ({
                ...mapBackendJobToDetail(updated),
                dealership: {
                    ...mapBackendJobToDetail(updated).dealership,
                    contact_phone: formattedDealershipPhone,
                },
                vehicle: {
                    ...mapBackendJobToDetail(updated).vehicle,
                    vin: editForm.vehicleVin,
                    stock: editForm.vehicleStock,
                },
                timeline: [
                    { id: Date.now().toString(), type: 'DETAILS_UPDATED', title: 'Job Details Updated', actor: 'ADMIN', timestamp: 'Just now', description: 'Admin manually updated job details.' },
                    ...prev.timeline,
                ],
            }) : null);
            setIsEditing(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to update job details.';
            alert(message);
        }
    };

    const handleCancelEdit = () => {
        if (job) {
            setEditForm(buildEditFormFromJob(job));
        }
        setIsEditing(false);
    };

    const handleApproveInvoice = () => {
        setInvoiceModalOpen(false);
        setJob(prev => prev ? ({
            ...prev,
            invoice_state: 'creating',
            timeline: [
                { id: Date.now().toString(), type: 'INVOICE_APPROVED', title: 'Invoice Approved', actor: 'ADMIN', timestamp: 'Just now', description: 'Approved for invoice sync.' },
                ...prev.timeline
            ]
        }) : null);

        setTimeout(() => {
            setJob(prev => prev ? ({
                ...prev,
                invoice_state: 'synced',
                timeline: [
                    { id: Date.now().toString(), type: 'INVOICE_SYNCED', title: 'Invoice Synced', actor: 'SYSTEM', timestamp: 'Just now', description: 'Invoice #1021 synced to accounting.' },
                    ...prev.timeline
                ],
                invoice: { ...prev.invoice, sync_id: '1021', pdf_url: '#' }
            }) : null);
        }, 2000);
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-20">

            {/* 1. Header Section */}
            <div className="bg-card border-b border-border -mx-4 px-8 py-5 sticky top-0 z-20 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-start gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/admin/jobs')}>
                        <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl font-bold text-foreground tracking-tight">{job.job_code}</h1>
                            <StatusBadge status={job.status} type="job" />
                            <StatusBadge status={job.invoice_state} type="invoice" />
                            {job.urgency === 'high' || job.urgency === 'critical' ? <StatusBadge status={job.urgency} type="urgency" /> : null}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Created {new Date(job.created_at).toLocaleString()}</span>
                            <span className="text-border">|</span>
                            <span>Updated {new Date(job.updated_at).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2"
                        onClick={() => loadJob(true)}
                        disabled={refreshing}
                    >
                        <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
                        Refresh
                    </Button>
                    {isEditing && (
                        <div className="flex items-center gap-2 mr-2">
                            <Button variant="ghost" onClick={handleCancelEdit}>Cancel Edit</Button>
                            <Button className="bg-[#2F8E92] text-white hover:bg-[#267276]" onClick={handleSaveDetails}>Save Changes</Button>
                        </div>
                    )}

                    {!isEditing && job.allowed_actions.includes('assign_tech') && !job.technician && (
                        <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-[#2F8E92] hover:bg-[#267276] text-white">
                                    <User className="w-4 h-4 mr-2" /> Assign Technician
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>Assign Technician</DialogTitle>
                                    <DialogDescription>Select an available technician for {job.job_code}.</DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Technician</TableHead>
                                                <TableHead>Zone</TableHead>
                                                <TableHead>Workload</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {ELIGIBLE_TECHS.map(tech => (
                                                <TableRow key={tech.id}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("w-2 h-2 rounded-full", tech.status === 'available' ? 'bg-green-500' : 'bg-yellow-500')} />
                                                            {tech.name}
                                                            {tech.skillMatch && <Badge variant="secondary" className="text-[10px] ml-1">Skill Match</Badge>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{tech.zone}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
                                                                <div className="h-full bg-blue-500" style={{ width: `${tech.workload}%` }} />
                                                            </div>
                                                            <span className="text-xs text-gray-500">{tech.workload}%</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="sm" onClick={() => handleAssignTech(tech.id)}>Assign</Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </DialogContent>
                        </Dialog>
                    )}

                    {!isEditing && job.allowed_actions.includes('cancel_job') && (
                        <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
                            Cancel Job
                        </Button>
                    )}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <MoreVertical className="w-4 h-4 text-muted-foreground" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Manage</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setIsEditing(true)}>Edit Details</DropdownMenuItem>
                            <DropdownMenuItem>View Logs</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600">Delete Job</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 px-4 sm:px-0">

                {/* Left Column: Operational Data */}
                <div className="xl:col-span-2 space-y-6">

                    {/* 3. Dealership & Vehicle Info */}
                    <Card className={cn(
                        "shadow-sm border-border transition-all duration-300 bg-card",
                        isEditing && "ring-2 ring-[#2F8E92] border-[#2F8E92]"
                    )}>
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg font-semibold flex items-center gap-2 text-foreground">
                                    <Car className="w-5 h-5 text-muted-foreground" />
                                    Job Details
                                </CardTitle>
                                {isEditing ? (
                                    <Badge variant="default" className="bg-[#2F8E92]">Editing Mode</Badge>
                                ) : job.vehicle.parsing_confidence < 0.85 && (
                                    <Badge variant="outline" className="text-amber-600 dark:text-amber-500 bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900">
                                        Low Confidence Parsing ({Math.round(job.vehicle.parsing_confidence * 100)}%)
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    {isEditing ? (
                                        <>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer Name</label>
                                                <Input className="bg-background" value={editForm.dealershipName} onChange={e => setEditForm({ ...editForm, dealershipName: e.target.value })} />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone</label>
                                                <Input
                                                    className="bg-background"
                                                    placeholder={phoneExampleFormat}
                                                    value={editForm.dealershipPhone}
                                                    onChange={e => setEditForm({ ...editForm, dealershipPhone: formatUsPhoneInput(e.target.value) })}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Services</label>
                                                <Input className="bg-background" value={editForm.serviceType} onChange={e => setEditForm({ ...editForm, serviceType: e.target.value })} />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div>
                                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Customer</h4>
                                                <div className="text-sm font-medium text-foreground">{job.dealership.name}</div>
                                                <div className="text-sm text-muted-foreground">{formatPhoneForDisplay(job.dealership.contact_phone)}</div>
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Services</h4>
                                                <div className="text-sm font-medium text-foreground">{job.dealership.service_names.join(', ')}</div>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    {isEditing ? (
                                        <>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Year</label>
                                                    <Input className="bg-background" value={editForm.vehicleYear} onChange={e => setEditForm({ ...editForm, vehicleYear: e.target.value })} />
                                                </div>
                                                <div className="space-y-1.5 col-span-2">
                                                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Make</label>
                                                    <Input className="bg-background" value={editForm.vehicleMake} onChange={e => setEditForm({ ...editForm, vehicleMake: e.target.value })} />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Model</label>
                                                <Input className="bg-background" value={editForm.vehicleModel} onChange={e => setEditForm({ ...editForm, vehicleModel: e.target.value })} />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">VIN</label>
                                                <Input className="bg-background" value={editForm.vehicleVin} onChange={e => setEditForm({ ...editForm, vehicleVin: e.target.value })} />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock #</label>
                                                <Input className="bg-background" value={editForm.vehicleStock} onChange={e => setEditForm({ ...editForm, vehicleStock: e.target.value })} />
                                            </div>
                                        </>
                                    ) : (
                                        <div>
                                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Vehicle</h4>
                                            <div className="text-sm font-medium text-foreground flex items-center gap-2">
                                                {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}
                                            </div>
                                            <div className="text-sm text-muted-foreground font-mono mt-0.5">
                                                VIN: {job.vehicle.vin}
                                            </div>
                                            <div className="text-sm text-muted-foreground font-mono">
                                                Stock: {job.vehicle.stock}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Separator className="my-4" />

                            <div className="mt-4">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Technician Assignment</h4>
                                {job.technician ? (
                                    <div className="flex items-center justify-between bg-emerald-50/30 dark:bg-emerald-950/20 p-4 rounded-lg border border-emerald-100 dark:border-emerald-900">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-bold">
                                                {job.technician.name.substring(0, 2)}
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-foreground">{job.technician.name}</div>
                                                <div className="text-xs text-muted-foreground">{formatPhoneForDisplay(job.technician.phone)} • Active now</div>
                                            </div>
                                        </div>
                                        <Button variant="outline" size="sm" className="bg-background hover:bg-muted text-foreground border-border">Reassign</Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between bg-muted/30 p-4 rounded-lg border border-dashed border-border">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <AlertCircle className="w-4 h-4" />
                                            <span className="text-sm">No technician assigned yet.</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* 5. Job Timeline */}
                    <Card className="shadow-sm border-border bg-card">
                        <CardHeader>
                            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-foreground">
                                <History className="w-5 h-5 text-muted-foreground" />
                                Audit Timeline
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="pl-2">
                                {job.timeline.map((event, i) => (
                                    <TimelineItem
                                        key={event.id}
                                        event={event}
                                        isLast={i === job.timeline.length - 1}
                                    />
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Financial Panel */}
                <div className="space-y-6">
                    <Card className="shadow-sm border-border h-fit sticky top-24 bg-card">
                        <CardHeader className={cn(
                            "border-b border-border",
                            job.invoice_state === 'pending_approval' ? "bg-orange-50/30 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900" :
                                job.invoice_state === 'synced' ? "bg-green-50/30 dark:bg-green-950/20 border-green-100 dark:border-green-900" :
                                    "bg-muted/50 border-border"
                        )}>
                            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-foreground">
                                <DollarSign className="w-5 h-5 text-muted-foreground" />
                                Invoice Control
                            </CardTitle>
                            <CardDescription className="text-muted-foreground">
                                Current State: <span className="font-medium text-foreground uppercase">{job.invoice_state.replace('_', ' ')}</span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {/* Invoice Items Table */}
                            <div className="p-4">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="h-8">Item</TableHead>
                                            <TableHead className="h-8 text-right">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {job.invoice.items.map((item, i) => (
                                            <TableRow key={i} className="hover:bg-transparent border-0">
                                                <TableCell className="py-2">
                                                    <div className="font-medium text-foreground">{item.description}</div>
                                                    <div className="text-xs text-muted-foreground">Qty: {item.quantity} × ${item.unit_price.toFixed(2)}</div>
                                                </TableCell>
                                                <TableCell className="text-right py-2 font-medium text-foreground">
                                                    ${item.total.toFixed(2)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>

                                <Separator className="my-4 border-border" />

                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm text-muted-foreground">
                                        <span>Subtotal</span>
                                        <span>${job.invoice.subtotal.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-muted-foreground">
                                        <span>Tax</span>
                                        <span>${job.invoice.tax.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-lg font-bold text-foreground pt-2 border-t border-border mt-2">
                                        <span>Total</span>
                                        <span>${job.invoice.total.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions Area */}
                            <div className="p-4 bg-muted/50 border-t border-border rounded-b-xl">
                                {job.invoice_state === 'pending_approval' && (
                                    <Dialog open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
                                        <DialogTrigger asChild>
                                            <Button className="w-full bg-[#2F8E92] hover:bg-[#267276] shadow-sm font-semibold">
                                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                                Approve & Generate
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Confirm Invoice Approval</DialogTitle>
                                                <DialogDescription>
                                                    This will lock the invoice and immediately sync it to accounting. This action triggers financial events.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="bg-gray-50 p-4 rounded-lg my-2">
                                                <div className="flex justify-between font-medium">
                                                    <span>Total Amount</span>
                                                    <span>${job.invoice.total.toFixed(2)}</span>
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <Button variant="outline" onClick={() => setInvoiceModalOpen(false)}>Cancel</Button>
                                                <Button onClick={handleApproveInvoice} className="bg-[#2F8E92] hover:bg-[#267276]">Confirm Approval</Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                )}

                                {job.invoice_state === 'creating' && (
                                    <Button disabled className="w-full bg-blue-50 text-blue-700 hover:bg-blue-50 border border-blue-100">
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Syncing invoice...
                                    </Button>
                                )}

                                {job.invoice_state === 'synced' && (
                                    <div className="space-y-3">
                                        <Button className="w-full bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 shadow-sm">
                                            <ExternalLink className="w-4 h-4 mr-2" />
                                            Open Synced Invoice
                                        </Button>
                                        <div className="text-center">
                                            <span className="text-xs text-gray-500 font-medium">Sync ID: {job.invoice.sync_id}</span>
                                        </div>
                                    </div>
                                )}

                                {job.invoice_state === 'needs_manual_verification' && (
                                    <Button variant="destructive" className="w-full">
                                        <Shield className="w-4 h-4 mr-2" />
                                        Verify Manually
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

