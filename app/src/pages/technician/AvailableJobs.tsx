import { useState, useEffect, useMemo } from 'react';
import {
    RefreshCw,
    MapPin,
    Clock,
    Briefcase,
    Calendar,
    User,
    AlertCircle,
    ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
    fetchAdminTechnicianJobsFeed,
    fetchTechnicianJobsFeed,
    getStoredAdminToken,
    getStoredTechnicianToken,
    type BackendTechnicianJobFeedItem,
} from '@/lib/backend-api';
import { DISPATCH_JOB_STATUS, normalizeDispatchJobStatus } from '@/lib/job-status';

// --- Types ---

type Urgency = 'low' | 'normal' | 'high' | 'critical';

interface AvailableJob {
    job_id: string;
    job_code: string;
    dealership_name: string;
    service_name: string;
    urgency: Urgency;
    zone: string;
    created_at: string;
    note_preview?: string;
    status: 'pending' | 'scheduled' | 'in_progress' | 'delayed' | 'unknown';
}

const mapBackendPortalJobsItem = (item: BackendTechnicianJobFeedItem): AvailableJob => {
    const normalizedStatus = normalizeDispatchJobStatus(item.status);
    const status: AvailableJob['status'] =
        normalizedStatus === DISPATCH_JOB_STATUS.PENDING ? 'pending'
            : normalizedStatus === DISPATCH_JOB_STATUS.SCHEDULED ? 'scheduled'
                : normalizedStatus === DISPATCH_JOB_STATUS.IN_PROGRESS ? 'in_progress'
                    : normalizedStatus === DISPATCH_JOB_STATUS.DELAYED ? 'delayed'
                        : 'unknown';

    return {
        job_id: item.id,
        job_code: item.job_code,
        dealership_name: item.dealership_name || 'Unknown Customer',
        service_name: item.service_name || 'Service Request',
        urgency: 'normal',
        zone: item.zone_name || 'Unspecified',
        created_at: item.updated_at || item.created_at,
        status,
    };
};

// --- Components ---

function UrgencyBadge({ urgency }: { urgency: Urgency }) {
    const styles: Record<Urgency, string> = {
        critical: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
        high: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
        normal: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
        low: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600',
    };

    const labels: Record<Urgency, string> = {
        critical: 'Critical',
        high: 'High',
        normal: 'Normal',
        low: 'Low',
    };

    return (
        <Badge
            variant="outline"
            className={cn(
                'font-semibold text-xs px-2.5 py-0.5 border',
                styles[urgency],
                urgency === 'critical' && 'animate-pulse'
            )}
        >
            {labels[urgency]}
        </Badge>
    );
}

function TimeAgo({ timestamp }: { timestamp: string }) {
    const getTimeAgo = (isoString: string): string => {
        const now = new Date();
        const past = new Date(isoString);
        const diffMs = now.getTime() - past.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    };

    return (
        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {getTimeAgo(timestamp)}
        </span>
    );
}

