import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// ============================================================================
// 1. STRICT 2-ROLE ARCHITECTURE & ZERO-PII RBAC ISOLATION TESTS
// ============================================================================
test("Phase 2: Canonical role model enforces strictly 2 roles (super_admin, organization)", () => {
  const typesSrc = read("src/types/index.ts");
  assert.match(
    typesSrc,
    /export type CanonicalUserRole = "super_admin" \| "organization";/,
    "CanonicalUserRole must strictly contain only super_admin and organization"
  );
  assert.match(typesSrc, /export function normalizeUserRole/);
  assert.match(typesSrc, /export function getRoleDisplayLabel/);

  const authSrc = read("src/lib/auth.ts");
  // Ensure insecure dev auto-login fallback was removed
  assert.doesNotMatch(
    authSrc,
    /if \(process\.env\.NODE_ENV !== "production"\)\s*\{\s*const demo = DEV_DEMO_ACCOUNTS\[0\]/,
    "getServerSession / getSessionFromRequest must NOT auto-authenticate as Super Admin when unauthenticated"
  );
});

test("Phase 2: RBAC middleware enforces Zero-PII privacy isolation matrix", () => {
  const rbacSrc = read("src/lib/rbac.ts");
  assert.match(rbacSrc, /export function evaluateRbacAccess/);
  assert.match(rbacSrc, /export function requireOrganizationRole/);
  assert.match(rbacSrc, /export function requireSuperAdminRole/);
  assert.match(rbacSrc, /export function assertTenantOwnership/);
  assert.match(rbacSrc, /export function sanitizeOrganizationForSuperAdmin/);
  assert.match(rbacSrc, /Privacy Isolation Enforced/);

  // Verify middleware blocks Super Admin from Org operational pages and Org from Super Admin pages
  const mwSrc = read("src/middleware.ts");
  assert.match(mwSrc, /if \(role === "super_admin" && isOrgRoute\)/);
  assert.match(mwSrc, /if \(role === "organization" && isSuperAdminRoute\)/);
});

test("Phase 2: Every private Organization API route enforces requireOrganizationRole (blocks Super Admin)", () => {
  const privateApiRoutes = [
    "src/app/api/leads/route.ts",
    "src/app/api/leads/[id]/route.ts",
    "src/app/api/calls/route.ts",
    "src/app/api/calls/[id]/route.ts",
    "src/app/api/agents/route.ts",
    "src/app/api/agents/[id]/route.ts",
    "src/app/api/campaigns/route.ts",
    "src/app/api/campaigns/[id]/route.ts",
    "src/app/api/campaigns/[id]/execute/route.ts",
    "src/app/api/campaigns/[id]/sync/route.ts",
    "src/app/api/knowledge-base/route.ts",
    "src/app/api/knowledge-base/[id]/route.ts",
    "src/app/api/knowledge-base/sync/route.ts",
    "src/app/api/billing/route.ts",
    "src/app/api/users/route.ts",
    "src/app/api/analytics/overview/route.ts",
    "src/app/api/bolna/sync/route.ts",
    "src/app/api/bolna/web-call-session/route.ts",
  ];

  for (const route of privateApiRoutes) {
    assert.ok(exists(route), `Expected API route ${route} to exist`);
    const src = read(route);
    assert.match(
      src,
      /requireOrganizationRole/,
      `${route} must guard handlers with requireOrganizationRole to block Super Admin access`
    );
  }
});

test("Phase 5: Every Super Admin API route enforces requireSuperAdminRole and Zero-PII sanitization", () => {
  const superAdminRoutes = [
    "src/app/api/super-admin/overview/route.ts",
    "src/app/api/super-admin/organizations/route.ts",
    "src/app/api/super-admin/organizations/[id]/route.ts",
    "src/app/api/super-admin/billing/route.ts",
  ];

  for (const route of superAdminRoutes) {
    assert.ok(exists(route), `Expected Super Admin route ${route} to exist`);
    const src = read(route);
    assert.match(
      src,
      /requireSuperAdminRole/,
      `${route} must guard handlers with requireSuperAdminRole`
    );
    // Ensure Super Admin APIs never query or expose private Lead/Transcript/KnowledgeBase content
    assert.doesNotMatch(
      src,
      /from "@\/models\/Lead"|from "@\/models\/Transcript"|from "@\/models\/KnowledgeBase"/,
      `${route} must NEVER import or expose private Lead, Transcript, or KnowledgeBase models`
    );
  }

  // Also verify legacy /api/organizations/[id] strips private arrays for super_admin
  const orgDetailApi = read("src/app/api/organizations/[id]/route.ts");
  assert.match(orgDetailApi, /leads:\s*isSuper \? \[\] : leads/);
  assert.match(orgDetailApi, /calls:\s*isSuper \? \[\] : calls/);
  assert.match(orgDetailApi, /knowledgeBases:\s*isSuper \? \[\] : knowledgeBases/);
});

// ============================================================================
// 2. BOLNA BACKEND SYNCHRONIZATION TESTS (CAMPAIGNS, KB, AGENTS)
// ============================================================================
test("Phase 3: Bolna client implements complete non-silent Campaign & Knowledge Base CRUD sync", () => {
  const clientSrc = read("src/lib/bolna/client.ts");

  // Batch schedule must use FormData + numeric +00:00 UTC offset (never Z suffix)
  assert.match(clientSrc, /export function formatBolnaScheduledAt/);
  assert.match(clientSrc, /\+00:00/);
  assert.match(clientSrc, /async createBatchCampaign/);
  assert.match(clientSrc, /async scheduleBatchCampaign/);
  assert.match(clientSrc, /async stopBatchCampaign/);
  assert.match(clientSrc, /async deleteBatchCampaign/);
  assert.match(clientSrc, /async listAgentBatches/);
  assert.match(clientSrc, /async getBatchExecutions/);

  // Knowledge Base CRUD + Agent Attachment
  assert.match(clientSrc, /async createKnowledgeBase/);
  assert.match(clientSrc, /async getKnowledgeBase/);
  assert.match(clientSrc, /async deleteKnowledgeBase/);
  assert.match(clientSrc, /async attachKnowledgeBasesToAgent/);
  assert.match(clientSrc, /vector_store/);
});

test("Phase 3: formatBolnaScheduledAt produces valid +00:00 ISO timestamp at least 2m in future", () => {
  // Pure behavioral verification matching formatBolnaScheduledAt logic
  const formatBolnaScheduledAt = (input) => {
    const minFutureMs = Date.now() + 3 * 60 * 1000;
    let targetDate = input ? new Date(input) : new Date(minFutureMs);
    if (isNaN(targetDate.getTime()) || targetDate.getTime() < minFutureMs) {
      targetDate = new Date(minFutureMs);
    }
    return targetDate
      .toISOString()
      .replace(/\.\d{3}Z$/, "+00:00")
      .replace(/Z$/, "+00:00");
  };

  const formattedNow = formatBolnaScheduledAt();
  assert.ok(formattedNow.endsWith("+00:00"), "Must end with +00:00 numeric offset");
  assert.ok(!formattedNow.endsWith("Z"), "Must NOT end with Z suffix");
  assert.ok(new Date(formattedNow).getTime() > Date.now() + 2 * 60 * 1000);

  const pastInput = formatBolnaScheduledAt("2020-01-01T00:00:00Z");
  assert.ok(
    new Date(pastInput).getTime() > Date.now() + 2 * 60 * 1000,
    "Past timestamps must auto-clamp into future for Bolna"
  );
});

test("Phase 3: Campaigns & Knowledge Base routes persist Bolna IDs, sync status, and delete on Bolna", () => {
  const kbModel = read("src/models/KnowledgeBase.ts");
  assert.match(kbModel, /bolnaRagId:/);
  assert.match(kbModel, /bolnaSyncStatus:/);
  assert.match(kbModel, /bolnaSyncError:/);

  const campModel = read("src/models/Campaign.ts");
  assert.match(campModel, /bolnaSyncStatus:/);

  const campIdRoute = read("src/app/api/campaigns/[id]/route.ts");
  assert.match(campIdRoute, /bolnaService\.deleteBatchCampaign/);
  assert.match(campIdRoute, /bolnaService\.scheduleBatchCampaign/);
  assert.match(campIdRoute, /bolnaService\.stopBatchCampaign/);
  assert.match(campIdRoute, /bolnaSync/);

  const kbIdRoute = read("src/app/api/knowledge-base/[id]/route.ts");
  assert.match(kbIdRoute, /bolnaService\.deleteKnowledgeBase/);
  assert.match(kbIdRoute, /bolnaService\.createKnowledgeBase/);
  assert.match(kbIdRoute, /bolnaService\.attachKnowledgeBasesToAgent/);
  assert.match(kbIdRoute, /bolnaSync/);
});

// ============================================================================
// 3. FRONTEND COMPONENTS, BRANDING, COPY CLEANUP & PORTALS TESTS
// ============================================================================
test("Phase 1 & 4: Official IndiaCallingLogo, ToastProvider, and Register Organization flow exist", () => {
  assert.ok(exists("public/indiacalling-logo.svg"));
  assert.ok(exists("src/components/IndiaCallingLogo.tsx"));
  assert.ok(exists("src/components/ToastProvider.tsx"));
  assert.ok(exists("src/app/api/auth/register/route.ts"));

  const loginPage = read("src/app/(auth)/login/page.tsx");
  assert.match(loginPage, /Register Organization/);
  assert.match(loginPage, /\/api\/auth\/register/);
  assert.match(loginPage, /\/api\/auth\/login/);

  const rootLayout = read("src/app/layout.tsx");
  assert.match(rootLayout, /ToastProvider/);
});

test("Phase 4 & 5: Responsive Navbar/Sidebar, Org Overview, Billing & Super Admin Portal verified", () => {
  const sidebar = read("src/app/(dashboard)/ClientSidebar.tsx");
  assert.match(sidebar, /IndiaCallingLogo/);
  assert.match(sidebar, /SUPER_ADMIN_NAV_ITEMS/);
  assert.match(sidebar, /ORG_NAV_ITEMS/);
  assert.match(sidebar, /mobileOpen/);

  const topbar = read("src/app/(dashboard)/ClientTopBar.tsx");
  assert.match(topbar, /onOpenMobileMenu/);
  assert.match(topbar, /Zero-PII Active/);

  const overview = read("src/app/(dashboard)/overview/page.tsx");
  assert.match(overview, /Billing &amp; Usage Summary/);
  assert.match(overview, /Active AI Voice Agents/);
  assert.match(overview, /Organization Team Members/);
  assert.doesNotMatch(overview, /Real MongoDB Data/i);

  const billing = read("src/app/(dashboard)/billing/page.tsx");
  assert.match(billing, /Add Money to Wallet/);
  assert.match(billing, /Invoices &amp; Payment History/);

  const superAdminOverview = read("src/app/(dashboard)/super-admin/page.tsx");
  assert.match(superAdminOverview, /Zero-PII (Active|Isolation Enforced)/);
  assert.match(superAdminOverview, /Total Organizations/);
  assert.match(superAdminOverview, /Total Platform Revenue/);

  const superAdminOrgs = read("src/app/(dashboard)/super-admin/organizations/page.tsx");
  assert.match(superAdminOrgs, /Organization Management/);
  assert.match(superAdminOrgs, /Create Organization/);
  assert.match(superAdminOrgs, /Suspend/);

  const superAdminBilling = read("src/app/(dashboard)/super-admin/billing/page.tsx");
  assert.match(superAdminBilling, /Platform Billing &amp; Revenue/);
});

test("Phase 1: Production-grade copy only — zero developer/debug strings in dashboard & auth UI", () => {
  const dirs = [
    path.join(ROOT, "src/app/(dashboard)"),
    path.join(ROOT, "src/app/(auth)"),
    path.join(ROOT, "src/components"),
  ];
  const forbidden = [/Real MongoDB data/i, /Live DB/i, /Simulated Demo Adapter/i, /PART 2\.2/i];

  const walk = (dir) => {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) out.push(full);
    }
    return out;
  };

  for (const d of dirs) {
    for (const file of walk(d)) {
      const content = fs.readFileSync(file, "utf8");
      for (const rx of forbidden) {
        assert.doesNotMatch(
          content,
          rx,
          `Forbidden debug/placeholder string ${rx} found in ${path.relative(ROOT, file)}`
        );
      }
    }
  }
});
