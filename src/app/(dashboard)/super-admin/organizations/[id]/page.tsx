'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ShieldCheck,
  Building2,
  Bot,
  PhoneCall,
  Wallet,
  Activity,
  Sliders,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Clock,
  ExternalLink,
  Users,
  Trash2,
  AlertTriangle,
  Mail,
  Phone,
  MapPin,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

export default function SuperAdminOrganizationInspectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orgId = params?.id;
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<any>(null);
  const [trendMode, setTrendMode] = useState<'daily' | 'weekly'>('daily');
  const [busy, setBusy] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  // Permanent Delete Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingOrg, setDeletingOrg] = useState(false);

  // Editable Service Limits
  const [limits, setLimits] = useState({
    maxAgents: 25,
    maxConcurrentCalls: 10,
    monthlyCallLimit: 10000,
    ratePerMinuteInr: 6,
    planName: 'Standard Pay-As-You-Go',
  });

  const loadOrg = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/organizations/${orgId}`);
      if (res.ok) {
        const json = await res.json();
        const o = json.organization;
        setOrg(o);
        setLimits({
          maxAgents: o.limits?.maxAgents ?? 25,
          maxConcurrentCalls: o.limits?.maxConcurrentCalls ?? 10,
          monthlyCallLimit: o.limits?.monthlyCallLimit ?? 10000,
          ratePerMinuteInr: o.billingBreakdown?.ratePerMinuteInr ?? 6,
          planName: o.planName || 'Standard Pay-As-You-Go',
        });
      } else {
        toast.error('Organization not found.');
      }
    } catch {
      toast.error('Failed to inspect organization.');
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  useEffect(() => {
    loadOrg();
  }, [loadOrg]);

  const handleOpenWorkspace = async () => {
    if (!org) return;
    setImpersonating(true);
    try {
      const res = await fetch('/api/super-admin/impersonate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: org._id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not open organization workspace.');
        setImpersonating(false);
        return;
      }
      toast.success(`Opening ${org.name} workspace...`);
      window.location.assign(data.redirectTo || '/overview');
    } catch {
      toast.error('Unable to reach server while opening organization workspace.');
      setImpersonating(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!org) return;
    const nextStatus = org.status === 'active' ? 'suspended' : 'active';
    setBusy(true);
    try {
      const res = await fetch(`/api/super-admin/organizations/${org._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        toast.success(`${org.name} is now ${nextStatus}.`);
        loadOrg();
      } else {
        toast.error('Could not update organization status.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/super-admin/organizations/${org._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(limits),
      });
      if (res.ok) {
        toast.success('Organization limits and rate updated.');
        loadOrg();
      } else {
        toast.error('Failed to save limits.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDeleteOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      toast.error('Type DELETE to confirm permanent removal.');
      return;
    }
    setDeletingOrg(true);
    try {
      const res = await fetch(`/api/super-admin/organizations/${org._id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not remove organization.');
      } else {
        toast.success(data.message || `${org.name} has been permanently removed.`);
        setShowDeleteModal(false);
        router.push('/super-admin/organizations');
      }
    } catch {
      toast.error('Unable to remove organization right now.');
    } finally {
      setDeletingOrg(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-28 rounded-2xl shimmer-loading" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl shimmer-loading" />
          ))}
        </div>
        <div className="h-72 rounded-2xl shimmer-loading" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-10 text-center space-y-3">
        <p className="text-sm font-bold text-[#20243A]">Organization not found</p>
        <Link
          href="/super-admin/organizations"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#635BFF] hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Organizations
        </Link>
      </div>
    );
  }

  const gst = org.billingBreakdown || {};
  const trends: any[] = org.activityTrends?.[trendMode] || [];
  const logs: any[] = Array.isArray(org.recentAuditLogs) ? org.recentAuditLogs : [];
  const teamMembers: any[] = Array.isArray(org.teamMembers) ? org.teamMembers : [];

  return (
    <div className="space-y-6">
      {/* Back + Header + Direct Actions */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <Link
            href="/super-admin/organizations"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#635BFF] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Organizations
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold text-[#20243A]">{org.name}</h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                org.status === 'active'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {org.status}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700">
              <ShieldCheck className="w-3.5 h-3.5" />
              Zero-PII Active
            </span>
          </div>
          <p className="text-xs text-[#747B91]">
            {org.industry} · Owner: <strong className="text-[#20243A]">{org.ownerName || 'Workspace Admin'}</strong> ({org.ownerEmail || org.email}) · Plan: <strong className="text-[#20243A]">{org.planName}</strong>
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-[#747B91]">
            <span className="font-mono bg-[#F7F8FC] border border-[#E8EAF1] px-2 py-0.5 rounded">
              ID: {org._id}
            </span>
            {org.slug && (
              <span className="font-mono bg-[#F7F8FC] border border-[#E8EAF1] px-2 py-0.5 rounded">
                /{org.slug}
              </span>
            )}
            {org.createdAt && (
              <span>
                Created: {new Date(org.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={impersonating}
            onClick={handleOpenWorkspace}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {impersonating ? 'Opening Workspace...' : 'Open Organization Workspace'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleToggleStatus}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
              org.status === 'active'
                ? 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {org.status === 'active' ? (
              <>
                <PauseCircle className="w-3.5 h-3.5" />
                Suspend Account
              </>
            ) : (
              <>
                <PlayCircle className="w-3.5 h-3.5" />
                Activate Account
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Wallet Balance</span>
            <Wallet className="w-4 h-4 text-[#13B8A6]" />
          </div>
          <p className="text-xl font-bold text-[#20243A] mt-1.5">
            ₹{Number(org.walletBalanceInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#747B91] mt-0.5">
            Rate: ₹{Number(gst.ratePerMinuteInr || 6).toFixed(2)}/min
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>AI Agents &amp; Campaigns</span>
            <Bot className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-xl font-bold text-[#20243A] mt-1.5">
            {org.metrics?.activeAgentCount || 0} / {org.metrics?.agentCount || 0}
          </p>
          <p className="text-[11px] text-[#747B91] mt-0.5">
            {org.metrics?.campaignCount || 0} campaigns · {org.totalLeads || 0} leads
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Calls (Connected / Total)</span>
            <PhoneCall className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-xl font-bold text-[#20243A] mt-1.5">
            {org.callsConnected || 0} / {org.callsDispatched || 0}
          </p>
          <p className="text-[11px] text-[#747B91] mt-0.5">
            {gst.billableMinutes || 0} billable minutes
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Total Spend (incl. 18% GST)</span>
            <Building2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-[#20243A] mt-1.5">
            ₹{Number(gst.totalWithGstInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#747B91] mt-0.5">
            Subtotal ₹{Number(gst.subtotalInr || 0).toFixed(2)} + GST ₹{Number(gst.gstInr || 0).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Organization Profile Details + Team Members */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#635BFF]" />
            <h2 className="text-base font-bold text-[#20243A]">Organization Details</h2>
          </div>
          <dl className="space-y-3 text-xs">
            <div className="flex items-start gap-2.5">
              <Mail className="w-3.5 h-3.5 text-[#747B91] mt-0.5 shrink-0" />
              <div>
                <dt className="text-[11px] text-[#747B91]">Primary Contact Email</dt>
                <dd className="font-semibold text-[#20243A]">{org.ownerEmail || org.email || 'Not set'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Phone className="w-3.5 h-3.5 text-[#747B91] mt-0.5 shrink-0" />
              <div>
                <dt className="text-[11px] text-[#747B91]">Business Phone</dt>
                <dd className="font-semibold text-[#20243A]">{org.phone || 'Not provided'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <MapPin className="w-3.5 h-3.5 text-[#747B91] mt-0.5 shrink-0" />
              <div>
                <dt className="text-[11px] text-[#747B91]">Address</dt>
                <dd className="font-semibold text-[#20243A]">{org.address || 'Not provided'}</dd>
              </div>
            </div>
            <div className="pt-2 border-t border-[#E8EAF1] grid grid-cols-2 gap-3">
              <div>
                <dt className="text-[11px] text-[#747B91]">Industry</dt>
                <dd className="font-semibold text-[#20243A]">{org.industry || 'General'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#747B91]">Team Size</dt>
                <dd className="font-semibold text-[#20243A]">{teamMembers.length || org.metrics?.teamMemberCount || 1} member(s)</dd>
              </div>
            </div>
          </dl>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-[#E8EAF1] bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E8EAF1] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#635BFF]" />
              <h2 className="text-base font-bold text-[#20243A]">
                Team Members ({teamMembers.length})
              </h2>
            </div>
            <span className="text-[11px] text-[#747B91]">Workspace accounts</span>
          </div>
          {teamMembers.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#747B91]">
              No team member records found for this organization yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1] text-[11px] text-[#747B91] uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Member</th>
                    <th className="px-4 py-2.5 font-semibold">Role</th>
                    <th className="px-4 py-2.5 font-semibold">Department</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EAF1]">
                  {teamMembers.map((member) => (
                    <tr key={member._id} className="hover:bg-[#F7F8FC]/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#20243A]">{member.name}</p>
                        <p className="text-[11px] text-[#747B91]">{member.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            member.isOwner
                              ? 'bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF]'
                              : 'bg-[#F7F8FC] text-[#747B91] border border-[#E8EAF1]'
                          }`}
                        >
                          {member.isOwner ? 'Owner' : 'Team Member'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#20243A]">
                        {member.department || 'Operations'}
                        {member.title ? ` · ${member.title}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                            member.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {member.status || 'active'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Per-Organization Activity Monitoring + Service Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#635BFF]" />
              <div>
                <h2 className="text-base font-bold text-[#20243A]">
                  Organization Activity Monitoring
                </h2>
                <p className="text-xs text-[#747B91]">
                  Call dispatches, connected calls, and spend for {org.name}.
                </p>
              </div>
            </div>
            <div className="inline-flex rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-1 self-start">
              {(['daily', 'weekly'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTrendMode(m)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize ${
                    trendMode === m ? 'bg-[#635BFF] text-white' : 'text-[#747B91]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {trends.map((row) => (
              <div key={row.period} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#20243A]">{row.period}</span>
                  <span className="text-[#747B91]">
                    {row.dispatched} calls ({row.connected} connected) · {row.minutes}m ·{' '}
                    <strong className="text-[#20243A]">₹{Number(row.spendInr || 0).toFixed(2)}</strong>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-[#EEF0FF] overflow-hidden">
                  <div
                    className="h-full bg-[#635BFF] rounded-full transition-all"
                    style={{ width: `${row.intensityPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inline Service Controls & Plan Limits */}
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#635BFF]" />
            <h2 className="text-base font-bold text-[#20243A]">Limits &amp; Plan Control</h2>
          </div>

          <form onSubmit={handleSaveLimits} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#20243A] mb-1">
                Subscription Plan
              </label>
              <select
                value={limits.planName}
                onChange={(e) => setLimits({ ...limits, planName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs bg-white text-[#20243A]"
              >
                <option value="Standard Pay-As-You-Go">Standard Pay-As-You-Go</option>
                <option value="Custom Enterprise Pack">Custom Enterprise Pack</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Rate (₹/min)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={1}
                  value={limits.ratePerMinuteInr}
                  onChange={(e) =>
                    setLimits({ ...limits, ratePerMinuteInr: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Max AI Agents
                </label>
                <input
                  type="number"
                  min={1}
                  value={limits.maxAgents}
                  onChange={(e) =>
                    setLimits({ ...limits, maxAgents: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Concurrent Calls
                </label>
                <input
                  type="number"
                  min={1}
                  value={limits.maxConcurrentCalls}
                  onChange={(e) =>
                    setLimits({ ...limits, maxConcurrentCalls: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Monthly Call Cap
                </label>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={limits.monthlyCallLimit}
                  onChange={(e) =>
                    setLimits({ ...limits, monthlyCallLimit: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save Organization Controls'}
            </button>
          </form>
        </div>
      </div>

      {/* Recent Admin Audit Trail for this Organization */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#20243A]">Recent Activity for {org.name}</h2>
          <Link href={`/super-admin/audit-logs?organizationId=${encodeURIComponent(org._id)}`} className="text-xs font-semibold text-[#635BFF] hover:underline">
            View All Audit Logs →
          </Link>
        </div>
        {logs.length === 0 ? (
          <p className="text-xs text-[#747B91] py-4">
            No administrative actions logged for this organization yet.
          </p>
        ) : (
          <div className="divide-y divide-[#E8EAF1]">
            {logs.map((l) => (
              <div key={l._id} className="py-2.5 flex items-start justify-between gap-4 text-xs">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#13B8A6] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-[#20243A]">{l.action}</p>
                    <p className="text-[11px] text-[#747B91]">{l.details}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] text-[#747B91] whitespace-nowrap">
                  <Clock className="w-3 h-3" />
                  {new Date(l.createdAt).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger Zone — Permanent Delete Organization */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-rose-900">Danger Zone · Remove Organization</h2>
            <p className="text-xs text-rose-700/90 mt-0.5">
              Permanently deletes {org.name}, all team accounts, AI agents, campaigns, and workspace data. This action cannot be undone.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setDeleteConfirmText('');
            setShowDeleteModal(true);
          }}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Permanent Delete Organization
        </button>
      </div>

      {/* Permanent Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#20243A]/45 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-[#E8EAF1] shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#20243A]">
                  Remove Organization Permanently
                </h3>
                <p className="text-xs text-[#747B91] mt-1">
                  This will permanently remove <strong className="text-[#20243A]">{org.name}</strong> and all associated team accounts and records. Type <strong className="font-mono text-rose-600">DELETE</strong> to confirm.
                </p>
              </div>
            </div>
            <form onSubmit={handleConfirmDeleteOrg} className="space-y-4">
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8EAF1] text-sm font-mono text-[#20243A] focus:outline-none focus:border-rose-500"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#747B91] hover:bg-[#F7F8FC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deletingOrg || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {deletingOrg ? 'Removing...' : 'Confirm Permanent Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
