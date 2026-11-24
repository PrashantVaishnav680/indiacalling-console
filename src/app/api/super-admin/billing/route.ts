import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import { requireSuperAdminRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import Organization from "@/models/Organization";
import Call from "@/models/Call";
import AuditLog from "@/models/AuditLog";
import { getOrganizations, getCalls } from "@/lib/store";
import { calculateBillingWithGst } from "@/lib/call-scheduling";

/**
 * GET /api/super-admin/billing
 * Platform-wide revenue, 18% GST, and per-org billing (Zero-PII).
 */
export async function GET(req: NextRequest) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  const db = await connectToDatabase();
  let orgs: any[] = getOrganizations();
  let calls: any[] = getCalls();

  if (db) {
    const [dbOrgs, dbCalls] = await Promise.all([
      Organization.find({}).sort({ createdAt: -1 }).lean(),
      Call.find({ direction: { $ne: "web_call" } })
        .select("_id organizationId durationSeconds")
        .lean(),
    ]);
    if (dbOrgs.length > 0) {
      orgs = dbOrgs.map((o: any) => ({ ...o, _id: String(o._id) }));
    }
    if (dbCalls.length > 0) calls = dbCalls;
  }

  let totalRevenueInr = 0;
  let totalGstInr = 0;
  let totalUnbilledInr = 0;
  let totalDueInr = 0;
  let totalWalletBalanceInr = 0;
  let totalBilledMinutes = 0;
  const pendingTopUps: any[] = [];
  const recentTopUps: any[] = [];

  const organizationBilling = orgs.map((org) => {
    const orgIdStr = String(org._id);
    const orgCalls = calls.filter((c) => String(c.organizationId) === orgIdStr);
    const secs = orgCalls.reduce((acc, c) => acc + (Number(c.durationSeconds) || 0), 0);
    const minutes = Math.ceil(secs / 60);
    const rawRate = org.billing?.ratePerMinuteInr;
    const rate = !rawRate || rawRate === 3.5 ? 6 : rawRate;
    const invoices = Array.isArray(org.billing?.invoices) ? org.billing.invoices : [];
    const paidInr = invoices
      .filter((inv: any) => inv.type === "usage" && inv.status === "paid")
      .reduce((s: number, inv: any) => s + (Number(inv.amountInr) || 0), 0);

    const gst = calculateBillingWithGst({
      billableMinutes: minutes,
      ratePerMinuteInr: rate,
      paidInr,
      gstRatePercent: 18,
    });

    const balanceInr = Number((org.billing?.balanceInr ?? 2500).toFixed(2));

    for (const inv of invoices) {
      if (inv.type === "topup") {
        recentTopUps.push({
          organizationId: orgIdStr,
          organizationName: org.name,
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amountInr: Number(inv.amountInr || 0),
          status: inv.status || "paid",
          description: inv.description || "Wallet Credit Top-Up",
          issuedAt: inv.issuedAt,
        });
      }
    }

    totalRevenueInr += gst.subtotalInr;
    totalGstInr += gst.gstInr;
    totalUnbilledInr += gst.subtotalInr;
    totalDueInr += gst.outstandingInr;
    totalWalletBalanceInr += balanceInr;
    totalBilledMinutes += minutes;

    return {
      organizationId: orgIdStr,
      organizationName: org.name,
      slug: org.slug,
      industry: org.industry || "General Business",
      status: org.status === "inactive" ? "suspended" : org.status || "active",
      planName: org.billing?.planName || "Growth Pay-As-You-Go",
      ratePerMinuteInr: gst.ratePerMinuteInr,
      totalCalls: orgCalls.length,
      totalMinutes: minutes,
      totalSpendInr: gst.subtotalInr,
      gstInr: gst.gstInr,
      totalWithGstInr: gst.totalWithGstInr,
      unbilledInr: gst.subtotalInr,
      dueInr: gst.outstandingInr,
      balanceInr,
      billingStatus: gst.outstandingInr > 0 ? "due" : "settled",
    };
  });

  return NextResponse.json({
    privacyMode: "zero_pii_enforced",
    summary: {
      totalRevenueInr: Number(totalRevenueInr.toFixed(2)),
      totalGstInr: Number(totalGstInr.toFixed(2)),
      totalGrossRevenueInr: Number((totalRevenueInr + totalGstInr).toFixed(2)),
      totalUnbilledInr: Number(totalUnbilledInr.toFixed(2)),
      totalDueInr: Number(totalDueInr.toFixed(2)),
      totalWalletBalanceInr: Number(totalWalletBalanceInr.toFixed(2)),
      totalBilledMinutes,
      organizationsCount: organizationBilling.length,
      pendingTopUpsCount: pendingTopUps.length,
    },
    recentTopUps: recentTopUps.sort((a, b) => new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime()).slice(0, 25),
    pendingTopUps,
    organizationBilling,
  });
}

