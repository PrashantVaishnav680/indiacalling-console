import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("User Fix 1: Organization Onboarding & Profile Business Categories Dropdown", () => {
  const settingsFile = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/settings/page.tsx"),
    "utf8"
  );

  // Must have BUSINESS_CATEGORIES array
  assert.ok(
    settingsFile.includes("BUSINESS_CATEGORIES"),
    "Settings must export/define BUSINESS_CATEGORIES"
  );
  assert.ok(
    settingsFile.includes("B2B SaaS & Technology"),
    "Categories must include B2B SaaS & Technology"
  );
  assert.ok(
    settingsFile.includes("Real Estate & Property"),
    "Categories must include Real Estate & Property"
  );

  // Onboarding tab must have a <select> for industry, not an input
  assert.match(
    settingsFile,
    /<select[^>]*value=\{onboardForm\.industry\}/,
    "Onboarding form must render a select dropdown for industry"
  );

  // Profile tab must have a Save button
  assert.ok(
    settingsFile.includes("Save Organization Profile"),
    "Organization Profile tab must have a Save button"
  );
  assert.ok(
    settingsFile.includes("handleUpdateOrgProfile"),
    "Organization Profile must have an update handler"
  );
});

test("User Fix 2: Bolna Campaign & Knowledge Base Sync Endpoints Exist", () => {
  const campaignSyncPath = path.join(
    rootDir,
    "src/app/api/campaigns/[id]/sync/route.ts"
  );
  const kbSyncPath = path.join(
    rootDir,
    "src/app/api/knowledge-base/sync/route.ts"
  );

  assert.ok(
    fs.existsSync(campaignSyncPath),
    "Campaign sync route must exist"
  );
  assert.ok(fs.existsSync(kbSyncPath), "Knowledge Base sync route must exist");

  const campaignSyncContent = fs.readFileSync(campaignSyncPath, "utf8");
  assert.ok(
    campaignSyncContent.includes("createBatchCampaign"),
    "Campaign sync must trigger Bolna createBatchCampaign"
  );

  const kbSyncContent = fs.readFileSync(kbSyncPath, "utf8");
  assert.ok(
    kbSyncContent.includes("buildKnowledgeBaseContextForAgent"),
    "KB sync must build grounded context for agents"
  );
});

test("User Fix 3: Call History Web-Call Removal & Sales Handoff Clean Lead Name", () => {
  const callsPage = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/calls/page.tsx"),
    "utf8"
  );
  assert.ok(
    !callsPage.includes('{ id: "web_call"'),
    "Calls direction tabs must not include web_call option"
  );
  assert.ok(
    callsPage.includes('c.direction === "web_call"'),
    "Calls filter must exclude web_calls from display"
  );

  const handoffPage = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/sales-handoff/page.tsx"),
    "utf8"
  );
  assert.ok(
    handoffPage.includes('l.name || "Prospect"'),
    "Sales handoff must display clean lead name"
  );
});

test("User Fix 4: Smooth Animations Added in globals.css and Dashboard Layout", () => {
  const globalsCss = fs.readFileSync(
    path.join(rootDir, "src/app/globals.css"),
    "utf8"
  );
  assert.ok(
    globalsCss.includes("@keyframes fadeIn"),
    "globals.css must include fadeIn keyframe"
  );
  assert.ok(
    globalsCss.includes(".animate-fade-in"),
    "globals.css must define .animate-fade-in class"
  );

  const layoutFile = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/layout.tsx"),
    "utf8"
  );
  assert.ok(
    layoutFile.includes("animate-fade-in"),
    "Dashboard layout must apply animate-fade-in to main container"
  );
});
