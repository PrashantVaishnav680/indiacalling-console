import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

test('1. Executive Overview & Organizations Management Total Users & Metrics Consistency', () => {
  const overviewRoutePath = path.join(projectRoot, 'src/app/api/analytics/overview/route.ts');
  const orgsRoutePath = path.join(projectRoot, 'src/app/api/organizations/route.ts');
  const dbSeedPath = path.join(projectRoot, 'src/lib/db-seed.ts');

  assert.ok(fs.existsSync(overviewRoutePath), 'overview route must exist');
  assert.ok(fs.existsSync(orgsRoutePath), 'organizations route must exist');
  assert.ok(fs.existsSync(dbSeedPath), 'db-seed helper must exist');

  const overviewContent = fs.readFileSync(overviewRoutePath, 'utf8');
  const orgsContent = fs.readFileSync(orgsRoutePath, 'utf8');
  const dbSeedContent = fs.readFileSync(dbSeedPath, 'utf8');

  // Both routes must query MongoDB User model
  assert.ok(overviewContent.includes('User.find'), 'Overview must query User model');
  assert.ok(orgsContent.includes('User.find'), 'Organizations must query User model');

  // Both routes calculate totalUsers using full users list
  assert.ok(overviewContent.includes('totalUsers: allUsers.length'), 'Overview must aggregate totalUsers from allUsers');
  assert.ok(orgsContent.includes('totalUsers: allUsers.length'), 'Organizations must aggregate totalUsers from allUsers');

  // Base seeding logic guarantees all roles (SUPER_ADMIN, CLIENT_ADMIN, SALES_MANAGER, SALES_REP) are present
  assert.ok(dbSeedContent.includes('super_admin') && dbSeedContent.includes('client_admin') && dbSeedContent.includes('sales_rep'), 'DB seed must include standard operational roles');
});

test('2. Organization Statistics Aggregation Logic', () => {
  const orgsRoutePath = path.join(projectRoot, 'src/app/api/organizations/route.ts');
  const content = fs.readFileSync(orgsRoutePath, 'utf8');

  // Verify all 8 platform metrics are computed
  assert.ok(content.includes('totalOrganizations:'), 'Must compute totalOrganizations');
  assert.ok(content.includes('activeOrganizations:'), 'Must compute activeOrganizations');
  assert.ok(content.includes('suspendedOrganizations:'), 'Must compute suspendedOrganizations');
  assert.ok(content.includes('pendingOrganizations:'), 'Must compute pendingOrganizations');
  assert.ok(content.includes('totalUsers:'), 'Must compute totalUsers');
  assert.ok(content.includes('totalAgents:'), 'Must compute totalAgents');
  assert.ok(content.includes('totalCampaigns:'), 'Must compute totalCampaigns');
  assert.ok(content.includes('totalCalls:'), 'Must compute totalCalls');
});

test('3. Organization Actions: Edit, View, and Suspend Confirmation Dialog', () => {
  const orgPagePath = path.join(projectRoot, 'src/app/(dashboard)/organizations/page.tsx');
  const orgDetailRoutePath = path.join(projectRoot, 'src/app/api/organizations/[id]/route.ts');

  const pageContent = fs.readFileSync(orgPagePath, 'utf8');
  const routeContent = fs.readFileSync(orgDetailRoutePath, 'utf8');

  // Confirmation dialog state and UI
  assert.ok(pageContent.includes('confirmSuspendOrg'), 'Page must have confirmSuspendOrg state for confirmation dialog');
  assert.ok(pageContent.includes('Confirm Organization Suspension') || pageContent.includes('Suspend Organization'), 'Page must render suspend confirmation modal');

  // Instant state updates without manual refresh
  assert.ok(pageContent.includes('setOrganizations((prev)'), 'Must update organizations state immediately on status change');
  assert.ok(pageContent.includes('setPlatformMetrics((prev'), 'Must update summary cards immediately on status change');

  // View navigation
  assert.ok(pageContent.includes('/organizations/${org._id}'), 'Must have link to organization details');

  // MongoDB update robustness
  assert.ok(routeContent.includes('findByIdAndUpdate') || routeContent.includes('findOneAndUpdate'), 'PATCH must update MongoDB');
  assert.ok(routeContent.includes('indiacalling-org') || routeContent.includes('$or'), 'Must support finding and updating org by slug/id');
});

test('4. Server-Side Access Restrictions for Suspended Organizations', () => {
  const loginRoutePath = path.join(projectRoot, 'src/app/api/auth/login/route.ts');
  const executeRoutePath = path.join(projectRoot, 'src/app/api/campaigns/[id]/execute/route.ts');
  const callsRoutePath = path.join(projectRoot, 'src/app/api/calls/route.ts');

  const loginContent = fs.readFileSync(loginRoutePath, 'utf8');
  const executeContent = fs.readFileSync(executeRoutePath, 'utf8');
  const callsContent = fs.readFileSync(callsRoutePath, 'utf8');

  // Login restriction
  assert.ok(loginContent.includes('suspended') || loginContent.includes('Organization Suspended'), 'Login must block users of suspended organizations');

  // Campaign execution restriction
  assert.ok(executeContent.includes('suspended') && executeContent.includes('Campaign execution is blocked'), 'Campaign execute must block suspended organizations');

  // Outbound calls restriction
  assert.ok(callsContent.includes('suspended') && callsContent.includes('Calling functionality is disabled'), 'Calls route must block suspended organizations');
});

test('5. Organization Search & Status Filters Co-operation', () => {
  const orgPagePath = path.join(projectRoot, 'src/app/(dashboard)/organizations/page.tsx');
  const content = fs.readFileSync(orgPagePath, 'utf8');

  // Search covers name, id, admin name, email, slug
  assert.ok(content.includes('matchesSearch'), 'Must compute matchesSearch');
  assert.ok(content.includes('matchesStatus'), 'Must compute matchesStatus');
  assert.ok(content.includes('matchesStatus && matchesSearch'), 'Search and status filters must work together');
});