/**
 * POST /api/super-admin/billing
 * Real Super Admin billing controls:
 * - `approve_topup`: Marks pending UPI/UTR invoice as paid & credits org wallet
 * - `reject_topup`: Marks pending UPI/UTR invoice as failed
 * - `adjust_credit`: Credits/adjusts org wallet with an audit trail
 */
export async function POST(req: NextRequest) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const body = await req.json();
    const action = String(body.action || "");
    const orgId = String(body.organizationId || "");
    if (!orgId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ error: "Database connection required" }, { status: 503 });
    }

    const filter = mongoose.Types.ObjectId.isValid(orgId)
      ? { _id: orgId }
      : { $or: [{ _id: orgId }, { slug: orgId }] };
    const org: any = await Organization.findOne(filter).lean();
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const currentBalance = Number(org.billing?.balanceInr ?? 2500);
    const invoices: any[] = Array.isArray(org.billing?.invoices) ? [...org.billing.invoices] : [];

    if (action === "approve_topup" || action === "reject_topup") {
      const invoiceId = String(body.invoiceId || "");
      const idx = invoices.findIndex((inv) => inv.id === invoiceId);
      if (idx === -1) {
        return NextResponse.json({ error: "Pending top-up request not found" }, { status: 404 });
      }
      const target = invoices[idx];
      const amount = Number(target.amountInr || 0);
      const nextBalance =
        action === "approve_topup"
          ? Number((currentBalance + amount).toFixed(2))
          : currentBalance;

      invoices[idx] = {
        ...target,
        status: action === "approve_topup" ? "paid" : "failed",
      };

      await Organization.updateOne(filter, {
        $set: { "billing.balanceInr": nextBalance, "billing.invoices": invoices },
      });

      await AuditLog.create({
        action: action === "approve_topup" ? "UPI Top-Up Approved" : "UPI Top-Up Rejected",
        category: "billing",
        actorEmail: rbac.session.email,
        actorName: rbac.session.name || "Super Admin",
        targetOrgId: String(org._id),
        targetOrgName: org.name,
        details: `${action === "approve_topup" ? "Credited" : "Rejected"} ₹${amount.toFixed(2)} (Invoice ${target.invoiceNumber}). New balance: ₹${nextBalance.toFixed(2)}.`,
      });

      return NextResponse.json({
        success: true,
        message:
          action === "approve_topup"
            ? `Approved ₹${amount.toFixed(2)} and credited ${org.name}'s wallet.`
            : `Rejected top-up request for ${org.name}.`,
        balanceInr: nextBalance,
      });
    }

    if (action === "adjust_credit") {
      const amount = Number(body.amountInr || 0);
      const reason = String(body.reason || "Admin credit adjustment").trim();
      if (!Number.isFinite(amount) || amount === 0) {
        return NextResponse.json({ error: "Enter a non-zero credit amount" }, { status: 400 });
      }
      const nextBalance = Number(Math.max(0, currentBalance + amount).toFixed(2));
      invoices.unshift({
        id: `inv_adj_${Date.now()}`,
        invoiceNumber: `IC-ADJ-${String(Date.now()).slice(-6)}`,
        periodLabel: new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
        amountInr: Math.abs(amount),
        minutesBilled: 0,
        status: "paid",
        issuedAt: new Date().toISOString(),
        type: "topup",
        description: `Admin Credit Adjustment: ${reason}`,
      });

      await Organization.updateOne(filter, {
        $set: { "billing.balanceInr": nextBalance, "billing.invoices": invoices },
      });

      await AuditLog.create({
        action: "Wallet Credit Adjusted",
        category: "billing",
        actorEmail: rbac.session.email,
        actorName: rbac.session.name || "Super Admin",
        targetOrgId: String(org._id),
        targetOrgName: org.name,
        details: `${amount > 0 ? "+" : "-"}₹${Math.abs(amount).toFixed(2)} (${reason}). New balance: ₹${nextBalance.toFixed(2)}.`,
      });

      return NextResponse.json({
        success: true,
        message: `Updated ${org.name}'s wallet balance to ₹${nextBalance.toFixed(2)}.`,
        balanceInr: nextBalance,
      });
    }

    return NextResponse.json({ error: "Unsupported billing action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to execute billing action") },
      { status: 500 }
    );
  }
}
