import { useState, useEffect, Fragment } from 'react';
import {
    Search,
    RefreshCw,
    Filter,
    ChevronDown,
    ChevronRight,
    Copy,
    FileJson,
    AlertCircle,
    Info,
    CheckCircle2,
    Calendar as CalendarIcon,
    X,
    ExternalLink,
    FileDown,
    Server,
    User,
    Wrench,
    Globe,
    Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { type DateRange } from 'react-day-picker';
import { exportArrayData, selectColumnsForExport, type ExportFormat } from '@/lib/export';
import ColumnExportDialog from '@/components/modals/ColumnExportDialog';

// --- Types ---

type Severity = 'info' | 'warning' | 'critical';
type ActorType = 'SYSTEM' | 'ADMIN_USER' | 'TECHNICIAN' | 'MAKE' | 'WEB_APP';

interface AuditEvent {
    id: string;
    created_at: string;
    job_id?: string;
    job_code?: string;
    event_type: string;
    actor_type: ActorType;
    actor_name?: string; // e.g. "John Doe" or "System"
    summary: string;
    payload_json: Record<string, any>;
    severity: Severity;
    correlation_id?: string;
    request_id?: string;
}

const AUDIT_LOGS_STORAGE_KEY = 'sm_dispatch_audit_logs';
const AUDIT_LOG_EXPORT_COLUMNS = [
    'Timestamp',
    'EventType',
    'ActorType',
    'ActorName',
    'Summary',
    'JobCode',
    'Severity',
    'CorrelationID',
    'Payload',
];

// --- Mock Data ---

const MOCK_LOGS: AuditEvent[] = [
    {
        id: 'evt_001',
        created_at: '2024-03-25T14:30:00Z',
        job_id: 'job_123',
        job_code: 'JOB-2024-001',
        event_type: 'job.status_changed',
        actor_type: 'TECHNICIAN',
        actor_name: 'Joliame',
        summary: 'Job marked as completed',
        payload_json: { old_status: 'in_progress', new_status: 'completed', location: { lat: 46.8139, lng: -71.2080 } },
        severity: 'info',
        correlation_id: 'corr_abc123',
        request_id: 'req_xyz789'
    },
    {
        id: 'evt_002',
        created_at: '2024-03-25T14:28:15Z',
        event_type: 'service.price_updated',
        actor_type: 'ADMIN_USER',
        actor_name: 'Admin',
        summary: 'Updated default price for "Démarreur 2-Way"',
        payload_json: { service_code: 'AUDI-SVC-2WAY', old_price: 450, new_price: 480, reason: 'Annual adjustment' },
        severity: 'warning',
        correlation_id: 'corr_def456'
    },
    {
        id: 'evt_003',
        created_at: '2024-03-25T14:25:00Z',
        job_id: 'job_124',
        job_code: 'JOB-2024-005',
        event_type: 'job.creation_failed',
        actor_type: 'SYSTEM',
        actor_name: 'System Worker',
        summary: 'Failed to create job from webhook',
        payload_json: { error: 'Validation failed: Missing vehicle VIN', source: 'Make.com', webhook_id: 'wh_999' },
        severity: 'critical',
        correlation_id: 'corr_ghi789'
    },
    {
        id: 'evt_004',
        created_at: '2024-03-25T14:00:00Z',
        event_type: 'dealership.added',
        actor_type: 'ADMIN_USER',
        actor_name: 'Manager Bob',
        summary: 'New customer "Toyota Ste-Foy" added',
        payload_json: { dealership_id: 'D-099', name: 'Toyota Ste-Foy', phone: '+14185550199' },
        severity: 'info',
        correlation_id: 'corr_jkl012'
    },
    {
        id: 'evt_005',
        created_at: '2024-03-25T13:45:00Z',
        event_type: 'sync.technicians',
        actor_type: 'MAKE',
        actor_name: 'Make Automation',
        summary: 'Synchronized technician schedules',
        payload_json: { techs_synced: 4, source: 'Google Calendar' },
        severity: 'info',
        correlation_id: 'corr_mno345'
    },
    {
        id: 'evt_006',
        created_at: '2024-03-25T13:30:00Z',
        job_id: 'job_123',
        job_code: 'JOB-2024-001',
        event_type: 'job.assigned',
        actor_type: 'WEB_APP',
        actor_name: 'Dispatcher',
        summary: 'Job assigned to Technician T-01',
        payload_json: { tech_id: 't1', tech_name: 'Joliame', assignment_mode: 'manual' },
        severity: 'info',
        correlation_id: 'corr_pqr678'
    },
    {
        id: 'evt_007',
        created_at: '2024-03-25T10:00:00Z',
        event_type: 'system.startup',
        actor_type: 'SYSTEM',
        summary: 'Backend services initialized',
        payload_json: { version: '1.2.0', env: 'production', region: 'ca-central-1' },
        severity: 'info',
        request_id: 'req_init_001'
    }
];

const loadPersistedLogs = (): AuditEvent[] => {
    try {
        const raw = localStorage.getItem(AUDIT_LOGS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed as AuditEvent[] : [];
    } catch {
        return [];
    }
};

const mergeAndSortLogs = (): AuditEvent[] => {
    const persisted = loadPersistedLogs();
    const mockRemainder = MOCK_LOGS.filter(
        (mockEvent) => !persisted.some((persistedEvent) => persistedEvent.id === mockEvent.id)
    );

    return [...persisted, ...mockRemainder].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
};

// --- Helpers ---

function ActorBadge({ type }: { type: ActorType }) {
    switch (type) {
        case 'SYSTEM':
            return <Badge variant="secondary" className="bg-muted text-foreground border-border"><Server className="w-3 h-3 mr-1" /> System</Badge>;
        case 'ADMIN_USER':
            return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-purple-200 shadow-none"><User className="w-3 h-3 mr-1" /> Admin</Badge>;
        case 'TECHNICIAN':
            return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 shadow-none"><Wrench className="w-3 h-3 mr-1" /> Tech</Badge>;
        case 'MAKE':
            return <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200"><Zap className="w-3 h-3 mr-1" /> Make</Badge>;
        case 'WEB_APP':
            return <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-200"><Globe className="w-3 h-3 mr-1" /> Web App</Badge>;
        default:
            return <Badge variant="outline">{type}</Badge>;
    }
}

function SeverityIndicator({ severity }: { severity: Severity }) {
    switch (severity) {
        case 'critical':
            return <div className="flex items-center text-red-600 font-medium text-xs"><AlertCircle className="w-3 h-3 mr-1" /> Critical</div>;
        case 'warning':
            return <div className="flex items-center text-amber-600 font-medium text-xs"><AlertCircle className="w-3 h-3 mr-1" /> Warning</div>;
        default:
            return <div className="flex items-center text-muted-foreground text-xs"><Info className="w-3 h-3 mr-1" /> Info</div>;
    }
}

export default function AuditLogsPage() {
    const [loading, setLoading] = useState(true);
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [exportModalOpen, setExportModalOpen] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterActor, setFilterActor] = useState<string>('all');
    const [filterSeverity, setFilterSeverity] = useState<string>('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    // Initial Fetch
    const fetchLogs = () => {
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            setEvents(mergeAndSortLogs());
            setLoading(false);
        }, 800);
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    // Handlers
    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedRows(newExpanded);
    };

    const handleCopyJSON = (json: Record<string, any>) => {
        navigator.clipboard.writeText(JSON.stringify(json, null, 2));
        // In a real app, toast notification here
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setFilterActor('all');
        setFilterSeverity('all');
        setDateRange(undefined);
    };

    const getAuditExportRows = () => filteredEvents.map(e => ({
            Timestamp: e.created_at,
            EventType: e.event_type,
            ActorType: e.actor_type,
            ActorName: e.actor_name || '',
            Summary: e.summary,
            JobCode: e.job_code || '',
            Severity: e.severity,
            CorrelationID: e.correlation_id || '',
            Payload: JSON.stringify(e.payload_json)
        }));

    const handleExport = (selectedColumns: string[], format: ExportFormat = 'csv') => {
        const exportData = selectColumnsForExport(getAuditExportRows(), selectedColumns);
        exportArrayData(exportData, 'audit_logs_export', format);
    };

    // Filter Logic
    const filteredEvents = events.filter(event => {
        const matchesSearch =
            searchQuery === '' ||
            event.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
            event.event_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (event.job_code && event.job_code.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (event.actor_name && event.actor_name.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesActor = filterActor === 'all' || event.actor_type === filterActor;
        const matchesSeverity = filterSeverity === 'all' || event.severity === filterSeverity;

        // Date Range Logic
        let matchesDate = true;
        if (dateRange?.from) {
            const eventDate = new Date(event.created_at);
            if (dateRange.to) {
                matchesDate = eventDate >= dateRange.from && eventDate <= dateRange.to;
            } else {
                matchesDate = eventDate >= dateRange.from;
            }
        }

        return matchesSearch && matchesActor && matchesSeverity && matchesDate;
    });

    return (
        <div className="flex flex-col h-full space-y-6">

            {/* 1. Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">Audit Logs</h1>
                    <p className="text-sm text-muted-foreground font-medium">System-wide immutable event timeline</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <div className="hidden sm:flex items-center text-xs text-muted-foreground/60 font-medium mr-2">
                        Last updated: {new Date().toLocaleTimeString()}
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="h-9 gap-2 text-foreground border-border">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)} className="h-9 gap-2 text-foreground border-border">
                        <FileDown className="w-4 h-4" /> Export CSV
                    </Button>
                </div>
            </div>

            <ColumnExportDialog
                open={exportModalOpen}
                onOpenChange={setExportModalOpen}
                title="Export Audit Logs"
                description="Select the audit log columns you want in your CSV."
                availableColumns={AUDIT_LOG_EXPORT_COLUMNS}
                onConfirm={handleExport}
            />

            {/* 2. Filter Bar */}
            <Card className="p-4 border-border shadow-sm space-y-4 bg-card">
                <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
                    <div className="relative flex-1 w-full lg:w-auto min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <Input
                            placeholder="Search job code, summary, or ID..."
                            className="pl-9 bg-muted/20 border-border focus:bg-background transition-all font-mono text-sm"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                        <Select value={filterActor} onValueChange={setFilterActor}>
                            <SelectTrigger className="w-[160px] bg-background border-border text-foreground">
                                <SelectValue placeholder="Actor Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Actors</SelectItem>
                                <SelectItem value="SYSTEM">System</SelectItem>
                                <SelectItem value="ADMIN_USER">Admin User</SelectItem>
                                <SelectItem value="TECHNICIAN">Technician</SelectItem>
                                <SelectItem value="MAKE">Make Automation</SelectItem>
                                <SelectItem value="WEB_APP">Web App</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                            <SelectTrigger className="w-[140px] bg-background border-border text-foreground">
                                <SelectValue placeholder="Severity" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Severities</SelectItem>
                                <SelectItem value="info">Info</SelectItem>
                                <SelectItem value="warning">Warning</SelectItem>
                                <SelectItem value="critical">Critical</SelectItem>
                            </SelectContent>
                        </Select>

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-[240px] justify-start text-left font-normal bg-background border-border",
                                        !dateRange && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>
                                                {format(dateRange.from, "LLL dd, y")} -{" "}
                                                {format(dateRange.to, "LLL dd, y")}
                                            </>
                                        ) : (
                                            format(dateRange.from, "LLL dd, y")
                                        )
                                    ) : (
                                        <span>Pick a date range</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>

                        {(searchQuery || filterActor !== 'all' || filterSeverity !== 'all' || dateRange) && (
                            <Button variant="ghost" onClick={handleClearFilters} className="text-muted-foreground hover:text-foreground">
                                <X className="w-4 h-4 mr-2" /> Clear
                            </Button>
                        )}
                    </div>
                </div>
            </Card>

            {/* 3. Audit Log Table */}
            <div className="flex-1 bg-background border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
                <Table>
                    <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                        <TableRow className="border-b border-border hover:bg-transparent">
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead className="w-[180px]">Timestamp</TableHead>
                            <TableHead className="w-[140px]">Event Type</TableHead>
                            <TableHead className="w-[140px]">Actor</TableHead>
                            <TableHead>Summary</TableHead>
                            <TableHead className="w-[120px]">Job Code</TableHead>
                            <TableHead className="w-[100px]">Severity</TableHead>
                            <TableHead className="w-[140px] font-mono text-xs text-muted-foreground/60 hidden lg:table-cell">Correlation ID</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredEvents.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-48 text-center text-gray-500">
                                    <div className="flex flex-col items-center justify-center">
                                        <FileJson className="w-10 h-10 text-gray-300 mb-2" />
                                        <p className="font-medium">No audit events found</p>
                                        <p className="text-xs text-gray-400 mt-1">Try adjusting filters or date range.</p>
                                        {(searchQuery || filterActor !== 'all') && (
                                            <Button variant="link" onClick={handleClearFilters} className="mt-2 text-[#2F8E92]">Clear Filters</Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredEvents.map(event => (
                                <Fragment key={event.id}>
                                    <TableRow
                                        className={cn(
                                            "group hover:bg-muted/30 transition-colors cursor-pointer border-b border-border/50",
                                            expandedRows.has(event.id) && "bg-blue-50/10 dark:bg-blue-900/10 hover:bg-blue-50/20 dark:bg-blue-900/20"
                                        )}
                                        onClick={() => toggleRow(event.id)}
                                    >
                                        <TableCell>
                                            <Button variant="ghost" size="icon" className="h-6 w-6">
                                                {expandedRows.has(event.id) ?
                                                    <ChevronDown className="w-4 h-4 text-muted-foreground" /> :
                                                    <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
                                                }
                                            </Button>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                            {format(new Date(event.created_at), 'yyyy-MM-dd HH:mm:ss')}
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-mono text-xs font-medium text-foreground bg-muted px-2 py-0.5 rounded border border-border">
                                                {event.event_type}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-0.5">
                                                <ActorBadge type={event.actor_type} />
                                                {event.actor_name && (
                                                    <span className="text-[10px] text-muted-foreground/60 pl-1">{event.actor_name}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-foreground font-medium">
                                            {event.summary}
                                        </TableCell>
                                        <TableCell>
                                            {event.job_code ? (
                                                <Button
                                                    variant="link"
                                                    className="p-0 h-auto text-[#2F8E92] font-mono text-xs hover:underline"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // Navigate to job detail (future)
                                                        alert(`Navigate to Job: ${event.job_code}`);
                                                    }}
                                                >
                                                    {event.job_code} <ExternalLink className="w-3 h-3 ml-1" />
                                                </Button>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <SeverityIndicator severity={event.severity} />
                                        </TableCell>
                                        <TableCell className="font-mono text-[10px] text-muted-foreground/50 hidden lg:table-cell">
                                            {event.correlation_id || '-'}
                                        </TableCell>
                                    </TableRow>

                                    {/* Expanded JSON Viewer */}
                                    {expandedRows.has(event.id) && (
                                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                                            <TableCell colSpan={8} className="p-0 border-b border-border">
                                                <div className="p-4 pl-14 border-l-4 border-[#2F8E92] m-2 mr-4 bg-card rounded-md shadow-sm">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                            <div className="flex items-center gap-1">
                                                                <FileJson className="w-3 h-3" /> Event Payload
                                                            </div>
                                                            {event.request_id && (
                                                                <span className="font-mono bg-muted px-1.5 py-0.5 rounded border border-border">req_id: {event.request_id}</span>
                                                            )}
                                                            <span className="font-mono text-muted-foreground/40">ID: {event.id}</span>
                                                        </div>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-6 text-xs gap-1 border-border text-foreground"
                                                            onClick={() => handleCopyJSON(event.payload_json)}
                                                        >
                                                            <Copy className="w-3 h-3" /> Copy JSON
                                                        </Button>
                                                    </div>
                                                    <ScrollArea className="h-[200px] w-full rounded border border-border bg-muted/30">
                                                        <pre className="p-4 text-xs font-mono text-foreground leading-relaxed overflow-auto">
                                                            {JSON.stringify(event.payload_json, null, 2)}
                                                        </pre>
                                                    </ScrollArea>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
