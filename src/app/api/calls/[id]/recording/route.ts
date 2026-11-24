import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import { requireOrganizationRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import Call from "@/models/Call";
import { getCallById, updateCall } from "@/lib/store";
import { bolnaService } from "@/lib/bolna/client";

function detectAudioMime(url: string, upstreamContentType?: string | null): string {
  if (upstreamContentType && upstreamContentType.startsWith("audio/")) {
    return upstreamContentType;
  }
  const lower = url.toLowerCase();
  if (lower.includes(".wav")) return "audio/wav";
  if (lower.includes(".ogg") || lower.includes(".opus")) return "audio/ogg";
  if (lower.includes(".m4a")) return "audio/mp4";
  return "audio/mpeg";
}

async function fetchUpstreamAudio(url: string, rangeHeader: string | null) {
  const headers: Record<string, string> = {};
  if (rangeHeader) headers["Range"] = rangeHeader;
  // Pass Bolna API key only when fetching directly from Bolna API host
  if (url.includes("bolna.ai") && process.env.BOLNA_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.BOLNA_API_KEY}`;
  }
  return fetch(url, { headers, redirect: "follow" });
}

/**
 * GET /api/calls/[id]/recording
 * Organization-isolated audio proxy that refreshes expired/missing Bolna recording URLs
 * and streams audio with Accept-Ranges: bytes so browser seeking/scrubbing works smoothly.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const { id } = await Promise.resolve(context.params);
    const { searchParams } = new URL(req.url);
    const isDownload = searchParams.get("download") === "1";

    const db = await connectToDatabase();
    let call: any = null;
    if (db) {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const doc = await Call.findById(id).lean();
        if (doc) call = { ...(doc as any), _id: String((doc as any)._id) };
      }
      if (!call) {
        const doc = await Call.findOne({
          $or: [{ bolnaExecutionId: id }, { bolnaCallId: id }],
        }).lean();
        if (doc) call = { ...(doc as any), _id: String((doc as any)._id) };
      }
    }
    if (!call) call = getCallById(id) || null;

    if (!call) {
      return NextResponse.json({ error: "Call record not found" }, { status: 404 });
    }

    // Strict tenant isolation
    if (String(call.organizationId) !== String(rbac.organizationId)) {
      return NextResponse.json(
        { error: "Forbidden", details: "Cross-organization recording access is blocked." },
        { status: 403 }
      );
    }

    let recordingUrl: string = call.recordingUrl || "";
    const execId = call.bolnaExecutionId || call.bolnaCallId;

    const refreshFromBolna = async (): Promise<string> => {
      if (!execId || bolnaService.isMockMode || execId.startsWith("sim_")) return "";
      try {
        const details = await bolnaService.getCallDetails(execId);
        const freshUrl = details?.recording_url || "";
        if (freshUrl) {
          updateCall(call._id, { recordingUrl: freshUrl });
          if (db && mongoose.Types.ObjectId.isValid(call._id)) {
            await Call.findByIdAndUpdate(call._id, {
              $set: { recordingUrl: freshUrl },
            });
          }
        }
        return freshUrl;
      } catch {
        return "";
      }
    };

    if (!recordingUrl) {
      recordingUrl = await refreshFromBolna();
    }

    if (!recordingUrl) {
      return NextResponse.json(
        { error: "No audio recording is available for this call." },
        { status: 404 }
      );
    }

    const rangeHeader = req.headers.get("range");
    let upstream = await fetchUpstreamAudio(recordingUrl, rangeHeader);

    // If signed URL expired (401/403/404/410), refresh once from Bolna and retry
    if (!upstream.ok && [401, 403, 404, 410].includes(upstream.status)) {
      const refreshedUrl = await refreshFromBolna();
      if (refreshedUrl && refreshedUrl !== recordingUrl) {
        recordingUrl = refreshedUrl;
        upstream = await fetchUpstreamAudio(recordingUrl, rangeHeader);
      }
    }

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        {
          error: "Unable to stream recording from telephony provider.",
          upstreamStatus: upstream.status,
        },
        { status: 502 }
      );
    }

    const mime = detectAudioMime(recordingUrl, upstream.headers.get("content-type"));
    const outHeaders = new Headers();
    outHeaders.set("Content-Type", mime);
    outHeaders.set("Accept-Ranges", "bytes");
    outHeaders.set("Cache-Control", "private, max-age=300");

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) outHeaders.set("Content-Length", contentLength);

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) outHeaders.set("Content-Range", contentRange);

    if (isDownload) {
      const ext = mime === "audio/wav" ? "wav" : mime === "audio/ogg" ? "ogg" : "mp3";
      outHeaders.set(
        "Content-Disposition",
        `attachment; filename="call-recording-${call._id}.${ext}"`
      );
    }

    return new NextResponse(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers: outHeaders,
    });
  } catch (err: any) {
    console.error("[GET /api/calls/[id]/recording] error:", err);
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to stream recording") },
      { status: 500 }
    );
  }
}
