'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Building2,
  Bot,
  PhoneCall,
  Wallet,
  TrendingUp,
  Users,
  CreditCard,
  Plus,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  UserPlus,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import OverviewAnalyticsSection from '@/components/OverviewAnalyticsSection';

const DEPARTMENTS = ['Sales', 'Support', 'Operations', 'Admin', 'Engineering'];

interface OrgUser {
  _id: string;
  name: string;
  email: string;
  department?: string;
  title?: string;
  isActive: boolean;
  isOwner?: boolean;
}

interface AgentSummary {
  _id: string;
  name: string;
  language?: string;
  status: string;
  syncStatus?: string;
  bolnaAgentId?: string;
}

interface BillingSummary {
  organizationName: string;
  planName: string;
  balanceInr: number;
  ratePerMinuteInr: number;
  totalCalls: number;
  totalMinutes: number;
  totalSpendInr: number;
  unbilledInr: number;
  dueInr: number;
}

export default function OrganizationOverviewPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState<{
    userId?: string;
    name: string;
    email: string;
    workspaceName?: string;
    organizationId?: string;
  } | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [teamMembers, setTeamMembers] = useState<OrgUser[]>([]);
  const [overviewStats, setOverviewStats] = useState<{
    totalLeads: number;
    qualifiedLeads: number;
    activeCampaigns: number;
    completedCalls: number;
  }>({
    totalLeads: 0,
    qualifiedLeads: 0,
    activeCampaigns: 0,
    completedCalls: 0,
  });

  // Add Team Member Modal
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberForm, setMemberForm] = useState({
    name: '',
    email: '',
    password: '',
    department: 'Sales',
    title: 'Account Executive',
  });
  const [savingMember, setSavingMember] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<OrgUser | null>(null);
  const [deletingMember, setDeletingMember] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferConfirmText, setTransferConfirmText] = useState('');
  const [transferringOwner, setTransferringOwner] = useState(false);

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, billingRes, agentsRes, usersRes, analyticsRes] =
        await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/billing'),
          fetch('/api/agents'),
          fetch('/api/users'),
          fetch('/api/analytics/overview'),
        ]);

      if (meRes.ok) {
        const meJson = await meRes.json();
        setSessionUser(meJson.user);
      }
      if (billingRes.ok) {
        const bJson = await billingRes.json();
        setBilling(bJson.billing);
      }
      if (agentsRes.ok) {
        const aJson = await agentsRes.json();
        setAgents(Array.isArray(aJson.agents) ? aJson.agents : []);
      }
      if (usersRes.ok) {
        const uJson = await usersRes.json();
        setTeamMembers(Array.isArray(uJson.users) ? uJson.users : []);
      }
      if (analyticsRes.ok) {
        const anJson = await analyticsRes.json();
        setOverviewStats({
          totalLeads: anJson.kpis?.totalLeads || 0,
          qualifiedLeads: anJson.kpis?.qualifiedLeads || 0,
          activeCampaigns: anJson.kpis?.activeCampaigns || 0,
          completedCalls: anJson.kpis?.completedCalls || 0,
        });
      }
    } catch {
      toast.error('Failed to load workspace overview.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberForm.name.trim() || !memberForm.email.trim() || memberForm.password.length < 6) {
      toast.warning('Please enter a name, valid email, and password (min 6 chars).');
      return;
    }
    setSavingMember(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberForm),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Could not add team member.');
      } else {
        toast.success(
          `Added ${memberForm.name} (${memberForm.department}) to your organization.`,
          'Team Updated'
        );
        setMemberForm({
          name: '',
          email: '',
          password: '',
          department: 'Sales',
          title: 'Account Executive',
        });
        setShowAddMember(false);
        loadWorkspaceData();
      }
    } catch {
      toast.error('Network error while adding team member.');
    } finally {
      setSavingMember(false);
    }
  };

  const handleToggleMemberStatus = async (member: OrgUser) => {
    setTogglingId(member._id);
    const nextActive = !member.isActive;
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member._id, isActive: nextActive }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Could not update team member status.');
      } else {
        setTeamMembers((prev) =>
          prev.map((m) =>
            m._id === member._id ? { ...m, isActive: nextActive } : m
          )
        );
        toast.success(
          `${member.name} is now ${nextActive ? 'Active' : 'Deactivated'}.`
        );
      }
    } catch {
      toast.error('Network error while updating team member status.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleTransferOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTargetId) {
      toast.error('Select an active team member first.');
      return;
    }
    if (transferConfirmText.trim().toUpperCase() !== 'TRANSFER') {
      toast.error('Please type TRANSFER to confirm.');
      return;
    }
    setTransferringOwner(true);
    try {
      const res = await fetch('/api/organizations/transfer-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: transferTargetId,
          confirmText: transferConfirmText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not transfer ownership.');
      } else {
        toast.success(data.message || 'Ownership transferred successfully.');
        setTransferModalOpen(false);
        setTransferConfirmText('');
        loadWorkspaceData();
      }
    } finally {
      setTransferringOwner(false);
    }
  };

  const handleConfirmDeleteMember = async () => {
    if (!memberToDelete) return;
    setDeletingMember(true);
    try {
      const res = await fetch(
        `/api/users?userId=${encodeURIComponent(memberToDelete._id)}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Could not remove team member.');
      } else {
        setTeamMembers((prev) =>
          prev.filter((m) => m._id !== memberToDelete._id)
        );
        toast.success(`Removed ${memberToDelete.name} from the organization.`);
        setMemberToDelete(null);
      }
    } catch {
      toast.error('Network error while removing team member.');
    } finally {
      setDeletingMember(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 rounded-2xl shimmer-loading" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl shimmer-loading" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 rounded-2xl shimmer-loading" />
          <div className="h-64 rounded-2xl shimmer-loading" />
        </div>
      </div>
    );
  }

  const activeAgents = agents.filter((a) => a.status === 'active');
  const syncedAgents = agents.filter((a) => a.syncStatus === 'synced');
  const effectiveRate = billing?.ratePerMinuteInr || 6;

  return (
    <div className="space-y-6">
      {/* Organization Header Card */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#EEF0FF] border border-[#C7CBFF] flex items-center justify-center flex-shrink-0">
            <Building2 className="w-6 h-6 text-[#635BFF]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-[#20243A]">
                {billing?.organizationName ||
                  sessionUser?.workspaceName ||
                  'Organization Workspace'}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Active Workspace
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF]">
                {billing?.planName || 'Growth Pay-As-You-Go'}
              </span>
            </div>
            <p className="text-xs text-[#747B91] mt-1">
              Signed in as <span className="font-semibold text-[#20243A]">{sessionUser?.name}</span> ({sessionUser?.email}) • Isolated Multi-Tenant Voice Workspace
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/agents/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E8EAF1] bg-white hover:bg-[#F7F8FC] text-xs font-semibold text-[#20243A] transition"
          >
            <Plus className="w-3.5 h-3.5 text-[#635BFF]" />
            New AI Agent
          </Link>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Launch Campaign
          </Link>
        </div>
      </div>

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#747B91]">
              Total Spend
            </span>
            <TrendingUp className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            ₹{(billing?.totalSpendInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            {billing?.totalMinutes || 0} billed mins @ ₹{effectiveRate.toFixed(2)}/min
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#747B91]">
              Wallet Balance
            </span>
            <Wallet className="w-4 h-4 text-[#13B8A6]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            ₹{(billing?.balanceInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">
            {billing?.dueInr ? `₹${billing.dueInr.toFixed(2)} due` : 'All invoices settled'}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#747B91]">
              Active AI Agents
            </span>
            <Bot className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            {activeAgents.length}{' '}
            <span className="text-sm font-medium text-[#747B91]">
              / {agents.length}
            </span>
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            {syncedAgents.length} synced with IndiaCalling Voice AI
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#747B91]">
              Calls &amp; Qualified Leads
            </span>
            <PhoneCall className="w-4 h-4 text-[#FF6B2C]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            {billing?.totalCalls || 0}{' '}
            <span className="text-sm font-medium text-[#13B8A6]">
              ({overviewStats.qualifiedLeads} qualified)
            </span>
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            {overviewStats.activeCampaigns} active campaign(s) • {overviewStats.totalLeads} total leads
          </p>
        </div>
      </div>

      {/* Billing Overview + Active Agents Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Billing Overview Card */}
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#635BFF]" />
                <h3 className="text-sm font-bold text-[#20243A]">
                  Billing &amp; Usage Summary
                </h3>
              </div>
              <Link
                href="/billing"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#635BFF] hover:underline"
              >
                Manage Billing <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-3.5">
                <span className="text-[11px] font-semibold text-[#747B91]">
                  Current Plan
                </span>
                <p className="text-sm font-bold text-[#20243A] mt-1">
                  {billing?.planName || 'Growth Pay-As-You-Go'}
                </p>
              </div>
              <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-3.5">
                <span className="text-[11px] font-semibold text-[#747B91]">
                  Per-Minute Rate
                </span>
                <p className="text-sm font-bold text-[#20243A] mt-1">
                  ₹{effectiveRate.toFixed(2)} / min
                </p>
              </div>
              <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-3.5">
                <span className="text-[11px] font-semibold text-[#747B91]">
                  Unbilled Usage
                </span>
                <p className="text-sm font-bold text-[#20243A] mt-1">
                  ₹{(billing?.unbilledInr || 0).toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-3.5">
                <span className="text-[11px] font-semibold text-[#747B91]">
                  Total Minutes Used
                </span>
                <p className="text-sm font-bold text-[#20243A] mt-1">
                  {billing?.totalMinutes || 0} mins
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#E8EAF1] flex items-center justify-between">
            <span className="text-xs text-[#747B91]">
              Instant wallet top-ups with downloadable PDF invoices
            </span>
            <Link
              href="/billing"
              className="px-3 py-1.5 rounded-lg bg-[#EEF0FF] text-[#635BFF] hover:bg-[#635BFF] hover:text-white text-xs font-semibold transition"
            >
              Add Credits
            </Link>
          </div>
        </div>

        {/* Active Agents Summary Card */}
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#635BFF]" />
                <h3 className="text-sm font-bold text-[#20243A]">
                  Active AI Voice Agents
                </h3>
              </div>
              <Link
                href="/agents"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#635BFF] hover:underline"
              >
                View All Agents <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {agents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E8EAF1] p-6 text-center">
                <p className="text-xs text-[#747B91]">
                  No AI agents configured yet. Create your first voice agent to start calling.
                </p>
                <Link
                  href="/agents/new"
                  className="inline-flex items-center gap-1.5 mt-3 px-3.5 py-2 rounded-xl bg-[#635BFF] text-white text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Create AI Agent
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {agents.slice(0, 4).map((agent) => (
                  <Link
                    key={agent._id}
                    href={`/agents/${agent._id}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[#E8EAF1] hover:border-[#635BFF] bg-[#F7F8FC]/60 hover:bg-white transition"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#20243A] truncate">
                        {agent.name}
                      </p>
                      <p className="text-[11px] text-[#747B91] truncate">
                        {agent.language || 'English + Hindi'}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${
                        agent.syncStatus === 'synced'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {agent.syncStatus === 'synced' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )}
                      {agent.syncStatus === 'synced' ? 'Live Synced' : 'Pending Sync'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Team Members Management Section */}
      <OverviewAnalyticsSection />

      <div className="rounded-2xl border border-[#E8EAF1] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8EAF1] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#635BFF]" />
            <div>
              <h3 className="text-sm font-bold text-[#20243A]">
                Organization Team Members
              </h3>
              <p className="text-xs text-[#747B91]">
                Manage workspace access and departments ({teamMembers.length} member{teamMembers.length === 1 ? '' : 's'}). Sales department members appear automatically in Sales Handoff.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddMember(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold transition"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Team Member
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F7F8FC] border-b border-[#E8EAF1] text-[11px] font-bold uppercase tracking-wider text-[#747B91]">
                <th className="px-5 py-3">Member</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAF1] text-xs">
              {teamMembers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-[#747B91]"
                  >
                    No additional team members yet. Click &ldquo;Add Team Member&rdquo; to invite your team.
                  </td>
                </tr>
              ) : (
                teamMembers.map((member) => {
                  const isSelf =
                    Boolean(sessionUser?.userId) &&
                    String(member._id) === String(sessionUser?.userId);
                  return (
                    <tr key={member._id} className="hover:bg-[#F7F8FC]/60">
                      <td className="px-5 py-3.5 font-semibold text-[#20243A]">
                        {member.name}
                        {member.isOwner && (
                          <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Owner
                          </span>
                        )}
                        {isSelf && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-[#EEF0FF] text-[#635BFF]">
                            You
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[#747B91]">{member.email}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#EEF0FF] text-[#635BFF]">
                          {member.department || 'Operations'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[#20243A]">
                        {member.title || 'Team Member'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            member.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {member.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {member.isOwner ? (
                            <button
                              type="button"
                              onClick={() => {
                                const candidates = teamMembers.filter(
                                  (m) => !m.isOwner && m.isActive
                                );
                                setTransferTargetId(candidates[0]?._id || '');
                                setTransferConfirmText('');
                                setTransferModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-[#635BFF]/30 bg-[#EEF0FF] text-[#635BFF] hover:bg-[#635BFF] hover:text-white transition"
                              title="Organization Owner cannot be removed directly. Transfer ownership first."
                            >
                              Transfer Ownership
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={togglingId === member._id}
                                onClick={() => handleToggleMemberStatus(member)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition disabled:opacity-50 ${
                                  member.isActive
                                    ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                              >
                                {togglingId === member._id
                                  ? 'Saving...'
                                  : member.isActive
                                  ? 'Deactivate'
                                  : 'Activate'}
                              </button>
                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() => setMemberToDelete(member)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition"
                                  title="Remove team member"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Remove
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Team Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 bg-[#20243A]/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#E8EAF1] shadow-xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#20243A]">
                Add Team Member
              </h3>
              <button
                type="button"
                onClick={() => setShowAddMember(false)}
                className="text-[#747B91] hover:text-[#20243A] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddMember} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={memberForm.name}
                  onChange={(e) =>
                    setMemberForm({ ...memberForm, name: e.target.value })
                  }
                  placeholder="e.g. Priya Sharma"
                  className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2 text-sm outline-none focus:border-[#635BFF] focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Work Email *
                </label>
                <input
                  type="email"
                  required
                  value={memberForm.email}
                  onChange={(e) =>
                    setMemberForm({ ...memberForm, email: e.target.value })
                  }
                  placeholder="priya@company.com"
                  className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2 text-sm outline-none focus:border-[#635BFF] focus:bg-white"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#20243A] mb-1">
                    Department *
                  </label>
                  <select
                    value={memberForm.department}
                    onChange={(e) =>
                      setMemberForm({ ...memberForm, department: e.target.value })
                    }
                    className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3 py-2 text-sm outline-none focus:border-[#635BFF] focus:bg-white"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#20243A] mb-1">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={memberForm.title}
                    onChange={(e) =>
                      setMemberForm({ ...memberForm, title: e.target.value })
                    }
                    placeholder="e.g. Account Executive"
                    className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2 text-sm outline-none focus:border-[#635BFF] focus:bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Initial Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={memberForm.password}
                  onChange={(e) =>
                    setMemberForm({ ...memberForm, password: e.target.value })
                  }
                  placeholder="Min 6 characters"
                  className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2 text-sm outline-none focus:border-[#635BFF] focus:bg-white"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMember(false)}
                  className="px-4 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#747B91]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMember}
                  className="px-4 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold disabled:opacity-60"
                >
                  {savingMember ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Member Confirmation Modal */}
      {memberToDelete && (
        <div className="fixed inset-0 z-50 bg-[#20243A]/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white border border-[#E8EAF1] shadow-xl p-6 animate-slide-up">
            <h3 className="text-base font-bold text-[#20243A]">
              Remove Team Member?
            </h3>
            <p className="text-xs text-[#747B91] mt-2 leading-relaxed">
              Are you sure you want to permanently remove{' '}
              <strong className="text-[#20243A]">{memberToDelete.name}</strong> (
              {memberToDelete.email}) from your organization? They will immediately lose access to this workspace.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                disabled={deletingMember}
                onClick={() => setMemberToDelete(null)}
                className="px-4 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#747B91] hover:bg-[#F7F8FC]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingMember}
                onClick={handleConfirmDeleteMember}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-60"
              >
                {deletingMember ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Organization Ownership Modal */}
      {transferModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#20243A]/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#E8EAF1] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#20243A]">
                Transfer Organization Ownership
              </h3>
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="p-1 text-[#747B91] hover:text-[#20243A]"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[#747B91]">
              The Organization Owner is protected and cannot be removed directly. Transfer ownership to another active teammate first.
            </p>
            {teamMembers.filter((m) => !m.isOwner && m.isActive).length === 0 ? (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                Add at least one active team member before transferring ownership.
              </div>
            ) : (
              <form onSubmit={handleTransferOwnership} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#20243A] mb-1">
                    New Organization Owner
                  </label>
                  <select
                    value={transferTargetId}
                    onChange={(e) => setTransferTargetId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                  >
                    {teamMembers
                      .filter((m) => !m.isOwner && m.isActive)
                      .map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.name} ({m.email})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#20243A] mb-1">
                    Type <span className="font-mono text-rose-600">TRANSFER</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={transferConfirmText}
                    onChange={(e) => setTransferConfirmText(e.target.value)}
                    placeholder="TRANSFER"
                    className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs font-mono text-[#20243A]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setTransferModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#747B91]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={transferringOwner || transferConfirmText.trim().toUpperCase() !== 'TRANSFER'}
                    className="px-4 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {transferringOwner ? 'Transferring...' : 'Confirm Transfer'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
