'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  Plus,
  ShieldCheck,
  Wallet,
  Pencil,
  ChevronDown,
  Settings,
  LogOut,
  ArrowLeftRight,
  Bell,
  CheckCheck,
} from 'lucide-react';

const pathToTitle: Record<string, string> = {
  '/super-admin': 'Platform Control Center',
  '/super-admin/organizations': 'Organization Management',
  '/super-admin/activity': 'Activity Monitoring',
  '/super-admin/analytics': 'Usage Analytics',
  '/super-admin/billing': 'Billing & Invoices',
  '/super-admin/service-control': 'Service Control',
  '/super-admin/requests': 'Organization Requests',
  '/super-admin/audit-logs': 'Audit Logs',
  '/super-admin/settings': 'Platform Settings',
  '/overview': 'Organization Overview',
  '/agents': 'AI Voice Agents',
  '/knowledge-base': 'Knowledge Base',
  '/campaigns': 'Campaigns',
  '/calls': 'Call History',
  '/leads': 'Qualified Leads Pipeline',
  '/sales-handoff': 'Sales Handoff',
  '/wallet': 'Wallet & Usage Ledger',
  '/subscription': 'Subscription & Plans',
  '/billing': 'Billing & Wallet',
  '/requests': 'Requests & Approvals',
  '/settings': 'Organization Settings',
  '/testing': 'AI Agent Testing',
};

function getTitle(pathname: string): string {
  if (pathname === '/super-admin') return 'Platform Control Center';
  for (const [path, title] of Object.entries(pathToTitle)) {
    if (path !== '/super-admin' && (pathname === path || pathname.startsWith(path + '/'))) {
      return title;
    }
  }
  return 'Dashboard';
}

export interface TopBarNotificationItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  createdAt?: string;
  read?: boolean;
}

interface TopBarProps {
  onOpenMobileMenu?: () => void;
  onOpenEditProfile?: () => void;
  onExitImpersonation?: () => void;
  exitingImpersonation?: boolean;
  onSignOut?: () => void;
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
  balanceInr?: number | null;
  pendingRequestCount?: number;
  pendingNotifications?: TopBarNotificationItem[];
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
}

