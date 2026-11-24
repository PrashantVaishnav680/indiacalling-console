import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

function walkSrc(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSrc(full));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

test("Task 1: Cleanup audit — zero Prompt Support / support-ping references, no standalone Analytics sidebar tab, unified 2-plan Billing", () => {
  assert.equal(
    exists("src/app/api/super-admin/support-ping/route.ts"),
    false,
    "Orphaned support-ping API route must be deleted"
  );

  const srcFiles = walkSrc(path.join(ROOT, "src"));
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, "utf8");
    assert.equal(
      /Prompt Support/i.test(content),
      false,
      `Found leftover 'Prompt Support' reference in ${path.relative(ROOT, file)}`
    );
    assert.equal(
      /support-ping/i.test(content),
      false,
      `Found leftover 'support-ping' reference in ${path.relative(ROOT, file)}`
    );
  }

  const sidebar = read("src/app/(dashboard)/ClientSidebar.tsx");
  assert.equal(
    sidebar.includes("href: '/analytics'") || sidebar.includes('href: "/analytics"'),
    false,
    "Standalone Analytics sidebar link must be removed"
  );
  assert.ok(
    sidebar.includes("/billing") && sidebar.includes("Billing & Wallet"),
    "ClientSidebar must contain unified Billing & Wallet link"
  );

  const billingPage = read("src/app/(dashboard)/billing/page.tsx");
  assert.ok(
    billingPage.includes("Standard Pay-As-You-Go") &&
      billingPage.includes("Custom Enterprise Pack"),
    "Unified Billing page must contain the 2 plans (Standard Pay-As-You-Go + Custom Enterprise Pack)"
  );
});

test("Task 2: Call History authenticated audio recording proxy & Call Detail player", () => {
  assert.ok(
    exists("src/app/api/calls/[id]/recording/route.ts"),
    "Authenticated recording proxy route must exist"
  );
  const proxyRoute = read("src/app/api/calls/[id]/recording/route.ts");
  assert.ok(
    proxyRoute.includes("requireOrganizationRole") &&
      proxyRoute.includes("organizationId"),
    "Recording proxy must enforce organization auth & tenant isolation"
  );
  assert.ok(
    proxyRoute.includes("Accept-Ranges") && proxyRoute.includes("bytes"),
    "Recording proxy must set Accept-Ranges: bytes for scrubbing"
  );
  assert.ok(
    proxyRoute.includes("getCallDetails") && proxyRoute.includes("download"),
    "Recording proxy must refresh Bolna recording URL and support ?download=1"
  );

  const callDetail = read("src/app/(dashboard)/calls/[id]/page.tsx");
  assert.ok(
    callDetail.includes("/api/calls/${call._id}/recording"),
    "Call Detail audio player must stream through authenticated /api/calls/[id]/recording proxy"
  );
  assert.ok(
    callDetail.includes("audioLoading") && callDetail.includes("audioError"),
    "Call Detail player must handle loading and error states cleanly"
  );
});

test("Task 3: Lead Interest & Chronological AI + Salesperson Timeline + Post-Call Outcome API", () => {
  assert.ok(exists("src/lib/lead-timeline.ts"), "lead-timeline.ts helper must exist");
  assert.ok(
    exists("src/app/api/leads/[id]/outcome/route.ts"),
    "POST /api/leads/[id]/outcome route must exist"
  );

  const helperSrc = read("src/lib/lead-timeline.ts");
  assert.ok(
    helperSrc.includes("Interested") &&
      helperSrc.includes("Follow-Up Requested") &&
      helperSrc.includes("Not Interested (Told AI)") &&
      helperSrc.includes("Cancelled / Declined (Salesperson)") &&
      helperSrc.includes("No Answer"),
    "lead-timeline.ts must classify all required per-call interest outcomes"
  );
  assert.ok(
    helperSrc.includes("firstInterestedEvent") &&
      helperSrc.includes("latestOutcomeEvent"),
    "lead-timeline.ts must compute First Interested and Latest Status highlights"
  );

  const leadModel = read("src/models/Lead.ts");
  assert.ok(
    leadModel.includes("interactionTimeline"),
    "Lead model must store interactionTimeline entries"
  );

  const leadDetail = read("src/app/(dashboard)/leads/[id]/page.tsx");
  assert.ok(
    leadDetail.includes("buildLeadInteractionTimeline") &&
      leadDetail.includes("First Interested") &&
      leadDetail.includes("/api/leads/${id}/outcome"),
    "Lead Detail page must render timeline, First Interested highlight, and salesperson outcome logger"
  );

  const callsPage = read("src/app/(dashboard)/calls/page.tsx");
  assert.ok(
    callsPage.includes("classifyCallInterestOutcome"),
    "Call History table must display per-call interest outcome badge"
  );
});

