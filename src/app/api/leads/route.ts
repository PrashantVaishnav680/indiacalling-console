import { requireOrganizationRole } from "@/lib/rbac";
import { formatErrorMessage } from "@/lib/error-formatter";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSessionFromRequest, isAuthorizedRole } from "@/lib/auth";
import { getLeads, addLead, getCalls } from "@/lib/store";
import { leadSchema } from "@/schemas";
import { connectToDatabase } from "@/lib/db";
import Lead from "@/models/Lead";
import Call from "@/models/Call";
import { normalizeIndianPhoneE164 } from "@/lib/bolna/client";
import {
  computeEffectiveLeadScore,
  computeLeadBucket,
  extractLeadSignals,
} from "@/lib/call-scheduling";

export async function GET(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const orgId = rbac.organizationId || "org_default_01";
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const interest = searchParams.get("interest");
  const bucket = searchParams.get("bucket");
  const query = searchParams.get("q")?.toLowerCase();

  const db = await connectToDatabase();
  let leads: any[] = [];
  let calls: any[] = [];

  if (db) {
    const [dbLeads, dbCalls] = await Promise.all([
      Lead.find({ organizationId: orgId }).sort({ createdAt: -1 }).lean(),
      Call.find({ organizationId: orgId }).sort({ startedAt: -1, createdAt: -1 }).lean(),
    ]);
    leads = dbLeads.map((l: any) => ({ ...l, _id: String(l._id) }));
    calls = dbCalls.map((c: any) => ({ ...c, _id: String(c._id) }));
    for (const l of leads) {
      addLead(l);
    }
  } else {
    leads = getLeads().filter(
      (l) => String(l.organizationId) === String(orgId)
    );
    calls = getCalls().filter(
      (c) => String(c.organizationId) === String(orgId)
    );
  }

  // Group calls by leadId and normalized phone
  const callsByLeadId = new Map<string, any[]>();
  const callsByPhone = new Map<string, any[]>();

  for (const call of calls) {
    if (call.leadId) {
      const lid = String(call.leadId);
      if (!callsByLeadId.has(lid)) callsByLeadId.set(lid, []);
      callsByLeadId.get(lid)!.push(call);
    }
    const rawPhone = call.phoneNumber || call.recipientPhoneNumber || call.userNumber || "";
    if (rawPhone && rawPhone !== "Unknown" && rawPhone !== "Browser Web-Call") {
      const norm = normalizeIndianPhoneE164(rawPhone);
      if (!callsByPhone.has(norm)) callsByPhone.set(norm, []);
      callsByPhone.get(norm)!.push(call);
    }
  }

  // Ensure any call with a distinct phone number is represented in leads
  const knownPhones = new Set(leads.map((l) => normalizeIndianPhoneE164(l.phone || "")));
  const knownIds = new Set(leads.map((l) => String(l._id)));

  for (const [phone, phoneCalls] of callsByPhone.entries()) {
    if (!knownPhones.has(phone)) {
      const firstCall = phoneCalls[0];
      const synthLeadId =
        firstCall.leadId && !knownIds.has(String(firstCall.leadId))
          ? String(firstCall.leadId)
          : new mongoose.Types.ObjectId().toHexString();
      const synthLead = {
        _id: synthLeadId,
        organizationId: orgId,
        name: firstCall.leadName || `Prospect (${phone.slice(-4)})`,
        phone,
        source: "Inbound/Outbound Call",
        qualificationStatus: firstCall.qualificationResult?.status || "new",
        interestLevel: (firstCall.qualificationScore && firstCall.qualificationScore >= 70
          ? "high"
          : "medium") as "high" | "medium",
        qualificationScore: firstCall.qualificationScore || 0,
        doNotContact: false,
        createdAt: firstCall.startedAt || firstCall.createdAt || new Date(),
        updatedAt: firstCall.updatedAt || new Date(),
      };
      leads.push(synthLead);
      knownPhones.add(phone);
      knownIds.add(synthLeadId);
      if (db) {
        Lead.create({ ...synthLead, _id: new mongoose.Types.ObjectId(synthLeadId) }).catch(() => {});
      }
    }
  }

  // Enrich every lead with consistent effective score, signals, and heat bucket
  leads = leads.map((l) => {
    const lId = String(l._id);
    const normPhone = normalizeIndianPhoneE164(l.phone || "");
    const matchedById = callsByLeadId.get(lId) || [];
    const matchedByPhone = callsByPhone.get(normPhone) || [];

    // Deduplicate calls by call id
    const callSet = new Map<string, any>();
    for (const c of [...matchedById, ...matchedByPhone]) {
      callSet.set(String(c._id || c.bolnaExecutionId || Math.random()), c);
    }
    const leadCalls = Array.from(callSet.values()).sort(
      (a, b) =>
        new Date(b.startedAt || b.createdAt || 0).getTime() -
        new Date(a.startedAt || a.createdAt || 0).getTime()
    );

    const totalCalls = leadCalls.length;
    const latestCall = leadCalls[0] || null;
    const lastAgentName = latestCall ? (latestCall.agentName || latestCall.agentId || "") : undefined;
    const lastCallOutcome = latestCall ? (latestCall.outcome || latestCall.status || "") : undefined;
    const lastCallDate = latestCall ? (latestCall.startedAt || latestCall.createdAt) : l.lastCallDate;

    let latestCallScore = latestCall?.qualificationScore;
    if (typeof latestCallScore !== "number" && latestCall?.extractedData?.lead_score) {
      latestCallScore = Number(latestCall.extractedData.lead_score);
    }

    const baseLead = {
      ...l,
      lastCallDate: lastCallDate || l.lastCallDate,
      qualificationScore:
        typeof latestCallScore === "number" && latestCallScore > (l.qualificationScore || 0)
          ? latestCallScore
          : l.qualificationScore,
    };

    const signals = extractLeadSignals(baseLead);
    const effectiveScore = computeEffectiveLeadScore(baseLead);
    const heatBucket = computeLeadBucket({
      ...baseLead,
      qualificationScore: effectiveScore,
      qualificationSignals: signals,
    });

    return {
      ...baseLead,
      totalCalls,
      lastAgentName,
      lastCallOutcome,
      latestCallScore,
      qualificationScore: effectiveScore,
      qualificationSignals: signals,
      heatBucket,
    };
  });

  if (status && status !== "all") {
    leads = leads.filter((l) => l.qualificationStatus === status);
  }
  if (interest && interest !== "all") {
    leads = leads.filter((l) => l.interestLevel === interest);
  }
  if (bucket && bucket !== "all") {
    leads = leads.filter((l) => l.heatBucket === bucket);
  }
  if (query) {
    leads = leads.filter(
      (l) =>
        String(l.name || "").toLowerCase().includes(query) ||
        String(l.phone || "").includes(query) ||
        String(l.company || "").toLowerCase().includes(query) ||
        String(l.assignedSalespersonName || "").toLowerCase().includes(query)
    );
  }

  return NextResponse.json({ leads, total: leads.length });
}

export async function POST(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const session = getSessionFromRequest(req);
    if (!session || !isAuthorizedRole(session.role, ["organization"])) {
      return NextResponse.json(
        { error: "Forbidden", details: "Only organization members can create leads." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = leadSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const leadObjectId = new mongoose.Types.ObjectId().toHexString();
    const newLead = {
      _id: leadObjectId,
      organizationId: rbac.organizationId || "org_default_01",
      name: body.name,
      phone: body.phone,
      email: body.email || "",
      company: body.company || "",
      location: body.location || "",
      industry: body.industry || "General",
      source: body.source || "Manual Entry",
      qualificationStatus: "new" as const,
      interestLevel: "unknown" as const,
      qualificationScore: 0,
      doNotContact: false,
      notes: body.notes ? [body.notes] : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addLead(newLead);

    const db = await connectToDatabase();
    if (db) {
      await Lead.create({
        ...newLead,
        _id: new mongoose.Types.ObjectId(leadObjectId),
        organizationId: rbac.organizationId,
      });
    }

    return NextResponse.json({ success: true, lead: newLead }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Failed to create lead") },
      { status: 500 }
    );
  }
}
