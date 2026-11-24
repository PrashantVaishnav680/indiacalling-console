import mongoose from "mongoose";
import Organization from "@/models/Organization";
import UsageLedger from "@/models/UsageLedger";

export const LOW_BALANCE_THRESHOLD_INR = 250;

export interface WalletDeductionResult {
  deducted: boolean;
  alreadyBilled?: boolean;
  billedMinutes: number;
  subtotalInr: number;
  gstInr: number;
  totalCostInr: number;
  remainingBalanceInr: number;
  lowBalanceWarning: boolean;
  paymentRequired: boolean;
}

/**
 * Pure calculation helper for call usage billing (per-minute ceiling + 18% GST).
 */
export function computeCallUsageCharge(params: {
  durationSeconds: number;
  ratePerMinuteInr?: number;
  gstPercent?: number;
}): {
  billedMinutes: number;
  subtotalInr: number;
  gstInr: number;
  totalCostInr: number;
} {
  const secs = Math.max(0, Number(params.durationSeconds || 0));
  if (secs <= 0) {
    return { billedMinutes: 0, subtotalInr: 0, gstInr: 0, totalCostInr: 0 };
  }
  const billedMinutes = Math.ceil(secs / 60);
  const rate = Math.max(1, Number(params.ratePerMinuteInr || 6));
  const gstPct = Math.max(0, Number(params.gstPercent ?? 18));
  const subtotalInr = Number((billedMinutes * rate).toFixed(2));
  const gstInr = Number(((subtotalInr * gstPct) / 100).toFixed(2));
  const totalCostInr = Number((subtotalInr + gstInr).toFixed(2));
  return { billedMinutes, subtotalInr, gstInr, totalCostInr };
}

/**
 * Idempotently deducts billable call usage from an Organization's wallet balance.
 * NEVER auto-charges an external bank/card — payments/top-ups are only initiated
 * when the organization explicitly approves a UPI/UTR or Razorpay top-up.
 */
export async function deductCallUsageFromWallet(params: {
  organizationId: string;
  callId: string;
  agentId?: string;
  durationSeconds: number;
}): Promise<WalletDeductionResult | null> {
  const secs = Math.max(0, Number(params.durationSeconds || 0));
  if (!params.organizationId || !params.callId || secs <= 0) {
    return null;
  }

  // Idempotency check: skip if this call was already billed in UsageLedger
  const existing = await UsageLedger.findOne({
    organizationId: params.organizationId,
    callId: params.callId,
    billedFromWallet: true,
  }).lean();
  if (existing) {
    return {
      deducted: false,
      alreadyBilled: true,
      billedMinutes: Number((existing as any).minutesBilled || 0),
      subtotalInr: Number((existing as any).cost || 0),
      gstInr: 0,
      totalCostInr: Number((existing as any).cost || 0),
      remainingBalanceInr: 0,
      lowBalanceWarning: false,
      paymentRequired: false,
    };
  }

  const orgFilter = mongoose.Types.ObjectId.isValid(params.organizationId)
    ? { _id: new mongoose.Types.ObjectId(params.organizationId) }
    : { $or: [{ _id: params.organizationId }, { slug: params.organizationId }] };

  const org: any = await Organization.findOne(orgFilter).lean();
  if (!org) return null;

  const rate = Number(org.billing?.ratePerMinuteInr || 6);
  const charge = computeCallUsageCharge({
    durationSeconds: secs,
    ratePerMinuteInr: rate,
    gstPercent: 18,
  });

  const currentBalance = Number(org.billing?.balanceInr ?? 1000);
  const nextBalance = Number(Math.max(0, currentBalance - charge.totalCostInr).toFixed(2));
  const shortfall = Number(Math.max(0, charge.totalCostInr - currentBalance).toFixed(2));
  const nextDue = Number(((Number(org.billing?.dueInr || 0)) + shortfall).toFixed(2));

  await Organization.findOneAndUpdate(orgFilter, {
    $set: {
      "billing.balanceInr": nextBalance,
      "billing.dueInr": nextDue,
    },
  });

  await UsageLedger.findOneAndUpdate(
    { organizationId: params.organizationId, callId: params.callId },
    {
      $set: {
        organizationId: params.organizationId,
        callId: params.callId,
        agentId: params.agentId || "",
        durationSeconds: secs,
        minutesBilled: charge.billedMinutes,
        cost: charge.totalCostInr,
        billedFromWallet: true,
        timestamp: new Date(),
      },
    },
    { upsert: true }
  );

  return {
    deducted: true,
    ...charge,
    remainingBalanceInr: nextBalance,
    lowBalanceWarning: nextBalance > 0 && nextBalance < LOW_BALANCE_THRESHOLD_INR,
    paymentRequired: nextBalance <= 0,
  };
}