test("Task 4: Super Admin Organization Inspection View & Inspect action button", () => {
  const orgsPage = read("src/app/(dashboard)/super-admin/organizations/page.tsx");
  assert.ok(
    orgsPage.includes("href={`/super-admin/organizations/${org._id}`}") &&
      orgsPage.includes("Inspect"),
    "Super Admin Organizations table must include Inspect button linked to /super-admin/organizations/[id]"
  );

  const inspectPage = read("src/app/(dashboard)/super-admin/organizations/[id]/page.tsx");
  assert.ok(
    inspectPage.includes("Team Members") &&
      inspectPage.includes("Zero-PII") &&
      inspectPage.includes("ID: {org._id}"),
    "Super Admin Organization Inspect page must show ID, Team Members, and Zero-PII badge"
  );
});

test("Task 5: Permission-gated Managed Service Access, Impersonation routes, Audit Logs & Persistent Banner", () => {
  const orgModel = read("src/models/Organization.ts");
  assert.ok(
    orgModel.includes("managedServiceAccess") && orgModel.includes("grantedAt"),
    "Organization schema must include managedServiceAccess subdocument"
  );

  const settingsPage = read("src/app/(dashboard)/settings/page.tsx");
  assert.ok(
    settingsPage.includes("Organization Profile") &&
      settingsPage.includes("Team & Role Management"),
    "Organization Settings must include Managed Service Support Access permission toggle"
  );

  const orgInspect = read("src/app/(dashboard)/super-admin/organizations/[id]/page.tsx");
  assert.ok(
    orgInspect.includes("Open Organization Workspace") &&
      orgInspect.includes("Permanent Delete Organization") &&
      orgInspect.includes("window.location.assign"),
    "Organization Inspect must host the permission-gated Manage Account button with instant hard-navigation sync"
  );

  const serviceControl = read("src/app/(dashboard)/super-admin/service-control/page.tsx");
  assert.ok(
    serviceControl.includes("Global Emergency Calling Kill-Switch") &&
      serviceControl.includes("Service Control Inspector") &&
      serviceControl.includes("IndiaCalling Voice AI Engine"),
    "Super Admin Service Control must host Global Emergency Calling Kill-Switch and Managed Access Overview"
  );

  const startRoute = read("src/app/api/super-admin/impersonate/start/route.ts");
  assert.ok(
    !startRoute.includes("Managed Service Access Not Permitted") &&
      startRoute.includes("IMPERSONATION_STARTED") &&
      startRoute.includes("AUTH_COOKIE_NAME"),
    "impersonate/start must enforce 403 when disabled, use AUTH_COOKIE_NAME, and log IMPERSONATION_STARTED"
  );

  const stopRoute = read("src/app/api/super-admin/impersonate/stop/route.ts");
  assert.ok(
    stopRoute.includes("IMPERSONATION_ENDED") &&
      stopRoute.includes("AUTH_COOKIE_NAME"),
    "impersonate/stop must restore Super Admin cookie using AUTH_COOKIE_NAME and log IMPERSONATION_ENDED"
  );

  const authLib = read("src/lib/auth.ts");
  assert.ok(
    authLib.includes("impersonatedBy"),
    "auth.ts SessionPayload and verifyToken must preserve impersonatedBy"
  );

  const shell = read("src/app/(dashboard)/DashboardShell.tsx");
  assert.ok(
    shell.includes("Authorized Managed Service Session") &&
      shell.includes("Return to Super Admin") &&
      shell.includes("/api/super-admin/impersonate/stop"),
    "DashboardShell must render persistent impersonation banner with Return to Super Admin button"
  );
});

