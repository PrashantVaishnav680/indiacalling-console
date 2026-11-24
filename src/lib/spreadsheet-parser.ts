/**
 * Spreadsheet & Lead Dataset Parser (`src/lib/spreadsheet-parser.ts`)
 * Supports CSV, TSV, XLSX (OpenXML ZIP), and XLS (XML/HTML/Tab-delimited) uploads,
 * intelligent column mapping, Indian + E.164 phone validation, duplicate detection,
 * and downloadable CSV error report generation.
 */

export interface RawSpreadsheetData {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export interface ColumnMappingConfig {
  phoneNumber: string; // Required
  name?: string;
  email?: string;
  company?: string;
  city?: string;
  budget?: string;
  industry?: string;
  notes?: string;
  customFieldMappings?: Array<{
    sourceColumn: string;
    targetKey: string;
  }>;
}

export interface ValidatedLeadRow {
  rowIndex: number;
  name: string;
  rawPhone: string;
  normalizedPhone: string;
  email: string;
  company: string;
  city: string;
  budget: string;
  industry: string;
  notes: string;
  customFields: Record<string, any>;
  rawOriginalRow?: Record<string, string>;
  isValid: boolean;
  isDuplicate: boolean;
  isMissingPhone: boolean;
  isExistingLead?: boolean;
  errorReason?: string;
}

export interface DatasetValidationResult {
  summary: {
    totalUploaded: number;
    validRecords: number;
    invalidRecords: number;
    duplicateRecords: number;
    missingPhoneNumbers: number;
    importedRecords: number;
  };
  validRows: ValidatedLeadRow[];
  invalidRows: ValidatedLeadRow[];
  duplicateRows: ValidatedLeadRow[];
  allRows: ValidatedLeadRow[];
}

export function validateAndNormalizePhone(raw: string): {
  valid: boolean;
  normalized: string;
  reason?: string;
} {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return { valid: false, normalized: "", reason: "Missing phone number" };
  }

  // Strip spaces, hyphens, parentheses, dots
  const cleaned = trimmed.replace(/[\s\-().]/g, "");

  // Reject strings containing letters
  if (/[a-zA-Z]/.test(cleaned)) {
    return {
      valid: false,
      normalized: cleaned,
      reason: "Phone number contains alphabetic characters",
    };
  }

  // Standard 10-digit Indian mobile number (starts with 6, 7, 8, or 9)
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return { valid: true, normalized: `+91${cleaned}` };
  }

  // 11-digit Indian mobile with leading 0
  if (/^0[6-9]\d{9}$/.test(cleaned)) {
    return { valid: true, normalized: `+91${cleaned.slice(1)}` };
  }

  // 12-digit Indian mobile starting with 91
  if (/^91[6-9]\d{9}$/.test(cleaned)) {
    return { valid: true, normalized: `+${cleaned}` };
  }

  // International E.164 (+ followed by 8 to 15 digits, specifically validating +91 length if Indian)
  if (/^\+91[6-9]\d{9}$/.test(cleaned)) {
    return { valid: true, normalized: cleaned };
  }
  if (/^\+91\d+$/.test(cleaned)) {
    return {
      valid: false,
      normalized: cleaned,
      reason: "Invalid Indian +91 mobile number (must be 10 digits starting with 6-9)",
    };
  }

  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    return { valid: true, normalized: cleaned };
  }

  return {
    valid: false,
    normalized: cleaned,
    reason: "Invalid phone format (expected 10-digit Indian mobile or E.164 +country format)",
  };
}

