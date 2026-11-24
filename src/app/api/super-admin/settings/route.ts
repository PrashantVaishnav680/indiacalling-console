import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import { requireSuperAdminRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import PlatformSettings from "@/models/PlatformSettings";
import AuditLog from "@/models/AuditLog";

const DEFAULT_SETTINGS = {
  key: "global_platform_settings",
  defaultRatePerMinuteInr: 6,
  businessProRateInr: 5.4,
  enterpriseRateInr: 4.8,
  gstPercent: 18,
  upiId: process.env.INDIACALLING_UPI_ID || "payments@indiacalling",
  supportEmail: "support@indiacalling.ai",
  defaultWelcomeBalanceInr: 1000,
  zeroPiiEnforced: true,
  maintenanceMode: false,
};

export async function GET(req: NextRequest) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  const db = await connectToDatabase();
  let settings: any = { ...DEFAULT_SETTINGS };

  if (db) {
    const doc = await PlatformSettings.findOne({ key: "global_platform_settings" }).lean();
    if (doc) {
      settings = { ...DEFAULT_SETTINGS, ...doc, _id: String((doc as any)._id) };
    }
  }

  return NextResponse.json({
    privacyMode: "zero_pii_enforced",
    settings,
  });
}

export async function PATCH(req: NextRequest) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const body = await req.json();
    const updates = {
      defaultRatePerMinuteInr: Math.max(1, Number(body.defaultRatePerMinuteInr ?? 6)),
      businessProRateInr: Math.max(1, Number(body.businessProRateInr ?? 5.4)),
      enterpriseRateInr: Math.max(1, Number(body.enterpriseRateInr ?? 4.8)),
      gstPercent: Math.max(0, Math.min(28, Number(body.gstPercent ?? 18))),
      upiId: String(body.upiId || "payments@indiacalling").trim(),
      supportEmail: String(body.supportEmail || "support@indiacalling.ai").trim(),
      defaultWelcomeBalanceInr: Math.max(0, Number(body.defaultWelcomeBalanceInr ?? 1000)),
      zeroPiiEnforced: true, // Always enforced by platform policy
      maintenanceMode: Boolean(body.maintenanceMode),
      updatedBy: rbac.session.email,
      updatedAt: new Date(),
    };

    const db = await connectToDatabase();
    let saved: any = { ...DEFAULT_SETTINGS, ...updates };

    if (db) {
      const doc = await PlatformSettings.findOneAndUpdate(
        { key: "global_platform_settings" },
        { $set: updates, $setOnInsert: { key: "global_platform_settings" } },
        { new: true, upsert: true }
      ).lean();
      if (doc) saved = { ...doc, _id: String((doc as any)._id) };

      await AuditLog.create({
        action: "Platform Settings Updated",
        category: "settings",
        actorEmail: rbac.session.email,
        actorName: rbac.session.name || "Super Admin",
        targetOrgName: "Global Platform",
        details: `Rate ₹${updates.defaultRatePerMinuteInr}/min, GST ${updates.gstPercent}%, UPI ${updates.upiId}, Maintenance: ${updates.maintenanceMode ? "ON" : "OFF"}`,
      });
    }

    return NextResponse.json({
      success: true,
      settings: saved,
      message: "Platform settings saved.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to save platform settings") },
      { status: 500 }
    );
  }
}