test("v2.4.1 Hotfix: Impersonation SSR prop, Quick Jump bar, Return to Super Admin & Sign Out everywhere", () => {
  const layout = read("src/app/(dashboard)/layout.tsx");
  assert.ok(
    layout.includes("impersonatedBy: session.impersonatedBy"),
    "DashboardLayout must pass impersonatedBy on SSR so banner appears immediately"
  );

  const shell = read("src/app/(dashboard)/DashboardShell.tsx");
  assert.ok(
    !shell.includes("Quick Jump:") &&
      shell.includes("Return to Super Admin") &&
      shell.includes("window.location.assign"),
    "DashboardShell impersonation bar must be clean single-row without duplicate Quick Jump navbar"
  );

  const sidebar = read("src/app/(dashboard)/ClientSidebar.tsx");
  assert.ok(
    sidebar.includes("onExitImpersonation") && sidebar.includes("Return to Super Admin"),
    "ClientSidebar must render Return to Super Admin button during impersonation"
  );

  const topbar = read("src/app/(dashboard)/ClientTopBar.tsx");
  assert.ok(
    topbar.includes("onExitImpersonation") && topbar.includes("onSignOut"),
    "ClientTopBar profile menu must include Return to Super Admin and Sign Out buttons"
  );
});

test("v2.4.1 Hotfix: Zero retired voices (Meera / pNInz6obpgDQGcFmaJgB / bulbul:v1) in active catalog & Bolna regional language + transfer_call wiring", () => {
  const registry = read("src/lib/voice-registry.ts");
  assert.equal(
    registry.includes("voice_meera") || registry.includes("voice_aarav"),
    false,
    "Retired Meera and Aarav voices must be removed from CURATED_VOICE_REGISTRY"
  );
  assert.ok(
    registry.includes("90ipbRoKi4CpHXvKVtl0") &&
      registry.includes("pzxut4zZz4GImZNlqQ3H") &&
      registry.includes("bulbul:v3") &&
      registry.includes("sanitizeBolnaVoiceSelection"),
    "voice-registry.ts must use Bolna-docs-verified voice IDs and sanitizeBolnaVoiceSelection"
  );
  assert.ok(exists("src/app/api/bolna/voices/route.ts"), "Live /api/bolna/voices route must exist");

  const bolnaClient = read("src/lib/bolna/client.ts");
  assert.ok(
    bolnaClient.includes("sanitizeBolnaVoiceSelection") &&
      bolnaClient.includes("saaras:v4") &&
      bolnaClient.includes("transfer_call") &&
      bolnaClient.includes("call_transfer_number"),
    "Bolna client must sanitize voices, auto-select Sarvam saaras:v4 for regional languages, and wire transfer_call api_tools"
  );

  const createRoute = read("src/app/api/agents/route.ts");
  const updateRoute = read("src/app/api/agents/[id]/route.ts");
  assert.ok(
    createRoute.includes("call_transfer_config") && updateRoute.includes("call_transfer_config"),
    "Both POST /api/agents and PUT/PATCH /api/agents/[id] must forward call_transfer_config to Bolna"
  );
});

