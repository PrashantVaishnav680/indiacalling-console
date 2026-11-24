"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  PhoneCall,
  UserCheck,
  Sparkles,
  AlertTriangle,
  Clock,
  Bot,
} from "lucide-react";
import { formatDate, formatDuration } from "@/lib/utils";
import { parseStructuredFields, sanitizeReadableSummary } from "@/lib/lead-formatting";
import {
  computeEffectiveLeadScore,
  computeLeadBucket,
  extractLeadSignals,
} from "@/lib/call-scheduling";
import { buildLeadInteractionTimeline } from "@/lib/lead-timeline";

const OUTCOME_OPTIONS = [
  "Interested",
  "Callback Scheduled",
  "Cancelled / Not Interested",
  "Converted",
];

function toneBadgeClass(tone: string) {
  switch (tone) {
    case "emerald":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "indigo":
      return "bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF]";
    case "red":
      return "bg-red-50 text-red-700 border border-red-200";
    case "amber":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    default:
      return "bg-gray-100 text-gray-700 border border-gray-200";
  }
}

export default function LeadDetailPage({
  params,
}: {
  params?: { id: string } | Promise<{ id: string }>;
}) {
  const routeParams = useParams();
  const id = (routeParams?.id as string) || (params as any)?.id || "";

  const [lead, setLead] = useState<any>(null);
  const [relatedCalls, setRelatedCalls] = useState<any[]>([]);
  const [assignedSalespersonId, setAssignedSalespersonId] = useState("");
  const [teamMembers, setTeamMembers] = useState<
    Array<{ _id: string; name: string; department?: string; title?: string; isActive?: boolean }>
  >([]);
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  // Salesperson quick outcome form
  const [outcomeChoice, setOutcomeChoice] = useState("Interested");
  const [outcomeReason, setOutcomeReason] = useState("");
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [outcomeMsg, setOutcomeMsg] = useState("");

  const fetchLeadAndCalls = useCallback(async () => {
    if (!id) return;
    try {
      const [resUsers, resLead] = await Promise.all([
        fetch("/api/users"),
        fetch(`/api/leads/${id}`),
      ]);

      let activeMembers: any[] = [];
      if (resUsers.ok) {
        const u = await resUsers.json();
        activeMembers = (Array.isArray(u?.users) ? u.users : []).filter(
          (m: any) => m.isActive !== false
        );
        setTeamMembers(activeMembers);
      }

      if (resLead.ok) {
        const jsonL = await resLead.json();
        setLead(jsonL.lead);
        if (Array.isArray(jsonL.calls)) {
          setRelatedCalls(jsonL.calls);
        }
        if (jsonL.lead?.assignedSalespersonId) {
          setAssignedSalespersonId(String(jsonL.lead.assignedSalespersonId));
        } else if (activeMembers.length > 0) {
          setAssignedSalespersonId(activeMembers[0]._id);
        }
      }
    } catch (err) {
      console.error("Failed to load lead details", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLeadAndCalls();
  }, [fetchLeadAndCalls]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !assignedSalespersonId) return;
    const chosen = teamMembers.find((m) => m._id === assignedSalespersonId);
    if (!chosen) return;
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qualificationStatus:
            lead?.qualificationStatus === "new" ? "assigned" : lead?.qualificationStatus,
          assignedSalespersonId: chosen._id,
          assignedSalespersonName: chosen.name,
        }),
      });
      if (res.ok) {
        setLead((prev: any) => ({
          ...prev,
          assignedSalespersonId: chosen._id,
          assignedSalespersonName: chosen.name,
        }));
        setAssignSuccess(true);
        setTimeout(() => setAssignSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to assign lead", err);
    }
  };

  const handleLogSalesOutcome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingOutcome(true);
    setOutcomeMsg("");
    try {
      const res = await fetch(`/api/leads/${id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: outcomeChoice,
          reason: outcomeReason.trim(),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setLead(json.lead);
        setOutcomeReason("");
        setOutcomeMsg(`Logged "${outcomeChoice}" to the lead timeline.`);
        setTimeout(() => setOutcomeMsg(""), 3500);
      }
    } finally {
      setSavingOutcome(false);
    }
  };

  const { timeline, firstInterestedEvent, latestOutcomeEvent } = useMemo(
    () => buildLeadInteractionTimeline(lead, relatedCalls),
    [lead, relatedCalls]
  );

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-[#747B91]">
        Loading prospect profile &amp; interaction journey...
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="bg-white border border-[#E8EAF1] rounded-2xl p-12 text-center max-w-md mx-auto space-y-4">
        <h2 className="text-base font-bold text-[#20243A]">Lead Not Found</h2>
        <Link
          href="/leads"
          className="inline-block px-4 py-2 bg-[#635BFF] text-white text-xs font-semibold rounded-lg"
        >
          ← Back to Leads
        </Link>
      </div>
    );
  }

  const effectiveScore = computeEffectiveLeadScore(lead);
  const heatBucket = computeLeadBucket(lead);
  const signals = extractLeadSignals(lead);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-[#747B91]">
            <Link href="/leads" className="hover:text-[#635BFF]">
              Leads
            </Link>
            <span>/</span>
            <span className="text-[#20243A]">{lead.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[#20243A]">{lead.name}</h1>
            <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">
              {(lead.qualificationStatus || "new").replace(/_/g, " ")}
            </span>
            <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200 capitalize">
              {effectiveScore} pts · {heatBucket}
            </span>
          </div>
        </div>

        <Link
          href={`/testing?phone=${encodeURIComponent(lead.phone)}`}
          className="px-4 py-2 bg-[#635BFF] text-white text-xs font-semibold rounded-lg hover:bg-[#5046E5] transition-colors whitespace-nowrap"
        >
          Call Lead with AI Agent →
        </Link>
      </div>

      {/* Journey Highlights Banner: First Interested Call + Latest Status Change */}
      {(firstInterestedEvent || latestOutcomeEvent) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                First Interested Moment
              </p>
              {firstInterestedEvent ? (
                <>
                  <p className="text-xs font-bold text-[#20243A] mt-0.5">
                    {firstInterestedEvent.sequenceLabel} ({firstInterestedEvent.actorName}) — {firstInterestedEvent.outcomeLabel}
                  </p>
                  <p className="text-[11px] text-[#747B91] mt-0.5 line-clamp-2">
                    {firstInterestedEvent.reason}
                  </p>
                </>
              ) : (
                <p className="text-xs text-[#747B91] mt-0.5">
                  No positive interest call logged yet.
                </p>
              )}
            </div>
          </div>

          <div
            className={`rounded-2xl border p-4 flex items-start gap-3 ${
              latestOutcomeEvent?.isNegative
                ? "border-red-200 bg-red-50/60"
                : "border-[#C7CBFF] bg-[#EEF0FF]/60"
            }`}
          >
            {latestOutcomeEvent?.isNegative ? (
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            ) : (
              <Clock className="w-5 h-5 text-[#635BFF] flex-shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#20243A]">
                Latest Status Change (
                {latestOutcomeEvent?.actorType === "salesperson"
                  ? "By Salesperson"
                  : "By AI Call"}
                )
              </p>
              {latestOutcomeEvent && (
                <>
                  <p className="text-xs font-bold text-[#20243A] mt-0.5">
                    {latestOutcomeEvent.sequenceLabel} · {latestOutcomeEvent.outcomeLabel}
                  </p>
                  <p className="text-[11px] text-[#747B91] mt-0.5 line-clamp-2">
                    {latestOutcomeEvent.reason}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {assignSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-medium">
          Lead assigned to {lead.assignedSalespersonName}!
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Profile, Score/Signals, Assignment & Log Sales Outcome */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-[#E8EAF1] rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-sm text-[#20243A]">Prospect Profile</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between gap-3 py-1 border-b border-[#E8EAF1]">
                <span className="text-[#747B91]">Company / Notes:</span>
                <span className="font-semibold text-[#20243A] text-right">
                  {lead.company || "—"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8EAF1]">
                <span className="text-[#747B91]">Phone:</span>
                <span className="font-mono text-[#20243A]">{lead.phone}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8EAF1]">
                <span className="text-[#747B91]">Assigned Rep:</span>
                <span className="font-semibold text-[#20243A]">
                  {lead.assignedSalespersonName || "Unassigned"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8EAF1]">
                <span className="text-[#747B91]">Lead Source:</span>
                <span className="text-[#20243A]">{lead.source}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#747B91]">Created:</span>
                <span className="text-[#20243A]">{formatDate(lead.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* AI Qualification Score + Signals */}
          <div className="bg-white border border-[#E8EAF1] rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-sm text-[#20243A]">AI Qualification Breakdown</h3>
            <div className="p-3.5 bg-[#EEF0FF] rounded-xl border border-[#C7CBFF] space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-[#635BFF]">Effective Score:</span>
                <span className="font-bold text-[#635BFF]">{effectiveScore} / 100 pts</span>
              </div>
              <p className="text-xs text-[#20243A]">
                {sanitizeReadableSummary(
                  lead.qualificationReason,
                  "No qualification call completed yet. Launch a call to evaluate."
                )}
              </p>
              {(() => {
                const detailCards = [
                  ...(lead.budget ? [{ key: "budget", label: "Budget", value: String(lead.budget) }] : []),
                  ...(lead.location ? [{ key: "location", label: "Location", value: String(lead.location) }] : []),
                  ...(lead.timeline ? [{ key: "timeline", label: "Timeline", value: String(lead.timeline) }] : []),
                  ...parseStructuredFields(lead.customFields),
                  ...parseStructuredFields(lead.qualificationReason),
                ];
                if (detailCards.length === 0) return null;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                    {detailCards.slice(0, 6).map((item) => (
                      <div
                        key={item.key}
                        className="rounded-xl border border-[#C7CBFF]/70 bg-white px-2.5 py-2"
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#747B91]">
                          {item.label}
                        </p>
                        <p className="text-xs font-semibold text-[#20243A] mt-0.5 break-words">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {signals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {signals.map((sig) => (
                    <span
                      key={sig}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-[#C7CBFF] text-[11px] font-semibold text-[#20243A]"
                    >
                      <CheckCircle2 className="w-3 h-3 text-[#13B8A6]" />
                      {sig}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Assign Sales Rep */}
            <form onSubmit={handleAssign} className="pt-2 border-t border-[#E8EAF1] space-y-2.5">
              <label className="block font-semibold text-xs text-[#20243A]">
                Assign to Human Sales Rep
              </label>
              <select
                value={assignedSalespersonId}
                onChange={(e) => setAssignedSalespersonId(e.target.value)}
                className="w-full px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl text-xs font-medium text-[#20243A]"
              >
                {teamMembers.length === 0 ? (
                  <option value="">No active team members — add one in Overview</option>
                ) : (
                  teamMembers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} ({m.department || "Operations"} — {m.title || "Team Member"})
                    </option>
                  ))
                )}
              </select>
              <button
                type="submit"
                className="w-full py-2 bg-[#635BFF] text-white text-xs font-semibold rounded-xl hover:bg-[#5046E5]"
              >
                Confirm Sales Assignment
              </button>
            </form>
          </div>

          {/* Quick Salesperson Outcome Logger */}
          <div className="bg-white border border-[#E8EAF1] rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#635BFF]" />
              <h3 className="font-bold text-sm text-[#20243A]">Log Salesperson Post-Call Outcome</h3>
            </div>
            <p className="text-xs text-[#747B91]">
              Record whether the prospect stayed interested, scheduled a callback, or declined so everyone sees why the status changed.
            </p>
            <form onSubmit={handleLogSalesOutcome} className="space-y-3">
              <select
                value={outcomeChoice}
                onChange={(e) => setOutcomeChoice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] text-xs font-semibold text-[#20243A]"
              >
                {OUTCOME_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <textarea
                rows={2}
                value={outcomeReason}
                onChange={(e) => setOutcomeReason(e.target.value)}
                placeholder="Reason / note (e.g. Prospect bought another plot, or confirmed visit for Sunday 11 AM)..."
                className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
              />
              {outcomeMsg && (
                <p className="text-xs font-semibold text-emerald-700">{outcomeMsg}</p>
              )}
              <button
                type="submit"
                disabled={savingOutcome}
                className="w-full py-2 rounded-xl bg-[#20243A] hover:bg-[#313654] text-white text-xs font-semibold disabled:opacity-50"
              >
                {savingOutcome ? "Logging Outcome..." : "Add Outcome to Timeline"}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column (7 cols): Chronological Interaction & Interest Journey Timeline */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white border border-[#E8EAF1] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-[#20243A]">
                  Lead Interaction &amp; Interest Journey ({timeline.length} events)
                </h3>
                <p className="text-xs text-[#747B91]">
                  Chronological history of AI calls and salesperson updates showing exactly when interest changed.
                </p>
              </div>
            </div>

            {timeline.length > 0 ? (
              <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E8EAF1]">
                {timeline.map((ev) => (
                  <div
                    key={ev.id}
                    className="relative rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] p-4 space-y-2"
                  >
                    <span
                      className={`absolute -left-[22px] top-4 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                        ev.isInterested
                          ? "bg-emerald-500"
                          : ev.isNegative
                          ? "bg-red-500"
                          : ev.actorType === "salesperson"
                          ? "bg-[#20243A]"
                          : "bg-[#635BFF]"
                      }`}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#20243A]">
                          {ev.actorType === "ai" ? (
                            <Bot className="w-3.5 h-3.5 text-[#635BFF]" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5 text-[#20243A]" />
                          )}
                          {ev.sequenceLabel} · {ev.actorName}
                        </span>
                        <span
                          className={`inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-[11px] font-bold ${toneBadgeClass(
                            ev.tone
                          )}`}
                        >
                          {ev.outcomeLabel}
                        </span>
                        {typeof ev.durationSeconds === "number" && (
                          <span className="text-[11px] text-[#747B91]">
                            • {formatDuration(ev.durationSeconds)}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#747B91] whitespace-nowrap">
                        {formatDate(ev.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-[#20243A] leading-relaxed">{ev.reason}</p>

                    {ev.callId && (
                      <div className="pt-1">
                        <Link
                          href={`/calls/${ev.callId}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E8EAF1] hover:border-[#635BFF] text-[#635BFF] text-xs font-semibold"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          Listen to Recording &amp; Transcript →
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-xs text-[#747B91] bg-[#F7F8FC] rounded-xl border border-dashed border-[#E8EAF1]">
                No calls or salesperson outcomes recorded yet. Launch an AI call or log an outcome on the left.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
