'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  LayoutGrid,
  Columns3,
  Table2,
  CheckCircle2,
  Calendar,
  Flame,
  Zap,
  Snowflake,
  CircleDashed,
  UserCheck,
  Clock,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import ScheduleCallModal, { TeamMemberOption } from '@/components/ScheduleCallModal';
import {
  computeEffectiveLeadScore,
  computeLeadBucket,
  computeScheduledCallStatus,
  extractLeadSignals,
  LeadHeatBucket,
} from '@/lib/call-scheduling';

const PIPELINE_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'call_scheduled', label: 'Call Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'follow_up_required', label: 'Follow Up Required' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'lost', label: 'Lost' },
];

const KANBAN_COLUMNS = [
  { key: 'new', title: 'New & Pending', statuses: ['new', 'pending_qualification', 'follow_up_required'] },
  { key: 'qualified', title: 'AI Qualified', statuses: ['qualified', 'assigned'] },
  { key: 'call_scheduled', title: 'Call Scheduled / Active', statuses: ['call_scheduled', 'in_progress', 'contacted'] },
  { key: 'converted', title: 'Converted', statuses: ['converted'] },
];

function getStatusPillClass(status: string): string {
  switch (status) {
    case 'qualified':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'call_scheduled':
      return 'bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF]';
    case 'in_progress':
    case 'assigned':
    case 'contacted':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'converted':
      return 'bg-purple-50 text-purple-700 border border-purple-200';
    case 'follow_up_required':
    case 'pending_qualification':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'lost':
    case 'unqualified':
      return 'bg-red-50 text-red-700 border border-red-200';
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-200';
  }
}

function getHeatBadge(bucket: LeadHeatBucket) {
  switch (bucket) {
    case 'hot':
      return {
        label: 'Hot',
        cls: 'bg-orange-50 text-orange-700 border border-orange-200',
        dot: 'bg-orange-500',
      };
    case 'warm':
      return {
        label: 'Warm',
        cls: 'bg-amber-50 text-amber-700 border border-amber-200',
        dot: 'bg-amber-500',
      };
    case 'cold':
      return {
        label: 'Cold',
        cls: 'bg-sky-50 text-sky-700 border border-sky-200',
        dot: 'bg-sky-500',
      };
    default:
      return {
        label: 'Not scored',
        cls: 'bg-gray-100 text-gray-600 border border-gray-200',
        dot: 'bg-gray-400',
      };
  }
}

