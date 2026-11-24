"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ICall } from "@/types";
import { formatDate, formatDuration } from "@/lib/utils";
import { LoadingState } from "@/components/LoadingSpinner";

export default function RecordingsPage() {
  const [calls, setCalls] = useState<ICall[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchRecordings = async () => {
    try {
      const res = await fetch("/api/calls?pageSize=100");
      if (res.ok) {
        const json = await res.json();
        const withRec = (json.calls || []).filter(
          (c: ICall) => Boolean(c.recordingUrl)
        );
        setCalls(withRec);
      }
    } catch (err) {
      console.error("Failed to load recordings", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
  }, []);

  const togglePlayRecording = (call: ICall) => {
    if (!call.recordingUrl) return;
    if (playingId === call._id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.src = call.recordingUrl;
      audioRef.current
        .play()
        .then(() => setPlayingId(call._id))
        .catch(() => setPlayingId(null));
    }
  };

  return (
    <div className="space-y-6">
      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        className="hidden"
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#20243A]">
            Call Recordings Vault
          </h1>
          <p className="text-sm text-[#747B91] mt-0.5">
            Stream high-fidelity audio recordings from IndiaCalling Voice AI call executions and test runs.
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingState
          title="Loading Call Recordings..."
          subtitle="Fetching verified audio files from Voice AI Engine and local media storage"
        />
      ) : calls.length > 0 ? (
        <div className="bg-white border border-[#E8EAF1] rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-xs">
            <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
              <tr>
                <th className="px-5 py-3.5 text-left font-semibold text-[#747B91] uppercase tracking-wider">
                  Customer / Phone
                </th>
                <th className="px-5 py-3.5 text-left font-semibold text-[#747B91] uppercase tracking-wider">
                  AI Agent
                </th>
                <th className="px-5 py-3.5 text-left font-semibold text-[#747B91] uppercase tracking-wider">
                  Call Duration
                </th>
                <th className="px-5 py-3.5 text-left font-semibold text-[#747B91] uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="px-5 py-3.5 text-left font-semibold text-[#747B91] uppercase tracking-wider">
                  Qualification
                </th>
                <th className="px-5 py-3.5 text-right font-semibold text-[#747B91] uppercase tracking-wider">
                  Listen & Inspect
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAF1]">
              {calls.map((call) => (
                <tr
                  key={call._id}
                  className="hover:bg-[#F7F8FC] transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-sm text-[#20243A]">
                      {call.leadName || "Contact"}
                    </p>
                    <p className="font-mono text-xs text-[#747B91]">
                      {call.phoneNumber}
                    </p>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-[#20243A]">
                    {call.agentName}
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-[#20243A]">
                    {formatDuration(call.durationSeconds)}
                  </td>
                  <td className="px-5 py-3.5 text-[#747B91] whitespace-nowrap">
                    {formatDate(call.startedAt)}
                  </td>
                  <td className="px-5 py-3.5">
                    {call.qualificationResult ? (
                      <span className="px-2 py-0.5 rounded-full font-semibold text-[11px] bg-purple-50 text-[#635BFF]">
                        {call.qualificationResult.status} (
                        {call.qualificationResult.score}%)
                      </span>
                    ) : (
                      <span className="text-[#747B91]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => togglePlayRecording(call)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                          playingId === call._id
                            ? "bg-emerald-600 text-white"
                            : "bg-[#F7F8FC] hover:bg-[#EEF0FF] text-[#635BFF] border border-[#E8EAF1]"
                        }`}
                      >
                        {playingId === call._id ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                            Pause Audio
                          </>
                        ) : (
                          <>
                            <svg
                              className="w-3.5 h-3.5"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            Play Audio
                          </>
                        )}
                      </button>
                      <Link
                        href={`/calls/${call._id}`}
                        className="px-3 py-1.5 bg-[#635BFF] text-white hover:bg-[#5046E5] rounded-lg text-xs font-semibold transition-colors"
                      >
                        Details
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-[#E8EAF1] rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-purple-50 text-[#635BFF] flex items-center justify-center mx-auto text-2xl font-bold">
            🎙️
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#20243A]">
              No Audio Recordings Yet
            </h2>
            <p className="text-xs text-[#747B91] mt-1 leading-relaxed">
              Completed voice calls automatically appear here for instant audio playback and review.
            </p>
          </div>
          <div>
            <Link
              href="/testing"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
            >
              Launch Test Call →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
