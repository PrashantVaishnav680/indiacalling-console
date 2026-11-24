import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("Tab 6: Tools & Integrations Simplification Audit", () => {
  const wizardFile = fs.readFileSync(
    path.join(ROOT, "src/app/(dashboard)/agents/new/page.tsx"),
    "utf8"
  );

  // 1. Heading and description
  assert.ok(
    wizardFile.includes("Tools & Integrations"),
    "Should feature 'Tools & Integrations' heading"
  );
  assert.ok(
    wizardFile.includes(
      "Connect your AI agent with external services, automate lead management, schedule appointments and configure human handoff."
    ),
    "Should feature updated Tab 6 description"
  );

  // 2. The four integration cards
  assert.ok(
    wizardFile.includes("CRM Integration"),
    "Card A: CRM Integration should exist"
  );
  assert.ok(
    wizardFile.includes("IndiaCalling Built-in CRM (Default)"),
    "CRM provider should feature IndiaCalling Built-in CRM (Default)"
  );
  assert.ok(
    wizardFile.includes("Appointment Booking"),
    "Card B: Appointment Booking should exist"
  );
  assert.ok(
    wizardFile.includes("Real-Time Webhooks"),
    "Card C: Webhooks should exist"
  );
  assert.ok(
    wizardFile.includes("Human Handoff"),
    "Card D: Human Handoff should exist"
  );

  // 3. Conditional rendering & Advanced Configuration
  assert.ok(
    wizardFile.includes("Show Advanced Configuration"),
    "Webhooks should feature expandable Advanced Configuration"
  );
  assert.ok(
    wizardFile.includes("Signing Secret (Server-side HMAC verification)"),
    "Webhooks should feature signing secret input"
  );
  assert.ok(
    wizardFile.includes("Subscribed Backend Events"),
    "Webhooks should feature backend events selection"
  );

  // 4. Human Handoff details
  assert.ok(
    wizardFile.includes("Transfer Destination (E.164 Phone Number)"),
    "Human Handoff should feature transfer destination input"
  );
  assert.ok(
    wizardFile.includes("Target Department"),
    "Human Handoff should feature target department input"
  );
  assert.ok(
    wizardFile.includes("Transfer Condition"),
    "Human Handoff should feature transfer condition dropdown"
  );

  // 5. Unnecessary elements removed from Tab 6
  assert.ok(
    !wizardFile.includes("Search integrations..."),
    "Integration search bar should be removed"
  );
});

test("Agent Lifecycle Management & Campaign Execution Gate Audit", () => {
  const agentsListPage = fs.readFileSync(
    path.join(ROOT, "src/app/(dashboard)/agents/page.tsx"),
    "utf8"
  );
  const agentDetailPage = fs.readFileSync(
    path.join(ROOT, "src/app/(dashboard)/agents/[id]/page.tsx"),
    "utf8"
  );
  const executeRoute = fs.readFileSync(
    path.join(ROOT, "src/app/api/campaigns/[id]/execute/route.ts"),
    "utf8"
  );
  const agentModel = fs.readFileSync(
    path.join(ROOT, "src/models/Agent.ts"),
    "utf8"
  );

  // 1. Agent listing has Active/Pause toggle
  assert.ok(
    agentsListPage.includes("handleToggleAgentStatus"),
    "Agents listing page should have handleToggleAgentStatus"
  );
  assert.ok(
    agentsListPage.includes("AgentStatusBadge"),
    "Agents listing page should have AgentStatusBadge"
  );
  assert.ok(
    agentsListPage.includes("Pause"),
    "Agents listing page should have Pause button"
  );

  // 2. Agent detail page has Active/Pause toggle
  assert.ok(
    agentDetailPage.includes("handleToggleStatus"),
    "Agent detail page should have handleToggleStatus"
  );
  assert.ok(
    agentDetailPage.includes("Pause Agent"),
    "Agent detail page should have Pause Agent button"
  );

  // 3. Campaign execution route blocks paused / inactive agents
  assert.ok(
    executeRoute.includes('agent.status === "paused"') ||
      executeRoute.includes("agent.status === 'paused'"),
    "Campaign execute route must check if agent.status is paused"
  );
  assert.ok(
    executeRoute.includes("Agent Not Available"),
    "Campaign execute route must return error when agent is paused/inactive"
  );

  // 4. Mongoose schema persistence for integrations
  assert.ok(
    agentModel.includes("enabledIntegrations: [{ type: String }]"),
    "Agent model should persist enabledIntegrations"
  );
  assert.ok(
    agentModel.includes('crmProvider: { type: String, default: "none" }'),
    "Agent model should persist crmProvider"
  );
  assert.ok(
    agentModel.includes('calendarProvider: { type: String, default: "none" }'),
    "Agent model should persist calendarProvider"
  );
});

test("Renamed Allowed Calling Window Audit", () => {
  const overviewPage = fs.readFileSync(
    path.join(ROOT, "src/app/(dashboard)/overview/page.tsx"),
    "utf8"
  );

  assert.ok(
    overviewPage.includes("Allowed Calling Window"),
    "Overview page should have Allowed Calling Window card"
  );
  assert.ok(
    !overviewPage.includes("TRAI Calling Gate"),
    "Overview page should not have TRAI Calling Gate"
  );
});
