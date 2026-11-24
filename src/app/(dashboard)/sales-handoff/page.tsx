'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  Calendar,
  CheckCircle2,
  Clock,
  Search,
  UserCheck,
  PhoneCall,
  ArrowUpRight,
  Eye,
  X,
  Mail,
  Briefcase,
  Plus,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import ScheduleCallModal, { TeamMemberOption } from '@/components/ScheduleCallModal';
import {
  computeEffectiveLeadScore,
  computeLeadBucket,
  computeScheduledCallStatus,
  extractLeadSignals,
} from '@/lib/call-scheduling';

const HANDOFF_STATUSES = [
  { value: 'qualified', label: 'Qualified' },
  { value: 'call_scheduled', label: 'Call Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
];

export default function SalesHandoffPage() {
  const toast = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [scheduleLead, setScheduleLead] = useState<any | null>(null);
  const [inspectRep, setInspectRep] = useState<TeamMemberOption | null>(null);
  const [quickAssignLeadId, setQuickAssignLeadId] = useState('');
  const [nowTick, setNowTick] = useState<number>(0);

  useEffect(() => {
    const init = setTimeout(() => setNowTick(Date.now()), 0);
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => {
      clearTimeout(init);
      clearInterval(id);
    };
  }, []);

  const loadHandoffData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, usersRes] = await Promise.all([
        fetch('/api/leads'),
        fetch('/api/users'),
      ]);
      if (leadsRes.ok) {
        const lJson = await leadsRes.json();
        setLeads(Array.isArray(lJson.leads) ? lJson.leads : []);
      }
      if (usersRes.ok) {
        const uJson = await usersRes.json();
        const active = (Array.isArray(uJson.users) ? uJson.users : []).filter(
          (u: any) => u.isActive !== false
        );
        active.sort((a: any, b: any) => {
          const aSales = String(a.department || '').toLowerCase() === 'sales' ? 0 : 1;
          const bSales = String(b.department || '').toLowerCase() === 'sales' ? 0 : 1;
          return aSales - bSales;
        });
        setTeamMembers(active);
      }
    } catch {
      toast.error('Failed to load Sales Handoff workload.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadHandoffData();
  }, [loadHandoffData]);

  // Include qualified, hot/warm scored leads, assigned leads, and scheduled leads
  const handoffLeads = useMemo(() => {
    const eligibleStatuses = new Set([
      'qualified',
      'call_scheduled',
      'in_progress',
      'assigned',
      'contacted',
      'converted',
      'lost',
    ]);
    return leads.filter((l) => {
      const bucket = computeLeadBucket(l);
      return (
        eligibleStatuses.has(l.qualificationStatus) ||
        bucket === 'hot' ||
        bucket === 'warm' ||
        Boolean(l.assignedSalespersonId) ||
        Boolean(l.scheduledCall?.scheduledAt)
      );
    });
  }, [leads]);

  const getLeadsForRep = useCallback(
    (rep: TeamMemberOption) =>
      handoffLeads.filter(
        (l) =>
          String(l.assignedSalespersonId || '') === String(rep._id) ||
          (l.assignedSalespersonName &&
            l.assignedSalespersonName.toLowerCase() === rep.name.toLowerCase())
      ),
    [handoffLeads]
  );

  const repWorkloads = useMemo(() => {
    return teamMembers.map((rep) => {
      const assigned = getLeadsForRep(rep);
      const scheduled = assigned.filter((l) => Boolean(l.scheduledCall?.scheduledAt)).length;
      const dueNow = assigned.filter(
        (l) => computeScheduledCallStatus(l.scheduledCall, nowTick) === 'Due Now'
      ).length;
      const converted = assigned.filter((l) => l.qualificationStatus === 'converted').length;
      return {
        rep,
        assigned,
        totalAssigned: assigned.length,
        scheduled,
        dueNow,
        converted,
      };
    });
  }, [teamMembers, getLeadsForRep, nowTick]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return handoffLeads.filter((l) => {
      if (selectedRepFilter === 'unassigned') {
        if (l.assignedSalespersonId || l.assignedSalespersonName) return false;
      } else if (selectedRepFilter !== 'all') {
        const repObj = teamMembers.find((m) => m._id === selectedRepFilter);
        const matchesId = String(l.assignedSalespersonId || '') === selectedRepFilter;
        const matchesName =
          repObj &&
          String(l.assignedSalespersonName || '').toLowerCase() ===
            repObj.name.toLowerCase();
        if (!matchesId && !matchesName) return false;
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
  }, [handoffLeads, selectedRepFilter, statusFilter, search, teamMembers]);

  const handleAssignRep = async (leadId: string, repId: string) => {
    const rep = teamMembers.find((m) => m._id === repId);
    if (!rep) return;
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedSalespersonId: rep._id,
          assignedSalespersonName: rep.name,
        }),
      });
      if (!res.ok) {
        toast.error('Could not reassign lead.');
      } else {
        setLeads((prev) =>
          prev.map((l) =>
            l._id === leadId
              ? {
                  ...l,
                  assignedSalespersonId: rep._id,
                  assignedSalespersonName: rep.name,
                }
              : l
          )
        );
        toast.success(`Assigned lead to ${rep.name}.`);
      }
    } catch {
      toast.error('Network error while reassigning lead.');
    }
  };

  const handleStatusChange = async (leadId: string, nextStatus: string) => {
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
        toast.success(`Updated status to ${nextStatus.replace(/_/g, ' ')}.`);
      }
    } catch {
      toast.error('Network error updating status.');
    }
  };

  const unassignedLeads = useMemo(
    () =>
      leads.filter(
        (l) => !l.assignedSalespersonId && !l.assignedSalespersonName
      ),
    [leads]
  );

  const unassignedHandoffCount = handoffLeads.filter(
    (l) => !l.assignedSalespersonId && !l.assignedSalespersonName
  ).length;
  const scheduledCallsCount = handoffLeads.filter((l) =>
    Boolean(l.scheduledCall?.scheduledAt)
  ).length;
  const salesTeamCount = teamMembers.filter(
    (m) => String(m.department || '').toLowerCase() === 'sales'
  ).length;

  const inspectedRepData = inspectRep
    ? repWorkloads.find((w) => w.rep._id === inspectRep._id) || null
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#20243A]">
            Sales Handoff &amp; Rep Workload
          </h1>
          <p className="text-xs text-[#747B91] mt-0.5">
            Assign leads and track your sales team&apos;s workload.
          </p>
        </div>
        <Link
          href="/overview"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E8EAF1] bg-white hover:border-[#635BFF] text-xs font-semibold text-[#635BFF] self-start sm:self-auto"
        >
          Manage Sales Team ({salesTeamCount} in Sales)
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Top KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <p className="text-xs font-medium text-[#747B91]">Handoff Pipeline Leads</p>
          <p className="text-2xl font-bold text-[#20243A] mt-1">{handoffLeads.length}</p>
          <p className="text-[11px] text-emerald-700 font-medium mt-0.5">Qualified, Hot &amp; active</p>
        </div>
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <p className="text-xs font-medium text-[#747B91]">Pending Sales Pickup</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{unassignedHandoffCount}</p>
          <p className="text-[11px] text-[#747B91] mt-0.5">Awaiting rep assignment</p>
        </div>
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <p className="text-xs font-medium text-[#747B91]">Scheduled Follow-Up Calls</p>
          <p className="text-2xl font-bold text-[#635BFF] mt-1">{scheduledCallsCount}</p>
          <p className="text-[11px] text-[#747B91] mt-0.5">Tracked in real-time IST</p>
        </div>
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <p className="text-xs font-medium text-[#747B91]">Active Team Reps</p>
          <p className="text-2xl font-bold text-[#13B8A6] mt-1">{teamMembers.length}</p>
          <p className="text-[11px] text-[#747B91] mt-0.5">{salesTeamCount} in Sales dept</p>
        </div>
      </div>

      {/* Salesperson Workload Summary Cards with Inspect Salesperson Button */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#747B91]">
            Salesperson Workload Breakdown
          </h2>
          {selectedRepFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedRepFilter('all')}
              className="text-xs font-semibold text-[#635BFF] hover:underline"
            >
              Show All Reps
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {repWorkloads.map(({ rep, totalAssigned, scheduled, dueNow, converted }) => {
            const isSelected = selectedRepFilter === rep._id;
            return (
              <div
                key={rep._id}
                className={`rounded-2xl border p-4 transition-all bg-white flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'border-[#635BFF] ring-2 ring-[#635BFF]/15 shadow-sm'
                    : 'border-[#E8EAF1] hover:border-[#C7CBFF]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[#EEF0FF] text-[#635BFF] flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {rep.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#20243A] truncate">{rep.name}</p>
                        <p className="text-[10px] text-[#747B91] truncate">
                          {rep.department || 'Operations'} · {rep.title || 'Member'}
                        </p>
                      </div>
                    </div>
                    {dueNow > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold whitespace-nowrap">
                        {dueNow} Due
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#E8EAF1] text-center">
                    <div>
                      <p className="text-sm font-bold text-[#20243A]">{totalAssigned}</p>
                      <p className="text-[10px] text-[#747B91]">Assigned</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#635BFF]">{scheduled}</p>
                      <p className="text-[10px] text-[#747B91]">Scheduled</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-emerald-700">{converted}</p>
                      <p className="text-[10px] text-[#747B91]">Converted</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[#E8EAF1]">
                  <button
                    type="button"
                    onClick={() => {
                      setInspectRep(rep);
                      setQuickAssignLeadId(unassignedLeads[0]?._id || '');
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-[#EEF0FF] hover:bg-[#635BFF] text-[#635BFF] hover:text-white text-xs font-semibold transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Inspect Salesperson
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRepFilter(isSelected ? 'all' : rep._id)}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                      isSelected
                        ? 'bg-[#635BFF] text-white border-[#635BFF]'
                        : 'border-[#E8EAF1] text-[#747B91] hover:text-[#20243A]'
                    }`}
                  >
                    {isSelected ? 'Filtered' : 'Filter'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-[#747B91] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lead, phone, or assigned rep..."
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedRepFilter}
            onChange={(e) => setSelectedRepFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E8EAF1] bg-white text-xs font-medium text-[#20243A]"
          >
            <option value="all">All Representatives</option>
            <option value="unassigned">Unassigned Only</option>
            {teamMembers.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name} ({m.department || 'Team'})
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E8EAF1] bg-white text-xs font-medium text-[#20243A]"
          >
            <option value="all">All Statuses</option>
            {HANDOFF_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Detailed Assigned Lead Cards */}
      {loading ? (
        <div className="h-56 rounded-2xl shimmer-loading" />
      ) : filteredLeads.length === 0 ? (
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-12 text-center space-y-2">
          <Users className="w-8 h-8 text-[#747B91] mx-auto" />
          <p className="text-sm font-bold text-[#20243A]">
            No Qualified or Assigned Leads Match Your Filter
          </p>
          <p className="text-xs text-[#747B91]">
            Click <strong>Inspect Salesperson</strong> on any rep card above to assign leads directly or schedule follow-up calls.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLeads.map((lead) => {
            const liveSched = computeScheduledCallStatus(lead.scheduledCall, nowTick);
            const signals = extractLeadSignals(lead);
            const score = computeEffectiveLeadScore(lead);
            return (
              <div
                key={lead._id}
                className="rounded-2xl border border-[#E8EAF1] bg-white p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:border-[#C7CBFF] transition-colors"
              >
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/leads/${lead._id}`}
                      className="text-sm font-bold text-[#20243A] hover:text-[#635BFF]"
                    >
                      {lead.name}
                    </Link>
                    <span className="font-mono text-xs text-[#747B91]">{lead.phone}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#F7F8FC] border border-[#E8EAF1] text-[11px] font-bold text-[#20243A]">
                      {score} pts
                    </span>
                    {liveSched && (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
                          liveSched === 'Due Now'
                            ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse'
                            : liveSched === 'Completed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : liveSched === 'Missed'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF]'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {liveSched}:{' '}
                        {new Date(lead.scheduledCall.scheduledAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>

                  {lead.qualificationReason && (
                    <p className="text-xs text-[#747B91] line-clamp-2">
                      {lead.qualificationReason}
                    </p>
                  )}

                  {signals.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {signals.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#F7F8FC] border border-[#E8EAF1] text-[11px] text-[#20243A]"
                        >
                          <CheckCircle2 className="w-3 h-3 text-[#13B8A6]" />
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-[#747B91]" />
                    <select
                      value={lead.assignedSalespersonId || ''}
                      onChange={(e) => handleAssignRep(lead._id, e.target.value)}
                      aria-label={`Assign rep for ${lead.name}`}
                      className="px-2.5 py-2 rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] text-xs font-semibold text-[#20243A]"
                    >
                      <option value="">Assign Rep...</option>
                      {teamMembers.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.name} ({m.department || 'Team'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <select
                    value={lead.qualificationStatus || 'qualified'}
                    onChange={(e) => handleStatusChange(lead._id, e.target.value)}
                    aria-label={`Status for ${lead.name}`}
                    className="px-2.5 py-2 rounded-xl border border-[#E8EAF1] bg-white text-xs font-semibold text-[#20243A]"
                  >
                    {HANDOFF_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setScheduleLead(lead)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm whitespace-nowrap"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {lead.scheduledCall?.scheduledAt ? 'Update Call' : 'Schedule Call'}
                  </button>

                  <Link
                    href={`/leads/${lead._id}`}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-[#E8EAF1] hover:border-[#635BFF] text-xs font-semibold text-[#20243A]"
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-[#635BFF]" />
                    Details
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inspect Salesperson Slide-Over Drawer */}
      {inspectRep && inspectedRepData && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-[#20243A]/45 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg h-[100dvh] shadow-2xl border-l border-[#E8EAF1] flex flex-col overflow-hidden">
            {/* Drawer Header */}
            <div className="p-5 border-b border-[#E8EAF1] flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-[#635BFF] text-white flex items-center justify-center font-bold text-sm">
                  {inspectRep.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[#20243A]">{inspectRep.name}</h2>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-[#747B91] flex items-center gap-1.5 mt-0.5">
                    <Mail className="w-3 h-3" /> {inspectRep.email}
                  </p>
                  <p className="text-[11px] text-[#747B91] flex items-center gap-1.5 mt-0.5">
                    <Briefcase className="w-3 h-3" /> {inspectRep.department || 'Operations'} · {inspectRep.title || 'Team Member'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectRep(null)}
                className="p-2 rounded-xl text-[#747B91] hover:bg-[#F7F8FC] hover:text-[#20243A]"
                aria-label="Close salesperson inspector"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Conversion & Workload Metrics */}
              <div className="grid grid-cols-4 gap-2.5 text-center">
                <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-3">
                  <p className="text-lg font-bold text-[#20243A]">{inspectedRepData.totalAssigned}</p>
                  <p className="text-[10px] text-[#747B91]">Assigned</p>
                </div>
                <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-3">
                  <p className="text-lg font-bold text-[#635BFF]">{inspectedRepData.scheduled}</p>
                  <p className="text-[10px] text-[#747B91]">Scheduled</p>
                </div>
                <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-3">
                  <p className="text-lg font-bold text-red-600">{inspectedRepData.dueNow}</p>
                  <p className="text-[10px] text-[#747B91]">Due Now</p>
                </div>
                <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-3">
                  <p className="text-lg font-bold text-emerald-700">{inspectedRepData.converted}</p>
                  <p className="text-[10px] text-[#747B91]">Converted</p>
                </div>
              </div>

              {/* Quick Assign a New Lead to this Salesperson */}
              <div className="rounded-xl border border-[#C7CBFF] bg-[#EEF0FF]/50 p-3.5 space-y-2">
                <p className="text-xs font-bold text-[#20243A]">
                  Quick Assign a Lead to {inspectRep.name}
                </p>
                {unassignedLeads.length === 0 ? (
                  <p className="text-[11px] text-[#747B91]">
                    All workspace leads are already assigned.
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={quickAssignLeadId}
                      onChange={(e) => setQuickAssignLeadId(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-[#E8EAF1] bg-white text-xs text-[#20243A]"
                    >
                      {unassignedLeads.map((ul) => (
                        <option key={ul._id} value={ul._id}>
                          {ul.name} ({ul.phone}) — {computeEffectiveLeadScore(ul)} pts
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!quickAssignLeadId}
                      onClick={() => handleAssignRep(quickAssignLeadId, inspectRep._id)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Assign
                    </button>
                  </div>
                )}
              </div>

              {/* Assigned Leads List */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#747B91]">
                  Assigned Leads ({inspectedRepData.assigned.length})
                </h3>
                {inspectedRepData.assigned.length === 0 ? (
                  <p className="text-xs text-[#747B91] bg-[#F7F8FC] rounded-xl p-5 text-center border border-[#E8EAF1]">
                    No leads assigned to {inspectRep.name} yet. Use Quick Assign above to route a lead.
                  </p>
                ) : (
                  inspectedRepData.assigned.map((lead) => {
                    const liveSched = computeScheduledCallStatus(lead.scheduledCall, nowTick);
                    return (
                      <div
                        key={lead._id}
                        className="rounded-xl border border-[#E8EAF1] p-3.5 space-y-2 bg-white"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Link
                              href={`/leads/${lead._id}`}
                              className="text-xs font-bold text-[#20243A] hover:text-[#635BFF]"
                            >
                              {lead.name}
                            </Link>
                            <p className="text-[11px] font-mono text-[#747B91]">{lead.phone}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-[#F7F8FC] border border-[#E8EAF1] text-[10px] font-bold text-[#20243A]">
                            {computeEffectiveLeadScore(lead)} pts
                          </span>
                        </div>

                        {liveSched && (
                          <p className="text-[11px] font-semibold text-[#635BFF] flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {liveSched} ·{' '}
                            {new Date(lead.scheduledCall.scheduledAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E8EAF1]">
                          <select
                            value={lead.assignedSalespersonId || inspectRep._id}
                            onChange={(e) => handleAssignRep(lead._id, e.target.value)}
                            className="px-2 py-1 rounded-lg border border-[#E8EAF1] bg-[#F7F8FC] text-[11px] font-semibold text-[#20243A]"
                          >
                            {teamMembers.map((m) => (
                              <option key={m._id} value={m._id}>
                                Reassign: {m.name}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setScheduleLead(lead)}
                              className="text-[11px] font-semibold text-[#635BFF] hover:underline"
                            >
                              Schedule Call
                            </button>
                            <Link
                              href={`/leads/${lead._id}`}
                              className="text-[11px] font-semibold text-[#20243A] hover:text-[#635BFF]"
                            >
                              Inspect →
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ScheduleCallModal
        lead={scheduleLead}
        teamMembers={teamMembers}
        onClose={() => setScheduleLead(null)}
        onScheduled={(updated) => {
          setLeads((prev) =>
            prev.map((l) => (l._id === updated._id ? { ...l, ...updated } : l))
          );
          toast.success(`Call schedule saved for ${updated.name}.`);
        }}
      />
    </div>
  );
}