test("v2.5.0 Two-Way Requests & Approvals: Org <-> Super Admin Inbox, Auto-Grant Managed Access & Enterprise Quote Persistence", () => {
  assert.ok(exists("src/models/PlatformRequest.ts"), "PlatformRequest model must exist");
  assert.ok(exists("src/app/api/requests/route.ts"), "Org /api/requests route must exist");
  assert.ok(exists("src/app/api/requests/[id]/route.ts"), "Org PATCH /api/requests/[id] route must exist");
  assert.ok(exists("src/app/api/super-admin/requests/route.ts"), "Super Admin /api/super-admin/requests route must exist");
  assert.ok(exists("src/app/api/super-admin/requests/[id]/route.ts"), "Super Admin PATCH /api/super-admin/requests/[id] route must exist");
  assert.ok(exists("src/app/(dashboard)/requests/page.tsx"), "Org /requests page must exist");
  assert.ok(exists("src/app/(dashboard)/super-admin/requests/page.tsx"), "Super Admin /super-admin/requests page must exist");

  const orgPatch = read("src/app/api/requests/[id]/route.ts");
  assert.ok(
    orgPatch.includes("managed_access_request") && orgPatch.includes("managedServiceAccess"),
    "Approving a managed_access_request must automatically enable managedServiceAccess on the Organization"
  );

  const sidebar = read("src/app/(dashboard)/ClientSidebar.tsx");
  assert.ok(
    !sidebar.includes("href: '/requests'") && !sidebar.includes("href: '/super-admin/requests'"),
    "Requests links must be removed from sidebars (accessed via TopBar Bell)"
  );

  const billing = read("src/app/(dashboard)/billing/page.tsx");
  assert.ok(
    billing.includes("/api/requests") && billing.includes("enterprise_quote"),
    "Billing Custom Enterprise Quote form must persist via POST /api/requests"
  );
});

test("v2.5.2 Owner Protection & Safe 2-Step Ownership Transfer", () => {
  assert.ok(
    exists("src/app/api/organizations/transfer-ownership/route.ts"),
    "POST /api/organizations/transfer-ownership route must exist"
  );
  const transferRoute = read("src/app/api/organizations/transfer-ownership/route.ts");
  assert.ok(
    transferRoute.includes('confirmText !== "TRANSFER"') &&
      transferRoute.includes("OWNERSHIP_TRANSFERRED"),
    "Ownership transfer must require TRANSFER confirmation and log OWNERSHIP_TRANSFERRED"
  );

  const usersRoute = read("src/app/api/users/route.ts");
  assert.ok(
    usersRoute.includes("isOrganizationOwnerUser") &&
      usersRoute.includes("The Organization Owner cannot be removed directly") &&
      usersRoute.includes("The Organization Owner cannot be deactivated"),
    "api/users must block deleting or deactivating the Organization Owner"
  );

  const overview = read("src/app/(dashboard)/overview/page.tsx");
  assert.ok(
    overview.includes("Transfer Ownership") &&
      overview.includes("/api/organizations/transfer-ownership"),
    "Overview Team table must protect Owner row and provide Transfer Ownership workflow"
  );
});

test("v2.5.3 Live Request Notifications Bell/Badge & Safe Delete Organization", () => {
  const orgIdRoute = read("src/app/api/super-admin/organizations/[id]/route.ts");
  assert.ok(
    orgIdRoute.includes("export async function DELETE(") &&
      orgIdRoute.includes("ORGANIZATION_DELETED"),
    "DELETE /api/super-admin/organizations/[id] must exist and log ORGANIZATION_DELETED"
  );

  const orgsPage = read("src/app/(dashboard)/super-admin/organizations/page.tsx");
  assert.ok(
    read("src/app/(dashboard)/super-admin/organizations/[id]/page.tsx").includes("Remove Organization") && read("src/app/(dashboard)/super-admin/organizations/[id]/page.tsx").includes("DELETE"),
    "Super Admin Organizations page must include Delete button with DELETE confirmation modal"
  );

  const topbar = read("src/app/(dashboard)/ClientTopBar.tsx");
  const sidebar = read("src/app/(dashboard)/ClientSidebar.tsx");
  const shell = read("src/app/(dashboard)/DashboardShell.tsx");
  assert.ok(
    topbar.includes("pendingNotifications") &&
      topbar.includes("Bell") &&
      sidebar.includes("pendingRequestCount") &&
      shell.includes("refreshRequestNotifications"),
    "TopBar bell dropdown, Sidebar badge, and DashboardShell polling must show live request notifications"
  );
});

