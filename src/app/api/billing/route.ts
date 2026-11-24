import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import crypto from "crypto";
import { requireOrganizationRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import Organization from "@/models/Organization";
import PlatformSettings from "@/models/PlatformSettings";
import { logAuditEvent } from "@/lib/audit";
import Call from "@/models/Call";
import Agent from "@/models/Agent";
import {
  getOrganizationById,
  updateOrganization,
  getCalls,
  getAgents,
} from "@/lib/store";
import { IBillingInvoice } from "@/types";
import { calculateBillingWithGst } from "@/lib/call-scheduling";
import { formatErrorMessage } from "@/lib/error-formatter";
import UsageLedger from "@/models/UsageLedger";

export const DEFAULT_RATE_PER_MINUTE_INR = 6;

export function verifyRazorpaySignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret: string;
}): boolean {
  if (!params.orderId || !params.paymentId || !params.signature || !params.secret) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", params.secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");
  return expected === params.signature;
}

export async function GET(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const orgId = rbac.organizationId;
  const db = await connectToDatabase();

  let org: any = getOrganizationById(orgId);
  let globalSettings: any = null;
  let calls = getCalls().filter((c) => String(c.organizationId) === String(orgId));
  let agents = getAgents().filter((a) => String(a.organizationId) === String(orgId));

  if (db) {
    const [dbOrg, dbCalls, dbAgents, dbPlatformSettings] = await Promise.all([
      mongoose.Types.ObjectId.isValid(orgId)
        ? Organization.findById(orgId).lean()
        : Organization.findOne({
            $or: [
              { _id: orgId },
              { slug: orgId },
              ...(orgId === "org_default_01" ? [{ slug: "indiacalling-org" }] : []),
            ],
          }).lean(),
      Call.find({ organizationId: orgId }).lean(),
      Agent.find({ organizationId: orgId }).lean(),
      PlatformSettings.findOne({ key: "global_platform_settings" }).lean(),
    ]);
    if (dbOrg) org = { ...dbOrg, _id: String((dbOrg as any)._id) };
    if (dbPlatformSettings) globalSettings = dbPlatformSettings;
    if (dbCalls.length > 0) {
      calls = dbCalls.map((c: any) => ({ ...c, _id: String(c._id) }));
    }
    if (dbAgents.length > 0) {
      agents = dbAgents.map((a: any) => ({ ...a, _id: String(a._id) }));
    }
  }

  // Upgrade legacy 3.5 default rate cleanly to ₹6/min
  const storedRate = org?.billing?.ratePerMinuteInr;
  const ratePerMinuteInr =
    !storedRate || storedRate === 3.5 ? DEFAULT_RATE_PER_MINUTE_INR : storedRate;

  // Strictly scope calls to THIS organization owned agents (exclude foreign agents, web_call, and simulated calls)
  const orgAgentIdSet = new Set(agents.map((a: any) => String(a._id)));
  const orgBolnaAgentIdSet = new Set(
    agents.map((a: any) => String(a.bolnaAgentId || "")).filter(Boolean)
  );
  calls = calls.filter((c: any) => {
    if (c.direction === "web_call" || c.isSimulated) return false;
    if (orgAgentIdSet.size === 0) return false;
    return (
      orgAgentIdSet.has(String(c.agentId || "")) ||
      (c.bolnaAgentId && orgBolnaAgentIdSet.has(String(c.bolnaAgentId)))
    );
  });
  const totalSeconds = calls.reduce(
    (sum, c) => sum + (Number(c.durationSeconds) || 0),
    0
  );
  const totalMinutes = Math.ceil(totalSeconds / 60);
  const totalSpendInr = Number((totalMinutes * ratePerMinuteInr).toFixed(2));
  const balanceInr = Number(
    (org?.billing?.balanceInr ?? Math.max(2500 - totalSpendInr, 0)).toFixed(2)
  );
  const paidUsageInr = (Array.isArray(org?.billing?.invoices) ? org.billing.invoices : [])
    .filter((inv: any) => inv.type === "usage" && inv.status === "paid")
    .reduce((sum: number, inv: any) => sum + (Number(inv.amountInr) || 0), 0);
  const unbilledInr = Number(Math.max(0, totalSpendInr - paidUsageInr).toFixed(2));
  const dueInr = Number((org?.billing?.dueInr ?? 0).toFixed(2));
  const planName = org?.billing?.planName || "Growth Pay-As-You-Go";

  const agentBreakdown = agents.map((agent) => {
    const agentCalls = calls.filter(
      (c) => String(c.agentId) === String(agent._id)
    );
    const secs = agentCalls.reduce(
      (sum, c) => sum + (Number(c.durationSeconds) || 0),
      0
    );
    const mins = Math.ceil(secs / 60);
    return {
      agentId: String(agent._id),
      agentName: agent.name,
      callCount: agentCalls.length,
      minutes: mins,
      spendInr: Number((mins * ratePerMinuteInr).toFixed(2)),
    };
  });

  const existingInvoices: IBillingInvoice[] = (Array.isArray(
    org?.billing?.invoices
  )
    ? org.billing.invoices
    : []
  ).map((inv: any) => {
    if (inv.type === "usage" && Number(inv.minutesBilled) > 0) {
      return {
        ...inv,
        amountInr: Number((Number(inv.minutesBilled) * ratePerMinuteInr).toFixed(2)),
      };
    }
    return inv;
  });

  const invoices: IBillingInvoice[] =
    existingInvoices.length > 0
      ? existingInvoices
      : [
          {
            id: "inv_cycle_current",
            invoiceNumber: `IC-${new Date().getFullYear()}-${String(
              new Date().getMonth() + 1
            ).padStart(2, "0")}01`,
            periodLabel: new Date().toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
            }),
            amountInr: totalSpendInr,
            minutesBilled: totalMinutes,
            status: dueInr > 0 ? "due" : "paid",
            issuedAt: new Date().toISOString(),
            type: "usage",
            description: "Voice AI Telephony & Inference Usage",
          },
        ];

  const razorpayConfigured = Boolean(
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  );

  const gstBreakdown = calculateBillingWithGst({
    billableMinutes: totalMinutes,
    ratePerMinuteInr,
    paidInr: paidUsageInr,
    gstRatePercent: Number(globalSettings?.gstPercent ?? 18),
  });

  const walletLedger = [
    ...calls.slice(0, 20).map((c: any) => {
      const mins = Math.max(1, Math.ceil((Number(c.durationSeconds) || 0) / 60));
      const amt = Number((mins * ratePerMinuteInr).toFixed(2));
      return {
        id: `debit_${c._id}`,
        type: "debit" as const,
        description: `AI Call Usage (${mins} min @ ₹${ratePerMinuteInr}/min)`,
        amountInr: amt,
        status: "completed",
        createdAt: c.startedAt || c.createdAt || new Date().toISOString(),
      };
    }),
    ...invoices
      .filter((inv: any) => inv.type === "topup")
      .map((inv: any) => ({
        id: `credit_${inv.id}`,
        type: "credit" as const,
        description: inv.description || "Wallet Credit Top-Up",
        amountInr: Number(inv.amountInr || 0),
        status: inv.status,
        createdAt: inv.issuedAt,
      })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({
    billing: {
      organizationId: orgId,
      organizationName: org?.name || rbac.session.workspaceName || "Organization",
      planName,
      balanceInr,
      ratePerMinuteInr,
      totalCalls: calls.length,
      totalMinutes,
      totalSpendInr,
      subtotalInr: gstBreakdown.subtotalInr,
      gstRatePercent: gstBreakdown.gstRatePercent,
      gstInr: gstBreakdown.gstInr,
      totalWithGstInr: gstBreakdown.totalWithGstInr,
      outstandingInr: gstBreakdown.outstandingInr,
      unbilledInr,
      dueInr,
      renewalDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      agentBreakdown,
      walletLedger,
      invoices,
      paymentGateway: {
        razorpayConfigured,
        razorpayKeyId: razorpayConfigured ? process.env.RAZORPAY_KEY_ID : null,
        upiId: globalSettings?.upiId || process.env.INDIACALLING_UPI_ID || "payments@indiacalling",
      },
    },
  });
}

/**
 * POST /api/billing
 * Supported actions:
 * 1. `add_wallet_credits`: Immediately credits the organization's wallet (min ₹500), records a paid invoice + UsageLedger credit, and writes an audit event.
 * 2. `verify_razorpay_payment`: Cryptographically verifies Razorpay HMAC-SHA256 signature before crediting wallet.
 * 3. `change_plan`: Switches calling plan rate.
 */
export async function POST(req: NextRequest) {
  try {
    const rbac = requireOrganizationRole(req);
    if (!rbac.ok) return rbac.response;

    const orgId = rbac.organizationId;
    const body = await req.json();
    const action = String(body.action || "");

    const db = await connectToDatabase();
    let org: any = getOrganizationById(orgId);
    if (db) {
      const dbOrg = mongoose.Types.ObjectId.isValid(orgId)
        ? await Organization.findById(orgId).lean()
        : await Organization.findOne({
            $or: [
              { _id: orgId },
              { slug: orgId },
              ...(orgId === "org_default_01" ? [{ slug: "indiacalling-org" }] : []),
            ],
          }).lean();
      if (dbOrg) org = { ...dbOrg, _id: String((dbOrg as any)._id) };
    }

    const currentBilling = org?.billing || {
      planName: "Growth Pay-As-You-Go",
      balanceInr: 2500,
      ratePerMinuteInr: DEFAULT_RATE_PER_MINUTE_INR,
      unbilledInr: 0,
      dueInr: 0,
      invoices: [],
    };

    const nextInvoices: any[] = [
      ...(Array.isArray(currentBilling.invoices) ? currentBilling.invoices : []),
    ];

    let nextBalance = Number(currentBilling.balanceInr || 0);
    let nextPlan = currentBilling.planName || "Growth Pay-As-You-Go";
    let nextRate =
      currentBilling.ratePerMinuteInr === 3.5
        ? DEFAULT_RATE_PER_MINUTE_INR
        : currentBilling.ratePerMinuteInr || DEFAULT_RATE_PER_MINUTE_INR;

    let responseMessage = "";

    if (action === "add_wallet_credits" || action === "topup") {
      const amountInr = Number(body.amountInr || 0);

      if (!Number.isFinite(amountInr) || amountInr < 500 || amountInr > 500000) {
        return NextResponse.json(
          { error: "Top-up amount must be between ₹500 and ₹5,00,000." },
          { status: 400 }
        );
      }

      const invoiceId = `inv_topup_${Date.now().toString(36)}`;
      const invoiceNumber = `IC-WLT-${Date.now().toString().slice(-6)}`;
      const nowIso = new Date().toISOString();

      nextBalance = Number((nextBalance + amountInr).toFixed(2));
      nextInvoices.unshift({
        id: invoiceId,
        invoiceNumber,
        periodLabel: new Date().toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        amountInr,
        minutesBilled: Math.floor(amountInr / nextRate),
        status: "paid",
        issuedAt: nowIso,
        paidAt: nowIso,
        type: "topup",
        paymentReference: invoiceNumber,
        description: `Wallet Credit Top-Up (${invoiceNumber})`,
      });

      if (db) {
        try {
          await UsageLedger.create({
            organizationId: org?._id || orgId,
            type: "credit",
            category: "wallet_topup",
            amountInr,
            balanceAfterInr: nextBalance,
            description: `Added ₹${amountInr.toLocaleString("en-IN")} to wallet (${invoiceNumber})`,
            referenceId: invoiceId,
          });
        } catch {
          // UsageLedger schema may vary; Organization billing invoice remains primary source
        }
      }

      responseMessage = `Added ₹${amountInr.toLocaleString("en-IN")} to your wallet. New balance: ₹${nextBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
    } else if (action === "verify_razorpay_payment") {
      const amountInr = Number(body.amountInr || 0);
      const orderId = String(body.razorpay_order_id || "");
      const paymentId = String(body.razorpay_payment_id || "");
      const signature = String(body.razorpay_signature || "");
      const secret = process.env.RAZORPAY_KEY_SECRET || "";

      if (!secret) {
        return NextResponse.json(
          {
            error: "Razorpay Not Configured",
            details:
              "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local to enable Razorpay Test/Live verification.",
          },
          { status: 503 }
        );
      }

      const validSig = verifyRazorpaySignature({
        orderId,
        paymentId,
        signature,
        secret,
      });

      if (!validSig) {
        return NextResponse.json(
          { error: "Invalid Razorpay payment signature. Wallet was not credited." },
          { status: 400 }
        );
      }

      nextBalance = Number((nextBalance + amountInr).toFixed(2));
      nextInvoices.unshift({
        id: `inv_rzp_${Date.now().toString(36)}`,
        invoiceNumber: `IC-RZP-${Date.now().toString().slice(-6)}`,
        periodLabel: new Date().toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        amountInr,
        minutesBilled: Math.floor(amountInr / nextRate),
        status: "paid",
        issuedAt: new Date().toISOString(),
        paidAt: new Date().toISOString(),
        type: "topup",
        paymentReference: paymentId,
        description: `Verified Razorpay Credit Top-Up (${paymentId})`,
      });
      responseMessage = `Verified Razorpay payment (${paymentId}). Added ₹${amountInr.toLocaleString("en-IN")} to your wallet.`;
    } else if (action === "change_plan" && body.planName) {
      nextPlan = String(body.planName).trim();
      nextRate =
        nextPlan === "Enterprise Scale"
          ? 4.8
          : nextPlan === "Business Pro"
          ? 5.4
          : DEFAULT_RATE_PER_MINUTE_INR;
      responseMessage = `Plan updated to ${nextPlan} (₹${nextRate.toFixed(2)}/min).`;
    } else {
      return NextResponse.json(
        { error: "Unsupported billing action." },
        { status: 400 }
      );
    }

    const updatedBilling = {
      ...currentBilling,
      planName: nextPlan,
      balanceInr: nextBalance,
      ratePerMinuteInr: nextRate,
      invoices: nextInvoices,
    };

    if (db) {
      const targetFilter = org?._id && mongoose.Types.ObjectId.isValid(String(org._id))
        ? { _id: new mongoose.Types.ObjectId(String(org._id)) }
        : {
            $or: [
              { _id: orgId },
              { slug: orgId },
              ...(orgId === "org_default_01" ? [{ slug: "indiacalling-org" }] : []),
            ],
          };
      const updatedRes = await Organization.findOneAndUpdate(
        targetFilter,
        { $set: { billing: updatedBilling } },
        { new: true }
      );
      if (!updatedRes) {
        // Ensure org document exists in MongoDB if running on fresh DB
        await Organization.findOneAndUpdate(
          { slug: orgId === "org_default_01" ? "indiacalling-org" : orgId },
          {
            $set: { billing: updatedBilling },
            $setOnInsert: {
              name: rbac.session.workspaceName || "IndiaCalling Workspace",
              email: rbac.session.email,
              status: "active",
            },
          },
          { upsert: true }
        );
      }
    }

    updateOrganization(orgId, { billing: updatedBilling } as any);

    await logAuditEvent({
      action: action === "change_plan" ? "Subscription Plan Updated" : "Wallet Credits Added",
      category: "billing",
      actorEmail: rbac.session.email,
      actorName: rbac.session.name,
      targetOrgId: orgId,
      targetOrgName: org?.name || rbac.session.workspaceName,
      details: responseMessage || `Billing action: ${action}`,
    });

    return NextResponse.json({
      success: true,
      billing: updatedBilling,
      message: responseMessage,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Could not complete your billing update.") },
      { status: 500 }
    );
  }
}
