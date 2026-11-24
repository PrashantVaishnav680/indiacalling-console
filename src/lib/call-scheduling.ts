/**
 * Shared pure helpers for:
 * 1. Real-Time Post-Qualification Call Scheduling (`Scheduled`, `Due Now`, `Completed`, `Missed`)
 * 2. Leads Qualification Signals, Score (0–100 pts) & Heat Buckets (`hot`, `warm`, `cold`, `unqualified`)
 * 3. Wallet, Subscription & 18% GST Billing Math (default ₹6/min)
 */

export type LiveScheduledCallStatus = "Scheduled" | "Due Now" | "Completed" | "Missed";

export interface ScheduledCallInput {
  scheduledAt?: string | Date | null;
  timezone?: string;
  notes?: string;
  status?: "scheduled" | "completed" | "missed" | "cancelled" | string;
  assignedToId?: string;
  assignedToName?: string;
  updatedAt?: string | Date;
}

export function computeScheduledCallStatus(
  scheduledCall?: ScheduledCallInput | null,
  nowMs: number = Date.now()
): LiveScheduledCallStatus | null {
  if (!scheduledCall || !scheduledCall.scheduledAt) return null;

  const rawStatus = String(scheduledCall.status || "scheduled").toLowerCase();
  if (rawStatus === "completed") return "Completed";
  if (rawStatus === "missed") return "Missed";

  const targetMs = new Date(scheduledCall.scheduledAt).getTime();
  if (Number.isNaN(targetMs)) return "Scheduled";

  const diffMs = targetMs - nowMs;
  const FIFTEEN_MIN = 15 * 60 * 1000;

  if (diffMs > FIFTEEN_MIN) return "Scheduled";
  if (diffMs >= -FIFTEEN_MIN) return "Due Now";
  return "Missed";
}

export type LeadHeatBucket = "hot" | "warm" | "cold" | "unqualified";

export interface ScorableLeadInput {
  budget?: string;
  location?: string;
  timeline?: string;
  qualificationReason?: string;
  notes?: string[];
  qualificationScore?: number;
  interestLevel?: string;
  qualificationStatus?: string;
  lastCallId?: string;
  lastCallDate?: string | Date;
  scheduledCall?: ScheduledCallInput | null;
  qualificationSignals?: string[];
}

const SIGNAL_WEIGHTS: Record<string, number> = {
  "Budget confirmed": 25,
  "Decision maker": 25,
  "Callback / visit requested": 25,
  "Purchase timeline shared": 20,
  "Preferred location captured": 10,
  "Positive AI call sentiment": 20,
};

export function extractLeadSignals(lead: ScorableLeadInput): string[] {
  if (Array.isArray(lead.qualificationSignals) && lead.qualificationSignals.length > 0) {
    return lead.qualificationSignals;
  }

  const status = String(lead.qualificationStatus || "new").toLowerCase();
  const hasCallContext = Boolean(
    lead.lastCallId ||
      lead.lastCallDate ||
      lead.qualificationReason ||
      lead.scheduledCall?.scheduledAt ||
      (Array.isArray(lead.notes) && lead.notes.length > 0) ||
      (status !== "new" && status !== "pending_qualification")
  );

  // Uncontacted "new" CSV uploads should not show fake qualification signals
  if (!hasCallContext) {
    return [];
  }

  const signals: string[] = [];
  const combinedText = [
    lead.qualificationReason || "",
    ...(Array.isArray(lead.notes) ? lead.notes : []),
  ]
    .join(" ")
    .toLowerCase();

  if (lead.budget || combinedText.includes("budget")) {
    signals.push("Budget confirmed");
  }
  if (
    combinedText.includes("decision") ||
    combinedText.includes("personal residence") ||
    combinedText.includes("buying intent") ||
    combinedText.includes("purchasing") ||
    Number(lead.qualificationScore || 0) >= 85
  ) {
    signals.push("Decision maker");
  }
  if (
    lead.scheduledCall?.scheduledAt ||
    combinedText.includes("schedule") ||
    combinedText.includes("callback") ||
    combinedText.includes("follow-up") ||
    combinedText.includes("site visit") ||
    combinedText.includes("arranging the meeting")
  ) {
    signals.push("Callback / visit requested");
  }
  if (
    lead.timeline ||
    combinedText.includes("90 days") ||
    combinedText.includes("soon") ||
    combinedText.includes("near-term") ||
    combinedText.includes("timeline")
  ) {
    signals.push("Purchase timeline shared");
  }
  if (
    lead.location &&
    lead.location !== "India" &&
    combinedText.length > 0
  ) {
    signals.push("Preferred location captured");
  }
  if (
    signals.length === 0 &&
    (lead.interestLevel === "high" || lead.interestLevel === "medium")
  ) {
    signals.push("Positive AI call sentiment");
  }

  return signals.slice(0, 4);
}

