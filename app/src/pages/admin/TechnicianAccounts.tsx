import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  RefreshCw,
  UserCog,
  Mail,
  Phone,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Calendar,
  Pencil,
  Power,
  UserPlus,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  useAuth,
  type TechnicianAccountSummary,
  type TechnicianSignupRequestSummary,
} from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { formatPhoneForDisplay, formatUsPhoneInput } from '@/lib/phone';
import { getStoredAdminToken, updateAdminPassword } from '@/lib/backend-api';

type EditFormState = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

type AdminPasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

export default function TechnicianAccountsPage() {
  const {
    technicianAccounts,
    pendingTechnicianRequests,
    syncAdminData,
    updateTechnicianAccount,
    setTechnicianAccountActive,
    approveTechnicianSignupRequest,
    rejectTechnicianSignupRequest,
  } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<TechnicianAccountSummary | null>(null);
  const [form, setForm] = useState<EditFormState>({
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [adminPasswordForm, setAdminPasswordForm] = useState<AdminPasswordFormState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [adminPasswordError, setAdminPasswordError] = useState<string | null>(null);
  const [isSavingAdminPassword, setIsSavingAdminPassword] = useState(false);

  const runSync = useCallback(async () => {
    setIsRefreshing(true);
    setSyncError(null);
    try {
      await syncAdminData();
      setLastSyncedAt(new Date().toLocaleTimeString());
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Unable to refresh technician account data.');
    } finally {
      setIsRefreshing(false);
    }
  }, [syncAdminData]);

  useEffect(() => {
    void runSync();
  }, [runSync]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleAdminRefresh = () => {
      void runSync();
    };

    window.addEventListener('dispatchiq:admin-refresh', handleAdminRefresh);
    return () => {
      window.removeEventListener('dispatchiq:admin-refresh', handleAdminRefresh);
    };
  }, [runSync]);

  const activeCount = technicianAccounts.filter((item) => item.isActive).length;
  const pendingCount = pendingTechnicianRequests.length;
  const hasSearchQuery = searchQuery.trim().length > 0;
  const syncStatusLabel = isRefreshing ? 'Syncing data...' : syncError ? 'Sync failed' : 'Data synced';

  const filteredAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return technicianAccounts;
    }

    return technicianAccounts.filter((account) =>
      account.name.toLowerCase().includes(query)
      || account.email.toLowerCase().includes(query)
      || (account.phone ?? '').toLowerCase().includes(query)
    );
  }, [searchQuery, technicianAccounts]);

  const filteredPendingRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return pendingTechnicianRequests;
    }

    return pendingTechnicianRequests.filter((request) =>
      request.name.toLowerCase().includes(query)
      || request.email.toLowerCase().includes(query)
      || (request.phone ?? '').toLowerCase().includes(query)
    );
  }, [pendingTechnicianRequests, searchQuery]);

  const openEditDialog = (account: TechnicianAccountSummary) => {
    setSelectedAccount(account);
    setForm({
      name: account.name,
      email: account.email,
      phone: account.phone ?? '',
      password: '',
    });
    setFormError(null);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedAccount) {
      return;
    }

    setFormError(null);
    setIsSaving(true);

    try {
      await updateTechnicianAccount(selectedAccount.id, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password || undefined,
      });
      await runSync();
      setEditDialogOpen(false);
      setSelectedAccount(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save account changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (account: TechnicianAccountSummary) => {
    const nextState = !account.isActive;
    const message = nextState
      ? `Activate ${account.name}'s account?`
      : `Deactivate ${account.name}'s account?`;

    if (!window.confirm(message)) {
      return;
    }

    try {
      await setTechnicianAccountActive(account.id, nextState);
      await runSync();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to update account status.');
    }
  };

  const handleApproveRequest = async (request: TechnicianSignupRequestSummary) => {
    if (!window.confirm(`Approve signup request for ${request.name}?`)) {
      return;
    }

    try {
      await approveTechnicianSignupRequest(request.id);
      await runSync();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to approve signup request.');
    }
  };

  const handleRejectRequest = async (request: TechnicianSignupRequestSummary) => {
    if (!window.confirm(`Reject signup request for ${request.name}?`)) {
      return;
    }

    try {
      await rejectTechnicianSignupRequest(request.id);
      await runSync();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to reject signup request.');
    }
  };

  const handleSaveAdminPassword = async () => {
    const adminToken = getStoredAdminToken();
    if (!adminToken) {
      setAdminPasswordError('Admin session is required to update the admin password.');
      return;
    }

    const currentPassword = adminPasswordForm.currentPassword.trim();
    const newPassword = adminPasswordForm.newPassword.trim();
    const confirmPassword = adminPasswordForm.confirmPassword.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setAdminPasswordError('All password fields are required.');
      return;
    }
    if (newPassword.length < 6) {
      setAdminPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setAdminPasswordError('New password and confirmation do not match.');
      return;
    }

    setIsSavingAdminPassword(true);
    setAdminPasswordError(null);

    try {
      await updateAdminPassword(adminToken, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setAdminPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      window.alert('Admin password updated successfully.');
    } catch (error) {
      setAdminPasswordError(error instanceof Error ? error.message : 'Unable to update admin password.');
    } finally {
      setIsSavingAdminPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Technician Accounts</h1>
          <p className="text-sm text-gray-500 font-medium">
            Admin-only account management for technician sign-in access and admin password changes.
          </p>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { void runSync(); }}
            disabled={isRefreshing}
            className="h-9 gap-2 self-start md:self-auto"
          >
            <RefreshCw className={isRefreshing ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
            Refresh
          </Button>
          <div className="grid grid-cols-3 gap-3 md:w-[620px]">
            <Card className="border-border/60 bg-card/80 p-3 shadow-sm backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Total Accounts</p>
              <p className="mt-2 text-xl font-bold text-foreground">{technicianAccounts.length}</p>
            </Card>
            <Card className="border-border/60 bg-card/80 p-3 shadow-sm backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Active</p>
              <p className="mt-2 text-xl font-bold text-emerald-700">{activeCount}</p>
            </Card>
            <Card className="border-border/60 bg-card/80 p-3 shadow-sm backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Pending Requests</p>
              <p className="mt-2 text-xl font-bold text-amber-700">{pendingCount}</p>
            </Card>
          </div>
        </div>
      </div>

      <Card className="border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={
              isRefreshing
                ? 'border-blue-200 text-blue-700 bg-blue-50'
                : syncError
                  ? 'border-red-200 text-red-700 bg-red-50'
                  : 'border-emerald-200 text-emerald-700 bg-emerald-50'
            }
          >
            {isRefreshing ? 'Syncing data...' : syncError ? 'Sync failed' : 'Data synced'}
          </Badge>
          <Badge variant="outline" className="border-gray-200 text-gray-600">
            Showing {filteredAccounts.length} accounts • {filteredPendingRequests.length} pending
          </Badge>
          {lastSyncedAt ? (
            <span className="text-xs text-muted-foreground">Last synced at {lastSyncedAt}</span>
          ) : null}
          {hasSearchQuery ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery('')}
              className="h-7 px-2 text-muted-foreground"
            >
              Clear search
            </Button>
          ) : null}
          {syncError ? (
            <>
              <span className="text-xs text-red-600">{syncError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { void runSync(); }}
                disabled={isRefreshing}
                className="h-7 px-2"
              >
                Retry Sync
              </Button>
            </>
          ) : null}
        </div>
      </Card>

      <Card className="border-border/60 bg-card/80 shadow-sm backdrop-blur">
        <div className="px-6 py-4 border-b border-border/60 bg-muted/30">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-slate-700" />
            Admin Password
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Change the admin sign-in password from the Tech Accounts page.
          </p>
        </div>
        <div className="grid gap-4 px-6 py-5 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="admin-current-password">Current Password</Label>
            <Input
              id="admin-current-password"
              type="password"
              autoComplete="current-password"
              value={adminPasswordForm.currentPassword}
              onChange={(event) => setAdminPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-new-password">New Password</Label>
            <Input
              id="admin-new-password"
              type="password"
              autoComplete="new-password"
              value={adminPasswordForm.newPassword}
              onChange={(event) => setAdminPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-confirm-password">Confirm Password</Label>
            <Input
              id="admin-confirm-password"
              type="password"
              autoComplete="new-password"
              value={adminPasswordForm.confirmPassword}
              onChange={(event) => setAdminPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
            />
          </div>
        </div>
        <div className="px-6 pb-4">
          <p className="text-xs text-gray-500">
            This updates the password used for the admin login at `/admin/login`.
          </p>
          {adminPasswordError ? (
            <p className="mt-2 text-sm text-red-600">{adminPasswordError}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-background/40 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setAdminPasswordForm({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
              });
              setAdminPasswordError(null);
            }}
            disabled={isSavingAdminPassword}
          >
            Clear
          </Button>
          <Button
            type="button"
            onClick={() => void handleSaveAdminPassword()}
            disabled={isSavingAdminPassword}
            className="bg-[#2F8E92] hover:bg-[#27797d]"
          >
            <KeyRound className="w-4 h-4 mr-1" />
            {isSavingAdminPassword ? 'Updating...' : 'Update Admin Password'}
          </Button>
        </div>
      </Card>

      <Card className="border-border/60 bg-card/80 shadow-sm backdrop-blur">
        <div className="px-6 py-4 border-b border-border/60 bg-amber-50/40">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-amber-600" />
            Pending Signup Requests
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 border border-amber-200">
              {filteredPendingRequests.length}
            </Badge>
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Approve requests to create technician accounts and allow login.
          </p>
        </div>
        <Table className="table-fixed">
          <TableHeader className="bg-muted/30 backdrop-blur">
            <TableRow>
              <TableHead className="pl-6 w-[220px]">Technician</TableHead>
              <TableHead className="w-[260px]">Contact</TableHead>
              <TableHead className="w-[220px]">Requested At</TableHead>
              <TableHead className="text-right pr-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPendingRequests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-28 text-center text-sm text-gray-500">
                  {hasSearchQuery ? 'No pending signup requests match your search.' : 'No pending signup requests.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredPendingRequests.map((request) => (
                <TableRow key={request.id} className="hover:bg-muted/20">
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                        <UserPlus className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{request.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{request.id}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="text-sm text-gray-700 flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        <span>{request.email}</span>
                      </div>
                      <div className="text-sm text-gray-600 flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <span>{request.phone ? formatPhoneForDisplay(request.phone) : 'Not set'}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-gray-700 flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>{formatDateTime(request.requestedAt)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="pr-6">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => handleApproveRequest(request)}
                        disabled={isRefreshing}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRejectRequest(request)}
                        disabled={isRefreshing}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="border-border/60 bg-card/80 shadow-sm backdrop-blur">
        <div className="px-6 py-4 border-b border-border/60 bg-[#f6fbfb]">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <UserCog className="w-4 h-4 text-[#2F8E92]" />
            Active Technician Accounts
            <Badge variant="secondary" className="bg-[#e8f4f5] text-[#2F8E92] border border-[#cde7e9]">
              {filteredAccounts.length}
            </Badge>
          </h2>
        </div>
        <Table className="table-fixed">
          <TableHeader className="bg-muted/30 backdrop-blur">
            <TableRow>
              <TableHead className="pl-6 w-[220px]">Account</TableHead>
              <TableHead className="w-[260px]">Contact</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[220px]">Last Updated</TableHead>
              <TableHead className="text-right pr-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAccounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-40 text-center text-sm text-gray-500">
                  {hasSearchQuery ? 'No technician accounts match your search.' : 'No technician accounts available yet.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredAccounts.map((account) => (
                <TableRow key={account.id} className="hover:bg-muted/20">
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#e8f4f5] text-[#2F8E92] flex items-center justify-center">
                        <UserCog className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{account.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{account.id}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="text-sm text-gray-700 flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        <span>{account.email}</span>
                      </div>
                      <div className="text-sm text-gray-600 flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <span>{account.phone ? formatPhoneForDisplay(account.phone) : 'Not set'}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {account.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500 border-gray-300">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-gray-700 flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>{formatDateTime(account.updatedAt)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="pr-6">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(account)}>
                        <Pencil className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={account.isActive ? 'destructive' : 'default'}
                        onClick={() => handleToggleActive(account)}
                        className={!account.isActive ? 'bg-emerald-600 hover:bg-emerald-700' : undefined}
                        disabled={isRefreshing}
                      >
                        {account.isActive ? <ShieldOff className="w-4 h-4 mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
                        {account.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Technician Account</DialogTitle>
            <DialogDescription>Update profile details or set a new password for this account.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="tech-account-name">Full Name</Label>
              <Input
                id="tech-account-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tech-account-email">Email</Label>
              <Input
                id="tech-account-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tech-account-phone">Phone</Label>
              <Input
                id="tech-account-phone"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: formatUsPhoneInput(event.target.value) }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tech-account-password">New Password (optional)</Label>
              <Input
                id="tech-account-password"
                type="password"
                placeholder="Leave blank to keep current password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </div>

            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isSaving} className="bg-[#2F8E92] hover:bg-[#27797d]">
              <Power className="w-4 h-4 mr-1" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

