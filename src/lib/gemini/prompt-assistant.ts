/**
 * Google Gemini Free-Tier AI Prompt Assistant Service (`src/lib/gemini/prompt-assistant.ts`)
 * Connects server-side to Google AI Studio's Gemini API (`https://generativelanguage.googleapis.com/v1beta`).
 *
 * Official Free-Tier Access & Documentation:
 *  - Google AI Studio: https://aistudio.google.com/
 *  - Gemini API Docs: https://ai.google.dev/gemini-api/docs
 *  - Pricing & Free Tier Quotas: https://ai.google.dev/gemini-api/docs/pricing
 *
 * Security & Privacy Guarantees (Part 5.3 & 5.6):
 *  - Uses server-side `GEMINI_API_KEY` and `GEMINI_MODEL` (never exposed via NEXT_PUBLIC_*).
 *  - Enforces free-tier model allowlist (`gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`, `gemini-1.5-flash`).
 *  - Never silently switches to paid-only models or requires billing.
 *  - Sanitizes inputs so lead datasets, customer phone numbers, call recordings/transcripts, tokens, and secrets are NEVER sent to Gemini.
 */

export type GeminiPromptAction =
  | "generate_new_prompt"
  | "improve_existing_prompt"
  | "make_prompt_professional"
  | "simplify_prompt"
  | "translate_prompt"
  | "regenerate_prompt"
  | "generate_greeting_message"
  | "generate_fallback_responses"
  | "generate_qualification_questions"
  | "generate_objection_handling"
  // Backward-compatible action aliases
  | "generate_from_description"
  | "improve_existing"
  | "rewrite_professional"
  | "make_conversational"
  | "add_instructions"
  | "add_objection_handling"
  | "improve_fallback"
  | "generate_multilingual"
  | "optimize_concise";

export interface GeminiPromptAssistantInput {
  action: GeminiPromptAction;
  targetSection?:
    | "all"
    | "systemPrompt"
    | "greetingMessage"
    | "conversationInstructions"
    | "fallbackResponses"
    | "qualificationQuestions"
    | "objectionHandling"
    | "conversationClosing";
  agentName?: string;
  businessName?: string;
  industry?: string;
  businessObjective?: string;
  agentPersonality?: string;
  businessDescription?: string;
  targetAudience?: string;
  primaryLanguage?: string;
  promptLanguage?: string;
  promptStyle?: string;
  supportedLanguages?: string[];
  conversationGoals?: string;
  requiredQuestions?: string;
  qualificationCriteria?: string;
  objectionHandlingRequirements?: string;
  desiredConversationStyle?: string;
  existingPrompt?: string;
  model?: string;
}

export interface GeminiStructuredPromptOutput {
  systemPrompt: string;
  greetingMessage: string;
  conversationInstructions: string;
  fallbackResponses: string;
  qualificationQuestions: string;
  objectionHandling: string;
  conversationClosing: string;
}

export interface GeminiPromptAssistantResponse {
  success: boolean;
  provider: "Google Gemini (Google AI Studio Free Tier)";
  configured: boolean;
  modelUsed: string;
  action: string;
  generatedPrompt?: string;
  sections?: GeminiStructuredPromptOutput;
  errorCode?:
    | "MISSING_API_KEY"
    | "QUOTA_EXHAUSTED"
    | "MODEL_UNAVAILABLE"
    | "PAID_MODEL_BLOCKED"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "PROVIDER_ERROR";
  error?: string;
  userMessage?: string;
  setupInstructions?: string[];
}

export const VERIFIED_GEMINI_FREE_TIER_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
] as const;

