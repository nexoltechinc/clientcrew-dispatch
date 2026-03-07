import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Search,
    RefreshCw,
    Plus,
    MoreVertical,
    Clock,
    Calendar,
    MapPin,
    Shield,
    Briefcase,
    X,
    User,
    FileDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportArrayData, selectColumnsForExport, type ExportFormat } from '@/lib/export';
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
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetFooter,
} from '@/components/ui/sheet';
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ColumnExportDialog from '@/components/modals/ColumnExportDialog';
import {
    formatPhoneForDisplay,
    formatUsPhoneInput,
    getPhoneSearchToken,
    phoneExampleFormat,
    toUsPhoneFormat,
} from '@/lib/phone';
import { useAuth, type TechnicianAccountSummary } from '@/contexts/AuthContext';
import {
    fetchAdminTechnicians,
    getStoredAdminToken,
    type BackendTechnicianListItem,
} from '@/lib/backend-api';

// --- Types ---

interface TimeOff {
    id: string;
    start: string;
    end: string;
    reason: string;
}

interface WorkingHours {
    day: string; // 'Mon', 'Tue', etc.
    start: string;
    end: string;
    is_closed: boolean;
}

interface Technician {
    id: string;
    name: string;
    full_name?: string;
    tech_code: string; // Unique
    phone: string;
    profile_picture_url?: string;
    status: 'active' | 'inactive';
    has_pending_email_change_request?: boolean;
    pending_email_change_requested_email?: string;
    zones: string[];
    skills: string[];
    working_hours: WorkingHours[];
    time_off: TimeOff[];
    current_jobs_count: number;
    current_assignments: { job_code: string; status: string; scheduled_at?: string }[];
    allowed_actions: string[];
}

interface PersistedAuditEvent {
    id: string;
    created_at: string;
    event_type: string;
    actor_type: 'WEB_APP';
    actor_name: string;
    summary: string;
    payload_json: Record<string, any>;
    severity: 'info' | 'warning' | 'critical';
}

const DEFAULT_ACCOUNT_ZONES = ['Unassigned'];
const DEFAULT_ACCOUNT_SKILLS = ['General Service'];
const DEFAULT_ACCOUNT_ACTIONS = ['view_profile', 'edit_tech', 'set_time_off', 'deactivate'];

const persistTechniciansToStorage = (_techs: Technician[]) => {
    // Intentionally no-op: technician data is sourced from backend only.
};

const appendAuditLog = (
    _event_type: string,
    _summary: string,
    _payload_json: Record<string, any>,
    _severity: 'info' | 'warning' | 'critical' = 'info'
) => {
    // Audit logging intentionally disabled.
};

// --- Mock Data ---

const REAL_HOURS_MON_THU = { start: '08:00', end: '17:00', is_closed: false };
const REAL_HOURS_FRI = { start: '08:00', end: '15:00', is_closed: false };
const REAL_HOURS_WEEKEND = { start: '00:00', end: '00:00', is_closed: true };

const getRealSchedule = () => [
    { day: 'Mon', ...REAL_HOURS_MON_THU },
    { day: 'Tue', ...REAL_HOURS_MON_THU },
    { day: 'Wed', ...REAL_HOURS_MON_THU },
    { day: 'Thu', ...REAL_HOURS_MON_THU },
    { day: 'Fri', ...REAL_HOURS_FRI },
    { day: 'Sat', ...REAL_HOURS_WEEKEND },
    { day: 'Sun', ...REAL_HOURS_WEEKEND },
];

const parseDateBoundary = (value: string, boundary: 'start' | 'end'): Date => {
    if (!value) return new Date('');
    if (value.includes('T')) return new Date(value);
    return new Date(`${value}T${boundary === 'start' ? '00:00:00' : '23:59:59'}`);
};

const formatDateForUi = (value: string): string => {
    const parsed = parseDateBoundary(value, 'start');
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
};

const cloneTech = (tech: Technician): Technician => JSON.parse(JSON.stringify(tech)) as Technician;

const makeAccountTechCode = (accountId: string, usedCodes: Set<string>) => {
    const compact = accountId.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const seed = compact.slice(-4) || '0001';
    let candidate = `ACC-${seed}`;
    let suffix = 1;

    while (usedCodes.has(candidate.toLowerCase())) {
        candidate = `ACC-${seed}-${suffix}`;
        suffix += 1;
    }

    usedCodes.add(candidate.toLowerCase());
    return candidate;
};

const mergeTechniciansWithAccounts = (
    source: Technician[],
    accounts: TechnicianAccountSummary[]
): Technician[] => {
    const byId = new Map<string, Technician>();
    source.forEach((tech) => {
        byId.set(tech.id, {
            ...tech,
            phone: formatPhoneForDisplay(tech.phone),
        });
    });

    const usedCodes = new Set(
        [...byId.values()]
            .map((tech) => tech.tech_code.trim().toLowerCase())
            .filter(Boolean)
    );

    accounts.forEach((account) => {
        const existing = byId.get(account.id);
        const techCode = existing?.tech_code?.trim()
            ? existing.tech_code
            : makeAccountTechCode(account.id, usedCodes);

        const next: Technician = {
            id: account.id,
            name: account.name,
            tech_code: techCode,
            phone: formatPhoneForDisplay(account.phone ?? existing?.phone ?? ''),
            status: account.isActive ? 'active' : 'inactive',
            zones: existing?.zones?.length ? existing.zones : [...DEFAULT_ACCOUNT_ZONES],
            skills: existing?.skills?.length ? existing.skills : [...DEFAULT_ACCOUNT_SKILLS],
            working_hours: existing?.working_hours?.length ? existing.working_hours : getRealSchedule(),
            time_off: existing?.time_off ?? [],
            current_jobs_count: existing?.current_jobs_count ?? 0,
            current_assignments: existing?.current_assignments ?? [],
            allowed_actions: existing?.allowed_actions?.length ? existing.allowed_actions : [...DEFAULT_ACCOUNT_ACTIONS],
        };

        byId.set(account.id, next);
    });

    return [...byId.values()];
};

