import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("1. Security & Environment Configuration Audit", () => {
  const envExample = fs.readFileSync(path.join(rootDir, ".env.example"), "utf8");
  assert.ok(
    !envExample.includes("bn-74185407bdff4c74b20d62b9001d1ded"),
    ".env.example must not contain leaked Bolna API key"
  );
  assert.ok(
    envExample.includes("BOLNA_BASE_URL=https://api.bolna.ai") &&
      envExample.includes("GEMINI_API_KEY=") &&
      envExample.includes("GEMINI_MODEL=gemini-2.5-flash"),
    ".env.example must include official Bolna v2 URL and Google Gemini free-tier configuration placeholders"
  );
  assert.ok(
    !fs.existsSync(path.join(rootDir, ".env.local")),
    ".env.local must not be bundled in deliverable archive"
  );
});

test("2. Preserved Official Bolna v2 Integration Audit", () => {
  const clientCode = fs.readFileSync(
    path.join(rootDir, "src/lib/bolna/client.ts"),
    "utf8"
  );
  assert.ok(clientCode.includes("/v2/agent"), "Must preserve /v2/agent");
  assert.ok(clientCode.includes("/v2/agent/all"), "Must preserve /v2/agent/all");
  assert.ok(clientCode.includes("/executions"), "Must preserve /executions");
  assert.ok(
    clientCode.includes('execution: "sequential"'),
    "Must preserve sequential toolchain execution"
  );
});

test("3. Part 1: Simplified 5-Step Campaign Creation, Upload (CSV/XLSX/XLS), Column Mapping, Validation & Lifecycle Audit", () => {
  const wizardCode = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/campaigns/new/page.tsx"),
    "utf8"
  );
  // Step 1 must have only the 4 simplified fields and the 8 required Campaign Objectives
  assert.ok(
    wizardCode.includes("Step 1: Campaign Details") &&
      wizardCode.includes("Lead Qualification") &&
      wizardCode.includes("Lead Generation") &&
      wizardCode.includes("Appointment Booking") &&
      wizardCode.includes("Sales & Conversion") &&
      wizardCode.includes("Customer Follow-up") &&
      wizardCode.includes("Customer Support") &&
      wizardCode.includes("Survey & Feedback") &&
      wizardCode.includes("Save as Draft") &&
      wizardCode.includes("Launch Campaign"),
    "/campaigns/new/page.tsx must implement simplified Step 1 with all 8 Campaign Objectives and Step 5 Save as Draft + Launch Campaign actions"
  );

  const parserCode = fs.readFileSync(
    path.join(rootDir, "src/lib/spreadsheet-parser.ts"),
    "utf8"
  );
  assert.ok(
    parserCode.includes("validateAndNormalizePhone") &&
      parserCode.includes("autoGuessColumnMapping") &&
      parserCode.includes("validateMappedDataset") &&
      parserCode.includes("generateErrorReportCsv") &&
      parserCode.includes("budget"),
    "Spreadsheet parser must provide phone validation, column mapping (including Budget), dataset validation, and CSV error report generation"
  );

  const parseUploadRoute = fs.readFileSync(
    path.join(rootDir, "src/app/api/campaigns/parse-upload/route.ts"),
    "utf8"
  );
  assert.ok(
    parseUploadRoute.includes("parseXlsxBuffer") &&
      parseUploadRoute.includes("inflateRawSync"),
    "parse-upload route must support XLSX OpenXML ZIP parsing"
  );

  const executeRoute = fs.readFileSync(
    path.join(rootDir, "src/app/api/campaigns/[id]/execute/route.ts"),
    "utf8"
  );
  assert.ok(
    executeRoute.includes("bolnaService.initiateCall"),
    "Campaign execution must reuse existing bolnaService.initiateCall"
  );
});

test("4. Part 2 & 3: SUPER_ADMIN Organization Overview, Organizations Management & RBAC Audit", () => {
  const overviewPage = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/overview/page.tsx"),
    "utf8"
  );
  assert.ok(
    overviewPage.includes("SUPER_ADMIN Platform & Organization Overview") &&
      overviewPage.includes("totalOrganizations") &&
      overviewPage.includes("activeOrganizations") &&
      overviewPage.includes("suspendedOrganizations") &&
      overviewPage.includes("pendingOrganizations"),
    "/overview/page.tsx must include the SUPER_ADMIN Organization Overview section with real metrics"
  );

  const orgsPage = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/organizations/page.tsx"),
    "utf8"
  );
  assert.ok(
    orgsPage.includes("Organizations Management") &&
      orgsPage.includes("Organization ID") &&
      orgsPage.includes("Total Users") &&
      orgsPage.includes("Total Agents") &&
      orgsPage.includes("Total Campaigns") &&
      orgsPage.includes("Total Calls") &&
      orgsPage.includes("Suspend"),
    "/organizations/page.tsx must display the required 11-column Organization Management table and actions"
  );

  const orgDetailPage = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/organizations/[id]/page.tsx"),
    "utf8"
  );
  assert.ok(
    orgDetailPage.includes("1. Organization Profile") &&
      orgDetailPage.includes("2. Primary Organization Administrator") &&
      orgDetailPage.includes("9. Integration Status") &&
      orgDetailPage.includes("10. Organization Settings"),
    "/organizations/[id]/page.tsx must implement all 10 organization detail sections"
  );

  const authCode = fs.readFileSync(
    path.join(rootDir, "src/lib/auth.ts"),
    "utf8"
  );
  assert.ok(
    authCode.includes("super_admin") &&
      authCode.includes("client_admin") &&
      authCode.includes("sales_rep") &&
      authCode.includes("normalizeUserRole"),
    "src/lib/auth.ts must support RBAC roles and normalize legacy salesperson"
  );
});

