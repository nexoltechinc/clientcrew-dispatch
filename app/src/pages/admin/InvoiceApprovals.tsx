import { useEffect, useMemo, useState } from 'react';
import {
    CheckCircle2,
    Save,
    Plus,
    Trash2,
    Download,
    Filter,
    RefreshCw,
    Search,
    ShieldAlert,
    User,
    ChevronRight,
    DollarSign,
    AlertTriangle,
    Pencil,
    X,
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ColumnExportDialog from '@/components/modals/ColumnExportDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import {
    createInvoice,
    fetchServicesCatalog,
    savePendingInvoiceApprovalDraft,
    fetchPendingInvoiceApprovalIssues,
    fetchPendingInvoiceApprovals,
    getStoredAdminToken,
    type BackendPendingInvoiceApprovalIssue,
    type BackendPendingInvoiceApproval,
} from '@/lib/backend-api';

const INVOICE_APPROVAL_EXPORT_COLUMNS = [
    'JobCode',
    'Customer',
    'Technician',
    'Service',
    'Vehicle',
    'CompletedAt',
    'EstimatedTotal',
    'InvoiceState',
];

type PendingInvoice = BackendPendingInvoiceApproval;
type BlockedInvoice = BackendPendingInvoiceApprovalIssue;
type EditableServiceLine = {
    id: string;
    name: string;
    qb_item_id?: string | null;
    quantity: number;
    price: number;
};
type ServiceCatalogOption = {
    name: string;
    default_price: number;
    qb_item_id?: string | null;
};

const QUEBEC_GST_RATE = 0.05;
const QUEBEC_QST_RATE = 0.09975;
const QUEBEC_TOTAL_TAX_RATE = QUEBEC_GST_RATE + QUEBEC_QST_RATE;

const toNumber = (value: string | number | null | undefined): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

function StatusBadge({ status }: { status: string }) {
    if (status === 'creating') {
        return (
            <Badge variant="outline" className="animate-pulse border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                Generating...
            </Badge>
        );
    }
    return (
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
            Needs Approval
        </Badge>
    );
}