export default function ClientTopBar({
  onOpenMobileMenu,
  onOpenEditProfile,
  onExitImpersonation,
  exitingImpersonation = false,
  onSignOut,
  user,
  balanceInr,
  pendingRequestCount = 0,
  pendingNotifications = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
}: TopBarProps) {
  const pathname = usePathname();
  const title = getTitle(pathname);
  const isSuperAdmin = user?.role === 'super_admin';
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-xs border-b border-[#E8EAF1] flex items-center justify-between px-3 sm:px-6 flex-shrink-0 gap-2 sm:gap-3">
      {/* Left: Mobile Drawer Toggle + Page Title */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 rounded-xl border border-[#E8EAF1] text-[#20243A] hover:bg-[#F7F8FC] active:scale-95 transition-all flex-shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-sm sm:text-lg font-bold text-[#20243A] truncate">
            {title}
          </h1>
        </div>
      </div>

      {/* Right: Quick Action, Wallet / Zero-PII Pill, Role Indicator, Bell & Profile Menu */}
      <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
        {isSuperAdmin ? (
          <>
            <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] sm:text-xs font-semibold text-emerald-700 whitespace-nowrap">
              <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="hidden xs:inline sm:inline">Zero-PII Active</span>
              <span className="sm:hidden">Zero-PII</span>
            </span>
            <Link
              href="/super-admin/organizations?create=1"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="sm:hidden">New Org</span>
              <span className="hidden sm:inline">Create Organization</span>
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/billing"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F7F8FC] border border-[#E8EAF1] hover:border-[#635BFF] text-xs font-semibold text-[#20243A] transition-colors whitespace-nowrap"
            >
              <Wallet className="w-3.5 h-3.5 text-[#13B8A6]" />
              <span>
                Balance:{' '}
                <strong className="text-[#20243A]">
                  ₹{(balanceInr ?? 3000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </span>
            </Link>
            <Link
              href="/campaigns/new"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="sm:hidden">Campaign</span>
              <span className="hidden sm:inline">New Campaign</span>
            </Link>
          </>
        )}

        <Link
          href={isSuperAdmin ? '/super-admin/organizations' : '/settings'}
          title={isSuperAdmin ? 'View Organizations Directory' : 'View Organization Profile & Settings'}
          className="hidden xl:inline-flex items-center px-2.5 py-1 rounded-full bg-[#EEF0FF] hover:bg-[#635BFF] hover:text-white border border-[#C7CBFF] text-[11px] font-bold text-[#635BFF] transition-colors whitespace-nowrap"
        >
          {isSuperAdmin ? 'Super Admin' : 'Organization'}
        </Link>

        {/* Live Request & Wallet Notifications Bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setNotifOpen((o) => !o);
            }}
            className={`relative p-2 rounded-xl border transition-all duration-150 active:scale-95 ${
              notifOpen
                ? 'border-[#635BFF] bg-[#EEF0FF]/60 text-[#635BFF]'
                : 'border-[#E8EAF1] bg-white hover:bg-[#F7F8FC] text-[#20243A]'
            }`}
            title="Notifications & Pending Requests"
            aria-label="Open notifications"
          >
            <Bell className="w-4 h-4" />
            {pendingRequestCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
              </span>
            )}
          </button>

          <div
            className={`absolute right-0 mt-2 w-80 max-w-[90vw] rounded-2xl bg-white border border-[#E8EAF1] shadow-xl overflow-hidden z-50 origin-top-right transition-all duration-150 ${
              notifOpen
                ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
            }`}
            aria-hidden={!notifOpen}
          >
            <div className="px-4 py-3 border-b border-[#E8EAF1] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#20243A]">Notifications</span>
                {pendingRequestCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-bold">
                    {pendingRequestCount} new
                  </span>
                )}
              </div>
              {pendingRequestCount > 0 && onMarkAllNotificationsRead && (
                <button
                  type="button"
                  onClick={onMarkAllNotificationsRead}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#635BFF] hover:underline"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
            </div>
            {pendingNotifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[#747B91]">
                You&apos;re all caught up! No pending alerts.
              </div>
            ) : (
              <div className="divide-y divide-[#E8EAF1] max-h-72 overflow-y-auto">
                {pendingNotifications.map((item) => {
                  const isUnread = !item.read;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => {
                        onMarkNotificationRead?.(item.id);
                        setNotifOpen(false);
                      }}
                      className={`flex items-start gap-2.5 px-4 py-3 transition-colors ${
                        isUnread
                          ? 'bg-[#EEF0FF]/45 hover:bg-[#EEF0FF]/70'
                          : 'bg-white hover:bg-[#F7F8FC] opacity-75'
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
                          isUnread ? 'bg-[#635BFF]' : 'bg-transparent'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs truncate ${
                            isUnread ? 'font-bold text-[#20243A]' : 'font-medium text-[#747B91]'
                          }`}
                        >
                          {item.title}
                        </p>
                        <p className="text-[11px] text-[#747B91] truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
            <Link
              href={isSuperAdmin ? '/super-admin/requests' : '/requests'}
              onClick={() => setNotifOpen(false)}
              className="block px-4 py-2.5 bg-[#F7F8FC] border-t border-[#E8EAF1] text-center text-xs font-semibold text-[#635BFF] hover:underline"
            >
              View All Requests →
            </Link>
          </div>
        </div>

        {/* Profile Avatar + Dropdown with Edit Name */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              setNotifOpen(false);
              setMenuOpen((o) => !o);
            }}
            className="flex items-center gap-1.5 p-1 pr-2 rounded-full hover:bg-[#F7F8FC] border border-transparent hover:border-[#E8EAF1] transition-colors"
            title={user?.name || 'Profile'}
            aria-label="Open profile menu"
          >
            <div className="w-8 h-8 rounded-full bg-[#635BFF] flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white font-bold text-xs">
                {(user?.name || 'US')
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#747B91] hidden sm:block transition-transform duration-150 ${
                menuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <div
            className={`absolute right-0 mt-2 w-60 rounded-2xl bg-white border border-[#E8EAF1] shadow-xl py-2 z-50 origin-top-right transition-all duration-150 ${
              menuOpen
                ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
            }`}
            aria-hidden={!menuOpen}
          >
            <div className="px-4 py-2 border-b border-[#E8EAF1]">
              <p className="text-xs font-bold text-[#20243A] truncate">
                {user?.name || 'Workspace User'}
              </p>
              <p className="text-[11px] text-[#747B91] truncate">{user?.email || ''}</p>
            </div>
            {onOpenEditProfile && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenEditProfile();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-[#20243A] hover:bg-[#F7F8FC] transition-colors text-left"
              >
                <Pencil className="w-3.5 h-3.5 text-[#635BFF]" />
                Edit Display Name
              </button>
            )}
            <Link
              href={isSuperAdmin ? '/super-admin/settings' : '/settings'}
              onClick={() => setMenuOpen(false)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-[#20243A] hover:bg-[#F7F8FC] transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-[#747B91]" />
              {isSuperAdmin ? 'Platform Settings' : 'Account Settings'}
            </Link>
            {onExitImpersonation && (
              <button
                type="button"
                disabled={exitingImpersonation}
                onClick={() => {
                  setMenuOpen(false);
                  onExitImpersonation();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-amber-800 bg-amber-50/70 hover:bg-amber-100 border-t border-[#E8EAF1] transition-colors text-left"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-amber-700" />
                {exitingImpersonation ? 'Returning...' : 'Return to Super Admin'}
              </button>
            )}
            {onSignOut && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSignOut();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 border-t border-[#E8EAF1] transition-colors text-left"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
                Sign Out
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