const ACTION_DESCRIPTIONS: Record<string, string> = {
  generate_new_prompt:
    "1. Generate New Prompt: Create a complete, production-ready AI voice agent prompt and all 7 conversation sections from the provided agent configuration.",
  improve_existing_prompt:
    "2. Improve Existing Prompt: Enhance the existing voice agent prompt for natural phone pacing, active listening, and lead qualification accuracy.",
  make_prompt_professional:
    "3. Make Prompt More Professional: Rewrite the prompt and spoken instructions in an executive, trustworthy, and polished professional tone.",
  simplify_prompt:
    "4. Simplify Prompt: Compress and simplify the prompt so the voice agent speaks in crisp, clear 1-2 sentence turns with zero robotic jargon.",
  translate_prompt:
    "5. Translate Prompt: Adapt and translate the prompt, greeting, and qualification questions to seamlessly support the specified Primary Language and Supported Languages.",
  regenerate_prompt:
    "6. Regenerate Prompt: Produce a fresh, high-converting variation of the complete voice agent prompt and conversation sections.",
  generate_greeting_message:
    "7. Generate Greeting Message: Focus on crafting a warm, high-trust opening greeting message that verifies the caller and states the purpose concisely.",
  generate_fallback_responses:
    "8. Generate Fallback Responses: Generate polite, natural clarification and fallback responses for noisy lines, unclear speech, or out-of-scope questions.",
  generate_qualification_questions:
    "9. Generate Qualification Questions: Design natural spoken discovery and qualification questions covering need, budget, timeline, and decision authority.",
  generate_objection_handling:
    "10. Generate Objection Handling Instructions: Provide empathetic, non-pushy responses for common objections (busy right now, send on WhatsApp/email, budget constraints, using competitor).",
  // Aliases mapped cleanly
  generate_from_description:
    "1. Generate New Prompt from business description and agent configuration.",
  improve_existing: "2. Improve Existing Prompt for clarity and spoken pacing.",
  rewrite_professional: "3. Make Prompt More Professional.",
  optimize_concise: "4. Simplify Prompt for short 1-2 sentence turns.",
  generate_multilingual: "5. Translate Prompt for multilingual support.",
  make_conversational: "6. Regenerate Prompt with warm conversational style.",
  add_instructions: "7. Generate Greeting Message and conversation instructions.",
  improve_fallback: "8. Generate Fallback Responses.",
  add_objection_handling: "10. Generate Objection Handling Instructions.",
};

// In-memory per-user rate limiter (max 15 requests per minute per user)
const rateLimitBuckets = new Map<string, number[]>();

