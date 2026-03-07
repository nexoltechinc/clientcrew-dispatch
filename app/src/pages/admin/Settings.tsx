import { useEffect, useState } from 'react';
import {
    AlertCircle,
    Pencil,
    RefreshCw,
    Clock,
    KeyRound,
    Moon,
    Sun,
    Monitor,
    FileText,
    ListFilter,
    PlusCircle
} from 'lucide-react';
import { MOCK_DEALERSHIPS as FALLBACK_DEALERSHIPS } from './Dealerships';
import type { PriorityRule, UrgencyLevel } from '@/types';





import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import {
    type InvoiceCompanyProfile,
    loadInvoiceCompanyProfile,
    saveInvoiceCompanyProfile,
} from '@/lib/invoice-company';
import {
    createAdminPriorityRule,
    deleteAdminPriorityRule,
    fetchAdminCredentialSettings,
    fetchAdminDealerships,
    fetchAdminPriorityRules,
    fetchAdminServices,
    fetchAdminInvoiceBrandingSettings,
    getStoredAdminToken,
    updateAdminCredentialSettings,
    updateAdminPriorityRule,
    updateAdminInvoiceBrandingSettings,
    type BackendAdminCredentialSettings,
    type BackendDealership,
    type BackendPriorityRule,
    type BackendServiceCatalogItem,
} from '@/lib/backend-api';
import { useAuth } from '@/contexts/AuthContext';
// --- Mock Data & Types ---

type ThemeMode = 'light' | 'dark' | 'system';

type DealershipOption = {
    id: string;
    name: string;
};

// --- Components ---

const normalizeInvoiceCompanyProfile = (profile: InvoiceCompanyProfile): InvoiceCompanyProfile => ({
    logo_url: profile.logo_url?.trim() || undefined,
    name: profile.name.trim(),
    street_address: profile.street_address.trim(),
    city: profile.city.trim(),
    state: profile.state.trim(),
    zip_code: profile.zip_code.trim(),
    phone: profile.phone.trim(),
    email: profile.email.trim(),
    website: profile.website.trim(),
});

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
    name: row.name?.trim() || '',
});

const getDefaultNewRule = (): Partial<PriorityRule> => ({
    targetUrgency: 'HIGH',
    rankingScore: 10,
    isActive: true,
    dealershipId: '',
    serviceId: '',
    description: ''
});

const ADMIN_REFRESH_EVENT = 'sm-dispatch:admin-refresh';
const DEFAULT_ADMIN_EMAIL = 'nexoltechsolutionsinc@gmail.com';

const getDefaultAdminCredentialValues = () => ({
    adminEmail: DEFAULT_ADMIN_EMAIL,
    recoveryEmail: DEFAULT_ADMIN_EMAIL,
});