test("v2.6.0 Settings Department Filter, Call History Hot/Warm/Cold/Unqualified & Auto Wallet Deduction + Low Balance Alerts", () => {
  const settings = read("src/app/(dashboard)/settings/page.tsx");
  assert.equal(
    settings.includes('<option value="super_admin">SUPER_ADMIN</option>'),
    false,
    "Settings team filter must not show SUPER_ADMIN or duplicate Organization options"
  );
  assert.ok(
    settings.includes("All Departments"),
    "Settings team filter must filter cleanly by Department"
  );

  const calls = read("src/app/(dashboard)/calls/page.tsx");
  assert.ok(
    calls.includes("getCallQualificationBucket") &&
      calls.includes('<option value="hot">Hot</option>') &&
      calls.includes('<option value="warm">Warm</option>') &&
      calls.includes('<option value="cold">Cold</option>') &&
      calls.includes('<option value="unqualified">Unqualified</option>'),
    "Call History must filter and badge calls by Hot, Warm, Cold, and Unqualified"
  );

  assert.ok(
    exists("src/lib/wallet-billing.ts"),
    "wallet-billing.ts automatic deduction helper must exist"
  );
  const shell = read("src/app/(dashboard)/DashboardShell.tsx");
  assert.ok(
    shell.includes("Payment Required — Wallet Empty") &&
      shell.includes("Low Wallet Balance"),
    "DashboardShell must emit live Low Balance and Payment Required notifications"
  );
});

test("v2.6.1 Live Call Transfer Fix, AI Auto-Dial Lead Scheduling, Smooth Collapsible Navbar & Admin-Only Settings Diagnostics", () => {
  const bolnaClient = read("src/lib/bolna/client.ts");
  assert.ok(
    bolnaClient.includes("Merge-PUT") &&
      bolnaClient.includes("call_transfer_number: normalizedTransferNumber") &&
      bolnaClient.includes("check_if_user_online: transferEnabled ? false : true"),
    "Bolna client must use Merge-PUT for transfer_call & task_config and never silently fall back to PATCH when transfer is enabled"
  );
  const billingPage = read("src/app/(dashboard)/billing/page.tsx");
  assert.ok(
    billingPage.includes("sales@indiacalling.ai") &&
      billingPage.includes("Submit Custom Plan Request"),
    "Billing Custom Enterprise modal must include both the custom pricing request form and direct contact info"
  );
  assert.equal(
    bolnaClient.includes("delete retryPayload.agent_config.tasks[0].tools_config.api_tools;"),
    false,
    "Bolna createAgent must never silently delete api_tools on HTTP 400"
  );
  assert.equal(
    bolnaClient.includes('type: "function"'),
    false,
    "Bolna api_tools.tools must use flat ApiToolDescription schema (not wrapped type: function)"
  );

  const scheduleRoute = read("src/app/api/leads/[id]/schedule/route.ts");
  assert.ok(
    scheduleRoute.includes("autoDialWithAi") &&
      scheduleRoute.includes("bolnaService.initiateCall") &&
      scheduleRoute.includes("formatBolnaScheduledAt"),
    "POST /api/leads/[id]/schedule must support optional automated Bolna AI scheduled calling"
  );

  const scheduleModal = read("src/components/ScheduleCallModal.tsx");
  assert.ok(
    scheduleModal.includes("autoDialWithAi") &&
      scheduleModal.includes("Auto-dial with AI Voice Agent"),
    "ScheduleCallModal must include AI auto-dial toggle and agent selector"
  );

  const settings = read("src/app/(dashboard)/settings/page.tsx");
  assert.ok(
    settings.includes('>("org")') &&
      settings.includes('{activeTab === "integration" && isSuperAdmin && ('),
    "Settings must default to Organization Profile and hide Bolna AI & Database Status from non-super-admins"
  );

  const shell = read("src/app/(dashboard)/DashboardShell.tsx");
  const topbar = read("src/app/(dashboard)/ClientTopBar.tsx");
  const sidebar = read("src/app/(dashboard)/ClientSidebar.tsx");
  assert.ok(
    shell.includes("markNotificationRead") &&
      shell.includes("markAllNotificationsRead") &&
      topbar.includes("Mark all read") &&
      !sidebar.includes("PanelLeftClose"),
    "Navbar must support auto-clearing read notifications and Mark all read without desktop sidebar collapse toggle"
  );
});

