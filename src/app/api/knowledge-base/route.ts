import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireOrganizationRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import KnowledgeBase from "@/models/KnowledgeBase";
import {
  getKnowledgeBases,
  addKnowledgeBase,
  getAgents,
} from "@/lib/store";
import {
  processUploadedKnowledgeFile,
  chunkExtractedText,
} from "@/lib/knowledge-processor";
import { bolnaService } from "@/lib/bolna/client";
import { IKnowledgeBase, IKnowledgeDocument } from "@/types";

export async function GET(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const orgId = rbac.organizationId;
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") || "").trim().toLowerCase();
  const category = searchParams.get("category");
  const onlyUsable = searchParams.get("usable") === "true";

  const db = await connectToDatabase();
  if (db) {
    const dbKbs = await KnowledgeBase.find({ organizationId: orgId })
      .sort({ createdAt: -1 })
      .lean();
    for (const kb of dbKbs) {
      addKnowledgeBase({
        ...(kb as any),
        _id: String((kb as any)._id),
      });
    }
  }

  const allAgents = getAgents().filter(
    (a) => String(a.organizationId) === String(orgId)
  );
  let list = getKnowledgeBases()
    .filter((kb) => String(kb.organizationId) === String(orgId))
    .map((kb) => {
      const associatedAgents = allAgents
        .filter((a) =>
          (a.conversationConfiguration?.knowledgeBaseIds || []).includes(
            String(kb._id)
          )
        )
        .map((a) => ({ _id: a._id, name: a.name }));

      return {
        ...kb,
        documentCount: (kb.documents || []).length,
        associatedAgentIds: associatedAgents.map((a) => a._id),
        associatedAgents,
      };
    });

  if (category && category !== "all") {
    list = list.filter((kb) => kb.category === category);
  }
  if (onlyUsable) {
    list = list.filter(
      (kb) => kb.status === "active" && kb.processingStatus === "ready"
    );
  }
  if (search) {
    list = list.filter(
      (kb) =>
        kb.name.toLowerCase().includes(search) ||
        (kb.description || "").toLowerCase().includes(search) ||
        (kb.category || "").toLowerCase().includes(search)
    );
  }

  return NextResponse.json({
    knowledgeBases: list,
    supportedFormats: ["PDF", "TXT", "DOCX", "CSV"],
  });
}

