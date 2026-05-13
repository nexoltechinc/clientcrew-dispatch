import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    AlertCircle,
    Briefcase,
    Building2,
    Calendar,
    CalendarDays,
    CheckCircle2,
    ChevronRight,
    Clock,
    Loader2,
    MapPin,
    RefreshCw,
    User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOCK_DEALERSHIPS } from '../admin/Dealerships';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    completeTechnicianMyJob,
    fetchAdminTechnicianJobsFeed,
    fetchTechnicianJobsFeed,
    getStoredAdminToken,
    getStoredTechnicianToken,
    type BackendTechnicianJobFeedItem,
} from '@/lib/backend-api';
import { DISPATCH_JOB_STATUS, normalizeDispatchJobStatus } from '@/lib/job-status';

interface ScheduledJob {
    job_id: string;
    job_code: string;
    dealership_name: string;
    service_name: string;
    status: 'scheduled' | 'in_progress' | 'delayed' | 'completed' | 'unknown';
    urgency: 'critical' | 'high' | 'normal' | 'low' | null;
    scheduled_start_dt: string | null;
    scheduled_end_dt: string | null;
    zone: string | null;
}

const mapBackendFeedItemToScheduledJob = (item: BackendTechnicianJobFeedItem): ScheduledJob | null => {
    const status = normalizeDispatchJobStatus(item.status);
    if (
        status === DISPATCH_JOB_STATUS.CANCELLED
        || status === DISPATCH_JOB_STATUS.ADMIN_PREVIEW
        || status === DISPATCH_JOB_STATUS.PENDING_ADMIN_CONFIRMATION
        || status === DISPATCH_JOB_STATUS.PENDING_REVIEW
        || status === DISPATCH_JOB_STATUS.READY_FOR_TECH
    ) {
        return null;
    }

    const mappedStatus: ScheduledJob['status'] =
        status === DISPATCH_JOB_STATUS.SCHEDULED ? 'scheduled'
            : status === DISPATCH_JOB_STATUS.IN_PROGRESS ? 'in_progress'
                : status === DISPATCH_JOB_STATUS.DELAYED ? 'delayed'
                    : status === DISPATCH_JOB_STATUS.COMPLETED ? 'completed'
                        : 'unknown';

    const scheduledStart = item.requested_service_date
        ? `${item.requested_service_date}T${(item.requested_service_time || '09:00:00').slice(0, 8)}`
        : null;

    return {
        job_id: item.id,
        job_code: item.job_code,
        dealership_name: item.dealership_name || 'Unknown Customer',
        service_name: item.service_name || 'Service Request',
        status: mappedStatus,
        urgency: 'normal',
        scheduled_start_dt: scheduledStart,
        scheduled_end_dt: null,
        zone: item.zone_name || null,
    };
};

interface DateGroup {
    date: string;
    label: string;
    jobs: ScheduledJob[];
}

