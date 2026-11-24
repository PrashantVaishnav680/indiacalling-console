'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import ClientSidebar from './ClientSidebar';
import ClientTopBar, { TopBarNotificationItem } from './ClientTopBar';

const READ_NOTIF_STORAGE_KEY = 'ic_read_notifications_v1';

interface DashboardShellProps {
  children: React.ReactNode;
  initialUser?: {
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

function loadStoredReadIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = window.localStorage.getItem(READ_NOTIF_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed.map(String);
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

export default function DashboardShell({
  children,
  initialUser,
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState(initialUser?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [user, setUser] = useState(
    initialUser || {
      name: 'Workspace User',
      email: '',
      role: 'organization',
      roleLabel: 'Organization',
      workspaceName: 'IndiaCalling Workspace',
    }
  );
  const [balanceInr, setBalanceInr] = useState<number | null>(null);
  const [pendingNotifications, setPendingNotifications] = useState<TopBarNotificationItem[]>([]);
  const [readNotifIds, setReadNotifIds] = useState<string[]>(loadStoredReadIds);
  const [exitingImpersonation, setExitingImpersonation] = useState(false);

  const persistReadIds = useCallback((ids: string[]) => {
    const trimmed = Array.from(new Set(ids)).slice(-100);
    setReadNotifIds(trimmed);
    try {
      window.localStorage.setItem(READ_NOTIF_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // ignore storage errors
    }
  }, []);

  const markNotificationRead = useCallback(
    (id: string) => {
      if (!id) return;
      persistReadIds([...readNotifIds, id]);
    },
    [persistReadIds, readNotifIds]
  );

  const handleExitImpersonation = async () => {
    setExitingImpersonation(true);
    try {
      const res = await fetch('/api/super-admin/impersonate/stop', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        window.location.assign(data.redirectTo || '/super-admin/organizations');
        return;
      }
    } catch {
      // ignore
    } finally {
      setExitingImpersonation(false);
    }
  };

  const handleSignOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  // Prevent background page scroll when mobile navigation drawer is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [mobileOpen]);

  // Load auth & balance once on mount (prevents route-change navbar lag)
  const refreshSessionAndWallet = useCallback(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          setProfileNameInput(data.user.name || '');
          if (data.user.role === 'organization') {
            fetch('/api/billing')
              .then((br) => (br.ok ? br.json() : null))
              .then((bData) => {
                if (typeof bData?.billing?.balanceInr === 'number') {
                  setBalanceInr(bData.billing.balanceInr);
                }
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, []);

  const refreshRequestNotifications = useCallback(async (roleStr: string) => {
    try {
      if (roleStr === 'super_admin') {
        const res = await fetch('/api/super-admin/requests');
        if (!res.ok) return;
        const json = await res.json();
        const incomingPending = (json.requests || []).filter(
          (r: any) => r.direction === 'org_to_admin' && r.status === 'pending'
        );
        const items: TopBarNotificationItem[] = incomingPending.slice(0, 8).map((r: any) => ({
          id: String(r._id),
          title: r.title,
          subtitle: `${r.organizationName} · ${r.type.replace(/_/g, ' ')}`,
          href: '/super-admin/requests',
          createdAt: r.createdAt,
        }));
        setPendingNotifications(items);
      } else {
        const res = await fetch('/api/requests');
        if (!res.ok) return;
        const json = await res.json();
        const incomingPending = (json.requests || []).filter(
          (r: any) => r.direction === 'admin_to_org' && r.status === 'pending'
        );
        setPendingNotifications(
          incomingPending.slice(0, 8).map((r: any) => ({
            id: String(r._id),
            title: r.title,
            subtitle: `From ${r.requestedByName || 'Platform Admin'}`,
            href: '/requests',
            createdAt: r.createdAt,
          }))
        );
      }
    } catch {
      // ignore polling errors
    }
  }, []);

  const currentRole = user.role;

  useEffect(() => {
    if (!currentRole) return;
    const init = setTimeout(() => {
      refreshRequestNotifications(currentRole);
    }, 0);
    const interval = setInterval(() => {
      refreshRequestNotifications(currentRole);
    }, 20000);
    return () => {
      clearTimeout(init);
      clearInterval(interval);
    };
  }, [currentRole, pathname, refreshRequestNotifications]);

  const isSuperAdminPath = pathname.startsWith('/super-admin');
  useEffect(() => {
    refreshSessionAndWallet();
  }, [refreshSessionAndWallet, isSuperAdminPath]);

  const combinedNotifications = useMemo<TopBarNotificationItem[]>(() => {
    const walletItems: TopBarNotificationItem[] = [];
    if (currentRole === 'organization' && typeof balanceInr === 'number') {
      if (balanceInr <= 0) {
        walletItems.push({
          id: 'wallet_payment_required',
          title: 'Payment Required — Wallet Empty (₹0.00)',
          subtitle: 'Add credits in Billing & Wallet to continue calling.',
          href: '/billing',
        });
      } else if (balanceInr < 250) {
        walletItems.push({
          id: `wallet_low_balance_${Math.floor(balanceInr)}`,
          title: `Low Wallet Balance (₹${balanceInr.toFixed(2)})`,
          subtitle: 'Top up your wallet when ready to avoid interruptions.',
          href: '/billing',
        });
      }
    }
    const readSet = new Set(readNotifIds);
    return [...walletItems, ...pendingNotifications].map((item) => ({
      ...item,
      read: readSet.has(item.id),
    }));
  }, [currentRole, balanceInr, pendingNotifications, readNotifIds]);

  const unreadCount = useMemo(
    () => combinedNotifications.filter((n) => !n.read).length,
    [combinedNotifications]
  );

  const markAllNotificationsRead = useCallback(() => {
    const allIds = combinedNotifications.map((n) => n.id);
    if (allIds.length > 0) {
      persistReadIds([...readNotifIds, ...allIds]);
    }
  }, [combinedNotifications, persistReadIds, readNotifIds]);

  const openEditProfile = () => {
    setProfileNameInput(user.name || '');
    setProfileError('');
    setProfileSuccess('');
    setEditProfileOpen(true);
  };

  const handleSaveProfileName = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = profileNameInput.trim();
    if (cleaned.length < 2) {
      setProfileError('Please enter at least 2 characters.');
      return;
    }
    setSavingProfile(true);
    setProfileError('');
    setProfileSuccess('');
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileError(data.error || 'Could not update display name.');
      } else {
        setUser((prev) => ({ ...prev, name: data.user?.name || cleaned }));
        setProfileSuccess('Display name updated!');
        setTimeout(() => {
          setEditProfileOpen(false);
          setProfileSuccess('');
        }, 700);
      }
    } catch {
      setProfileError('Network error while updating display name.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] w-full bg-[#F7F8FC] overflow-hidden">
      <ClientSidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onOpenEditProfile={openEditProfile}
        onExitImpersonation={user?.impersonatedBy ? handleExitImpersonation : undefined}
        exitingImpersonation={exitingImpersonation}
        user={user}
        pendingRequestCount={unreadCount}
      />
      <div className="flex flex-col flex-1 min-w-0 h-[100dvh] overflow-hidden">
        {user?.impersonatedBy && (
          <div className="shrink-0 bg-amber-600 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold shadow-sm z-40 border-b border-amber-700/40">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex h-2 w-2 rounded-full bg-white animate-pulse shrink-0" />
              <span className="truncate">
                Acting as {user.workspaceName || 'Organization'} — Authorized Managed Service Session
              </span>
              <span className="hidden md:inline text-amber-100 font-normal truncate">
                ({user.impersonatedBy.email})
              </span>
            </div>
            <button
              type="button"
              onClick={handleExitImpersonation}
              disabled={exitingImpersonation}
              className="shrink-0 px-3 py-1 rounded-lg bg-white text-amber-900 hover:bg-amber-50 font-bold text-xs transition-colors disabled:opacity-60 shadow-xs"
            >
              {exitingImpersonation ? 'Returning...' : '← Return to Super Admin'}
            </button>
          </div>
        )}
        <ClientTopBar
          onOpenMobileMenu={() => setMobileOpen(true)}
          onOpenEditProfile={openEditProfile}
          onExitImpersonation={user?.impersonatedBy ? handleExitImpersonation : undefined}
          exitingImpersonation={exitingImpersonation}
          onSignOut={handleSignOut}
          user={user}
          balanceInr={balanceInr}
          pendingRequestCount={unreadCount}
          pendingNotifications={combinedNotifications}
          onMarkNotificationRead={markNotificationRead}
          onMarkAllNotificationsRead={markAllNotificationsRead}
        />
        <main className="flex-1 overflow-y-auto overscroll-y-contain p-4 sm:p-6">
          <div className="max-w-[1440px] mx-auto w-full">{children}</div>
        </main>
      </div>

      {/* Global Edit Profile Name Modal */}
      {editProfileOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#20243A]/45 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-[#E8EAF1] shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#20243A]">Edit Display Name</h2>
                <p className="text-xs text-[#747B91] mt-0.5">
                  Updates your profile name across the workspace immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditProfileOpen(false)}
                className="p-1.5 rounded-lg text-[#747B91] hover:bg-[#F7F8FC] hover:text-[#20243A]"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveProfileName} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={profileNameInput}
                  onChange={(e) => setProfileNameInput(e.target.value)}
                  placeholder="Enter your full name"
                  maxLength={80}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8EAF1] text-sm text-[#20243A] focus:outline-none focus:border-[#635BFF] focus:ring-2 focus:ring-[#635BFF]/15"
                  autoFocus
                />
              </div>
              {profileError && (
                <p className="text-xs font-medium text-red-600">{profileError}</p>
              )}
              {profileSuccess && (
                <p className="text-xs font-medium text-emerald-600">{profileSuccess}</p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditProfileOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#747B91] hover:bg-[#F7F8FC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-4 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {savingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
