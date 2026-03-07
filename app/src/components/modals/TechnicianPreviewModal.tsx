import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Eye, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface TechnicianPreviewModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface PreviewTechnician {
    id: string;
    name: string;
    avatar: string;
    code?: string;
}

const getInitials = (name: string) =>
    name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

export function TechnicianPreviewModal({ open, onOpenChange }: TechnicianPreviewModalProps) {
    const { technicianAccounts } = useAuth();
    const [technicians, setTechnicians] = useState<PreviewTechnician[]>([]);
    const [selectedTechId, setSelectedTechId] = useState<string>('');
    const navigate = useNavigate();

    useEffect(() => {
        if (!open) return;

        const mapped = technicianAccounts.map((tech) => ({
            id: tech.id,
            name: tech.name,
            avatar: getInitials(tech.name),
            code: undefined,
        }));

        setTechnicians(mapped);
    }, [open, technicianAccounts]);

    useEffect(() => {
        if (!selectedTechId) return;
        if (technicians.some((tech) => tech.id === selectedTechId)) return;
        setSelectedTechId('');
    }, [technicians, selectedTechId]);

    const handleEnterPreview = () => {
        if (!selectedTechId) return;

        // Navigate to admin preview mode (NOT technician portal)
        navigate(`/admin/tech-preview/${selectedTechId}`);
        onOpenChange(false);

        // Reset selection for next time
        setTimeout(() => setSelectedTechId(''), 300);
    };

    const handleCancel = () => {
        setSelectedTechId('');
        onOpenChange(false);
    };

    const selectedTech = technicians.find(t => t.id === selectedTechId);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Eye className="w-5 h-5 text-[#2F8E92]" />
                        Preview Technician Portal
                    </DialogTitle>
                    <DialogDescription>
                        Select a technician to preview their portal view. This is a monitoring feature for administrators.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Warning Banner */}
                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-orange-800 dark:text-orange-300">
                            <p className="font-semibold mb-1">Preview Mode Notice</p>
                            <p className="text-xs">
                                You will remain logged in as admin. This preview is for monitoring and debugging only.
                                Your role and permissions will not change.
                            </p>
                        </div>
                    </div>

                    {/* Technician Selector */}
                    <div className="space-y-2">
                        <Label htmlFor="technician-select">Select Technician</Label>
                        <Select value={selectedTechId} onValueChange={setSelectedTechId}>
                            <SelectTrigger id="technician-select">
                                <SelectValue placeholder="Choose a technician..." />
                            </SelectTrigger>
                            <SelectContent>
                                {technicians.map((tech) => (
                                    <SelectItem key={tech.id} value={tech.id}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-6 h-6 rounded-full bg-[#2F8E92] text-white flex items-center justify-center text-xs font-bold">
                                                {tech.avatar}
                                            </div>
                                            <span>{tech.name}{tech.code ? ` (${tech.code})` : ''}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Preview Summary */}
                    {selectedTech && (
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                <span className="font-medium">Previewing as:</span>{' '}
                                <span className="font-bold text-[#2F8E92]">{selectedTech.name}</span>
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                You'll see their assigned jobs, available jobs, and portal interface.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleEnterPreview}
                        disabled={!selectedTechId}
                        className="bg-[#2F8E92] hover:bg-[#267276]"
                    >
                        <Eye className="w-4 h-4 mr-2" />
                        Enter Preview Mode
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
