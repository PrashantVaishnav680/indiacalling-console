import { requireOrganizationRole, assertTenantOwnership } from "@/lib/rbac";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, isAuthorizedRole } from "@/lib/auth";
import {
  checkGeminiRateLimit,
  GeminiPromptAction,
  getGeminiConfig,
  getGeminiSetupInstructions,
  runGeminiPromptAssistant,
} from "@/lib/gemini/prompt-assistant";

const VALID_ACTIONS: GeminiPromptAction[] = [
  "generate_new_prompt",
  "improve_existing_prompt",
  "make_prompt_professional",
  "simplify_prompt",
  "translate_prompt",
  "regenerate_prompt",
  "generate_greeting_message",
  "generate_fallback_responses",
  "generate_qualification_questions",
  "generate_objection_handling",
  "generate_from_description",
  "improve_existing",
  "rewrite_professional",
  "make_conversational",
  "add_instructions",
  "add_objection_handling",
  "improve_fallback",
  "generate_multilingual",
  "optimize_concise",
];

export async function GET(req: NextRequest) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { defaultModel, hasValidApiKey, freeTierModels } = getGeminiConfig();

  return NextResponse.json({
    provider: "Google Gemini (Google AI Studio Free Tier)",
    configured: hasValidApiKey,
    defaultModel,
    models: freeTierModels,
    aiStudioUrl: "https://aistudio.google.com/",
    docsUrl: "https://ai.google.dev/gemini-api/docs",
    pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    setupInstructions: hasValidApiKey ? [] : getGeminiSetupInstructions(),
  });
}

export async function POST(req: NextRequest) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      !isAuthorizedRole(session.role, [
        "super_admin",
        "organization",
        "organization",
      ])
    ) {
      return NextResponse.json(
        {
          error: "Forbidden",
          userMessage:
            "Only authorized Agent Studio administrators can generate or modify agent prompts.",
        },
        { status: 403 }
      );
    }

    const rateKey = `${session.userId || session.email}`;
    if (!checkGeminiRateLimit(rateKey, 15)) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "RATE_LIMITED",
          error: "Free-tier request limit reached.",
          userMessage:
            "Free-tier request limit reached. Please wait a minute and try again.",
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const action = (body.action || "generate_new_prompt") as GeminiPromptAction;

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: "Invalid Prompt Assistant action" },
        { status: 400 }
      );
    }

    const result = await runGeminiPromptAssistant({
      action,
      targetSection: body.targetSection || "all",
      agentName: body.agentName || body.businessName,
      businessName: body.businessName,
      industry: body.industry,
      businessObjective: body.businessObjective || body.agentObjective,
      agentPersonality: body.agentPersonality,
      businessDescription: body.businessDescription,
      targetAudience: body.targetAudience,
      primaryLanguage: body.primaryLanguage || body.preferredLanguage,
      promptLanguage: body.promptLanguage || body.primaryLanguage || body.preferredLanguage,
      promptStyle: body.promptStyle,
      supportedLanguages: body.supportedLanguages,
      conversationGoals: body.conversationGoals,
      requiredQuestions: body.requiredQuestions,
      qualificationCriteria: body.qualificationCriteria,
      objectionHandlingRequirements: body.objectionHandlingRequirements,
      desiredConversationStyle:
        body.desiredConversationStyle || body.desiredImprovement,
      existingPrompt: body.existingPrompt,
      model: body.model,
    });

    if (!result.success) {
      const httpStatus =
        result.errorCode === "MISSING_API_KEY"
          ? 503
          : result.errorCode === "QUOTA_EXHAUSTED"
          ? 429
          : result.errorCode === "PAID_MODEL_BLOCKED"
          ? 400
          : 502;
      return NextResponse.json(result, { status: httpStatus });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        success: false,
        errorCode: "PROVIDER_ERROR",
        error: "AI assistant unavailable.",
        userMessage: "AI assistant unavailable. Please try again later.",
      },
      { status: 500 }
    );
  }
}
