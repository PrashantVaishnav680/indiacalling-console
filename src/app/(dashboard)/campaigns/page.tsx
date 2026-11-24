"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ICampaign } from "@/types";
import { LoadingState } from "@/components/LoadingSpinner";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<ICampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/campaigns");
      if (res.ok) {
        const json = await res.json();
        setCampaigns(json.campaigns || []);
      }
    } catch (err) {
      console.error("Failed to load campaigns", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const filtered = campaigns.filter(
    (c) => filterStatus === "all" || c.status === filterStatus
  );

  const toggleCampaign = async (id: string, currentStatus: string) => {
    const isLaunching = currentStatus === "ready" || currentStatus === "draft";
    const newStatus = currentStatus === "running" ? "paused" : "running";
    setCampaigns((prev) =>
      prev.map((c) => (c._id === id ? { ...c, status: newStatus as any } : c))
    );
    try {
      await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (isLaunching) {
        await fetch(`/api/campaigns/${id}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ concurrency: 3 }),
        });
      }
      fetchCampaigns();
    } catch (err) {
      console.error("Failed to toggle campaign", err);
    }
  };

  const handleSyncAllWithBolna = async () => {
    setSyncingAll(true);
    setBanner(null);
    try {
      const res = await fetch("/api/bolna/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncAgents: true, syncCalls: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({
          type: "error",
          text: data.details || data.error || "Failed to sync with IndiaCalling Voice AI",
        });
        return;
      }
      setBanner({
        type: "success",
        text: data.message || "Successfully synchronized with IndiaCalling Voice AI platform.",
      });
      await fetchCampaigns();
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Sync request failed",
      });
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSyncCampaign = async (id: string) => {
    setSyncingId(id);
    setBanner(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({
          type: "error",
          text: data.details || data.error || "Failed to sync campaign with Voice AI Engine",
        });
        return;
      }
      setBanner({
        type: "success",
        text: `✓ Campaign batch synced with IndiaCalling Voice AI! Batch ID: ${data.batch?.batchId?.slice(0, 16)}... (${data.batch?.leadCount} leads queued)`,
      });
      await fetchCampaigns();
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Campaign sync failed",
      });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#20243A]">Calling Campaigns</h1>
          <p className="text-sm text-[#747B91] mt-0.5">
            Launch and track automated calling campaigns.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncAllWithBolna}
            disabled={syncingAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-[#E8EAF1] bg-white text-[#20243A] hover:bg-[#F7F8FC] text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <span className={`w-2 h-2 rounded-full ${syncingAll ? "bg-amber-500 animate-ping" : "bg-emerald-500"}`} />
            {syncingAll ? "Syncing with Voice AI Engine..." : "Sync All with Voice AI Engine"}
          </button>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#635BFF] text-white text-sm font-semibold hover:bg-[#5046E5] transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Campaign
          </Link>
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
            className="font-bold hover:opacity-75"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-[#E8EAF1] rounded-xl p-2 w-fit">
        {["all", "draft", "ready", "running", "paused", "completed", "failed"].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              filterStatus === st
                ? "bg-[#635BFF] text-white shadow-sm"
                : "text-[#747B91] hover:text-[#20243A] hover:bg-[#F7F8FC]"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Campaign Cards Grid, Loading State, or Empty State */}
      {loading ? (
        <LoadingState
          title="Loading Outbound Campaigns..."
          subtitle="Fetching campaigns, active lead queues, and live dial progress"
        />
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((camp) => {
            const progressPct =
              camp.totalLeads > 0
                ? Math.round((camp.completedCalls / camp.totalLeads) * 100)
                : 0;

            const isSyncedWithBolna =
              Boolean(camp.bolnaBatchId) &&
              Boolean(camp.bolnaBatchId && !camp.bolnaBatchId.startsWith("batch_local_")) &&
              Boolean(camp.bolnaBatchId && !camp.bolnaBatchId.startsWith("batch_sim_"));

            return (
              <div
                key={camp._id}
                className="bg-white border border-[#E8EAF1] rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h3 className="font-semibold text-sm text-[#20243A]">{camp.name}</h3>
                      {camp.bolnaBatchId ? (
                        <p className="text-[10px] text-[#747B91] font-mono mt-0.5">
                          {isSyncedWithBolna
                            ? `✓ Voice AI Batch: ${camp.bolnaBatchId.slice(0, 14)}...`
                            : `Local: ${camp.bolnaBatchId.slice(0, 14)}...`}
                        </p>
                      ) : (
                        <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                          Not Synced with Voice AI Engine
                        </p>
                      )}
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                        camp.status === "running"
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                          : camp.status === "ready"
                          ? "bg-indigo-50 text-[#635BFF] border border-indigo-200"
                          : camp.status === "paused"
                          ? "bg-amber-50 text-amber-600 border border-amber-200"
                          : camp.status === "completed"
                          ? "bg-blue-50 text-blue-600 border border-blue-200"
                          : camp.status === "failed"
                          ? "bg-rose-50 text-rose-600 border border-rose-200"
                          : "bg-gray-100 text-gray-600 border border-gray-200"
                      }`}
                    >
                      {camp.status}
                    </span>
                  </div>

                  <p className="text-xs text-[#747B91] mb-4 line-clamp-2">
                    {camp.description || camp.objective || "Outbound calling campaign"}
                  </p>

                  {/* Progress */}
                  <div className="space-y-1.5 mb-4">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-[#747B91]">Dialing Progress:</span>
                      <span className="text-[#20243A]">
                        {camp.completedCalls} / {camp.totalLeads} ({progressPct}%)
                      </span>
                    </div>
                    <div className="w-full bg-[#E8EAF1] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[#635BFF] h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Specs */}
                  <div className="space-y-2 py-3 border-t border-[#E8EAF1] text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#747B91]">Objective:</span>
                      <span className="font-medium text-[#20243A]">
                        {camp.objective || "Lead Qualification"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#747B91]">Assigned AI Agent:</span>
                      <span className="font-semibold text-[#20243A]">{camp.agentName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#747B91]">Calling Schedule:</span>
                      <span className="text-[#20243A]">
                        {camp.schedule?.callingHours?.start || "09:30"} - {camp.schedule?.callingHours?.end || "18:30"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#747B91]">Qualified Leads:</span>
                      <span className="font-bold text-[#13B8A6]">{camp.qualifiedLeads} leads</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-4 border-t border-[#E8EAF1] mt-2">
                  <Link
                    href={`/campaigns/${camp._id}`}
                    className="flex-1 text-center py-2 bg-[#F7F8FC] hover:bg-[#EEF0FF] text-[#20243A] hover:text-[#635BFF] text-xs font-semibold rounded-lg transition-colors border border-[#E8EAF1]"
                  >
                    Manage & Launch
                  </Link>

                  <button
                    onClick={() => handleSyncCampaign(camp._id)}
                    disabled={syncingId === camp._id}
                    title="Sync this campaign batch to IndiaCalling Voice AI"
                    className="px-2.5 py-2 text-xs font-semibold rounded-lg border border-indigo-200 text-[#635BFF] bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  >
                    {syncingId === camp._id ? "Syncing..." : "⚡ Sync IndiaCalling Voice AI"}
                  </button>

                  {camp.status !== "completed" && camp.status !== "draft" && (
                    <button
                      onClick={() => toggleCampaign(camp._id, camp.status)}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                        camp.status === "running"
                          ? "border-amber-200 text-amber-600 hover:bg-amber-50"
                          : camp.status === "ready"
                          ? "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-bold"
                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                      }`}
                    >
                      {camp.status === "running"
                        ? "Pause"
                        : camp.status === "ready"
                        ? "🚀 Launch"
                        : "Resume"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#E8EAF1] rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-2xl font-bold">
            📢
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#20243A]">No Campaigns Created Yet</h2>
            <p className="text-xs text-[#747B91] mt-1 leading-relaxed">
              Create an outbound batch campaign to automatically dial multiple prospect leads using your AI agents.
            </p>
          </div>
          <div>
            <Link
              href="/campaigns/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
            >
              + Create First Campaign
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
