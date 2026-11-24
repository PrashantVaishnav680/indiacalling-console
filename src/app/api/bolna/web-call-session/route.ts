import { requireOrganizationRole, assertTenantOwnership } from "@/lib/rbac";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getAgentById } from "@/lib/store";
import { connectToDatabase } from "@/lib/db";
import Agent from "@/models/Agent";
import { bolnaService, resolveIsoLanguageCode } from "@/lib/bolna/client";
import mongoose from "mongoose";

/**
 * POST /api/bolna/web-call-session
 * Server-side session-minting endpoint for the official Bolna Web-Call SDK (`@bolna/web-call` v3.0.1).
 * Mints a short-lived (~120s), single-use WebRTC session token using the server's BOLNA_API_KEY
 * so the API key is NEVER exposed in browser JavaScript.
 */
export async function POST(req: NextRequest) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  try {
    const session = getSessionFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const requestedAgentId = body.agentId || body.agent_id;
    let bolnaAgentId = body.bolnaAgentId || body.bolna_agent_id;
    let language = body.language || "en";

    if (requestedAgentId && !bolnaAgentId) {
      let agent = getAgentById(requestedAgentId);
      if (!agent) {
        const db = await connectToDatabase();
        if (db && mongoose.Types.ObjectId.isValid(requestedAgentId)) {
          const doc = await Agent.findById(requestedAgentId).lean();
          if (doc) agent = doc as any;
        }
      }
      if (agent) {
        bolnaAgentId = agent.bolnaAgentId;
        language = resolveIsoLanguageCode(agent.language);
      }
    }

    if (!bolnaAgentId) {
      return NextResponse.json(
        {
          error: "Agent Not Synced With Bolna",
          details:
            "This agent does not have a synced Bolna Agent ID yet. Click 'Sync Now' or save the agent with a valid BOLNA_API_KEY first.",
        },
        { status: 400 }
      );
    }

    const sessionResult = await bolnaService.mintWebCallSession({
      bolnaAgentId,
      agentId: bolnaAgentId,
      userData: {
        organization_id: session?.organizationId || "org_default_01",
        user_id: session?.userId || "user_admin_01",
        source: "indiacalling_console_browser_voice_test",
        ...(body.userData || body.user_data || {}),
      },
      language: resolveIsoLanguageCode(language),
    });

    return NextResponse.json({
      ...sessionResult,
      bolnaAgentId,
      mode: bolnaService.isMockMode ? "simulated" : "live",
    });
  } catch (error: any) {
    console.error("Failed to mint Bolna Web-Call session:", error);
    return NextResponse.json(
      {
        error: "Browser Voice Session Failed",
        details:
          error?.message ||
          "Could not mint a WebRTC browser voice session with Bolna AI.",
      },
      { status: 502 }
    );
  }
}
