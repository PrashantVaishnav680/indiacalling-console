import zlib from "node:zlib";
import { parseCsvOrTsvText } from "@/lib/spreadsheet-parser";
import type { IKnowledgeDocument, KnowledgeDocumentStatus } from "@/types";

/**
 * Real Document Processing & Chunking Pipeline (`src/lib/knowledge-processor.ts`)
 * Supports:
 *  - .txt (UTF-8 plain text)
 *  - .csv (Tabular CSV parsed into structured Q&A / attribute records)
 *  - .docx (OpenXML ZIP `word/document.xml` extracted via `node:zlib.inflateRawSync`)
 *  - .pdf (PDF 1.x text stream / FlateDecode parser extracting readable text operators)
 *
 * Processing lifecycle states:
 *  Uploaded -> Processing -> Ready | Failed
 */

export const SUPPORTED_KB_EXTENSIONS = ["pdf", "txt", "docx", "csv"] as const;
export type SupportedKbExtension = (typeof SUPPORTED_KB_EXTENSIONS)[number];

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x0D;/gi, "\n")
    .replace(/&#10;/g, "\n");
}

function extractZipEntries(buffer: Buffer): Record<string, string> {
  const entries: Record<string, string> = {};
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);

    const fileName = buffer
      .subarray(offset + 30, offset + 30 + fileNameLength)
      .toString("utf8");
    const dataStart = offset + 30 + fileNameLength + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > buffer.length) break;

    const rawSlice = buffer.subarray(dataStart, dataEnd);
    try {
      if (compressionMethod === 0) {
        entries[fileName] = rawSlice.toString("utf8");
      } else if (compressionMethod === 8) {
        entries[fileName] = zlib.inflateRawSync(rawSlice).toString("utf8");
      }
    } catch {
      // Skip unreadable entry
    }

    offset = dataEnd;
  }

  return entries;
}

