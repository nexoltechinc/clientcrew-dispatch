import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Download,
  Briefcase,
  CheckCircle2,
  Users,
  DollarSign,
  FileWarning,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { exportArrayData } from '@/lib/export';
import {
  fetchAdminReportsOverview,
  getStoredAdminToken,
  type BackendDispatchStatusRow,
  type BackendInvoiceStatusRow,
  type BackendReportsOverview,
} from '@/lib/backend-api';

type QuickRange = 'last_7_days' | 'last_30_days' | 'this_month';
const ADMIN_REFRESH_EVENT = 'sm-dispatch:admin-refresh';

const QUICK_RANGE_LABEL: Record<QuickRange, string> = {
  last_7_days: 'Last Week',
  last_30_days: 'Last 30 Days',
  this_month: 'This Month',
};

const numberFmt = new Intl.NumberFormat('en-US');
const percentFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function toDateInputValue(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateInput(value: string): Date {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function resolveQuickRange(range: QuickRange): { fromDate: string; toDate: string } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(0, 0, 0, 0);

  const from = new Date(to);
  if (range === 'last_7_days') {
    from.setDate(to.getDate() - 7);
  } else if (range === 'last_30_days') {
    from.setDate(to.getDate() - 30);
  } else {
    from.setDate(1);
  }

  return {
    fromDate: toDateInputValue(from),
    toDate: toDateInputValue(to),
  };
}

function statusBadgeTone(row: BackendInvoiceStatusRow): string {
  if (row.is_critical) {
    return 'bg-orange-50 border-orange-200 text-orange-700';
  }
  if (row.state.toLowerCase() === 'paid' || row.state.toLowerCase() === 'verified') {
    return 'bg-emerald-50 border-emerald-200 text-emerald-700';
  }
  if (row.state.toLowerCase() === 'sent') {
    return 'bg-blue-50 border-blue-200 text-blue-700';
  }
  return 'bg-gray-50 border-gray-200 text-gray-700';
}

function dispatchBadgeTone(row: BackendDispatchStatusRow): string {
  if (row.status.toLowerCase() === 'completed') {
    return 'bg-emerald-50 border-emerald-200 text-emerald-700';
  }
  if (row.status.toLowerCase() === 'delayed') {
    return 'bg-orange-50 border-orange-200 text-orange-700';
  }
  if (row.status.toLowerCase() === 'cancelled') {
    return 'bg-red-50 border-red-200 text-red-700';
  }
  return 'bg-slate-50 border-slate-200 text-slate-700';
}

export default function ReportsPage() {
  const [quickRange, setQuickRange] = useState<QuickRange>('last_7_days');
  const [fromDate, setFromDate] = useState<string>(() => resolveQuickRange('last_7_days').fromDate);
  const [toDate, setToDate] = useState<string>(() => resolveQuickRange('last_7_days').toDate);
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [dealershipFilter, setDealershipFilter] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [overview, setOverview] = useState<BackendReportsOverview | null>(null);

  const fetchOverview = async (params: { fromDate: string; toDate: string }) => {
    setLoading(true);
    setError(null);
    try {
      const adminToken = getStoredAdminToken();
      if (!adminToken) {
        setOverview(null);
        setError('Admin session missing. Please login again.');
        return;
      }

      const payload = await fetchAdminReportsOverview(adminToken, {
        from_date: params.fromDate,
        to_date: params.toDate,
      });
      setOverview(payload);
      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load reports.';
      setError(message);
      setOverview(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOverview({ fromDate, toDate });
  }, []);

  const handleQuickRangeChange = (next: QuickRange) => {
    setQuickRange(next);
    const resolved = resolveQuickRange(next);
    setFromDate(resolved.fromDate);
    setToDate(resolved.toDate);
    void fetchOverview(resolved);
  };

  const canRunRange = useMemo(() => {
    if (!fromDate || !toDate) return false;
    return parseDateInput(fromDate).getTime() <= parseDateInput(toDate).getTime();
  }, [fromDate, toDate]);

  const activeRangeLabel = useMemo(() => {
    if (!fromDate || !toDate) return '--';
    const from = parseDateInput(fromDate);
    const to = parseDateInput(toDate);
    return `${from.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [fromDate, toDate]);

  const handleRefresh = () => {
    if (!canRunRange) {
      setError('Start date must be on or before end date.');
      return;
    }
    void fetchOverview({ fromDate, toDate });
  };

  useEffect(() => {
    const handleAdminRefresh = () => {
      if (!canRunRange) {
        setError('Start date must be on or before end date.');
        return;
      }
      void fetchOverview({ fromDate, toDate });
    };

    window.addEventListener(ADMIN_REFRESH_EVENT, handleAdminRefresh);
    return () => {
      window.removeEventListener(ADMIN_REFRESH_EVENT, handleAdminRefresh);
    };
  }, [fromDate, toDate, canRunRange]);

  const handleExport = () => {
    if (!overview) return;

    const rows = [
      ...overview.dispatch_performance.map((row) => ({
        section: 'Dispatch Performance',
        label: row.status,
        count: row.count,
        amount: '',
        percentage: `${row.percentage}%`,
      })),
      ...overview.invoice_performance.map((row) => ({
        section: 'Invoice Performance',
        label: row.state,
        count: row.count,
        amount: row.total_amount,
        percentage: '',
      })),
      ...overview.technician_performance.map((row) => ({
        section: 'Technician Performance',
        label: row.name,
        count: row.jobs_completed,
        amount: row.revenue_generated,
        percentage: '',
      })),
      ...overview.dealership_performance.map((row) => ({
        section: 'Customer Performance',
        label: row.name,
        count: row.jobs_completed,
        amount: row.invoice_total,
        percentage: '',
      })),
    ];

    exportArrayData(rows, `reports_${fromDate}_${toDate}`, 'csv');
  };

  const filteredTechnicianRows = useMemo(() => {
    const rows = overview?.technician_performance ?? [];
    const query = technicianFilter.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(query));
  }, [overview, technicianFilter]);

  const filteredDealershipRows = useMemo(() => {
    const rows = overview?.dealership_performance ?? [];
    const query = dealershipFilter.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(query));
  }, [overview, dealershipFilter]);

  const kpis = overview?.kpis;

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Reports</h1>
            <p className="text-sm text-muted-foreground font-medium">Operational and financial performance overview</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-medium">
              {QUICK_RANGE_LABEL[quickRange]}
            </Badge>
            <span className="text-xs text-muted-foreground">Range: {activeRangeLabel}</span>
            <span className="text-xs text-muted-foreground">Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '--'}</span>
          </div>
        </div>

        <Card className="p-4 border-border/70 shadow-sm">
          <div className="grid grid-cols-1 xl:grid-cols-[170px_1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Quick range</p>
              <Select value={quickRange} onValueChange={(value) => handleQuickRangeChange(value as QuickRange)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_7_days">{QUICK_RANGE_LABEL.last_7_days}</SelectItem>
                  <SelectItem value="last_30_days">{QUICK_RANGE_LABEL.last_30_days}</SelectItem>
                  <SelectItem value="this_month">{QUICK_RANGE_LABEL.this_month}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Custom range</p>
              <div className="flex items-center gap-2 h-9 border border-border rounded-md px-2 bg-background">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="h-7 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="h-7 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                />
              </div>
            </div>

            <Button
              size="sm"
              className="h-9 bg-[#2F8E92] text-white hover:bg-[#267276]"
              onClick={handleRefresh}
              disabled={!canRunRange || loading}
            >
              {loading ? 'Applying...' : 'Apply Filters'}
            </Button>

            <Button variant="outline" size="sm" className="h-9 gap-2" onClick={handleExport} disabled={!overview || loading}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              onClick={handleRefresh}
              disabled={!canRunRange || loading}
              title="Refresh"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          {!canRunRange ? (
            <p className="mt-2 text-xs text-destructive">Start date must be on or before end date.</p>
          ) : null}
        </Card>
      </div>

      {error ? (
        <Card className="p-4 border-red-200 bg-red-50/80 text-red-700 text-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" className="border-red-200 text-red-700 hover:text-red-800" onClick={handleRefresh}>
              Retry
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card className="p-4 border-border/70 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Jobs Created</span>
            <Briefcase className="w-4 h-4" />
          </div>
          {loading ? <Skeleton className="h-8 w-20 mt-3" /> : <div className="mt-3 text-2xl font-bold">{numberFmt.format(kpis?.jobs_created ?? 0)}</div>}
        </Card>

        <Card className="p-4 border-border/70 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Jobs Completed</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          {loading ? <Skeleton className="h-8 w-20 mt-3" /> : <div className="mt-3 text-2xl font-bold">{numberFmt.format(kpis?.jobs_completed ?? 0)}</div>}
        </Card>

        <Card className="p-4 border-border/70 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Technician Utilization</span>
            <Users className="w-4 h-4" />
          </div>
          {loading ? <Skeleton className="h-8 w-20 mt-3" /> : <div className="mt-3 text-2xl font-bold">{percentFmt.format(kpis?.technician_utilization ?? 0)}%</div>}
        </Card>

        <Card className="p-4 border-border/70 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Invoice Total</span>
            <DollarSign className="w-4 h-4" />
          </div>
          {loading ? <Skeleton className="h-8 w-20 mt-3" /> : <div className="mt-3 text-2xl font-bold">{currencyFmt.format(kpis?.invoice_total ?? 0)}</div>}
        </Card>

        <Card className="p-4 border-border/70 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Pending Approvals</span>
            <FileWarning className="w-4 h-4" />
          </div>
          {loading ? <Skeleton className="h-8 w-20 mt-3" /> : <div className="mt-3 text-2xl font-bold">{numberFmt.format(kpis?.pending_approvals ?? 0)}</div>}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-5 border-border/70 shadow-sm">
          <h2 className="text-lg font-semibold">Dispatch Performance</h2>
          <p className="text-sm text-muted-foreground mb-4">Job status distribution for selected range</p>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : overview?.dispatch_performance.length ? (
            <div className="space-y-3">
              {overview.dispatch_performance.map((row) => (
                <div key={row.status} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={dispatchBadgeTone(row)}>{row.status}</Badge>
                      <span className="text-sm text-muted-foreground">{numberFmt.format(row.count)} jobs</span>
                    </div>
                    <span className="text-sm font-semibold">{percentFmt.format(row.percentage)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#2F8E92]"
                      style={{ width: `${Math.max(3, Math.min(100, row.percentage))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No dispatch records in selected period.</p>
          )}
        </Card>

        <Card className="p-5 border-border/70 shadow-sm">
          <h2 className="text-lg font-semibold">Invoice Performance</h2>
          <p className="text-sm text-muted-foreground mb-4">Invoicing lifecycle states</p>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : overview?.invoice_performance.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.invoice_performance.map((row) => (
                    <TableRow key={row.state}>
                      <TableCell>
                        <Badge variant="outline" className={statusBadgeTone(row)}>{row.state}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{numberFmt.format(row.count)}</TableCell>
                      <TableCell className="text-right font-medium">{currencyFmt.format(row.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No invoice records in selected period.</p>
          )}
        </Card>
      </div>

      <Card className="p-5 border-border/70 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Technician Performance</h2>
            <p className="text-xs text-muted-foreground">
              Showing {numberFmt.format(filteredTechnicianRows.length)} of {numberFmt.format(overview?.technician_performance.length ?? 0)}
            </p>
          </div>
          <Input
            value={technicianFilter}
            onChange={(event) => setTechnicianFilter(event.target.value)}
            placeholder="Filter technician..."
            className="h-9 lg:w-72"
          />
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filteredTechnicianRows.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Avg Time</TableHead>
                  <TableHead className="text-right">Delays</TableHead>
                  <TableHead className="text-right">Refusals</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTechnicianRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(row.jobs_assigned)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(row.jobs_completed)}</TableCell>
                    <TableCell className="text-right">{row.avg_completion_time}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(row.delays_count)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(row.refusals_count)}</TableCell>
                    <TableCell className="text-right font-medium">{currencyFmt.format(row.revenue_generated)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : overview?.technician_performance.length ? (
          <p className="text-sm text-muted-foreground">No technicians match the current filter.</p>
        ) : (
          <p className="text-sm text-muted-foreground">No technician records found.</p>
        )}
      </Card>

      <Card className="p-5 border-border/70 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Customer Overview</h2>
            <p className="text-xs text-muted-foreground">
              Showing {numberFmt.format(filteredDealershipRows.length)} of {numberFmt.format(overview?.dealership_performance.length ?? 0)}
            </p>
          </div>
          <Input
            value={dealershipFilter}
            onChange={(event) => setDealershipFilter(event.target.value)}
            placeholder="Filter customer..."
            className="h-9 lg:w-72"
          />
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filteredDealershipRows.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Avg Res. Time</TableHead>
                  <TableHead className="text-right">Flags</TableHead>
                  <TableHead className="text-right">Total Invoiced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDealershipRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(row.jobs_created)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(row.jobs_completed)}</TableCell>
                    <TableCell className="text-right">{row.avg_resolution_time}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(row.attention_flags)}</TableCell>
                    <TableCell className="text-right font-medium">{currencyFmt.format(row.invoice_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : overview?.dealership_performance.length ? (
          <p className="text-sm text-muted-foreground">No customers match the current filter.</p>
        ) : (
          <p className="text-sm text-muted-foreground">No customer records found.</p>
        )}
      </Card>
    </div>
  );
}
