import { NextRequest, NextResponse } from "next/server";
import { requireOrganizationRole } from "@/lib/rbac";
import { getVisibleCuratedVoices } from "@/lib/voice-registry";

/**
 * GET /api/bolna/voices
 * Returns verified voices from the user's live Bolna account (`GET /api/v1/voice-config/tts/voices`)
 * merged with our Bolna-docs-verified curated catalog as a reliable fallback.
 */
export async function GET(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const curated = getVisibleCuratedVoices(false);
  const apiKey = (process.env.BOLNA_API_KEY || "").trim();
  const baseUrl = (process.env.BOLNA_BASE_URL || "https://api.bolna.ai")
    .trim()
    .replace(/\/$/, "");

  if (!apiKey) {
    return NextResponse.json({
      source: "curated",
      voices: curated,
    });
  }

  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider") || "";
    const model = searchParams.get("model") || "";

    const qs = new URLSearchParams();
    if (provider) qs.set("provider", provider);
    if (model) qs.set("model", model);

    const url = `${baseUrl}/api/v1/voice-config/tts/voices${qs.toString() ? `?${qs.toString()}` : ""}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({
        source: "curated_fallback",
        voices: curated,
      });
    }

    const raw = await res.json();
    const list: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.voices)
      ? raw.voices
      : [];

    const liveVoices = list
      .filter((v) => v && (v.voice_id || v.id) && (v.name || v.voice))
      .slice(0, 40)
      .map((v, idx) => ({
        id: `bolna_live_${v.voice_id || v.id}_${idx}`,
        voiceId: String(v.voice_id || v.id),
        name: String(v.name || v.voice),
        provider: String(v.provider || provider || "elevenlabs").toLowerCase(),
        model: String(v.model || model || (String(v.provider || "").toLowerCase() === "sarvam" ? "bulbul:v3" : "eleven_turbo_v2_5")),
        gender: String(v.gender || "Female"),
        accent: String(v.accent || "Verified Bolna Voice"),
        languages: Array.isArray(v.languages) ? v.languages : ["English + Hindi"],
        description: String(v.description || "Live voice synced directly from your Bolna account."),
        status: "active" as const,
        visible: true,
      }));

    return NextResponse.json({
      source: liveVoices.length > 0 ? "bolna_live" : "curated_fallback",
      voices: liveVoices.length > 0 ? liveVoices : curated,
      curatedFallback: curated,
    });
  } catch {
    return NextResponse.json({
      source: "curated_fallback",
      voices: curated,
    });
  }
}