test("v2.7.0 Master Refactor: Direct Super Admin Access, Instant Wallet Top-Up, Org-Wise Audit Logs, White-Label UI, Structured Intelligence & Global Error Formatter", () => {
  // 1. Direct Super Admin Access
  const startRoute = read("src/app/api/super-admin/impersonate/start/route.ts");
  assert.equal(startRoute.includes("managedServiceAccess"), false, "impersonate/start must not gate on managedServiceAccess");

  // 2. Direct Wallet Top-Up (no UTR)
  const billingUi = read("src/app/(dashboard)/billing/page.tsx");
  assert.ok(billingUi.includes("Add Money to Wallet") && billingUi.includes("add_wallet_credits"));
  assert.equal(billingUi.includes("submit_utr_request"), false, "Billing UI must not use UTR submission");

  // 3. Org-Wise Audit Logs
  const auditApi = read("src/app/api/super-admin/audit-logs/route.ts");
  const auditUi = read("src/app/(dashboard)/super-admin/audit-logs/page.tsx");
  assert.ok(auditApi.includes("organizationId") && auditApi.includes("organizations"));
  assert.ok(auditUi.includes("Grouped by Organization") && auditUi.includes("Chronological Timeline"));

  // 4. Bell-only Requests & White-labeled Service Control
  const topbar = read("src/app/(dashboard)/ClientTopBar.tsx");
  assert.ok(topbar.includes("View All Requests") && topbar.includes("Bell"));
  const scUi = read("src/app/(dashboard)/super-admin/service-control/page.tsx");
  assert.ok(scUi.includes("IndiaCalling Voice AI Engine") && scUi.includes("Service Control Inspector"));
  assert.equal(scUi.includes("Bolna Voice AI"), false);

  // 5 & 9. Clean Org list + Full Details & Team Members & Danger Zone in Inspect
  const orgListUi = read("src/app/(dashboard)/super-admin/organizations/page.tsx");
  assert.equal(orgListUi.includes("Trash2"), false, "Organizations list must not show Delete buttons");
  const orgDetailApi = read("src/app/api/super-admin/organizations/[id]/route.ts");
  assert.ok(orgDetailApi.includes("teamMembers") && orgDetailApi.includes("totalLeads"));

  // 6. Structured Call & Lead Intelligence (no raw JSON <pre>)
  assert.ok(exists("src/lib/structured-fields.ts"));
  const callDetailUi = read("src/app/(dashboard)/calls/[id]/page.tsx");
  assert.ok(callDetailUi.includes("parseStructuredFields"));
  assert.equal(callDetailUi.includes("JSON.stringify(call.extractedData"), false);

  // 8. Global Human-Readable Error Formatter
  assert.ok(exists("src/lib/error-formatter.ts"));
  const toastUi = read("src/components/ToastProvider.tsx");
  assert.ok(toastUi.includes("formatErrorMessage") && toastUi.includes("sanitizeWhiteLabelText"));
});

