'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  Megaphone,
  BookOpen,
  PhoneCall,
  Users,
  ArrowLeftRight,
  Wallet,
  CreditCard,
  FlaskConical,
  Settings,
  Building2,
  BarChart3,
  Sliders,
  FileText,
  LogOut,
  Pencil,
  X,
} from 'lucide-react';
import IndiaCallingLogo from '@/components/IndiaCallingLogo';

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenEditProfile?: () => void;
  onExitImpersonation?: () => void;
  exitingImpersonation?: boolean;
  pendingRequestCount?: number;
  user?: {
    name: string;
    email: string;
    role: string;
    roleLabel?: string;
    workspaceName?: string;
    impersonatedBy?: {
      userId: string;
      email: string;
      name: string;
      role: string;
    };
  };
}

interface NavItem {
  label: string;
  subtitle?: string;
  href: string;
  icon: React.ReactNode;
}

// Standalone Analytics tab removed — merged cleanly into Overview
const ORG_NAV_ITEMS: NavItem[] = [
  {
    label: 'Overview',
    href: '/overview',
    icon: <LayoutDashboard className="w-[18px] h-[18px]" />,
  },
  {
    label: 'AI Agents',
    href: '/agents',
    icon: <Bot className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Campaigns',
    href: '/campaigns',
    icon: <Megaphone className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Knowledge Base',
    href: '/knowledge-base',
    icon: <BookOpen className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Call History',
    href: '/calls',
    icon: <PhoneCall className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Leads',
    href: '/leads',
    icon: <Users className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Sales Handoff',
    href: '/sales-handoff',
    icon: <ArrowLeftRight className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Billing & Wallet',
    href: '/billing',
    icon: <Wallet className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Agent Testing',
    href: '/testing',
    icon: <FlaskConical className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: <Settings className="w-[18px] h-[18px]" />,
  },
];

// Super Admin Platform Control Center structured navigation (Zero-PII)
const SUPER_ADMIN_NAV_ITEMS: NavItem[] = [
  {
    label: 'Platform Overview',
    href: '/super-admin',
    icon: <LayoutDashboard className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Organizations',
    href: '/super-admin/organizations',
    icon: <Building2 className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Usage Analytics',
    href: '/super-admin/analytics',
    icon: <BarChart3 className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Billing & Invoices',
    href: '/super-admin/billing',
    icon: <CreditCard className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Service Control',
    href: '/super-admin/service-control',
    icon: <Sliders className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Audit Logs',
    href: '/super-admin/audit-logs',
    icon: <FileText className="w-[18px] h-[18px]" />,
  },
  {
    label: 'Platform Settings',
    href: '/super-admin/settings',
    icon: <Settings className="w-[18px] h-[18px]" />,
  },
];

export default function ClientSidebar({
  mobileOpen = false,
  onCloseMobile,
  onOpenEditProfile,
  onExitImpersonation,
  exitingImpersonation = false,
  pendingRequestCount = 0,
  user: propUser,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [fetchedUser, setFetchedUser] = useState<{
    name: string;
    email: string;
    role: string;
    roleLabel?: string;
    workspaceName?: string;
  }>({
    name: 'Workspace User',
    email: '',
    role: 'organization',
    roleLabel: 'Organization',
    workspaceName: 'IndiaCalling Workspace',
  });

  useEffect(() => {
    if (propUser) return;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setFetchedUser(data.user);
      })
      .catch(() => {});
  }, [propUser]);

  const user = propUser || fetchedUser;
  const isSuperAdmin = user.role === 'super_admin';
  const navItems = isSuperAdmin ? SUPER_ADMIN_NAV_ITEMS : ORG_NAV_ITEMS;

  const isActive = (href: string) => {
    if (href === '/super-admin') return pathname === '/super-admin';
    if (href === '/wallet' && pathname === '/billing') return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const sidebarContent = (
    <aside className="w-[264px] max-w-[85vw] flex-shrink-0 bg-white border-r border-[#E8EAF1] flex flex-col h-[100dvh] select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-[#E8EAF1] flex-shrink-0">
        <Link
          href={isSuperAdmin ? '/super-admin' : '/overview'}
          onClick={onCloseMobile}
          className="min-w-0"
        >
          <IndiaCallingLogo badge={isSuperAdmin ? 'ADMIN' : undefined} />
        </Link>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-2 rounded-xl text-[#747B91] hover:bg-[#F7F8FC] hover:text-[#20243A] transition-colors"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Workspace / Role Card */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <div className="rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747B91]">
              {isSuperAdmin ? 'Platform Control' : 'Organization'}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isSuperAdmin
                  ? 'bg-[#635BFF]/15 text-[#635BFF]'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {isSuperAdmin ? 'Super Admin' : 'Active'}
            </span>
          </div>
          <p className="text-xs font-bold text-[#20243A] truncate mt-1">
            {user.workspaceName ||
              (isSuperAdmin ? 'Platform Control Center' : 'IndiaCalling Workspace')}
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto overscroll-y-contain py-2 px-3 space-y-0.5">
        <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-[#747B91]">
          {isSuperAdmin ? 'Platform Management' : 'Workspace Menu'}
        </p>
        {navItems.map((item) => {
          const active = isActive(item.href);
          const isRequestsLink =
            item.href === '/requests' || item.href === '/super-admin/requests';
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 ${
                active
                  ? 'bg-[#635BFF] text-white shadow-sm shadow-[#635BFF]/20'
                  : 'text-[#20243A] hover:bg-[#F7F8FC]'
              }`}
            >
              <span
                className={`flex-shrink-0 transition-colors ${
                  active ? 'text-white' : 'text-[#747B91] group-hover:text-[#635BFF]'
                }`}
              >
                {item.icon}
              </span>
              <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                <span className="block text-[13px] font-semibold leading-tight truncate">
                  {item.label}
                </span>
                {isRequestsLink && pendingRequestCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                      active ? 'bg-white text-[#635BFF]' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer Profile + Edit Name + Sign Out */}
      <div className="p-3 border-t border-[#E8EAF1] bg-white flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-[#F7F8FC] transition-colors">
          <div className="w-8 h-8 rounded-full bg-[#635BFF]/10 text-[#635BFF] flex items-center justify-center font-bold text-xs flex-shrink-0">
            {(user.name || 'U')
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[#20243A] truncate">{user.name}</p>
            <p className="text-[11px] text-[#747B91] truncate">{user.email}</p>
          </div>
          {onOpenEditProfile && (
            <button
              type="button"
              onClick={() => {
                onCloseMobile?.();
                onOpenEditProfile();
              }}
              className="p-1.5 rounded-lg text-[#747B91] hover:text-[#635BFF] hover:bg-[#EEF0FF] transition-colors"
              title="Edit display name"
              aria-label="Edit display name"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {onExitImpersonation && (
          <button
            type="button"
            onClick={() => {
              onCloseMobile?.();
              onExitImpersonation();
            }}
            disabled={exitingImpersonation}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 flex-shrink-0" />
            {exitingImpersonation ? 'Returning...' : 'Return to Super Admin'}
          </button>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#747B91] hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:flex h-[100dvh] flex-shrink-0">{sidebarContent}</div>

      {/* Smooth Mobile Slide-Out Drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-200 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!mobileOpen}
      >
        <div
          className="fixed inset-0 bg-[#20243A]/45 backdrop-blur-[2px]"
          onClick={onCloseMobile}
        />
        <div
          className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out will-change-transform ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </div>
      </div>
    </>
  );
}