export default function SettingsPage() {
    const { hasBackendAdminToken } = useAuth();
    const [refreshSeed, setRefreshSeed] = useState(0);
    const [loading, setLoading] = useState(false);
    const [savedInvoiceCompany, setSavedInvoiceCompany] = useState<InvoiceCompanyProfile>(() => loadInvoiceCompanyProfile());
    const [invoiceCompany, setInvoiceCompany] = useState<InvoiceCompanyProfile>(() => loadInvoiceCompanyProfile());
    const [priorityRules, setPriorityRules] = useState<PriorityRule[]>([]);
    const [dealershipOptions, setDealershipOptions] = useState<DealershipOption[]>([]);
    const [serviceOptions, setServiceOptions] = useState<Array<{ id: string; name: string }>>([]);
    const [isAddingRule, setIsAddingRule] = useState(false);
    const [newRule, setNewRule] = useState<Partial<PriorityRule>>(getDefaultNewRule());
    const [isEditingRule, setIsEditingRule] = useState(false);
    const [editRule, setEditRule] = useState<Partial<PriorityRule> & { id?: string }>(getDefaultNewRule());
    const [savedAdminCredentials, setSavedAdminCredentials] = useState(getDefaultAdminCredentialValues());
    const [adminCredentialForm, setAdminCredentialForm] = useState({
        ...getDefaultAdminCredentialValues(),
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [adminCredentialError, setAdminCredentialError] = useState<string | null>(null);
    const [isSavingAdminCredentials, setIsSavingAdminCredentials] = useState(false);
    const MOCK_DEALERSHIPS = dealershipOptions.length > 0 ? dealershipOptions : FALLBACK_DEALERSHIPS;

    const { theme, setTheme } = useTheme();
    useEffect(() => {
        const handleAdminRefresh = () => {
            setRefreshSeed((current) => current + 1);
        };

        window.addEventListener(ADMIN_REFRESH_EVENT, handleAdminRefresh);
        return () => {
            window.removeEventListener(ADMIN_REFRESH_EVENT, handleAdminRefresh);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadInvoiceBrandingSettings = async () => {
            const localProfile = loadInvoiceCompanyProfile();
            setSavedInvoiceCompany(localProfile);
            setInvoiceCompany(localProfile);

            const adminToken = getStoredAdminToken();
            if (!hasBackendAdminToken || !adminToken) {
                return;
            }

            try {
                const backendProfileRaw = await fetchAdminInvoiceBrandingSettings(adminToken);
                if (cancelled) {
                    return;
                }

                const backendProfile = normalizeInvoiceCompanyProfile({
                    logo_url: backendProfileRaw.logo_url ?? undefined,
                    name: backendProfileRaw.name,
                    street_address: backendProfileRaw.street_address,
                    city: backendProfileRaw.city,
                    state: backendProfileRaw.state,
                    zip_code: backendProfileRaw.zip_code,
                    phone: backendProfileRaw.phone,
                    email: backendProfileRaw.email,
                    website: backendProfileRaw.website,
                });

                setSavedInvoiceCompany(backendProfile);
                setInvoiceCompany(backendProfile);
                saveInvoiceCompanyProfile(backendProfile);
            } catch {
                // Keep local storage profile as fallback when backend is unavailable.
            }
        };

        void loadInvoiceBrandingSettings();

        return () => {
            cancelled = true;
        };
    }, [hasBackendAdminToken, refreshSeed]);

    useEffect(() => {
        const adminToken = getStoredAdminToken();
        if (!hasBackendAdminToken || !adminToken) {
            setSavedAdminCredentials(getDefaultAdminCredentialValues());
            setAdminCredentialForm((prev) => ({
                ...prev,
                ...getDefaultAdminCredentialValues(),
            }));
            return;
        }

        let cancelled = false;
        const loadAdminCredentials = async () => {
            try {
                const settings: BackendAdminCredentialSettings = await fetchAdminCredentialSettings(adminToken);
                if (cancelled) {
                    return;
                }

                const nextValues = {
                    adminEmail: settings.admin_email,
                    recoveryEmail: settings.recovery_email,
                };
                setSavedAdminCredentials(nextValues);
                setAdminCredentialForm((prev) => ({
                    ...prev,
                    ...nextValues,
                }));
            } catch {
                if (!cancelled) {
                    const fallbackValues = getDefaultAdminCredentialValues();
                    setSavedAdminCredentials(fallbackValues);
                    setAdminCredentialForm((prev) => ({
                        ...prev,
                        ...fallbackValues,
                    }));
                }
            }
        };

        void loadAdminCredentials();
        return () => {
            cancelled = true;
        };
    }, [hasBackendAdminToken, refreshSeed]);

    useEffect(() => {
        const adminToken = getStoredAdminToken();
        if (!hasBackendAdminToken || !adminToken) {
            setDealershipOptions([]);
            return;
        }

        let cancelled = false;
        const loadDealerships = async () => {
            try {
                const rows = await fetchAdminDealerships(adminToken);
                if (cancelled) return;
                setDealershipOptions(
                    rows
                        .map(mapBackendDealershipOption)
                        .filter((row) => row.name.length > 0),
                );
            } catch {
                if (!cancelled) setDealershipOptions([]);
            }
        };

        void loadDealerships();
        return () => {
            cancelled = true;
        };
    }, [hasBackendAdminToken, refreshSeed]);

    useEffect(() => {
        const adminToken = getStoredAdminToken();
        if (!hasBackendAdminToken || !adminToken) {
            setServiceOptions([]);
            return;
        }

        let cancelled = false;
        const loadServices = async () => {
            try {
                const rows = await fetchAdminServices(adminToken, true);
                if (cancelled) return;
                const next = rows
                    .map((row: BackendServiceCatalogItem) => ({
                        id: row.id,
                        name: row.name?.trim() || '',
                    }))
                    .filter((row) => row.name.length > 0);
                setServiceOptions(next);
            } catch {
                if (!cancelled) setServiceOptions([]);
            }
        };

        void loadServices();
        return () => {
            cancelled = true;
        };
    }, [hasBackendAdminToken, refreshSeed]);

    useEffect(() => {
        const adminToken = getStoredAdminToken();
        if (!hasBackendAdminToken || !adminToken) {
            setPriorityRules([]);
            return;
        }

        let cancelled = false;
        const loadPriorityRules = async () => {
            try {
                const rows = await fetchAdminPriorityRules(adminToken);
                if (cancelled) return;
                setPriorityRules(rows.map(mapBackendPriorityRule));
            } catch {
                if (!cancelled) setPriorityRules([]);
            }
        };

        void loadPriorityRules();
        return () => {
            cancelled = true;
        };
    }, [hasBackendAdminToken, refreshSeed]);

    const saveInvoiceBrandingSettings = async (successMessage: string): Promise<boolean> => {
        const normalizedCompanyProfile: InvoiceCompanyProfile = normalizeInvoiceCompanyProfile(invoiceCompany);

        if (
            !normalizedCompanyProfile.name ||
            !normalizedCompanyProfile.street_address ||
            !normalizedCompanyProfile.city ||
            !normalizedCompanyProfile.state ||
            !normalizedCompanyProfile.zip_code ||
            !normalizedCompanyProfile.phone ||
            !normalizedCompanyProfile.email ||
            !normalizedCompanyProfile.website
        ) {
            alert("Please complete the full invoice company profile (all fields except logo are required).");
            return false;
        }

        setLoading(true);
        try {
            const adminToken = getStoredAdminToken();
            let nextCompanyProfile = normalizedCompanyProfile;

            if (hasBackendAdminToken && adminToken) {
                const backendSavedProfile = await updateAdminInvoiceBrandingSettings(adminToken, normalizedCompanyProfile);
                nextCompanyProfile = normalizeInvoiceCompanyProfile({
                    logo_url: backendSavedProfile.logo_url ?? undefined,
                    name: backendSavedProfile.name,
                    street_address: backendSavedProfile.street_address,
                    city: backendSavedProfile.city,
                    state: backendSavedProfile.state,
                    zip_code: backendSavedProfile.zip_code,
                    phone: backendSavedProfile.phone,
                    email: backendSavedProfile.email,
                    website: backendSavedProfile.website,
                });
            }

            setSavedInvoiceCompany(nextCompanyProfile);
            setInvoiceCompany(nextCompanyProfile);
            saveInvoiceCompanyProfile(nextCompanyProfile);
            alert(successMessage);
            return true;
        } catch (error) {
            const detail = error instanceof Error ? error.message : "Unable to save settings.";
            alert(`Failed to save invoice branding settings: ${detail}`);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const handleSaveInvoiceBranding = async () => {
        await saveInvoiceBrandingSettings("Invoice branding saved successfully.");
    };

    const handleCancelInvoiceBranding = () => {
        setInvoiceCompany({ ...savedInvoiceCompany });
    };

    const handleSaveAdminCredentials = async () => {
        const adminToken = getStoredAdminToken();
        if (!hasBackendAdminToken || !adminToken) {
            setAdminCredentialError('Admin session is required to update access settings.');
            return;
        }

        setAdminCredentialError(null);
        const adminEmail = adminCredentialForm.adminEmail.trim().toLowerCase();
        const recoveryEmail = adminCredentialForm.recoveryEmail.trim().toLowerCase();
        const currentPassword = adminCredentialForm.currentPassword.trim();
        const newPassword = adminCredentialForm.newPassword.trim();
        const confirmPassword = adminCredentialForm.confirmPassword.trim();

        if (!adminEmail || !recoveryEmail || !currentPassword) {
            setAdminCredentialError('Admin email, super email, and current password are required.');
            return;
        }
        if ((newPassword && !confirmPassword) || (!newPassword && confirmPassword)) {
            setAdminCredentialError('Enter and confirm the new password, or leave both fields empty.');
            return;
        }
        if (newPassword && newPassword.length < 6) {
            setAdminCredentialError('New password must be at least 6 characters.');
            return;
        }
        if (newPassword && newPassword !== confirmPassword) {
            setAdminCredentialError('New password and confirmation do not match.');
            return;
        }

        setIsSavingAdminCredentials(true);
        try {
            const updated = await updateAdminCredentialSettings(adminToken, {
                admin_email: adminEmail,
                recovery_email: recoveryEmail,
                current_password: currentPassword,
                new_password: newPassword || undefined,
            });
            const nextValues = {
                adminEmail: updated.admin_email,
                recoveryEmail: updated.recovery_email,
            };
            setSavedAdminCredentials(nextValues);
            setAdminCredentialForm({
                ...nextValues,
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            });
            alert(newPassword ? 'Admin access settings updated successfully.' : 'Admin email and super email updated successfully.');
        } catch (error) {
            setAdminCredentialError(error instanceof Error ? error.message : 'Unable to update admin access settings.');
        } finally {
            setIsSavingAdminCredentials(false);
        }
    };

    const handleThemeChange = (newTheme: ThemeMode) => {
        setTheme(newTheme);
        // In real app: update context, persist to backend, update document class
        // useTheme hook handles document class update
    };

    const handleDeleteRule = async (id: string) => {
        const adminToken = getStoredAdminToken();
        if (!hasBackendAdminToken || !adminToken) {
            alert('Admin session is required to delete rules.');
            return;
        }

        try {
            await deleteAdminPriorityRule(adminToken, id);
            setPriorityRules(prev => prev.filter(r => r.id !== id));
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unable to delete priority rule.';
            alert(detail);
        }
    };

    const handleToggleRule = async (id: string) => {
        const adminToken = getStoredAdminToken();
        if (!hasBackendAdminToken || !adminToken) {
            alert('Admin session is required to update rules.');
            return;
        }

        const current = priorityRules.find((rule) => rule.id === id);
        if (!current) {
            return;
        }

        try {
            const updated = await updateAdminPriorityRule(adminToken, id, {
                is_active: !current.isActive,
            });
            setPriorityRules(prev => prev.map(r => r.id === id ? mapBackendPriorityRule(updated) : r));
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unable to update priority rule.';
            alert(detail);
        }
    };

    const handleAddRule = async () => {
        const adminToken = getStoredAdminToken();
        if (!hasBackendAdminToken || !adminToken) {
            alert('Admin session is required to create rules.');
            return;
        }

        try {
            const created = await createAdminPriorityRule(adminToken, {
                description: newRule.description || 'New Priority Rule',
                dealership_id: newRule.dealershipId || (dealershipOptions[0]?.id || ''),
                service_id: newRule.serviceId === 'any' ? null : (newRule.serviceId || null),
                target_urgency: newRule.targetUrgency || 'HIGH',
                ranking_score: (newRule.rankingScore !== undefined) ? newRule.rankingScore : 10,
                is_active: true,
            });
            setPriorityRules(prev => [...prev, mapBackendPriorityRule(created)]);
            setIsAddingRule(false);
            setNewRule(getDefaultNewRule());
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unable to create priority rule.';
            alert(detail);
        }
    };

    const handleOpenEditRule = (rule: PriorityRule) => {
        setEditRule({
            id: rule.id,
            description: rule.description,
            dealershipId: rule.dealershipId,
            serviceId: rule.serviceId || 'any',
            targetUrgency: rule.targetUrgency,
            rankingScore: rule.rankingScore,
            isActive: rule.isActive,
        });
        setIsEditingRule(true);
    };

    const handleEditRule = async () => {
        const adminToken = getStoredAdminToken();
        if (!hasBackendAdminToken || !adminToken || !editRule.id) {
            alert('Admin session is required to edit rules.');
            return;
        }

        try {
            const updated = await updateAdminPriorityRule(adminToken, editRule.id, {
                description: editRule.description || 'Updated Priority Rule',
                dealership_id: editRule.dealershipId || (dealershipOptions[0]?.id || ''),
                service_id: editRule.serviceId === 'any' ? null : (editRule.serviceId || null),
                target_urgency: editRule.targetUrgency || 'HIGH',
                ranking_score: (editRule.rankingScore !== undefined) ? editRule.rankingScore : 10,
                is_active: editRule.isActive ?? true,
            });
            setPriorityRules((prev) => prev.map((r) => (r.id === editRule.id ? mapBackendPriorityRule(updated) : r)));
            setIsEditingRule(false);
            setEditRule(getDefaultNewRule());
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unable to update priority rule.';
            alert(detail);
        }
    };




    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">

            {/* 1. Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
                    <p className="text-sm text-muted-foreground font-medium">System configuration, integrations, and reliability controls</p>
                </div>
                <div />
            </div>

            <div className="grid gap-6">

                {/* Section G - Ranking Rules */}


                <Card className="border-border shadow-sm bg-card">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                                <ListFilter className="w-4 h-4 text-[#2F8E92]" /> Dispatch Ranking Rules
                            </CardTitle>

                            <Dialog open={isAddingRule} onOpenChange={setIsAddingRule}>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="h-8 bg-[#2F8E92] text-white hover:bg-[#267276]">
                                        <PlusCircle className="w-3.5 h-3.5 mr-2" /> Add Rule
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                    <DialogHeader>
                                        <DialogTitle>Create New Ranking Rule</DialogTitle>
                                        <DialogDescription>Define logic to automatically escalate job ranking.</DialogDescription>
                                    </DialogHeader>

                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label>Rule Description</Label>
                                            <Input
                                                placeholder="e.g., Prioritize Audi repairs"
                                                value={newRule.description}
                                                onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Customer</Label>
                                                <Select
                                                    value={newRule.dealershipId}
                                                    onValueChange={(v) => setNewRule({ ...newRule, dealershipId: v })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select customer" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {MOCK_DEALERSHIPS.map(d => (
                                                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Service Type</Label>
                                                <Select
                                                    value={newRule.serviceId}
                                                    onValueChange={(v) => setNewRule({ ...newRule, serviceId: v })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Any Service" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="any">Any Service</SelectItem>
                                                        {serviceOptions.map(s => (
                                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Target Urgency</Label>
                                                <Select
                                                    value={newRule.targetUrgency}
                                                    onValueChange={(v) => setNewRule({ ...newRule, targetUrgency: v as UrgencyLevel })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="LOW">Low</SelectItem>
                                                        <SelectItem value="MEDIUM">Medium</SelectItem>
                                                        <SelectItem value="HIGH">High</SelectItem>
                                                        <SelectItem value="CRITICAL">Critical</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Ranking Score</Label>
                                                <Input
                                                    type="number"
                                                    value={newRule.rankingScore}
                                                    onChange={(e) => setNewRule({ ...newRule, rankingScore: parseInt(e.target.value) })}
                                                />
                                            </div>

                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setIsAddingRule(false)}>Cancel</Button>
                                        <Button className="bg-[#2F8E92] text-white hover:bg-[#267276]" onClick={handleAddRule}>Save Rule</Button>
                                    </DialogFooter>

                                </DialogContent>
                            </Dialog>
                            <Dialog open={isEditingRule} onOpenChange={setIsEditingRule}>
                                <DialogContent className="max-w-md">
                                    <DialogHeader>
                                        <DialogTitle>Edit Ranking Rule</DialogTitle>
                                        <DialogDescription>Update rule logic for dispatch ranking.</DialogDescription>
                                    </DialogHeader>

                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label>Rule Description</Label>
                                            <Input
                                                placeholder="e.g., Prioritize Audi repairs"
                                                value={editRule.description || ''}
                                                onChange={(e) => setEditRule({ ...editRule, description: e.target.value })}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Customer</Label>
                                                <Select
                                                    value={editRule.dealershipId}
                                                    onValueChange={(v) => setEditRule({ ...editRule, dealershipId: v })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select customer" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {MOCK_DEALERSHIPS.map(d => (
                                                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Service Type</Label>
                                                <Select
                                                    value={editRule.serviceId}
                                                    onValueChange={(v) => setEditRule({ ...editRule, serviceId: v })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Any Service" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="any">Any Service</SelectItem>
                                                        {serviceOptions.map(s => (
                                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Target Urgency</Label>
                                                <Select
                                                    value={editRule.targetUrgency}
                                                    onValueChange={(v) => setEditRule({ ...editRule, targetUrgency: v as UrgencyLevel })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="LOW">Low</SelectItem>
                                                        <SelectItem value="MEDIUM">Medium</SelectItem>
                                                        <SelectItem value="HIGH">High</SelectItem>
                                                        <SelectItem value="CRITICAL">Critical</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Ranking Score</Label>
                                                <Input
                                                    type="number"
                                                    value={editRule.rankingScore}
                                                    onChange={(e) => setEditRule({ ...editRule, rankingScore: parseInt(e.target.value) })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setIsEditingRule(false)}>Cancel</Button>
                                        <Button className="bg-[#2F8E92] text-white hover:bg-[#267276]" onClick={handleEditRule}>Save Changes</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                        <CardDescription className="text-muted-foreground">Manage rule-based escalation and sorting for inbound jobs</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border border-border overflow-hidden">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="w-[300px]">Rule & Description</TableHead>
                                        <TableHead>Target</TableHead>
                                        <TableHead>Ranking</TableHead>
                                        <TableHead className="text-center">Active</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>

                                </TableHeader>
                                <TableBody>
                                    {priorityRules.map(rule => {
                                        const dealer = MOCK_DEALERSHIPS.find(d => d.id === rule.dealershipId);
                                        return (
                                            <TableRow key={rule.id}>
                                                <TableCell className="py-3">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-sm text-foreground">{rule.description}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase">{dealer?.name || 'Global'}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={cn(
                                                        "font-bold text-[10px]",
                                                        rule.targetUrgency === 'CRITICAL' ? "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800" :
                                                            rule.targetUrgency === 'HIGH' ? "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800" :
                                                                "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                                                    )}>
                                                        {rule.targetUrgency}
                                                    </Badge>
                                                </TableCell>

                                                <TableCell className="font-mono text-sm">+{rule.rankingScore}</TableCell>

                                                <TableCell className="text-center">
                                                    <Switch
                                                        checked={rule.isActive}
                                                        onCheckedChange={() => handleToggleRule(rule.id)}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-[#2F8E92]"
                                                        onClick={() => handleOpenEditRule(rule)}
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                                                        onClick={() => handleDeleteRule(rule.id)}
                                                    >
                                                        <AlertCircle className="w-4 h-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border shadow-sm bg-card">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                            <FileText className="w-4 h-4 text-[#2F8E92]" /> Invoice Branding
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Edit the full company profile shown on generated invoices and PDFs.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="invoice_company_name" className="text-foreground">Company Name</Label>
                                <Input
                                    id="invoice_company_name"
                                    value={invoiceCompany.name}
                                    onChange={(e) => setInvoiceCompany({ ...invoiceCompany, name: e.target.value })}
                                    placeholder="Client-Crew Dispatch"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invoice_company_email" className="text-foreground">Billing Email</Label>
                                <Input
                                    id="invoice_company_email"
                                    type="email"
                                    value={invoiceCompany.email}
                                    onChange={(e) => setInvoiceCompany({ ...invoiceCompany, email: e.target.value })}
                                    placeholder="billing@clientcrew-dispatch.com"
                                />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="invoice_company_street" className="text-foreground">Street Address</Label>
                                <Input
                                    id="invoice_company_street"
                                    value={invoiceCompany.street_address}
                                    onChange={(e) => setInvoiceCompany({ ...invoiceCompany, street_address: e.target.value })}
                                    placeholder="123 Service Lane"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invoice_company_city" className="text-foreground">City</Label>
                                <Input
                                    id="invoice_company_city"
                                    value={invoiceCompany.city}
                                    onChange={(e) => setInvoiceCompany({ ...invoiceCompany, city: e.target.value })}
                                    placeholder="Quebec"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invoice_company_state" className="text-foreground">State / Province</Label>
                                <Input
                                    id="invoice_company_state"
                                    value={invoiceCompany.state}
                                    onChange={(e) => setInvoiceCompany({ ...invoiceCompany, state: e.target.value })}
                                    placeholder="QC"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invoice_company_zip" className="text-foreground">ZIP / Postal Code</Label>
                                <Input
                                    id="invoice_company_zip"
                                    value={invoiceCompany.zip_code}
                                    onChange={(e) => setInvoiceCompany({ ...invoiceCompany, zip_code: e.target.value })}
                                    placeholder="G1A 1A1"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invoice_company_phone" className="text-foreground">Phone</Label>
                                <Input
                                    id="invoice_company_phone"
                                    value={invoiceCompany.phone}
                                    onChange={(e) => setInvoiceCompany({ ...invoiceCompany, phone: e.target.value })}
                                    placeholder="+1-418-555-0100"
                                />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="invoice_company_website" className="text-foreground">Website</Label>
                                <Input
                                    id="invoice_company_website"
                                    value={invoiceCompany.website}
                                    onChange={(e) => setInvoiceCompany({ ...invoiceCompany, website: e.target.value })}
                                    placeholder="https://clientcrew-dispatch.vercel.app"
                                />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-muted/30 border-t border-border py-3">
                        <div className="ml-auto flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={handleCancelInvoiceBranding} disabled={loading}>
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleSaveInvoiceBranding} disabled={loading}>
                                {loading && <RefreshCw className="w-3 h-3 mr-2 animate-spin" />}
                                {loading ? 'Saving...' : 'Save Invoice Branding'}
                            </Button>
                        </div>
                    </CardFooter>
                </Card>

                <Card className="border-border shadow-sm bg-card">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                            <KeyRound className="w-4 h-4 text-[#2F8E92]" /> Admin Access & Recovery
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Update the admin sign-in email, the super email used for OTP recovery, and the password from one place.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="admin_account_email" className="text-foreground">Admin Email</Label>
                                <Input
                                    id="admin_account_email"
                                    type="email"
                                    value={adminCredentialForm.adminEmail}
                                    onChange={(e) => setAdminCredentialForm((prev) => ({ ...prev, adminEmail: e.target.value }))}
                                    autoComplete="email"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="admin_recovery_email" className="text-foreground">Super Email For OTP</Label>
                                <Input
                                    id="admin_recovery_email"
                                    type="email"
                                    value={adminCredentialForm.recoveryEmail}
                                    onChange={(e) => setAdminCredentialForm((prev) => ({ ...prev, recoveryEmail: e.target.value }))}
                                    autoComplete="email"
                                />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="admin_current_password" className="text-foreground">Current Password</Label>
                                <Input
                                    id="admin_current_password"
                                    type="password"
                                    value={adminCredentialForm.currentPassword}
                                    onChange={(e) => setAdminCredentialForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                                    autoComplete="current-password"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="admin_new_password" className="text-foreground">New Password (Optional)</Label>
                                <Input
                                    id="admin_new_password"
                                    type="password"
                                    value={adminCredentialForm.newPassword}
                                    onChange={(e) => setAdminCredentialForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                                    autoComplete="new-password"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="admin_confirm_password" className="text-foreground">Confirm New Password</Label>
                                <Input
                                    id="admin_confirm_password"
                                    type="password"
                                    value={adminCredentialForm.confirmPassword}
                                    onChange={(e) => setAdminCredentialForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>
                        <p className="mt-4 text-xs text-muted-foreground">
                            The super email is the recovery destination for future forgot-password OTP delivery.
                        </p>
                        {adminCredentialError && (
                            <p className="mt-3 text-sm text-red-600">{adminCredentialError}</p>
                        )}
                    </CardContent>
                    <CardFooter className="bg-muted/30 border-t border-border py-3">
                        <div className="ml-auto flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    setAdminCredentialForm({
                                        ...savedAdminCredentials,
                                        currentPassword: '',
                                        newPassword: '',
                                        confirmPassword: '',
                                    });
                                    setAdminCredentialError(null);
                                }}
                                disabled={isSavingAdminCredentials}
                            >
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleSaveAdminCredentials} disabled={isSavingAdminCredentials}>
                                {isSavingAdminCredentials && <RefreshCw className="w-3 h-3 mr-2 animate-spin" />}
                                {isSavingAdminCredentials ? 'Saving...' : 'Update Access Settings'}
                            </Button>
                        </div>
                    </CardFooter>
                </Card>

                {/* Section F - Appearance (User Preference) */}


                <Card className="border-border shadow-sm bg-card">
                    <CardHeader>
                        <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                            <Monitor className="w-4 h-4 text-purple-600" /> Appearance
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">Customize your interface theme</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Light Mode */}
                            <button
                                onClick={() => handleThemeChange('light')}
                                className={cn(
                                    "flex flex-col items-start p-4 rounded-xl border-2 transition-all hover:bg-muted/50",
                                    theme === 'light' ? "border-[#2F8E92] bg-[#E6F4F4]/30 ring-1 ring-[#2F8E92]" : "border-border bg-card"
                                )}
                            >
                                <div className="mb-3 p-2 bg-gray-100 rounded-lg text-gray-500">
                                    <Sun className="w-5 h-5" />
                                </div>
                                <span className="font-semibold text-sm text-foreground">Light Mode</span>
                                <span className="text-xs text-muted-foreground mt-1 text-left">Standard professional light theme</span>
                            </button>

                            {/* Dark Mode */}
                            <button
                                onClick={() => handleThemeChange('dark')}
                                className={cn(
                                    "flex flex-col items-start p-4 rounded-xl border-2 transition-all hover:bg-muted/50 dark:hover:bg-muted/10",
                                    theme === 'dark' ? "border-[#2F8E92] bg-[#E6F4F4]/30 ring-1 ring-[#2F8E92]" : "border-border bg-card"
                                )}
                            >
                                <div className="mb-3 p-2 bg-gray-800 rounded-lg text-gray-400">
                                    <Moon className="w-5 h-5" />
                                </div>
                                <span className="font-semibold text-sm text-foreground">Dark Mode</span>
                                <span className="text-xs text-muted-foreground mt-1 text-left">Reduced eye strain for low-light</span>
                            </button>

                            {/* System Mode */}
                            <button
                                onClick={() => handleThemeChange('system')}
                                className={cn(
                                    "flex flex-col items-start p-4 rounded-xl border-2 transition-all hover:bg-muted/50",
                                    theme === 'system' ? "border-[#2F8E92] bg-[#E6F4F4]/30 ring-1 ring-[#2F8E92]" : "border-border bg-card"
                                )}
                            >
                                <div className="mb-3 p-2 bg-muted rounded-lg text-muted-foreground">
                                    <Monitor className="w-5 h-5" />
                                </div>
                                <span className="font-semibold text-sm text-foreground">System Default</span>
                                <span className="text-xs text-muted-foreground mt-1 text-left">Sync with device preference</span>
                            </button>
                        </div>
                    </CardContent>
                </Card>

            </div>
        </div>
    );
}
