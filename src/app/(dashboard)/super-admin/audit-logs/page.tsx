'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FileText,
  ShieldCheck,
  Search,
  RefreshCw,
  Clock,
  Building2,
  List,
  Layers,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'all', label: 'All Events' },
  { value: 'auth', label: 'Auth' },
  { value: 'billing', label: 'Billing' },
  { value: 'workspace_access', label: 'Workspace Access' },
  { value: 'organization', label: 'Organization' },
  { value: 'service_control', label: 'Service Control' },
  { value: 'security', label: 'Security' },
];

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  auth: 'bg-sky-50 text-sky-700 border-sky-200',
  billing: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  workspace_access: 'bg-amber-50 text-amber-800 border-amber-200',
  organization: 'bg-[#EEF0FF] text-[#635BFF] border-[#C7CBFF]',
  service_control: 'bg-violet-50 text-violet-700 border-violet-200',
  security: 'bg-slate-100 text-slate-700 border-slate-200',
  settings: 'bg-teal-50 text-teal-700 border-teal-200',
  support: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

interface AuditEntry {
  _id: string;
  action: string;
  category: string;
  categoryLabel: string;
  actorName: string;
  actorEmail: string;
  targetOrgId: string;
  targetOrgName: string;
  details: string;
  createdAt: string;
}

interface OrgOption {
  id: string;
  name: string;
  count: number;
}

function SuperAdminAuditLogsContent() {
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [organizationId, setOrganizationId] = useState(() => searchParams?.get('organizationId') || 'all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grouped' | 'timeline'>('grouped');
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (organizationId !== 'all') params.set('organizationId', organizationId);
      if (category !== 'all') params.set('category', category);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/super-admin/audit-logs?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setLogs(Array.isArray(json.logs) ? json.logs : []);
        if (Array.isArray(json.organizations)) {
          setOrganizations(json.organizations);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId, category, search]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const groupedByOrg = useMemo(() => {
    const map = new Map<string, { orgId: string; orgName: string; entries: AuditEntry[] }>();
    for (const log of logs) {
      const key = log.targetOrgId || 'platform_hq';
      const existing = map.get(key);
      if (existing) {
        existing.entries.push(log);
      } else {
        map.set(key, {
          orgId: key,
          orgName: log.targetOrgName || 'Platform System',
          entries: [log],
        });
      }
    }
    return Array.from(map.values());
  }, [logs]);

  const renderLogRow = (item: AuditEntry, showOrgName: boolean) => {
    const badgeCls =
      CATEGORY_BADGE_STYLES[item.category] ||
      'bg-[#F7F8FC] text-[#747B91] border-[#E8EAF1]';
    return (
      <div
        key={item._id}
        className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:bg-[#F7F8FC]/60 transition-colors"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#EEF0FF] text-[#635BFF] flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-[#20243A]">{item.action}</p>
              <span
                className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${badgeCls}`}
              >
                {item.categoryLabel || 'Security'}
              </span>
              {showOrgName && item.targetOrgName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F7F8FC] border border-[#E8EAF1] text-[10px] font-semibold text-[#20243A]">
                  <Building2 className="w-3 h-3 text-[#747B91]" />
                  {item.targetOrgName}
                </span>
              )}
            </div>
            <p className="text-xs text-[#4A5068] mt-1 leading-relaxed">{item.details}</p>
            <p className="text-[11px] text-[#747B91] mt-1">
              Performed by <strong className="text-[#20243A]">{item.actorName}</strong> ({item.actorEmail})
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] text-[#747B91] whitespace-nowrap flex-shrink-0">
          <Clock className="w-3 h-3" />
          {new Date(item.createdAt).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#20243A]">Audit Logs &amp; Activity History</h1>
          <p className="text-xs text-[#747B91] mt-0.5">
            Organization-wise history of logins, billing credits, workspace support sessions, and account changes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
            <ShieldCheck className="w-3.5 h-3.5" />
            Zero-PII Active
          </span>
          <button
            type="button"
            onClick={loadLogs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E8EAF1] bg-white hover:border-[#635BFF] text-xs font-semibold text-[#20243A] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters & View Switcher */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-[#747B91] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search action, organization, or user..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF]"
              />
            </div>

            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              aria-label="Filter by organization"
              className="px-3 py-2 rounded-xl border border-[#E8EAF1] bg-white text-xs font-medium text-[#20243A] focus:outline-none focus:border-[#635BFF]"
            >
              <option value="all">All Organizations</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.count})
                </option>
              ))}
            </select>
          </div>

          <div className="inline-flex rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] p-1 self-start">
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                viewMode === 'grouped'
                  ? 'bg-white text-[#635BFF] shadow-xs'
                  : 'text-[#747B91] hover:text-[#20243A]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Grouped by Organization
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                viewMode === 'timeline'
                  ? 'bg-white text-[#635BFF] shadow-xs'
                  : 'text-[#747B91] hover:text-[#20243A]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Chronological Timeline
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#E8EAF1]">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                category === c.value
                  ? 'bg-[#635BFF] text-white'
                  : 'bg-[#F7F8FC] text-[#747B91] hover:text-[#20243A]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Content */}
      {loading ? (
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-6 h-48 shimmer-loading" />
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-10 text-center text-xs text-[#747B91]">
          No audit events match your current filters.
        </div>
      ) : viewMode === 'grouped' ? (
        <div className="space-y-4">
          {groupedByOrg.map((group) => (
            <section
              key={group.orgId}
              className="rounded-2xl border border-[#E8EAF1] bg-white overflow-hidden"
            >
              <div className="px-5 py-3.5 bg-[#F7F8FC] border-b border-[#E8EAF1] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#635BFF]/10 text-[#635BFF] flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-bold text-[#20243A]">{group.orgName}</h2>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-white border border-[#E8EAF1] text-[11px] font-semibold text-[#747B91]">
                  {group.entries.length} {group.entries.length === 1 ? 'event' : 'events'}
                </span>
              </div>
              <div className="divide-y divide-[#E8EAF1]">
                {group.entries.map((item) => renderLogRow(item, false))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E8EAF1] bg-white divide-y divide-[#E8EAF1]">
          {logs.map((item) => renderLogRow(item, true))}
        </div>
      )}
    </div>
  );
}

export default function SuperAdminAuditLogsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-[#747B91]">Loading audit logs...</div>}>
      <SuperAdminAuditLogsContent />
    </Suspense>
  );
}
