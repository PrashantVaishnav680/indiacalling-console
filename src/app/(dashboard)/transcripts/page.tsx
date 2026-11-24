"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ICall } from "@/types";
import { formatDate, formatDuration } from "@/lib/utils";

export default function TranscriptsPage() {
  const [calls, setCalls] = useState<ICall[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        const res = await fetch("/api/calls");
        if (res.ok) {
          const json = await res.json();
          setCalls(json.calls || []);
        }
      } catch (err) {
        console.error("Failed to load transcripts", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCalls();
  }, []);

  const filtered = calls.filter((c) => {
    const matchesSearch =
      (c.leadName && c.leadName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      c.phoneNumber.includes(searchTerm) ||
      (c.qualificationResult?.reason && c.qualificationResult.reason.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#20243A]">Conversation Transcripts</h1>
          <p className="text-sm text-[#747B91] mt-0.5">
            Searchable verbatim transcripts with automated conversation summaries and extracted key insights.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search keywords in transcripts or customer names..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-[#E8EAF1] rounded-lg text-xs text-[#20243A] placeholder-[#747B91] focus:outline-none focus:border-[#635BFF]"
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

      {/* Transcript Cards or Empty State */}
      {filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map((call) => (
            <div
              key={call._id}
              className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-3 hover:shadow-sm transition-shadow"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8EAF1] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#635BFF]/10 text-[#635BFF] flex items-center justify-center font-bold text-xs">
                    {call.leadName ? call.leadName.slice(0, 2).toUpperCase() : "CALL"}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[#20243A]">
                      {call.leadName || "Contact"} ({call.phoneNumber})
                    </h3>
                    <p className="text-xs text-[#747B91]">
                      Agent: {call.agentName} • {formatDuration(call.durationSeconds)} •{" "}
                      {formatDate(call.startedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {call.qualificationResult && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {call.qualificationResult.status} ({call.qualificationResult.score}%)
                    </span>
                  )}
                  <Link
                    href={`/calls/${call._id}`}
                    className="px-3 py-1.5 bg-[#EEF0FF] text-[#635BFF] hover:bg-[#635BFF] hover:text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    View Verbatim Dialog →
                  </Link>
                </div>
              </div>

              {/* AI Generated Executive Summary */}
              <div className="p-3 bg-[#F7F8FC] rounded-lg text-xs leading-relaxed text-[#20243A]">
                <span className="font-semibold text-[#635BFF] mr-1.5">AI Executive Summary:</span>
                {call.qualificationResult?.reason || "Verbatim conversation recorded. Click above to view full speech transcript."}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-[#E8EAF1] rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-blue-50 text-[#635BFF] flex items-center justify-center mx-auto text-2xl font-bold">
            📄
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#20243A]">No Transcripts Available Yet</h2>
            <p className="text-xs text-[#747B91] mt-1 leading-relaxed">
              When calls are conducted, full speech-to-text transcripts with speaker labels and automated summaries will appear here.
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