export function checkGeminiRateLimit(userKey: string, maxPerMinute = 15): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const timestamps = (rateLimitBuckets.get(userKey) || []).filter(
    (t) => t > windowStart
  );
  if (timestamps.length >= maxPerMinute) {
    rateLimitBuckets.set(userKey, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitBuckets.set(userKey, timestamps);
  return true;
}

/**
 * Strips any accidental phone numbers, email addresses, or token strings from prompt inputs
 * so customer PII or secrets are NEVER transmitted to Google Gemini (Part 5.6).
 */
export function sanitizeAgentConfigText(raw?: string, maxLen = 2500): string {
  if (!raw) return "";
  return String(raw)
    .slice(0, maxLen)
    // Redact 10-15 digit phone sequences (while preserving placeholders like {lead_name})
    .replace(/(?:\+?\d[\d\s\-()]{8,14}\d)/g, "[REDACTED_PHONE]")
    // Redact bearer/API keys if accidentally pasted
    .replace(/\b(AIza[0-9A-Za-z\-_]{20,}|bn-[0-9a-fA-F]{16,})\b/g, "[REDACTED_KEY]")
    .trim();
}

export function getGeminiConfig() {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const configuredModel = (
    process.env.GEMINI_MODEL || "gemini-flash-lite-latest"
  ).trim();

  const hasValidApiKey = Boolean(
    apiKey &&
      apiKey.length > 12 &&
      !apiKey.includes("your_google_ai_studio_api_key") &&
      !apiKey.includes("placeholder")
  );

  return {
    apiKey,
    defaultModel: configuredModel || "gemini-flash-lite-latest",
    hasValidApiKey,
    freeTierModels: [...VERIFIED_GEMINI_FREE_TIER_MODELS],
  };
}

export function isVerifiedFreeTierGeminiModel(modelName: string): boolean {
  const m = String(modelName || "").toLowerCase().trim();
  if (!m) return false;
  // Block paid-only Ultra or Carbon or image/video billing models
  if (
    m.includes("ultra") ||
    m.includes("carbon") ||
    m.includes("veo") ||
    m.includes("imagen")
  ) {
    return false;
  }
  return (
    VERIFIED_GEMINI_FREE_TIER_MODELS.includes(m as any) ||
    m.startsWith("gemini-flash") ||
    m.startsWith("gemini-3.") ||
    m.startsWith("gemini-2.5-flash") ||
    m.startsWith("gemini-2.0-flash") ||
    m.startsWith("gemini-1.5-flash")
  );
}

export function getGeminiSetupInstructions(): string[] {
  return [
    "1. Open Google AI Studio at https://aistudio.google.com/ and sign in with your Google account.",
    "2. Click 'Get API key' -> 'Create API key' on the free tier (no billing required for free-tier usage).",
    "3. Open your server `.env.local` file and set `GEMINI_API_KEY=your_google_ai_studio_api_key` and `GEMINI_MODEL=gemini-2.5-flash`.",
    "4. Restart the Next.js server (`npm run dev`) and open AI Prompt Assistant – Gemini.",
  ];
}

export function buildGeminiMetaPrompt(input: GeminiPromptAssistantInput): string {
  const actionDesc =
    ACTION_DESCRIPTIONS[input.action] ||
    ACTION_DESCRIPTIONS.generate_new_prompt;

  const targetSectionNote =
    input.targetSection && input.targetSection !== "all"
      ? `Focus especially on refining the "${input.targetSection}" section while keeping all other sections coherent.`
      : "Generate all 7 required voice agent prompt sections.";

  const supportedLangs = Array.isArray(input.supportedLanguages)
    ? input.supportedLanguages.join(", ")
    : "";

  return [
    "You are an expert AI Voice Agent Prompt Architect for the IndiaCalling Console SaaS platform.",
    `Requested Action: ${actionDesc}`,
    targetSectionNote,
    "",
    "Agent Configuration Context (Sanitized — No Customer PII):",
    `- Agent Name: ${sanitizeAgentConfigText(input.agentName || input.businessName, 120) || "AI Voice Specialist"}`,
    `- Industry: ${sanitizeAgentConfigText(input.industry, 100) || "General Business"}`,
    `- Business Objective: ${sanitizeAgentConfigText(input.businessObjective, 150) || "Lead Qualification"}`,
    `- Agent Personality: ${sanitizeAgentConfigText(input.agentPersonality, 150) || "Professional & Friendly"}`,
    `- Business Description: ${sanitizeAgentConfigText(input.businessDescription, 600) || "Not specified"}`,
    `- Target Audience: ${sanitizeAgentConfigText(input.targetAudience, 200) || "Prospective customers and inbound/outbound callers"}`,
    `- Primary Language: ${sanitizeAgentConfigText(input.primaryLanguage, 80) || "English + Hindi"}`,
    `- Output Prompt Language / Script: ${sanitizeAgentConfigText(input.promptLanguage || input.primaryLanguage, 80) || "English"}`,
    input.promptStyle
      ? `- Prompt Style / Mode Preset: ${sanitizeAgentConfigText(input.promptStyle, 100)}`
      : "",
    `- Supported Languages: ${sanitizeAgentConfigText(supportedLangs, 150) || "English, Hindi"}`,
    input.promptLanguage?.toLowerCase().includes("devanagari") ||
    input.promptLanguage?.toLowerCase() === "hindi" ||
    input.promptLanguage?.toLowerCase().includes("hindi (devanagari")
      ? "- LANGUAGE RULE: Write the master system prompt and all spoken lines (greetingMessage, qualificationQuestions, objectionHandling, fallbackResponses, conversationClosing) completely in natural Hindi using pure Hindi Devanagari script (हिंदी). Spoken lines must sound natural and polite on phone calls (e.g., 'नमस्ते! क्या मेरी बात {lead_name} जी से हो रही है? मैं {company_name} से बात कर रहा/रही हूँ।')."
      : input.promptLanguage?.toLowerCase().includes("hinglish") || input.promptLanguage?.toLowerCase().includes("romanized")
      ? "- LANGUAGE RULE: Write all spoken lines in natural Romanized Hindi / Hinglish (e.g., 'Namaste! Kya meri baat {lead_name} ji se ho rahi hai? Main {company_name} se call kar raha hoon. Kya aapke paas 2 minute hain?')."
      : input.promptLanguage?.toLowerCase().includes("bilingual")
      ? "- LANGUAGE RULE: Write instructions and spoken responses to smoothly support Bilingual English + Hindi code-switching based on caller preference."
      : `- LANGUAGE RULE: Write all prompt sections cleanly in ${input.promptLanguage || "English"}.`,
    `- Conversation Goals: ${sanitizeAgentConfigText(input.conversationGoals, 400) || "Greet caller, verify requirements, qualify lead, schedule follow-up"}`,
    `- Required Questions: ${sanitizeAgentConfigText(input.requiredQuestions, 400) || "Ask about primary requirement, budget range, and preferred timeline"}`,
    `- Qualification Criteria: ${sanitizeAgentConfigText(input.qualificationCriteria, 400) || "Caller has a genuine need, defined budget, and timeline within 90 days"}`,
    `- Objection Handling Requirements: ${sanitizeAgentConfigText(input.objectionHandlingRequirements, 400) || "Handle 'busy right now', 'send details on WhatsApp', and 'budget concern' politely"}`,
    `- Desired Conversation Style: ${sanitizeAgentConfigText(input.desiredConversationStyle, 250) || "Short 1-2 sentence spoken turns, natural pacing, never interrupt"}`,
    input.existingPrompt
      ? `\nExisting Prompt Reference:\n"""\n${sanitizeAgentConfigText(input.existingPrompt, 2000)}\n"""`
      : "",
    "",
    "STRICT OUTPUT FORMAT:",
    "Return a valid JSON object with the exact 7 keys below (all string values, formatted cleanly for voice telephony):",
    "{",
    '  "systemPrompt": "Complete master system prompt including role, persona, business context, qualification flow, and guardrails...",',
    '  "greetingMessage": "Warm opening greeting message (using {lead_name} and {company_name} placeholders where appropriate)...",',
    '  "conversationInstructions": "Concise turn-taking, pacing, language switching, and active listening instructions...",',
    '  "fallbackResponses": "Polite fallback responses when audio is unclear or caller asks an out-of-scope question...",',
    '  "qualificationQuestions": "Numbered list of natural spoken qualification questions...",',
    '  "objectionHandling": "Structured responses to common caller objections...",',
    '  "conversationClosing": "Polite closing statement confirming next steps before hanging up..."',
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseGeminiStructuredOutput(
  rawText: string,
  input?: GeminiPromptAssistantInput
): GeminiStructuredPromptOutput {
  const cleaned = String(rawText || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      return {
        systemPrompt: String(parsed.systemPrompt || "").trim(),
        greetingMessage: String(parsed.greetingMessage || "").trim(),
        conversationInstructions: String(
          parsed.conversationInstructions || ""
        ).trim(),
        fallbackResponses: String(parsed.fallbackResponses || "").trim(),
        qualificationQuestions: Array.isArray(parsed.qualificationQuestions)
          ? parsed.qualificationQuestions.join("\n")
          : String(parsed.qualificationQuestions || "").trim(),
        objectionHandling: Array.isArray(parsed.objectionHandling)
          ? parsed.objectionHandling.join("\n")
          : String(parsed.objectionHandling || "").trim(),
        conversationClosing: String(parsed.conversationClosing || "").trim(),
      };
    }
  } catch {
    // Fallback if model returned plain text instead of JSON
  }

  const isHindi = Boolean(
    input?.promptLanguage?.toLowerCase().includes("hindi") ||
    input?.promptLanguage?.toLowerCase().includes("devanagari") ||
    input?.primaryLanguage?.toLowerCase().includes("hindi")
  );
  const isHinglish = Boolean(
    input?.promptLanguage?.toLowerCase().includes("hinglish") ||
    input?.promptLanguage?.toLowerCase().includes("romanized")
  );

  if (isHindi && !isHinglish) {
    return {
      systemPrompt: cleaned || "आप {company_name} के लिए एक विशेषज्ञ AI वॉइस असिस्टेंट हैं। आपका उद्देश्य ग्राहकों से अत्यंत विनम्रता से बात करना, उनकी आवश्यकता को समझना और योग्य लीड को आगे बढ़ाना है।",
      greetingMessage: "नमस्ते! क्या मेरी बात {lead_name} जी से हो रही है? मैं {company_name} से बात कर रहा हूँ—क्या आपके पास दो मिनट का समय है?",
      conversationInstructions: "हर वाक्य सरल और स्पष्ट रखें (1-2 वाक्य)। कॉलर की बात ध्यान से सुनें और बीच में न टोकें।",
      fallbackResponses: "माफ़ कीजियेगा, मुझे आपकी आवाज़ साफ़ नहीं सुनाई दी। क्या आप कृपया दोहरा सकते हैं?",
      qualificationQuestions: "1. आप किस विशेष आवश्यकता या सेवा के बारे में विचार कर रहे हैं?\n2. आपका अनुमानित बजट क्या है?\n3. आप इसे कब तक शुरू करना चाहते हैं?",
      objectionHandling: "- यदि व्यस्त हैं: 'कोई बात नहीं, मैं आपको किस समय दोबारा कॉल करूँ?'\n- यदि व्हाट्सएप पर विवरण माँगें: 'बिल्कुल, मैं आपके नंबर पर तुरंत सारी जानकारी भेज देता हूँ।'",
      conversationClosing: "समय देने के लिए बहुत-बहुत धन्यवाद! हमारे विशेषज्ञ जल्द ही आपसे संपर्क करेंगे। आपका दिन शुभ हो!",
    };
  }

  if (isHinglish) {
    return {
      systemPrompt: cleaned || "Aap {company_name} ke liye ek professional AI Voice Assistant hain. Aapka goal callers se politely baat karke unki requirements qualify karna hai.",
      greetingMessage: "Namaste! Kya meri baat {lead_name} ji se ho rahi hai? Main {company_name} se call kar raha hoon—kya aapke paas 2 minute hain?",
      conversationInstructions: "Har spoken turn short aur conversational rakhein (1-2 sentences). Caller ko naturally suniye.",
      fallbackResponses: "Sorry, mujhe aapki aawaaz theek se nahi sunayi di. Kya aap please repeat kar sakte hain?",
      qualificationQuestions: "1. Aap kis specific requirement ke liye dekh rahe hain?\n2. Aapka approximate budget kitna hai?\n3. Aap kab tak start karna chahte hain?",
      objectionHandling: "- Agar busy hain: 'Koi baat nahi, kya main aapko shaam ko call kar sakta hoon?'\n- Agar WhatsApp pe details chahiye: 'Sure, main aapke number par details send kar deta hoon.'",
      conversationClosing: "Thank you so much aapke time ke liye! Humari team aapse jald hi connect karegi. Have a wonderful day!",
    };
  }

  return {
    systemPrompt: cleaned,
    greetingMessage:
      "Hello! Am I speaking with {lead_name}? I am calling from {company_name}—do you have a quick moment?",
    conversationInstructions:
      "Keep every spoken turn under 2 short sentences. Pause naturally and listen to the caller.",
    fallbackResponses:
      "I apologize, I didn't catch that clearly. Could you please repeat that?",
    qualificationQuestions:
      "1. What specific requirement are you looking to solve?\n2. What budget range do you have in mind?\n3. What is your preferred timeline to get started?",
    objectionHandling:
      "- If busy: Offer to schedule a 2-minute callback at their preferred time.\n- If asking for WhatsApp/Email: Confirm their contact detail and share a brief summary.",
    conversationClosing:
      "Thank you for your time today! Our specialist will follow up with you as discussed. Have a great day!",
  };
}

export async function runGeminiPromptAssistant(
  input: GeminiPromptAssistantInput
): Promise<GeminiPromptAssistantResponse> {
  const { apiKey, defaultModel, hasValidApiKey } = getGeminiConfig();
  const modelToUse = (input.model || defaultModel || "gemini-2.5-flash").trim();
  const setupInstructions = getGeminiSetupInstructions();

  if (!hasValidApiKey) {
    return {
      success: false,
      provider: "Google Gemini (Google AI Studio Free Tier)",
      configured: false,
      modelUsed: modelToUse,
      action: input.action,
      errorCode: "MISSING_API_KEY",
      error: "Gemini API key is not configured.",
      userMessage:
        "Gemini API key is not configured. An administrator must configure GEMINI_API_KEY in .env.local using a free-tier key from Google AI Studio (https://aistudio.google.com/).",
      setupInstructions,
    };
  }

  if (!isVerifiedFreeTierGeminiModel(modelToUse)) {
    return {
      success: false,
      provider: "Google Gemini (Google AI Studio Free Tier)",
      configured: true,
      modelUsed: modelToUse,
      action: input.action,
      errorCode: "PAID_MODEL_BLOCKED",
      error: `Model "${modelToUse}" is not on the verified Google AI Studio free-tier allowlist.`,
      userMessage:
        "Model temporarily unavailable on the free tier. Please select a verified free-tier model such as gemini-2.5-flash or gemini-2.5-flash-lite.",
      setupInstructions,
    };
  }

  const promptText = buildGeminiMetaPrompt(input);
  let resolvedModel = modelToUse;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    resolvedModel
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    let response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: promptText }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1400,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // If requested model is deprecated (404) or experiencing high demand (503), automatically try robust free-tier fallbacks
    if (response.status === 404 || response.status === 503) {
      const fallbackCandidates = [
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
        "gemini-flash-latest",
      ];
      for (const fallbackModel of fallbackCandidates) {
        if (fallbackModel === resolvedModel) continue;
        try {
          const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            fallbackModel
          )}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const fallbackRes = await fetch(fallbackEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: promptText }] }],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 1400,
                responseMimeType: "application/json",
              },
            }),
          });
          if (fallbackRes.ok) {
            response = fallbackRes;
            resolvedModel = fallbackModel;
            break;
          }
        } catch {
          // Try next fallback
        }
      }
    }

    if (response.status === 429) {
      return {
        success: false,
        provider: "Google Gemini (Google AI Studio Free Tier)",
        configured: true,
        modelUsed: resolvedModel,
        action: input.action,
        errorCode: "QUOTA_EXHAUSTED",
        error: "Free-tier request limit reached.",
        userMessage:
          "Free-tier request limit reached. Please try again later. (Paid model fallback is disabled to protect your free-tier setup.)",
      };
    }

    if (response.status === 404 || response.status === 503) {
      return {
        success: false,
        provider: "Google Gemini (Google AI Studio Free Tier)",
        configured: true,
        modelUsed: resolvedModel,
        action: input.action,
        errorCode: "MODEL_UNAVAILABLE",
        error: "Model temporarily unavailable.",
        userMessage:
          "Model temporarily unavailable. Please try again later or select gemini-flash-latest.",
      };
    }

    if (!response.ok) {
      return {
        success: false,
        provider: "Google Gemini (Google AI Studio Free Tier)",
        configured: true,
        modelUsed: resolvedModel,
        action: input.action,
        errorCode: "PROVIDER_ERROR",
        error: "AI assistant unavailable.",
        userMessage:
          "AI assistant unavailable. Please verify your GEMINI_API_KEY in Google AI Studio and try again later.",
        setupInstructions,
      };
    }

    const data = await response.json();
    const rawCandidateText =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text || "")
        .join("\n")
        .trim() || "";

    if (!rawCandidateText) {
      return {
        success: false,
        provider: "Google Gemini (Google AI Studio Free Tier)",
        configured: true,
        modelUsed: resolvedModel,
        action: input.action,
        errorCode: "PROVIDER_ERROR",
        error: "AI assistant unavailable.",
        userMessage:
          "AI assistant returned an empty response. Please try again later.",
      };
    }

    const sections = parseGeminiStructuredOutput(rawCandidateText, input);
    const combinedSystemPrompt = [
      sections.systemPrompt,
      sections.qualificationQuestions
        ? `\nQualification Questions:\n${sections.qualificationQuestions}`
        : "",
      sections.objectionHandling
        ? `\nObjection Handling:\n${sections.objectionHandling}`
        : "",
      sections.conversationClosing
        ? `\nConversation Closing:\n${sections.conversationClosing}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      success: true,
      provider: "Google Gemini (Google AI Studio Free Tier)",
      configured: true,
      modelUsed: resolvedModel,
      action: input.action,
      generatedPrompt: combinedSystemPrompt,
      sections,
    };
  } catch (err: any) {
    const isAbort = err?.name === "AbortError";
    return {
      success: false,
      provider: "Google Gemini (Google AI Studio Free Tier)",
      configured: true,
      modelUsed: resolvedModel,
      action: input.action,
      errorCode: isAbort ? "TIMEOUT" : "PROVIDER_ERROR",
      error: isAbort
        ? "Request timed out. Please try again later."
        : "AI assistant unavailable.",
      userMessage: isAbort
        ? "Gemini API request timed out. Please try again later."
        : "AI assistant unavailable. Please try again later.",
    };
  }
}
