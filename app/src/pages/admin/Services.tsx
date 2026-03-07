import { useState, useEffect, useCallback } from 'react';
import {
    Search,
    RefreshCw,
    Plus,
    MoreVertical,
    CheckCircle2,
    DollarSign,
    FileText,
    Archive,
    Trash2,
    Edit2,
    Info,
    FileDown
} from 'lucide-react';
import { exportArrayData, selectColumnsForExport, type ExportFormat } from '@/lib/export';
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import ColumnExportDialog from '@/components/modals/ColumnExportDialog';
import { useAuth } from '@/contexts/AuthContext';
import { HARDCODED_SERVICE_SEED } from '@/data/hardcoded-services';
import {
    createAdminService,
    fetchAdminServices,
    getStoredAdminToken,
    updateAdminService,
    updateAdminServiceStatus,
    type BackendServiceCatalogItem,
} from '@/lib/backend-api';

// --- Types ---

interface ServiceItem {
    id: string;
    code: string;
    name: string;
    sku?: string;
    description?: string;
    category: string;
    default_price: number;
    approval_required: boolean;
    status: 'active' | 'archived';
    notes?: string;
    updated_at: string;
    updated_by?: string;
    allowed_actions: string[];
}

const toNumber = (value: string | number): number => {
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const mapBackendServiceToUi = (row: BackendServiceCatalogItem): ServiceItem => ({
    id: row.id,
    code: row.code,
    name: row.name,
    sku: row.sku ?? undefined,
    description: row.description ?? undefined,
    category: row.category || 'General',
    default_price: toNumber(row.default_price),
    approval_required: Boolean(row.approval_required),
    status: row.status === 'archived' ? 'archived' : 'active',
    notes: row.notes ?? undefined,
    updated_at: row.updated_at,
    updated_by: row.updated_by ?? undefined,
    allowed_actions: ['edit', row.status === 'active' ? 'archive' : 'unarchive', 'duplicate'],
});

const ADMIN_REFRESH_EVENT = 'sm-dispatch:admin-refresh';

// --- Mock Data ---

export const MOCK_SERVICES: ServiceItem[] = HARDCODED_SERVICE_SEED.map((row, index) => ({
    id: `seed-${index + 1}`,
    code: row.code,
    name: row.name,
    sku: undefined,
    description: row.description ?? undefined,
    category: row.category,
    default_price: row.default_price,
    approval_required: row.approval_required,
    status: row.status,
    notes: row.notes ?? undefined,
    updated_at: '2026-03-05T00:00:00Z',
    updated_by: 'Sheet Import',
    allowed_actions: ['edit', row.status === 'active' ? 'archive' : 'unarchive', 'duplicate'],
}));

// --- Components ---

function ApprovalBadge({ required }: { required: boolean }) {
    if (required) return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Yes</Badge>;
    return <Badge variant="outline" className="text-gray-500 border-gray-200">No</Badge>;
}

function StatusBadge({ status }: { status: 'active' | 'archived' }) {
    if (status === 'active') return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 shadow-none">Active</Badge>;
    return <Badge variant="outline" className="text-gray-500 border-gray-200">Archived</Badge>;
}

const SERVICE_EXPORT_COLUMNS = [
    'Code',
    'Name',
    'SKU',
    'Category',
    'DefaultPrice',
    'Status',
];

export default function ServicesPage() {
    const { hasBackendAdminToken } = useAuth();
    const [services, setServices] = useState<ServiceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [minPrice, setMinPrice] = useState<string>('');
    const [maxPrice, setMaxPrice] = useState<string>('');

    // Drawers & Modals
    const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
    const [exportModalOpen, setExportModalOpen] = useState(false);

    // Forms
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        category: 'General',
        default_price: '',
        approval_required: false,
        notes: ''
    });

    // Initial Fetch
    const fetchServices = useCallback(async () => {
        setLoading(true);
        const token = getStoredAdminToken();
        if (!hasBackendAdminToken || !token) {
            setServices(MOCK_SERVICES);
            setLoading(false);
            return;
        }
        try {
            const rows = await fetchAdminServices(token, true);
            const mapped = rows.map(mapBackendServiceToUi);
            setServices(mapped.length > 0 ? mapped : MOCK_SERVICES);
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unable to load services';
            alert(detail);
            setServices(MOCK_SERVICES);
        } finally {
            setLoading(false);
        }
    }, [hasBackendAdminToken]);

    useEffect(() => {
        void fetchServices();
    }, [fetchServices]);

    useEffect(() => {
        const handleAdminRefresh = () => {
            void fetchServices();
        };

        window.addEventListener(ADMIN_REFRESH_EVENT, handleAdminRefresh);
        return () => {
            window.removeEventListener(ADMIN_REFRESH_EVENT, handleAdminRefresh);
        };
    }, [fetchServices]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            void fetchServices();
        }, 15000);
        return () => {
            window.clearInterval(intervalId);
        };
    }, [fetchServices]);

    const getServiceExportRows = () => services.map(s => ({
            Code: s.code,
            Name: s.name,
            SKU: s.sku || '',
            Category: s.category,
            DefaultPrice: s.default_price,
            Status: s.status,
        }));

    const handleExport = (selectedColumns: string[], format: ExportFormat = 'csv') => {
        const exportData = selectColumnsForExport(getServiceExportRows(), selectedColumns);
        exportArrayData(exportData, 'services_pricing_export', format);
    };

    // Filter Logic
    const filteredServices = services.filter(s => {
        const matchesSearch =
            s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (s.sku || '').toLowerCase().includes(searchQuery.toLowerCase());
        const normalizedCategory = s.category.trim().toLowerCase();
        const normalizedName = s.name.trim().toLowerCase();
        const normalizedCode = s.code.trim().toLowerCase();
        let matchesCategory = true;
        if (filterCategory === 'ppf') {
            matchesCategory = normalizedCategory === 'ppf';
        }
        if (filterCategory === 'window_tint') {
            matchesCategory = normalizedCategory === 'window tint';
        }
        if (filterCategory === 'engine_immobilizers') {
            matchesCategory =
                normalizedName.includes('immobilizer') ||
                normalizedName.includes('anti-demarrage') ||
                normalizedName.includes('antidémarrage') ||
                normalizedName.includes('domino') ||
                normalizedCode.includes('immobil');
        }
        if (filterCategory === 'remote_starters') {
            matchesCategory =
                normalizedName.includes('remote starter') ||
                normalizedName.includes('demarreur') ||
                normalizedName.includes('démarreur') ||
                normalizedName.includes('mycar') ||
                normalizedName.includes('2-way') ||
                normalizedCode.includes('2way') ||
                normalizedCode.includes('mycar');
        }
        if (filterCategory === 'vehicle_tracking_systems') {
            matchesCategory =
                normalizedName.includes('tracking') ||
                normalizedName.includes('repérage') ||
                normalizedName.includes('reperage') ||
                normalizedCode.includes('tracking');
        }
        if (filterCategory === 'windshield_repair') {
            matchesCategory =
                normalizedName.includes('windshield repair') ||
                normalizedName.includes('pare-brise') ||
                normalizedCode.includes('pb');
        }
        if (filterCategory === 'windshield_replacement') {
            matchesCategory =
                normalizedName.includes('windshield replacement') ||
                normalizedName.includes('remplacement de pare-brise');
        }

        const min = minPrice.trim() === '' ? null : Number(minPrice);
        const max = maxPrice.trim() === '' ? null : Number(maxPrice);
        const matchesMin = min === null || (!Number.isNaN(min) && s.default_price >= min);
        const matchesMax = max === null || (!Number.isNaN(max) && s.default_price <= max);

        return matchesSearch && matchesCategory && matchesMin && matchesMax;
    });

    // Handlers
    const handleOpenDrawer = (s: ServiceItem) => {
        setSelectedService(s);
        setDrawerOpen(true);
    };

    const handleOpenAddModal = () => {
        setModalMode('add');
        setFormData({ code: '', name: '', category: 'General', default_price: '', approval_required: false, notes: '' });
        setModalOpen(true);
    };

    const handleOpenEditModal = (s: ServiceItem) => {
        setModalMode('edit');
        setFormData({
            code: s.code,
            name: s.name,
            category: s.category || 'General',
            default_price: s.default_price.toString(),
            approval_required: s.approval_required,
            notes: s.notes || ''
        });
        setSelectedService(s);
        setModalOpen(true);
    };

    const handleSaveService = async () => {
        const token = getStoredAdminToken();
        if (!token) {
            alert('Admin session is required to save services.');
            return;
        }

        if (!formData.code || !formData.name || !formData.default_price) {
            alert("Code, Name, and Default Price are required.");
            return;
        }

        const normalizedCategory = formData.category.trim() || 'General';

        const price = parseFloat(formData.default_price);
        if (isNaN(price) || price < 0) {
            alert("Price must be a valid non-negative number.");
            return;
        }

        const normalizedCode = formData.code.trim().toLowerCase();

        if (modalMode === 'add') {
            if (services.some((s) => s.code.trim().toLowerCase() === normalizedCode)) {
                alert("Service code already exists.");
                return;
            }
            try {
                const created = await createAdminService(token, {
                    code: formData.code,
                    name: formData.name,
                    category: normalizedCategory,
                    default_price: price,
                    approval_required: formData.approval_required,
                    notes: formData.notes || null,
                });
                setServices(prev => [mapBackendServiceToUi(created), ...prev]);
            } catch (error) {
                const detail = error instanceof Error ? error.message : 'Unable to create service';
                alert(detail);
                return;
            }

        } else if (modalMode === 'edit' && selectedService) {
            if (
                services.some(
                    (s) => s.id !== selectedService.id && s.code.trim().toLowerCase() === normalizedCode,
                )
            ) {
                alert("Service code already exists.");
                return;
            }
            try {
                const updated = await updateAdminService(token, selectedService.id, {
                    code: formData.code,
                    name: formData.name,
                    category: normalizedCategory,
                    default_price: price,
                    approval_required: formData.approval_required,
                    notes: formData.notes || null,
                });
                const updatedService = mapBackendServiceToUi(updated);
                setServices(prev => prev.map(s => s.id === selectedService.id ? updatedService : s));
                setSelectedService(updatedService);
            } catch (error) {
                const detail = error instanceof Error ? error.message : 'Unable to update service';
                alert(detail);
                return;
            }
        }

        setModalOpen(false);
        // Toast success here
    };

    const handleArchiveToggle = async (s: ServiceItem) => {
        const token = getStoredAdminToken();
        if (!token) {
            alert('Admin session is required to change service status.');
            return;
        }
        const newStatus = s.status === 'active' ? 'archived' : 'active';
        try {
            const updated = await updateAdminServiceStatus(token, s.id, newStatus);
            const next = mapBackendServiceToUi(updated);
            setServices(prev => prev.map(item => item.id === s.id ? next : item));
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unable to update service status';
            alert(detail);
        }
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* 1. Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">Services & Pricing</h1>
                    <p className="text-sm text-muted-foreground font-medium">Manage service catalog, default pricing, and approval flags</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <Button variant="outline" size="sm" onClick={() => void fetchServices()} className="h-9 gap-2" disabled={loading}>
                        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)} className="h-9 gap-2">
                        <FileDown className="w-4 h-4" /> Export
                    </Button>
                    <Button size="sm" onClick={handleOpenAddModal} className="h-9 gap-2 bg-[#2F8E92] hover:bg-[#267276]">
                        <Plus className="w-4 h-4" /> Add Service
                    </Button>
                </div>
            </div>

            {/* 2. Info Banner */}
            <div className="bg-card border border-blue-200/50 rounded-lg p-3 flex items-start sm:items-center gap-3 text-sm text-blue-700 dark:text-blue-300">
                <Info className="w-4 h-4 mt-0.5 sm:mt-0 flex-shrink-0 text-blue-600 dark:text-blue-300" />
                <p>Price changes affect future jobs only. Previously approved invoices remain unchanged.</p>
            </div>

            {/* 3. Filter Bar */}
            <Card className="p-4 border-border shadow-sm space-y-4 bg-card">
                <div className="flex flex-col lg:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full lg:w-auto min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by service code or name..."
                            className="pl-9 bg-muted/30 border-border focus:bg-background transition-all"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto">
                        <Select value={filterCategory} onValueChange={setFilterCategory}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                <SelectItem value="ppf">PPF</SelectItem>
                                <SelectItem value="window_tint">Window Tint</SelectItem>
                                <SelectItem value="engine_immobilizers">Engine immobilizers</SelectItem>
                                <SelectItem value="remote_starters">Remote starters</SelectItem>
                                <SelectItem value="vehicle_tracking_systems">Vehicle tracking systems</SelectItem>
                                <SelectItem value="windshield_repair">Windshield repair</SelectItem>
                                <SelectItem value="windshield_replacement">Windshield replacement</SelectItem>
                            </SelectContent>
                        </Select>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-[180px] justify-start border-border bg-background">
                                    Prices
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[260px] p-3">
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-500">Min Price</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Min Price"
                                        value={minPrice}
                                        onChange={(e) => setMinPrice(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2 mt-3">
                                    <Label className="text-xs text-gray-500">Max Price</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Max Price"
                                        value={maxPrice}
                                        onChange={(e) => setMaxPrice(e.target.value)}
                                    />
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </Card>

            {/* 4. Services Table */}
            <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
                {loading ? (
                    <div className="p-4 space-y-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                        ))}
                    </div>
                ) : filteredServices.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                            <FileText className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">No services found</h3>
                        <p className="text-sm mt-1">Try adjusting your filters or search query.</p>
                        <Button variant="outline" className="mt-4" onClick={() => { setSearchQuery(''); setFilterCategory('all'); setMinPrice(''); setMaxPrice(''); }}>Clear Filters</Button>
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="bg-gray-50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="pl-6 w-[150px]">Service Code</TableHead>
                                <TableHead className="min-w-[260px]">Service Name</TableHead>
                                <TableHead className="w-[140px]">SKU</TableHead>
                                <TableHead className="w-[120px]">Category</TableHead>
                                <TableHead className="w-[120px] text-right pr-6">Default Price</TableHead>
                                <TableHead className="w-[100px] text-center">Status</TableHead>
                                <TableHead className="w-[180px] text-right">Last Updated</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredServices.map((service) => (
                                <TableRow
                                    key={service.id}
                                    className="group hover:bg-gray-50 cursor-pointer transition-colors"
                                    onClick={() => handleOpenDrawer(service)}
                                >
                                    <TableCell className="pl-6 font-semibold text-gray-900">{service.code}</TableCell>
                                    <TableCell className="text-gray-700 font-medium">{service.name}</TableCell>
                                    <TableCell className="font-mono text-xs text-gray-500">{service.sku || '-'}</TableCell>
                                    <TableCell className="text-gray-600">{service.category}</TableCell>
                                    <TableCell className="text-right pr-6 font-mono text-gray-600">
                                        ${service.default_price.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <StatusBadge status={service.status} />
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-gray-400 font-mono">
                                        {new Date(service.updated_at).toLocaleDateString()}
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
                                                    <DropdownMenuItem onClick={() => handleOpenEditModal(service)}>
                                                        <Edit2 className="w-4 h-4 mr-2" /> Edit Service
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handleArchiveToggle(service)} className={service.status === 'active' ? "text-red-600" : ""}>
                                                        {service.status === 'active' ? (
                                                            <><Archive className="w-4 h-4 mr-2" /> Archive</>
                                                        ) : (
                                                            <><CheckCircle2 className="w-4 h-4 mr-2" /> Unarchive</>
                                                        )}
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

            {/* 6. Add/Edit Service Modal */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{modalMode === 'add' ? 'Add New Service' : 'Edit Service'}</DialogTitle>
                        <DialogDescription>
                            Configure service details and default pricing. <br />
                            <span className="text-xs text-amber-600 font-medium">Changes affect future jobs only.</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Service Code <span className="text-red-500">*</span></Label>
                                <Input
                                    placeholder="e.g. SRV-001"
                                    value={formData.code}
                                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                                    disabled={modalMode === 'edit'} // Lock code on edit usually desirable
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Default Price ($) <span className="text-red-500">*</span></Label>
                                <div className="relative">
                                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.default_price}
                                        onChange={e => setFormData({ ...formData, default_price: e.target.value })}
                                        className="pl-9"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Service Name <span className="text-red-500">*</span></Label>
                            <Input placeholder="e.g. Standard Inspection" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Category <span className="text-red-500">*</span></Label>
                            <Input
                                placeholder="e.g. PPF"
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg bg-gray-50">
                            <div className="space-y-0.5">
                                <Label className="text-base">Approval Required</Label>
                                <p className="text-xs text-gray-500">Flag invoices containing this service for review.</p>
                            </div>
                            <Switch
                                checked={formData.approval_required}
                                onCheckedChange={c => setFormData({ ...formData, approval_required: c })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Notes (Optional)</Label>
                            <Textarea
                                placeholder="Internal notes about pricing logic or restrictions..."
                                value={formData.notes}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveService} className="bg-[#2F8E92] hover:bg-[#267276]">{modalMode === 'add' ? 'Create Service' : 'Save Changes'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ColumnExportDialog
                open={exportModalOpen}
                onOpenChange={setExportModalOpen}
                title="Export Services"
                description="Select the service columns you want in your CSV."
                availableColumns={SERVICE_EXPORT_COLUMNS}
                onConfirm={handleExport}
            />

            {/* 7. Service Drawer */}
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetContent className="sm:max-w-md w-full p-0 flex flex-col gap-0 bg-gray-50/50">
                    {selectedService && (
                        <>
                            <div className="bg-white px-6 py-4 border-b border-gray-200">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h2 className="text-xl font-bold text-gray-900">{selectedService.name}</h2>
                                        </div>
                                        <div className="text-sm font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded inline-block">
                                            {selectedService.code}
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => { setDrawerOpen(false); handleOpenEditModal(selectedService); }}>
                                        <Edit2 className="w-3 h-3 mr-2" /> Edit
                                    </Button>
                                </div>
                            </div>

                            <ScrollArea className="flex-1">
                                <div className="p-6 space-y-6">
                                    <Card className="p-4 border-gray-200 shadow-sm space-y-4">
                                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                            <FileText className="w-4 h-4" /> Service Details
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <span className="text-gray-500 block">SKU</span>
                                                <span className="font-mono text-gray-900">{selectedService.sku || '-'}</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-500 block">Default Price</span>
                                                <span className="font-mono font-medium text-gray-900">${selectedService.default_price.toFixed(2)}</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-500 block">Status</span>
                                                <StatusBadge status={selectedService.status} />
                                            </div>
                                            <div>
                                                <span className="text-gray-500 block">Approval Required</span>
                                                <ApprovalBadge required={selectedService.approval_required} />
                                            </div>
                                            <div>
                                                <span className="text-gray-500 block">Last Updated</span>
                                                <span className="text-gray-900">{new Date(selectedService.updated_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>

                                        {selectedService.description && (
                                            <div className="pt-4 border-t border-gray-100">
                                                {selectedService.description && (
                                                    <>
                                                        <span className="text-gray-500 block text-xs mb-1">Description</span>
                                                        <p className="text-sm text-gray-700 bg-blue-50 p-2 rounded border border-blue-100">
                                                            {selectedService.description}
                                                        </p>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </Card>

                                </div>
                            </ScrollArea>
                        </>
                    )}
                </SheetContent>
            </Sheet>

        </div>
    );
}