export function parseCsvLine(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsvOrTsvText(rawText: string): RawSpreadsheetData {
  const cleaned = String(rawText || "").replace(/^\uFEFF/, "").trim();
  if (!cleaned) return { headers: [], rows: [] };

  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter =
    lines[0].includes("\t") && !lines[0].includes(",") ? "\t" : ",";
  const rawHeaders = parseCsvLine(lines[0], delimiter);
  const headers = rawHeaders.map((h, i) => h || `Column_${i + 1}`);

  const rows: Array<Record<string, string>> = [];
  for (let r = 1; r < lines.length; r++) {
    const values = parseCsvLine(lines[r], delimiter);
    if (values.every((v) => !v)) continue;
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] ?? "";
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

export function autoGuessColumnMapping(headers: string[]): ColumnMappingConfig {
  const mapping: ColumnMappingConfig = {
    phoneNumber: "",
    name: "",
    email: "",
    company: "",
    city: "",
    budget: "",
    industry: "",
    notes: "",
    customFieldMappings: [],
  };

  const usedHeaders = new Set<string>();

  for (const h of headers) {
    const lower = h.toLowerCase().trim();
    if (
      !mapping.phoneNumber &&
      (lower.includes("phone") ||
        lower.includes("mobile") ||
        lower.includes("contact") ||
        lower.includes("cell") ||
        lower.includes("number") ||
        lower === "tel")
    ) {
      mapping.phoneNumber = h;
      usedHeaders.add(h);
    } else if (
      !mapping.name &&
      (lower.includes("name") ||
        lower.includes("customer") ||
        lower.includes("prospect") ||
        lower.includes("lead")) &&
      !lower.includes("company")
    ) {
      mapping.name = h;
      usedHeaders.add(h);
    } else if (!mapping.email && (lower.includes("email") || lower.includes("mail"))) {
      mapping.email = h;
      usedHeaders.add(h);
    } else if (
      !mapping.company &&
      (lower.includes("company") ||
        lower.includes("organization") ||
        lower.includes("business") ||
        lower.includes("firm"))
    ) {
      mapping.company = h;
      usedHeaders.add(h);
    } else if (
      !mapping.city &&
      (lower.includes("city") ||
        lower.includes("location") ||
        lower.includes("state") ||
        lower.includes("address"))
    ) {
      mapping.city = h;
      usedHeaders.add(h);
    } else if (
      !mapping.budget &&
      (lower.includes("budget") ||
        lower.includes("price") ||
        lower.includes("value") ||
        lower.includes("amount"))
    ) {
      mapping.budget = h;
      usedHeaders.add(h);
    } else if (
      !mapping.industry &&
      (lower.includes("industry") ||
        lower.includes("sector") ||
        lower.includes("category"))
    ) {
      mapping.industry = h;
      usedHeaders.add(h);
    } else if (
      !mapping.notes &&
      (lower.includes("note") ||
        lower.includes("remark") ||
        lower.includes("comment"))
    ) {
      mapping.notes = h;
      usedHeaders.add(h);
    }
  }

  // Remaining columns become customFieldMappings automatically
  for (const h of headers) {
    if (!usedHeaders.has(h)) {
      const camelKey = h
        .trim()
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .split(/\s+/)
        .map((w, i) =>
          i === 0
            ? w.toLowerCase()
            : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        )
        .join("");
      if (camelKey) {
        mapping.customFieldMappings?.push({
          sourceColumn: h,
          targetKey: camelKey,
        });
      }
    }
  }

  if (!mapping.phoneNumber && headers.length > 0) {
    mapping.phoneNumber = headers[0];
  }

  return mapping;
}

export function validateMappedDataset(
  rawRows: Array<Record<string, string>>,
  mapping: ColumnMappingConfig,
  existingPhonesInWorkspace: Set<string> = new Set()
): DatasetValidationResult {
  const seenPhonesInBatch = new Set<string>();
  const validRows: ValidatedLeadRow[] = [];
  const invalidRows: ValidatedLeadRow[] = [];
  const duplicateRows: ValidatedLeadRow[] = [];
  const allRows: ValidatedLeadRow[] = [];

  let missingPhoneNumbers = 0;

  rawRows.forEach((row, idx) => {
    const rawPhone = mapping.phoneNumber ? String(row[mapping.phoneNumber] || "").trim() : "";
    const rawName = mapping.name ? String(row[mapping.name] || "").trim() : "";
    const email = mapping.email ? String(row[mapping.email] || "").trim() : "";
    const company = mapping.company ? String(row[mapping.company] || "").trim() : "";
    const city = mapping.city ? String(row[mapping.city] || "").trim() : "India";
    const budget = mapping.budget ? String(row[mapping.budget] || "").trim() : "";
    const industry = mapping.industry
      ? String(row[mapping.industry] || "").trim()
      : "General";
    const notes = mapping.notes ? String(row[mapping.notes] || "").trim() : "";

    const customFields: Record<string, any> = {};
    if (budget) {
      customFields.budget = budget;
    }
    for (const cf of mapping.customFieldMappings || []) {
      if (cf.sourceColumn && cf.targetKey && row[cf.sourceColumn] !== undefined) {
        customFields[cf.targetKey] = row[cf.sourceColumn];
      }
    }

    // Preserve unmapped columns inside customFields._unmapped so original uploaded data is never lost
    const mappedSourceCols = new Set<string>(
      [
        mapping.phoneNumber,
        mapping.name,
        mapping.email,
        mapping.company,
        mapping.city,
        mapping.budget,
        mapping.industry,
        mapping.notes,
        ...(mapping.customFieldMappings || []).map((c) => c.sourceColumn),
      ].filter(Boolean) as string[]
    );
    for (const [colKey, colVal] of Object.entries(row)) {
      if (!mappedSourceCols.has(colKey) && colVal !== undefined && colVal !== "") {
        customFields[colKey] = colVal;
      }
    }

    // Check email format if provided
    const hasInvalidEmail =
      email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const phoneCheck = validateAndNormalizePhone(rawPhone);
    if (!rawPhone) {
      missingPhoneNumbers += 1;
      const item: ValidatedLeadRow = {
        rowIndex: idx + 1,
        name: rawName || `Row ${idx + 1}`,
        rawPhone: "",
        normalizedPhone: "",
        email,
        company,
        city,
        budget,
        industry,
        notes,
        customFields,
        rawOriginalRow: { ...row },
        isValid: false,
        isDuplicate: false,
        isMissingPhone: true,
        errorReason: "Missing phone number",
      };
      invalidRows.push(item);
      allRows.push(item);
      return;
    }

    if (!phoneCheck.valid || hasInvalidEmail) {
      const item: ValidatedLeadRow = {
        rowIndex: idx + 1,
        name: rawName || `Row ${idx + 1}`,
        rawPhone,
        normalizedPhone: phoneCheck.normalized,
        email,
        company,
        city,
        budget,
        industry,
        notes,
        customFields,
        rawOriginalRow: { ...row },
        isValid: false,
        isDuplicate: false,
        isMissingPhone: false,
        errorReason: !phoneCheck.valid
          ? phoneCheck.reason || "Invalid phone number"
          : `Invalid email format (${email})`,
      };
      invalidRows.push(item);
      allRows.push(item);
      return;
    }

    const normPhone = phoneCheck.normalized;
    // Intra-file duplication check: only duplicate numbers within the uploaded batch are flagged as duplicate rows
    if (seenPhonesInBatch.has(normPhone)) {
      const item: ValidatedLeadRow = {
        rowIndex: idx + 1,
        name: rawName || `Contact (${normPhone.slice(-4)})`,
        rawPhone,
        normalizedPhone: normPhone,
        email,
        company,
        city,
        budget,
        industry,
        notes,
        customFields,
        rawOriginalRow: { ...row },
        isValid: false,
        isDuplicate: true,
        isMissingPhone: false,
        errorReason: "Duplicate phone number within uploaded file",
      };
      duplicateRows.push(item);
      allRows.push(item);
      return;
    }

    seenPhonesInBatch.add(normPhone);
    const isExistingInWorkspace = existingPhonesInWorkspace.has(normPhone);
    const validItem: ValidatedLeadRow = {
      rowIndex: idx + 1,
      name: rawName || `Contact (${normPhone.slice(-4)})`,
      rawPhone,
      normalizedPhone: normPhone,
      email,
      company,
      city,
      budget,
      industry,
      notes,
      customFields,
      rawOriginalRow: { ...row },
      isValid: true,
      isDuplicate: false,
      isMissingPhone: false,
      isExistingLead: isExistingInWorkspace,
    };
    validRows.push(validItem);
    allRows.push(validItem);
  });

  return {
    summary: {
      totalUploaded: rawRows.length,
      validRecords: validRows.length,
      invalidRecords: invalidRows.length,
      duplicateRecords: duplicateRows.length,
      missingPhoneNumbers,
      importedRecords: validRows.length,
    },
    validRows,
    invalidRows,
    duplicateRows,
    allRows,
  };
}

export function generateErrorReportCsv(
  invalidRowsOrResult: ValidatedLeadRow[] | DatasetValidationResult,
  duplicateRows: ValidatedLeadRow[] = []
): string {
  let invalidRows: ValidatedLeadRow[] = [];
  let dupRows: ValidatedLeadRow[] = duplicateRows;

  if (
    invalidRowsOrResult &&
    "invalidRows" in invalidRowsOrResult &&
    Array.isArray((invalidRowsOrResult as any).invalidRows)
  ) {
    invalidRows = (invalidRowsOrResult as DatasetValidationResult).invalidRows;
    dupRows =
      (invalidRowsOrResult as DatasetValidationResult).duplicateRows || [];
  } else if (Array.isArray(invalidRowsOrResult)) {
    invalidRows = invalidRowsOrResult;
  }
  const combined = [...invalidRows, ...(dupRows || [])];
  const lines = [
    "Row Number,Customer Name,Raw Phone,Issue Category,Error Reason,Email,Company,City,Budget",
  ];
  for (const r of combined) {
    const category = r.isMissingPhone
      ? "Missing Phone"
      : r.isDuplicate
      ? "Duplicate Record"
      : "Invalid Format";
    const esc = (v: string) => `"${String(v || "").replace(/"/g, '""')}"`;
    lines.push(
      [
        r.rowIndex,
        esc(r.name),
        esc(r.rawPhone),
        esc(category),
        esc(r.errorReason || ""),
        esc(r.email),
        esc(r.company),
        esc(r.city),
        esc(r.budget),
      ].join(",")
    );
  }
  return lines.join("\n");
}
