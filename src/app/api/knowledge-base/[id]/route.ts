import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireOrganizationRole, assertTenantOwnership } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import KnowledgeBase from "@/models/KnowledgeBase";
import Agent from "@/models/Agent";
import {
  getKnowledgeBaseById,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  addKnowledgeBase,
  getAgents,
  getKnowledgeBases,
} from "@/lib/store";
import { processUploadedKnowledgeFile } from "@/lib/knowledge-processor";
import { bolnaService } from "@/lib/bolna/client";
import { IKnowledgeBase, IKnowledgeDocument } from "@/types";

async function resolveKb(id: string): Promise<IKnowledgeBase | null> {
  const db = await connectToDatabase();
  if (db && mongoose.Types.ObjectId.isValid(id)) {
    const doc = await KnowledgeBase.findById(id).lean();
    if (doc) {
      const normalized = {
        ...(doc as any),
        _id: String((doc as any)._id),
      } as IKnowledgeBase;
      addKnowledgeBase(normalized);
      return normalized;
    }
  }
  return getKnowledgeBaseById(id) || null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const resolvedParams = await Promise.resolve(context.params);
  const id = resolvedParams.id;
  const orgId = rbac.organizationId;

  const kb = await resolveKb(id);
  if (!kb) {
    return NextResponse.json(
      { error: "Knowledge Base not found" },
      { status: 404 }
    );
  }

  const tenantError = assertTenantOwnership(orgId, kb.organizationId);
  if (tenantError) return tenantError;

  const associatedAgents = getAgents()
    .filter(
      (a) =>
        String(a.organizationId) === String(orgId) &&
        (a.conversationConfiguration?.knowledgeBaseIds || []).includes(
          String(kb._id)
        )
    )
    .map((a) => ({ _id: a._id, name: a.name, status: a.status }));

  return NextResponse.json({
    knowledgeBase: {
      ...kb,
      documentCount: (kb.documents || []).length,
      associatedAgents,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const rbac = requireOrganizationRole(req);
    if (!rbac.ok) return rbac.response;

    const resolvedParams = await Promise.resolve(context.params);
    const id = resolvedParams.id;
    const orgId = rbac.organizationId;

    const existing = await resolveKb(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Knowledge Base not found" },
        { status: 404 }
      );
    }

    const tenantError = assertTenantOwnership(orgId, existing.organizationId);
    if (tenantError) return tenantError;

    const contentType = req.headers.get("content-type") || "";
    const currentDocs: IKnowledgeDocument[] = [...(existing.documents || [])];
    const updates: Partial<IKnowledgeBase> = {};
    let newFileBuf: Buffer | undefined = undefined;
    let newFileName: string | undefined = undefined;
    let attachAgentIds: string[] | undefined = undefined;
    let newSourceUrl: string | undefined = undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      if (formData.has("name"))
        updates.name = String(formData.get("name")).trim();
      if (formData.has("description"))
        updates.description = String(formData.get("description")).trim();
      if (formData.has("category"))
        updates.category = String(formData.get("category")).trim();
      if (formData.has("status")) {
        updates.status =
          formData.get("status") === "inactive" ? "inactive" : "active";
      }

      const files = formData.getAll("files") as File[];
      const singleFile = formData.get("file") as File | null;
      const allFiles = singleFile ? [...files, singleFile] : files;

      for (const f of allFiles) {
        if (!f || !f.name) continue;
        const buf = Buffer.from(await f.arrayBuffer());
        if (!newFileBuf) {
          newFileBuf = buf;
          newFileName = f.name;
        }
        const docId = `doc_${new mongoose.Types.ObjectId().toHexString()}`;
        currentDocs.push(
          processUploadedKnowledgeFile({
            id: docId,
            fileName: f.name,
            buffer: buf,
          })
        );
      }
    } else {
      const body = await req.json();
      if (body.name !== undefined) updates.name = String(body.name).trim();
      if (body.description !== undefined)
        updates.description = String(body.description).trim();
      if (body.category !== undefined)
        updates.category = String(body.category).trim();
      if (body.status !== undefined) {
        updates.status = body.status === "inactive" ? "inactive" : "active";
      }
      if (body.sourceUrl !== undefined) {
        newSourceUrl = String(body.sourceUrl).trim();
        updates.sourceUrl = newSourceUrl;
      }
      if (Array.isArray(body.attachAgentIds)) {
        attachAgentIds = body.attachAgentIds.map(String);
        updates.associatedAgentIds = attachAgentIds;
      }

      if (body.removeDocumentId) {
        const removeId = String(body.removeDocumentId);
        const filtered = currentDocs.filter(
          (d) => String(d._id) !== removeId
        );
        currentDocs.length = 0;
        currentDocs.push(...filtered);
      }

      if (body.addDocument) {
        const docId = `doc_${new mongoose.Types.ObjectId().toHexString()}`;
        const buf = body.addDocument.base64Content
          ? Buffer.from(body.addDocument.base64Content, "base64")
          : Buffer.from(String(body.addDocument.content || ""), "utf8");
        newFileBuf = buf;
        newFileName = body.addDocument.fileName || "document.txt";
        currentDocs.push(
          processUploadedKnowledgeFile({
            id: docId,
            fileName: newFileName || "document.txt",
            buffer: buf,
          })
        );
      }
    }

    const readyDocs = currentDocs.filter((d) => d.processingStatus === "ready");
    const failedDocs = currentDocs.filter(
      (d) => d.processingStatus === "failed"
    );

    updates.documents = currentDocs;
    updates.documentCount = currentDocs.length;
    updates.totalChunks = readyDocs.reduce(
      (acc, d) => acc + (d.chunks?.length || 0),
      0
    );
    updates.processingStatus =
      currentDocs.length === 0
        ? "uploaded"
        : readyDocs.length > 0
        ? "ready"
        : failedDocs.length > 0
        ? "failed"
        : "processing";

    // Bolna RAG Sync on content update (re-ingest + delete old rag_id)
    const bolnaSync: {
      synced: boolean;
      ragId: string | null;
      attachedAgents: number;
      error: string | null;
    } = {
      synced: true,
      ragId: existing.bolnaRagId || null,
      attachedAgents: 0,
      error: null,
    };

    if (newFileBuf || newSourceUrl) {
      const ragRes = await bolnaService.createKnowledgeBase({
        url: newSourceUrl || undefined,
        fileContent: newSourceUrl ? undefined : newFileBuf,
        fileName: newFileName,
      });

      if (ragRes.success && ragRes.rag_id) {
        if (existing.bolnaRagId && existing.bolnaRagId !== ragRes.rag_id) {
          await bolnaService.deleteKnowledgeBase(existing.bolnaRagId);
        }
        updates.bolnaRagId = ragRes.rag_id;
        updates.bolnaSyncStatus = "synced";
        updates.bolnaSyncError = null;
        updates.lastSyncedAt = new Date();
        bolnaSync.ragId = ragRes.rag_id;
      } else {
        updates.bolnaSyncStatus = "failed";
        updates.bolnaSyncError = ragRes.error || "Bolna RAG update failed";
        bolnaSync.synced = false;
        bolnaSync.error = updates.bolnaSyncError;
      }
    }

    const db = await connectToDatabase();

    // Sync KB attachment to Bolna Agents if attachAgentIds was provided
    const effectiveRagId = updates.bolnaRagId || existing.bolnaRagId;
    if (attachAgentIds !== undefined) {
      const orgAgents = getAgents().filter(
        (a) => String(a.organizationId) === String(orgId)
      );
      const allOrgKbs = getKnowledgeBases().filter(
        (k) => String(k.organizationId) === String(orgId)
      );

      for (const agent of orgAgents) {
        const shouldAttach = attachAgentIds.includes(String(agent._id));
        const currentKbIds = new Set(
          agent.conversationConfiguration?.knowledgeBaseIds || []
        );
        const hadKb = currentKbIds.has(String(id));

        if (shouldAttach === hadKb) continue;

        if (shouldAttach) currentKbIds.add(String(id));
        else currentKbIds.delete(String(id));

        const nextKbIds = Array.from(currentKbIds);
        if (agent.conversationConfiguration) {
          agent.conversationConfiguration.knowledgeBaseIds = nextKbIds;
        }

        if (db && mongoose.Types.ObjectId.isValid(agent._id)) {
          await Agent.findByIdAndUpdate(agent._id, {
            $set: { "conversationConfiguration.knowledgeBaseIds": nextKbIds },
          });
        }

        if (agent.bolnaAgentId) {
          const ragIdsForAgent = nextKbIds
            .map((kbId) =>
              kbId === String(id)
                ? effectiveRagId
                : allOrgKbs.find((k) => String(k._id) === kbId)?.bolnaRagId
            )
            .filter(Boolean) as string[];

          const attachRes = await bolnaService.attachKnowledgeBasesToAgent(
            agent.bolnaAgentId,
            ragIdsForAgent
          );
          if (attachRes.success) {
            bolnaSync.attachedAgents += 1;
          } else {
            bolnaSync.synced = false;
            bolnaSync.error =
              attachRes.error || `Failed to sync KB with agent ${agent.name}`;
          }
        }
      }
    }

    if (db && mongoose.Types.ObjectId.isValid(id)) {
      await KnowledgeBase.findByIdAndUpdate(id, { $set: updates });
    }

    const updated = updateKnowledgeBase(id, updates) || {
      ...existing,
      ...updates,
    };

    return NextResponse.json({
      success: true,
      knowledgeBase: updated,
      bolnaSync,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to update Knowledge Base",
        details: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const resolvedParams = await Promise.resolve(context.params);
  const id = resolvedParams.id;
  const orgId = rbac.organizationId;

  const existing = await resolveKb(id);
  if (!existing) {
    return NextResponse.json(
      { error: "Knowledge Base not found" },
      { status: 404 }
    );
  }

  const tenantError = assertTenantOwnership(orgId, existing.organizationId);
  if (tenantError) return tenantError;

  // Delete from Bolna Knowledge Base API first
  let bolnaDeleteRes: { success: boolean; error?: string } = { success: true };
  if (existing.bolnaRagId) {
    bolnaDeleteRes = await bolnaService.deleteKnowledgeBase(existing.bolnaRagId);
  }

  const db = await connectToDatabase();
  if (db && mongoose.Types.ObjectId.isValid(id)) {
    await KnowledgeBase.findByIdAndDelete(id);
  }
  deleteKnowledgeBase(id);

  return NextResponse.json({
    success: true,
    message: bolnaDeleteRes.success
      ? "Knowledge Base deleted from Console and Bolna."
      : "Knowledge Base deleted locally, but Bolna returned a warning.",
    bolnaSync: {
      synced: bolnaDeleteRes.success,
      error: bolnaDeleteRes.error || null,
    },
  });
}
