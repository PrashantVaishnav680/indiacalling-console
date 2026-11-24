"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatDuration, formatDate } from "@/lib/utils";
import { LoadingState } from "@/components/LoadingSpinner";

export default function AgentDetailPage({
  params,
}: {
  params?: { id: string } | Promise<{ id: string }>;
}) {
  const router = useRouter();
  const routeParams = useParams();
  const searchParams = useSearchParams();
  const id = (routeParams?.id as string) || (params as any)?.id || "";
  const initialTab = searchParams.get("tab");

  const [agent, setAgent] = useState<any>(null);
  const [agentCalls, setAgentCalls] = useState<any[]>([]);
  const [agentCampaigns, setAgentCampaigns] = useState<any[]>([]);
  const [agentLeads, setAgentLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "leads" | "campaigns" | "config" | "calls"
  >(initialTab === "leads" ? "leads" : "overview");

  const handleToggleStatus = async () => {
    if (!agent) return;
    const nextStatus = agent.status === "active" ? "paused" : "active";
    setTogglingStatus(true);
    try {
      const res = await fetch(`/api/agents/${agent._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setAgent((prev: any) => ({ ...prev, status: nextStatus }));
        setSyncMessage(`Agent status successfully updated to ${nextStatus.toUpperCase()}.`);
      } else {
        const data = await res.json();
        setSyncMessage(`Failed to update status: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      setSyncMessage(`Failed to update status: ${err.message}`);
    } finally {
      setTogglingStatus(false);
    }
  };

  const fetchAgentData = useCallback(async (withSync = false) => {
    if (!id) return;
    try {
      const [resAgent, resCalls, resCampaigns, resLeads] = await Promise.all([
        fetch(`/api/agents/${id}${withSync ? "?refresh=true" : ""}`),
        fetch(`/api/calls?agentId=${id}&pageSize=100`),
        fetch("/api/campaigns"),
        fetch("/api/leads"),
      ]);

      let loadedAgent: any = null;
      let matchedCalls: any[] = [];
      if (resAgent.ok) {
        const json = await resAgent.json();
        loadedAgent = json.agent;
        setAgent(loadedAgent);
      }
      if (resCalls.ok) {
        const jsonCalls = await resCalls.json();
        matchedCalls = jsonCalls.calls || [];
        setAgentCalls(matchedCalls);
      }
      if (resCampaigns.ok && loadedAgent) {
        const jsonCamps = await resCampaigns.json();
        const camps = (jsonCamps.campaigns || []).filter(
          (c: any) =>
            String(c.agentId) === String(loadedAgent._id) ||
            (loadedAgent.bolnaAgentId &&
              String(c.agentId) === String(loadedAgent.bolnaAgentId))
        );
        setAgentCampaigns(camps);
      }
      if (resLeads.ok && loadedAgent) {
        const jsonLeads = await resLeads.json();
        const allLeadsList = jsonLeads.leads || [];
        const callLeadIds = new Set(
          matchedCalls.map((c: any) => String(c.leadId)).filter(Boolean)
        );
        const callPhones = new Set(
          matchedCalls.map((c: any) => c.phoneNumber).filter(Boolean)
        );

        const relevantLeads = allLeadsList.filter((l: any) => {
          if (String(l.assignedAgentId) === String(loadedAgent._id)) return true;
          if (
            loadedAgent.bolnaAgentId &&
            String(l.assignedAgentId) === String(loadedAgent.bolnaAgentId)
          ) {
            return true;
          }
          if (callLeadIds.has(String(l._id))) return true;
          if (l.phone && callPhones.has(l.phone)) return true;
          return false;
        });
        setAgentLeads(relevantLeads);
      }
    } catch (err) {
      console.error("Failed to fetch agent details", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAgentData();
  }, [fetchAgentData]);

  const handleManualSync = async () => {
    if (!agent) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch(`/api/agents/${agent._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceSyncBolna: true }),
      });
      const data = await res.json();
      if (data.agent) setAgent(data.agent);

      await fetch("/api/bolna/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent._id,
          syncAgents: false,
          syncCalls: true,
        }),
      });
      await fetchAgentData();
      setSyncMessage(
        data.bolnaSynced
          ? "Agent configuration and executions synchronized with IndiaCalling Voice AI."
          : data.syncError || "IndiaCalling Voice AI synchronization requires a valid BOLNA_API_KEY."
      );
    } catch (err: any) {
      setSyncMessage(err?.message || "Failed to synchronize with IndiaCalling Voice AI.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!agent) return;
    const res = await fetch(`/api/agents/${agent._id}`, { method: "DELETE" });
    if (res.ok) router.push("/agents");
  };

  if (loading) {
    return (
      <LoadingState
        title="Loading Agent Details & Analytics..."
        subtitle="Fetching live conversation history, associated campaigns, and IndiaCalling Voice AI metrics"
      />
    );
  }

  if (!agent) {
    return (
      <div className="bg-white border border-[#E8EAF1] rounded-2xl p-12 text-center max-w-md mx-auto space-y-4">
        <h2 className="text-base font-bold text-[#20243A]">Agent Not Found</h2>
        <Link
          href="/agents"
          className="inline-block px-4 py-2 bg-[#635BFF] text-white text-xs font-semibold rounded-lg"
        >
          ← Back to Agents
        </Link>
      </div>
    );
  }

  const m = agent.metrics || {
    totalLeads: 0,
    totalCalls: agentCalls.length,
    callsInitiated: agentCalls.length,
    connectedCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    qualifiedLeads: 0,
    conversionRate: 0,
    avgDurationSeconds: 0,
    activeCampaigns: agentCampaigns.length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-[#747B91]">
            <Link href="/agents" className="hover:text-[#635BFF]">
              AI Agents
            </Link>
            <span>/</span>
            <span className="text-[#20243A]">{agent.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[#20243A]">{agent.name}</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EEF0FF] text-[#635BFF]">
              v{agent.configVersion || 1}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                agent.status === "paused"
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : agent.status === "inactive"
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
              }`}
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                  agent.status === "paused"
                    ? "bg-amber-500"
                    : agent.status === "inactive"
                    ? "bg-rose-500"
                    : "bg-emerald-500"
                }`}
              />
              {agent.status ? agent.status.toUpperCase() : "ACTIVE"}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                agent.syncStatus === "synced"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : agent.syncStatus === "failed"
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              {agent.syncStatus === "synced"
                ? "Live Synced"
                : agent.syncStatus === "failed"
                ? "Sync Failed"
                : "Pending Sync"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={togglingStatus}
            onClick={handleToggleStatus}
            className={`px-3.5 py-2 border text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 ${
              agent.status === "active" || !agent.status
                ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            {togglingStatus
              ? "Updating..."
              : agent.status === "active" || !agent.status
              ? "⏸ Pause Agent"
              : "▶ Activate Agent"}
          </button>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncing}
            className="px-3.5 py-2 bg-white border border-[#E8EAF1] hover:border-[#635BFF] text-[#20243A] text-xs font-semibold rounded-lg disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Retry / Sync Now"}
          </button>
          <Link
            href={`/agents/new?edit=${agent._id}`}
            className="px-3.5 py-2 bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF] text-xs font-semibold rounded-lg hover:bg-[#635BFF] hover:text-white"
          >
            Edit Agent
          </Link>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="px-3.5 py-2 bg-white border border-rose-200 text-rose-600 text-xs font-semibold rounded-lg hover:bg-rose-50"
          >
            Delete
          </button>
          <Link
            href={`/testing?agentId=${agent._id}`}
            className="px-4 py-2 bg-[#635BFF] text-white text-xs font-semibold rounded-lg hover:bg-[#5046E5]"
          >
            Test Call
          </Link>
        </div>
      </div>

      {syncMessage && (
        <div className="p-3.5 bg-[#EEF0FF] border border-[#C7CBFF] rounded-xl text-xs text-[#20243A] flex items-center justify-between">
          <span>{syncMessage}</span>
          <button
            type="button"
            onClick={() => setSyncMessage(null)}
            className="text-xs font-bold text-[#635BFF]"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E8EAF1] pb-2">
        {[
          { id: "overview", label: "Overview & Analytics" },
          { id: "leads", label: `Associated Leads (${agentLeads.length})` },
          {
            id: "campaigns",
            label: `Campaign-Wise Performance (${agentCampaigns.length})`,
          },
          { id: "config", label: "Configuration & Extractions" },
          { id: "calls", label: `Recent Executions (${agentCalls.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === tab.id
                ? "bg-[#635BFF] text-white"
                : "text-[#747B91] hover:text-[#20243A] hover:bg-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* All 8 Required Agent Detail Analytics KPIs (Section 11) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
              <p className="text-xs text-[#747B91]">Total Leads Associated</p>
              <p className="text-2xl font-bold text-[#20243A] mt-1">
                {m.totalLeads ?? 0}
              </p>
            </div>
            <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
              <p className="text-xs text-[#747B91]">Calls Attempted</p>
              <p className="text-2xl font-bold text-[#20243A] mt-1">
                {m.callsInitiated ?? m.totalCalls ?? 0}
              </p>
            </div>
            <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
              <p className="text-xs text-[#747B91]">Connected Calls</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {m.connectedCalls ?? 0}
              </p>
            </div>
            <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
              <p className="text-xs text-[#747B91]">Completed Calls</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {m.successfulCalls ?? 0}
              </p>
            </div>
            <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
              <p className="text-xs text-[#747B91]">Failed Calls</p>
              <p className="text-2xl font-bold text-rose-600 mt-1">
                {m.failedCalls ?? 0}
              </p>
            </div>
            <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
              <p className="text-xs text-[#747B91]">Qualified Leads</p>
              <p className="text-2xl font-bold text-[#13B8A6] mt-1">
                {m.qualifiedLeads ?? 0}
              </p>
            </div>
            <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
              <p className="text-xs text-[#747B91]">Conversion Rate</p>
              <p className="text-2xl font-bold text-[#635BFF] mt-1">
                {m.conversionRate ?? 0}%
              </p>
            </div>
            <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
              <p className="text-xs text-[#747B91]">Average Call Duration</p>
              <p className="text-2xl font-bold text-[#20243A] mt-1">
                {formatDuration(m.avgDurationSeconds || 0)}
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-sm text-[#20243A]">
              IndiaCalling Voice AI Synchronization & Versioning Metadata
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-[#F7F8FC] rounded-lg">
                <span className="text-[#747B91]">Voice AI Agent ID:</span>
                <p className="font-mono text-[#635BFF] font-semibold mt-0.5">
                  {agent.bolnaAgentId || "Pending synchronization"}
                </p>
              </div>
              <div className="p-3 bg-[#F7F8FC] rounded-lg">
                <span className="text-[#747B91]">Last Synchronized:</span>
                <p className="font-semibold text-[#20243A] mt-0.5">
                  {agent.lastSyncedAt ? formatDate(agent.lastSyncedAt) : "Never"}
                </p>
              </div>
              <div className="p-3 bg-[#F7F8FC] rounded-lg">
                <span className="text-[#747B91]">Configuration Version:</span>
                <p className="font-semibold text-[#20243A] mt-0.5">
                  v{agent.configVersion || 1}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Associated Leads Tab */}
      {activeTab === "leads" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl overflow-hidden space-y-0">
          <div className="p-5 border-b border-[#E8EAF1] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAFAFD]">
            <div>
              <h3 className="font-bold text-sm text-[#20243A]">
                Associated Leads ({agentLeads.length})
              </h3>
              <p className="text-xs text-[#747B91] mt-0.5">
                All customer prospects called, qualified, or enrolled for {agent.name}.
              </p>
            </div>
            <Link
              href="/leads"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF0FF] hover:bg-[#635BFF] text-[#635BFF] hover:text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Open Full Leads Pipeline →
            </Link>
          </div>

          {agentLeads.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                      Lead Name
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                      Phone Number
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                      Qualification Status
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                      Lead Score / Interest
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                      Company / City
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-[#747B91]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EAF1]">
                  {agentLeads.map((l: any) => {
                    const status = l.qualificationStatus || "new";
                    const statusColor =
                      status === "qualified"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : status === "unqualified"
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : status === "follow_up_required" || status === "call_scheduled"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200";

                    return (
                      <tr key={l._id} className="hover:bg-[#F7F8FC] transition-colors">
                        <td className="px-4 py-3 font-semibold text-[#20243A]">
                          {l.name}
                        </td>
                        <td className="px-4 py-3 font-mono text-[#747B91]">
                          {l.phone}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold border capitalize ${statusColor}`}
                          >
                            {status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#20243A]">
                              {l.qualificationScore != null ? `${l.qualificationScore} pts` : "—"}
                            </span>
                            {l.interestLevel && l.interestLevel !== "unknown" && (
                              <span className="text-[10px] text-[#747B91] capitalize">
                                ({l.interestLevel})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#747B91]">
                          {l.company || l.location || l.city || "Direct Call Prospect"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/leads/${l._id}`}
                            className="inline-flex items-center gap-1 text-[#635BFF] hover:underline font-semibold"
                          >
                            Inspect Lead →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center text-[#747B91] space-y-1">
              <p className="font-semibold text-sm text-[#20243A]">
                No Leads Associated Yet
              </p>
              <p className="text-xs">
                Leads will appear here as soon as calls are placed or campaigns are assigned to {agent.name}.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Campaign-Wise Performance Breakdown */}
      {activeTab === "campaigns" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl overflow-hidden">
          {agentCampaigns.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Campaign Name
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Imported Leads
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Calls Attempted
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Completed
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Qualified
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-[#747B91]">
                    Inspect
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAF1]">
                {agentCampaigns.map((c: any) => (
                  <tr key={c._id} className="hover:bg-[#F7F8FC]">
                    <td className="px-4 py-3 font-semibold text-[#20243A]">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 capitalize">{c.status}</td>
                    <td className="px-4 py-3">{c.totalLeads || 0}</td>
                    <td className="px-4 py-3">
                      {c.callsInitiated ?? c.completedCalls ?? 0}
                    </td>
                    <td className="px-4 py-3 text-emerald-600 font-semibold">
                      {c.completedCalls || 0}
                    </td>
                    <td className="px-4 py-3 text-[#13B8A6] font-bold">
                      {c.qualifiedLeads || 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/campaigns/${c._id}`}
                        className="text-[#635BFF] font-semibold hover:underline"
                      >
                        View Campaign →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-xs text-[#747B91]">
              No campaigns are currently using this agent.
            </div>
          )}
        </div>
      )}

      {activeTab === "config" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-6 text-xs">
          <div>
            <h3 className="font-semibold text-sm text-[#20243A] mb-2">
              System Prompt
            </h3>
            <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg font-mono whitespace-pre-wrap">
              {agent.conversationConfiguration?.systemPrompt}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-sm text-[#20243A] mb-2">
              Calling & Disconnect Policy
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg">
              <div>
                <span className="text-[#747B91] block">AI Hangup Call:</span>
                <span
                  className={`font-bold ${
                    agent.callingConfiguration?.aiHangupEnabled !== false
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }`}
                >
                  {agent.callingConfiguration?.aiHangupEnabled !== false
                    ? "Enabled (Auto Disconnect)"
                    : "Disabled (Wait for caller)"}
                </span>
              </div>
              <div>
                <span className="text-[#747B91] block">Max Duration:</span>
                <span className="font-bold text-[#20243A]">
                  {agent.callingConfiguration?.maxDurationSeconds || 300}s
                </span>
              </div>
              <div>
                <span className="text-[#747B91] block">Silence Hangup:</span>
                <span className="font-bold text-[#20243A]">
                  {agent.callingConfiguration?.hangupAfterSilenceSeconds || 12}s
                </span>
              </div>
            </div>
          </div>

          {agent.extractionsConfiguration?.fields?.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm text-[#20243A] mb-2">
                Configured Structured Extractions
              </h3>
              <div className="flex flex-wrap gap-2">
                {agent.extractionsConfiguration.fields.map((f: any) => (
                  <span
                    key={f.key}
                    className="px-3 py-1 rounded-lg bg-[#EEF0FF] text-[#635BFF] font-semibold"
                  >
                    {f.label} ({f.key})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "calls" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl overflow-hidden">
          {agentCalls.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Direction
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-[#747B91]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAF1]">
                {agentCalls.map((call) => (
                  <tr key={call._id} className="hover:bg-[#F7F8FC]">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#20243A]">
                        {call.leadName || "Contact"}
                      </p>
                      <p className="font-mono text-[#747B91]">
                        {call.phoneNumber}
                      </p>
                    </td>
                    <td className="px-4 py-3 capitalize">{call.direction}</td>
                    <td className="px-4 py-3 capitalize">{call.status}</td>
                    <td className="px-4 py-3">
                      {formatDuration(call.durationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/calls/${call._id}`}
                        className="text-[#635BFF] font-semibold hover:underline"
                      >
                        View Call →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-xs text-[#747B91]">
              No calls recorded for this agent yet.
            </div>
          )}
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8EAF1] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-[#20243A]">
              Delete {agent.name}?
            </h3>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-lg border border-[#E8EAF1] text-xs font-semibold text-[#747B91]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAgent}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
