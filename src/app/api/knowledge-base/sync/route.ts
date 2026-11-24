import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireOrganizationRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import KnowledgeBase from "@/models/KnowledgeBase";
import Agent from "@/models/Agent";
import {
  getKnowledgeBases,
  addKnowledgeBase,
  getAgents,
  updateAgent,
} from "@/lib/store";
import {
  buildKnowledgeBaseContextForAgent,
  chunkExtractedText,
} from "@/lib/knowledge-processor";
import { bolnaService } from "@/lib/bolna/client";
import { IKnowledgeBase } from "@/types";

export async function POST(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const orgId = rbac.organizationId;
    const body = await req.json().catch(() => ({}));
    const shouldImportRemote = body.importRemote === true; // Strict tenant isolation: only sync org-uploaded KBs by default
    const db = await connectToDatabase();

    const orgQuery = mongoose.Types.ObjectId.isValid(orgId)
      ? {
          $or: [
            { organizationId: orgId },
            { organizationId: new mongoose.Types.ObjectId(orgId) },
          ],
        }
      : { organizationId: orgId };

    // 1. Load this organization's Knowledge Bases ONLY (strict tenant isolation)
    let kbs: IKnowledgeBase[] = getKnowledgeBases().filter(
      (k) => String(k.organizationId) === String(orgId)
    );

    if (db) {
      const dbKbs = await KnowledgeBase.find(orgQuery).lean();
      if (dbKbs.length > 0) {
        kbs = dbKbs.map((k: any) => ({ ...k, _id: String(k._id) }));
        for (const k of kbs) addKnowledgeBase(k);
      }
    }

    // 2. Fetch live Bolna RAG Knowledge Bases (`GET /knowledgebase/all`)
    let bolnaKbs: any[] = [];
    let importedFromBolna = 0;
    let pushedToBolna = 0;
    const syncWarnings: string[] = [];

    if (!bolnaService.isMockMode) {
      bolnaKbs = await bolnaService.listKnowledgeBases();

      // Import processed Bolna KBs not yet linked to this organization
      if (shouldImportRemote && bolnaKbs.length > 0) {
        for (const remote of bolnaKbs) {
          const ragId = String(remote.rag_id || remote.id || "");
          if (!ragId) continue;

          const alreadyLinked = kbs.some(
            (local) =>
              local.bolnaRagId === ragId ||
              (remote.source && local.sourceUrl === remote.source)
          );
          if (alreadyLinked) continue;

          const remoteSource = String(
            remote.file_name || remote.source || `Bolna KB ${ragId.slice(0, 8)}`
          );
          const isUrl = remoteSource.startsWith("http") || String(remote.source_type || "").toLowerCase() === "url";
          const kbId = new mongoose.Types.ObjectId().toHexString();
          const summaryText = `Synchronized from Bolna RAG (${ragId}). Source: ${remoteSource}. Status: ${remote.status || "processed"}.`;

          const importedKb: IKnowledgeBase = {
            _id: kbId,
            organizationId: orgId,
            name: remoteSource.replace(/^URL:\s*/i, "").slice(0, 90),
            description: `Synced from Bolna Knowledge Base (${ragId.slice(0, 8)})`,
            category: "Company Information",
            languageSupport: remote.multilingual ? "Multilingual" : "English (Default)",
            sourceType: isUrl ? "url" : "pdf",
            sourceUrl: isUrl ? remoteSource.replace(/^URL:\s*/i, "") : "",
            status: "active",
            processingStatus:
              String(remote.status || "").toLowerCase() === "failed"
                ? "failed"
                : "ready",
            documents: [
              {
                _id: `doc_${new mongoose.Types.ObjectId().toHexString()}`,
                fileName: remoteSource.slice(0, 120),
                fileType: isUrl ? "txt" : "pdf",
                fileSizeBytes: Buffer.byteLength(summaryText, "utf8"),
                extractedText: summaryText,
                chunks: chunkExtractedText(summaryText),
                processingStatus: "ready",
                uploadedAt: remote.created_at ? new Date(remote.created_at) : new Date(),
              },
            ],
            documentCount: 1,
            totalChunks: 1,
            associatedAgentIds: [],
            bolnaRagId: ragId,
            bolnaSyncStatus: "synced",
            bolnaSyncError: null,
            lastSyncedAt: new Date(),
            createdBy: rbac.session.userId,
            createdAt: remote.created_at ? new Date(remote.created_at) : new Date(),
            updatedAt: new Date(),
          };

          if (db) {
            await KnowledgeBase.create({
              ...importedKb,
              _id: new mongoose.Types.ObjectId(kbId),
            });
          }
          addKnowledgeBase(importedKb);
          kbs.unshift(importedKb);
          importedFromBolna += 1;
        }
      }

      // Push any local unlinked KBs to Bolna RAG
      for (const kb of kbs) {
        if (!kb.bolnaRagId && kb.status === "active") {
          const textBody = (kb.documents || [])
            .map((d) => d.extractedText)
            .filter(Boolean)
            .join("\n\n");
          const createRes = await bolnaService.createKnowledgeBase(
            kb.sourceUrl
              ? { url: kb.sourceUrl }
              : textBody
              ? {
                  fileContent: Buffer.from(textBody, "utf8"),
                  fileName: `${kb.name.replace(/[^a-zA-Z0-9]/g, "_")}.txt`,
                }
              : {}
          );
          if (createRes.success && createRes.rag_id) {
            kb.bolnaRagId = createRes.rag_id;
            kb.bolnaSyncStatus = "synced";
            kb.bolnaSyncError = null;
            kb.lastSyncedAt = new Date();
            if (db && mongoose.Types.ObjectId.isValid(kb._id)) {
              await KnowledgeBase.findByIdAndUpdate(kb._id, {
                $set: {
                  bolnaRagId: createRes.rag_id,
                  bolnaSyncStatus: "synced",
                  bolnaSyncError: null,
                  lastSyncedAt: new Date(),
                },
              });
            }
            pushedToBolna += 1;
          } else if (createRes.error) {
            syncWarnings.push(`${kb.name}: ${createRes.error}`);
          }
        }
      }
    }

    // 3. Calculate accurate ready document counts
    const readyKbs = kbs.filter(
      (kb) => kb.status === "active" && kb.processingStatus === "ready"
    );
    const totalReadyDocs = readyKbs.reduce((acc, kb) => {
      const readyDocCount = (kb.documents || []).filter(
        (d: any) => d.processingStatus === "ready"
      ).length;
      return acc + Math.max(readyDocCount, kb.bolnaRagId ? 1 : 0);
    }, 0);
    const activeRagIds = readyKbs
      .map((kb) => kb.bolnaRagId)
      .filter(Boolean) as string[];
    const kbContext = buildKnowledgeBaseContextForAgent(readyKbs);

    // 4. Load this organization's AI agents ONLY (strict tenant isolation)
    let agents: any[] = getAgents().filter(
      (a) => String(a.organizationId) === String(orgId)
    );
    if (db) {
      const dbAgents = await Agent.find(orgQuery).lean();
      if (dbAgents.length > 0) {
        agents = dbAgents.map((a: any) => ({ ...a, _id: String(a._id) }));
      }
    }

    let syncedCount = 0;
    const syncedAgents: string[] = [];

    for (const agent of agents) {
      if (!agent.bolnaAgentId) continue;

      // Attach Bolna RAG IDs directly to the Bolna Agent
      if (activeRagIds.length > 0 && !bolnaService.isMockMode) {
        const attachRes = await bolnaService.attachKnowledgeBasesToAgent(
          agent.bolnaAgentId,
          activeRagIds
        );
        if (attachRes.success) {
          syncedCount += 1;
          syncedAgents.push(agent.name);
        } else if (attachRes.error) {
          syncWarnings.push(`Agent ${agent.name}: ${attachRes.error}`);
        }
      }

      if (kbContext) {
        const existingPrompt =
          agent.conversationConfiguration?.systemPrompt ||
          agent.prompt ||
          "You are a professional AI voice assistant.";
        const basePrompt = existingPrompt
          .replace(/\n\n=== AUTHORIZED KNOWLEDGE BASE REFERENCE ===[\s\S]*$/, "")
          .trim();
        const updatedPrompt = `${basePrompt}\n\n${kbContext}`;

        const agentUpdates: Record<string, any> = {
          "conversationConfiguration.systemPrompt": updatedPrompt,
          "conversationConfiguration.knowledgeBaseIds": readyKbs.map((k) => k._id),
        };
        if (db && mongoose.Types.ObjectId.isValid(agent._id)) {
          await Agent.findByIdAndUpdate(agent._id, { $set: agentUpdates });
        }
        updateAgent(agent._id, agentUpdates);
      }
    }

    return NextResponse.json({
      success: syncWarnings.length === 0,
      message: `Synced ${totalReadyDocs} ready Knowledge Base source(s) (${importedFromBolna} imported from Bolna, ${pushedToBolna} pushed) across ${syncedCount} active Bolna agent(s).`,
      warnings: syncWarnings,
      stats: {
        totalKnowledgeBases: kbs.length,
        readyDocumentsCount: totalReadyDocs,
        importedFromBolna,
        pushedToBolna,
        bolnaRemoteCount: bolnaKbs.length,
        syncedAgentsCount: syncedCount,
        syncedAgents,
        hasKbContext: Boolean(kbContext),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Knowledge Base Sync Failed",
        details: error?.message || "Failed to sync Knowledge Base with Bolna AI.",
      },
      { status: 500 }
    );
  }
}