const mapBackendTechnician = (item: BackendTechnicianListItem, index: number): Technician => {
    return {
        id: item.id,
        name: item.full_name || item.name,
        full_name: item.full_name || item.name,
        tech_code: `T-${String(index + 1).padStart(2, '0')}`,
        phone: formatPhoneForDisplay(item.phone ?? ''),
        profile_picture_url: item.profile_picture_url ?? undefined,
        status: item.status === 'active' ? 'active' : 'inactive',
        has_pending_email_change_request: item.has_pending_email_change_request ?? false,
        pending_email_change_requested_email: item.pending_email_change_requested_email ?? undefined,
        zones: item.zones.map((zone) => zone.name),
        skills: item.skills.map((skill) => skill.name),
        working_hours: getRealSchedule(),
        time_off: [],
        current_jobs_count: item.current_jobs_count,
        current_assignments: [],
        allowed_actions: [...DEFAULT_ACCOUNT_ACTIONS],
    };
};

// --- Components ---

function StatusBadge({ status }: { status: 'active' | 'inactive' }) {
    if (status === 'active') return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 shadow-none">Active</Badge>;
    return <Badge variant="outline" className="text-gray-500 border-gray-200">Inactive</Badge>;
}

function ProfileStat({
    label,
    value,
    hint,
    valueClassName = 'text-gray-900',
}: {
    label: string;
    value: string;
    hint?: string;
    valueClassName?: string;
}) {
    return (
        <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">{label}</p>
            <p className={cn('mt-1 text-lg font-semibold leading-none', valueClassName)}>{value}</p>
            {hint ? <p className="mt-1 text-[11px] text-gray-500">{hint}</p> : null}
        </div>
    );
}

const TECHNICIAN_EXPORT_COLUMNS = [
    'TechCode',
    'Name',
    'Phone',
    'Status',
    'ActiveJobs',
    'Zones',
    'Skills',
    'WorkingHours',
];

