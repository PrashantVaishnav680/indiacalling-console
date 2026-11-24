"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatDuration } from "@/lib/utils";

type CallPhase =
  | "idle"
  | "initiating"
  | "ringing"
  | "in_progress"
  | "completed"
  | "failed";

export default function RealBolnaTestingPage() {
  const searchParams = useSearchParams();
  const preselectedAgentId = searchParams.get("agentId");
  const prefilledPhone = searchParams.get("phone");

  const [agents, setAgents] = useState<any[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState(
    prefilledPhone || "+91 98765 43210"
  );
  const [callerIdOverride, setCallerIdOverride] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Real Voice AI Execution State
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [bolnaExecutionId, setBolnaExecutionId] = useState<string>("");
  const [activeCallRecord, setActiveCallRecord] = useState<any>(null);
  const [liveTranscript, setLiveTranscript] = useState<any>(null);
  const [errorBanner, setErrorBanner] = useState<string>("");

  useEffect(() => {
    async function loadAgents() {
      try {
        const res = await fetch("/api/agents");
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.agents || [];
          setAgents(list);
          if (list.length > 0) {
            const matched = list.find((a: any) => a._id === preselectedAgentId);
            const chosen = matched || list[0];
            setSelectedAgentId(chosen._id);
          }
        }
      } catch (e) {
        console.error("Failed to load agents", e);
      } finally {
        setLoadingAgents(false);
      }
    }
    loadAgents();
  }, [preselectedAgentId]);

  const selectedAgent = agents.find((a) => a._id === selectedAgentId);
  const isAgentSynchronized =
    Boolean(selectedAgent?.bolnaAgentId) &&
    !String(selectedAgent?.bolnaAgentId).startsWith("bolna_sim_") &&
    selectedAgent?.syncStatus === "synced";

  const handleInitiateRealTestCall = async () => {
    if (!selectedAgent) return;
    setShowConfirmModal(false);
    setErrorBanner("");
    setCallPhase("initiating");
    setActiveCallRecord(null);
    setLiveTranscript(null);
    setBolnaExecutionId("");

    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgent._id,
          phoneNumber,
          fromPhoneNumber: callerIdOverride || undefined,
          direction: "outbound",
          testingMode: "outbound_test_call",
          confirmedRealCall: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.details ||
            data.error ||
            "Real test call could not be initiated with IndiaCalling Voice AI."
        );
      }

      const execId = data.bolnaExecutionId || data.bolnaCallId;
      setBolnaExecutionId(execId);
      setActiveCallRecord(data.call);
      setCallPhase("ringing");

      // Poll actual execution details from Voice AI Engine via /api/calls/[id]?refresh=true
      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(
            `/api/calls/${data.call._id}?refresh=true`
          );
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            const remoteStatus = pollData.call?.status;
            setActiveCallRecord(pollData.call);
            setLiveTranscript(pollData.transcript);

            if (remoteStatus === "in_progress" || remoteStatus === "answered") {
              setCallPhase("in_progress");
            } else if (remoteStatus === "completed") {
              clearInterval(pollInterval);
              setCallPhase("completed");
              fetch("/api/calls?sync=true").catch(() => {});
            } else if (
              remoteStatus === "failed" ||
              remoteStatus === "no_answer" ||
              remoteStatus === "busy" ||
              remoteStatus === "cancelled"
            ) {
              clearInterval(pollInterval);
              setCallPhase("failed");
              setErrorBanner(
                `IndiaCalling Voice AI execution finished with status: ${remoteStatus}`
              );
            }
          }
        } catch {
          // Continue polling
        }
      }, 4000);
    } catch (err: any) {
      setErrorBanner(
        err?.message ||
          "Failed to initiate real test call via IndiaCalling Voice AI. Verify your VOICE_AI_API_KEY and agent synchronization."
      );
      setCallPhase("failed");
    }
  };

  if (loadingAgents) {
    return (
      <div className="flex items-center justify-center min-h-[350px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#635BFF]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#20243A]">
            AI Agent Voice Testing
          </h1>
          <p className="text-sm text-[#747B91] mt-0.5">
            Initiate live test calls using synchronized IndiaCalling Voice AI agents and inspect actual execution telemetry, recordings, and transcripts.
          </p>
        </div>
        <Link
          href="/calls"
          className="px-4 py-2 bg-white border border-[#E8EAF1] hover:border-[#635BFF] text-xs font-semibold text-[#20243A] rounded-lg transition-colors"
        >
          Open Call History →
        </Link>
      </div>

      {/* Mandatory Live Usage & Cost Warning Banner */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-3">
        <span className="text-base">⚠️</span>
        <div>
          <p className="font-bold">
            Live Telephony Engine Notice — Real Usage Charges Apply
          </p>
          <p className="text-amber-800 mt-0.5 leading-relaxed">
            Initiating a test call places a live voice call via IndiaCalling Voice AI telephony and incurs standard per-minute usage charges.
          </p>
        </div>
      </div>

      {errorBanner && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
          <div>
            <p className="font-bold">Test Call Initiation Error</p>
            <p className="mt-0.5">{errorBanner}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner("")}
            className="font-bold text-rose-700"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Agent Selection & Call Initiation */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-4 shadow-sm">
            <h2 className="font-bold text-sm text-[#20243A]">
              1. Select Synchronized Agent & Recipient
            </h2>

            <div>
              <label className="block text-xs font-semibold text-[#20243A] mb-1">
                Select AI Agent *
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => {
                  setSelectedAgentId(e.target.value);
                  setErrorBanner("");
                }}
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs font-medium text-[#20243A]"
              >
                {agents.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} ({a.syncStatus === "synced" ? "Live Synced" : "Pending Sync"})
                  </option>
                ))}
              </select>
            </div>

            {selectedAgent && (
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                  isAgentSynchronized
                    ? "bg-[#EEF0FF] border-[#C7CBFF]"
                    : "bg-rose-50 border-rose-200"
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-[#20243A]">{selectedAgent.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      isAgentSynchronized
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {isAgentSynchronized
                      ? "Synchronized"
                      : "Not Synchronized"}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-[#747B91]">
                  Voice AI Agent ID: {selectedAgent.bolnaAgentId || "None"}
                </p>
                {!isAgentSynchronized && (
                  <p className="text-[11px] text-rose-700 font-medium">
                    This agent must be synchronized with IndiaCalling Voice AI before a real test call can be initiated.{" "}
                    <Link
                      href={`/agents/${selectedAgent._id}`}
                      className="underline font-bold"
                    >
                      Open Agent & Sync →
                    </Link>
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#20243A] mb-1">
                Recipient Phone Number (E.164 / +91) *
              </label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs font-mono text-[#20243A]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#20243A] mb-1">
                From Caller ID (Optional)
              </label>
              <input
                type="text"
                value={callerIdOverride}
                onChange={(e) => setCallerIdOverride(e.target.value)}
                placeholder="Leave blank to use IndiaCalling Voice AI account default route"
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs font-mono text-[#20243A]"
              />
            </div>

            <button
              type="button"
              disabled={!selectedAgent || !isAgentSynchronized}
              onClick={() => setShowConfirmModal(true)}
              className="w-full py-3 bg-[#635BFF] hover:bg-[#5046E5] text-white font-bold text-xs rounded-xl transition-colors shadow-sm disabled:opacity-50"
            >
              Initiate Live Test Call
            </button>
          </div>
        </div>

        {/* Right Column: Actual Voice AI Execution Status, Recording & Transcript */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E8EAF1] pb-3">
              <div>
                <h3 className="font-bold text-sm text-[#20243A]">
                  2. Actual Voice AI Execution Telemetry
                </h3>
                <p className="text-xs text-[#747B91]">
                  {bolnaExecutionId
                    ? `Voice AI Execution ID: ${bolnaExecutionId}`
                    : "No active execution"}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-[#F7F8FC] border border-[#E8EAF1] text-[#20243A]">
                {callPhase}
              </span>
            </div>

            {activeCallRecord ? (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-3 gap-3 bg-[#F7F8FC] p-3.5 rounded-xl border border-[#E8EAF1]">
                  <div>
                    <span className="text-[#747B91]">Status:</span>
                    <p className="font-bold text-[#20243A] capitalize mt-0.5">
                      {activeCallRecord.status}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#747B91]">Duration:</span>
                    <p className="font-bold text-[#20243A] mt-0.5">
                      {formatDuration(activeCallRecord.durationSeconds || 0)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#747B91]">Recording:</span>
                    <p className="font-bold text-[#635BFF] mt-0.5">
                      {activeCallRecord.recordingUrl
                        ? "Available"
                        : "Pending / None"}
                    </p>
                  </div>
                </div>

                {activeCallRecord.recordingUrl && (
                  <div className="p-3 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl">
                    <p className="font-semibold text-[#20243A] mb-2">
                      Actual IndiaCalling Voice AI Recording Stream:
                    </p>
                    <audio
                      controls
                      src={activeCallRecord.recordingUrl}
                      className="w-full"
                    />
                  </div>
                )}

                {liveTranscript?.messages?.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto p-3 bg-[#F7F8FC] rounded-xl border border-[#E8EAF1]">
                    {liveTranscript.messages.map((m: any, i: number) => (
                      <div key={i} className="text-xs">
                        <strong className="text-[#635BFF] uppercase">
                          {m.speaker}:
                        </strong>{" "}
                        <span className="text-[#20243A]">{m.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end">
                  <Link
                    href={`/calls/${activeCallRecord._id}`}
                    className="px-4 py-2 bg-[#635BFF] text-white rounded-lg font-semibold"
                  >
                    Open Full Call Details →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center text-xs text-[#747B91]">
                Select a synced agent on the left and initiate a live test call to inspect real-time execution details.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8EAF1] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-[#20243A]">
              Confirm Live Test Call
            </h3>
            <p className="text-xs text-[#747B91] leading-relaxed">
              This will initiate a real outbound call via IndiaCalling Voice AI (`POST /call`) using agent{" "}
              <strong className="text-[#20243A]">{selectedAgent?.name}</strong>{" "}
              to <strong className="font-mono text-[#635BFF]">{phoneNumber}</strong>. Actual IndiaCalling Voice AI charges may apply.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-lg border border-[#E8EAF1] text-xs font-semibold text-[#747B91]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInitiateRealTestCall}
                className="px-4 py-2 rounded-lg bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold"
              >
                Confirm & Initiate Real Call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