test("5. Part 4: Real Knowledge Base Module, Document Processing & Sidebar Navigation Audit", () => {
  const sidebarCode = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/ClientSidebar.tsx"),
    "utf8"
  );
  const orgsIdx = sidebarCode.indexOf("label: 'Organizations'");
  const agentsIdx = sidebarCode.indexOf("label: 'AI Agents'");
  const kbIdx = sidebarCode.indexOf("label: 'Knowledge Base'");
  const campaignsIdx = sidebarCode.indexOf("label: 'Campaigns'");
  const callHistoryIdx = sidebarCode.indexOf("label: 'Call History'");
  assert.ok(
    orgsIdx !== -1 &&
      agentsIdx > orgsIdx &&
      kbIdx > agentsIdx &&
      campaignsIdx > kbIdx &&
      callHistoryIdx > campaignsIdx,
    "ClientSidebar must order Overview -> Organizations -> AI Agents -> Knowledge Base -> Campaigns -> Call History"
  );

  const kbProcessor = fs.readFileSync(
    path.join(rootDir, "src/lib/knowledge-processor.ts"),
    "utf8"
  );
  assert.ok(
    kbProcessor.includes("extractDocxText") &&
      kbProcessor.includes("extractPdfText") &&
      kbProcessor.includes("processUploadedKnowledgeFile") &&
      kbProcessor.includes("buildKnowledgeBaseContextForAgent"),
    "knowledge-processor.ts must support PDF, TXT, DOCX, and CSV processing and agent prompt grounding"
  );

  const kbPage = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/knowledge-base/page.tsx"),
    "utf8"
  );
  assert.ok(
    kbPage.includes("Knowledge Base Management") &&
      kbPage.includes("Company Information") &&
      kbPage.includes("Pricing & Plans") &&
      kbPage.includes(".pdf,.txt,.docx,.csv"),
    "/knowledge-base/page.tsx must support creating, uploading, inspecting, and managing Knowledge Bases"
  );
});

test("6. Part 5 & 6: Google Gemini Free-Tier AI Prompt Assistant & 7-Tab Agent Studio UX Audit", () => {
  const studioPage = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/agents/new/page.tsx"),
    "utf8"
  );
  assert.ok(
    studioPage.includes("1. Agent") &&
      studioPage.includes("2. Intelligence") &&
      studioPage.includes("3. Languages") &&
      studioPage.includes("4. Calling") &&
      studioPage.includes("5. Engine") &&
      studioPage.includes("6. Tools") &&
      studioPage.includes("7. Extractions"),
    "/agents/new/page.tsx must implement all 7 configuration tabs"
  );
  assert.ok(
    studioPage.includes("AI Prompt Assistant – Gemini") &&
      studioPage.includes("/api/ai/prompt-assistant/generate") &&
      studioPage.includes("Confirm & Apply") &&
      !studioPage.includes("kb_company_overview"),
    "/agents/new/page.tsx must integrate AI Prompt Assistant – Gemini with confirmation before applying and remove fake sample KB checkboxes"
  );

  const geminiService = fs.readFileSync(
    path.join(rootDir, "src/lib/gemini/prompt-assistant.ts"),
    "utf8"
  );
  assert.ok(
    geminiService.includes("generate_new_prompt") &&
      geminiService.includes("improve_existing_prompt") &&
      geminiService.includes("make_prompt_professional") &&
      geminiService.includes("simplify_prompt") &&
      geminiService.includes("translate_prompt") &&
      geminiService.includes("regenerate_prompt") &&
      geminiService.includes("generate_greeting_message") &&
      geminiService.includes("generate_fallback_responses") &&
      geminiService.includes("generate_qualification_questions") &&
      geminiService.includes("generate_objection_handling") &&
      geminiService.includes("sanitizeAgentConfigText") &&
      geminiService.includes("isVerifiedFreeTierGeminiModel"),
    "Gemini service must support all 10 required prompt features, PII sanitization, and free-tier model verification"
  );
});

test("7. Centralized Call History & Real Bolna Testing Audit", () => {
  const callDetailPage = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/calls/[id]/page.tsx"),
    "utf8"
  );
  assert.ok(
    callDetailPage.includes("1. Call Overview") &&
      callDetailPage.includes("2. Call Audio Recording") &&
      callDetailPage.includes("3. Conversation Transcript") &&
      callDetailPage.includes("4. AI Analysis & Extractions") &&
      callDetailPage.includes("5. Lead Information") &&
      callDetailPage.includes("Search within transcript"),
    "/calls/[id]/page.tsx must include all 5 required sections and transcript search"
  );

  const testingPage = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/testing/page.tsx"),
    "utf8"
  );
  assert.ok(
    testingPage.includes("Real Bolna AI Agent Testing") &&
      testingPage.includes("Real Usage Charges Apply") &&
      !testingPage.includes("startSimulatedDemoCall"),
    "/testing/page.tsx must use real Bolna calls and warn about real usage charges"
  );
});

test("8. Agent & Campaign Call and Lead Counters Audit", () => {
  const countersCode = fs.readFileSync(
    path.join(rootDir, "src/lib/analytics-counters.ts"),
    "utf8"
  );
  assert.ok(
    countersCode.includes("computeAgentMetrics") &&
      countersCode.includes("computeCampaignMetrics") &&
      countersCode.includes("callsAcceptedByBolna") &&
      countersCode.includes("connectedCalls"),
    "analytics-counters.ts must compute verifiable Agent and Campaign counters"
  );
});