function getSchedulePillClass(liveStatus: string | null): string {
  switch (liveStatus) {
    case 'Due Now':
      return 'bg-red-50 text-red-700 border border-red-200 animate-pulse';
    case 'Scheduled':
      return 'bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF]';
    case 'Completed':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'Missed':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

export default function LeadsPipelinePage() {
  const toast = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [bucketFilter, setBucketFilter] = useState<'all' | LeadHeatBucket>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'kanban' | 'table'>('cards');
  const [scheduleLead, setScheduleLead] = useState<any | null>(null);
  const [nowTick, setNowTick] = useState<number>(0);

  // Real-time 30s ticker so "Due Now" / "Missed" call schedule statuses stay live
  useEffect(() => {
    const init = setTimeout(() => setNowTick(Date.now()), 0);
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => {
      clearTimeout(init);
      clearInterval(id);
    };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, usersRes] = await Promise.all([
        fetch('/api/leads'),
        fetch('/api/users'),
      ]);
      if (leadsRes.ok) {
        const json = await leadsRes.json();
        setLeads(Array.isArray(json.leads) ? json.leads : []);
      }
      if (usersRes.ok) {
        const uJson = await usersRes.json();
        const activeUsers = (Array.isArray(uJson.users) ? uJson.users : []).filter(
          (u: any) => u.isActive !== false
        );
        setTeamMembers(activeUsers);
      }
    } catch {
      toast.error('Failed to load leads pipeline.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleQuickStatusChange = async (leadId: string, nextStatus: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qualificationStatus: nextStatus }),
      });
      if (!res.ok) {
        toast.error('Could not update lead status.');
      } else {
        setLeads((prev) =>
          prev.map((l) =>
            l._id === leadId ? { ...l, qualificationStatus: nextStatus } : l
          )
        );
        toast.success(`Lead status updated to ${nextStatus.replace(/_/g, ' ')}.`);
      }
    } catch {
      toast.error('Network error updating lead status.');
    }
  };

  const bucketCounts = useMemo(() => {
    const counts = { all: leads.length, hot: 0, warm: 0, cold: 0, unqualified: 0 };
    for (const l of leads) {
      const b = computeLeadBucket(l);
      counts[b] += 1;
    }
    return counts;
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (bucketFilter !== 'all' && computeLeadBucket(l) !== bucketFilter) {
        return false;
      }
      if (statusFilter !== 'all' && l.qualificationStatus !== statusFilter) {
        return false;
      }
      if (q) {
        const hay = `${l.name || ''} ${l.phone || ''} ${l.company || ''} ${
          l.assignedSalespersonName || ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, bucketFilter, statusFilter, search]);

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#20243A]">Qualified Leads Pipeline</h1>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <p className="text-xs text-[#747B91]">
              Track scored prospects and schedule follow-up calls.
            </p>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#EEF0FF] border border-[#C7CBFF] text-[11px] font-semibold text-[#635BFF]">
              {leads.length} Unique Contacts • {leads.reduce((s, l) => s + (l.totalCalls || 0), 0)} Total Voice Calls
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative flex-1 sm:flex-none sm:w-56">
            <Search className="w-3.5 h-3.5 text-[#747B91] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone..."
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#E8EAF1] bg-white text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF]"
            />
          </div>

          {/* Pipeline Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E8EAF1] bg-white text-xs font-medium text-[#20243A] focus:outline-none focus:border-[#635BFF]"
          >
            <option value="all">All Pipeline Statuses</option>
            {PIPELINE_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* View Switcher: Cards Grid | Kanban Board | Data Table */}
          <div className="inline-flex items-center rounded-xl bg-white border border-[#E8EAF1] p-1">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'cards'
                  ? 'bg-[#635BFF] text-white'
                  : 'text-[#747B91] hover:text-[#20243A]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'kanban'
                  ? 'bg-[#635BFF] text-white'
                  : 'text-[#747B91] hover:text-[#20243A]'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'table'
                  ? 'bg-[#635BFF] text-white'
                  : 'text-[#747B91] hover:text-[#20243A]'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Data Table</span>
            </button>
          </div>

          <Link
            href="/leads/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Lead
          </Link>
        </div>
      </div>

      {/* Qualification Bucket Tabs with Live Counts */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: 'all', label: 'All Leads', count: bucketCounts.all, icon: null },
            { key: 'hot', label: 'Hot', count: bucketCounts.hot, icon: <Flame className="w-3.5 h-3.5 text-orange-500" /> },
            { key: 'warm', label: 'Warm', count: bucketCounts.warm, icon: <Zap className="w-3.5 h-3.5 text-amber-500" /> },
            { key: 'cold', label: 'Cold', count: bucketCounts.cold, icon: <Snowflake className="w-3.5 h-3.5 text-sky-500" /> },
            { key: 'unqualified', label: 'Unqualified', count: bucketCounts.unqualified, icon: <CircleDashed className="w-3.5 h-3.5 text-gray-500" /> },
          ] as const
        ).map((tab) => {
          const active = bucketFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setBucketFilter(tab.key)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
                active
                  ? 'bg-[#20243A] text-white border-[#20243A] shadow-xs'
                  : 'bg-white text-[#20243A] border-[#E8EAF1] hover:border-[#635BFF]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  active ? 'bg-white/20 text-white' : 'bg-[#F7F8FC] text-[#747B91]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body Views */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-56 rounded-2xl shimmer-loading" />
          ))}
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-12 text-center space-y-2">
          <p className="text-sm font-bold text-[#20243A]">No leads match your current filter</p>
          <p className="text-xs text-[#747B91]">
            Switch buckets or sync completed IndiaCalling Voice AI calls to populate scored leads.
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        /* CARDS GRID VIEW (Ref Image 3) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {filteredLeads.map((lead) => {
            const bucket = computeLeadBucket(lead);
            const heat = getHeatBadge(bucket);
            const signals = extractLeadSignals(lead);
            const score = computeEffectiveLeadScore(lead);
            const liveSched = computeScheduledCallStatus(lead.scheduledCall, nowTick);

            return (
              <div
                key={lead._id}
                className={`rounded-2xl border bg-white p-4 flex flex-col justify-between gap-3.5 transition-all hover:shadow-md ${
                  bucket === 'hot'
                    ? 'border-orange-200 ring-1 ring-orange-100'
                    : 'border-[#E8EAF1]'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Identity + Score & Heat */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[#EEF0FF] text-[#635BFF] flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {(lead.name || 'P').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#20243A] truncate">{lead.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[11px] font-mono text-[#747B91] truncate">{lead.phone}</p>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EEF0FF] border border-[#C7CBFF] text-[10px] font-bold text-[#635BFF] whitespace-nowrap">
                            📞 {lead.totalCalls || 0} {(lead.totalCalls || 0) === 1 ? 'Call' : 'Calls'}
                          </span>
                        </div>
                        {lead.lastAgentName && (
                          <p className="text-[10px] text-[#747B91] truncate mt-0.5">
                            Agent: <span className="text-[#20243A] font-medium">{lead.lastAgentName}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="px-2 py-0.5 rounded-lg bg-[#F7F8FC] border border-[#E8EAF1] text-[11px] font-bold text-[#20243A] whitespace-nowrap">
                        {score} pts
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${heat.cls}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${heat.dot}`} />
                        {heat.label}
                      </span>
                    </div>
                  </div>

                  {/* AI Qualification Signals Checklist */}
                  <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-3 min-h-[82px]">
                    {signals.length > 0 ? (
                      <ul className="space-y-1.5">
                        {signals.map((sig) => (
                          <li key={sig} className="flex items-center gap-2 text-[11px] text-[#20243A]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#13B8A6] flex-shrink-0" />
                            <span className="truncate">{sig}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-[#747B91] italic">
                        No positive qualification signals yet
                      </p>
                    )}
                  </div>

                  {/* Assigned Rep + Live Scheduled Call Pill */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 text-[#747B91] truncate">
                      <UserCheck className="w-3.5 h-3.5 text-[#635BFF] flex-shrink-0" />
                      {lead.assignedSalespersonName ? (
                        <span className="text-[#20243A] font-medium truncate">
                          Assigned to {lead.assignedSalespersonName}
                        </span>
                      ) : (
                        <span>Unassigned</span>
                      )}
                    </span>

                    {liveSched && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${getSchedulePillClass(
                          liveSched
                        )}`}
                      >
                        <Clock className="w-3 h-3" />
                        {liveSched}
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-3 border-t border-[#E8EAF1] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/leads/${lead._id}`}
                      className="text-xs font-bold text-[#635BFF] hover:text-[#5046E5] whitespace-nowrap"
                    >
                      View Lead →
                    </Link>
                    <select
                      value={lead.qualificationStatus || 'new'}
                      onChange={(e) => handleQuickStatusChange(lead._id, e.target.value)}
                      aria-label={`Change status for ${lead.name}`}
                      className="px-2 py-1 rounded-lg border border-[#E8EAF1] bg-[#F7F8FC] text-[11px] font-semibold text-[#20243A] focus:outline-none focus:border-[#635BFF]"
                    >
                      {PIPELINE_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScheduleLead(lead)}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#C7CBFF] bg-[#EEF0FF] hover:bg-[#635BFF] text-[#635BFF] hover:text-white text-xs font-semibold transition-colors"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {lead.scheduledCall?.scheduledAt ? 'Reschedule Call' : 'Schedule Call'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN BOARD VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {KANBAN_COLUMNS.map((col) => {
            const colLeads = filteredLeads.filter((l) =>
              col.statuses.includes(l.qualificationStatus || 'new')
            );
            return (
              <div
                key={col.key}
                className="rounded-2xl border border-[#E8EAF1] bg-[#F7F8FC] p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#20243A]">
                    {col.title}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-white border border-[#E8EAF1] text-[11px] font-bold text-[#635BFF]">
                    {colLeads.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {colLeads.length === 0 ? (
                    <p className="text-[11px] text-[#747B91] text-center py-6 bg-white/60 rounded-xl border border-dashed border-[#E8EAF1]">
                      No leads in stage
                    </p>
                  ) : (
                    colLeads.map((lead) => {
                      const heat = getHeatBadge(computeLeadBucket(lead));
                      const liveSched = computeScheduledCallStatus(lead.scheduledCall, nowTick);
                      return (
                        <div
                          key={lead._id}
                          className="rounded-xl border border-[#E8EAF1] bg-white p-3 space-y-2 shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#20243A] truncate">{lead.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <p className="text-[11px] font-mono text-[#747B91]">{lead.phone}</p>
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#EEF0FF] text-[#635BFF] whitespace-nowrap">
                                  {lead.totalCalls || 0}c
                                </span>
                              </div>
                            </div>
                            <span
                              className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold ${heat.cls}`}
                            >
                              {computeEffectiveLeadScore(lead)} pts
                            </span>
                          </div>
                          {liveSched && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${getSchedulePillClass(
                                liveSched
                              )}`}
                            >
                              <Clock className="w-3 h-3" />
                              {liveSched}
                            </span>
                          )}
                          <div className="flex items-center justify-between pt-1.5 border-t border-[#E8EAF1]">
                            <Link
                              href={`/leads/${lead._id}`}
                              className="text-[11px] font-semibold text-[#635BFF] hover:underline"
                            >
                              View →
                            </Link>
                            <button
                              type="button"
                              onClick={() => setScheduleLead(lead)}
                              className="text-[11px] font-semibold text-[#20243A] hover:text-[#635BFF]"
                            >
                              Schedule Call
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DATA TABLE VIEW (Fixed whitespace-nowrap badges!) */
        <div className="rounded-2xl border border-[#E8EAF1] bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91] uppercase">Lead</th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91] uppercase">Contact</th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91] uppercase">AI Qualification</th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91] uppercase">Score &amp; Heat</th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91] uppercase">Sales Rep</th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91] uppercase">Scheduled Call</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAF1]">
              {filteredLeads.map((lead) => {
                const heat = getHeatBadge(computeLeadBucket(lead));
                const liveSched = computeScheduledCallStatus(lead.scheduledCall, nowTick);
                return (
                  <tr key={lead._id} className="hover:bg-[#F7F8FC] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#20243A]">{lead.name}</p>
                      <p className="text-[11px] text-[#747B91] truncate max-w-[200px]">
                        {lead.company || 'Direct Prospect'}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#20243A] whitespace-nowrap">
                      <div>{lead.phone}</div>
                      <div className="text-[10px] font-sans font-semibold text-[#635BFF] mt-0.5">
                        📞 {lead.totalCalls || 0} {(lead.totalCalls || 0) === 1 ? 'call' : 'calls'}
                        {lead.lastAgentName ? ` • ${lead.lastAgentName}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${getStatusPillClass(
                          lead.qualificationStatus || 'new'
                        )}`}
                      >
                        {(lead.qualificationStatus || 'new').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[#20243A]">
                          {computeEffectiveLeadScore(lead)} pts
                        </span>
                        <span
                          className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold ${heat.cls}`}
                        >
                          {heat.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#20243A] whitespace-nowrap">
                      {lead.assignedSalespersonName || (
                        <span className="text-[#747B91] italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {liveSched ? (
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`inline-flex items-center self-start whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold ${getSchedulePillClass(
                              liveSched
                            )}`}
                          >
                            {liveSched}
                          </span>
                          <span className="text-[10px] text-[#747B91]">
                            {new Date(lead.scheduledCall.scheduledAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#747B91]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setScheduleLead(lead)}
                          className="px-2.5 py-1.5 rounded-lg border border-[#C7CBFF] bg-[#EEF0FF] text-[#635BFF] hover:bg-[#635BFF] hover:text-white font-semibold transition-colors"
                        >
                          Schedule
                        </button>
                        <Link
                          href={`/leads/${lead._id}`}
                          className="px-2.5 py-1.5 rounded-lg bg-[#635BFF] hover:bg-[#5046E5] text-white font-semibold"
                        >
                          Inspect →
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Real-Time Call Scheduling Modal */}
      <ScheduleCallModal
        lead={scheduleLead}
        teamMembers={teamMembers}
        onClose={() => setScheduleLead(null)}
        onScheduled={(updated) => {
          setLeads((prev) =>
            prev.map((l) => (l._id === updated._id ? { ...l, ...updated } : l))
          );
          toast.success(`Follow-up call scheduled for ${updated.name}.`);
        }}
      />
    </div>
  );
}
