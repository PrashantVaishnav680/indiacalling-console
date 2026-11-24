"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatDate, formatDuration } from "@/lib/utils";
import { parseStructuredFields } from "@/lib/structured-fields";

export default function CallDetailPage({
  params,
}: {
  params?: { id: string } | Promise<{ id: string }>;
}) {
  const routeParams = useParams();
  const id = (routeParams?.id as string) || (params as any)?.id || "";

  const [call, setCall] = useState<any>(null);
  const [transcript, setTranscript] = useState<any>(null);
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Transcript search state
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [copied, setCopied] = useState(false);

  // Lead note & follow-up state
  const [newNote, setNewNote] = useState("");
  const [savingLeadUpdate, setSavingLeadUpdate] = useState(false);

  // HTML5 Audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const fetchCallData = useCallback(async (forceRefresh = false) => {
    if (!id) return;
    if (forceRefresh) setRefreshing(true);
    try {
      const res = await fetch(
        `/api/calls/${id}${forceRefresh ? "?refresh=true" : ""}`
      );
      if (res.ok) {
        const json = await res.json();
        setCall(json.call);
        setTranscript(json.transcript);
        if (json.call?.leadId) {
          const leadRes = await fetch(`/api/leads/${json.call.leadId}`);
          if (leadRes.ok) {
            const leadJson = await leadRes.json();
            setLead(leadJson.lead || leadJson);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load call details", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCallData();
  }, [fetchCallData]);

  const toggleAudioPlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const handleSpeedChange = (spd: number) => {
    setPlaybackSpeed(spd);
    if (audioRef.current) {
      audioRef.current.playbackRate = spd;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const handleCopyTranscript = () => {
    if (!transcript?.messages) return;
    const text = transcript.messages
      .map(
        (m: any) =>
          `${m.timestamp ? `[${m.timestamp}] ` : ""}${m.speaker.toUpperCase()}: ${
            m.text
          }`
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddLeadNote = async () => {
    if (!lead?._id || !newNote.trim()) return;
    setSavingLeadUpdate(true);
    try {
      const updatedNotes = [...(lead.notes || []), newNote.trim()];
      const res = await fetch(`/api/leads/${lead._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: updatedNotes }),
      });
      if (res.ok) {
        setLead({ ...lead, notes: updatedNotes });
        setNewNote("");
      }
    } finally {
      setSavingLeadUpdate(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-[#747B91]">
        Loading call details...
      </div>
    );
  }

  if (!call) {
    return (
      <div className="bg-white border border-[#E8EAF1] rounded-2xl p-12 text-center max-w-md mx-auto space-y-4">
        <h2 className="text-base font-bold text-[#20243A]">
          Call Record Not Found
        </h2>
        <Link
          href="/calls"
          className="inline-block px-4 py-2 bg-[#635BFF] text-white text-xs font-semibold rounded-lg"
        >
          ← Back to Call History
        </Link>
      </div>
    );
  }

  const effectiveDuration =
    audioDuration > 0 ? Math.round(audioDuration) : call.durationSeconds || 0;

  const allMessages: any[] = transcript?.messages || [];
  const filteredMessages = transcriptSearch.trim()
    ? allMessages.filter((m) =>
        String(m.text || "")
          .toLowerCase()
          .includes(transcriptSearch.trim().toLowerCase())
      )
    : allMessages;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-[#747B91]">
            <Link href="/calls" className="hover:text-[#635BFF]">
              Call History
            </Link>
            <span>/</span>
            <span className="text-[#20243A]">
              Execution #{call.bolnaExecutionId || call.bolnaCallId || call._id}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[#20243A]">
              Call with {call.leadName || lead?.name || call.phoneNumber}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 capitalize">
              {call.status}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchCallData(true)}
            disabled={refreshing}
            className="px-3.5 py-2 border border-[#E8EAF1] bg-white hover:border-[#635BFF] text-xs font-semibold text-[#20243A] rounded-lg transition-colors disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Sync Execution from Voice AI Engine"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 1. Overview, 4. AI Analysis & 5. Lead Information (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. OVERVIEW */}
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-3 shadow-sm">
            <h3 className="font-bold text-sm text-[#20243A]">1. Call Overview</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#747B91]">Lead / Contact:</span>
                <span className="font-semibold text-[#20243A]">
                  {call.leadName || lead?.name || "Direct Contact"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Phone Number:</span>
                <span className="font-mono text-[#20243A]">
                  {call.phoneNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">AI Agent:</span>
                <span className="font-semibold text-[#20243A]">
                  {call.agentName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Campaign:</span>
                <span className="font-medium text-[#20243A]">
                  {call.campaignName || call.campaignId || "Direct / Standalone"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Call Direction:</span>
                <span className="font-semibold capitalize text-[#20243A]">
                  {call.direction}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Call Status:</span>
                <span className="font-semibold capitalize text-[#635BFF]">
                  {call.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Start Time:</span>
                <span className="text-[#20243A]">
                  {call.startedAt ? formatDate(call.startedAt) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">End Time:</span>
                <span className="text-[#20243A]">
                  {call.endedAt ? formatDate(call.endedAt) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Duration:</span>
                <span className="font-semibold text-[#20243A]">
                  {formatDuration(call.durationSeconds)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Voice AI Execution ID:</span>
                <span className="font-mono text-[11px] text-[#635BFF]">
                  {call.bolnaExecutionId || call.bolnaCallId || "—"}
                </span>
              </div>
            </div>
          </div>

          {/* 4. AI ANALYSIS & EXTRACTIONS */}
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#20243A]">
                4. AI Analysis & Extractions
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#EEF0FF] text-[#635BFF] capitalize">
                {call.qualificationResult?.status ||
                  call.qualificationStatus ||
                  "pending"}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#747B91]">Customer Intent:</span>
                <span className="font-semibold text-[#20243A]">
                  {call.customerIntent ||
                    call.qualificationResult?.customerIntent ||
                    (call.qualificationResult?.status === "qualified"
                      ? "High Purchase / Inquiry Intent"
                      : "Information Gathering")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Interest Level:</span>
                <span className="font-semibold capitalize text-[#20243A]">
                  {call.qualificationResult?.interestLevel || "medium"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Call Outcome:</span>
                <span className="font-semibold text-[#20243A]">
                  {call.callOutcome || call.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Objections Raised:</span>
                <span className="text-[#20243A]">
                  {(call.objections || call.qualificationResult?.objections)
                    ?.length
                    ? (
                        call.objections || call.qualificationResult?.objections
                      ).join(", ")
                    : "None detected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Next Recommended Action:</span>
                <span className="font-semibold text-[#635BFF]">
                  {call.qualificationResult?.nextAction ||
                    "Review transcript & schedule follow-up"}
                </span>
              </div>
            </div>

            {(() => {
              const fields = parseStructuredFields(call.extractedData);
              return (
                <div className="pt-3 border-t border-[#E8EAF1] space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#747B91]">
                    Call Intelligence · Extracted Details
                  </p>
                  {fields.length === 0 ? (
                    <p className="text-xs text-[#747B91]">No extracted call details yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {fields.map((f) => (
                        <div
                          key={f.key}
                          className="rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] px-3 py-2"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#747B91]">
                            {f.label}
                          </p>
                          <p className="text-xs font-semibold text-[#20243A] mt-0.5 break-words">
                            {f.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 5. LEAD INFORMATION */}
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#20243A]">
                5. Lead Information
              </h3>
              {lead?._id && (
                <Link
                  href={`/leads/${lead._id}`}
                  className="text-xs font-semibold text-[#635BFF] hover:underline"
                >
                  Open Full Lead →
                </Link>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#747B91]">Customer Name:</span>
                <span className="font-semibold text-[#20243A]">
                  {lead?.name || call.leadName || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Lead Status:</span>
                <span className="font-semibold capitalize text-[#20243A]">
                  {lead?.qualificationStatus ||
                    call.qualificationStatus ||
                    "new"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Assigned Salesperson:</span>
                <span className="font-semibold text-[#20243A]">
                  {lead?.assignedSalespersonName ||
                    call.assignedSalespersonName ||
                    "Unassigned"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Follow-Up Scheduled:</span>
                <span className="text-[#20243A]">
                  {lead?.followUpAt ? formatDate(lead.followUpAt) : "Not set"}
                </span>
              </div>
            </div>

            {lead && (
              <div className="pt-2 border-t border-[#E8EAF1] space-y-2 text-xs">
                <p className="font-semibold text-[#20243A]">Lead Notes:</p>
                {(lead.notes || []).length > 0 ? (
                  <ul className="list-disc list-inside text-[#747B91] space-y-1">
                    {lead.notes.map((n: string, idx: number) => (
                      <li key={idx}>{n}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#747B91]">No notes added yet.</p>
                )}
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a note for this lead..."
                    className="flex-1 px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    disabled={savingLeadUpdate}
                    onClick={handleAddLeadNote}
                    className="px-3 py-1.5 bg-[#635BFF] text-white rounded-lg font-semibold"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: 2. Recording & 3. Transcript (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 2. RECORDING */}
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-[#20243A]">
                  2. Call Audio Recording
                </h3>
                <p className="text-xs text-[#747B91]">
                  {call.recordingUrl
                    ? "Verified IndiaCalling Voice AI execution audio recording"
                    : "No recording URL returned by IndiaCalling Voice AI for this execution"}
                </p>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  call.recordingUrl
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-gray-100 text-gray-600 border border-gray-200"
                }`}
              >
                {call.recordingUrl ? "Recording Available" : "Unavailable"}
              </span>
            </div>

            {call.recordingUrl ? (
              <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl space-y-3">
                <audio
                  ref={audioRef}
                  src={`/api/calls/${call._id}/recording`}
                      onLoadStart={() => { setAudioLoading(true); setAudioError(null); }}
                      onCanPlay={() => setAudioLoading(false)}
                      onError={() => { setAudioLoading(false); setIsPlaying(false); setAudioError('Recording unavailable or still processing on Voice AI Engine.'); }}
                  preload="metadata"
                  onTimeUpdate={() =>
                    setCurrentTime(audioRef.current?.currentTime || 0)
                  }
                  onLoadedMetadata={() =>
                    setAudioDuration(audioRef.current?.duration || 0)
                  }
                  onEnded={() => setIsPlaying(false)}
                />
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={toggleAudioPlay}
                    className="w-10 h-10 rounded-full bg-[#635BFF] text-white flex items-center justify-center hover:bg-[#5046E5] transition-colors shadow-sm flex-shrink-0"
                  >
                    {isPlaying ? "⏸" : "▶"}
                  </button>

                  <div className="flex-1 space-y-1">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(effectiveDuration, 1)}
                      step={0.5}
                      value={currentTime}
                      onChange={handleSeek}
                      className="w-full accent-[#635BFF] cursor-pointer"
                    />
                    <div className="flex justify-between text-[11px] text-[#747B91] font-mono">
                      <span>{formatDuration(Math.floor(currentTime))}</span>
                      <span>{formatDuration(effectiveDuration)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 border border-[#E8EAF1] bg-white rounded-lg p-0.5 text-xs font-semibold">
                    {[1, 1.25, 1.5, 2].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => handleSpeedChange(spd)}
                        className={`px-2 py-0.5 rounded ${
                          playbackSpeed === spd
                            ? "bg-[#635BFF] text-white"
                            : "text-[#747B91] hover:text-[#20243A]"
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl text-xs text-[#747B91]">
                No audio recording is currently attached to this IndiaCalling Voice AI execution.
              </div>
            )}
          </div>

          {/* 3. TRANSCRIPT (With Search Within Transcript & Actual Timestamps Only) */}
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E8EAF1] pb-3">
              <div>
                <h3 className="font-bold text-sm text-[#20243A]">
                  3. Conversation Transcript
                </h3>
                <p className="text-xs text-[#747B91]">
                  Actual IndiaCalling Voice AI execution transcript with speaker identification
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                  placeholder="Search within transcript..."
                  className="px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF]"
                />
                <button
                  type="button"
                  onClick={handleCopyTranscript}
                  className="px-3 py-1.5 bg-[#F7F8FC] hover:bg-[#EEF0FF] text-[#20243A] hover:text-[#635BFF] rounded-lg text-xs font-semibold border border-[#E8EAF1]"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {transcript?.summary && (
              <div className="p-3 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs">
                <span className="font-semibold text-[#635BFF] mr-1.5">
                  Conversation Summary:
                </span>
                <span className="text-[#20243A]">{transcript.summary}</span>
              </div>
            )}

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {filteredMessages.length > 0 ? (
                filteredMessages.map((m: any, idx: number) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${
                      m.speaker === "agent" ? "items-start" : "items-end"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 text-[11px] text-[#747B91]">
                      <span className="font-semibold text-[#20243A]">
                        {m.speaker === "agent" ? call.agentName : "Customer"}
                      </span>
                      {m.timestamp && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{m.timestamp}</span>
                        </>
                      )}
                    </div>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                        m.speaker === "agent"
                          ? "bg-[#EEF0FF] text-[#20243A] rounded-tl-none border border-[#C7CBFF]"
                          : "bg-white text-[#20243A] rounded-tr-none border border-[#E8EAF1] shadow-xs"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))
              ) : call.transcript ? (
                <pre className="p-4 bg-[#F7F8FC] rounded-xl text-xs font-mono text-[#20243A] whitespace-pre-wrap">
                  {call.transcript}
                </pre>
              ) : (
                <div className="p-8 text-center text-xs text-[#747B91]">
                  {transcriptSearch
                    ? "No transcript lines matched your search query."
                    : "No transcript returned by IndiaCalling Voice AI for this call execution yet."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