function JobCard({
    job,
    onOpenCurrentJob,
}: {
    job: AvailableJob;
    onOpenCurrentJob: () => void;
}) {
    const statusStyles: Record<AvailableJob['status'], string> = {
        pending: 'bg-amber-100 text-amber-700 border-amber-300',
        scheduled: 'bg-blue-100 text-blue-700 border-blue-300',
        in_progress: 'bg-emerald-100 text-emerald-700 border-emerald-300',
        delayed: 'bg-orange-100 text-orange-700 border-orange-300',
        unknown: 'bg-gray-100 text-gray-700 border-gray-300',
    };
    const statusLabels: Record<AvailableJob['status'], string> = {
        pending: 'Pending',
        scheduled: 'Scheduled',
        in_progress: 'In Progress',
        delayed: 'Delayed',
        unknown: 'Unknown',
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {/* Card Header */}
            <div className="p-5 pb-4 space-y-3">
                {/* Job Code & Time */}
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                            {job.job_code}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mt-0.5">
                            {job.service_name}
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <Badge variant="outline" className={cn('text-xs font-semibold border', statusStyles[job.status])}>
                            {statusLabels[job.status]}
                        </Badge>
                        <UrgencyBadge urgency={job.urgency} />
                    </div>
                </div>

                {/* Dealership */}
                <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {job.dealership_name}
                    </span>
                </div>

                {/* Zone & Time */}
                <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <MapPin className="w-4 h-4 text-[#2F8E92] dark:text-teal-400" />
                        <span className="font-medium">{job.zone}</span>
                    </div>
                    <TimeAgo timestamp={job.created_at} />
                </div>

                {/* Note Preview (if exists) */}
                {job.note_preview && (
                    <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                            <span className="inline-flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500 flex-shrink-0" />
                                <span className="font-medium">Note:</span>
                            </span>{' '}
                            {job.note_preview}
                        </p>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="px-5 pb-5">
                <div className="grid grid-cols-1 gap-3">
                    <Button
                        onClick={onOpenCurrentJob}
                        className={cn(
                            "h-12 text-base font-semibold rounded-xl transition-all duration-200",
                            "bg-[#2F8E92] hover:bg-[#267276] text-white",
                            "shadow-sm hover:shadow-md active:scale-[0.98]"
                        )}
                    >
                        <ArrowRight className="w-5 h-5 mr-2" />
                        Open Current Job
                    </Button>
                </div>
            </div>
        </div>
    );
}

function BottomNav({
    activeTab,
    routeBase,
}: {
    activeTab: 'jobs' | 'current-job' | 'history' | 'profile';
    routeBase: string;
}) {
    const navigate = useNavigate();

    const tabs = [
        { id: 'jobs', label: 'Jobs', icon: Briefcase, path: `${routeBase}/jobs` },
        { id: 'current-job', label: 'Current Job', icon: Calendar, path: `${routeBase}/current-job` },
        { id: 'history', label: 'History', icon: Clock, path: `${routeBase}/history` },
        { id: 'profile', label: 'Profile', icon: User, path: `${routeBase}/profile` },
    ] as const;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-2xl z-50 safe-area-bottom">
            <div className="max-w-2xl mx-auto px-2 py-2">
                <div className="flex items-center justify-around gap-1">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => navigate(tab.path)}
                                className={cn(
                                    "flex flex-col items-center justify-center gap-1 px-4 py-2.5 rounded-xl transition-all duration-200 flex-1",
                                    isActive
                                        ? "bg-[#2F8E92]/10 dark:bg-[#2F8E92]/20 text-[#2F8E92] dark:text-teal-400"
                                        : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                )}
                            >
                                <Icon className={cn("w-5 h-5", isActive && "scale-110")} />
                                <span className={cn("text-xs font-semibold", isActive && "font-bold")}>
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// --- Main Component ---

export default function AvailableJobsPage() {
    const [jobs, setJobs] = useState<AvailableJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const { techId: previewTechId } = useParams();
    const { user, technicianAccounts } = useAuth();
    const navigate = useNavigate();
    const technicianDirectory = useMemo(
        () => technicianAccounts.map((tech) => ({
            id: tech.id,
            name: tech.name,
            techCode: tech.id.slice(0, 8).toUpperCase(),
            status: tech.isActive ? 'active' : 'inactive',
        })),
        [technicianAccounts],
    );

    const currentTech = useMemo(() => {
        if (previewTechId) {
            const previewTech = technicianDirectory.find((tech) => tech.id === previewTechId);
            if (previewTech) return previewTech;
            return { id: previewTechId, name: 'Preview Technician', techCode: 'TECH-001', status: 'active' };
        }

        if (user?.role === 'technician') {
            return {
                id: user.id,
                name: user.name,
                techCode: user.id.slice(0, 8).toUpperCase(),
                status: 'active',
            };
        }

        return technicianDirectory[0] ?? { id: 'tech-001', name: 'Technician', techCode: 'TECH-001', status: 'active' };
    }, [previewTechId, technicianDirectory, user]);

    const currentTechId = currentTech.id;
    const currentTechCode = currentTech.techCode ?? currentTech.id;
    const isPreviewMode = Boolean(previewTechId);
    const routeBase = isPreviewMode ? `/admin/tech-preview/${currentTechId}` : '/tech';
    const currentJobPath = `${routeBase}/current-job`;

    const fetchJobs = async () => {
        setLoading(true);
        if (isPreviewMode) {
            const adminToken = getStoredAdminToken();
            if (!adminToken) {
                setJobs([]);
                setLastUpdated(new Date());
                setLoading(false);
                return;
            }
            try {
                const feed = await fetchAdminTechnicianJobsFeed(adminToken, currentTechId);
                const mergedJobs = [...feed.available_jobs, ...feed.my_jobs]
                    .map(mapBackendPortalJobsItem)
                    .filter((job) => job.status !== 'unknown');
                setJobs(mergedJobs);
            } catch {
                setJobs([]);
            }
            setLastUpdated(new Date());
            setLoading(false);
            return;
        }

        const token = getStoredTechnicianToken();
        if (!token || user?.role !== 'technician') {
            setJobs([]);
            setLastUpdated(new Date());
            setLoading(false);
            return;
        }
        try {
            const feed = await fetchTechnicianJobsFeed(token);
            const mergedJobs = [...feed.available_jobs, ...feed.my_jobs]
                .map(mapBackendPortalJobsItem)
                .filter((job) => job.status !== 'unknown');
            setJobs(mergedJobs);
        } catch {
            setJobs([]);
        }
        setLastUpdated(new Date());
        setLoading(false);
    };

    useEffect(() => {
        void fetchJobs();
    }, [currentTechId, isPreviewMode, user?.id, user?.role]);

    useEffect(() => {
        if (isPreviewMode) return;
        const intervalId = setInterval(() => {
            void fetchJobs();
        }, 10000);
        const onFocus = () => { void fetchJobs(); };
        window.addEventListener('focus', onFocus);
        return () => {
            clearInterval(intervalId);
            window.removeEventListener('focus', onFocus);
        };
    }, [isPreviewMode, currentTechId, user?.id, user?.role]);

    const handleOpenCurrentJob = () => {
        navigate(currentJobPath);
    };

    const handleRefresh = () => {
        fetchJobs();
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
            {/* Top Navigation Bar */}
            <div className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
                <div className="max-w-2xl mx-auto px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                            Jobs
                        </h1>
                        {lastUpdated && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Updated {lastUpdated.toLocaleTimeString()}
                            </p>
                        )}
                        <p className="text-xs text-[#2F8E92] dark:text-teal-400 mt-0.5 font-medium">
                            Viewing as {currentTech.name} ({currentTechCode})
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        className="h-9 gap-2 border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
                        disabled={loading}
                    >
                        <RefreshCw className={cn("w-4 h-4 text-gray-600 dark:text-gray-400", loading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Job List */}
            <div className="max-w-2xl mx-auto px-4 py-5">
                {loading ? (
                    // Loading State
                    <div className="space-y-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div
                                key={i}
                                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 animate-pulse"
                            >
                                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3"></div>
                                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4"></div>
                                <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            </div>
                        ))}
                    </div>
                ) : jobs.length === 0 ? (
                    // Empty State
                    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-5">
                            <Briefcase className="w-10 h-10 text-gray-400 dark:text-gray-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                            No Jobs Sent Yet
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed">
                            Admin-confirmed jobs assigned to this technician will appear here.
                        </p>
                    </div>
                ) : (
                    // Job Cards
                    <div className="space-y-4">
                        {jobs.map((job) => (
                            <JobCard
                                key={job.job_id}
                                job={job}
                                onOpenCurrentJob={handleOpenCurrentJob}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Navigation */}
            <BottomNav activeTab="jobs" routeBase={routeBase} />
        </div>
    );
}

