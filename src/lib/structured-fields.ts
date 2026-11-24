/**
 * Parses structured call/lead metadata or serialized JSON strings into clean,
 * human-readable Title-Cased key-value pairs for UI cards (zero raw JSON dumps).
 */

export interface StructuredFieldItem {
  key: string;
  label: string;
  value: string;
}

function toTitleLabel(key: string): string {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

function formatFieldValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "";
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed || trimmed === "{}" || trimmed === "[]" || trimmed.toLowerCase() === "null") {
      return "";
    }
    return trimmed;
  }
  if (Array.isArray(val)) {
    const items = val.map(formatFieldValue).filter(Boolean);
    return items.join(", ");
  }
  if (typeof val === "object") {
    const parts = Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => {
        const formatted = formatFieldValue(v);
        return formatted ? `${toTitleLabel(k)}: ${formatted}` : "";
      })
      .filter(Boolean);
    return parts.join(" · ");
  }
  return "";
}

/**
 * Extracts readable key-value fields from an object or JSON string.
 */
export function parseStructuredFields(input: unknown): StructuredFieldItem[] {
  if (!input) return [];

  let sourceObj: Record<string, unknown> | null = null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          sourceObj = parsed as Record<string, unknown>;
        }
      } catch {
        return [];
      }
    } else {
      return [];
    }
  } else if (typeof input === "object" && !Array.isArray(input)) {
    sourceObj = input as Record<string, unknown>;
  }

  if (!sourceObj) return [];

  const results: StructuredFieldItem[] = [];
  for (const [k, v] of Object.entries(sourceObj)) {
    if (k.startsWith("_") || k === "raw" || k === "id") continue;
    const formatted = formatFieldValue(v);
    if (!formatted) continue;
    results.push({
      key: k,
      label: toTitleLabel(k),
      value: formatted,
    });
  }
  return results;
}

/**
 * Cleans a summary or qualificationReason string so raw JSON objects never appear in prose.
 */
export function sanitizeReadableSummary(input: unknown, fallback = "No call summary available yet."): string {
  if (!input) return fallback;
  const raw = String(input).trim();
  if (!raw || raw === "{}" || raw === "[]") return fallback;
  if (raw.startsWith("{") && raw.endsWith("}")) {
    const fields = parseStructuredFields(raw);
    if (fields.length > 0) {
      return fields.map((f) => `${f.label}: ${f.value}`).join(" · ");
    }
    return fallback;
  }
  return raw;
}