export default function InvoiceApprovalsPage() {
    const isMobile = useIsMobile();
    const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [blockedInvoices, setBlockedInvoices] = useState<BlockedInvoice[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterDealership, setFilterDealership] = useState<string>('all');
    const [filterTechnician, setFilterTechnician] = useState<string>('all');
    const [selectedInvoice, setSelectedInvoice] = useState<PendingInvoice | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [isEditingInvoice, setIsEditingInvoice] = useState(false);
    const [editableServices, setEditableServices] = useState<EditableServiceLine[]>([]);
    const [serviceSuggestions, setServiceSuggestions] = useState<string[]>([]);
    const [serviceCatalogOptions, setServiceCatalogOptions] = useState<ServiceCatalogOption[]>([]);

    const fetchInvoicesData = async () => {
        setLoading(true);
        try {
            const adminToken = getStoredAdminToken();
            if (!adminToken) {
                setInvoices([]);
                setBlockedInvoices([]);
                setServiceSuggestions([]);
                setServiceCatalogOptions([]);
                return;
            }
            const [rows, blockedRows, serviceRows] = await Promise.all([
                fetchPendingInvoiceApprovals(adminToken),
                fetchPendingInvoiceApprovalIssues(adminToken),
                fetchServicesCatalog(adminToken),
            ]);
            setInvoices(rows);
            setBlockedInvoices(blockedRows);
            const catalogOptions = serviceRows.map((service) => ({
                name: service.name.trim(),
                default_price: toNumber(service.default_price),
                qb_item_id: service.qb_item_id,
            })).filter((service) => service.name.length > 0);
            const nextSuggestions = Array.from(
                new Set(
                    catalogOptions
                        .map((service) => service.name.trim())
                        .filter((serviceName) => serviceName.length > 0),
                ),
            ).sort((a, b) => a.localeCompare(b));
            setServiceSuggestions(nextSuggestions);
            setServiceCatalogOptions(catalogOptions);
        } catch (error) {
            console.error(error);
            setInvoices([]);
            setBlockedInvoices([]);
            setServiceSuggestions([]);
            setServiceCatalogOptions([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchInvoicesData();
    }, []);

    const dealershipOptions = useMemo(() => Array.from(
        new Set(
            invoices
                .map((invoice) => invoice.dealership_name.trim())
                .filter((dealership) => dealership.length > 0),
        ),
    ).sort((a, b) => a.localeCompare(b)), [invoices]);

    const technicianOptions = useMemo(() => Array.from(
        new Set(
            invoices
                .map((invoice) => (invoice.technician_name || '').trim())
                .filter((technician) => technician.length > 0),
        ),
    ).sort((a, b) => a.localeCompare(b)), [invoices]);

    const hasActiveFilters = searchQuery.trim().length > 0 || filterDealership !== 'all' || filterTechnician !== 'all';

    const filteredInvoices = useMemo(() => invoices.filter((invoice) => {
        const query = searchQuery.toLowerCase().trim();
        const technicianName = invoice.technician_name || '';
        const matchesSearch =
            query.length === 0 ||
            invoice.job_code.toLowerCase().includes(query) ||
            invoice.dealership_name.toLowerCase().includes(query) ||
            technicianName.toLowerCase().includes(query) ||
            invoice.vehicle_summary.toLowerCase().includes(query) ||
            invoice.service_summary.toLowerCase().includes(query);
        const matchesDealership =
            filterDealership === 'all' ||
            invoice.dealership_name.toLowerCase() === filterDealership.toLowerCase();
        const matchesTechnician =
            filterTechnician === 'all' ||
            technicianName.toLowerCase() === filterTechnician.toLowerCase();
        return matchesSearch && matchesDealership && matchesTechnician;
    }), [filterDealership, filterTechnician, invoices, searchQuery]);

    const queueSummary = useMemo(() => {
        const customerNames = new Set<string>();
        let estimatedTotal = 0;

        filteredInvoices.forEach((invoice) => {
            const customerName = invoice.dealership_name.trim();
            if (customerName.length > 0) {
                customerNames.add(customerName);
            }
            estimatedTotal += toNumber(invoice.estimated_total);
        });

        return {
            visibleCount: filteredInvoices.length,
            totalCount: invoices.length,
            blockedCount: blockedInvoices.length,
            estimatedTotal,
            customerCount: customerNames.size,
        };
    }, [blockedInvoices, filteredInvoices, invoices]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setFilterDealership('all');
        setFilterTechnician('all');
    };

    const serviceNameOptions = useMemo(() => {
        const combined = [...serviceSuggestions, ...editableServices.map((service) => service.name)];
        return Array.from(new Set(combined.map((name) => name.trim()).filter((name) => name.length > 0)))
            .sort((a, b) => a.localeCompare(b));
    }, [editableServices, serviceSuggestions]);

    const handleOpenDrawer = (invoice: PendingInvoice) => {
        const defaultEditableServices = invoice.services.map((service) => ({
            id: service.id,
            name: service.name,
            qb_item_id: service.qb_item_id,
            quantity: toNumber(service.quantity),
            price: toNumber(service.price),
        }));
        const nextEditableServices = defaultEditableServices;
        setSelectedInvoice(invoice);
        setEditableServices(nextEditableServices);
        setIsEditingInvoice(false);
        setDrawerOpen(true);
    };

    const totals = useMemo(() => {
        if (!selectedInvoice) {
            return { subtotal: 0, gst: 0, qst: 0, tax: 0, total: 0 };
        }
        const subtotal = editableServices.reduce(
            (acc, service) => acc + Math.max(0, service.quantity) * Math.max(0, service.price),
            0,
        );
        const gst = subtotal * QUEBEC_GST_RATE;
        const qst = subtotal * QUEBEC_QST_RATE;
        const tax = subtotal * QUEBEC_TOTAL_TAX_RATE;
        const total = subtotal + tax;
        return { subtotal, gst, qst, tax, total };
    }, [editableServices, selectedInvoice]);

    const resetEditableServices = () => {
        if (!selectedInvoice) return;
        setEditableServices(selectedInvoice.services.map((service) => ({
            id: service.id,
            name: service.name,
            qb_item_id: service.qb_item_id,
            quantity: toNumber(service.quantity),
            price: toNumber(service.price),
        })));
    };

    const handleUpdateService = (serviceId: string, field: 'quantity' | 'price', rawValue: string) => {
        const parsedValue = Number(rawValue);
        const nextValue = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
        setEditableServices((prev) => prev.map((service) => (
            service.id === serviceId ? { ...service, [field]: nextValue } : service
        )));
    };

    const resolveCatalogOption = (value: string): ServiceCatalogOption | null => {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return null;
        const exact = serviceCatalogOptions.find((service) => service.name.toLowerCase() === normalized);
        if (exact) return exact;
        const startsWith = serviceCatalogOptions.filter((service) => service.name.toLowerCase().startsWith(normalized));
        return startsWith.length === 1 ? startsWith[0] : null;
    };

    const handleUpdateServiceName = (serviceId: string, rawValue: string) => {
        setEditableServices((prev) => prev.map((service) => {
            if (service.id !== serviceId) return service;

            const resolved = resolveCatalogOption(rawValue);
            if (!resolved) {
                return { ...service, name: rawValue };
            }
            const shouldAutofillPrice = service.price <= 0 || service.id.startsWith('manual-');
            return {
                ...service,
                name: resolved.name,
                qb_item_id: resolved.qb_item_id,
                price: shouldAutofillPrice ? resolved.default_price : service.price,
            };
        }));
    };

    const handleAddService = () => {
        const nextLine: EditableServiceLine = {
            id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: 'New Service',
            quantity: 1,
            price: 0,
        };
        setEditableServices((prev) => [...prev, nextLine]);
    };

    const handleDeleteService = (serviceId: string) => {
        setEditableServices((prev) => prev.filter((service) => service.id !== serviceId));
    };

    const handleSaveDraftEdits = () => {
        const run = async () => {
            if (!selectedInvoice) return;
            const adminToken = getStoredAdminToken();
            if (!adminToken) {
                alert('Admin session missing. Please login again.');
                return;
            }
            if (editableServices.length === 0) {
                alert('Invoice must include at least one service line.');
                return;
            }
            const hasMissingNames = editableServices.some((service) => service.name.trim().length === 0);
            if (hasMissingNames) {
                alert('All service lines must have a service name.');
                return;
            }
            const hasInvalidLines = editableServices.some((service) => service.quantity <= 0 || service.price <= 0);
            if (hasInvalidLines) {
                alert('All service quantities and prices must be greater than 0.');
                return;
            }

            setIsSavingDraft(true);
            try {
                const updated = await savePendingInvoiceApprovalDraft(adminToken, selectedInvoice.job_id, {
                    line_items: editableServices.map((service) => ({
                        product_service: service.name,
                        qb_item_id: service.qb_item_id,
                        quantity: service.quantity,
                        qty: service.quantity,
                        rate: service.price,
                        tax_code: 'GST_QST',
                    })),
                });

                setInvoices((prev) => prev.map((invoice) => (
                    invoice.job_id === updated.job_id ? updated : invoice
                )));
                setSelectedInvoice(updated);
                setEditableServices(updated.services.map((service) => ({
                    id: service.id,
                    name: service.name,
                    qb_item_id: service.qb_item_id,
                    quantity: toNumber(service.quantity),
                    price: toNumber(service.price),
                })));
                setIsEditingInvoice(false);
            } catch (error) {
                const detail = error instanceof Error ? error.message : 'Unable to save invoice draft.';
                alert(`Save failed: ${detail}`);
            } finally {
                setIsSavingDraft(false);
            }
        };
        void run();
    };

    const handleApprove = async () => {
        if (!selectedInvoice) return;
        const adminToken = getStoredAdminToken();
        if (!adminToken) {
            alert('Admin session missing. Please login again.');
            return;
        }
        if (editableServices.length === 0) {
            alert('Invoice must include at least one service line.');
            return;
        }
        const hasMissingNames = editableServices.some((service) => service.name.trim().length === 0);
        if (hasMissingNames) {
            alert('All service lines must have a service name.');
            return;
        }
        const hasInvalidLines = editableServices.some((service) => service.quantity <= 0 || service.price <= 0);
        if (hasInvalidLines) {
            alert('All service quantities and prices must be greater than 0.');
            return;
        }

        setIsApproving(true);
        setConfirmDialogOpen(false);
        try {
            await createInvoice(adminToken, {
                dispatch_job_ids: [selectedInvoice.job_id],
                replace_dispatch_line_items: true,
                line_items: editableServices.map((service) => ({
                    product_service: service.name,
                    qb_item_id: service.qb_item_id,
                    quantity: service.quantity,
                    qty: service.quantity,
                    rate: service.price,
                    tax_code: 'GST_QST',
                })),
                status: 'sent',
                terms: 'NET_15',
                shipping: 0,
            });

            setInvoices((prev) => prev.filter((inv) => inv.job_id !== selectedInvoice.job_id));
            setBlockedInvoices((prev) => prev.filter((inv) => inv.job_id !== selectedInvoice.job_id));
            setDrawerOpen(false);
            setSelectedInvoice(null);
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unable to approve invoice.';
            alert(`Invoice approval failed: ${detail}`);
        } finally {
            setIsApproving(false);
        }
    };

    const getInvoiceApprovalExportRows = () => filteredInvoices.map((invoice) => ({
        JobCode: invoice.job_code,
        Customer: invoice.dealership_name,
        Technician: invoice.technician_name || '',
        Service: invoice.service_summary,
        Vehicle: invoice.vehicle_summary,
        CompletedAt: invoice.completed_at || '',
        EstimatedTotal: toNumber(invoice.estimated_total),
        InvoiceState: invoice.invoice_state,
    }));

    const handleExport = (selectedColumns: string[], format: ExportFormat = 'csv') => {
        const exportData = selectColumnsForExport(getInvoiceApprovalExportRows(), selectedColumns);
        exportArrayData(exportData, 'invoice_approvals_export', format);
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Invoice Approvals</h1>
                    <p className="text-sm font-medium text-muted-foreground">Review pricing and approve invoice creation</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <div className="mr-2 hidden items-center text-xs font-medium text-muted-foreground sm:flex">
                        Last updated: {new Date().toLocaleTimeString()}
                    </div>
                    <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => void fetchInvoicesData()}>
                        <RefreshCw className={cn('h-4 w-4 text-muted-foreground', loading && 'animate-spin')} />
                        Refresh
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setExportModalOpen(true)}>
                        <Download className="h-4 w-4 text-muted-foreground" />
                        Export CSV
                    </Button>
                </div>
            </div>

            <ColumnExportDialog
                open={exportModalOpen}
                onOpenChange={setExportModalOpen}
                title="Export Invoice Approvals"
                description="Select the pending-approval columns you want in your CSV."
                availableColumns={INVOICE_APPROVAL_EXPORT_COLUMNS}
                onConfirm={handleExport}
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pending approvals</p>
                    <div className="mt-3 flex items-end justify-between gap-4">
                        <div>
                            <p className="text-3xl font-bold text-foreground">{queueSummary.visibleCount}</p>
                            <p className="text-xs text-muted-foreground">{queueSummary.totalCount} total jobs in queue</p>
                        </div>
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                            Needs review
                        </Badge>
                    </div>
                </Card>

                <Card className="border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Estimated value</p>
                    <div className="mt-3 flex items-end justify-between gap-4">
                        <div>
                            <p className="text-3xl font-bold text-foreground">${queueSummary.estimatedTotal.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">Across the current filtered queue</p>
                        </div>
                        <DollarSign className="h-5 w-5 text-emerald-300" />
                    </div>
                </Card>

                <Card className="border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Customers involved</p>
                    <div className="mt-3 flex items-end justify-between gap-4">
                        <div>
                            <p className="text-3xl font-bold text-foreground">{queueSummary.customerCount}</p>
                            <p className="text-xs text-muted-foreground">Unique dealerships in view</p>
                        </div>
                        <User className="h-5 w-5 text-cyan-300" />
                    </div>
                </Card>

                <Card className="border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Blocked jobs</p>
                    <div className="mt-3 flex items-end justify-between gap-4">
                        <div>
                            <p className="text-3xl font-bold text-foreground">{queueSummary.blockedCount}</p>
                            <p className="text-xs text-muted-foreground">Need data fixes before invoicing</p>
                        </div>
                        <ShieldAlert className="h-5 w-5 text-amber-300" />
                    </div>
                </Card>
            </div>

            <Card className="space-y-4 border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                    <div className="relative min-w-0">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search by Job Code, Customer, or VIN..."
                            className="border-border/60 bg-background/60 pl-9 text-foreground transition-all placeholder:text-muted-foreground focus:bg-background"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={filterDealership} onValueChange={setFilterDealership}>
                            <SelectTrigger className="w-full border-dashed border-border/60 bg-background/60 text-foreground sm:w-[170px]">
                                <div className="flex items-center gap-2">
                                    <Filter className="w-4 h-4" />
                                    <SelectValue placeholder="Customer" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Customer</SelectItem>
                                {dealershipOptions.map((dealership) => (
                                    <SelectItem key={dealership} value={dealership}>
                                        {dealership}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterTechnician} onValueChange={setFilterTechnician}>
                            <SelectTrigger className="w-full border-dashed border-border/60 bg-background/60 text-foreground sm:w-[160px]">
                                <div className="flex items-center gap-2">
                                    <User className="w-4 h-4" />
                                    <SelectValue placeholder="Technician" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Technician</SelectItem>
                                {technicianOptions.map((technician) => (
                                    <SelectItem key={technician} value={technician}>
                                        {technician}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                            Pending Queue ({queueSummary.visibleCount})
                        </Badge>
                        <Button
                            variant="ghost"
                            className="text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            onClick={handleClearFilters}
                            disabled={!hasActiveFilters}
                        >
                            Clear filters
                        </Button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className="border-border/60 bg-background/60 text-muted-foreground">
                        Showing {queueSummary.visibleCount} of {queueSummary.totalCount} jobs
                    </Badge>
                    <Badge variant="outline" className="border-border/60 bg-background/60 text-muted-foreground">
                        {queueSummary.blockedCount} blocked
                    </Badge>
                    <Badge variant="outline" className="border-border/60 bg-background/60 text-muted-foreground">
                        {queueSummary.customerCount} customers
                    </Badge>
                </div>
            </Card>

            <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-sm">
                {loading ? (
                    <div className="p-4 space-y-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                        ))}
                    </div>
                ) : filteredInvoices.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center py-20 text-muted-foreground">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/40">
                            <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">No invoices found</h3>
                        <p className="text-sm mt-1 max-w-sm text-center">
                            {blockedInvoices.length > 0
                                ? 'Completed jobs exist, but they are blocked from invoice approval until required data is fixed.'
                                : 'Try adjusting your search or filters.'}
                        </p>
                        <Button
                            variant="outline"
                            className="mt-4"
                            onClick={handleClearFilters}
                        >
                            Clear filters
                        </Button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                    <Table className="table-fixed">
                        <TableHeader className="sticky top-0 z-10 bg-muted/30 backdrop-blur">
                            <TableRow>
                                <TableHead className="w-[160px] pl-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Job Code</TableHead>
                                <TableHead className="w-[210px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer</TableHead>
                                <TableHead className="w-[180px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">Technician</TableHead>
                                <TableHead className="hidden lg:table-cell w-[140px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completed At</TableHead>
                                <TableHead className="hidden xl:table-cell w-[260px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">Service</TableHead>
                                <TableHead className="w-[120px] text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Est. Total</TableHead>
                                <TableHead className="w-[130px] text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                                <TableHead className="w-[120px] text-right pr-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredInvoices.map((inv) => (
                                <TableRow
                                    key={inv.job_id}
                                    className="group cursor-pointer border-border/40 transition-colors hover:bg-muted/20"
                                    onClick={() => handleOpenDrawer(inv)}
                                >
                                    <TableCell className="pl-6 align-top font-medium text-foreground group-hover:text-cyan-300">
                                        <div className="space-y-1">
                                            <div>{inv.job_code}</div>
                                            <div className="text-xs text-muted-foreground">{inv.vehicle_summary}</div>
                                            <div className="text-xs text-cyan-200/80 xl:hidden">{inv.service_summary}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="align-top text-muted-foreground">
                                        <div className="space-y-1">
                                            <div>{inv.dealership_name}</div>
                                            <div className="text-xs text-muted-foreground sm:hidden">{inv.service_summary}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-300">
                                                {inv.technician_name?.substring(0, 2) || 'NA'}
                                            </div>
                                            <span className="text-sm text-foreground">{inv.technician_name || 'Unassigned'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell align-top font-mono text-xs text-muted-foreground">
                                        {inv.completed_at ? new Date(inv.completed_at).toLocaleDateString() : '-'}
                                    </TableCell>
                                    <TableCell className="hidden xl:table-cell align-top max-w-[260px] truncate text-muted-foreground" title={inv.service_summary}>
                                        {inv.service_summary}
                                    </TableCell>
                                    <TableCell className="align-top text-right font-mono font-medium text-foreground">${toNumber(inv.estimated_total).toFixed(2)}</TableCell>
                                    <TableCell className="align-top text-center">
                                        <StatusBadge status={inv.invoice_state} />
                                    </TableCell>
                                    <TableCell className="align-top text-right pr-6">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-1.5 border-border/60 bg-background/60 text-foreground hover:bg-muted/40"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                handleOpenDrawer(inv);
                                            }}
                                        >
                                            Review
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    </div>
                )}
            </div>

            {blockedInvoices.length > 0 && (
                <Card className="space-y-4 border-amber-500/20 bg-amber-500/8 p-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-full bg-amber-500/15 p-2">
                            <AlertTriangle className="h-4 w-4 text-amber-300" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">Blocked Invoice Jobs</h2>
                            <p className="text-sm text-muted-foreground">
                                These completed jobs are not shown in the approval queue because required invoice data is missing.
                            </p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {blockedInvoices.map((invoice) => (
                            <div key={invoice.job_id} className="rounded-lg border border-amber-500/20 bg-background/70 p-4">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <p className="font-semibold text-foreground">{invoice.job_code}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {invoice.dealership_name} {invoice.technician_name ? `• ${invoice.technician_name}` : ''}
                                        </p>
                                        <p className="text-sm text-muted-foreground">{invoice.service_summary}</p>
                                    </div>
                                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                                        Blocked
                                    </Badge>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {invoice.blocking_reasons.map((reason) => (
                                        <Badge key={`${invoice.job_id}-${reason}`} variant="outline" className="border-red-500/30 bg-red-500/10 text-red-300">
                                            {reason}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetContent className="flex w-full flex-col gap-0 overflow-hidden border-l border-border/60 bg-[#07101f] p-0 text-foreground shadow-2xl sm:max-w-xl">
                    {selectedInvoice && (
                        <>
                            <div className="border-b border-border/60 bg-slate-950/80 p-6 backdrop-blur">
                                <SheetHeader>
                                    <div className="flex items-center justify-between mb-2">
                                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                                            Pending Approval
                                        </Badge>
                                        <span className="text-xs font-mono text-muted-foreground">ID: {selectedInvoice.job_id}</span>
                                    </div>
                                    <SheetTitle className="text-xl font-bold text-foreground">Invoice Preview - {selectedInvoice.job_code}</SheetTitle>
                                    <SheetDescription className="text-sm text-muted-foreground">
                                        Review and approve services for invoice generation.
                                    </SheetDescription>
                                </SheetHeader>
                            </div>

                            <ScrollArea className="flex-1">
                                <div className="p-6 space-y-8">
                                    <section className="grid grid-cols-2 gap-4 rounded-xl border border-cyan-500/15 bg-slate-900/80 p-4 shadow-[0_0_0_1px_rgba(34,211,238,0.04)]">
                                        <div>
                                            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Customer</h4>
                                            <div className="font-medium text-slate-100">{selectedInvoice.dealership_name}</div>
                                        </div>
                                        <div>
                                            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Vehicle</h4>
                                            <div className="font-medium text-slate-100">{selectedInvoice.vehicle_summary}</div>
                                        </div>
                                        <div>
                                            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Technician</h4>
                                            <div className="font-medium text-slate-100">{selectedInvoice.technician_name || 'Unassigned'}</div>
                                        </div>
                                        <div>
                                            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Completed</h4>
                                            <div className="font-medium text-slate-100">
                                                {selectedInvoice.completed_at ? new Date(selectedInvoice.completed_at).toLocaleDateString() : '-'}
                                            </div>
                                        </div>
                                    </section>

                                    <section>
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                                                <DollarSign className="h-4 w-4 text-cyan-300" /> Billable Items
                                            </h3>
                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                                <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-200">
                                                    GST 5% + QST 9.975%
                                                </Badge>
                                                {!isEditingInvoice ? (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 gap-2 border-cyan-500/40 bg-transparent text-cyan-200 hover:bg-cyan-500/10"
                                                        onClick={() => setIsEditingInvoice(true)}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                        Edit
                                                    </Button>
                                                ) : (
                                                    <>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 gap-2 border-border/60 bg-transparent text-slate-200 hover:bg-slate-900"
                                                            onClick={() => {
                                                                resetEditableServices();
                                                                setIsEditingInvoice(false);
                                                            }}
                                                        >
                                                            <X className="h-3.5 w-3.5" />
                                                            Cancel Edit
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            className="h-8 gap-2 bg-[#2F8E92] text-white hover:bg-[#267276]"
                                                            onClick={handleSaveDraftEdits}
                                                            disabled={isSavingDraft}
                                                        >
                                                            <Save className="h-3.5 w-3.5" />
                                                            {isSavingDraft ? 'Saving...' : 'Save'}
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="overflow-hidden rounded-xl border border-border/60 bg-slate-950/70">
                                            {isEditingInvoice && isMobile ? (
                                                <div className="space-y-3 p-3">
                                                    {editableServices.map((item) => (
                                                        <div key={item.id} className="rounded-lg border border-border/60 bg-slate-900/70 p-3">
                                                            <div className="mb-2">
                                                                <Label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Service</Label>
                                                                <Input
                                                                    className="h-8 border-border/60 bg-slate-900 text-slate-100"
                                                                    value={item.name}
                                                                    list="invoice-service-suggestions"
                                                                    onChange={(e) => handleUpdateServiceName(item.id, e.target.value)}
                                                                    placeholder="Service name"
                                                                />
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <Label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Qty</Label>
                                                                    <Input
                                                                        type="number"
                                                                        min="0"
                                                                        step="0.01"
                                                                        className="h-8 border-border/60 bg-slate-900 text-right text-slate-100"
                                                                        value={item.quantity}
                                                                        onChange={(e) => handleUpdateService(item.id, 'quantity', e.target.value)}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <Label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Price</Label>
                                                                    <Input
                                                                        type="number"
                                                                        min="0"
                                                                        step="0.01"
                                                                        className="h-8 border-border/60 bg-slate-900 text-right text-slate-100"
                                                                        value={item.price}
                                                                        onChange={(e) => handleUpdateService(item.id, 'price', e.target.value)}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="mt-3 flex items-center justify-between">
                                                                <span className="text-xs uppercase tracking-wide text-slate-400">Line Total</span>
                                                                <span className="font-mono text-sm text-cyan-200">${(item.quantity * item.price).toFixed(2)}</span>
                                                            </div>
                                                            <div className="mt-2 flex justify-end">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-8 gap-1 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                                                    onClick={() => handleDeleteService(item.id)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                    Delete
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <Table className="table-fixed">
                                                    <TableHeader className="bg-slate-900/90">
                                                        <TableRow>
                                                            <TableHead className={cn('h-10 text-xs font-semibold text-slate-300', isEditingInvoice ? 'w-[28%]' : 'w-[48%]')}>
                                                                Service
                                                            </TableHead>
                                                            <TableHead className="h-10 w-[14%] text-center text-xs font-semibold text-slate-300">Qty</TableHead>
                                                            <TableHead className="h-10 w-[14%] text-right text-xs font-semibold text-slate-300">Price</TableHead>
                                                            <TableHead className="h-10 w-[14%] text-right text-xs font-semibold text-slate-300">Total</TableHead>
                                                            {isEditingInvoice && <TableHead className="h-10 w-[6%] text-right text-xs font-semibold text-slate-300">Del</TableHead>}
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {editableServices.map((item) => (
                                                            <TableRow key={item.id} className="border-border/50">
                                                                <TableCell className="align-middle py-3 text-sm text-slate-100">
                                                                    {isEditingInvoice ? (
                                                                        <Input
                                                                            className="h-8 border-border/60 bg-slate-900 text-slate-100"
                                                                            value={item.name}
                                                                            list="invoice-service-suggestions"
                                                                            onChange={(e) => handleUpdateServiceName(item.id, e.target.value)}
                                                                            placeholder="Service name"
                                                                        />
                                                                    ) : (
                                                                        <div>{item.name}</div>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="align-middle py-3 text-center text-sm text-slate-200">
                                                                    {isEditingInvoice ? (
                                                                        <Input
                                                                            type="number"
                                                                            min="0"
                                                                            step="0.01"
                                                                            className="ml-auto h-8 w-[88px] border-border/60 bg-slate-900 text-right text-slate-100"
                                                                            value={item.quantity}
                                                                            onChange={(e) => handleUpdateService(item.id, 'quantity', e.target.value)}
                                                                        />
                                                                    ) : (
                                                                        item.quantity.toFixed(2)
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="align-middle py-3 text-right text-sm text-slate-100">
                                                                    {isEditingInvoice ? (
                                                                        <Input
                                                                            type="number"
                                                                            min="0"
                                                                            step="0.01"
                                                                            className="ml-auto h-8 w-[96px] border-border/60 bg-slate-900 text-right text-slate-100"
                                                                            value={item.price}
                                                                            onChange={(e) => handleUpdateService(item.id, 'price', e.target.value)}
                                                                        />
                                                                    ) : (
                                                                        `$${item.price.toFixed(2)}`
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="align-middle py-3 text-right font-mono text-sm text-cyan-200">
                                                                    ${(item.quantity * item.price).toFixed(2)}
                                                                </TableCell>
                                                                {isEditingInvoice && (
                                                                    <TableCell className="align-middle py-3 text-right">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-8 w-8 p-0 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                                                            onClick={() => handleDeleteService(item.id)}
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </TableCell>
                                                                )}
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            )}
                                            {isEditingInvoice && (
                                                <div className="border-t border-border/60 bg-slate-900/80 px-4 py-3">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 gap-2 border-cyan-500/40 bg-transparent text-cyan-200 hover:bg-cyan-500/10"
                                                        onClick={handleAddService}
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                        Add Service
                                                    </Button>
                                                </div>
                                            )}
                                            <datalist id="invoice-service-suggestions">
                                                {serviceNameOptions.map((name) => (
                                                    <option key={name} value={name} />
                                                ))}
                                            </datalist>
                                            <div className="space-y-2 border-t border-border/60 bg-slate-900/90 p-4">
                                                <div className="flex justify-between text-sm text-slate-300">
                                                    <span>Subtotal</span>
                                                    <span className="font-mono">${totals.subtotal.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm text-slate-300">
                                                    <span>GST (5%)</span>
                                                    <span className="font-mono">${totals.gst.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm text-slate-300">
                                                    <span>QST (9.975%)</span>
                                                    <span className="font-mono">${totals.qst.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm text-slate-300">
                                                    <span>Total Tax (14.975%)</span>
                                                    <span className="font-mono">${totals.tax.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between border-t border-border/60 pt-2 text-lg font-bold text-slate-50">
                                                    <span>Total</span>
                                                    <span className="font-mono text-cyan-200">${totals.total.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                </div>
                            </ScrollArea>

                            <div className="sticky bottom-0 z-20 border-t border-border/60 bg-slate-950/95 p-6 backdrop-blur">
                                <div className="flex gap-3">
                                    <Button variant="outline" className="flex-1 border-border/70 bg-transparent text-slate-200 hover:bg-slate-900 hover:text-white" onClick={() => setDrawerOpen(false)}>Cancel</Button>
                                    <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button className="flex-[2] bg-[#2F8E92] hover:bg-[#267276] text-white shadow-sm font-semibold">
                                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                                Approve & Generate
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="border-border/60 bg-slate-950 text-foreground">
                                            <DialogHeader>
                                                <DialogTitle className="flex items-center gap-2 text-foreground">
                                                    <ShieldAlert className="h-5 w-5 text-amber-300" /> Confirm Invoice Generation
                                                </DialogTitle>
                                                <DialogDescription className="pt-2 text-muted-foreground">
                                                    This will immediately create an invoice for <strong>{selectedInvoice.job_code}</strong> with a total of <strong>${totals.total.toFixed(2)}</strong>.
                                                    <br /><br />
                                                    This action cannot be undone from the portal. Are you sure?
                                                </DialogDescription>
                                            </DialogHeader>
                                            <DialogFooter className="mt-4">
                                                <Button variant="outline" className="border-border/70 bg-transparent text-slate-200 hover:bg-slate-900 hover:text-white" onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
                                                <Button onClick={() => void handleApprove()} disabled={isApproving} className="bg-[#2F8E92] hover:bg-[#267276]">
                                                    {isApproving ? 'Processing...' : 'Yes, Create Invoice'}
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
