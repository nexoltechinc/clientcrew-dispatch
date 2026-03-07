import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from '@/components/ui/sonner';
import { AdminLayout } from '@/layouts/AdminLayout';
import { HomeRoute, PublicOnly, RequireRole } from '@/components/auth/RouteGuards';
import AdminLoginPage from '@/pages/auth/AdminLogin';
import TechnicianLoginPage from '@/pages/auth/TechnicianLogin';
import TechnicianSignupPage from '@/pages/auth/TechnicianSignup';

// Admin Pages
import AdminDashboard from '@/pages/admin/Dashboard';
import JobsPage from '@/pages/admin/Jobs';
import JobDetailPage from '@/pages/admin/JobDetail';
import InvoiceApprovalsPage from '@/pages/admin/InvoiceApprovals';
import TechniciansPage from '@/pages/admin/Technicians';
import TechnicianAccountsPage from '@/pages/admin/TechnicianAccounts';
import DealershipsPage from '@/pages/admin/Dealerships';
import ServicesPage from '@/pages/admin/Services';
import ReportsPage from '@/pages/admin/Reports';
import SettingsPage from '@/pages/admin/Settings';
import InvoiceHistoryPage from '@/pages/admin/InvoiceHistory';

// Admin Preview Mode
import TechnicianPreview from '@/pages/admin/TechnicianPreview';

// Technician Pages
import AvailableJobsPage from '@/pages/technician/AvailableJobs';
import MyJobsPage from '@/pages/technician/MyJobs';
import JobHistoryPage from '@/pages/technician/JobHistory';
import ProfilePage from '@/pages/technician/Profile';

function PlaceholderPage({ title }: { title: string }) {
  return <div className="p-4"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-2 text-gray-500">Functionality coming soon.</p></div>;
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomeRoute />} />

          {/* Login Portals */}
          <Route path="/login" element={<PublicOnly><AdminLoginPage /></PublicOnly>} />
          <Route path="/admin/login" element={<PublicOnly><AdminLoginPage /></PublicOnly>} />
          <Route path="/tech/login" element={<PublicOnly><TechnicianLoginPage /></PublicOnly>} />
          <Route path="/tech/signup" element={<PublicOnly><TechnicianSignupPage /></PublicOnly>} />

          {/* Admin Preview Mode - Technician Portal Preview (No AdminLayout) */}
          <Route
            path="/admin/tech-preview/:techId/jobs"
            element={
              <RequireRole role="admin">
                <TechnicianPreview view="jobs" />
              </RequireRole>
            }
          />
          <Route
            path="/admin/tech-preview/:techId/current-job"
            element={
              <RequireRole role="admin">
                <TechnicianPreview view="current-job" />
              </RequireRole>
            }
          />
          <Route
            path="/admin/tech-preview/:techId/history"
            element={
              <RequireRole role="admin">
                <TechnicianPreview view="history" />
              </RequireRole>
            }
          />
          {/* Backward compatibility aliases */}
          <Route
            path="/admin/tech-preview/:techId/available-jobs"
            element={
              <RequireRole role="admin">
                <Navigate to="../jobs" replace />
              </RequireRole>
            }
          />
          <Route
            path="/admin/tech-preview/:techId/my-jobs"
            element={
              <RequireRole role="admin">
                <Navigate to="../current-job" replace />
              </RequireRole>
            }
          />
          <Route
            path="/admin/tech-preview/:techId/assigned"
            element={
              <RequireRole role="admin">
                <Navigate to="../current-job" replace />
              </RequireRole>
            }
          />
          <Route
            path="/admin/tech-preview/:techId/schedule"
            element={
              <RequireRole role="admin">
                <Navigate to="../history" replace />
              </RequireRole>
            }
          />
          <Route
            path="/admin/tech-preview/:techId/profile"
            element={
              <RequireRole role="admin">
                <TechnicianPreview view="profile" />
              </RequireRole>
            }
          />
          <Route
            path="/admin/tech-preview/:techId/profile/settings"
            element={
              <RequireRole role="admin">
                <TechnicianPreview view="profile" />
              </RequireRole>
            }
          />
          {/* Default preview route redirects to jobs */}
          <Route
            path="/admin/tech-preview/:techId"
            element={
              <RequireRole role="admin">
                <Navigate to="jobs" replace />
              </RequireRole>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin/*"
            element={
              <RequireRole role="admin">
                <AdminLayout>
                  <Routes>
                    <Route index element={<AdminDashboard />} />
                    <Route path="jobs" element={<JobsPage />} />
                    <Route path="jobs/:jobId" element={<JobDetailPage />} />
                    <Route path="invoice-approvals" element={<InvoiceApprovalsPage />} />
                    <Route path="invoice-history" element={<InvoiceHistoryPage />} />
                    <Route path="technicians" element={<TechniciansPage />} />
                    <Route path="technician-accounts" element={<TechnicianAccountsPage />} />
                    <Route path="dealerships" element={<DealershipsPage />} />
                    <Route path="services" element={<ServicesPage />} />
                    <Route path="reports" element={<ReportsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Routes>
                </AdminLayout>
              </RequireRole>
            }
          />

          {/* Technician Routes (No Layout - Mobile First) */}
          <Route
            path="/tech"
            element={
              <RequireRole role="technician">
                <Navigate to="/tech/jobs" replace />
              </RequireRole>
            }
          />
          {/* Backward compatibility aliases */}
          <Route
            path="/tech/assigned"
            element={
              <RequireRole role="technician">
                <Navigate to="/tech/current-job" replace />
              </RequireRole>
            }
          />
          <Route
            path="/tech/available-jobs"
            element={
              <RequireRole role="technician">
                <Navigate to="/tech/jobs" replace />
              </RequireRole>
            }
          />
          <Route
            path="/tech/my-jobs"
            element={
              <RequireRole role="technician">
                <Navigate to="/tech/current-job" replace />
              </RequireRole>
            }
          />
          <Route
            path="/tech/schedule"
            element={
              <RequireRole role="technician">
                <Navigate to="/tech/history" replace />
              </RequireRole>
            }
          />
          <Route
            path="/tech/jobs"
            element={
              <RequireRole role="technician">
                <AvailableJobsPage />
              </RequireRole>
            }
          />
          <Route
            path="/tech/current-job"
            element={
              <RequireRole role="technician">
                <MyJobsPage />
              </RequireRole>
            }
          />
          <Route
            path="/tech/history"
            element={
              <RequireRole role="technician">
                <JobHistoryPage />
              </RequireRole>
            }
          />
          <Route
            path="/tech/profile"
            element={
              <RequireRole role="technician">
                <ProfilePage />
              </RequireRole>
            }
          />
          <Route
            path="/tech/profile/settings"
            element={
              <RequireRole role="technician">
                <ProfilePage />
              </RequireRole>
            }
          />
          {/* Catch-all for unknown technician routes */}
          <Route
            path="/tech/*"
            element={
              <RequireRole role="technician">
                <Navigate to="/tech/jobs" replace />
              </RequireRole>
            }
          />

          <Route path="*" element={<HomeRoute />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
