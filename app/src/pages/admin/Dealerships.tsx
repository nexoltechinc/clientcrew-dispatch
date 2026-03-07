import { useState, useEffect } from 'react';
import {
    Search,
    RefreshCw,
    Plus,
    MoreVertical,
    AlertCircle,
    Building2,
    Power,
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
import { Label } from '@/components/ui/label';
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
import {
    createAdminDealership,
    fetchAdminDealerships,
    getStoredAdminToken,
    updateAdminDealership,
    updateAdminDealershipStatus,
    type BackendDealership,
} from '@/lib/backend-api';
import { useAuth } from '@/contexts/AuthContext';

// --- Types ---

interface JobSummary {
    id: string;
    job_code: string;
    status: string;
    created_at: string;
    assigned_tech?: string;
}

interface Dealership {
    id: string;
    backend_id?: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    postal_code: string;
    status: 'active' | 'inactive';
    notes?: string;
    last_job_at?: string;
    recent_jobs: JobSummary[];
    allowed_actions: string[];
}

const mapBackendDealership = (item: BackendDealership): Dealership => ({
    id: item.code,
    backend_id: item.id,
    name: item.name,
    phone: formatPhoneForDisplay(item.phone ?? ''),
    email: item.email ?? '',
    address: item.address ?? '',
    city: item.city ?? '',
    postal_code: item.postal_code ?? '',
    status: item.status === 'active' ? 'active' : 'inactive',
    notes: item.notes ?? '',
    last_job_at: item.last_job_at ?? undefined,
    recent_jobs: (item.recent_jobs ?? []).map((job) => ({
        id: job.id,
        job_code: job.job_code,
        status: job.status,
        created_at: job.created_at,
        assigned_tech: job.assigned_tech ?? undefined,
    })),
    allowed_actions: ['view_details', 'edit', 'deactivate'],
});

// --- Mock Data ---

export const MOCK_DEALERSHIPS: Dealership[] = [
    {
        id: "D-001",
        name: "D-001",
        phone: "14186558309",
        email: "",
        address: "",
        city: "",
        postal_code: "",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-002",
        name: "911 Pro",
        phone: "15148930911",
        email: "comptabilite@911pro.com",
        address: "1240 Rue Labelle",
        city: "Longueuil",
        postal_code: "J4N 1C7",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-003",
        name: "Agropur",
        phone: "14210071863",
        email: "factures.invoices@agropur.com",
        address: "",
        city: "",
        postal_code: "",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-004",
        name: "System Test",
        phone: "14186558309",
        email: "alexdesgagne@hotmail.com",
        address: "123 Test Drive",
        city: "Quebec",
        postal_code: "G1G 1G1",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-005",
        name: "Audi De Quebec",
        phone: "15817058089",
        email: "comptabilite@audidequebec.com, jvilleneuve@audidequebec.com",
        address: "5200 Rue John Molson",
        city: "Quebec",
        postal_code: "G1X 3X4",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-006",
        name: "Audi Levis",
        phone: "15815006545",
        email: "",
        address: "",
        city: "",
        postal_code: "",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-007",
        name: "Carrossier Procolor Portneuf",
        phone: "14182862323",
        email: "portneuf@carrossierprocolor.com",
        address: "140 Lucien-Thibodeau",
        city: "Portneuf",
        postal_code: "G0A 2Y0",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-008",
        name: "Clinique Dentaire Marchand Charest Dumas",
        phone: "14186549123",
        email: "julie.clinique@outlook.com",
        address: "2850 Chem. Saint-Louis",
        city: "Quebec",
        postal_code: "G1W 1P2",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-009",
        name: "Germain Nissan Donnacona",
        phone: "14182850970",
        email: "dthibault@germainnissan.ca",
        address: "104 Rue Commerciale",
        city: "Donnacona",
        postal_code: "G3M 1W1",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-010",
        name: "Donnacona Chrysler Jeep Dodge Ram",
        phone: "",
        email: "",
        address: "160 Rue Commerciale",
        city: "Donnacona",
        postal_code: "G3M 1W1",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-011",
        name: "Donnacona Ford",
        phone: "",
        email: "",
        address: "128 Bd Les Ecureuils",
        city: "Donnacona",
        postal_code: "G3M 0J2",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-012",
        name: "Donnacona Mazda",
        phone: "41852852020",
        email: "aprovost@donnaconamazda.com",
        address: "141 Rue Commerciale",
        city: "Donnacona",
        postal_code: "G3M 1W2",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-013",
        name: "Germain Chevrolet Buick Gmc",
        phone: "",
        email: "",
        address: "560 Cote Joyeuse",
        city: "Saint-Raymond",
        postal_code: "G3L 4B1",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-014",
        name: "Germain Nissan Donnacona",
        phone: "",
        email: "",
        address: "104 Rue Commerciale",
        city: "Donnacona",
        postal_code: "G3M 1W1",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-015",
        name: "Honda Donnacona",
        phone: "",
        email: "",
        address: "159 Rue Commerciale",
        city: "Donnacona",
        postal_code: "G3M 1W2",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-016",
        name: "Hyundai Saint-Raymond",
        phone: "",
        email: "",
        address: "484 Cote Joyeuse",
        city: "Saint-Raymond",
        postal_code: "G3L 4A7",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-017",
        name: "Kia Cap-Sante",
        phone: "14182855555",
        email: "dhuard@leprixdugros.com",
        address: "5 Bois De L Ail",
        city: "Cap-Sante",
        postal_code: "G0A 1L0",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-018",
        name: "Kia Cap-Sante",
        phone: "",
        email: "",
        address: "5 Chem. Du Bois De L'Ail",
        city: "Cap-Sante",
        postal_code: "G0A 1L0",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-019",
        name: "L'Expert Carrossier Rive-Sud",
        phone: "",
        email: "magasinierauto@corrossier.expert, adjointe@carrossier.expert, philippe.denoncourt@carrossier.expert",
        address: "250 Av. Taniata",
        city: "Levis",
        postal_code: "G6W 5M6",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-020",
        name: "Agropur/Natrel",
        phone: "",
        email: "",
        address: "2465 1 Ere Avenue",
        city: "Quebec",
        postal_code: "G1L 3M9",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-021",
        name: "Mag3",
        phone: "14188496919",
        email: "payable@sm-inc.com",
        address: "15971, Boul. De La Colline",
        city: "Quebec",
        postal_code: "G3G 3A7",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-022",
        name: "Ville De Quebec",
        phone: "",
        email: "karyne.legere@ville.quebec.qc.ca",
        address: "",
        city: "",
        postal_code: "",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-023",
        name: "Pagui",
        phone: "14188497104",
        email: "payable@sm-inc.com",
        address: "15971 Bd De La Colline",
        city: "Quebec",
        postal_code: "G3G 3A7",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-024",
        name: "Pg Solutions",
        phone: "",
        email: "cp@harriscomputer.com, rrutishauser@pgsolutions.com",
        address: "217 avenue Leonidas #13",
        city: "Rimouski",
        postal_code: "G5L 2T5",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-025",
        name: "Prest",
        phone: "14185591535",
        email: "admin@prest.ltd",
        address: "1550 Ave Diesel,",
        city: "Quebec",
        postal_code: "G1P 4J5",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-026",
        name: "Pro-Design",
        phone: "14182848894",
        email: "victorplamondon@videotron.ca",
        address: "",
        city: "",
        postal_code: "",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-027",
        name: "Remorquage Charles Parent",
        phone: "14189281797",
        email: "parent.charles@videotron.ca",
        address: "1443 St Olivier",
        city: "Ancienne Lorette",
        postal_code: "G2E 2N7",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-028",
        name: "Revenu Canada",
        phone: "",
        email: "",
        address: "",
        city: "",
        postal_code: "",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-029",
        name: "Serge Fontaine",
        phone: "",
        email: "",
        address: "",
        city: "",
        postal_code: "",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-030",
        name: "Services Mobiles Martin Després Inc.",
        phone: "14189984458",
        email: "martin.despres.83@gmail.com",
        address: "527 Rue Taschereau,",
        city: "Quebec City",
        postal_code: "G3G 1B4",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-031",
        name: "Sm Construction Inc",
        phone: "14188497104",
        email: "payable@sm-inc.com",
        address: "15971, Boul. De La Colline",
        city: "Quebec",
        postal_code: "G3G 3A7",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-032",
        name: "Solutech Gps",
        phone: "1888765",
        email: "facturation@solutechgps.com",
        address: "308 Chemin De La Traverse",
        city: "Sainte-Anne-des-Plaines",
        postal_code: "J6Y 1S9",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-033",
        name: "Services Sanitaire A.Deschesnes",
        phone: "",
        email: "ssad-inc@live.ca",
        address: "600 Chemin Riviere-Verte",
        city: "St-Antonin",
        postal_code: "G0L 2J0",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-034",
        name: "St-Raymond Toyota",
        phone: "",
        email: "",
        address: "565 Cote Joyeuse",
        city: "Saint-Raymond",
        postal_code: "G3L 4B2",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-035",
        name: "Tardif Métal Inc",
        phone: "",
        email: "payable@sm-inc.com",
        address: "15971, Boul. De La Colline",
        city: "Quebec",
        postal_code: "G3G 3A7",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-036",
        name: "Transport Guilmyr",
        phone: "",
        email: "Karl.martin@gilmyr.com",
        address: "315 Chemin Du Coteau",
        city: "Montmagny",
        postal_code: "G5V 3R8",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-037",
        name: "Ville De Quebec  Service De Finance",
        phone: "",
        email: "Karyne.legere@ville.quebec.qc.ca",
        address: "65 Rue Sainte-Anne,R-C",
        city: "Quebec",
        postal_code: "G1R 3X5",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    },
    {
        id: "D-038",
        name: "Vitroplus Ste-Foy",
        phone: "14186506996",
        email: "service@vpsf.info",
        address: "2866 Chemin St Louis",
        city: "Quebec",
        postal_code: "G1W 1P4",
        status: "active" as const,
        notes: "",
        recent_jobs: [],
        allowed_actions: ['view_details', 'edit', 'deactivate'],
    }
];
// --- Components ---

function StatusBadge({ status }: { status: 'active' | 'inactive' }) {
    if (status === 'active') return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 shadow-none">Active</Badge>;
    return <Badge variant="outline" className="text-gray-500 border-gray-200">Inactive</Badge>;
}

const DEALERSHIP_EXPORT_COLUMNS = [
    'ID',
    'Name',
    'Phone',
    'Email',
    'Address',
    'City/Ville',
    'Postal Code',
    'Status',
    'Notes',
];

export default function DealershipsPage() {
    const { hasBackendAdminToken } = useAuth();
    const [dealerships, setDealerships] = useState<Dealership[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastSuccessfulFetchAt, setLastSuccessfulFetchAt] = useState<Date | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterCity, setFilterCity] = useState<string>('all');

    // Drawers & Modals
    const [selectedDealership, setSelectedDealership] = useState<Dealership | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [confirmStatusModalOpen, setConfirmStatusModalOpen] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);

    // Forms
    const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', address: '', city: '', postal_code: '', notes: '' });
    const [editForm, setEditForm] = useState<Dealership | null>(null);

    // Initial Fetch
    const fetchDealerships = async () => {
        setLoading(true);
        const adminToken = getStoredAdminToken();

        if (!hasBackendAdminToken || !adminToken) {
            setDealerships([]);
            setLoading(false);
            return;
        }

        try {
            const rows = await fetchAdminDealerships(adminToken);
            setDealerships(rows.map(mapBackendDealership));
            setLastSuccessfulFetchAt(new Date());
        } catch {
            setDealerships([]);
        } finally {
            setLoading(false);
        }
    };

    const reloadDealerships = async () => {
        await fetchDealerships();
    };

    useEffect(() => {
        void fetchDealerships();
    }, [hasBackendAdminToken]);

    const cityFilterOptions = Array.from(
        new Set(
            dealerships
                .map((d) => d.city.trim())
                .filter((city) => city.length > 0),
        ),
    ).sort((a, b) => a.localeCompare(b));

    // Filter Logic
    const filteredDealerships = dealerships.filter(d => {
        const query = searchQuery.toLowerCase();
        const queryPhoneToken = getPhoneSearchToken(searchQuery);
        const matchesSearch =
            d.name.toLowerCase().includes(query) ||
            d.phone.includes(searchQuery) ||
            d.city.toLowerCase().includes(query) ||
            (queryPhoneToken.length > 0 && getPhoneSearchToken(d.phone).includes(queryPhoneToken));
        const matchesStatus = filterStatus === 'all' || d.status === filterStatus;
        const matchesCity = filterCity === 'all' || d.city.trim().toLowerCase() === filterCity.toLowerCase();
        return matchesSearch && matchesStatus && matchesCity;
    });

    // Handlers
    const handleOpenDrawer = (d: Dealership) => {
        setSelectedDealership(d);
        setEditForm({ ...d, phone: formatPhoneForDisplay(d.phone) }); // Initialize edit form
        setDrawerOpen(true);
    };

    const handleAddDealership = async () => {
        const formattedPhone = toUsPhoneFormat(addForm.phone);

        if (!addForm.name || !addForm.phone || !addForm.email) {
            // Simple validation feedback (in real app use toast)
            alert("Name, Phone, and Domain Email are required.");
            return;
        }
        if (!formattedPhone || formattedPhone !== addForm.phone.trim()) {
            alert(`Phone must be in this format: ${phoneExampleFormat}.`);
            return;
        }

        const adminToken = getStoredAdminToken();
        if (!adminToken) {
            alert('Admin backend connection is required to create a customer.');
            return;
        }

        try {
            const created = await createAdminDealership(adminToken, {
                name: addForm.name.trim(),
                phone: formattedPhone,
                email: addForm.email.trim(),
                address: addForm.address.trim(),
                city: addForm.city.trim(),
                postal_code: addForm.postal_code.trim(),
                notes: addForm.notes.trim(),
            });
            const mapped = mapBackendDealership(created);
            setAddModalOpen(false);
            setAddForm({ name: '', phone: '', email: '', address: '', city: '', postal_code: '', notes: '' });
            await reloadDealerships();
            setTimeout(() => handleOpenDrawer(mapped), 300);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to create customer.');
        }
    };

    const handleSaveEdit = async () => {
        if (!editForm || !selectedDealership) return;

        const rawPhone = editForm.phone.trim();
        const previousPhoneDisplay = formatPhoneForDisplay(selectedDealership.phone);
        let persistedPhone = selectedDealership.phone;

        if (rawPhone.length > 0) {
            const normalizedPhone = toUsPhoneFormat(rawPhone);
            if (!normalizedPhone) {
                // Allow legacy invalid value if unchanged, so non-phone fields can still be edited.
                if (rawPhone !== previousPhoneDisplay) {
                    alert(`Phone must be in this format: ${phoneExampleFormat}.`);
                    return;
                }
            } else {
                persistedPhone = normalizedPhone;
            }
        } else {
            persistedPhone = '';
        }

        const normalizedEdit: Dealership = {
            ...editForm,
            name: editForm.name.trim(),
            phone: persistedPhone,
            email: editForm.email.trim(),
            address: editForm.address.trim(),
            city: editForm.city.trim(),
            postal_code: editForm.postal_code.trim(),
            notes: (editForm.notes || '').trim(),
        };

        const adminToken = getStoredAdminToken();
        if (!adminToken || !selectedDealership.backend_id) {
            alert('Admin backend connection is required to update a customer.');
            return;
        }

        try {
            const updated = await updateAdminDealership(
                adminToken,
                selectedDealership.backend_id,
                {
                    name: normalizedEdit.name,
                    phone: normalizedEdit.phone || undefined,
                    email: normalizedEdit.email || undefined,
                    address: normalizedEdit.address || undefined,
                    city: normalizedEdit.city || undefined,
                    postal_code: normalizedEdit.postal_code || undefined,
                    notes: normalizedEdit.notes || undefined,
                    status: normalizedEdit.status,
                },
            );
            const mapped = mapBackendDealership(updated);
            await reloadDealerships();
            setSelectedDealership(mapped);
            setEditForm({ ...mapped, phone: formatPhoneForDisplay(mapped.phone) });
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to update customer.');
        }
    };

    const handleCancelEdit = () => {
        if (!selectedDealership) return;
        setEditForm({ ...selectedDealership, phone: formatPhoneForDisplay(selectedDealership.phone) });
    };

    const handleToggleStatus = () => {
        setConfirmStatusModalOpen(true);
    };

    const handleConfirmStatusChange = async () => {
        if (!selectedDealership) return;
        const newStatus: 'active' | 'inactive' = selectedDealership.status === 'active' ? 'inactive' : 'active';
        const adminToken = getStoredAdminToken();

        if (!adminToken || !selectedDealership.backend_id) {
            alert('Admin backend connection is required to change customer status.');
            return;
        }

        try {
            const updatedResponse = await updateAdminDealershipStatus(
                adminToken,
                selectedDealership.backend_id,
                newStatus,
            );
            const mapped = mapBackendDealership(updatedResponse);
            await reloadDealerships();
            setSelectedDealership(mapped);
            setEditForm({ ...mapped, phone: formatPhoneForDisplay(mapped.phone) });
            setConfirmStatusModalOpen(false);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to change customer status.');
        }
    };

    const getDealershipExportRows = () => dealerships.map(d => ({
            ID: d.id,
            Name: d.name,
            Phone: formatPhoneForDisplay(d.phone),
            Email: d.email,
            Address: d.address,
            'City/Ville': d.city,
            'Postal Code': d.postal_code,
            Status: d.status,
            Notes: d.notes || ''
        }));

    const handleExport = (selectedColumns: string[], format: ExportFormat = 'csv') => {
        const exportData = selectColumnsForExport(getDealershipExportRows(), selectedColumns);
        exportArrayData(exportData, 'customers_export', format);
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* 1. Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">Customers</h1>
                    <p className="text-sm text-muted-foreground font-medium">Manage customer contacts and status</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <div className="hidden sm:flex items-center text-xs text-muted-foreground font-medium mr-2">
                        Last updated: {lastSuccessfulFetchAt ? lastSuccessfulFetchAt.toLocaleTimeString() : 'Never'}
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchDealerships} disabled={loading} className="h-9 gap-2">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)} className="h-9 gap-2">
                        <FileDown className="w-4 h-4" /> Export
                    </Button>
                    <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="h-9 gap-2 bg-[#2F8E92] hover:bg-[#267276]">
                                <Plus className="w-4 h-4" /> Add Customer
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add New Customer</DialogTitle>
                                <DialogDescription>Create a new customer profile for dispatch.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                    <Label>Customer Name <span className="text-red-500">*</span></Label>
                                    <Input placeholder="e.g. Metro Ford" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone <span className="text-red-500">*</span></Label>
                                    <Input
                                        placeholder={phoneExampleFormat}
                                        value={addForm.phone}
                                        onChange={e => setAddForm({ ...addForm, phone: formatUsPhoneInput(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Domain Email <span className="text-red-500">*</span></Label>
                                    <Input placeholder="e.g. info@customer.com" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>City/Ville</Label>
                                        <Input placeholder="e.g. Quebec" value={addForm.city} onChange={e => setAddForm({ ...addForm, city: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Postal Code (Code)</Label>
                                        <Input placeholder="e.g. G1X 3X4" value={addForm.postal_code} onChange={e => setAddForm({ ...addForm, postal_code: e.target.value })} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Address</Label>
                                    <Input placeholder="e.g. 123 Main St" value={addForm.address} onChange={e => setAddForm({ ...addForm, address: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Notes</Label>
                                    <Textarea placeholder="Access codes, preferred hours, etc." value={addForm.notes} onChange={e => setAddForm({ ...addForm, notes: e.target.value })} />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
                                <Button onClick={handleAddDealership} className="bg-[#2F8E92] hover:bg-[#267276]">Add Customer</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* 2. Filter Bar */}
            <Card className="p-4 border-border shadow-sm space-y-4 bg-card">
                <div className="flex flex-col lg:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full lg:w-auto min-w-0 lg:min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by customer name, phone, or city/ville..."
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

                        <Select value={filterCity} onValueChange={setFilterCity}>
                            <SelectTrigger className="w-full sm:w-[180px] border-dashed text-muted-foreground bg-background">
                                <div className="flex items-center gap-2">
                                    <Building2 className="w-4 h-4" />
                                    <SelectValue placeholder="City/Ville" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">City/Ville</SelectItem>
                                {cityFilterOptions.map((city) => (
                                    <SelectItem key={city} value={city}>
                                        {city}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="h-6 w-px bg-border mx-2" />

                        <Badge variant="secondary" className="cursor-pointer bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200">
                            Active ({dealerships.filter(d => d.status === 'active').length})
                        </Badge>
                        <Badge variant="secondary" className="cursor-pointer bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200">
                            Inactive ({dealerships.filter(d => d.status === 'inactive').length})
                        </Badge>
                    </div>
                </div>
            </Card>

            {/* 3. Dealerships Table */}
            <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
                {loading ? (
                    <div className="p-4 space-y-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                        ))}
                    </div>
                ) : filteredDealerships.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                            <Building2 className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">No customers found</h3>
                        <p className="text-sm mt-1">Try adjusting your filters or search query.</p>
                        <Button variant="outline" className="mt-4" onClick={() => { setSearchQuery(''); setFilterStatus('all'); setFilterCity('all'); }}>Clear Filters</Button>
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="bg-gray-50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="pl-6 w-[200px]">Customer Name</TableHead>
                                <TableHead className="w-[180px]">Contact Info</TableHead>
                                <TableHead className="w-[260px]">Location</TableHead>
                                <TableHead className="w-[100px]">Status</TableHead>
                                <TableHead className="w-[80px] text-center">Notes</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredDealerships.map((dealer) => (
                                <TableRow
                                    key={dealer.id}
                                    className="group hover:bg-gray-50 cursor-pointer transition-colors"
                                    onClick={() => handleOpenDrawer(dealer)}
                                >
                                    <TableCell className="pl-6">
                                        <div className="font-medium text-gray-900 group-hover:text-[#2F8E92]">{dealer.name}</div>
                                        <div className="text-xs text-gray-400 font-mono">ID: {dealer.id}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm text-gray-900">{formatPhoneForDisplay(dealer.phone)}</div>
                                        <div className="text-xs text-gray-400 underline decoration-gray-200">{dealer.email}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm text-gray-900 capitalize">{dealer.city || '-'}</div>
                                        <div className="text-xs text-gray-500">{dealer.address} {dealer.postal_code}</div>
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={dealer.status} />
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {dealer.notes && <AlertCircle className="w-4 h-4 text-amber-500 mx-auto" />}
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
                                                    <DropdownMenuItem onClick={() => handleOpenDrawer(dealer)}>View Details</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleOpenDrawer(dealer)}>Edit</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className={dealer.status === 'active' ? 'text-red-600' : ''}
                                                        onClick={() => {
                                                            handleOpenDrawer(dealer);
                                                            setConfirmStatusModalOpen(true);
                                                        }}
                                                    >
                                                        {dealer.status === 'active' ? 'Deactivate' : 'Activate'}
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

            {/* 4. Dealership Drawer */}
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col gap-0 bg-slate-50">
                    {selectedDealership && editForm && (
                        <>
                            <div className="bg-white px-6 py-5 border-b border-gray-200">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <h2 className="text-xl font-bold text-gray-900">{selectedDealership.name}</h2>
                                        <StatusBadge status={selectedDealership.status} />
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {selectedDealership.city || 'No city/ville provided'}
                                    </div>
                                    </div>
                                    <div className="flex items-center justify-start sm:justify-end">
                                        <Button
                                            variant={selectedDealership.status === 'active' ? "outline" : "default"}
                                            size="sm"
                                            className="min-w-[112px]"
                                            onClick={handleToggleStatus}
                                        >
                                            {selectedDealership.status === 'active' ? 'Deactivate' : 'Activate'}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <ScrollArea className="flex-1">
                                <div className="p-6 space-y-5">

                                    {/* A) Contact Info (Editable) */}
                                    <Card className="border-gray-200 shadow-sm">
                                        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 leading-none">
                                                <Building2 className="w-4 h-4" /> Contact Information
                                            </h3>
                                            <div className="flex items-center justify-end gap-2">
                                                <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-gray-600 hover:text-gray-700" onClick={handleCancelEdit}>
                                                    Cancel
                                                </Button>
                                                <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-blue-600 hover:text-blue-700" onClick={handleSaveEdit}>
                                                    Save Changes
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label className="text-xs text-gray-500">Customer Name</Label>
                                                <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="h-9" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs text-gray-500">Phone</Label>
                                                <Input
                                                    placeholder={phoneExampleFormat}
                                                    value={editForm.phone}
                                                    onChange={e => setEditForm({ ...editForm, phone: formatUsPhoneInput(e.target.value) })}
                                                    className="h-9"
                                                />
                                            </div>
                                            <div className="space-y-2 md:col-span-2">
                                                <Label className="text-xs text-gray-500">Domain Email</Label>
                                                <Input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="h-9" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs text-gray-500">City/Ville</Label>
                                                <Input value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} className="h-9" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs text-gray-500">Postal Code (Code)</Label>
                                                <Input value={editForm.postal_code} onChange={e => setEditForm({ ...editForm, postal_code: e.target.value })} className="h-9" />
                                            </div>
                                            <div className="space-y-2 md:col-span-2">
                                                <Label className="text-xs text-gray-500">Address</Label>
                                                <Input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} className="h-9" />
                                            </div>
                                        </div>
                                    </Card>

                                    {/* B) Operational Notes */}
                                    <Card className="border-gray-200 shadow-sm">
                                        <div className="border-b border-gray-100 px-5 py-4">
                                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 leading-none">
                                                <AlertCircle className="w-4 h-4" /> Operational Notes
                                            </h3>
                                        </div>
                                        <div className="px-5 py-5">
                                            <Textarea
                                                value={editForm.notes || ''}
                                                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                                className="min-h-[120px]"
                                                placeholder="Gate codes, special instructions, preferred technicians..."
                                            />
                                        </div>
                                    </Card>
                                </div>
                            </ScrollArea>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            <ColumnExportDialog
                open={exportModalOpen}
                onOpenChange={setExportModalOpen}
                title="Export Customers"
                description="Select the customer columns you want in your CSV."
                availableColumns={DEALERSHIP_EXPORT_COLUMNS}
                onConfirm={handleExport}
            />

            {/* 5. Confirm Status Modal */}
            <Dialog open={confirmStatusModalOpen} onOpenChange={setConfirmStatusModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Power className="w-5 h-5 text-gray-600" /> Confirm Status Change
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to change the status of <strong>{selectedDealership?.name}</strong> to <strong>{selectedDealership?.status === 'active' ? 'Inactive' : 'Active'}</strong>?
                            <br /><br />
                            {selectedDealership?.status === 'active' ? 'Inactive customers cannot submit new service requests.' : 'Active customers will be able to submit requests immediately.'}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmStatusModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleConfirmStatusChange} className="bg-[#2F8E92] hover:bg-[#267276]">Confirm Change</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}
