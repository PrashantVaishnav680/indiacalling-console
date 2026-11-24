/**
 * Pure Lead Interaction & Interest Journey helpers.
 * Classifies per-call interest outcomes (AI vs Salesperson) and builds a unified
 * chronological timeline highlighting First Interested Call and Latest Status Change.
 */

export interface CallInterestBadge {
  label:
    | "Interested"
    | "Follow-Up Requested"
    | "Not Interested (Told AI)"
    | "No Answer"
    | "Busy / Failed"
    | "Completed";
  tone: "emerald" | "indigo" | "red" | "amber" | "gray";
  isInterested: boolean;
  isNegative: boolean;
  reason: string;
}

export function classifyCallInterestOutcome(call: any): CallInterestBadge {
  const status = String(call?.status || "").toLowerCase();
  const dur = Number(call?.durationSeconds || 0);
  const qualStatus = String(
    call?.qualificationResult?.status || call?.qualificationStatus || ""
  ).toLowerCase();
  const interest = String(
    call?.qualificationResult?.interestLevel || ""
  ).toLowerCase();
  const reason = String(
    call?.qualificationResult?.reason ||
      call?.callOutcome ||
      call?.summary ||
      ""
  ).trim();
  const lowerReason = reason.toLowerCase();

  if (status === "no_answer") {
    return {
      label: "No Answer",
      tone: "gray",
      isInterested: false,
      isNegative: false,
      reason: reason || "Prospect did not pick up the call.",
    };
  }
  if (status === "busy" || status === "failed" || status === "cancelled") {
    return {
      label: "Busy / Failed",
      tone: "amber",
      isInterested: false,
      isNegative: false,
      reason: reason || `Call ended with status: ${status}.`,
    };
  }

  const explicitlyNegative =
    qualStatus === "unqualified" ||
    qualStatus === "lost" ||
    qualStatus === "not_interested" ||
    lowerReason.includes("not interested") ||
    lowerReason.includes("no interest") ||
    lowerReason.includes("declined") ||
    lowerReason.includes("refused") ||
    lowerReason.includes("cancelled") ||
    lowerReason.includes("do not call");

  if (explicitlyNegative) {
    return {
      label: "Not Interested (Told AI)",
      tone: "red",
      isInterested: false,
      isNegative: true,
      reason: reason || "Prospect informed the AI agent they are not interested.",
    };
  }

  if (
    qualStatus === "qualified" ||
    interest === "high" ||
    (status === "completed" &&
      dur >= 10 &&
      (lowerReason.includes("expressed interest") ||
        lowerReason.includes("buying intent") ||
        lowerReason.includes("site visit") ||
        lowerReason.includes("purchasing")))
  ) {
    return {
      label: "Interested",
      tone: "emerald",
      isInterested: true,
      isNegative: false,
      reason: reason || "Prospect showed positive buying interest during AI call.",
    };
  }

  if (
    qualStatus === "follow_up" ||
    qualStatus === "follow_up_required" ||
    interest === "medium" ||
    lowerReason.includes("follow-up") ||
    lowerReason.includes("schedule") ||
    lowerReason.includes("callback")
  ) {
    return {
      label: "Follow-Up Requested",
      tone: "indigo",
      isInterested: false,
      isNegative: false,
      reason: reason || "Prospect requested a follow-up conversation.",
    };
  }

  return {
    label: status === "completed" ? "Completed" : "No Answer",
    tone: "gray",
    isInterested: false,
    isNegative: false,
    reason:
      reason ||
      (dur < 10
        ? `Short call (${dur}s) — insufficient conversation for qualification.`
        : "Conversation completed."),
  };
}

export interface TimelineEntry {
  id: string;
  actorType: "ai" | "salesperson";
  actorName: string;
  sequenceLabel?: string;
  outcomeLabel: string;
  tone: "emerald" | "indigo" | "red" | "amber" | "gray";
  isInterested: boolean;
  isNegative: boolean;
  reason: string;
  timestamp: string;
  callId?: string;
  durationSeconds?: number;
}

export function buildLeadInteractionTimeline(lead: any, calls: any[] = []) {
  // Sort calls oldest -> newest to assign Call #1, Call #2, ...
  const sortedCalls = [...calls].sort((a, b) => {
    const ta = new Date(a.startedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.startedAt || b.createdAt || 0).getTime();
    return ta - tb;
  });

  const callEntries: TimelineEntry[] = sortedCalls.map((call, idx) => {
    const badge = classifyCallInterestOutcome(call);
    return {
      id: `call_${call._id || idx}`,
      actorType: "ai",
      actorName: call.agentName || "AI Voice Agent",
      sequenceLabel: `Call #${idx + 1}`,
      outcomeLabel: badge.label,
      tone: badge.tone,
      isInterested: badge.isInterested,
      isNegative: badge.isNegative,
      reason: badge.reason,
      timestamp: new Date(call.startedAt || call.createdAt || Date.now()).toISOString(),
      callId: String(call._id),
      durationSeconds: Number(call.durationSeconds || 0),
    };
  });

  const rawManual: any[] = Array.isArray(lead?.interactionTimeline)
    ? lead.interactionTimeline
    : [];
  const manualEntries: TimelineEntry[] = rawManual.map((ev, idx) => {
    const out = String(ev.outcome || "Update");
    const lower = out.toLowerCase();
    const isNeg =
      lower.includes("cancel") ||
      lower.includes("not interested") ||
      lower.includes("declined") ||
      lower.includes("lost");
    const isInt =
      lower.includes("interested") && !lower.includes("not interested") ||
      lower.includes("converted");
    const tone: TimelineEntry["tone"] = isNeg
      ? "red"
      : isInt
      ? "emerald"
      : lower.includes("callback") || lower.includes("schedule")
      ? "indigo"
      : "gray";

    return {
      id: `manual_${ev.id || idx}`,
      actorType: ev.actorType === "ai" ? "ai" : "salesperson",
      actorName: ev.actorName || "Salesperson",
      sequenceLabel: "Sales Update",
      outcomeLabel: isNeg
        ? "Cancelled / Declined (Salesperson)"
        : out,
      tone,
      isInterested: isInt,
      isNegative: isNeg,
      reason: ev.reason || "Status updated by salesperson.",
      timestamp: new Date(ev.createdAt || Date.now()).toISOString(),
    };
  });

  const timeline = [...callEntries, ...manualEntries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const firstInterestedEvent = timeline.find((e) => e.isInterested) || null;
  const latestOutcomeEvent = timeline.length > 0 ? timeline[timeline.length - 1] : null;

  return {
    timeline,
    firstInterestedEvent,
    latestOutcomeEvent,
  };
}