export default function TechniciansPage() {
    const { technicianAccounts, hasBackendAdminToken } = useAuth();
    const [techs, setTechs] = useState<Technician[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterZone, setFilterZone] = useState<string>('all');
    const [filterSkill, setFilterSkill] = useState<string>('all');
    const [isBackendSynced, setIsBackendSynced] = useState(false);

    // Drawers & Modals
    const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
    const [techDraft, setTechDraft] = useState<Technician | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [timeOffModalOpen, setTimeOffModalOpen] = useState(false);
    const [addTechModalOpen, setAddTechModalOpen] = useState(false);
    const [editTechModalOpen, setEditTechModalOpen] = useState(false);
    const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);

    // Form States (for creating new tech or time off)
    const [newTechForm, setNewTechForm] = useState({ name: '', code: '', phone: '', zones: '', skills: '' });
    const [editTechForm, setEditTechForm] = useState({ name: '', code: '', phone: '', zones: '', skills: '' });
    const [timeOffForm, setTimeOffForm] = useState({ start: '', end: '', reason: '' });
    const [newZoneInput, setNewZoneInput] = useState('');
    const [newSkillInput, setNewSkillInput] = useState('');

    // Initial Fetch
    const fetchTechs = useCallback(async () => {
        setLoading(true);
        const adminToken = getStoredAdminToken();

        if (hasBackendAdminToken && adminToken) {
            try {
                const backendItems = await fetchAdminTechnicians(adminToken);
                const mapped = backendItems.map(mapBackendTechnician);
                setTechs(mapped);
                setIsBackendSynced(true);
                setLoading(false);
                return;
            } catch {
                // Fall through to account snapshot source if backend call fails.
            }
        }

        const merged = mergeTechniciansWithAccounts([], technicianAccounts);
        setTechs(merged);
        setIsBackendSynced(false);
        setLoading(false);
    }, [hasBackendAdminToken, technicianAccounts]);

    useEffect(() => {
        void fetchTechs();
    }, [fetchTechs]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const handleAdminRefresh = () => {
            void fetchTechs();
        };

        window.addEventListener('sm-dispatch:admin-refresh', handleAdminRefresh);
        return () => {
            window.removeEventListener('sm-dispatch:admin-refresh', handleAdminRefresh);
        };
    }, [fetchTechs]);

    useEffect(() => {
        if (isBackendSynced) {
            return;
        }
        setTechs((prev) => {
            const merged = mergeTechniciansWithAccounts(prev, technicianAccounts);
            if (JSON.stringify(merged) === JSON.stringify(prev)) {
                return prev;
            }
            return merged;
        });
    }, [isBackendSynced, technicianAccounts]);

    const zoneFilterOptions = Array.from(
        new Set(
            techs
                .flatMap((tech) => tech.zones)
                .map((zone) => zone.trim())
                .filter((zone) => zone.length > 0),
        ),
    ).sort((a, b) => a.localeCompare(b));

    const skillFilterOptions = Array.from(
        new Set(
            techs
                .flatMap((tech) => tech.skills)
                .map((skill) => skill.trim())
                .filter((skill) => skill.length > 0),
        ),
    ).sort((a, b) => a.localeCompare(b));

    // Filter Logic
    const filteredTechs = techs.filter(tech => {
        const query = searchQuery.toLowerCase();
        const queryPhoneToken = getPhoneSearchToken(searchQuery);
        const matchesSearch =
            tech.name.toLowerCase().includes(query) ||
            tech.tech_code.toLowerCase().includes(query) ||
            tech.phone.includes(searchQuery) ||
            (queryPhoneToken.length > 0 && getPhoneSearchToken(tech.phone).includes(queryPhoneToken));
        const matchesStatus = filterStatus === 'all' || tech.status === filterStatus;
        const matchesZone =
            filterZone === 'all' ||
            tech.zones.some((zone) => zone.trim().toLowerCase() === filterZone.toLowerCase());
        const matchesSkill =
            filterSkill === 'all' ||
            tech.skills.some((skill) => skill.trim().toLowerCase() === filterSkill.toLowerCase());
        return matchesSearch && matchesStatus && matchesZone && matchesSkill;
    });
    const totalTechCount = techs.length;
    const activeTechCount = techs.filter((tech) => tech.status === 'active').length;
    const inactiveTechCount = totalTechCount - activeTechCount;
    const assignedJobsCount = techs.reduce((sum, tech) => sum + tech.current_jobs_count, 0);
    const busyTechniciansCount = techs.filter((tech) => tech.current_jobs_count > 0).length;
    const hasActiveFilters =
        searchQuery.trim().length > 0
        || filterStatus !== 'all'
        || filterZone !== 'all'
        || filterSkill !== 'all';
    const clearFilters = () => {
        setSearchQuery('');
        setFilterStatus('all');
        setFilterZone('all');
        setFilterSkill('all');
    };

    // Handlers
    const hasDrawerChanges = useMemo(() => {
        if (!selectedTech || !techDraft) return false;
        return JSON.stringify({
            zones: selectedTech.zones,
            skills: selectedTech.skills,
            working_hours: selectedTech.working_hours,
            time_off: selectedTech.time_off,
        }) !== JSON.stringify({
            zones: techDraft.zones,
            skills: techDraft.skills,
            working_hours: techDraft.working_hours,
            time_off: techDraft.time_off,
        });
    }, [selectedTech, techDraft]);

    const profileSummary = useMemo(() => {
        if (!techDraft) {
            return null;
        }

        const openDaysCount = techDraft.working_hours.filter((row) => !row.is_closed).length;
        return {
            activeJobs: techDraft.current_jobs_count,
            zonesCount: techDraft.zones.length,
            skillsCount: techDraft.skills.length,
            openDaysCount,
            timeOffCount: techDraft.time_off.length,
        };
    }, [techDraft]);

    const updateDraft = (updater: (draft: Technician) => Technician) => {
        setTechDraft((prev) => (prev ? updater(prev) : prev));
    };

    const handleOpenProfile = (tech: Technician) => {
        const snapshot = cloneTech(tech);
        setSelectedTech(snapshot);
        setTechDraft(cloneTech(snapshot));
        setNewZoneInput('');
        setNewSkillInput('');
        setTimeOffForm({ start: '', end: '', reason: '' });
        setDrawerOpen(true);
    };

    const handleCancelDrawerChanges = () => {
        if (!selectedTech) return;
        setTechDraft(cloneTech(selectedTech));
        setNewZoneInput('');
        setNewSkillInput('');
        setTimeOffForm({ start: '', end: '', reason: '' });
        setTimeOffModalOpen(false);
    };

    const handleSaveDrawerChanges = () => {
        if (!selectedTech || !techDraft || !hasDrawerChanges) return;

        const beforeSnapshot = {
            zones: selectedTech.zones,
            skills: selectedTech.skills,
            working_hours: selectedTech.working_hours,
            time_off: selectedTech.time_off,
        };
        const afterSnapshot = {
            zones: techDraft.zones,
            skills: techDraft.skills,
            working_hours: techDraft.working_hours,
            time_off: techDraft.time_off,
        };

        const saved = cloneTech(techDraft);
        setTechs(prev => {
            const next = prev.map(t => t.id === saved.id ? saved : t);
            persistTechniciansToStorage(next);
            return next;
        });
        setSelectedTech(saved);
        setTechDraft(cloneTech(saved));
        appendAuditLog(
            'technician.profile_updated',
            `Technician ${saved.name} profile updated`,
            {
                tech_id: saved.id,
                tech_code: saved.tech_code,
                before: beforeSnapshot,
                after: afterSnapshot,
            }
        );
    };

    const handleDrawerOpenChange = (open: boolean) => {
        if (!open && hasDrawerChanges) {
            const discard = window.confirm('Discard unsaved technician changes?');
            if (!discard) return;
        }

        setDrawerOpen(open);
        if (!open) {
            setSelectedTech(null);
            setTechDraft(null);
            setNewZoneInput('');
            setNewSkillInput('');
            setTimeOffForm({ start: '', end: '', reason: '' });
            setTimeOffModalOpen(false);
        }
    };

    const handleAddZone = () => {
        if (!techDraft) return;
        const zone = newZoneInput.trim();
        if (!zone) return;

        if (techDraft.zones.some(z => z.toLowerCase() === zone.toLowerCase())) {
            alert('Zone already assigned.');
            return;
        }

        updateDraft((draft) => ({ ...draft, zones: [...draft.zones, zone] }));
        setNewZoneInput('');
    };

    const handleRemoveZone = (zone: string) => {
        if (!techDraft) return;
        if (techDraft.zones.length <= 1) {
            alert('Technician must have at least one zone.');
            return;
        }

        updateDraft((draft) => ({
            ...draft,
            zones: draft.zones.filter(z => z !== zone),
        }));
    };

    const handleAddSkill = () => {
        if (!techDraft) return;
        const skill = newSkillInput.trim();
        if (!skill) return;

        if (techDraft.skills.some(s => s.toLowerCase() === skill.toLowerCase())) {
            alert('Skill already assigned.');
            return;
        }

        updateDraft((draft) => ({ ...draft, skills: [...draft.skills, skill] }));
        setNewSkillInput('');
    };

    const handleRemoveSkill = (skill: string) => {
        if (!techDraft) return;
        if (techDraft.skills.length <= 1) {
            alert('Technician must have at least one skill.');
            return;
        }

        updateDraft((draft) => ({
            ...draft,
            skills: draft.skills.filter(s => s !== skill),
        }));
    };

    const handleWorkingHoursTimeChange = (index: number, field: 'start' | 'end', value: string) => {
        if (!techDraft || !value) return;

        updateDraft((draft) => ({
            ...draft,
            working_hours: draft.working_hours.map((wh, i) =>
                i === index ? { ...wh, [field]: value, is_closed: false } : wh
            ),
        }));
    };

    const handleToggleWorkingDay = (index: number, isOpen: boolean) => {
        if (!techDraft || !techDraft.working_hours[index]) return;

        updateDraft((draft) => ({
            ...draft,
            working_hours: draft.working_hours.map((wh, i) => {
                if (i !== index) return wh;
                if (!isOpen) return { ...wh, is_closed: true };
                return {
                    ...wh,
                    is_closed: false,
                    start: wh.start === '00:00' ? '08:00' : wh.start,
                    end: wh.end === '00:00' ? '17:00' : wh.end,
                };
            }),
        }));
    };

    const handleRemoveTimeOff = (timeOffId: string) => {
        if (!techDraft) return;

        updateDraft((draft) => {
            const nextTimeOff = draft.time_off.filter((entry) => entry.id !== timeOffId);
            return {
                ...draft,
                time_off: nextTimeOff,
            };
        });
    };

    const handleSaveTimeOff = () => {
        if (!techDraft) return;
        const start = timeOffForm.start.trim();
        const end = timeOffForm.end.trim();
        const reason = timeOffForm.reason.trim();

        if (!start || !end || !reason) {
            alert('Start date, end date, and reason are required.');
            return;
        }

        const startBoundary = parseDateBoundary(start, 'start');
        const endBoundary = parseDateBoundary(end, 'end');
        if (Number.isNaN(startBoundary.getTime()) || Number.isNaN(endBoundary.getTime())) {
            alert('Please select valid time off dates.');
            return;
        }
        if (startBoundary > endBoundary) {
            alert('End date must be on or after start date.');
            return;
        }

        const hasOverlap = techDraft.time_off.some((entry) => {
            const existingStart = parseDateBoundary(entry.start, 'start');
            const existingEnd = parseDateBoundary(entry.end, 'end');
            if (Number.isNaN(existingStart.getTime()) || Number.isNaN(existingEnd.getTime())) return false;
            return startBoundary <= existingEnd && endBoundary >= existingStart;
        });
        if (hasOverlap) {
            alert('Time off overlaps an existing entry.');
            return;
        }

        const newTimeOff: TimeOff = {
            id: `to-${Date.now()}`,
            start,
            end,
            reason
        };

        updateDraft((draft) => ({
            ...draft,
            time_off: [...draft.time_off, newTimeOff],
        }));
        setTimeOffModalOpen(false);
        setTimeOffForm({ start: '', end: '', reason: '' });
    };

    const handleAddTech = () => {
        const name = newTechForm.name.trim();
        const code = newTechForm.code.trim();
        const phone = toUsPhoneFormat(newTechForm.phone);
        const zones = newTechForm.zones.split(',').map(s => s.trim()).filter(Boolean);
        const skills = newTechForm.skills.split(',').map(s => s.trim()).filter(Boolean);

        if (!name || !code || !phone) {
            alert("Name, tech code, and phone are required.");
            return;
        }
        if (phone !== newTechForm.phone.trim()) {
            alert(`Phone must be in this format: ${phoneExampleFormat}.`);
            return;
        }
        if (techs.some(t => t.tech_code.toLowerCase() === code.toLowerCase())) {
            alert("Tech code already exists.");
            return;
        }
        if (techs.some(t => toUsPhoneFormat(t.phone) === phone)) {
            alert("Phone already exists.");
            return;
        }

        const newTech: Technician = {
            id: `t-${Date.now()}`,
            name,
            tech_code: code,
            phone,
            status: 'active',
            zones,
            skills,
            working_hours: getRealSchedule(),
            time_off: [],
            current_jobs_count: 0,
            current_assignments: [],
            allowed_actions: ['view_profile', 'edit_tech', 'set_time_off', 'deactivate']
        };

        setTechs(prev => {
            const next = [...prev, newTech];
            persistTechniciansToStorage(next);
            return next;
        });
        appendAuditLog(
            'technician.created',
            `Technician ${newTech.name} (${newTech.tech_code}) created`,
            {
                tech_id: newTech.id,
                tech_code: newTech.tech_code,
                phone: newTech.phone,
                zones: newTech.zones,
                skills: newTech.skills
            }
        );
        setAddTechModalOpen(false);
        setNewTechForm({ name: '', code: '', phone: '', zones: '', skills: '' });

        // Open drawer for the new tech
        setTimeout(() => handleOpenProfile(newTech), 300);
    };

    const openEditTechModal = (tech: Technician) => {
        if (hasDrawerChanges) {
            alert('Save or cancel pending profile changes before opening full edit.');
            return;
        }
        setSelectedTech(tech);
        setEditTechForm({
            name: tech.name,
            code: tech.tech_code,
            phone: formatPhoneForDisplay(tech.phone),
            zones: tech.zones.join(', '),
            skills: tech.skills.join(', ')
        });
        setEditTechModalOpen(true);
    };

    const handleSaveTechEdit = () => {
        if (!selectedTech) return;

        const name = editTechForm.name.trim();
        const code = editTechForm.code.trim();
        const phone = toUsPhoneFormat(editTechForm.phone);
        const zones = editTechForm.zones.split(',').map(s => s.trim()).filter(Boolean);
        const skills = editTechForm.skills.split(',').map(s => s.trim()).filter(Boolean);

        if (!name || !code || !phone) {
            alert("Name, tech code, and phone are required.");
            return;
        }
        if (phone !== editTechForm.phone.trim()) {
            alert(`Phone must be in this format: ${phoneExampleFormat}.`);
            return;
        }
        if (techs.some(t => t.id !== selectedTech.id && t.tech_code.toLowerCase() === code.toLowerCase())) {
            alert("Tech code already exists.");
            return;
        }
        if (techs.some(t => t.id !== selectedTech.id && toUsPhoneFormat(t.phone) === phone)) {
            alert("Phone already exists.");
            return;
        }

        const updatedTech: Technician = {
            ...selectedTech,
            name,
            tech_code: code,
            phone,
            zones,
            skills
        };

        setTechs(prev => {
            const next = prev.map(t => t.id === updatedTech.id ? updatedTech : t);
            persistTechniciansToStorage(next);
            return next;
        });
        setSelectedTech(updatedTech);
        setTechDraft(cloneTech(updatedTech));
        appendAuditLog(
            'technician.updated',
            `Technician ${updatedTech.name} (${updatedTech.tech_code}) updated`,
            {
                tech_id: updatedTech.id,
                tech_code: updatedTech.tech_code,
                phone: updatedTech.phone,
                zones: updatedTech.zones,
                skills: updatedTech.skills
            }
        );
        setEditTechModalOpen(false);
    };

    const handleToggleStatus = () => {
        if (!selectedTech) return;
        if (hasDrawerChanges) {
            alert('Save or cancel pending profile changes before changing status.');
            return;
        }
        if (selectedTech.status === 'active') {
            // Check for active jobs
            if (selectedTech.current_jobs_count > 0) {
                alert("Cannot deactivate technician with active assigned jobs.");
                return;
            }
            // Open confirmation for deactivation
            setConfirmDeactivateOpen(true);
        } else {
            // Activate immediately
            const updated = { ...selectedTech, status: 'active' as const };
            setTechs(prev => {
                const next = prev.map(t => t.id === updated.id ? updated : t);
                persistTechniciansToStorage(next);
                return next;
            });
            setSelectedTech(updated);
            setTechDraft(cloneTech(updated));
            appendAuditLog(
                'technician.status_changed',
                `Technician ${updated.name} activated`,
                { tech_id: updated.id, tech_code: updated.tech_code, new_status: 'active' }
            );
        }
    };

    const confirmDeactivate = () => {
        if (!selectedTech) return;
        const updated = { ...selectedTech, status: 'inactive' as const };
        setTechs(prev => {
            const next = prev.map(t => t.id === updated.id ? updated : t);
            persistTechniciansToStorage(next);
            return next;
        });
        setSelectedTech(updated);
        setTechDraft(cloneTech(updated));
        appendAuditLog(
            'technician.status_changed',
            `Technician ${updated.name} deactivated`,
            { tech_id: updated.id, tech_code: updated.tech_code, new_status: 'inactive' },
            'warning'
        );
        setConfirmDeactivateOpen(false);
    };

    const getTechnicianExportRows = () => techs.map(t => ({
            TechCode: t.tech_code,
            Name: t.name,
            Phone: t.phone,
            Status: t.status,
            ActiveJobs: t.current_jobs_count,
            Zones: t.zones.join('; '),
            Skills: t.skills.join('; '),
            WorkingHours: JSON.stringify(t.working_hours) // Simplify for CSV
        }));

    const handleExport = (selectedColumns: string[], format: ExportFormat = 'csv') => {
        const exportData = selectColumnsForExport(getTechnicianExportRows(), selectedColumns);
        exportArrayData(exportData, 'technicians_export', format);
    };

    return (
        <div className="flex flex-col h-full space-y-6">

            {/* 1. Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">Technicians</h1>
                    <p className="text-sm text-muted-foreground font-medium">Manage technician profiles, skills, zones, and schedules</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <Button variant="outline" size="sm" onClick={() => void fetchTechs()} className="h-9 gap-2" disabled={loading}>
                        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)} className="h-9 gap-2">
                        <FileDown className="w-4 h-4" /> Export
                    </Button>
                    <Dialog open={addTechModalOpen} onOpenChange={setAddTechModalOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="h-9 gap-2 bg-[#2F8E92] hover:bg-[#267276]">
                                <Plus className="w-4 h-4" /> Add Technician
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add New Technician</DialogTitle>
                                <DialogDescription>Create a new technician profile. They will start as 'Active'.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Full Name</Label>
                                        <Input placeholder="e.g. John Doe" value={newTechForm.name} onChange={e => setNewTechForm({ ...newTechForm, name: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tech Code</Label>
                                        <Input placeholder="e.g. TECH-999" value={newTechForm.code} onChange={e => setNewTechForm({ ...newTechForm, code: e.target.value })} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <Input
                                        placeholder={phoneExampleFormat}
                                        value={newTechForm.phone}
                                        onChange={e => setNewTechForm({ ...newTechForm, phone: formatUsPhoneInput(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Default Zones (comma separated)</Label>
                                    <Input placeholder="North, Downtown" value={newTechForm.zones} onChange={e => setNewTechForm({ ...newTechForm, zones: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Default Skills (comma separated)</Label>
                                    <Input placeholder="Locksmith, Towing" value={newTechForm.skills} onChange={e => setNewTechForm({ ...newTechForm, skills: e.target.value })} />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setAddTechModalOpen(false)}>Cancel</Button>
                                <Button onClick={handleAddTech} className="bg-[#2F8E92] hover:bg-[#267276]">Create Technician</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <Card className="border-border shadow-sm overflow-hidden bg-card">
                <div className="grid grid-cols-2 lg:grid-cols-4">
                    <div className="p-4 border-b lg:border-b-0 lg:border-r border-border/60">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Technicians</p>
                        <p className="text-2xl font-semibold text-foreground mt-1">{totalTechCount}</p>
                    </div>
                    <div className="p-4 border-b lg:border-b-0 lg:border-r border-border/60">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Active</p>
                        <p className="text-2xl font-semibold text-blue-700 mt-1">{activeTechCount}</p>
                    </div>
                    <div className="p-4 lg:border-r border-border/60">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Inactive</p>
                        <p className="text-2xl font-semibold text-muted-foreground mt-1">{inactiveTechCount}</p>
                    </div>
                    <div className="p-4">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Assigned Jobs</p>
                        <p className="text-2xl font-semibold text-amber-700 mt-1">{assignedJobsCount}</p>
                        <p className="text-xs text-muted-foreground mt-1">{busyTechniciansCount} technicians currently assigned</p>
                    </div>
                </div>
            </Card>

            {/* 2. Filter Bar */}
            <Card className="p-4 border-border shadow-sm space-y-4 bg-card">
                <div className="flex flex-col lg:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full lg:w-auto min-w-0 lg:min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search technician, code, phone, zone, or skill..."
                            className="pl-9 bg-muted/30 border-border focus:bg-background transition-all"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="w-full sm:w-[140px]">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={filterZone} onValueChange={setFilterZone}>
                            <SelectTrigger className="w-full sm:w-[160px] border-dashed text-muted-foreground bg-background">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4" />
                                    <SelectValue placeholder="Zone" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Zone</SelectItem>
                                {zoneFilterOptions.map((zone) => (
                                    <SelectItem key={zone} value={zone}>
                                        {zone}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterSkill} onValueChange={setFilterSkill}>
                            <SelectTrigger className="w-full sm:w-[170px] border-dashed text-muted-foreground bg-background">
                                <div className="flex items-center gap-2">
                                    <Briefcase className="w-4 h-4" />
                                    <SelectValue placeholder="Skills" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Skills</SelectItem>
                                {skillFilterOptions.map((skill) => (
                                    <SelectItem key={skill} value={skill}>
                                        {skill}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="h-6 w-px bg-border mx-2" />

                        <Badge variant="secondary" className="cursor-pointer bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200">
                            Active ({activeTechCount})
                        </Badge>
                        <Badge variant="secondary" className="cursor-pointer bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200">
                            Assigned Jobs ({assignedJobsCount})
                        </Badge>
                        <Badge variant="outline" className="bg-card border-border text-muted-foreground">
                            Showing {filteredTechs.length} of {totalTechCount}
                        </Badge>
                        {hasActiveFilters ? (
                            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-muted-foreground">
                                Clear Filters
                            </Button>
                        ) : null}
                    </div>
                </div>
            </Card>

            {/* 3. Technicians Table */}
            <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
                {loading ? (
                    <div className="p-4 space-y-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                        ))}
                    </div>
                ) : filteredTechs.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                            <User className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">No technicians found</h3>
                        <p className="text-sm mt-1">Try adjusting your filters or search query.</p>
                        <Button variant="outline" className="mt-4" onClick={clearFilters}>Clear Filters</Button>
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="bg-gray-50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="pl-6 w-[200px]">Technician</TableHead>
                                <TableHead className="w-[120px]">Code</TableHead>
                                <TableHead className="w-[140px]">Phone</TableHead>
                                <TableHead className="w-[100px]">Status</TableHead>
                                <TableHead className="w-[120px]">Active Jobs</TableHead>
                                <TableHead className="w-[200px]">Zones</TableHead>
                                <TableHead className="w-[200px]">Skills</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTechs.map((tech) => (
                                <TableRow
                                    key={tech.id}
                                    className="group hover:bg-gray-50 cursor-pointer transition-colors"
                                    onClick={() => handleOpenProfile(tech)}
                                >
                                    <TableCell className="pl-6">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-medium text-gray-900 group-hover:text-[#2F8E92]">{tech.name}</span>
                                            {tech.has_pending_email_change_request ? (
                                                <Badge
                                                    variant="outline"
                                                    className="w-fit text-[10px] h-5 px-1.5 bg-amber-50 text-amber-700 border-amber-200"
                                                >
                                                    Pending Email Change
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-gray-500">{tech.tech_code}</TableCell>
                                    <TableCell className="text-gray-500 text-sm">{formatPhoneForDisplay(tech.phone)}</TableCell>
                                    <TableCell>
                                        <StatusBadge status={tech.status} />
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "shadow-none min-w-8 justify-center",
                                                tech.current_jobs_count > 0
                                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                    : 'bg-gray-50 text-gray-500 border-gray-200',
                                            )}
                                        >
                                            {tech.current_jobs_count}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {tech.zones.slice(0, 2).map(z => (
                                                <Badge key={z} variant="secondary" className="text-[10px] h-5 px-1.5 bg-gray-100 text-gray-600 border-gray-200">{z}</Badge>
                                            ))}
                                            {tech.zones.length > 2 && <span className="text-[10px] text-gray-400">+{tech.zones.length - 2}</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {tech.skills.slice(0, 2).map(s => (
                                                <Badge key={s} variant="secondary" className="text-[10px] h-5 px-1.5 bg-gray-100 text-gray-600 border-gray-200">{s}</Badge>
                                            ))}
                                            {tech.skills.length > 2 && <span className="text-[10px] text-gray-400">+{tech.skills.length - 2}</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreVertical className="w-4 h-4 text-gray-400" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleOpenProfile(tech)}>View Profile</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openEditTechModal(tech)}>Edit Technician</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className={tech.status === 'active' ? 'text-red-600' : 'text-blue-700'}
                                                        onClick={() => {
                                                            if (tech.status === 'active') {
                                                                if (tech.current_jobs_count > 0) {
                                                                    alert('Cannot deactivate technician with active assigned jobs.');
                                                                    return;
                                                                }
                                                                setSelectedTech(tech);
                                                                setTechDraft(cloneTech(tech));
                                                                setConfirmDeactivateOpen(true);
                                                                return;
                                                            }

                                                            const updated = { ...tech, status: 'active' as const };
                                                            setTechs((prev) => {
                                                                const next = prev.map((t) => (t.id === updated.id ? updated : t));
                                                                persistTechniciansToStorage(next);
                                                                return next;
                                                            });
                                                            if (selectedTech?.id === updated.id) {
                                                                setSelectedTech(updated);
                                                                setTechDraft(cloneTech(updated));
                                                            }
                                                            appendAuditLog(
                                                                'technician.status_changed',
                                                                `Technician ${updated.name} activated`,
                                                                { tech_id: updated.id, tech_code: updated.tech_code, new_status: 'active' }
                                                            );
                                                        }}
                                                    >
                                                        {tech.status === 'active' ? 'Deactivate' : 'Activate'}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* 5. Technician Profile Drawer */}
            <Sheet open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
                <SheetContent className="w-full sm:max-w-2xl lg:max-w-3xl p-0 flex flex-col gap-0 bg-gray-50/50">
                    {selectedTech && techDraft && (
                        <>
                            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                                <div className="px-6 pt-5 pb-4 pr-14">
                                    <div className="flex flex-col gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-2">
                                                <h2 className="text-xl font-bold text-gray-900">{selectedTech.name}</h2>
                                                <StatusBadge status={selectedTech.status} />
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                                <span className="font-mono">{selectedTech.tech_code}</span>
                                                <span>|</span>
                                                <span>{formatPhoneForDisplay(selectedTech.phone)}</span>
                                            </div>
                                            {selectedTech.has_pending_email_change_request ? (
                                                <div className="pt-0.5">
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] h-5 px-2 bg-amber-50 text-amber-700 border-amber-200"
                                                    >
                                                        Pending Email Change: {selectedTech.pending_email_change_requested_email || 'Review required'}
                                                    </Badge>
                                                </div>
                                            ) : null}
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openEditTechModal(selectedTech)}
                                                disabled={hasDrawerChanges}
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={!hasDrawerChanges}
                                                onClick={handleCancelDrawerChanges}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                size="sm"
                                                disabled={!hasDrawerChanges}
                                                className="bg-[#2F8E92] hover:bg-[#267276]"
                                                onClick={handleSaveDrawerChanges}
                                            >
                                                Save Changes
                                            </Button>
                                            <Button
                                                variant={selectedTech.status === 'active' ? 'outline' : 'default'}
                                                size="sm"
                                                className={cn(
                                                    selectedTech.status === 'active'
                                                        ? 'border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700'
                                                        : 'bg-[#2F8E92] hover:bg-[#267276]'
                                                )}
                                                onClick={handleToggleStatus}
                                            >
                                                {selectedTech.status === 'active' ? 'Deactivate' : 'Activate'}
                                            </Button>
                                        </div>

                                        {profileSummary ? (
                                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                                                <ProfileStat
                                                    label="Active Jobs"
                                                    value={String(profileSummary.activeJobs)}
                                                    valueClassName={profileSummary.activeJobs > 0 ? 'text-amber-700' : 'text-gray-700'}
                                                />
                                                <ProfileStat label="Zones" value={String(profileSummary.zonesCount)} />
                                                <ProfileStat label="Skills" value={String(profileSummary.skillsCount)} />
                                                <ProfileStat label="Open Days" value={String(profileSummary.openDaysCount)} hint="Per week" />
                                                <ProfileStat label="Time Off" value={String(profileSummary.timeOffCount)} hint="Upcoming entries" />
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto">
                                <div className="p-6 space-y-6">

                                    {/* B) Skills & Zones */}
                                    <Card className="p-4 border-gray-200 shadow-sm">
                                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                            <Briefcase className="w-4 h-4" /> Skills & Zones
                                        </h3>
                                        <div className="space-y-4">
                                            <div>
                                                <Label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Assigned Zones</Label>
                                                <div className="flex flex-wrap gap-2">
                                                    {techDraft.zones.map(z => (
                                                        <Badge key={z} variant="secondary" className="bg-gray-100 text-gray-700 hover:bg-gray-200 pr-1">
                                                            <span>{z}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveZone(z)}
                                                                aria-label={`Remove zone ${z}`}
                                                                className="ml-1 rounded-full p-0.5 hover:bg-gray-200 text-gray-500 hover:text-gray-700"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </Badge>
                                                    ))}
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <Input
                                                        value={newZoneInput}
                                                        onChange={(e) => setNewZoneInput(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                handleAddZone();
                                                            }
                                                        }}
                                                        placeholder="Add zone (e.g. Quebec)"
                                                        className="h-8 text-xs"
                                                    />
                                                    <Button variant="outline" size="sm" className="h-8 text-xs border-dashed text-gray-600 sm:w-auto" onClick={handleAddZone}>
                                                        + Add Zone
                                                    </Button>
                                                </div>
                                            </div>
                                            <Separator />
                                            <div>
                                                <Label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Technical Skills</Label>
                                                <div className="flex flex-wrap gap-2">
                                                    {techDraft.skills.map(s => (
                                                        <Badge key={s} variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100 pr-1">
                                                            <span>{s}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveSkill(s)}
                                                                aria-label={`Remove skill ${s}`}
                                                                className="ml-1 rounded-full p-0.5 hover:bg-blue-100 text-blue-500 hover:text-blue-700"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </Badge>
                                                    ))}
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <Input
                                                        value={newSkillInput}
                                                        onChange={(e) => setNewSkillInput(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                handleAddSkill();
                                                            }
                                                        }}
                                                        placeholder="Add skill (e.g. Towing)"
                                                        className="h-8 text-xs"
                                                    />
                                                    <Button variant="outline" size="sm" className="h-8 text-xs border-dashed text-gray-600 sm:w-auto" onClick={handleAddSkill}>
                                                        + Add Skill
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>

                                    {/* D) Working Hours */}
                                    <Card className="p-4 border-gray-200 shadow-sm">
                                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                            <Clock className="w-4 h-4" /> Weekly Schedule
                                        </h3>
                                        <div className="space-y-2">
                                            {techDraft.working_hours.map((wh, idx) => (
                                                <div key={idx} className="flex items-center justify-between text-sm py-1.5 gap-3">
                                                    <span className={cn("w-10 font-medium", wh.is_closed ? "text-gray-400" : "text-gray-700")}>{wh.day}</span>
                                                    <div className="flex items-center gap-2 flex-1 justify-end">
                                                        <Switch
                                                            checked={!wh.is_closed}
                                                            onCheckedChange={(checked) => handleToggleWorkingDay(idx, checked)}
                                                        />
                                                        {!wh.is_closed ? (
                                                            <>
                                                                <Input
                                                                    type="time"
                                                                    value={wh.start}
                                                                    onChange={(e) => handleWorkingHoursTimeChange(idx, 'start', e.target.value)}
                                                                    className="h-7 w-[96px] text-xs font-mono"
                                                                />
                                                                <span className="text-gray-300">-</span>
                                                                <Input
                                                                    type="time"
                                                                    value={wh.end}
                                                                    onChange={(e) => handleWorkingHoursTimeChange(idx, 'end', e.target.value)}
                                                                    className="h-7 w-[96px] text-xs font-mono"
                                                                />
                                                            </>
                                                        ) : (
                                                            <span className="text-gray-400 italic text-xs w-[120px] text-right">Closed</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-3">
                                            Overnight shifts are supported by setting end time earlier than start time.
                                        </p>
                                    </Card>

                                    {/* E) Time Off */}
                                    <Card className="p-4 border-gray-200 shadow-sm">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                                <Calendar className="w-4 h-4" /> Time Off
                                            </h3>
                                            <Button variant="outline" size="sm" className="h-7" onClick={() => setTimeOffModalOpen(true)}>+ Add Time Off</Button>
                                        </div>
                                        {techDraft.time_off.length === 0 ? (
                                            <div className="text-center py-6 text-gray-400 text-sm italic bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                                No upcoming time off scheduled.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {techDraft.time_off.map(to => (
                                                    <div key={to.id} className="flex flex-col text-sm bg-yellow-50/50 p-3 rounded-md border border-yellow-100">
                                                        <div className="flex justify-between font-medium text-yellow-900">
                                                            <span>{to.reason}</span>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-5 w-5 p-0 hover:bg-yellow-100 text-yellow-700"
                                                                onClick={() => handleRemoveTimeOff(to.id)}
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </Button>
                                                        </div>
                                                        <div className="text-xs text-yellow-700 mt-1">
                                                            {formatDateForUi(to.start)} - {formatDateForUi(to.end)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </Card>

                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            {/* 6. Edit Technician Modal */}
            <Dialog open={editTechModalOpen} onOpenChange={setEditTechModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Technician</DialogTitle>
                        <DialogDescription>Update technician profile details.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Full Name</Label>
                                <Input value={editTechForm.name} onChange={e => setEditTechForm({ ...editTechForm, name: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Tech Code</Label>
                                <Input value={editTechForm.code} onChange={e => setEditTechForm({ ...editTechForm, code: e.target.value })} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Phone</Label>
                            <Input
                                placeholder={phoneExampleFormat}
                                value={editTechForm.phone}
                                onChange={e => setEditTechForm({ ...editTechForm, phone: formatUsPhoneInput(e.target.value) })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Zones (comma separated)</Label>
                            <Input value={editTechForm.zones} onChange={e => setEditTechForm({ ...editTechForm, zones: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Skills (comma separated)</Label>
                            <Input value={editTechForm.skills} onChange={e => setEditTechForm({ ...editTechForm, skills: e.target.value })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditTechModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveTechEdit} className="bg-[#2F8E92] hover:bg-[#267276]">Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 7. Set Time Off Modal */}
            <Dialog open={timeOffModalOpen} onOpenChange={setTimeOffModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Schedule Time Off</DialogTitle>
                        <DialogDescription>
                            Add a time off entry for {selectedTech?.name} so dispatch planning stays accurate.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <Input type="date" value={timeOffForm.start} onChange={e => setTimeOffForm({ ...timeOffForm, start: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>End Date</Label>
                                <Input type="date" value={timeOffForm.end} onChange={e => setTimeOffForm({ ...timeOffForm, end: e.target.value })} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Reason</Label>
                            <Input placeholder="e.g. Vacation, Sick Leave" value={timeOffForm.reason} onChange={e => setTimeOffForm({ ...timeOffForm, reason: e.target.value })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTimeOffModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveTimeOff} className="bg-[#2F8E92] hover:bg-[#267276]">Save Time Off</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ColumnExportDialog
                open={exportModalOpen}
                onOpenChange={setExportModalOpen}
                title="Export Technicians"
                description="Select the technician columns you want in your CSV."
                availableColumns={TECHNICIAN_EXPORT_COLUMNS}
                onConfirm={handleExport}
            />

            {/* 8. Deactivate Confirmation Modal */}
            <Dialog open={confirmDeactivateOpen} onOpenChange={setConfirmDeactivateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <Shield className="w-5 h-5" /> Deactivate Technician?
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to deactivate <strong>{selectedTech?.name}</strong>?
                            They will no longer be eligible for dispatch assignments.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDeactivateOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={confirmDeactivate}>Yes, Deactivate</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}



