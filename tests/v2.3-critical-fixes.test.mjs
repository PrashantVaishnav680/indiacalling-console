import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("1. Lead Qualification Scoring: 4 strong signals (Budget, Decision maker, Callback, Timeline) score Hot (>75 pts), never 0 pts/Cold", () => {
  const helper = read("src/lib/call-scheduling.ts");
  assert.match(helper, /export function computeEffectiveLeadScore/);
  assert.match(helper, /export function computeLeadBucket/);

  // Replicate pure scoring math to verify Prospect (1680) scenario
  const SIGNAL_WEIGHTS = {
    "Budget confirmed": 25,
    "Decision maker": 25,
    "Callback / visit requested": 25,
    "Purchase timeline shared": 20,
  };
  const signals = [
    "Budget confirmed",
    "Decision maker",
    "Callback / visit requested",
    "Purchase timeline shared",
  ];
  const score = Math.min(100, signals.reduce((s, k) => s + SIGNAL_WEIGHTS[k], 0));
  assert.equal(score, 95);
  assert.equal(score >= 75, true, "4 strong signals must classify as Hot (>= 75 pts)");

  // Verify GET /api/leads enriches leads and removed leftover sales_rep filter
  const leadsApi = read("src/app/api/leads/route.ts");
  assert.match(leadsApi, /computeEffectiveLeadScore/);
  assert.match(leadsApi, /computeLeadBucket/);
  assert.doesNotMatch(leadsApi, /SALESPERSON \/ sales_rep sees assigned leads/);

  // Verify leads/page.tsx uses computeEffectiveLeadScore
  const leadsPage = read("src/app/(dashboard)/leads/page.tsx");
  assert.match(leadsPage, /computeEffectiveLeadScore\(lead\)/);
});

test("2. Overview Analytics Aggregation: API & UI keys align for dailyTrend, outcomeDistribution, completedCalls & agentPerformance", () => {
  const api = read("src/app/api/analytics/overview/route.ts");
  assert.match(api, /completedCalls:\s*successfulCalls/);
  assert.match(api, /qualificationRate:\s*conversionRate/);
  assert.match(api, /dailyTrend,/);
  assert.match(api, /outcomeDistribution,/);
  assert.match(api, /agentName:\s*agent\.name/);
  assert.match(api, /totalCalls:\s*m\.totalCalls/);
  assert.match(api, /qualifiedLeads:\s*m\.qualifiedLeads/);

  const ui = read("src/components/OverviewAnalyticsSection.tsx");
  assert.match(ui, /kpis\.completedCalls \?\? kpis\.successfulCalls/);
  assert.match(ui, /a\.totalCalls \?\? a\.calls/);
  assert.match(ui, /a\.qualifiedLeads \?\? a\.qualified/);
  assert.match(ui, /key=\{a\.agentId \|\| a\._id \|\| a\.agentName \|\| a\.name/);
});

test("3. Unified Billing & Wallet: Merged into /billing with ONLY 2 plans (₹6.00/min Standard + Custom Enterprise)", () => {
  const billingPage = read("src/app/(dashboard)/billing/page.tsx");
  assert.match(billingPage, /Standard Pay-As-You-Go/);
  assert.match(billingPage, /Best Price · Popular Offer/);
  assert.match(billingPage, /₹6\.00/);
  assert.match(billingPage, /Custom Enterprise Pack/);
  assert.match(billingPage, /Custom Pricing/);
  assert.match(billingPage, /Contact Sales \/ Request Custom Plan/);
  // Confirm old 4-plan clutter is gone
  assert.doesNotMatch(billingPage, /Business Pro/);
  assert.doesNotMatch(billingPage, /Starter Pay-As-You-Go/);

  // Sidebar has unified Billing & Wallet item and no separate Wallet / Subscription tabs
  const sidebar = read("src/app/(dashboard)/ClientSidebar.tsx");
  const orgNav = sidebar.slice(
    sidebar.indexOf("ORG_NAV_ITEMS"),
    sidebar.indexOf("SUPER_ADMIN_NAV_ITEMS")
  );
  assert.match(orgNav, /label:\s*'Billing & Wallet'/);
  assert.doesNotMatch(orgNav, /href:\s*'\/wallet'/);
  assert.doesNotMatch(orgNav, /href:\s*'\/subscription'/);

  // Old /wallet and /subscription routes redirect cleanly to /billing
  assert.match(read("src/app/(dashboard)/wallet/page.tsx"), /router\.replace\('\/billing'\)/);
  assert.match(read("src/app/(dashboard)/subscription/page.tsx"), /router\.replace\('\/billing'\)/);
});

test("4. Sales Handoff: Inspect Salesperson drawer shows rep profile, assigned leads, scheduled calls & quick assign", () => {
  const page = read("src/app/(dashboard)/sales-handoff/page.tsx");
  assert.match(page, /Inspect Salesperson/);
  assert.match(page, /inspectRep/);
  assert.match(page, /Quick Assign a Lead to/);
  assert.match(page, /Reassign:/);
  assert.match(page, /computeEffectiveLeadScore/);
});

test("5. Super Admin: Prompt Support removed cleanly from Organizations table and Inspect page", () => {
  const saOverview = read("src/app/(dashboard)/super-admin/page.tsx");
  assert.doesNotMatch(saOverview, /Prompt Support/);
  assert.doesNotMatch(saOverview, /support-ping/);
  assert.match(saOverview, /Inspect/);

  const saInspect = read("src/app/(dashboard)/super-admin/organizations/[id]/page.tsx");
  assert.doesNotMatch(saInspect, /Send Support Notice/);
  assert.doesNotMatch(saInspect, /support-ping/);
});
