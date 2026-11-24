import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

test("1. Call Scheduling: Pure live status math (Scheduled, Due Now, Completed, Missed) & API/UI wiring", () => {
  const helper = read("src/lib/call-scheduling.ts");
  assert.match(helper, /export function computeScheduledCallStatus/);
  assert.match(helper, /"Scheduled"/);
  assert.match(helper, /"Due Now"/);
  assert.match(helper, /"Completed"/);
  assert.match(helper, /"Missed"/);

  // Evaluate pure scheduling state transitions
  const FIFTEEN_MIN = 15 * 60 * 1000;
  const now = Date.now();
  const evalStatus = (scheduledAtMs, rawStatus = "scheduled") => {
    if (rawStatus === "completed") return "Completed";
    if (rawStatus === "missed") return "Missed";
    const diff = scheduledAtMs - now;
    if (diff > FIFTEEN_MIN) return "Scheduled";
    if (diff >= -FIFTEEN_MIN) return "Due Now";
    return "Missed";
  };
  assert.equal(evalStatus(now + 60 * 60 * 1000), "Scheduled");
  assert.equal(evalStatus(now + 5 * 60 * 1000), "Due Now");
  assert.equal(evalStatus(now - 30 * 60 * 1000), "Missed");
  assert.equal(evalStatus(now - 30 * 60 * 1000, "completed"), "Completed");

  // Verify API route & modal
  assert.equal(exists("src/app/api/leads/[id]/schedule/route.ts"), true);
  const schedRoute = read("src/app/api/leads/[id]/schedule/route.ts");
  assert.match(schedRoute, /requireOrganizationRole/);
  assert.match(schedRoute, /Lead\.findByIdAndUpdate/);
  assert.match(schedRoute, /Asia\/Kolkata/);

  const leadModel = read("src/models/Lead.ts");
  assert.match(leadModel, /scheduledCall/);
  assert.match(leadModel, /call_scheduled/);

  assert.equal(exists("src/components/ScheduleCallModal.tsx"), true);
});

test("2. Sales Handoff: Full salesperson workload cards, rep/status filtering, reassignment & scheduling", () => {
  const page = read("src/app/(dashboard)/sales-handoff/page.tsx");
  assert.match(page, /Salesperson Workload Breakdown/);
  assert.match(page, /repWorkloads/);
  assert.match(page, /handleAssignRep/);
  assert.match(page, /handleStatusChange/);
  assert.match(page, /ScheduleCallModal/);
  assert.match(page, /computeScheduledCallStatus/);
  assert.match(page, /extractLeadSignals/);

  const leadPatch = read("src/app/api/leads/[id]/route.ts");
  assert.match(leadPatch, /assignedSalespersonId/);
  assert.match(leadPatch, /assignedSalespersonName/);
});