export async function POST(req: NextRequest) {
  try {
    const rbac = requireOrganizationRole(req);
    if (!rbac.ok) return rbac.response;

    const { session, organizationId: orgId } = rbac;
    const contentType = req.headers.get("content-type") || "";

    let name = "";
    let description = "";
    let category = "Company Information";
    let languageSupport = "English (Default)";
    let sourceType: "pdf" | "url" | "manual" = "pdf";
    let sourceUrl = "";
    let status: "active" | "inactive" = "active";
    const processedDocs: IKnowledgeDocument[] = [];
    let primaryFileBuffer: Buffer | undefined = undefined;
    let primaryFileName: string | undefined = undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      name = String(formData.get("name") || "").trim();
      description = String(formData.get("description") || "").trim();
      category = String(
        formData.get("category") || "Company Information"
      ).trim();
      languageSupport = String(
        formData.get("languageSupport") || "English (Default)"
      ).trim();
      const rawType = String(formData.get("sourceType") || "pdf").toLowerCase();
      sourceType =
        rawType === "url" ? "url" : rawType === "manual" ? "manual" : "pdf";
      sourceUrl = String(
        formData.get("url") || formData.get("sourceUrl") || ""
      ).trim();
      status =
        String(formData.get("status") || "active").trim() === "inactive"
          ? "inactive"
          : "active";

      const files = formData.getAll("files") as File[];
      const singleFile = formData.get("file") as File | null;
      const allFiles = singleFile ? [...files, singleFile] : files;

      for (const f of allFiles) {
        if (!f || !f.name) continue;
        const arrBuf = await f.arrayBuffer();
        const buf = Buffer.from(arrBuf);
        if (!primaryFileBuffer) {
          primaryFileBuffer = buf;
          primaryFileName = f.name;
        }
        const docId = `doc_${new mongoose.Types.ObjectId().toHexString()}`;
        processedDocs.push(
          processUploadedKnowledgeFile({
            id: docId,
            fileName: f.name,
            buffer: buf,
          })
        );
      }

      if (sourceUrl && processedDocs.length === 0) {
        const contentToChunk = `Source URL: ${sourceUrl}\nKnowledge Base: ${
          name || sourceUrl
        }\nLanguage: ${languageSupport}`;
        processedDocs.push({
          _id: `doc_${new mongoose.Types.ObjectId().toHexString()}`,
          fileName: `${(name || "url_source").toLowerCase().replace(/[^a-z0-9]+/g, "_")}.txt`,
          fileType: "txt",
          fileSizeBytes: Buffer.byteLength(contentToChunk, "utf8"),
          extractedText: contentToChunk,
          chunks: chunkExtractedText(contentToChunk),
          processingStatus: "ready",
          uploadedAt: new Date(),
        });
      }

      const inlineText = String(formData.get("textContent") || "").trim();
      if (inlineText && processedDocs.length === 0) {
        const chunks = chunkExtractedText(inlineText);
        const fname = `${(name || "knowledge").toLowerCase().replace(/[^a-z0-9]+/g, "_")}.txt`;
        primaryFileBuffer = Buffer.from(inlineText, "utf8");
        primaryFileName = fname;
        processedDocs.push({
          _id: `doc_${new mongoose.Types.ObjectId().toHexString()}`,
          fileName: fname,
          fileType: "txt",
          fileSizeBytes: primaryFileBuffer.byteLength,
          extractedText: inlineText,
          chunks,
          processingStatus: chunks.length > 0 ? "ready" : "failed",
          uploadedAt: new Date(),
        });
      }

      if (!name && primaryFileName) {
        name = primaryFileName
          .replace(/\.[^/.]+$/, "")
          .replace(/[_\s]+/g, " ")
          .trim();
      }
    } else {
      const body = await req.json();
      name = String(body.name || "").trim();
      description = String(body.description || "").trim();
      category = String(body.category || "Company Information").trim();
      languageSupport = String(
        body.languageSupport || "English (Default)"
      ).trim();
      const rawType = String(body.sourceType || "pdf").toLowerCase();
      sourceType =
        rawType === "url" ? "url" : rawType === "manual" ? "manual" : "pdf";
      sourceUrl = String(body.url || body.sourceUrl || "").trim();
      status = body.status === "inactive" ? "inactive" : "active";

      if (sourceUrl && (!body.documents || body.documents.length === 0)) {
        const contentToChunk = `Source URL: ${sourceUrl}\nKnowledge Base: ${
          name || sourceUrl
        }\nLanguage: ${languageSupport}`;
        processedDocs.push({
          _id: `doc_${new mongoose.Types.ObjectId().toHexString()}`,
          fileName: `${(name || "url_source").toLowerCase().replace(/[^a-z0-9]+/g, "_")}.txt`,
          fileType: "txt",
          fileSizeBytes: Buffer.byteLength(contentToChunk, "utf8"),
          extractedText: contentToChunk,
          chunks: chunkExtractedText(contentToChunk),
          processingStatus: "ready",
          uploadedAt: new Date(),
        });
      } else if (Array.isArray(body.documents)) {
        for (const docItem of body.documents) {
          const docId = `doc_${new mongoose.Types.ObjectId().toHexString()}`;
          const buf = docItem.base64Content
            ? Buffer.from(docItem.base64Content, "base64")
            : Buffer.from(String(docItem.content || docItem.text || ""), "utf8");
          if (!primaryFileBuffer) {
            primaryFileBuffer = buf;
            primaryFileName = docItem.fileName || "document.txt";
          }
          processedDocs.push(
            processUploadedKnowledgeFile({
              id: docId,
              fileName: docItem.fileName || "document.txt",
              buffer: buf,
            })
          );
        }
      } else if (body.textContent) {
        const textStr = String(body.textContent);
        const fname = body.fileName || "knowledge_notes.txt";
        primaryFileBuffer = Buffer.from(textStr, "utf8");
        primaryFileName = fname;
        const chunks = chunkExtractedText(textStr);
        processedDocs.push({
          _id: `doc_${new mongoose.Types.ObjectId().toHexString()}`,
          fileName: fname,
          fileType: "txt",
          fileSizeBytes: primaryFileBuffer.byteLength,
          extractedText: textStr,
          chunks,
          processingStatus: chunks.length > 0 ? "ready" : "failed",
          uploadedAt: new Date(),
        });
      }
    }

    if (!name) name = "Knowledge Base";
    if (!description) {
      description =
        sourceType === "url" && sourceUrl
          ? `Web source: ${sourceUrl}`
          : `Uploaded document (${languageSupport})`;
    }

    const readyDocs = processedDocs.filter(
      (d) => d.processingStatus === "ready"
    );
    const failedDocs = processedDocs.filter(
      (d) => d.processingStatus === "failed"
    );

    const overallProcessingStatus: IKnowledgeBase["processingStatus"] =
      processedDocs.length === 0
        ? "uploaded"
        : readyDocs.length > 0
        ? "ready"
        : failedDocs.length > 0
        ? "failed"
        : "processing";

    const totalChunks = readyDocs.reduce(
      (acc, d) => acc + (d.chunks?.length || 0),
      0
    );

    // Full Bolna RAG Synchronization (No silent failures)
    let bolnaRagId: string | undefined = undefined;
    let bolnaSyncStatus: IKnowledgeBase["bolnaSyncStatus"] = "pending";
    let bolnaSyncError: string | null = null;
    let lastSyncedAt: Date | undefined = undefined;

    const isMultilingual = languageSupport.toLowerCase().includes("multi") ||
      languageSupport.toLowerCase().includes("hindi");

    if (sourceUrl || primaryFileBuffer) {
      const ragRes = await bolnaService.createKnowledgeBase({
        url: sourceUrl || undefined,
        fileContent: sourceUrl ? undefined : primaryFileBuffer,
        fileName: primaryFileName,
        multilingual: isMultilingual,
      });

      if (ragRes.success && ragRes.rag_id) {
        bolnaRagId = ragRes.rag_id;
        bolnaSyncStatus = "synced";
        lastSyncedAt = new Date();
      } else {
        bolnaSyncStatus = "failed";
        bolnaSyncError =
          ragRes.error || "Bolna Knowledge Base upload failed.";
      }
    }

    const kbObjectId = new mongoose.Types.ObjectId().toHexString();
    const newKb: IKnowledgeBase = {
      _id: kbObjectId,
      organizationId: orgId,
      name,
      description,
      category,
      languageSupport,
      sourceType,
      sourceUrl,
      status,
      processingStatus: overallProcessingStatus,
      documents: processedDocs,
      documentCount: processedDocs.length,
      totalChunks,
      associatedAgentIds: [],
      bolnaRagId,
      bolnaSyncStatus,
      bolnaSyncError,
      lastSyncedAt,
      createdBy: session.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = await connectToDatabase();
    if (db) {
      await KnowledgeBase.create({
        ...newKb,
        _id: new mongoose.Types.ObjectId(kbObjectId),
      });
    }

    addKnowledgeBase(newKb);

    return NextResponse.json(
      {
        success: true,
        knowledgeBase: newKb,
        bolnaSync: {
          synced: bolnaSyncStatus === "synced",
          status: bolnaSyncStatus,
          ragId: bolnaRagId || null,
          error: bolnaSyncError,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to create Knowledge Base",
        details: error?.message || "Unexpected error",
      },
      { status: 500 }
    );
  }
}