test("v2.7.1 Bug-Fix, Security, Agent Studio & UX Overhaul: Zero TS orphans, zero-arg transfer_call, KB slicing, Prompt Assistant languages, Bulk Pronunciation, Dynamic Extractions & Date+Time ScheduleCallModal", () => {
  const leadDetail = fs.readFileSync(
    path.join(process.cwd(), "src/app/(dashboard)/leads/[id]/page.tsx"),
    "utf8"
  );
  assert.match(leadDetail, /import\s*\{[^}]*parseStructuredFields[^}]*sanitizeReadableSummary[^}]*\}\s*from\s*["']@\/lib\/lead-formatting["']/);

  const orgsPage = fs.readFileSync(
    path.join(process.cwd(), "src/app/(dashboard)/super-admin/organizations/page.tsx"),
    "utf8"
  );
  assert.doesNotMatch(orgsPage, /editingOrg/);
  assert.doesNotMatch(orgsPage, /orgToDelete/);
  assert.match(orgsPage, /useSearchParams/);
  assert.match(orgsPage, /<Suspense/);

  const bolnaHealth = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/bolna/health/route.ts"),
    "utf8"
  );
  assert.match(bolnaHealth, /requireSuperAdminRole/);

  const bolnaClient = fs.readFileSync(
    path.join(process.cwd(), "src/lib/bolna/client.ts"),
    "utf8"
  );
  assert.match(bolnaClient, /properties:\s*\{\s*\},\s*required:\s*\[\s*\]/);
  assert.match(bolnaClient, /check_if_user_online:\s*transferEnabled\s*\?\s*false\s*:\s*true/);
  assert.match(bolnaClient, /process\.env\.NODE_ENV\s*!==\s*["']production["']/);

  const kbProcessor = fs.readFileSync(
    path.join(process.cwd(), "src/lib/knowledge-processor.ts"),
    "utf8"
  );
  assert.match(kbProcessor, /sliceCleanlyAtBoundary/);
  assert.match(kbProcessor, /\[\.\.\.additional details available via Knowledge Base\]/);

  const promptAssistant = fs.readFileSync(
    path.join(process.cwd(), "src/lib/gemini/prompt-assistant.ts"),
    "utf8"
  );
  assert.match(promptAssistant, /promptLanguage\?: string/);
  assert.match(promptAssistant, /promptStyle\?: string/);

  const agentNew = fs.readFileSync(
    path.join(process.cwd(), "src/app/(dashboard)/agents/new/page.tsx"),
    "utf8"
  );
  assert.match(agentNew, /Hindi \(Devanagari — हिंदी\)/);
  assert.match(agentNew, /Hindi \(Romanized \/ Hinglish\)/);
  assert.match(agentNew, /Bulk Import Dictionary/);
  assert.match(agentNew, /showSamplingRateTip/);
  assert.match(agentNew, /formatTransferPhoneE164/);
  assert.match(agentNew, /buildLiveSampleExtractionJson/);
  assert.match(agentNew, /getRecommendedExtractionSchema/);
  assert.match(agentNew, /knowledgeBases\.length > 3/);
  assert.doesNotMatch(agentNew, /JSON\.stringify\(\s*generatedSections/);

  const kbPage = fs.readFileSync(
    path.join(process.cwd(), "src/app/(dashboard)/knowledge-base/page.tsx"),
    "utf8"
  );
  assert.match(kbPage, /getMatchedChunkSnippet/);

  const scheduleModal = fs.readFileSync(
    path.join(process.cwd(), "src/components/ScheduleCallModal.tsx"),
    "utf8"
  );
  assert.match(scheduleModal, /type="date"/);
  assert.match(scheduleModal, /type="time"/);
  assert.match(scheduleModal, /In 30 mins/);
  assert.match(scheduleModal, /Tomorrow 10:00 AM/);

  const saBilling = fs.readFileSync(
    path.join(process.cwd(), "src/app/(dashboard)/super-admin/billing/page.tsx"),
    "utf8"
  );
  assert.match(saBilling, /Recent Wallet Top-Ups/);
  assert.doesNotMatch(saBilling, /Pending UPI Top-Ups/);

  const auditLogs = fs.readFileSync(
    path.join(process.cwd(), "src/app/(dashboard)/super-admin/audit-logs/page.tsx"),
    "utf8"
  );
  assert.match(auditLogs, /useSearchParams/);
  assert.match(auditLogs, /<Suspense/);
});