const generateMockSchedule = (services: string[]): ScheduledJob[] => {
    const today = new Date();
    const jobs: ScheduledJob[] = [];
    const dealers = MOCK_DEALERSHIPS.map((d) => d.name);
    const zones = ['Quebec', 'Levis', 'Donnacona', 'St-Raymond'];

    const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

    const todayDate = new Date(today);
    jobs.push(
        {
            job_id: 'job-sch-1',
            job_code: 'DIQ-2024-1105',
            dealership_name: getRandom(dealers) || 'Northwind Auto',
            service_name: getRandom(services) || 'Bande pare-brise teintee',
            status: 'scheduled',
            urgency: 'high',
            scheduled_start_dt: new Date(todayDate.setHours(9, 30, 0)).toISOString(),
            scheduled_end_dt: new Date(todayDate.setHours(10, 15, 0)).toISOString(),
            zone: getRandom(zones),
        },
        {
            job_id: 'job-sch-2',
            job_code: 'DIQ-2024-1106',
            dealership_name: getRandom(dealers) || 'Lakeside Toyota',
            service_name: getRandom(services) || 'Demarreur 2-Way - Audi',
            status: 'scheduled',
            urgency: 'normal',
            scheduled_start_dt: new Date(todayDate.setHours(11, 0, 0)).toISOString(),
            scheduled_end_dt: new Date(todayDate.setHours(12, 0, 0)).toISOString(),
            zone: getRandom(zones),
        },
        {
            job_id: 'job-sch-3',
            job_code: 'DIQ-2024-1107',
            dealership_name: getRandom(dealers) || 'Pioneer Honda',
            service_name: getRandom(services) || 'Main-d-oeuvre - regulier',
            status: 'in_progress',
            urgency: 'critical',
            scheduled_start_dt: new Date(todayDate.setHours(14, 30, 0)).toISOString(),
            scheduled_end_dt: new Date(todayDate.setHours(15, 0, 0)).toISOString(),
            zone: getRandom(zones),
        },
    );

    const tomorrowDate = new Date(today);
    tomorrowDate.setDate(today.getDate() + 1);
    jobs.push(
        {
            job_id: 'job-sch-4',
            job_code: 'DIQ-2024-1108',
            dealership_name: getRandom(dealers) || 'Metro Auto Center',
            service_name: getRandom(services) || 'PPF capot 12" + ailes',
            status: 'scheduled',
            urgency: 'high',
            scheduled_start_dt: new Date(tomorrowDate.setHours(10, 0, 0)).toISOString(),
            scheduled_end_dt: new Date(tomorrowDate.setHours(11, 30, 0)).toISOString(),
            zone: getRandom(zones),
        },
        {
            job_id: 'job-sch-5',
            job_code: 'DIQ-2024-1109',
            dealership_name: getRandom(dealers) || 'Valley Motors',
            service_name: getRandom(services) || 'Teintage complet - standard',
            status: 'scheduled',
            urgency: null,
            scheduled_start_dt: new Date(tomorrowDate.setHours(13, 30, 0)).toISOString(),
            scheduled_end_dt: new Date(tomorrowDate.setHours(14, 0, 0)).toISOString(),
            zone: getRandom(zones),
        },
    );

    const dayAfterDate = new Date(today);
    dayAfterDate.setDate(today.getDate() + 2);
    jobs.push(
        {
            job_id: 'job-sch-6',
            job_code: 'DIQ-2024-1110',
            dealership_name: getRandom(dealers) || 'Northwind Auto',
            service_name: getRandom(services) || 'Bande pare-brise teintee',
            status: 'scheduled',
            urgency: 'normal',
            scheduled_start_dt: new Date(dayAfterDate.setHours(9, 0, 0)).toISOString(),
            scheduled_end_dt: new Date(dayAfterDate.setHours(9, 45, 0)).toISOString(),
            zone: getRandom(zones),
        },
        {
            job_id: 'job-sch-7',
            job_code: 'DIQ-2024-1111',
            dealership_name: getRandom(dealers) || 'Lakeside Toyota',
            service_name: getRandom(services) || 'Demarreur 2-Way - Audi',
            status: 'scheduled',
            urgency: null,
            scheduled_start_dt: new Date(dayAfterDate.setHours(15, 0, 0)).toISOString(),
            scheduled_end_dt: new Date(dayAfterDate.setHours(16, 0, 0)).toISOString(),
            zone: getRandom(zones),
        },
    );

    for (let i = 3; i < 7; i++) {
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + i);

        if (i % 2 === 0) {
            jobs.push({
                job_id: `job-sch-${10 + i}`,
                job_code: `DIQ-2024-11${10 + i}`,
                dealership_name: getRandom(dealers) || 'Pioneer Honda',
                service_name: getRandom(services) || 'Main-d-oeuvre - regulier',
                status: 'scheduled',
                urgency: 'normal',
                scheduled_start_dt: new Date(futureDate.setHours(11, 0, 0)).toISOString(),
                scheduled_end_dt: new Date(futureDate.setHours(12, 0, 0)).toISOString(),
                zone: getRandom(zones),
            });
        }
    }

    return jobs;
};

function StatusBadge({ status }: { status: ScheduledJob['status'] }) {
    const styles: Record<ScheduledJob['status'], string> = {
        scheduled: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
        in_progress: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700',
        delayed: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
        completed: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600',
        unknown: 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    };

    const labels: Record<ScheduledJob['status'], string> = {
        scheduled: 'Scheduled',
        in_progress: 'In Progress',
        delayed: 'Delayed',
        completed: 'Completed',
        unknown: 'Unknown',
    };

    return (
        <Badge variant="outline" className={cn('font-semibold text-xs px-2.5 py-0.5 border', styles[status])}>
            {labels[status]}
        </Badge>
    );
}

