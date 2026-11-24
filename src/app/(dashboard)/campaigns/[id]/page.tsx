"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatDuration, formatDate } from "@/lib/utils";
import { LoadingSpinner, ButtonSpinner } from "@/components/LoadingSpinner";

export default function CampaignDetailPage({
  params,
}: {
  params?: { id: string } | Promise<{ id: string }>;
}) {
  const router = useRouter();
  const routeParams = useParams();
  const id = (routeParams?.id as string) || (params as any)?.id || "";

  const [campaign, setCampaign] = useState<any>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [availableAgents, setAvailableAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [executingBatch, setExecutingBatch] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [syncingBolna, setSyncingBolna] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    objective: "Lead Qualification",
    agentId: "",
    concurrency: 3,
    status: "ready",
    callingStart: "09:30",
    callingEnd: "18:30",
  });
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [cRes, callsRes, aRes] = await Promise.all([
        fetch(`/api/campaigns/${id}`),
        fetch(`/api/calls?campaignId=${id}&pageSize=100`),
        fetch("/api/agents"),
      ]);
      if (cRes.ok) {
        const cData = await cRes.json();
        setCampaign(cData.campaign || cData);
      }
      if (callsRes.ok) {
        const allCallsData = await callsRes.json();
        setCalls(allCallsData.calls || []);
      }
      if (aRes.ok) {
        const aData = await aRes.json();
        setAvailableAgents(aData.agents || []);
      }
    } catch (e) {
      console.error("Failed to load campaign", e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateCampaignStatus = async (
    nextStatus: "running" | "paused" | "cancelled"
  ) => {
    if (!id) return;
    setUpdatingStatus(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setCampaign((prev: any) => ({ ...prev, status: nextStatus }));
        setBanner({
          type: "success",
          text: `Campaign status updated to "${nextStatus}".`,
        });
      } else {
        const data = await res.json();
        setBanner({
          type: "error",
          text: data.details || data.error || "Failed to update campaign status.",
        });
      }
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSyncBolna = async () => {
    if (!id) return;
    setSyncingBolna(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/sync`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setCampaign((prev: any) => ({
          ...prev,
          bolnaBatchId: data.bolnaBatchId,
          bolnaBatchStatus: data.bolnaBatchStatus,
        }));
        setBanner({
          type: "success",
          text: data.bolnaSynced
            ? `✓ Synced with Voice AI Batch: ${data.bolnaBatchId}`
            : data.notice || "Campaign batch updated.",
        });
        await loadData();
      } else {
        setBanner({
          type: "error",
          text: data.details || data.error || "Failed to sync with Voice AI Engine.",
        });
      }
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Failed to sync with Voice AI Engine.",
      });
    } finally {
      setSyncingBolna(false);
    }
  };

  const handleOpenEditModal = () => {
    if (!campaign) return;
    setEditForm({
      name: campaign.name || "",
      description: campaign.description || "",
      objective: campaign.objective || "Lead Qualification",
      agentId: campaign.agentId || "",
      concurrency: campaign.concurrency || 3,
      status: campaign.status || "ready",
      callingStart: campaign.schedule?.callingHours?.start || "09:30",
      callingEnd: campaign.schedule?.callingHours?.end || "18:30",
    });
    setShowEditModal(true);
  };

  const handleSaveCampaignEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingEdits(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          objective: editForm.objective,
          agentId: editForm.agentId,
          concurrency: Number(editForm.concurrency),
          status: editForm.status,
          schedule: {
            ...campaign.schedule,
            callingHours: {
              start: editForm.callingStart,
              end: editForm.callingEnd,
            },
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowEditModal(false);
        await loadData();
        setBanner({
          type: "success",
          text: "Campaign details updated successfully.",
        });
      } else {
        setBanner({
          type: "error",
          text: data.details || data.error || "Failed to update campaign.",
        });
      }
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Failed to update campaign.",
      });
    } finally {
      setSavingEdits(false);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!id) return;
    if (!confirm("Are you sure you want to permanently delete this campaign?")) return;
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/campaigns");
      } else {
        const d = await res.json();
        setBanner({ type: "error", text: d.details || d.error || "Failed to delete campaign." });
      }
    } catch {
      setBanner({ type: "error", text: "Failed to delete campaign." });
    }
  };

  const handleExecuteQueueBatch = async (specificLeadId?: string) => {
    if (!id) return;
    setExecutingBatch(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: specificLeadId,
          concurrency: campaign?.concurrency || 3,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({
          type: "error",
          text: data.details || data.error || "Campaign execution failed.",
        });
      } else {
        setBanner({
          type: "success",
          text:
            data.message ||
            `Initiated ${data.dispatchedCount} call(s) via IndiaCalling Voice AI.`,
        });
        await loadData();
      }
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Failed to execute campaign call queue.",
      });
    } finally {
      setExecutingBatch(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#635BFF]" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="bg-white border border-[#E8EAF1] rounded-2xl p-12 text-center max-w-lg mx-auto my-12">
        <h2 className="text-lg font-bold text-[#20243A]">Campaign Not Found</h2>
        <Link
          href="/campaigns"
          className="inline-block mt-4 px-4 py-2.5 bg-[#635BFF] text-white text-xs font-semibold rounded-lg"
        >
          Return to Campaigns
        </Link>
      </div>
    );
  }

  const totalImported = campaign.totalLeads || 0;
  const eligibleLeads = campaign.eligibleLeads ?? totalImported;
  const callsAttempted = campaign.callsInitiated ?? calls.length;
  const callsAcceptedByBolna = campaign.callsAcceptedByBolna ?? callsAttempted;
  const callsInProgress = campaign.callsInProgress ?? 0;
  const connectedCalls = campaign.connectedCalls ?? 0;
  const completedCalls = campaign.completedCalls ?? 0;
  const qualifiedLeads = campaign.qualifiedLeads ?? 0;
  const failedCalls = campaign.failedCalls ?? 0;
  const noAnswerCalls = campaign.noAnswerCalls ?? 0;
  const remainingLeads =
    campaign.remainingLeads ?? Math.max(0, eligibleLeads - callsAttempted);
  const progressPct =
    eligibleLeads > 0
      ? Math.min(100, Math.round((callsAttempted / eligibleLeads) * 100))
      : 0;

  return (
    <div className="space-y-6">
      {/* Header & Execution Controls (Step 6) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-[#747B91]">
            <Link href="/campaigns" className="hover:text-[#635BFF]">
              Campaigns
            </Link>
            <span>/</span>
            <span className="text-[#20243A]">{campaign.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[#20243A]">
              {campaign.name}
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                campaign.status === "running"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : campaign.status === "paused"
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-gray-100 text-gray-700 border border-gray-200"
              }`}
            >
              {campaign.status}
            </span>
            <span className="text-xs text-[#747B91]">
              Agent: <strong className="text-[#20243A]">{campaign.agentName}</strong>
            </span>
            {campaign.bolnaBatchId ? (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  !campaign.bolnaBatchId.startsWith("batch_local_") &&
                  !campaign.bolnaBatchId.startsWith("batch_sim_")
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    !campaign.bolnaBatchId.startsWith("batch_local_") &&
                    !campaign.bolnaBatchId.startsWith("batch_sim_")
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                  }`}
                />
                {!campaign.bolnaBatchId.startsWith("batch_local_") &&
                !campaign.bolnaBatchId.startsWith("batch_sim_")
                  ? `Live Voice AI Batch: ${campaign.bolnaBatchId}`
                  : `Local Batch: ${campaign.bolnaBatchId}`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                No Voice AI Batch Linked
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Prominent Launch Campaign button for Ready/Draft campaigns */}
          {(campaign.status === "ready" || campaign.status === "draft") && (
            <button
              type="button"
              disabled={executingBatch || updatingStatus || remainingLeads === 0}
              onClick={async () => {
                await handleUpdateCampaignStatus("running");
                await handleExecuteQueueBatch();
              }}
              className="px-4 py-2 bg-[#13B8A6] hover:bg-[#0D9488] text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {executingBatch ? "Launching via IndiaCalling Voice AI..." : "🚀 Launch Campaign Now"}
            </button>
          )}

          {/* Sync with Voice AI Engine */}
          <button
            type="button"
            disabled={syncingBolna}
            onClick={handleSyncBolna}
            className="px-3.5 py-2 bg-white border border-[#E8EAF1] hover:border-[#635BFF] text-[#20243A] hover:text-[#635BFF] text-xs font-semibold rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5 shadow-xs"
          >
            {syncingBolna ? <ButtonSpinner /> : <span>🔄</span>}
            <span>{syncingBolna ? "Syncing..." : "Sync with Voice AI Engine"}</span>
          </button>

          {/* Edit Campaign */}
          <button
            type="button"
            onClick={handleOpenEditModal}
            className="px-3.5 py-2 bg-[#EEF0FF] border border-[#C7CBFF] text-[#635BFF] text-xs font-semibold rounded-lg hover:bg-[#635BFF] hover:text-white transition-colors"
          >
            ✏️ Edit Campaign
          </button>

          {campaign.status === "running" && (
            <button
              type="button"
              disabled={
                executingBatch ||
                remainingLeads === 0
              }
              onClick={() => handleExecuteQueueBatch()}
              className="px-4 py-2 bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50"
            >
              {executingBatch
                ? "Dispatching via IndiaCalling Voice AI..."
                : `▶ Execute Next Queue Batch (${remainingLeads} Remaining)`}
            </button>
          )}

          {campaign.status === "running" ? (
            <button
              type="button"
              disabled={updatingStatus}
              onClick={() => handleUpdateCampaignStatus("paused")}
              className="px-3.5 py-2 border border-amber-300 text-amber-700 bg-amber-50 text-xs font-semibold rounded-lg hover:bg-amber-100"
            >
              Pause Campaign
            </button>
          ) : campaign.status === "paused" ? (
            <button
              type="button"
              disabled={updatingStatus}
              onClick={() => handleUpdateCampaignStatus("running")}
              className="px-3.5 py-2 border border-emerald-300 text-emerald-700 bg-emerald-50 text-xs font-semibold rounded-lg hover:bg-emerald-100"
            >
              Resume Campaign
            </button>
          ) : null}

          {campaign.status !== "cancelled" && campaign.status !== "completed" && (
            <button
              type="button"
              disabled={updatingStatus}
              onClick={() => handleUpdateCampaignStatus("cancelled")}
              className="px-3.5 py-2 border border-rose-200 text-rose-600 bg-white text-xs font-semibold rounded-lg hover:bg-rose-50"
            >
              Cancel Campaign
            </button>
          )}

          <button
            type="button"
            onClick={handleDeleteCampaign}
            className="px-3.5 py-2 border border-rose-300 text-rose-700 bg-rose-50 text-xs font-semibold rounded-lg hover:bg-rose-100"
          >
            Delete Campaign
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            banner.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Step 7: Campaign Results — All 10 Real Database Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
          <p className="text-[11px] text-[#747B91]">Total Imported Leads</p>
          <p className="text-xl font-bold text-[#20243A] mt-1">
            {totalImported}
          </p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
          <p className="text-[11px] text-[#747B91]">Total Eligible Leads</p>
          <p className="text-xl font-bold text-[#20243A] mt-1">
            {eligibleLeads}
          </p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
          <p className="text-[11px] text-[#747B91]">Calls Attempted</p>
          <p className="text-xl font-bold text-[#635BFF] mt-1">
            {callsAttempted}
          </p>
          <p className="text-[10px] text-[#747B91]">
            {callsAcceptedByBolna} accepted by IndiaCalling Voice AI
          </p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
          <p className="text-[11px] text-[#747B91]">Connected Calls</p>
          <p className="text-xl font-bold text-blue-600 mt-1">
            {connectedCalls}
          </p>
          <p className="text-[10px] text-[#747B91]">
            {callsInProgress} currently in progress
          </p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
          <p className="text-[11px] text-[#747B91]">Completed Calls</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">
            {completedCalls}
          </p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
          <p className="text-[11px] text-[#747B91]">Qualified Leads</p>
          <p className="text-xl font-bold text-[#13B8A6] mt-1">
            {qualifiedLeads}
          </p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
          <p className="text-[11px] text-[#747B91]">Failed Calls</p>
          <p className="text-xl font-bold text-rose-600 mt-1">{failedCalls}</p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
          <p className="text-[11px] text-[#747B91]">No-Answer Calls</p>
          <p className="text-xl font-bold text-amber-600 mt-1">
            {noAnswerCalls}
          </p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
          <p className="text-[11px] text-[#747B91]">Remaining / Queued</p>
          <p className="text-xl font-bold text-[#20243A] mt-1">
            {remainingLeads}
          </p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-4">
          <p className="text-[11px] text-[#747B91]">Campaign Progress</p>
          <p className="text-xl font-bold text-[#635BFF] mt-1">
            {progressPct}%
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-2">
        <div className="flex justify-between text-xs font-medium">
          <span className="text-[#747B91]">
            Campaign Call Queue Execution Progress ({callsAttempted} /{" "}
            {eligibleLeads} leads attempted)
          </span>
          <span className="font-bold text-[#20243A]">{progressPct}%</span>
        </div>
        <div className="w-full bg-[#E8EAF1] h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-[#635BFF] h-2.5 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Campaign Call Queue Table */}
      <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-sm text-[#20243A]">
          Campaign Lead Call Queue ({(campaign.callQueue || []).length})
        </h3>
        {(campaign.callQueue || []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                    Lead Name
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                    Phone (E.164)
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                    Queue Status
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                    Attempts
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                    Voice AI Execution ID
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold text-[#747B91]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAF1]">
                {(campaign.callQueue || []).map((q: any, i: number) => (
                  <tr key={i} className="hover:bg-[#F7F8FC]">
                    <td className="px-4 py-2.5 font-semibold text-[#20243A]">
                      {q.leadName}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#635BFF]">
                      {q.phoneNumber}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold capitalize text-[11px] ${
                          q.status === "completed"
                            ? "bg-emerald-50 text-emerald-700"
                            : q.status === "failed"
                            ? "bg-rose-50 text-rose-700"
                            : q.status === "accepted_by_bolna" ||
                              q.status === "initiated"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {q.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono">{q.attempts || 0}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[#747B91]">
                      {q.bolnaExecutionId || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {q.callId ? (
                        <Link
                          href={`/calls/${q.callId}`}
                          className="text-[#635BFF] font-semibold hover:underline"
                        >
                          View Call →
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled={
                            executingBatch || campaign.status !== "running"
                          }
                          onClick={() => handleExecuteQueueBatch(q.leadId)}
                          className="px-2.5 py-1 bg-[#EEF0FF] text-[#635BFF] rounded font-semibold hover:bg-[#635BFF] hover:text-white disabled:opacity-40"
                        >
                          Dial via IndiaCalling Voice AI
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-[#747B91]">No leads in campaign queue.</p>
        )}
      </div>

      {/* Recent Campaign Call Activity */}
      <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-sm text-[#20243A]">
          Recent Campaign Call Executions ({calls.length})
        </h3>
        {calls.length === 0 ? (
          <div className="text-center py-8 bg-[#F7F8FC] rounded-xl border border-dashed border-[#E8EAF1] text-xs text-[#747B91]">
            No calls have been initiated for this campaign yet. Click &quot;Execute Next Queue Batch&quot; above to start dialing via IndiaCalling Voice AI.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                  Lead
                </th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                  Phone
                </th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                  Duration
                </th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91]">
                  Inspect
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAF1]">
              {calls.map((c) => (
                <tr key={c._id} className="hover:bg-[#F7F8FC]">
                  <td className="px-4 py-3 font-semibold text-[#20243A]">
                    {c.leadName || "Contact"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[#747B91]">
                    {c.phoneNumber}
                  </td>
                  <td className="px-4 py-3 capitalize">{c.status}</td>
                  <td className="px-4 py-3">
                    {formatDuration(c.durationSeconds)}
                  </td>
                  <td className="px-4 py-3 text-[#747B91]">
                    {formatDate(c.startedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/calls/${c._id}`}
                      className="text-[#635BFF] font-semibold hover:underline"
                    >
                      Open Call Details →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Campaign Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8EAF1] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8EAF1]">
              <h3 className="text-base font-bold text-[#20243A]">
                Edit Campaign Details
              </h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCampaignEdits} className="space-y-4">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Objective
                </label>
                <input
                  type="text"
                  value={editForm.objective}
                  onChange={(e) =>
                    setEditForm({ ...editForm, objective: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Assigned AI Agent
                </label>
                <select
                  value={editForm.agentId}
                  onChange={(e) =>
                    setEditForm({ ...editForm, agentId: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                >
                  <option value="">Select an AI Agent...</option>
                  {availableAgents.map((ag) => (
                    <option key={ag._id} value={ag._id}>
                      {ag.name} ({ag.language || "Hindi/English"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Concurrency (Concurrent Calls)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={editForm.concurrency}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        concurrency: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Campaign Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({ ...editForm, status: e.target.value })
                    }
                    className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs capitalize"
                  >
                    <option value="draft">Draft</option>
                    <option value="ready">Ready</option>
                    <option value="running">Running</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Calling Start Hour
                  </label>
                  <input
                    type="time"
                    value={editForm.callingStart}
                    onChange={(e) =>
                      setEditForm({ ...editForm, callingStart: e.target.value })
                    }
                    className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Calling End Hour
                  </label>
                  <input
                    type="time"
                    value={editForm.callingEnd}
                    onChange={(e) =>
                      setEditForm({ ...editForm, callingEnd: e.target.value })
                    }
                    className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Description / Notes
                </label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                  placeholder="Optional campaign notes..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E8EAF1]">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-[#E8EAF1] rounded-lg font-semibold text-[#747B91] hover:bg-[#F7F8FC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdits}
                  className="px-5 py-2 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg font-bold shadow-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingEdits && <ButtonSpinner />}
                  <span>{savingEdits ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
