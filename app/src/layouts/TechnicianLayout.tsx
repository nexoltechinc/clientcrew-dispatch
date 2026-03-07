import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ClipboardList,
  UserCheck,
  Calendar,
  User,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Wrench,
} from 'lucide-react';
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

const navItems = [
  { path: '/tech/jobs', label: 'Jobs', icon: ClipboardList },
  { path: '/tech/current-job', label: 'Current Job', icon: UserCheck },
  { path: '/tech/history', label: 'History', icon: Calendar },
  { path: '/tech/profile', label: 'Profile', icon: User },
];

function DesktopSidebar() {
  const location = useLocation();
  const activeItem = location.pathname;
  const { user, logout } = useAuth();

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 bg-white border-r border-gray-100">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
        <div className="w-9 h-9 rounded-xl bg-[#2F8E92] flex items-center justify-center">
          <Wrench className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-gray-900 leading-tight">SM2 Dispatch</h1>
          <p className="text-xs text-gray-500">Technician Portal</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.path;

          return (
            <Link
              key={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors w-full text-left ${isActive
                  ? 'bg-[#E6F4F4] text-[#2F8E92]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              to={item.path}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-[#2F8E92]' : 'text-gray-400'}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User menu */}
      <div className="p-4 border-t border-gray-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-gray-50 transition-colors">
              <Avatar className="w-9 h-9">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback className="bg-[#E6F4F4] text-[#2F8E92] text-sm">
                  {user?.name?.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500">Technician</p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="cursor-pointer text-rose-600">
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useAuth();

  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#2F8E92] flex items-center justify-center">
            <Wrench className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-gray-900">SM2 Dispatch</span>
        </div>
        <div className="flex items-center gap-2">
          <Avatar className="w-8 h-8">
            <AvatarImage src={user?.avatar} alt={user?.name} />
            <AvatarFallback className="bg-[#E6F4F4] text-[#2F8E92] text-xs">
              {user?.name?.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <Button variant="ghost" size="icon" onClick={onMenuClick}>
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function MobileNav() {
  const location = useLocation();
  const activeItem = location.pathname;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.path;

          return (
            <Link
              key={item.path}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${isActive ? 'text-[#2F8E92]' : 'text-gray-400 hover:text-gray-600'
                }`}
              to={item.path}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function MobileMenu({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { logout } = useAuth();

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />
      <div className="fixed top-0 right-0 bottom-0 w-64 bg-white z-50 p-4 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-gray-900">Menu</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="space-y-2">

          <button
            onClick={() => {
              logout();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="w-5 h-5" />
            Log out
          </button>
        </div>
      </div>
    </>
  );
}

export function TechnicianLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <MobileHeader onMenuClick={() => setMenuOpen(true)} />
      <MobileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex">
        <DesktopSidebar />

        {/* Main content */}
        <main className="flex-1 min-w-0 pb-20 lg:pb-0">
          <div className="p-4 lg:p-8">
            {children}
          </div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
