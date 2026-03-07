import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  FileCheck,
  Users,
  UserCircle2,
  Wrench,
  BarChart3,
  Receipt,
  Settings,
  Menu,
  X,
  ChevronDown,
  LogOut,
  Shield,
  RefreshCw,
  Bell,
  Eye,
  UserCog
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TechnicianPreviewModal } from '@/components/modals/TechnicianPreviewModal';

const navItems = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/jobs', label: 'Jobs', icon: Briefcase },
  { path: '/admin/invoice-approvals', label: 'Invoice Approvals', icon: FileCheck },
  { path: '/admin/invoice-history', label: 'Invoice History', icon: Receipt },
  { path: '/admin/technicians', label: 'Technicians', icon: Users },
  { path: '/admin/technician-accounts', label: 'Tech Accounts', icon: UserCog },
  { path: '/admin/dealerships', label: 'Customers', icon: UserCircle2 },
  { path: '/admin/services', label: 'Services', icon: Wrench },
  { path: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
];

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const location = useLocation();
  const activeItem = location.pathname;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'admin-sidebar fixed lg:sticky top-0 left-0 z-50 h-screen w-64 border-r border-slate-200 bg-gradient-to-b from-white to-slate-50',
          'flex flex-col transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#8B5CF6] flex items-center justify-center shadow-sm">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-slate-900 leading-tight">Client-Crew Dispatch</h1>
            <p className="text-xs text-slate-500 font-medium">Operations Center</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeItem === item.path || (item.path !== '/admin' && activeItem.startsWith(item.path));

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full text-left group border',
                  isActive
                    ? 'border-indigo-100 bg-indigo-50 text-indigo-700 shadow-sm dark:bg-slate-800/75 dark:text-cyan-300 dark:shadow-[inset_0_0_0_1px_rgba(45,212,191,0.18)]'
                    : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/55 dark:hover:text-slate-100'
                )}
              >
                <Icon className={cn('w-5 h-5 transition-colors', isActive ? 'text-indigo-600 dark:text-cyan-300' : 'text-slate-500 group-hover:text-slate-900 dark:text-slate-500 dark:group-hover:text-slate-200')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

      </aside>
    </>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 p-1.5 pl-3 pr-2 rounded-full border border-border bg-background hover:bg-muted transition-all shadow-sm">
            <Avatar className="w-8 h-8 border border-border">
              <AvatarImage src={user?.avatar} alt={user?.name} />
              <AvatarFallback className="bg-muted text-primary text-xs font-bold">
                {user?.name?.split(' ').map(n => n[0]).join('').substring(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:block text-left mr-1">
              <p className="text-sm font-medium text-foreground leading-none tracking-wide">ADMIN</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 mt-1">
          <DropdownMenuItem onClick={() => setPreviewModalOpen(true)} className="cursor-pointer">
            <Eye className="w-4 h-4 mr-2" />
            View as Technician
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
            <LogOut className="w-4 h-4 mr-2" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Technician Preview Modal */}
      <TechnicianPreviewModal
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
      />
    </>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('Updated 2 min ago');
  const hideHeaderRefreshControls = location.pathname.startsWith('/admin');

  const headerTitle = (() => {
    const pathname = location.pathname;
    if (pathname.startsWith('/admin/tech-preview')) {
      return 'Technician Preview';
    }
    const matched = [...navItems]
      .sort((a, b) => b.path.length - a.path.length)
      .find((item) => pathname === item.path || (item.path !== '/admin' && pathname.startsWith(item.path)));
    return matched?.label ?? 'Dashboard';
  })();

  const handleRefresh = () => {
    setLastUpdated('Updated just now');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sm-dispatch:admin-refresh', {
        detail: { source: 'header' },
      }));
    }
  };

  return (
    <div className="admin-shell min-h-screen bg-muted/40">
      <div className="flex">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content */}
        <main className="flex-1 min-w-0 flex flex-col min-h-screen">
          {/* Top Header - Sticky */}
          <header className="admin-topbar sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-4 sm:px-8 py-3 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>

              <div className="flex flex-col">
                <h1 className="text-xl font-bold text-foreground tracking-tight">{headerTitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-6">
              {!hideHeaderRefreshControls && (
                <>
                  <span className="hidden sm:block text-xs font-medium text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                    {lastUpdated}
                  </span>

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full border-border text-muted-foreground hover:text-primary hover:border-primary hover:bg-muted transition-all"
                    onClick={handleRefresh}
                    title="Refresh Data"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>

                  <div className="h-6 w-px bg-border hidden sm:block"></div>
                </>
              )}

              <UserMenu />
            </div>
          </header>

          <div className="admin-content flex-1 p-4 lg:p-8 overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
