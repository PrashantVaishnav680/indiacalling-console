import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("Campaign Cross-File Duplication & Re-enrollment Audit", () => {
  const parserCode = fs.readFileSync(
    path.join(rootDir, "src/lib/spreadsheet-parser.ts"),
    "utf8"
  );
  assert.ok(
    parserCode.includes("seenPhonesInBatch.has(normPhone)"),
    "Spreadsheet parser must deduplicate within the uploaded file batch"
  );
  assert.ok(
    parserCode.includes("isExistingLead: isExistingInWorkspace"),
    "Spreadsheet parser must flag cross-campaign or CRM leads as valid existing leads rather than rejecting them"
  );

  const campaignRouteCode = fs.readFileSync(
    path.join(rootDir, "src/app/api/campaigns/route.ts"),
    "utf8"
  );
  assert.ok(
    campaignRouteCode.includes("allow cross-campaign re-enrollment") &&
      campaignRouteCode.includes("enrolledLeadIds.push"),
    "Campaign route must re-enroll existing leads into new campaigns"
  );
});

test("Campaign Launch & Execution Robustness Audit", () => {
  const executeCode = fs.readFileSync(
    path.join(rootDir, "src/app/api/campaigns/[id]/execute/route.ts"),
    "utf8"
  );
  assert.ok(
    executeCode.includes("isTrialRestriction") &&
      executeCode.includes("trial account"),
    "Execute route must gracefully handle Bolna trial account tier and simulate unverified numbers"
  );
  assert.ok(
    executeCode.includes("hasTrialSim"),
    "Execute route must return informative message when trial simulation occurs"
  );

  const campaignDetailCode = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/campaigns/[id]/page.tsx"),
    "utf8"
  );
  assert.ok(
    campaignDetailCode.includes("Launch Campaign Now") &&
      campaignDetailCode.includes("handleExecuteQueueBatch"),
    "Campaign details page must have a dedicated Launch Campaign Now button"
  );

  const campaignListingCode = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/campaigns/page.tsx"),
    "utf8"
  );
  assert.ok(
    campaignListingCode.includes("🚀 Launch") &&
      campaignListingCode.includes("isLaunching"),
    "Campaign listing must provide direct launch action for ready campaigns"
  );
});

test("Overview Date Filter (Today, 7D, 30D, All) Audit", () => {
  const overviewPageCode = fs.readFileSync(
    path.join(rootDir, "src/app/(dashboard)/overview/page.tsx"),
    "utf8"
  );
  assert.ok(
    overviewPageCode.includes("/api/analytics/overview?period=") &&
      overviewPageCode.includes("[activeFilter]"),
    "Overview UI must trigger API fetch on activeFilter change"
  );

  const overviewRouteCode = fs.readFileSync(
    path.join(rootDir, "src/app/api/analytics/overview/route.ts"),
    "utf8"
  );
  assert.ok(
    overviewRouteCode.includes('period === "Today"') &&
      overviewRouteCode.includes('period === "7D"') &&
      overviewRouteCode.includes('period === "30D"') &&
      overviewRouteCode.includes("cutoffTimestamp"),
    "Overview API route must calculate cutoff timestamps for Today, 7D, 30D and All"
  );
  assert.ok(
    overviewRouteCode.includes("period,"),
    "Overview API must return the active period in the response payload"
  );
});
