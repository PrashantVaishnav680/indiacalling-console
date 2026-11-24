import { requireOrganizationRole, assertTenantOwnership } from "@/lib/rbac";
import { NextRequest, NextResponse } from "next/server";
import zlib from "node:zlib";
import { getSessionFromRequest } from "@/lib/auth";
import {
  parseCsvOrTsvText,
  autoGuessColumnMapping,
  RawSpreadsheetData,
} from "@/lib/spreadsheet-parser";

/**
 * Extracts entries from a standard ZIP buffer (used by .xlsx OpenXML workbooks)
 * using Node's built-in `zlib.inflateRawSync` with zero external dependencies.
 */
function extractZipEntries(buffer: Buffer): Record<string, string> {
  const entries: Record<string, string> = {};
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break; // Local file header signature

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

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function colLettersToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseXlsxBuffer(buffer: Buffer): RawSpreadsheetData {
  // Check if ZIP signature (PK\x03\x04)
  if (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50) {
    const entries = extractZipEntries(buffer);
    const sharedStringsXml = entries["xl/sharedStrings.xml"] || "";
    const sheetXml =
      entries["xl/worksheets/sheet1.xml"] ||
      Object.entries(entries).find(([k]) =>
        k.startsWith("xl/worksheets/sheet")
      )?.[1] ||
      "";

    const sharedStrings: string[] = [];
    if (sharedStringsXml) {
      const siMatches = sharedStringsXml.match(/<si[\s\S]*?<\/si>/g) || [];
      for (const si of siMatches) {
        const tMatches = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
        const combined = tMatches
          .map((t) => decodeXmlEntities(t.replace(/<\/?t[^>]*>/g, "")))
          .join("");
        sharedStrings.push(combined);
      }
    }

    if (sheetXml) {
      const rowMatches = sheetXml.match(/<row[\s\S]*?<\/row>/g) || [];
      const matrix: string[][] = [];

      for (const rowXml of rowMatches) {
        const cellMatches = rowXml.match(/<c[\s\S]*?(?:\/>|<\/c>)/g) || [];
        const rowValues: string[] = [];

        for (const cellXml of cellMatches) {
          const refMatch = cellXml.match(/r="([A-Z]+)\d+"/);
          const colIdx = refMatch
            ? colLettersToIndex(refMatch[1])
            : rowValues.length;
          const typeMatch = cellXml.match(/t="([^"]+)"/);
          const cellType = typeMatch ? typeMatch[1] : "";

          let val = "";
          if (cellType === "inlineStr") {
            const tMatch = cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/);
            val = tMatch ? decodeXmlEntities(tMatch[1]) : "";
          } else {
            const vMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
            const rawV = vMatch ? vMatch[1].trim() : "";
            if (cellType === "s") {
              const sIdx = Number(rawV);
              val = sharedStrings[sIdx] ?? rawV;
            } else {
              val = decodeXmlEntities(rawV);
            }
          }
          rowValues[colIdx] = val.trim();
        }

        if (rowValues.some((v) => v && v.length > 0)) {
          matrix.push(rowValues);
        }
      }

      if (matrix.length > 0) {
        const headers = matrix[0].map((h, i) => h || `Column_${i + 1}`);
        const rows = matrix.slice(1).map((r) => {
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => {
            obj[h] = r[i] ?? "";
          });
          return obj;
        });
        return { headers, rows };
      }
    }
  }

  // Fallback for XML/HTML-based .xls or CSV/TSV text
  const asText = buffer.toString("utf8");
  if (asText.includes("<table") || asText.includes("<Row")) {
    const trMatches =
      asText.match(/<(?:tr|Row)[\s\S]*?<\/(?:tr|Row)>/gi) || [];
    const matrix: string[][] = [];
    for (const tr of trMatches) {
      const tdMatches =
        tr.match(/<(?:td|th|Data)[^>]*>([\s\S]*?)<\/(?:td|th|Data)>/gi) || [];
      const row = tdMatches.map((td) =>
        decodeXmlEntities(td.replace(/<[^>]+>/g, "").trim())
      );
      if (row.some(Boolean)) matrix.push(row);
    }
    if (matrix.length > 0) {
      const headers = matrix[0].map((h, i) => h || `Column_${i + 1}`);
      const rows = matrix.slice(1).map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = r[i] ?? "";
        });
        return obj;
      });
      return { headers, rows };
    }
  }

  return parseCsvOrTsvText(asText);
}

export async function POST(req: NextRequest) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") || "";
    let fileName = "uploaded_leads.csv";
    let parsed: RawSpreadsheetData = { headers: [], rows: [] };

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "No file provided in upload" },
          { status: 400 }
        );
      }
      fileName = file.name;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      parsed = parseXlsxBuffer(buffer);
    } else {
      const body = await req.json();
      fileName = body.fileName || "uploaded_leads.csv";
      if (body.base64Content) {
        const buffer = Buffer.from(body.base64Content, "base64");
        parsed = parseXlsxBuffer(buffer);
      } else if (body.textContent) {
        parsed = parseCsvOrTsvText(body.textContent);
      }
    }

    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      return NextResponse.json(
        {
          error: "Empty or Unreadable Dataset",
          details:
            "Could not extract any headers or data rows from the uploaded file. Please upload a valid CSV, XLSX, or XLS file.",
        },
        { status: 400 }
      );
    }

    const suggestedMapping = autoGuessColumnMapping(parsed.headers);

    return NextResponse.json({
      success: true,
      fileName,
      headers: parsed.headers,
      rows: parsed.rows,
      totalRows: parsed.rows.length,
      suggestedMapping,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to parse uploaded spreadsheet",
        details: error?.message || "Invalid file format",
      },
      { status: 500 }
    );
  }
}
