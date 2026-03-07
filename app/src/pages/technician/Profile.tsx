import { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    Briefcase,
    Calendar,
    ChevronRight,
    Clock,
    KeyRound,
    LogOut,
    Plus,
    RefreshCw,
    Save,
    Settings,
    Trash2,
    User,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import {
    fetchAdminTechnicians,
    fetchTechnicianMeProfile,
    getStoredAdminToken,
    getStoredTechnicianToken,
    updateTechnicianMeAvailability,
    updateTechnicianMePassword,
    updateTechnicianMeProfile,
    type BackendTechnicianProfile,
} from '@/lib/backend-api';

const DAY_OPTIONS = [
    { label: 'Mon', value: 0 },
    { label: 'Tue', value: 1 },
    { label: 'Wed', value: 2 },
    { label: 'Thu', value: 3 },
    { label: 'Fri', value: 4 },
    { label: 'Sat', value: 5 },
    { label: 'Sun', value: 6 },
] as const;

type OutOfOfficeRangeDraft = {
    start_date: string;
    end_date: string;
    note?: string;
};

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

function hasOverlap(ranges: OutOfOfficeRangeDraft[]): boolean {
    const normalized = ranges
        .map((range) => ({
            start: new Date(`${range.start_date}T00:00:00`).getTime(),
            end: new Date(`${range.end_date}T23:59:59`).getTime(),
        }))
        .sort((a, b) => a.start - b.start);

    for (let i = 1; i < normalized.length; i += 1) {
        if (normalized[i].start <= normalized[i - 1].end) {
            return true;
        }
    }
    return false;
}

export default function ProfilePage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { techId: previewTechId } = useParams();
    const { user, logout, technicianAccounts } = useAuth();
    const isPreviewMode = Boolean(previewTechId);
    const routeBase = isPreviewMode ? `/admin/tech-preview/${previewTechId}` : '/tech';
    const settingsRoute = `${routeBase}/profile/settings`;
    const isSettingsView = location.pathname.endsWith('/profile/settings');
    const previewTech = useMemo(() => {
        if (!previewTechId) return null;
        return technicianAccounts.find((tech) => tech.id === previewTechId) ?? null;
    }, [previewTechId, technicianAccounts]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [profile, setProfile] = useState<BackendTechnicianProfile | null>(null);
    const [previewEmail, setPreviewEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [profilePictureUrl, setProfilePictureUrl] = useState('');
    const [workingDays, setWorkingDays] = useState<number[]>([]);
    const [workingHoursStart, setWorkingHoursStart] = useState('08:00');
    const [workingHoursEnd, setWorkingHoursEnd] = useState('17:00');
    const [afterHoursEnabled, setAfterHoursEnabled] = useState(false);
    const [outOfOfficeRanges, setOutOfOfficeRanges] = useState<OutOfOfficeRangeDraft[]>([]);
    const [newRange, setNewRange] = useState<OutOfOfficeRangeDraft>({ start_date: '', end_date: '', note: '' });
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingAvailability, setSavingAvailability] = useState(false);
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const loadBackendData = async () => {
        setLoading(true);
        setError(null);

        if (isPreviewMode) {
            const fallbackName = previewTech?.name || user?.name || '';
            const fallbackPhone = previewTech?.phone || user?.phone || '';
            const fallbackEmail = previewTech?.email || '';
            const adminToken = getStoredAdminToken();
            if (!adminToken || !previewTechId) {
                setFullName(fallbackName);
                setPhone(fallbackPhone);
                setPreviewEmail(fallbackEmail);
                setProfilePictureUrl('');
                setWorkingDays([]);
                setWorkingHoursStart('08:00');
                setWorkingHoursEnd('17:00');
                setAfterHoursEnabled(false);
                setOutOfOfficeRanges([]);
                setLoading(false);
                return;
            }

            try {
                const rows = await fetchAdminTechnicians(adminToken);
                const selected = rows.find((item) => item.id === previewTechId);
                setFullName(selected?.full_name || selected?.name || fallbackName);
                setPhone(selected?.phone || fallbackPhone);
                setPreviewEmail(selected?.email || fallbackEmail);
                setProfilePictureUrl(selected?.profile_picture_url || '');
                setWorkingDays(selected?.working_days || []);
                setWorkingHoursStart((selected?.working_hours_start || '08:00').slice(0, 5));
                setWorkingHoursEnd((selected?.working_hours_end || '17:00').slice(0, 5));
                setAfterHoursEnabled(Boolean(selected?.after_hours_enabled));
                setOutOfOfficeRanges([]);
            } catch (fetchError) {
                setError(fetchError instanceof Error ? fetchError.message : 'Failed to load technician preview settings.');
                setFullName(fallbackName);
                setPhone(fallbackPhone);
                setPreviewEmail(fallbackEmail);
                setProfilePictureUrl('');
                setWorkingDays([]);
                setWorkingHoursStart('08:00');
                setWorkingHoursEnd('17:00');
                setAfterHoursEnabled(false);
                setOutOfOfficeRanges([]);
            } finally {
                setLoading(false);
            }
            return;
        }

        const token = getStoredTechnicianToken();
        if (!token) {
            setError('Technician backend session missing. Please login again.');
            setFullName(user?.name || '');
            setPhone(user?.phone || '');
            setLoading(false);
            return;
        }

        try {
            const profilePayload = await fetchTechnicianMeProfile(token);
            setProfile(profilePayload);
            setPreviewEmail('');
            setFullName(profilePayload.full_name || profilePayload.name);
            setPhone(profilePayload.phone || '');
            setProfilePictureUrl(profilePayload.profile_picture_url || '');
            setWorkingDays(profilePayload.working_days || []);
            setWorkingHoursStart((profilePayload.working_hours_start || '08:00').slice(0, 5));
            setWorkingHoursEnd((profilePayload.working_hours_end || '17:00').slice(0, 5));
            setAfterHoursEnabled(Boolean(profilePayload.after_hours_enabled));
            setOutOfOfficeRanges(
                (profilePayload.upcoming_time_off || []).map((item) => ({
                    start_date: item.start_date,
                    end_date: item.end_date,
                    note: item.reason || '',
                })),
            );
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : 'Failed to load profile data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadBackendData();
    }, [isPreviewMode, previewTechId, previewTech?.name, previewTech?.phone, user?.name, user?.phone]);

    const handleLogout = () => {
        if (isPreviewMode) {
            navigate('/admin', { replace: true });
            return;
        }
        logout();
        navigate('/tech/login', { replace: true });
    };

    const openSettingsView = () => {
        navigate(settingsRoute);
    };

    const openProfileView = () => {
        navigate(`${routeBase}/profile`);
    };

    const handleRefresh = async () => {
        await loadBackendData();
    };

    const toggleWorkingDay = (day: number) => {
        setWorkingDays((prev) => (
            prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day].sort((a, b) => a - b)
        ));
    };

    const addOutOfOfficeRange = () => {
        if (!newRange.start_date || !newRange.end_date) {
            window.alert('Start date and end date are required.');
            return;
        }
        if (newRange.end_date < newRange.start_date) {
            window.alert('End date must be on or after start date.');
            return;
        }
        const next = [...outOfOfficeRanges, newRange];
        if (hasOverlap(next)) {
            window.alert('Out-of-office ranges cannot overlap.');
            return;
        }
        setOutOfOfficeRanges(next);
        setNewRange({ start_date: '', end_date: '', note: '' });
    };

    const saveProfile = async () => {
        if (isPreviewMode) return;
        const token = getStoredTechnicianToken();
        if (!token) {
            window.alert('Technician backend session missing. Please login again.');
            return;
        }
        setSavingProfile(true);
        try {
            const updated = await updateTechnicianMeProfile(token, {
                full_name: fullName,
                phone: phone || null,
            });
            setProfile(updated);
            window.alert('Profile updated successfully.');
        } catch (saveError) {
            window.alert(saveError instanceof Error ? saveError.message : 'Failed to update profile.');
        } finally {
            setSavingProfile(false);
        }
    };

    const savePassword = async () => {
        if (isPreviewMode) return;
        const token = getStoredTechnicianToken();
        if (!token) {
            setPasswordError('Technician backend session missing. Please login again.');
            return;
        }

        const currentPassword = passwordForm.currentPassword.trim();
        const newPassword = passwordForm.newPassword.trim();
        const confirmPassword = passwordForm.confirmPassword.trim();

        if (!currentPassword || !newPassword || !confirmPassword) {
            setPasswordError('All password fields are required.');
            return;
        }
        if (newPassword.length < 6) {
            setPasswordError('New password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('New password and confirmation do not match.');
            return;
        }

        setSavingPassword(true);
        setPasswordError(null);
        try {
            await updateTechnicianMePassword(token, {
                current_password: currentPassword,
                new_password: newPassword,
            });
            setPasswordForm({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            });
            window.alert('Password updated successfully.');
        } catch (saveError) {
            setPasswordError(saveError instanceof Error ? saveError.message : 'Failed to update password.');
        } finally {
            setSavingPassword(false);
        }
    };

    const saveAvailability = async () => {
        if (isPreviewMode) return;
        if (workingDays.length === 0) {
            window.alert('Select at least one working day.');
            return;
        }
        if (workingHoursStart >= workingHoursEnd) {
            window.alert('Working hours end time must be after start time.');
            return;
        }
        if (hasOverlap(outOfOfficeRanges)) {
            window.alert('Out-of-office ranges cannot overlap.');
            return;
        }
        const token = getStoredTechnicianToken();
        if (!token) {
            window.alert('Technician backend session missing. Please login again.');
            return;
        }
        setSavingAvailability(true);
        try {
            const updated = await updateTechnicianMeAvailability(token, {
                working_days: workingDays,
                working_hours_start: workingHoursStart,
                working_hours_end: workingHoursEnd,
                after_hours_enabled: afterHoursEnabled,
                out_of_office_ranges: outOfOfficeRanges.map((item) => ({
                    start_date: item.start_date,
                    end_date: item.end_date,
                    note: item.note?.trim() || undefined,
                })),
            });
            setProfile(updated);
            window.alert('Availability updated successfully.');
        } catch (saveError) {
            window.alert(saveError instanceof Error ? saveError.message : 'Failed to update availability.');
        } finally {
            setSavingAvailability(false);
        }
    };

    const userName = isPreviewMode
        ? (previewTech?.name ?? 'Preview Technician')
        : (profile?.full_name || profile?.name || user?.name || 'Technician');
    const userEmail = isPreviewMode
        ? (previewEmail || previewTech?.email || 'Not set')
        : (profile?.email || user?.email || 'technician@sm2dispatch.com');
    const initials = userName
        .split(' ')
        .filter(Boolean)
        .map((name) => name[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    const userPhone = phone || user?.phone || 'Not set';
    const workingDayLabels = DAY_OPTIONS
        .filter((day) => workingDays.includes(day.value))
        .map((day) => day.label)
        .join(', ');

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
            <div className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
                <div className="max-w-2xl mx-auto px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                            {isSettingsView ? 'Profile Settings' : 'Profile'}
                        </h1>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {isSettingsView ? 'Manage your account and availability settings' : 'Manage your account'}
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleRefresh()}
                        className="h-9 gap-2 border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
                        disabled={loading}
                    >
                        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
                {loading ? <Card className="p-6">Loading profile...</Card> : null}
                {error ? <Card className="p-4 border-red-200 bg-red-50 text-red-700 text-sm">{error}</Card> : null}

                {isSettingsView ? (
                    <>
                        <Button type="button" variant="ghost" onClick={openProfileView} className="justify-start px-1 text-gray-600">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Profile
                        </Button>

                        <Card className="p-6 border-gray-200">
                            <div className="flex items-center gap-4 mb-6">
                                {profilePictureUrl ? (
                                    <img src={profilePictureUrl} alt="Profile" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-[#2F8E92] flex items-center justify-center text-white text-2xl font-bold">
                                        {initials}
                                    </div>
                                )}
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{userName}</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{isPreviewMode ? 'Technician (Preview)' : 'Technician'}</p>
                                </div>
                            </div>

                            {isPreviewMode ? (
                                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">Full Name</span>
                                        <span className="font-medium text-gray-900">{fullName || userName}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">Email</span>
                                        <span className="font-medium text-gray-900">{userEmail}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">Phone</span>
                                        <span className="font-medium text-gray-900">{userPhone}</span>
                                    </div>
                                    <p className="text-xs text-gray-500">Preview mode is read-only. Open technician portal to edit these values.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <Label>Full Name</Label>
                                        <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Phone</Label>
                                        <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
                                    </div>
                                    <Button onClick={() => void saveProfile()} className="w-full bg-[#2F8E92] hover:bg-[#267276]" disabled={savingProfile}>
                                        <Save className="w-4 h-4 mr-2" />
                                        {savingProfile ? 'Saving...' : 'Save Profile'}
                                    </Button>
                                </div>
                            )}
                        </Card>

                        <Card className="p-6 border-gray-200">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3">Availability Settings</h3>
                            {isPreviewMode ? (
                                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">Working Days</span>
                                        <span className="font-medium text-gray-900">{workingDayLabels || 'Not configured'}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">Working Hours</span>
                                        <span className="font-medium text-gray-900">{workingHoursStart} - {workingHoursEnd}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">After-hours Availability</span>
                                        <span className={cn('font-medium', afterHoursEnabled ? 'text-emerald-600' : 'text-gray-700')}>
                                            {afterHoursEnabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                    <div className="pt-1 border-t border-gray-200">
                                        <div className="text-xs font-medium text-gray-600 mb-2">Out-of-office ranges</div>
                                        {outOfOfficeRanges.length === 0 ? (
                                            <div className="text-xs text-gray-500">No out-of-office ranges configured.</div>
                                        ) : (
                                            <div className="space-y-2">
                                                {outOfOfficeRanges.map((range, index) => (
                                                    <div key={`${range.start_date}-${range.end_date}-${index}`} className="rounded-md border border-gray-200 px-3 py-2">
                                                        <div className="text-xs font-medium text-gray-800">{range.start_date} - {range.end_date}</div>
                                                        <div className="text-xs text-gray-500">{range.note || 'Out of office'}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500">Preview mode is read-only. Open technician portal to update availability.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <Label className="mb-2 block">Working Days</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {DAY_OPTIONS.map((day) => {
                                                const selected = workingDays.includes(day.value);
                                                return (
                                                    <button
                                                        key={day.value}
                                                        type="button"
                                                        onClick={() => toggleWorkingDay(day.value)}
                                                        className={cn(
                                                            'h-9 px-3 rounded-lg border text-sm font-medium',
                                                            selected
                                                                ? 'bg-[#2F8E92]/10 border-[#2F8E92] text-[#2F8E92]'
                                                                : 'bg-white border-gray-200 text-gray-600',
                                                        )}
                                                    >
                                                        {day.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label>Start Time</Label>
                                            <Input type="time" value={workingHoursStart} onChange={(event) => setWorkingHoursStart(event.target.value)} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label>End Time</Label>
                                            <Input type="time" value={workingHoursEnd} onChange={(event) => setWorkingHoursEnd(event.target.value)} />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">After-hours availability</div>
                                            <div className="text-xs text-gray-500">Allow assignment requests after normal shift</div>
                                        </div>
                                        <Switch checked={afterHoursEnabled} onCheckedChange={setAfterHoursEnabled} />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Out-of-office ranges</Label>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                            <Input type="date" value={newRange.start_date} onChange={(event) => setNewRange((prev) => ({ ...prev, start_date: event.target.value }))} />
                                            <Input type="date" value={newRange.end_date} onChange={(event) => setNewRange((prev) => ({ ...prev, end_date: event.target.value }))} />
                                            <Input value={newRange.note || ''} onChange={(event) => setNewRange((prev) => ({ ...prev, note: event.target.value }))} placeholder="Note (optional)" />
                                        </div>
                                        <Button type="button" variant="outline" onClick={addOutOfOfficeRange} className="w-full">
                                            <Plus className="w-4 h-4 mr-2" /> Add Range
                                        </Button>
                                        <div className="space-y-2">
                                            {outOfOfficeRanges.length === 0 ? (
                                                <div className="text-xs text-gray-500">No out-of-office ranges configured.</div>
                                            ) : outOfOfficeRanges.map((range, index) => (
                                                <div key={`${range.start_date}-${range.end_date}-${index}`} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                                                    <div className="text-xs">
                                                        <div className="font-medium text-gray-800">{range.start_date} - {range.end_date}</div>
                                                        <div className="text-gray-500">{range.note || 'Out of office'}</div>
                                                    </div>
                                                    <Button type="button" variant="ghost" size="icon" onClick={() => setOutOfOfficeRanges((prev) => prev.filter((_, i) => i !== index))}>
                                                        <Trash2 className="w-4 h-4 text-red-500" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <Button onClick={() => void saveAvailability()} className="w-full bg-[#2F8E92] hover:bg-[#267276]" disabled={savingAvailability}>
                                        <Save className="w-4 h-4 mr-2" />
                                        {savingAvailability ? 'Saving...' : 'Save Availability'}
                                    </Button>
                                </div>
                            )}
                        </Card>

                        <Card className="p-6 border-gray-200">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <KeyRound className="w-4 h-4 text-[#2F8E92]" />
                                Reset Password
                            </h3>
                            {isPreviewMode ? (
                                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500">
                                    Preview mode is read-only. Open technician portal to update password.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <Label htmlFor="technician_current_password">Current Password</Label>
                                        <Input
                                            id="technician_current_password"
                                            type="password"
                                            autoComplete="current-password"
                                            value={passwordForm.currentPassword}
                                            onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="technician_new_password">New Password</Label>
                                        <Input
                                            id="technician_new_password"
                                            type="password"
                                            autoComplete="new-password"
                                            value={passwordForm.newPassword}
                                            onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="technician_confirm_password">Confirm New Password</Label>
                                        <Input
                                            id="technician_confirm_password"
                                            type="password"
                                            autoComplete="new-password"
                                            value={passwordForm.confirmPassword}
                                            onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                                        />
                                    </div>
                                    {passwordError ? <p className="text-sm text-red-600">{passwordError}</p> : null}
                                    <Button
                                        onClick={() => void savePassword()}
                                        className="w-full bg-[#2F8E92] hover:bg-[#267276]"
                                        disabled={savingPassword}
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        {savingPassword ? 'Updating...' : 'Update Password'}
                                    </Button>
                                </div>
                            )}
                        </Card>
                    </>
                ) : (
                    <>
                        <Card className="p-6 border-gray-200">
                            <div className="flex items-center gap-4">
                                {profilePictureUrl ? (
                                    <img src={profilePictureUrl} alt="Profile" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-[#2F8E92] flex items-center justify-center text-white text-2xl font-bold">
                                        {initials}
                                    </div>
                                )}
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{userName}</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{isPreviewMode ? 'Technician (Preview)' : 'Technician'}</p>
                                </div>
                            </div>

                            <div className="mt-6 divide-y divide-gray-100">
                                <div className="flex items-center justify-between py-3 text-sm">
                                    <span className="text-gray-500">Email</span>
                                    <span className="font-medium text-gray-900">{userEmail}</span>
                                </div>
                                <div className="flex items-center justify-between py-3 text-sm">
                                    <span className="text-gray-500">Phone</span>
                                    <span className="font-medium text-gray-900">{userPhone}</span>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-0 overflow-hidden border-gray-200">
                            <button
                                type="button"
                                className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-gray-50"
                                onClick={openSettingsView}
                            >
                                <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                                    <Settings className="w-4 h-4 text-gray-500" />
                                    Settings
                                </span>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                            </button>
                        </Card>
                    </>
                )}

                <Button
                    onClick={handleLogout}
                    variant="outline"
                    className="w-full h-12 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800"
                >
                    <LogOut className="w-5 h-5 mr-2" />
                    {isPreviewMode ? 'Exit Preview' : 'Logout'}
                </Button>
            </div>

            <BottomNav activeTab="profile" routeBase={routeBase} />
        </div>
    );
}
