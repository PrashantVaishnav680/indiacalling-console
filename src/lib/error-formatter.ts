/**
 * Centralized human-readable error formatting & white-label text sanitization.
 * Ensures raw JSON blobs, Zod/Mongoose internals, stack traces, and third-party
 * vendor names never leak into user-facing toasts, banners, or API error responses.
 */

const HTTP_STATUS_FALLBACKS: Record<number, string> = {
  400: "Please check the entered details and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You do not have permission to perform this action.",
  404: "The requested record could not be found.",
  409: "This record already exists or conflicts with an existing item.",
  422: "Some fields are invalid. Please review your input and try again.",
  429: "Too many requests right now. Please wait a moment and try again.",
  500: "Something went wrong on our end. Please try again in a moment.",
  502: "Voice AI service is temporarily unreachable. Please try again shortly.",
  503: "Service is temporarily unavailable. Please try again shortly.",
  504: "The request timed out. Please try again.",
};

/**
 * Replaces third-party telephony/voice vendor names with IndiaCalling white-label terms.
 */
export function sanitizeWhiteLabelText(input: string): string {
  if (!input) return "";
  return input
    .replace(/\bBolna\s+Voice\s+AI\s+v2\b/gi, "IndiaCalling Voice AI Engine")
    .replace(/\bBolna\s+AI\b/gi, "IndiaCalling Voice AI")
    .replace(/\bBolna\s+API\b/gi, "Voice AI Engine API")
    .replace(/\bBolna\b/gi, "IndiaCalling Voice AI");
}

function tryExtractFromJsonString(raw: string): string | null {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart) return null;

  const candidate = trimmed.slice(jsonStart, jsonEnd + 1);
  try {
    const parsed = JSON.parse(candidate);
    return extractMessageFromObject(parsed);
  } catch {
    return null;
  }
}

function extractMessageFromObject(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;

  if (Array.isArray(rec.validation_errors) && rec.validation_errors.length > 0) {
    const first = rec.validation_errors[0] as Record<string, unknown>;
    if (typeof first?.message === "string" && first.message.trim()) {
      return first.message.trim();
    }
  }

  if (Array.isArray(rec.issues) && rec.issues.length > 0) {
    const first = rec.issues[0] as Record<string, unknown>;
    if (typeof first?.message === "string" && first.message.trim()) {
      return first.message.trim();
    }
  }

  for (const key of ["error", "message", "detail", "details", "reason"]) {
    const val = rec[key];
    if (typeof val === "string" && val.trim()) {
      const nested = tryExtractFromJsonString(val);
      return nested || val.trim();
    }
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0];
      if (typeof first === "string" && first.trim()) return first.trim();
      if (first && typeof first === "object") {
        const nested = extractMessageFromObject(first);
        if (nested) return nested;
      }
    }
    if (val && typeof val === "object") {
      const nested = extractMessageFromObject(val);
      if (nested) return nested;
    }
  }

  return null;
}

/**
 * Converts any unknown error, API payload, or raw string into a clean,
 * plain-English message suitable for UI toasts, banners, and API responses.
 */
export function formatErrorMessage(
  input: unknown,
  fallbackStatus?: number,
  customFallback?: string
): string {
  const statusFallback =
    (fallbackStatus && HTTP_STATUS_FALLBACKS[fallbackStatus]) ||
    customFallback ||
    "Something went wrong. Please try again.";

  if (input == null) return statusFallback;

  let raw = "";
  if (typeof input === "string") {
    raw = input.trim();
  } else if (input instanceof Error) {
    raw = (input.message || "").trim();
  } else if (typeof input === "object") {
    raw = extractMessageFromObject(input) || "";
  }

  if (!raw) return statusFallback;

  // Unwrap embedded JSON payloads (e.g. `HTTP 400: {"message":"..."}`)
  const extracted = tryExtractFromJsonString(raw);
  if (extracted) {
    raw = extracted;
  }

  // Strip stack traces & noisy technical prefixes
  raw = raw.split("\n")[0].trim();
  raw = raw
    .replace(/^Error:\s*/i, "")
    .replace(/^TypeError:\s*/i, "")
    .replace(/^ValidationError:\s*/i, "")
    .replace(/^MongoServerError:\s*/i, "")
    .replace(/^Cast to ObjectId failed.*$/i, "Invalid identifier provided.")
    .replace(/^E11000 duplicate key error.*$/i, "A record with these details already exists.")
    .replace(/^Failed to fetch$/i, "Unable to reach the server. Please check your connection and try again.")
    .replace(/^NetworkError.*$/i, "Network connection error. Please check your internet and try again.")
    .replace(/\bHTTP\s+\d{3}\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // If still looks like raw JSON / array dump / internal path, fall back cleanly
  if (
    !raw ||
    raw.startsWith("{") ||
    raw.startsWith("[") ||
    raw.includes('":') ||
    /Agent Config\s*>/i.test(raw) ||
    /string indices must be integers/i.test(raw)
  ) {
    return statusFallback;
  }

  raw = sanitizeWhiteLabelText(raw);

  // Keep error messages concise and readable
  if (raw.length > 220) {
    raw = `${raw.slice(0, 217).trimEnd()}...`;
  }

  return raw;
}

/**
 * Safely reads an error message from a fetch Response object.
 */
export async function extractApiError(
  res: Response,
  customFallback?: string
): Promise<string> {
  try {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      return formatErrorMessage(data, res.status, customFallback);
    }
    const text = await res.text();
    return formatErrorMessage(text, res.status, customFallback);
  } catch {
    return formatErrorMessage(null, res.status, customFallback);
  }
}
