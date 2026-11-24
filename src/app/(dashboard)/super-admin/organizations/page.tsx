'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Plus,
  RefreshCw,
  Bot,
  Megaphone,
  PhoneCall,
  Users,
  X,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

interface OrgDirectoryItem {
  _id: string;
  name: string;
  slug: string;
  email: string;
  industry: string;
  ownerName: string;
  ownerEmail: string;
  status: 'active' | 'suspended' | 'pending';
  limits: {
    maxConcurrentCalls: number;
    maxAgents: number;
    monthlyCallLimit: number;
  };
  metrics: {
    agentCount: number;
    activeAgentCount: number;
    campaignCount: number;
    totalCalls: number;
    totalMinutes: number;
    totalSpendInr: number;
    unbilledSpendInr: number;
    dueAmountInr: number;
    teamMemberCount: number;
    planName: string;
    billingStatus: string;
  };
}

function SuperAdminOrganizationsContent() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const [organizations, setOrganizations] = useState<OrgDirectoryItem[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');

  // Create Organization Modal
  const [showCreate, setShowCreate] = useState(() => searchParams?.get('create') === '1');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    industry: 'Real Estate',
    ownerName: '',
    ownerEmail: '',
    phone: '',
    password: '',
    maxConcurrentCalls: 10,
    maxAgents: 25,
  });


  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (industryFilter !== 'all') params.set('industry', industryFilter);

      const res = await fetch(`/api/super-admin/organizations?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Could not load organizations directory.');
      } else {
        const json = await res.json();
        setOrganizations(json.organizations || []);
        setIndustries(json.industries || []);
      }
    } catch {
      toast.error('Network error while fetching organizations.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, industryFilter, toast]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/super-admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed to create organization.');
      } else {
        toast.success(
          `Provisioned "${form.name}" with isolated tenant workspace.`,
          'Organization Created'
        );
        setShowCreate(false);
        setForm({
          name: '',
          industry: 'Real Estate',
          ownerName: '',
          ownerEmail: '',
          phone: '',
          password: '',
          maxConcurrentCalls: 10,
          maxAgents: 25,
        });
        loadOrganizations();
      }
    } catch {
      toast.error('Network error while creating organization.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-[#20243A]">
              Organization Management
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Multi-Tenant
            </span>
          </div>
          <p className="text-xs text-[#747B91] mt-1">
            Manage organizations, quotas, and workspace status.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Create Organization
        </button>
      </div>

      {/* Filter Bar (Inspired by Reference Layout, Adapted to Light Theme) */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-3.5 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#747B91] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by organization name, slug, or email..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] text-xs text-[#20243A] placeholder-[#747B91] outline-none focus:border-[#635BFF] focus:bg-white transition"
          />
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] text-xs font-medium text-[#20243A] outline-none focus:border-[#635BFF]"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>

          <select
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] text-xs font-medium text-[#20243A] outline-none focus:border-[#635BFF]"
          >
            <option value="all">All Industries</option>
            {industries.map((ind) => (
              <option key={ind} value={ind.toLowerCase()}>
                {ind}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadOrganizations}
            className="p-2 rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] hover:bg-white text-[#747B91] hover:text-[#20243A] transition"
            aria-label="Refresh organizations"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Organizations Table */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F7F8FC] border-b border-[#E8EAF1] text-[11px] font-bold uppercase tracking-wider text-[#747B91]">
                <th className="px-5 py-3.5">Organization</th>
                <th className="px-5 py-3.5">Industry</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Assets &amp; Volumes</th>
                <th className="px-5 py-3.5">Billing &amp; Dues</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAF1] text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#747B91]">
                    Loading organizations...
                  </td>
                </tr>
              ) : organizations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#747B91]">
                    No organizations match your current filters.
                  </td>
                </tr>
              ) : (
                organizations.map((org) => (
                  <tr key={org._id} className="hover:bg-[#F7F8FC]/60 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-bold text-[#20243A] text-sm">{org.name}</p>
                      <p className="text-[11px] text-[#747B91] font-mono">
                        /{org.slug}
                      </p>
                      <p className="text-[10px] text-[#747B91] mt-0.5">
                        {org.ownerEmail}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-[#20243A] font-medium">
                      {org.industry}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize ${
                          org.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            org.status === 'active'
                              ? 'bg-emerald-500'
                              : 'bg-red-500'
                          }`}
                        />
                        {org.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 text-[11px] text-[#20243A] font-medium">
                        <span className="inline-flex items-center gap-1" title="Team Members">
                          <Users className="w-3.5 h-3.5 text-[#635BFF]" />
                          {org.metrics.teamMemberCount || 1}
                        </span>
                        <span className="inline-flex items-center gap-1" title="AI Agents">
                          <Bot className="w-3.5 h-3.5 text-[#635BFF]" />
                          {org.metrics.agentCount}
                        </span>
                        <span className="inline-flex items-center gap-1" title="Campaigns">
                          <Megaphone className="w-3.5 h-3.5 text-[#13B8A6]" />
                          {org.metrics.campaignCount}
                        </span>
                        <span className="inline-flex items-center gap-1" title="Call Volume">
                          <PhoneCall className="w-3.5 h-3.5 text-[#FF6B2C]" />
                          {org.metrics.totalCalls} ({org.metrics.totalMinutes}m)
                        </span>
                      </div>
                      <p className="text-[10px] text-[#747B91] mt-1">
                        Limits: {org.limits.maxAgents} agents • {org.limits.maxConcurrentCalls} concurrent
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-[#20243A]">
                        Unbilled: ₹{org.metrics.unbilledSpendInr.toFixed(2)}
                      </p>
                      <p
                        className={`text-[11px] font-semibold mt-0.5 ${
                          org.metrics.dueAmountInr > 0
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {org.metrics.dueAmountInr > 0
                          ? `Due: ₹${org.metrics.dueAmountInr.toFixed(2)}`
                          : 'All Invoices Settled'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/super-admin/organizations/${org._id}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#635BFF]/30 bg-[#EEF0FF] hover:bg-[#635BFF] text-[#635BFF] hover:text-white text-xs font-semibold transition"
                        title="Inspect organization profile, team members, quotas, and actions"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero-PII Compliance Note */}
      <div className="flex items-center gap-2 text-[11px] text-[#747B91] px-1">
        <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <span>
          Zero-PII Active: Private leads, recordings, and transcripts stay isolated.
        </span>
      </div>

      {/* Create Organization Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-[#20243A]/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#E8EAF1] shadow-xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-[#20243A]">
                  Create Organization
                </h3>
                <p className="text-xs text-[#747B91]">
                  Provision an isolated tenant workspace and primary Organization login.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-[#747B91] hover:text-[#20243A] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateOrg} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#20243A] mb-1">
                    Organization Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. NexusStudio Realty"
                    className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2 text-sm outline-none focus:border-[#635BFF] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#20243A] mb-1">
                    Industry
                  </label>
                  <input
                    type="text"
                    value={form.industry}
                    onChange={(e) => setForm({ ...form, industry: e.target.value })}
                    placeholder="e.g. Real Estate"
                    className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2 text-sm outline-none focus:border-[#635BFF] focus:bg-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#20243A] mb-1">
                    Owner Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.ownerName}
                    onChange={(e) =>
                      setForm({ ...form, ownerName: e.target.value })
                    }
                    placeholder="e.g. Rohan Kapoor"
                    className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2 text-sm outline-none focus:border-[#635BFF] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#20243A] mb-1">
                    Owner Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={form.ownerEmail}
                    onChange={(e) =>
                      setForm({ ...form, ownerEmail: e.target.value })
                    }
                    placeholder="owner@company.com"
                    className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2 text-sm outline-none focus:border-[#635BFF] focus:bg-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#20243A] mb-1">
                    Initial Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    placeholder="Min 6 characters"
                    className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2 text-sm outline-none focus:border-[#635BFF] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#20243A] mb-1">
                    Max Concurrent Calls
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={form.maxConcurrentCalls}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        maxConcurrentCalls: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3.5 py-2 text-sm outline-none focus:border-[#635BFF] focus:bg-white"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#747B91]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold disabled:opacity-60"
                >
                  {creating ? 'Provisioning...' : 'Provision Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Platform Limits Modal */}
    </div>
  );
}

export default function SuperAdminOrganizationsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-[#747B91]">Loading organizations...</div>}>
      <SuperAdminOrganizationsContent />
    </Suspense>
  );
}
