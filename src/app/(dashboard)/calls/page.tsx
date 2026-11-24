"use client";

import { useState, useEffect } from "react";
import { classifyCallInterestOutcome } from "@/lib/lead-timeline";
import Link from "next/link";
import { IAgent, ICall, ICampaign, ILead } from "@/types";
import { formatDate, formatDuration } from "@/lib/utils";
import { LoadingState } from "@/components/LoadingSpinner";

export default function CallHistoryPage() {
  const [calls, setCalls] = useState<ICall[]>([]);
  const [agents, setAgents] = useState<IAgent[]>([]);
  const [campaigns, setCampaigns] = useState<ICampaign[]>([]);
  const [leads, setLeads] = useState<ILead[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Filters & Pagination
  const [directionFilter, setDirectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [qualificationFilter, setQualificationFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchAllData = async () => {
    try {
      const [callsRes, agentsRes, campaignsRes, leadsRes] = await Promise.all([
        fetch("/api/calls?pageSize=200"),
        fetch("/api/agents"),
        fetch("/api/campaigns"),
        fetch("/api/leads"),
      ]);
      if (callsRes.ok) {
        const json = await callsRes.json();
        setCalls(json.calls || []);
      }
      if (agentsRes.ok) {
        const json = await agentsRes.json();
        setAgents(json.agents || []);
      }
      if (campaignsRes.ok) {
        const json = await campaignsRes.json();
        setCampaigns(json.campaigns || []);
      }
      if (leadsRes.ok) {
        const json = await leadsRes.json();
        setLeads(json.leads || []);
      }
    } catch (err) {
      console.error("Failed to load call history data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleSyncCallsFromBolna = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const res = await fetch("/api/bolna/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agentFilter !== "all" ? agentFilter : undefined,
          syncAgents: true,
          syncCalls: true,
        }),
      });
      const data = await res.json();
      await fetchAllData();
      setSyncNotice(
        data.message || "Synchronized call executions from IndiaCalling Voice AI."
      );
    } catch (err: any) {
      setSyncNotice(err?.message || "Failed to sync call history from Voice AI Engine.");
    } finally {
      setSyncing(false);
    }
  };

  const campaignMap = new Map(campaigns.map((c) => [String(c._id), c.name]));
  const leadMap = new Map(leads.map((l) => [String(l._id), l]));

  const getCallQualificationInfo = (
    call: any
  ): { bucket: "hot" | "warm" | "cold" | "unqualified"; effectiveScore: number | null } => {
    const outcome = classifyCallInterestOutcome(call);
    const rawScore = Math.max(0, Math.min(100, Math.round(Number(call?.qualificationResult?.score || 0))));
    const interest = String(call?.qualificationResult?.interestLevel || "").toLowerCase();
    const status = String(call?.status || "").toLowerCase();
    if (status !== "completed" || Number(call?.durationSeconds || 0) < 5) {
      return { bucket: "unqualified", effectiveScore: null };
    }
    if (outcome.label === "Interested" || interest === "high" || rawScore >= 75) {
      return { bucket: "hot", effectiveScore: rawScore >= 75 ? rawScore : 80 };
    }
    if (outcome.label === "Follow-Up Requested" || interest === "medium" || rawScore >= 50) {
      return {
        bucket: "warm",
        effectiveScore: rawScore >= 50 && rawScore < 75 ? rawScore : 60,
      };
    }
    if (outcome.label === "Not Interested (Told AI)" || interest === "low" || rawScore > 0) {
      return {
        bucket: "cold",
        effectiveScore: rawScore > 0 && rawScore < 50 ? rawScore : 25,
      };
    }
    return { bucket: "unqualified", effectiveScore: null };
  };

  const getCallQualificationBucket = (call: any): "hot" | "warm" | "cold" | "unqualified" =>
    getCallQualificationInfo(call).bucket;

  const filtered = calls.filter((c) => {
    // Business telephony call history excludes browser simulated web-calls
    if (c.direction === "web_call") return false;

    const matchesDir =
      directionFilter === "all" || c.direction === directionFilter;
    const matchesStat = statusFilter === "all" || c.status === statusFilter;
    const matchesAgent =
      agentFilter === "all" ||
      String(c.agentId) === agentFilter ||
      c.agentName === agentFilter;
    const matchesCampaign =
      campaignFilter === "all" || String(c.campaignId) === campaignFilter;

    let matchesDate = true;
    const callTs = new Date(c.startedAt || c.createdAt).getTime();
    if (fromDate) {
      const fromTs = new Date(fromDate).getTime();
      if (!isNaN(fromTs) && callTs < fromTs) matchesDate = false;
    }
    if (toDate) {
      const toTs = new Date(toDate).getTime() + 86400000;
      if (!isNaN(toTs) && callTs > toTs) matchesDate = false;
    }

    const q = searchTerm.toLowerCase();
    const matchesSearch =
      !q ||
      (c.phoneNumber || "").toLowerCase().includes(q) ||
      (c.leadName || "").toLowerCase().includes(q) ||
      (c.agentName || "").toLowerCase().includes(q) ||
      (c.bolnaExecutionId || "").toLowerCase().includes(q) ||
      (c.callOutcome || "").toLowerCase().includes(q);

    const matchesQualification =
      qualificationFilter === "all" ||
      getCallQualificationBucket(c) === qualificationFilter;

    return (
      matchesDir &&
      matchesStat &&
      matchesQualification &&
      matchesAgent &&
      matchesCampaign &&
      matchesDate &&
      matchesSearch
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#20243A]">Call History</h1>
          <p className="text-sm text-[#747B91] mt-0.5">
            Listen to recordings, read transcripts, and review call outcomes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleSyncCallsFromBolna}
            disabled={syncing}
            className="px-4 py-2 bg-white border border-[#E8EAF1] hover:border-[#635BFF] text-[#20243A] hover:text-[#635BFF] text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 ${syncing ? "animate-spin text-[#635BFF]" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {syncing ? "Syncing from Voice AI Engine..." : "Sync Call History from Voice AI Engine"}
          </button>

          <Link
            href="/testing"
            className="px-4 py-2 bg-[#635BFF] text-white text-xs font-semibold rounded-lg hover:bg-[#5046E5] shadow-sm"
          >
            Initiate Test Call
          </Link>
        </div>
      </div>

      {syncNotice && (
        <div className="p-3.5 bg-[#EEF0FF] border border-[#C7CBFF] rounded-xl text-xs text-[#20243A] flex items-center justify-between">
          <span>{syncNotice}</span>
          <button
            type="button"
            onClick={() => setSyncNotice(null)}
            className="font-bold text-[#635BFF]"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white border border-[#E8EAF1] rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg p-1 text-xs">
            {[
              { id: "all", label: "All Directions" },
              { id: "outbound", label: "Outbound" },
              { id: "inbound", label: "Inbound" },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setDirectionFilter(d.id);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  directionFilter === d.id
                    ? "bg-[#635BFF] text-white"
                    : "text-[#747B91] hover:text-[#20243A]"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-80">
            <input
              type="text"
              placeholder="Search contact name, phone, agent, or outcome..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A] placeholder-[#747B91] focus:outline-none focus:border-[#635BFF]"
            />
            <svg
              className="w-4 h-4 absolute left-3 top-2.5 text-[#747B91]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 pt-2 border-t border-[#E8EAF1] text-xs">
          <select
            value={agentFilter}
            onChange={(e) => {
              setAgentFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
          >
            <option value="all">All AI Agents</option>
            {agents.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>

          <select
            value={campaignFilter}
            onChange={(e) => {
              setCampaignFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
          >
            <option value="all">All Campaigns</option>
            {campaigns.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
          >
            <option value="all">All Call Statuses</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In Progress</option>
            <option value="initiated">Initiated / Queued</option>
            <option value="no_answer">No Answer</option>
            <option value="busy">Busy</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={qualificationFilter}
            onChange={(e) => {
              setQualificationFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
          >
            <option value="all">All Lead Buckets</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
            <option value="unqualified">Unqualified</option>
          </select>

          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
          />

          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
          />
        </div>
      </div>

      {/* All 11 Required Columns Table */}
      {loading ? (
        <LoadingState
          title="Loading Call Records..."
          subtitle="Fetching verified call sessions, transcripts, audio recordings, and IndiaCalling Voice AI metrics"
        />
      ) : paginated.length > 0 ? (
        <div className="bg-white border border-[#E8EAF1] rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Contact Name & Phone
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    AI Agent
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Campaign
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Direction
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Date & Time
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Outcome & Qualification
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Assigned Salesperson
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-[#747B91]">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAF1]">
                {paginated.map((call) => {
                  const assocLead = call.leadId
                    ? leadMap.get(String(call.leadId))
                    : undefined;
                  const campaignTitle =
                    call.campaignName ||
                    (call.campaignId
                      ? campaignMap.get(String(call.campaignId))
                      : undefined) ||
                    "Direct / Test Call";
                  const salesperson =
                    call.assignedSalespersonName ||
                    assocLead?.assignedSalespersonName ||
                    "Unassigned";

                  return (
                    <tr
                      key={call._id}
                      className="hover:bg-[#F7F8FC] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#20243A]">
                          {call.leadName || assocLead?.name || "Contact"}
                        </p>
                        <p className="font-mono text-[11px] text-[#747B91]">
                          {call.phoneNumber}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-medium text-[#20243A]">
                        {call.agentName}
                      </td>
                      <td className="px-4 py-3 text-[#747B91]">
                        {campaignTitle}
                      </td>
                      <td className="px-4 py-3 capitalize">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EEF0FF] text-[#635BFF]">
                          {call.direction}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#747B91] whitespace-nowrap">
                        {formatDate(call.startedAt)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#20243A]">
                        {formatDuration(call.durationSeconds)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                            call.status === "completed"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : call.status === "failed" ||
                                call.status === "no_answer"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}
                        >
                          {call.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const outcome = classifyCallInterestOutcome(call);
                          const badgeCls =
                            outcome.tone === "emerald"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : outcome.tone === "indigo"
                              ? "bg-[#EEF0FF] text-[#635BFF] border-[#C7CBFF]"
                              : outcome.tone === "amber"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : outcome.tone === "red"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-[#F7F8FC] text-[#747B91] border-[#E8EAF1]";
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap mb-1 ${badgeCls}`}>
                              {outcome.label}
                            </span>
                          );
                        })()}
                        <p className="font-medium text-[#20243A] text-xs">
                          {call.callOutcome || call.status}
                        </p>
                        {(() => {
                          const { bucket, effectiveScore } = getCallQualificationInfo(call);
                          const bucketStyle =
                            bucket === "hot"
                              ? "bg-orange-50 text-orange-700 border-orange-200"
                              : bucket === "warm"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : bucket === "cold"
                              ? "bg-sky-50 text-sky-700 border-sky-200"
                              : "bg-slate-100 text-slate-600 border-slate-200";
                          const bucketLabel =
                            bucket === "hot"
                              ? "Hot"
                              : bucket === "warm"
                              ? "Warm"
                              : bucket === "cold"
                              ? "Cold"
                              : "Unqualified";
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border mt-1 ${bucketStyle}`}>
                              {bucketLabel}
                              {effectiveScore !== null ? ` · ${effectiveScore} pts` : ""}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-[#20243A]">
                        {salesperson}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/calls/${call._id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#EEF0FF] text-[#635BFF] hover:bg-[#635BFF] hover:text-white rounded-lg font-semibold transition-colors"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 bg-[#F7F8FC] border-t border-[#E8EAF1] flex items-center justify-between text-xs">
            <span className="text-[#747B91]">
              Showing {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, filtered.length)} of {filtered.length}{" "}
              call record(s)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded border border-[#E8EAF1] bg-white disabled:opacity-40 font-semibold text-[#20243A]"
              >
                ← Prev
              </button>
              <span className="font-semibold text-[#20243A]">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded border border-[#E8EAF1] bg-white disabled:opacity-40 font-semibold text-[#20243A]"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#E8EAF1] rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#EEF0FF] text-[#635BFF] flex items-center justify-center mx-auto text-2xl font-bold">
            📞
          </div>
          <h2 className="text-lg font-bold text-[#20243A]">
            No Call Executions Found
          </h2>
          <p className="text-xs text-[#747B91]">
            Click &quot;Sync Call History from Voice AI Engine&quot; to pull executions from your IndiaCalling Voice AI account.
          </p>
        </div>
      )}
    </div>
  );
}