function UrgencyBadge({ urgency }: { urgency: ScheduledJob['urgency'] }) {
    if (!urgency) return null;

    const styles: Record<Exclude<ScheduledJob['urgency'], null>, string> = {
        critical: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
        high: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
        normal: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
        low: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600',
    };

    const labels: Record<Exclude<ScheduledJob['urgency'], null>, string> = {
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
                urgency === 'critical' && 'animate-pulse',
            )}
        >
            {labels[urgency]}
        </Badge>
    );
}

function ScheduleJobCard({
    job,
    onOpen,
    onComplete,
    completing,
}: {
    job: ScheduledJob;
    onOpen: (jobId: string) => void;
    onComplete: (jobId: string) => void;
    completing: boolean;
}) {
    const formatTime = (isoString: string | null) => {
        if (!isoString) return 'Time TBD';
        const date = new Date(isoString);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };

    const formatTimeRange = (start: string | null, end: string | null) => {
        if (!start) return 'Time TBD';
        const startTime = formatTime(start);
        const endTime = end ? formatTime(end) : null;
        return endTime ? `${startTime} - ${endTime}` : startTime;
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">{job.job_code}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mt-0.5">{job.service_name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <StatusBadge status={job.status} />
                        <UrgencyBadge urgency={job.urgency} />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    <span className="text-base font-semibold text-gray-900 dark:text-gray-100">{job.dealership_name}</span>
                </div>

                <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4 text-[#2F8E92] dark:text-teal-400" />
                        <span className="font-medium">{formatTimeRange(job.scheduled_start_dt, job.scheduled_end_dt)}</span>
                    </div>
                    {job.zone && (
                        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                            <MapPin className="w-4 h-4 text-[#2F8E92] dark:text-teal-400" />
                            <span className="font-medium">{job.zone}</span>
                        </div>
                    )}
                </div>

                <div className="pt-2">
                    {job.status === 'in_progress' ? (
                        <Button
                            onClick={() => onComplete(job.job_id)}
                            disabled={completing}
                            className={cn(
                                'w-full h-11 text-sm font-semibold rounded-xl',
                                'bg-emerald-600 hover:bg-emerald-700 text-white',
                            )}
                        >
                            {completing ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                            )}
                            DONE
                        </Button>
                    ) : (
                        <Button
                            onClick={() => onOpen(job.job_id)}
                            className={cn(
                                'w-full h-11 text-sm font-semibold rounded-xl',
                                'bg-[#2F8E92] hover:bg-[#267276] text-white',
                            )}
                        >
                            Open Job
                            <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

function BottomNav({
    activeTab,
    routeBase,
}: {
    activeTab: 'available' | 'my-jobs' | 'schedule' | 'profile';
    routeBase: string;
}) {
    const navigate = useNavigate();

    const tabs = [
        { id: 'available', label: 'Available', icon: Briefcase, path: `${routeBase}/available-jobs` },
        { id: 'my-jobs', label: 'My Jobs', icon: Calendar, path: `${routeBase}/my-jobs` },
        { id: 'schedule', label: 'Schedule', icon: Clock, path: `${routeBase}/schedule` },
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
                                    'flex flex-col items-center justify-center gap-1 px-4 py-2.5 rounded-xl transition-all duration-200 flex-1',
                                    isActive
                                        ? 'bg-[#2F8E92]/10 dark:bg-[#2F8E92]/20 text-[#2F8E92] dark:text-teal-400'
                                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
                                )}
                            >
                                <Icon className={cn('w-5 h-5', isActive && 'scale-110')} />
                                <span className={cn('text-xs font-semibold', isActive && 'font-bold')}>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function SchedulePage() {
    const { techId: previewTechId } = useParams();
    const routeBase = previewTechId ? `/admin/tech-preview/${previewTechId}` : '/tech';
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [jobs, setJobs] = useState<ScheduledJob[]>([]);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [completingJobId, setCompletingJobId] = useState<string | null>(null);

    useEffect(() => {
        fetchSchedule();
    }, [previewTechId]);

    const fetchSchedule = async () => {
        setLoading(true);
        setError(false);
        try {
            const technicianToken = getStoredTechnicianToken();
            const adminToken = getStoredAdminToken();
            if (previewTechId) {
                if (!adminToken) {
                    setJobs([]);
                } else {
                    const feed = await fetchAdminTechnicianJobsFeed(adminToken, previewTechId);
                    const mapped = feed.my_jobs
                        .map(mapBackendFeedItemToScheduledJob)
                        .filter((job): job is ScheduledJob => job !== null);
                    setJobs(mapped);
                }
            } else if (technicianToken) {
                const feed = await fetchTechnicianJobsFeed(technicianToken);
                const mapped = feed.my_jobs
                    .map(mapBackendFeedItemToScheduledJob)
                    .filter((job): job is ScheduledJob => job !== null);
                setJobs(mapped);
            } else {
                setJobs([]);
            }
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Failed to fetch schedule:', err);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const dateGroups = useMemo(() => {
        const groups: DateGroup[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const dateMap = new Map<string, ScheduledJob[]>();

        jobs.forEach((job) => {
            if (!job.scheduled_start_dt) return;

            const jobDate = new Date(job.scheduled_start_dt);
            jobDate.setHours(0, 0, 0, 0);
            const dateStr = jobDate.toISOString().split('T')[0];

            if (!dateMap.has(dateStr)) {
                dateMap.set(dateStr, []);
            }
            dateMap.get(dateStr)!.push(job);
        });

        const sortedDates = Array.from(dateMap.keys()).sort();
        sortedDates.forEach((dateStr) => {
            const jobDate = new Date(dateStr);
            jobDate.setHours(0, 0, 0, 0);

            let label: string;
            if (jobDate.getTime() === today.getTime()) {
                label = 'Today';
            } else if (jobDate.getTime() === tomorrow.getTime()) {
                label = 'Tomorrow';
            } else {
                label = jobDate.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                });
            }

            const dayJobs = dateMap.get(dateStr)!;
            dayJobs.sort((a, b) => {
                const timeA = a.scheduled_start_dt ? new Date(a.scheduled_start_dt).getTime() : 0;
                const timeB = b.scheduled_start_dt ? new Date(b.scheduled_start_dt).getTime() : 0;
                return timeA - timeB;
            });

            groups.push({ date: dateStr, label, jobs: dayJobs });
        });

        return groups;
    }, [jobs]);

    const handleJobOpen = () => {
        navigate(`${routeBase}/my-jobs`);
    };

    const handleComplete = async (jobId: string) => {
        if (previewTechId) {
            setJobs((prev) => prev.map((job) => (job.job_id === jobId ? { ...job, status: 'completed' } : job)));
            return;
        }

        const token = getStoredTechnicianToken();
        if (!token) return;

        setCompletingJobId(jobId);
        try {
            await completeTechnicianMyJob(token, jobId);
            await fetchSchedule();
        } catch {
            // keep current UI as-is on failure
        } finally {
            setCompletingJobId(null);
        }
    };

    const activeJobsCount = jobs.filter((job) => ['scheduled', 'in_progress', 'delayed', 'unknown'].includes(job.status)).length;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
            <div className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
                <div className="max-w-2xl mx-auto px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Schedule</h1>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {activeJobsCount} upcoming jobs
                                {lastUpdated
                                    ? ` • updated ${lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                                    : ''}
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={fetchSchedule}
                            className="rounded-xl shrink-0"
                            aria-label="Refresh schedule"
                        >
                            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                        </Button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="max-w-2xl mx-auto px-4 pt-4">
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                <span className="text-sm font-medium text-red-800 dark:text-red-300">
                                    Could not load schedule.
                                </span>
                            </div>
                            <button
                                onClick={fetchSchedule}
                                className="text-sm font-semibold text-red-700 dark:text-red-400 hover:underline"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">
                {loading ? (
                    <div className="space-y-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div
                                key={i}
                                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 animate-pulse"
                            >
                                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3"></div>
                                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4"></div>
                                <div className="h-11 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            </div>
                        ))}
                    </div>
                ) : dateGroups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-5">
                            <CalendarDays className="w-10 h-10 text-gray-400 dark:text-gray-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Scheduled Jobs</h3>
                        <p className="text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed">
                            New assignments will appear here once they are scheduled.
                        </p>
                    </div>
                ) : (
                    <>
                        {dateGroups.map((group) => (
                            <div key={group.date} className="space-y-3">
                                <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1">
                                    {group.label}
                                </h2>
                                <div className="space-y-3">
                                    {group.jobs.map((job) => (
                                        <ScheduleJobCard
                                            key={job.job_id}
                                            job={job}
                                            onOpen={handleJobOpen}
                                            onComplete={handleComplete}
                                            completing={completingJobId === job.job_id}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>

            <BottomNav activeTab="schedule" routeBase={routeBase} />
        </div>
    );
}

