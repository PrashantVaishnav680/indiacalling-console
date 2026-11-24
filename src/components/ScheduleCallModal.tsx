'use client';

import { useState, useEffect } from 'react';
import { Bot, Calendar, Clock, Sparkles, UserCheck, X } from 'lucide-react';

export interface SchedulableLead {
  _id: string;
  name: string;
  phone: string;
  company?: string;
  assignedSalespersonId?: string;
  assignedSalespersonName?: string;
  scheduledCall?: {
    scheduledAt?: string | Date;
    timezone?: string;
    notes?: string;
    status?: string;
    assignedToId?: string;
    assignedToName?: string;
    autoDialWithAi?: boolean;
    agentId?: string;
    agentName?: string;
    bolnaCallId?: string;
  };
}

export interface TeamMemberOption {
  _id: string;
  name: string;
  email: string;
  department?: string;
  title?: string;
  isActive?: boolean;
}

interface AgentOption {
  _id: string;
  name: string;
  bolnaAgentId?: string;
  status?: string;
}

interface ScheduleCallModalProps {
  lead: SchedulableLead | null;
  teamMembers: TeamMemberOption[];
  onClose: () => void;
  onScheduled: (updatedLead: any) => void;
}

function splitDateAndTime(dateInput?: string | Date): { date: string; time: string } {
  const d = dateInput ? new Date(dateInput) : new Date(Date.now() + 60 * 60 * 1000);
  const safe = Number.isNaN(d.getTime()) ? new Date(Date.now() + 60 * 60 * 1000) : d;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}`,
    time: `${pad(safe.getHours())}:${pad(safe.getMinutes())}`,
  };
}

function getTodayDateString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function ScheduleCallModal({
  lead,
  teamMembers,
  onClose,
  onScheduled,
}: ScheduleCallModalProps) {
  const [datePart, setDatePart] = useState('');
  const [timePart, setTimePart] = useState('');
  const [selectedRepId, setSelectedRepId] = useState('');
  const [status, setStatus] = useState<'scheduled' | 'completed' | 'missed'>('scheduled');
  const [notes, setNotes] = useState('');
  const [autoDialWithAi, setAutoDialWithAi] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!lead) return;
    let active = true;
    const initTimer = setTimeout(() => {
      if (!active) return;
      const parts = splitDateAndTime(lead.scheduledCall?.scheduledAt);
      setDatePart(parts.date);
      setTimePart(parts.time);
      const defaultRep =
        lead.assignedSalespersonId ||
        lead.scheduledCall?.assignedToId ||
        teamMembers.find((m) => m.department?.toLowerCase() === 'sales')?._id ||
        teamMembers[0]?._id ||
        '';
      setSelectedRepId(defaultRep);
      const existingStatus = String(lead.scheduledCall?.status || 'scheduled').toLowerCase();
      setStatus(
        existingStatus === 'completed' || existingStatus === 'missed'
          ? (existingStatus as 'completed' | 'missed')
          : 'scheduled'
      );
      setNotes(lead.scheduledCall?.notes || '');
      setAutoDialWithAi(Boolean(lead.scheduledCall?.autoDialWithAi));
      setSelectedAgentId(lead.scheduledCall?.agentId || '');
      setError('');
      setLoadingAgents(true);
    }, 0);

    fetch('/api/agents')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!active) return;
        const list: AgentOption[] = Array.isArray(json?.agents) ? json.agents : [];
        const synced = list.filter((a) => Boolean(a.bolnaAgentId));
        setAgents(synced);
        if (!lead.scheduledCall?.agentId && synced.length > 0) {
          setSelectedAgentId(synced[0]._id);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingAgents(false);
      });

    return () => {
      active = false;
      clearTimeout(initTimer);
    };
  }, [lead, teamMembers]);

  if (!lead) return null;

  const applyQuickPreset = (preset: '30m' | '1h' | 'tom10' | 'tom16') => {
    const target = new Date();
    if (preset === '30m') {
      target.setMinutes(target.getMinutes() + 30);
    } else if (preset === '1h') {
      target.setHours(target.getHours() + 1);
    } else if (preset === 'tom10') {
      target.setDate(target.getDate() + 1);
      target.setHours(10, 0, 0, 0);
    } else if (preset === 'tom16') {
      target.setDate(target.getDate() + 1);
      target.setHours(16, 0, 0, 0);
    }
    const parts = splitDateAndTime(target);
    setDatePart(parts.date);
    setTimePart(parts.time);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datePart || !timePart) {
      setError('Please pick both a follow-up date and time.');
      return;
    }
    const combinedDate = new Date(`${datePart}T${timePart}:00`);
    if (Number.isNaN(combinedDate.getTime())) {
      setError('Invalid follow-up date or time selected.');
      return;
    }
    if (status === 'scheduled' && combinedDate.getTime() < Date.now() - 60_000) {
      setError('Scheduled follow-up time must be in the future.');
      return;
    }
    if (autoDialWithAi && status === 'scheduled' && !selectedAgentId) {
      setError('Please select a synced AI Voice Agent for automated dialing.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const chosenRep = teamMembers.find((m) => m._id === selectedRepId);
      const res = await fetch(`/api/leads/${lead._id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: combinedDate.toISOString(),
          timezone: 'Asia/Kolkata',
          status,
          notes: notes.trim(),
          assignedSalespersonId: chosenRep?._id || selectedRepId,
          assignedSalespersonName: chosenRep?.name || lead.assignedSalespersonName || 'Sales Rep',
          autoDialWithAi: autoDialWithAi && status === 'scheduled',
          agentId: autoDialWithAi && status === 'scheduled' ? selectedAgentId : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not schedule follow-up call.');
      } else {
        onScheduled(json.lead);
        onClose();
      }
    } catch {
      setError('Network error while saving call schedule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#20243A]/45 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl border border-[#E8EAF1] shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#20243A]">
                Schedule Follow-Up Call
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF]">
                IST (Asia/Kolkata)
              </span>
            </div>
            <p className="text-xs text-[#747B91] mt-0.5">
              {lead.name} · <span className="font-mono">{lead.phone}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#747B91] hover:bg-[#F7F8FC] hover:text-[#20243A]"
            aria-label="Close schedule modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quick Time Presets */}
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#747B91]">
              <Sparkles className="w-3 h-3 text-[#635BFF]" />
              Quick Time Presets
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: '30m' as const, label: 'In 30 mins' },
                { key: '1h' as const, label: 'In 1 hour' },
                { key: 'tom10' as const, label: 'Tomorrow 10:00 AM' },
                { key: 'tom16' as const, label: 'Tomorrow 4:00 PM' },
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyQuickPreset(p.key)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F7F8FC] hover:bg-[#EEF0FF] text-[#20243A] hover:text-[#635BFF] border border-[#E8EAF1] hover:border-[#C7CBFF] transition"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Explicit Date & Time Pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#20243A] mb-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#635BFF]" />
                Follow-Up Date
              </label>
              <input
                type="date"
                min={status === 'scheduled' ? getTodayDateString() : undefined}
                value={datePart}
                onChange={(e) => {
                  setDatePart(e.target.value);
                  setError('');
                }}
                className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF]"
                required
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#20243A] mb-1.5">
                <Clock className="w-3.5 h-3.5 text-[#13B8A6]" />
                Follow-Up Time (IST)
              </label>
              <input
                type="time"
                value={timePart}
                onChange={(e) => {
                  setTimePart(e.target.value);
                  setError('');
                }}
                className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#20243A] mb-1.5">
                <Clock className="w-3.5 h-3.5 text-[#13B8A6]" />
                Call Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'scheduled' | 'completed' | 'missed')}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A] bg-white focus:outline-none focus:border-[#635BFF]"
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="missed">Missed</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#20243A] mb-1.5">
                <UserCheck className="w-3.5 h-3.5 text-[#635BFF]" />
                Assign Sales Rep
              </label>
              <select
                value={selectedRepId}
                onChange={(e) => setSelectedRepId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A] bg-white focus:outline-none focus:border-[#635BFF]"
              >
                {teamMembers.length === 0 ? (
                  <option value="">Default Organization Owner</option>
                ) : (
                  teamMembers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} {m.department ? `(${m.department})` : ''} — {m.email}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {status === 'scheduled' && (
            <div className="rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] p-3.5 space-y-2.5">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="flex items-center gap-2 text-xs font-semibold text-[#20243A]">
                  <Bot className="w-4 h-4 text-[#635BFF]" />
                  Auto-dial with AI Voice Agent at scheduled time
                </span>
                <input
                  type="checkbox"
                  checked={autoDialWithAi}
                  onChange={(e) => setAutoDialWithAi(e.target.checked)}
                  className="h-4 w-4 rounded border-[#D0D5E4] text-[#635BFF] focus:ring-[#635BFF]"
                />
              </label>

              {autoDialWithAi && (
                <div>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    disabled={loadingAgents || agents.length === 0}
                    className="w-full px-3 py-2 rounded-lg border border-[#E8EAF1] text-xs text-[#20243A] bg-white focus:outline-none focus:border-[#635BFF] disabled:opacity-60"
                  >
                    {loadingAgents ? (
                      <option value="">Loading AI agents...</option>
                    ) : agents.length === 0 ? (
                      <option value="">No synced AI agents available</option>
                    ) : (
                      agents.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.name}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="text-[11px] text-[#747B91] mt-1">
                    Queues a real IndiaCalling Voice AI outbound call to {lead.phone} at the selected IST time and logs it in Call History.
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#20243A] mb-1.5">
              Call Agenda / Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Confirm villa pricing, share site visit location pin, and discuss financing options."
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF]"
            />
          </div>

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#747B91] hover:bg-[#F7F8FC]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm disabled:opacity-50"
            >
              {saving
                ? 'Saving...'
                : autoDialWithAi && status === 'scheduled'
                ? 'Schedule AI Call'
                : 'Save Call Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
