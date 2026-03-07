import { useState, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { AdminPreviewBanner } from '@/components/AdminPreviewBanner';
import { useAuth } from '@/contexts/AuthContext';

// Import Technician Pages
import AvailableJobsPage from '@/pages/technician/AvailableJobs';
import MyJobsPage from '@/pages/technician/MyJobs';
import JobHistoryPage from '@/pages/technician/JobHistory';
import ProfilePage from '@/pages/technician/Profile';

interface TechPreviewProps {
    view: 'jobs' | 'current-job' | 'history' | 'profile';
}

export default function TechnicianPreview({ view }: TechPreviewProps) {
    const { techId } = useParams();
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const { technicianAccounts } = useAuth();

    useEffect(() => {
        // In production: Check if user is actually an admin
        // For now, we'll allow preview if valid techId
        const checkAuthorization = async () => {
            // Simulate auth check
            await new Promise(resolve => setTimeout(resolve, 100));

            // In production:
            // const isAdmin = await checkAdminRole();
            // const exists = await api.technicians.exists(techId);
            // setIsAuthorized(isAdmin && exists);

            const isValidTechnician = technicianAccounts.some((tech) => tech.id === techId);
            setIsAuthorized(Boolean(techId && isValidTechnician));
        };

        checkAuthorization();
    }, [techId, technicianAccounts]);

    // Loading state
    if (isAuthorized === null) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-[#2F8E92] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading preview...</p>
                </div>
            </div>
        );
    }

    // Unauthorized - redirect to admin
    if (!isAuthorized) {
        return <Navigate to="/admin" replace />;
    }

    // Render technician view with admin preview banner
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            {/* Admin Preview Banner - Always visible */}
            <AdminPreviewBanner />

            {/* Technician Portal Content */}
            <div>
                {view === 'jobs' && <AvailableJobsPage />}
                {view === 'current-job' && <MyJobsPage />}
                {view === 'history' && <JobHistoryPage />}
                {view === 'profile' && <ProfilePage />}
            </div>
        </div>
    );
}
