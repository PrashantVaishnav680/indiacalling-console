"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { IAgent } from "@/types";
import { formatDate } from "@/lib/utils";
import { LoadingState } from "@/components/LoadingSpinner";

function SyncBadge({
  status,
  bolnaAgentId,
}: {
  status?: IAgent["syncStatus"];
  bolnaAgentId?: string;
}) {
  const hasRealBolnaId =
    Boolean(bolnaAgentId) &&
    !String(bolnaAgentId).startsWith("bolna_sim_") &&
    !String(bolnaAgentId).startsWith("bolna_agent_");

  if (status === "synced" && hasRealBolnaId) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Live Synced
      </span>
    );
  }
  if (status === "failed" || status === "needs_attention") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Sync Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Pending Sync
    </span>
  );
}

function AgentStatusBadge({ status }: { status?: string }) {
  const current = status || "active";
  if (current === "active") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  if (current === "paused") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Paused
      </span>
    );
  }
  if (current === "draft") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        Draft
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
      Inactive
    </span>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<IAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingBolna, setSyncingBolna] = useState(false);
  const [retryingAgentId, setRetryingAgentId] = useState<string | null>(null);
  const [syncBanner, setSyncBanner] = useState<{
    type: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [agentToDelete, setAgentToDelete] = useState<IAgent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const json = await res.json();
        setAgents(json.agents || []);
      }
    } catch (err) {
      console.error("Failed to load agents", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleSyncWithBolna = async () => {
    setSyncingBolna(true);
    setSyncBanner(null);
    try {
      const res = await fetch("/api/bolna/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncAgents: true, syncCalls: true }),
      });
      const data = await res.json();
      await fetchAgents();
      setSyncBanner({
        type: data.success ? "success" : "warning",
        text: data.message || "Synchronized with IndiaCalling Voice AI.",
      });
    } catch (err: any) {
      setSyncBanner({
        type: "error",
        text: err?.message || "Failed to synchronize with IndiaCalling Voice AI.",
      });
    } finally {
      setSyncingBolna(false);
    }
  };

  const handleRetryAgentSync = async (agentId: string) => {
    setRetryingAgentId(agentId);
    setSyncBanner(null);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceSyncBolna: true }),
      });
      const data = await res.json();
      await fetchAgents();
      setSyncBanner({
        type: data.bolnaSynced ? "success" : "warning",
        text: data.bolnaSynced
          ? "Agent successfully synchronized with IndiaCalling Voice AI."
          : data.syncError || "IndiaCalling Voice AI synchronization requires a valid VOICE_AI_API_KEY.",
      });
    } finally {
      setRetryingAgentId(null);
    }
  };

  const confirmDeleteAgent = async () => {
    if (!agentToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/agents/${agentToDelete._id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a._id !== agentToDelete._id));
      }
    } finally {
      setDeleting(false);
      setAgentToDelete(null);
    }
  };

  const filteredAgents = agents.filter((agent) => {
    const isBilingualOrBoth =
      agent.agentType === "both" ||
      Boolean(agent.callingConfiguration?.inboundEnabled && agent.callingConfiguration?.outboundEnabled) ||
      Boolean(agent.multilingualEnabled) ||
      (Array.isArray(agent.additionalLanguages) && agent.additionalLanguages.length > 1) ||
      String(agent.language || "").includes("+") ||
      String(agent.language || "").toLowerCase().includes("bilingual") ||
      String(agent.language || "").toLowerCase().includes("multi");

    const matchesType =
      filterType === "all" ||
      (filterType === "both" ? isBilingualOrBoth : agent.agentType === filterType) ||
      (filterType === "active" && (agent.status === "active" || !agent.status)) ||
      (filterType === "paused" && agent.status === "paused");
    const matchesSearch =
      agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.language.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (agent.bolnaAgentId || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#20243A]">AI Voice Agents</h1>
          <p className="text-sm text-[#747B91] mt-0.5">
            Build and manage your AI voice agents.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleSyncWithBolna}
            disabled={syncingBolna}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-[#E8EAF1] text-[#20243A] hover:border-[#635BFF] hover:text-[#635BFF] text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
          >
            {syncingBolna ? "Syncing with Voice AI Engine..." : "Sync Now with Voice AI Engine"}
          </button>

          <Link
            href="/agents/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#635BFF] text-white text-xs font-semibold hover:bg-[#5046E5] transition-colors shadow-sm"
          >
            + Create New Agent
          </Link>
        </div>
      </div>

      {syncBanner && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            syncBanner.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : syncBanner.type === "warning"
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span className="font-medium">{syncBanner.text}</span>
          <button
            type="button"
            onClick={() => setSyncBanner(null)}
            className="text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#E8EAF1] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {["all", "active", "paused", "outbound", "inbound", "both"].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                filterType === t
                  ? "bg-[#635BFF] text-white"
                  : "bg-[#F7F8FC] text-[#747B91] hover:text-[#20243A]"
              }`}
            >
              {t === "both" ? "Bilingual / Both" : t}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search by name, language, or IndiaCalling Voice AI ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3.5 pr-4 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
          />
        </div>
      </div>

      {/* Agents Grid */}
      {loading ? (
        <LoadingState
          title="Loading AI Voice Agents..."
          subtitle="Fetching agent configurations, live IndiaCalling Voice AI sync status, and performance counters"
        />
      ) : filteredAgents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAgents.map((agent) => {
            const m = agent.metrics || {
              totalLeads: 0,
              totalCalls: 0,
              callsInitiated: 0,
              callsAcceptedByBolna: 0,
              connectedCalls: 0,
              successfulCalls: 0,
              failedCalls: 0,
              qualifiedLeads: 0,
              conversionRate: 0,
              avgDurationSeconds: 0,
              activeCampaigns: 0,
              lastCallDate: null,
            };

              return (
              <div
                key={agent._id}
                className="bg-white border border-[#E8EAF1] rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#635BFF]/10 text-[#635BFF] flex items-center justify-center font-bold text-sm shrink-0">
                        {agent.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-[#20243A] line-clamp-1">
                          {agent.name}
                        </h3>
                        <p className="text-xs text-[#747B91] capitalize">
                          {agent.industry || agent.category || "General"} • v
                          {agent.configVersion || 1}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <AgentStatusBadge status={agent.status} />
                      <SyncBadge
                        status={agent.syncStatus}
                        bolnaAgentId={agent.bolnaAgentId}
                      />
                    </div>
                  </div>

                  {agent.syncError && (
                    <div className="mb-3 p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-700 flex items-center justify-between gap-2">
                      <span className="line-clamp-2">{agent.syncError}</span>
                      <button
                        type="button"
                        disabled={retryingAgentId === agent._id}
                        onClick={() => handleRetryAgentSync(agent._id)}
                        className="px-2 py-1 bg-white border border-rose-300 rounded font-bold text-rose-700 shrink-0"
                      >
                        {retryingAgentId === agent._id ? "..." : "Retry"}
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5 py-2.5 border-y border-[#E8EAF1] text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#747B91]">Language:</span>
                      <span className="font-medium text-[#20243A]">
                        {agent.language}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#747B91]">Voice AI Agent ID:</span>
                      <span className="font-mono text-[11px] text-[#635BFF] truncate max-w-[160px]">
                        {agent.bolnaAgentId || "Not synchronized"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#747B91]">Last Call Date:</span>
                      <span className="text-[#20243A]">
                        {m.lastCallDate ? formatDate(m.lastCallDate) : "No calls yet"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#747B91]">Conversion Rate:</span>
                      <span className="font-semibold text-emerald-600">
                        {m.conversionRate ?? 0}%
                      </span>
                    </div>
                  </div>

                  {/* All 8 Required Agent Card Counters (Section 11) */}
                  <div className="grid grid-cols-4 gap-1.5 py-3 text-center">
                    <Link
                      href={`/agents/${agent._id}?tab=leads`}
                      className="bg-[#F7F8FC] hover:bg-[#EEF0FF] p-2 rounded-lg transition-colors group cursor-pointer block"
                      title="View all leads for this agent"
                    >
                      <p className="text-[10px] text-[#747B91] group-hover:text-[#635BFF]">Leads</p>
                      <p className="text-xs font-bold text-[#20243A] group-hover:text-[#635BFF]">
                        {m.totalLeads ?? 0}
                      </p>
                    </Link>
                    <div className="bg-[#F7F8FC] p-2 rounded-lg">
                      <p className="text-[10px] text-[#747B91]">Initiated</p>
                      <p className="text-xs font-bold text-[#20243A]">
                        {m.callsInitiated ?? m.totalCalls ?? 0}
                      </p>
                    </div>
                    <div className="bg-[#F7F8FC] p-2 rounded-lg">
                      <p className="text-[10px] text-[#747B91]">Connected</p>
                      <p className="text-xs font-bold text-blue-600">
                        {m.connectedCalls ?? 0}
                      </p>
                    </div>
                    <div className="bg-[#F7F8FC] p-2 rounded-lg">
                      <p className="text-[10px] text-[#747B91]">Completed</p>
                      <p className="text-xs font-bold text-emerald-600">
                        {m.successfulCalls ?? 0}
                      </p>
                    </div>
                    <div className="bg-[#F7F8FC] p-2 rounded-lg">
                      <p className="text-[10px] text-[#747B91]">Failed</p>
                      <p className="text-xs font-bold text-rose-600">
                        {m.failedCalls ?? 0}
                      </p>
                    </div>
                    <div className="bg-[#F7F8FC] p-2 rounded-lg">
                      <p className="text-[10px] text-[#747B91]">Qualified</p>
                      <p className="text-xs font-bold text-[#13B8A6]">
                        {m.qualifiedLeads ?? 0}
                      </p>
                    </div>
                    <div className="bg-[#F7F8FC] p-2 rounded-lg col-span-2">
                      <p className="text-[10px] text-[#747B91]">
                        Active Campaigns
                      </p>
                      <p className="text-xs font-bold text-[#635BFF]">
                        {m.activeCampaigns ?? 0}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions: 3 buttons (Inspect, Details, Test) */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#E8EAF1] mt-1">
                  <Link
                    href={`/agents/new?edit=${agent._id}`}
                    className="text-center py-2 bg-[#F7F8FC] hover:bg-[#EEF0FF] text-[#635BFF] text-xs font-semibold rounded-lg border border-[#C7CBFF] transition-colors"
                  >
                    Inspect
                  </Link>
                  <Link
                    href={`/agents/${agent._id}`}
                    className="text-center py-2 bg-[#F7F8FC] hover:bg-[#EEF0FF] text-[#20243A] hover:text-[#635BFF] text-xs font-semibold rounded-lg border border-[#E8EAF1] transition-colors"
                  >
                    Details
                  </Link>
                  <Link
                    href={`/testing?agentId=${agent._id}`}
                    className="text-center py-2 bg-[#635BFF] text-white text-xs font-semibold rounded-lg hover:bg-[#5046E5] transition-colors"
                  >
                    Test
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#E8EAF1] rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
          <h2 className="text-lg font-bold text-[#20243A]">
            No AI Agents Configured Yet
          </h2>
          <Link
            href="/agents/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold rounded-xl"
          >
            + Create Your First Agent
          </Link>
        </div>
      )}

      {agentToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8EAF1] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-[#20243A]">
              Confirm Agent Deletion
            </h3>
            <p className="text-xs text-[#747B91]">
              Are you sure you want to delete{" "}
              <strong className="text-[#20243A]">{agentToDelete.name}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAgentToDelete(null)}
                className="px-4 py-2 rounded-lg border border-[#E8EAF1] text-xs font-semibold text-[#747B91]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDeleteAgent}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold"
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
