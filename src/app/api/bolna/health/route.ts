import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminRole } from "@/lib/rbac";
import { bolnaService } from "@/lib/bolna/client";
import { connectToDatabase } from "@/lib/db";
import { getAgents, getCalls, getSyncState } from "@/lib/store";
import { formatErrorMessage } from "@/lib/error-formatter";

export async function GET(req: NextRequest) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const [engineResult, db] = await Promise.all([
      bolnaService.checkHealth(),
      connectToDatabase(),
    ]);

    const localAgents = getAgents();
    const syncedAgentsCount = localAgents.filter(
      (a) => a.syncStatus === "synced"
    ).length;
    const pendingAgentsCount = localAgents.filter(
      (a) =>
        a.syncStatus === "pending" ||
        a.syncStatus === "failed" ||
        a.syncStatus === "needs_attention"
    ).length;
    const syncState = getSyncState();

    const isGeminiConfigured = Boolean(
      process.env.GEMINI_API_KEY &&
        !process.env.GEMINI_API_KEY.includes("your_google") &&
        process.env.GEMINI_API_KEY.length > 5
    );

    const isEngineConfigured = bolnaService.hasValidApiKey;
    const isEngineLiveConnected = Boolean(
      engineResult.connected && engineResult.mode === "live"
    );

    return NextResponse.json({
      ...engineResult,
      bolnaConfigured: isEngineConfigured,
      bolnaLiveConnected: isEngineLiveConnected,
      bolnaBaseUrl: bolnaService.baseUrl,
      bolnaAgentCount: engineResult.remoteAgentCount ?? localAgents.length,
      geminiConfigured: isGeminiConfigured,
      geminiModel: process.env.GEMINI_MODEL || "gemini-1.5-flash",
      configuredBaseUrl: bolnaService.baseUrl,
      hasApiKey: bolnaService.hasValidApiKey,
      demoModeActive: bolnaService.isMockMode,
      webhookEndpoint: `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/api/webhooks/bolna`,
      mongodbConnected: Boolean(db),
      mongodbStatus: db
        ? "Connected to MongoDB"
        : "In-Memory Fallback Active (Set MONGODB_URI in .env for persistent storage)",
      agentSyncSummary: {
        totalLocalAgents: localAgents.length,
        syncedAgentsCount,
        pendingAgentsCount,
        remoteAgentCount: engineResult.remoteAgentCount ?? 0,
        totalCallsTracked: getCalls().length,
        lastSyncedAt: syncState.lastSyncedAt,
        lastSyncErrors: syncState.errors,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Could not verify system health.") },
      { status: 500 }
    );
  }
}