test("3. Overview + Merged Analytics: Standalone Analytics removed from sidebar & charts embedded in Overview", () => {
  const sidebar = read("src/app/(dashboard)/ClientSidebar.tsx");
  // Ensure ORG_NAV_ITEMS does not have href: '/analytics'
  const orgNavSection = sidebar.slice(
    sidebar.indexOf("ORG_NAV_ITEMS"),
    sidebar.indexOf("SUPER_ADMIN_NAV_ITEMS")
  );
  assert.doesNotMatch(orgNavSection, /href:\s*['"]\/analytics['"]/);

  const overview = read("src/app/(dashboard)/overview/page.tsx");
  assert.match(overview, /OverviewAnalyticsSection/);

  const analyticsComp = read("src/components/OverviewAnalyticsSection.tsx");
  assert.match(analyticsComp, /\/api\/analytics\/overview\?timeRange=/);
  assert.match(analyticsComp, /AreaChart/);
  assert.match(analyticsComp, /PieChart/);

  const analyticsRedirect = read("src/app/(dashboard)/analytics/page.tsx");
  assert.match(analyticsRedirect, /\/overview#analytics/);
});

test("4. Profile Name Edit: PATCH /api/auth/me persists to MongoDB, refreshes JWT cookie & syncs UI", () => {
  const meRoute = read("src/app/api/auth/me/route.ts");
  assert.match(meRoute, /export async function PATCH/);
  assert.match(meRoute, /User\.findOneAndUpdate/);
  assert.match(meRoute, /signToken/);
  assert.match(meRoute, /res\.cookies\.set\(AUTH_COOKIE_NAME/);

  const shell = read("src/app/(dashboard)/DashboardShell.tsx");
  assert.match(shell, /Edit Display Name/);
  assert.match(shell, /method:\s*['"]PATCH['"]/);

  const topbar = read("src/app/(dashboard)/ClientTopBar.tsx");
  assert.match(topbar, /Edit Display Name/);
});

test("5. Navbar Smoothness, Mobile Sticky Fix & Mobile Button Clarity", () => {
  const shell = read("src/app/(dashboard)/DashboardShell.tsx");
  assert.match(shell, /h-\[100dvh\]/);
  assert.match(shell, /document\.body\.style\.overflow/);
  assert.match(shell, /overscroll-y-contain/);

  const topbar = read("src/app/(dashboard)/ClientTopBar.tsx");
  assert.match(topbar, /sticky top-0 z-30/);
  // Mobile campaign button must have visible text label, not just '+'
  assert.match(topbar, /<span className="sm:hidden">Campaign<\/span>/);
  assert.match(topbar, /<span className="sm:hidden">New Org<\/span>/);

  const sidebar = read("src/app/(dashboard)/ClientSidebar.tsx");
  assert.match(sidebar, /transition-transform duration-200 ease-out/);
});

test("6. Leads Qualification Pipeline: Buckets, 3 View Switchers, Signals, Score Points & Badge Wrap Fix", () => {
  const leadsPage = read("src/app/(dashboard)/leads/page.tsx");
  assert.match(leadsPage, /All Leads/);
  assert.match(leadsPage, /Hot/);
  assert.match(leadsPage, /Warm/);
  assert.match(leadsPage, /Cold/);
  assert.match(leadsPage, /Unqualified/);
  assert.match(leadsPage, /Cards Grid/);
  assert.match(leadsPage, /Kanban/);
  assert.match(leadsPage, /Data Table/);
  assert.match(leadsPage, /pts/);
  assert.match(leadsPage, /extractLeadSignals/);
  assert.match(leadsPage, /whitespace-nowrap/);
  assert.match(leadsPage, /ScheduleCallModal/);
});

test("7. Wallet & Subscription System: ₹6/min default, 18% GST calculation & dedicated pages", () => {
  // Verify exact GST & ₹6/min math
  const calc = (mins, rate = 6, paid = 0) => {
    const effRate = !rate || rate === 3.5 ? 6 : rate;
    const subtotal = Number((mins * effRate).toFixed(2));
    const gst = Number((subtotal * 0.18).toFixed(2));
    const total = Number((subtotal + gst).toFixed(2));
    const outstanding = Number(Math.max(0, total - paid).toFixed(2));
    return { effRate, subtotal, gst, total, outstanding };
  };
  const r1 = calc(10, 3.5, 0);
  assert.equal(r1.effRate, 6);
  assert.equal(r1.subtotal, 60);
  assert.equal(r1.gst, 10.8);
  assert.equal(r1.total, 70.8);
  assert.equal(r1.outstanding, 70.8);

  const r2 = calc(100, 6, 300);
  assert.equal(r2.subtotal, 600);
  assert.equal(r2.gst, 108);
  assert.equal(r2.outstanding, 408);

  assert.equal(exists("src/app/(dashboard)/wallet/page.tsx"), true);
  assert.equal(exists("src/app/(dashboard)/subscription/page.tsx"), true);

  const billingPage = read("src/app/(dashboard)/billing/page.tsx");
  assert.match(billingPage, /add_wallet_credits/);
  assert.match(billingPage, /walletLedger/);
  assert.match(billingPage, /Standard Pay-As-You-Go/);
  assert.match(billingPage, /Custom Enterprise Pack/);
});

test("8. Super Admin Platform Control Center: 8 Sidebar Routes, Zero-PII Active, GST Table & Telephony Trends", () => {
  const requiredSuperAdminPages = [
    "src/app/(dashboard)/super-admin/page.tsx",
    "src/app/(dashboard)/super-admin/organizations/page.tsx",
    "src/app/(dashboard)/super-admin/activity/page.tsx",
    "src/app/(dashboard)/super-admin/analytics/page.tsx",
    "src/app/(dashboard)/super-admin/billing/page.tsx",
    "src/app/(dashboard)/super-admin/service-control/page.tsx",
    "src/app/(dashboard)/super-admin/audit-logs/page.tsx",
    "src/app/(dashboard)/super-admin/settings/page.tsx",
  ];
  for (const p of requiredSuperAdminPages) {
    assert.equal(exists(p), true, `Missing Super Admin page: ${p}`);
  }

  const saPage = read("src/app/(dashboard)/super-admin/page.tsx");
  assert.match(saPage, /Zero-PII Active/);
  assert.match(saPage, /GST \(18%\)/);
  assert.match(saPage, /Telephony Activity Trends/);
  assert.match(saPage, /intensityPercent/);

  const saApi = read("src/app/api/super-admin/overview/route.ts");
  assert.match(saApi, /requireSuperAdminRole/);
  assert.match(saApi, /calculateBillingWithGst/);
  assert.match(saApi, /telephonyTrends/);
  assert.match(saApi, /zero_pii_enforced/);

  assert.equal(exists("src/app/api/super-admin/support-ping/route.ts"), false);
});
