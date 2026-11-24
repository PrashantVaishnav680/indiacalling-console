import { NextRequest, NextResponse } from "next/server";
import { requireOrganizationRole } from "@/lib/rbac";
import { bolnaService } from "@/lib/bolna/client";

/**
 * GET /api/bolna/phone-numbers
 * Dynamically fetches active/purchased Bolna phone numbers & trunks (`GET /phone-numbers/all`).
 * Falls back cleanly to an empty list so the UI uses Bolna Default Route.
 */
export async function GET(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const numbers = await bolnaService.listPhoneNumbers();
  return NextResponse.json({
    phoneNumbers: numbers,
    hasLiveApiKey: bolnaService.hasValidApiKey && !bolnaService.isMockMode,
  });
}