/**
 * Computes an accurate 0–100 qualification score from BOTH stored qualificationScore
 * and extracted AI qualification signals so high-intent leads never show 0 pts.
 */
export function computeEffectiveLeadScore(lead: ScorableLeadInput): number {
  const status = String(lead.qualificationStatus || "new").toLowerCase();
  if (status === "unqualified" || status === "do_not_contact" || status === "lost") {
    return 0;
  }

  const stored = Math.max(0, Math.min(100, Number(lead.qualificationScore || 0)));
  const signals = extractLeadSignals(lead);
  const signalScore = Math.min(
    100,
    signals.reduce((sum, sig) => sum + (SIGNAL_WEIGHTS[sig] ?? 20), 0)
  );

  // If lead has strong signals (e.g. 4 signals = 95 pts), reflect them immediately
  const combined = Math.max(stored, signalScore);
  if (combined > 0) return combined;

  const interest = String(lead.interestLevel || "unknown").toLowerCase();
  if (interest === "high") return 85;
  if (interest === "medium") return 65;
  if (interest === "low") return 25;
  return 0;
}

export function computeLeadBucket(lead: ScorableLeadInput): LeadHeatBucket {
  const status = String(lead.qualificationStatus || "new").toLowerCase();
  const interest = String(lead.interestLevel || "unknown").toLowerCase();
  const score = computeEffectiveLeadScore(lead);

  if (status === "unqualified" || status === "do_not_contact" || status === "lost") {
    return "unqualified";
  }
  if (score >= 75 || interest === "high") {
    return "hot";
  }
  if (
    score >= 45 ||
    interest === "medium" ||
    status === "qualified" ||
    status === "call_scheduled" ||
    status === "in_progress" ||
    status === "assigned" ||
    status === "converted"
  ) {
    return "warm";
  }
  if (score > 0 || interest === "low" || status === "follow_up_required") {
    return "cold";
  }
  return "unqualified";
}

export interface GstBillingBreakdown {
  billableMinutes: number;
  ratePerMinuteInr: number;
  subtotalInr: number;
  gstRatePercent: number;
  gstInr: number;
  totalWithGstInr: number;
  outstandingInr: number;
}

export function calculateBillingWithGst(params: {
  billableMinutes: number;
  ratePerMinuteInr?: number;
  paidInr?: number;
  gstRatePercent?: number;
}): GstBillingBreakdown {
  const billableMinutes = Math.max(0, Math.ceil(Number(params.billableMinutes || 0)));
  const rawRate = Number(params.ratePerMinuteInr);
  const ratePerMinuteInr =
    !Number.isFinite(rawRate) || rawRate <= 0 || rawRate === 3.5 ? 6 : rawRate;
  const gstRatePercent = params.gstRatePercent ?? 18;
  const subtotalInr = Number((billableMinutes * ratePerMinuteInr).toFixed(2));
  const gstInr = Number(((subtotalInr * gstRatePercent) / 100).toFixed(2));
  const totalWithGstInr = Number((subtotalInr + gstInr).toFixed(2));
  const paidInr = Math.max(0, Number(params.paidInr || 0));
  const outstandingInr = Number(Math.max(0, totalWithGstInr - paidInr).toFixed(2));

  return {
    billableMinutes,
    ratePerMinuteInr,
    subtotalInr,
    gstRatePercent,
    gstInr,
    totalWithGstInr,
    outstandingInr,
  };
}
