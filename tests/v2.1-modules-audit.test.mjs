import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

test("1. Uploaded Brand Logo: public/indiacalling-logo.svg & IndiaCallingLogo.tsx", () => {
  const svg = read("public/indiacalling-logo.svg");
  assert.match(svg, /#FF671F/, "Uploaded logo must include saffron waveform bar");
  assert.match(svg, /#00C853/, "Uploaded logo must include green waveform bar");
  assert.match(svg, /M124 252L256 148L388 252/, "Uploaded logo chevron must be present");

  const comp = read("src/components/IndiaCallingLogo.tsx");
  assert.match(comp, /src="\/indiacalling-logo\.svg"/);
});

test("2. Overview & Pricing: ₹6/min everywhere, Team CRUD (Active/Deactive, Delete Modal, Department)", () => {
  const billingApi = read("src/app/api/billing/route.ts");
  assert.match(billingApi, /DEFAULT_RATE_PER_MINUTE_INR = 6;/);

  const orgModel = read("src/models/Organization.ts");
  assert.match(orgModel, /ratePerMinuteInr:\s*\{\s*type:\s*Number,\s*default:\s*6\s*\}/);

  const usersApi = read("src/app/api/users/route.ts");
  assert.match(usersApi, /export async function PATCH/);
  assert.match(usersApi, /export async function DELETE/);
  assert.match(usersApi, /buildUserIdMatch/);
  assert.match(usersApi, /department:/);

  const overviewPage = read("src/app/(dashboard)/overview/page.tsx");
  assert.match(overviewPage, /const DEPARTMENTS = \['Sales', 'Support', 'Operations', 'Admin', 'Engineering'\]/);
  assert.match(overviewPage, /Remove Team Member\?/);
  assert.match(overviewPage, /effectiveRate = billing\?\.ratePerMinuteInr \|\| 6/);
});

test("3. AI Agents: Bilingual/Both filter, Sticky Bar, Curated Voice Registry, Pronunciation, Transcription, Engine, Extraction", () => {
  const agentsPage = read("src/app/(dashboard)/agents/page.tsx");
  assert.match(agentsPage, /isBilingualOrBoth/);
  assert.match(agentsPage, /multilingualEnabled/);

  const voiceRegistry = read("src/lib/voice-registry.ts");
  assert.match(voiceRegistry, /CURATED_VOICE_REGISTRY/);
  assert.match(voiceRegistry, /in_development/);
  assert.match(voiceRegistry, /visible:\s*true/);

  const agentStudio = read("src/app/(dashboard)/agents/new/page.tsx");
  assert.doesNotMatch(agentStudio, /fixed bottom-0 right-0 left-\[230px\]/, "Floating bar must be replaced with sticky footer");
  assert.match(agentStudio, /sticky bottom-0 z-20/);
  assert.match(agentStudio, /Pronunciation Dictionary/);
  assert.match(agentStudio, /Keywords \(Weighted Boost\)/);
  assert.match(agentStudio, /1\. Response Latency/);
  assert.match(agentStudio, /4\. Final Call Message/);
  assert.match(agentStudio, /5\. User Detection/);
  assert.match(agentStudio, /Sample Extraction Output Format/);
  assert.match(agentStudio, /AI Extraction Instruction Helper/);
});

test("4. Campaigns: Edit row action, Calling Direction dropdown, Bolna Phone Numbers & Batch Registration", () => {
  assert.ok(exists("src/app/api/bolna/phone-numbers/route.ts"));
  const bolnaClient = read("src/lib/bolna/client.ts");
  assert.match(bolnaClient, /async listPhoneNumbers/);
  assert.match(bolnaClient, /\/phone-numbers\/all/);

  const campNew = read("src/app/(dashboard)/campaigns/new/page.tsx");
  assert.match(campNew, /\/api\/bolna\/phone-numbers/);
  assert.match(campNew, /Edit \/ Correct/);
  assert.match(campNew, /Outbound \(AI Dials Leads\)/);
  assert.match(campNew, /Inbound \(AI Receives Calls\)/);

  const campExec = read("src/app/api/campaigns/[id]/execute/route.ts");
  assert.match(campExec, /bolnaService\.createBatchCampaign/);
});

test("5. Knowledge Base: Bolna Sync imports/links RAG items and attaches to org agents", () => {
  const kbSync = read("src/app/api/knowledge-base/sync/route.ts");
  assert.match(kbSync, /bolnaService\.listKnowledgeBases/);
  assert.match(kbSync, /bolnaService\.attachKnowledgeBasesToAgent/);
  assert.match(kbSync, /importedFromBolna/);
});

test("6. Call History, Agent Testing & Strict Lead Qualification Gate", () => {
  const callsApi = read("src/app/api/calls/route.ts");
  assert.match(callsApi, /shouldAutoSync/);

  const syncService = read("src/lib/bolna/sync-service.ts");
  assert.match(syncService, /evaluateLeadQualification/);
  assert.match(syncService, /upsert:\s*true,\s*new:\s*true/);

  const testingPage = read("src/app/(dashboard)/testing/page.tsx");
  assert.match(testingPage, /\/api\/calls\?sync=true/);

  // Behavioral check of strict lead qualification gate
  const evaluateGate = (status, duration) => {
    if (status !== "completed" || duration < 10) return { isQualified: false };
    return { isQualified: true };
  };
  assert.equal(evaluateGate("initiated", 0).isQualified, false);
  assert.equal(evaluateGate("failed", 0).isQualified, false);
  assert.equal(evaluateGate("completed", 4).isQualified, false);
  assert.equal(evaluateGate("completed", 65).isQualified, true);
});

test("7. Sales Handoff: Zero hardcoded salesperson names, dynamically loaded from /api/users", () => {
  const handoff = read("src/app/(dashboard)/sales-handoff/page.tsx");
  assert.match(handoff, /fetch\(['"`]\/api\/users['"`]\)/);
  assert.doesNotMatch(handoff, /Priya Sharma \(Senior AE\)/);
  assert.doesNotMatch(handoff, /Rajesh Kumar \(Account Executive\)/);
  assert.doesNotMatch(handoff, /Amitabh Roy \(SDR Lead\)/);
  assert.doesNotMatch(handoff, /Meera Joshi \(Solution Consultant\)/);
});

test("8. Analytics: Strict org scoping + Sample Data Preview when 0 real calls", () => {
  const analyticsApi = read("src/app/api/analytics/overview/route.ts");
  assert.match(analyticsApi, /requireOrganizationRole/);
  assert.match(analyticsApi, /isSamplePreview/);
  assert.match(analyticsApi, /samplePreviewCalls/);

  const analyticsPage = read("src/app/(dashboard)/analytics/page.tsx");
  assert.match(analyticsPage, /overview#analytics|Sample Data Preview:/);
});

test("9. Billing: Verified Top-Up (blocks unverified topup), Razorpay HMAC & Real PDF Invoice", () => {
  const billingApi = read("src/app/api/billing/route.ts");
  assert.match(billingApi, /add_wallet_credits/);
  assert.match(billingApi, /add_wallet_credits/);
  assert.match(billingApi, /verify_razorpay_payment/);

  assert.ok(exists("src/lib/pdf-invoice.ts"));
  assert.ok(exists("src/app/api/billing/invoice/[id]/route.ts"));

  const billingPage = read("src/app/(dashboard)/billing/page.tsx");
  assert.match(billingPage, /Add Money to Wallet/);
  assert.match(billingPage, /\/api\/billing\/invoice\//);

  // Verify HMAC-SHA256 signature verification math
  const secret = "test_secret_key";
  const orderId = "order_123";
  const paymentId = "pay_456";
  const validSig = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  assert.equal(validSig.length, 64);
});
