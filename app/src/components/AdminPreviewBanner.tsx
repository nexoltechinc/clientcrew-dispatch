import { useMemo } from 'react';
import { X, AlertTriangle, Eye } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

export function AdminPreviewBanner() {
    const navigate = useNavigate();
    const { techId } = useParams();
    const { technicianAccounts } = useAuth();

    const technician = useMemo(
        () => technicianAccounts.find((tech) => tech.id === techId),
        [techId, technicianAccounts]
    );
    const techName = technician?.name || 'Unknown Technician';

    const handleExitPreview = () => {
        // Return to admin dashboard
        navigate('/admin');
    };

    return (
        <div className="sticky top-0 z-50 bg-orange-500 dark:bg-orange-600 text-white shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between py-3">
                    {/* Left: Warning Icon & Message */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-white/20 rounded-lg">
                            <Eye className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="font-bold text-sm uppercase tracking-wide">
                                    Admin Preview Mode
                                </span>
                            </div>
                            <p className="text-xs text-orange-100 mt-0.5">
                                Viewing as <span className="font-semibold">{techName}</span> •
                                Your admin role and permissions are maintained
                            </p>
                        </div>
                    </div>

                    {/* Right: Exit Button */}
                    <Button
                        onClick={handleExitPreview}
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "bg-white/20 hover:bg-white/30 text-white hover:text-white",
                            "border border-white/40 font-semibold",
                            "transition-all hover:shadow-lg"
                        )}
                    >
                        <X className="w-4 h-4 mr-2" />
                        Exit Preview
                    </Button>
                </div>
            </div>
        </div>
    );
}