export function extractDocxText(buffer: Buffer): string {
  if (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50) {
    const entries = extractZipEntries(buffer);
    const docXml = entries["word/document.xml"] || "";
    if (docXml) {
      const paragraphs = docXml.match(/<w:p[\s\S]*?<\/w:p>/g) || [];
      const lines: string[] = [];
      for (const p of paragraphs) {
        const texts = p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
        const paraText = texts
          .map((t) => decodeXmlEntities(t.replace(/<\/?w:t[^>]*>/g, "")))
          .join("");
        if (paraText.trim()) {
          lines.push(paraText.trim());
        }
      }
      if (lines.length > 0) {
        return lines.join("\n");
      }
    }
  }
  // Fallback if plain text or XML was saved with .docx extension
  const raw = buffer.toString("utf8");
  return decodeXmlEntities(raw.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function unescapePdfLiteral(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractTextOperatorsFromPdfContent(content: string): string[] {
  const pieces: string[] = [];
  // Match (text) Tj
  const tjMatches = content.match(/\((?:\\.|[^\\)])*\)\s*Tj/g) || [];
  for (const m of tjMatches) {
    const inner = m.replace(/\)\s*Tj$/, "").replace(/^\(/, "");
    const cleaned = unescapePdfLiteral(inner).trim();
    if (cleaned) pieces.push(cleaned);
  }

  // Match [(text) -20 (more)] TJ
  const tjArrayMatches = content.match(/\[[\s\S]*?\]\s*TJ/g) || [];
  for (const arr of tjArrayMatches) {
    const literals = arr.match(/\((?:\\.|[^\\)])*\)/g) || [];
    const combined = literals
      .map((lit) => unescapePdfLiteral(lit.slice(1, -1)))
      .join("");
    if (combined.trim()) pieces.push(combined.trim());
  }

  return pieces;
}

export function extractPdfText(buffer: Buffer): string {
  const rawLatin1 = buffer.toString("latin1");
  const extractedParts: string[] = [];

  // 1. Extract uncompressed text operators
  extractedParts.push(...extractTextOperatorsFromPdfContent(rawLatin1));

  // 2. Decompress FlateDecode streams and extract text operators
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(rawLatin1)) !== null) {
    const streamBytes = Buffer.from(match[1], "latin1");
    try {
      const inflated = zlib.inflateSync(streamBytes).toString("latin1");
      extractedParts.push(...extractTextOperatorsFromPdfContent(inflated));
    } catch {
      try {
        const inflatedRaw = zlib
          .inflateRawSync(streamBytes)
          .toString("latin1");
        extractedParts.push(
          ...extractTextOperatorsFromPdfContent(inflatedRaw)
        );
      } catch {
        // Non-Flate stream or image stream
      }
    }
  }

  const combined = extractedParts
    .join(" ")
    .replace(/[^\x20-\x7E\n\u0900-\u097F₹]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (combined.length >= 10) {
    return combined;
  }

  // Fallback if the uploaded file is UTF-8 text or a simple text PDF
  const utf8Fallback = buffer
    .toString("utf8")
    .replace(/[^\x20-\x7E\r\n\u0900-\u097F₹]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (utf8Fallback && !utf8Fallback.startsWith("%PDF")) {
    return utf8Fallback;
  }

  return "";
}

export function chunkExtractedText(text: string, maxChunkChars = 600): string[] {
  const cleaned = String(text || "").trim();
  if (!cleaned) return [];

  const paragraphs = cleaned
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n" + para).trim().length <= maxChunkChars) {
      current = current ? `${current}\n${para}` : para;
    } else {
      if (current) chunks.push(current);
      if (para.length <= maxChunkChars) {
        current = para;
      } else {
        for (let i = 0; i < para.length; i += maxChunkChars) {
          chunks.push(para.slice(i, i + maxChunkChars));
        }
        current = "";
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function processUploadedKnowledgeFile(params: {
  id: string;
  fileName: string;
  buffer: Buffer;
}): IKnowledgeDocument {
  const { id, fileName, buffer } = params;
  const ext = (fileName.split(".").pop() || "").toLowerCase();

  if (!SUPPORTED_KB_EXTENSIONS.includes(ext as SupportedKbExtension)) {
    return {
      _id: id,
      fileName,
      fileType: "txt",
      fileSizeBytes: buffer.length,
      extractedText: "",
      chunks: [],
      processingStatus: "failed",
      errorMessage: `Unsupported file format (.${ext}). Supported formats: PDF, TXT, DOCX, CSV.`,
      uploadedAt: new Date(),
    };
  }

  const fileType = ext as SupportedKbExtension;
  let extractedText = "";
  let rowCount = 0;

  try {
    if (fileType === "txt") {
      extractedText = buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
    } else if (fileType === "csv") {
      const parsed = parseCsvOrTsvText(buffer.toString("utf8"));
      rowCount = parsed.rows.length;
      if (parsed.headers.length > 0 && parsed.rows.length > 0) {
        extractedText = parsed.rows
          .map((row, idx) => {
            const pairs = parsed.headers
              .map((h) => (row[h] ? `${h}: ${row[h]}` : ""))
              .filter(Boolean)
              .join(" | ");
            return `Record ${idx + 1}: ${pairs}`;
          })
          .join("\n");
      }
    } else if (fileType === "docx") {
      extractedText = extractDocxText(buffer);
    } else if (fileType === "pdf") {
      extractedText = extractPdfText(buffer);
    }

    const chunks = chunkExtractedText(extractedText);
    const status: KnowledgeDocumentStatus =
      extractedText.trim().length > 0 && chunks.length > 0 ? "ready" : "failed";

    return {
      _id: id,
      fileName,
      fileType,
      fileSizeBytes: buffer.length,
      extractedText: extractedText.slice(0, 15000),
      chunks,
      rowCount,
      processingStatus: status,
      errorMessage:
        status === "failed"
          ? "No machine-readable text could be extracted from this file. For scanned PDFs, please upload a searchable PDF, DOCX, TXT, or CSV."
          : undefined,
      uploadedAt: new Date(),
    };
  } catch (err: any) {
    return {
      _id: id,
      fileName,
      fileType,
      fileSizeBytes: buffer.length,
      extractedText: "",
      chunks: [],
      processingStatus: "failed",
      errorMessage: err?.message || "Document processing failed",
      uploadedAt: new Date(),
    };
  }
}

/**
 * Builds a concise, grounded Knowledge Base context block from selected Ready knowledge bases
 * to inject into the AI voice agent's prompt during Bolna synchronization.
 */
export function buildKnowledgeBaseContextForAgent(
  knowledgeBases: Array<{
    _id: string;
    name: string;
    category?: string;
    status?: string;
    processingStatus?: string;
    documents?: Array<{
      fileName: string;
      extractedText?: string;
      chunks?: string[];
      processingStatus?: string;
    }>;
  }>
): string {
  const usable = knowledgeBases.filter(
    (kb) =>
      kb.status !== "inactive" &&
      kb.processingStatus === "ready" &&
      (kb.documents || []).some((d) => d.processingStatus === "ready")
  );

  if (usable.length === 0) return "";

  const sections: string[] = [
    "=== AUTHORIZED KNOWLEDGE BASE REFERENCE ===",
  ];

  for (const kb of usable) {
    const readyDocs = (kb.documents || []).filter(
      (d) => d.processingStatus === "ready" && d.extractedText
    );
    const sliceCleanlyAtBoundary = (raw: string, maxChars = 2400): string => {
      const cleaned = raw.replace(/\s+/g, " ").trim();
      if (cleaned.length <= maxChars) return cleaned;
      const candidate = cleaned.slice(0, maxChars);
      const lastSentence = Math.max(
        candidate.lastIndexOf(". "),
        candidate.lastIndexOf("! "),
        candidate.lastIndexOf("? "),
        candidate.lastIndexOf("\u0964 ")
      );
      if (lastSentence >= Math.floor(maxChars * 0.6)) {
        return `${candidate.slice(0, lastSentence + 1).trim()} [...additional details available via Knowledge Base]`;
      }
      const lastSpace = candidate.lastIndexOf(" ");
      const safeCut = lastSpace > Math.floor(maxChars * 0.5) ? candidate.slice(0, lastSpace) : candidate;
      return `${safeCut.trim()}... [...additional details available via Knowledge Base]`;
    };

    const combinedSnippet = readyDocs
      .map((d) => `[${d.fileName}]: ${sliceCleanlyAtBoundary(String(d.extractedText), 2400)}`)
      .join("\n");
    if (combinedSnippet) {
      sections.push(
        `Source: ${kb.name} (${kb.category || "General"})\n${combinedSnippet}`
      );
    }
  }

  return sections.join("\n\n");
}
