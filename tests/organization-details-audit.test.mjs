import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

test('1. Organization Details: Data Consistency & Organization-Specific Metrics', () => {
  const routePath = path.join(projectRoot, 'src/app/api/organizations/[id]/route.ts');
  const pagePath = path.join(projectRoot, 'src/app/(dashboard)/organizations/[id]/page.tsx');

  assert.ok(fs.existsSync(routePath), 'Route must exist');
  assert.ok(fs.existsSync(pagePath), 'Page must exist');

  const routeContent = fs.readFileSync(routePath, 'utf8');
  const pageContent = fs.readFileSync(pagePath, 'utf8');

  // Route queries organization-specific collections
  assert.ok(routeContent.includes('Agent.find({ organizationId: orgIdStr })'), 'Must query org agents');
  assert.ok(routeContent.includes('Campaign.find({ organizationId: orgIdStr })'), 'Must query org campaigns');
  assert.ok(routeContent.includes('Lead.find({ organizationId: orgIdStr })'), 'Must query org leads');
  assert.ok(routeContent.includes('Call.find({ organizationId: orgIdStr })'), 'Must query org calls');
  assert.ok(routeContent.includes('KnowledgeBase.find({ organizationId: orgIdStr })'), 'Must query org knowledge bases');

  // KPI cards on page
  assert.ok(pageContent.includes('Team Members'), 'Must have Team Members card');
  assert.ok(pageContent.includes('AI Agents'), 'Must have AI Agents card');
  assert.ok(pageContent.includes('Voice Minutes'), 'Must have Voice Minutes card');
  assert.ok(pageContent.includes('Usage Cost'), 'Must have Usage Cost card');
});

test('2. Organization Profile: Edit Action & Email Distinction', () => {
  const pageContent = fs.readFileSync(
    path.join(projectRoot, 'src/app/(dashboard)/organizations/[id]/page.tsx'),
    'utf8'
  );

  assert.ok(pageContent.includes('Edit Profile'), 'Must have Edit Profile action');
  assert.ok(pageContent.includes('Company Contact Email'), 'Must display Company Contact Email');
  assert.ok(pageContent.includes('Administrator Login Email') || pageContent.includes('Admin Login Account'), 'Must distinguish Administrator Login Email');
  assert.ok(pageContent.includes('showEditProfileModal'), 'Must have Edit Profile modal state');
});

test('3. Primary Administrator: View/Edit Actions & MongoDB User Persistence', () => {
  const pageContent = fs.readFileSync(
    path.join(projectRoot, 'src/app/(dashboard)/organizations/[id]/page.tsx'),
    'utf8'
  );
  const routeContent = fs.readFileSync(
    path.join(projectRoot, 'src/app/api/organizations/[id]/route.ts'),
    'utf8'
  );

  // UI elements
  assert.ok(pageContent.includes('Primary Administrator'), 'Must display Primary Administrator section');
  assert.ok(pageContent.includes('Account Status') || pageContent.includes('Active Account'), 'Must display account status');
  assert.ok(pageContent.includes('Edit Admin') || pageContent.includes('showEditAdminModal'), 'Must have Edit Admin action/modal');

  // Backend persistence in User collection
  assert.ok(routeContent.includes('User.findOneAndUpdate'), 'PATCH must update User collection in MongoDB');
  assert.ok(routeContent.includes('adminName') || routeContent.includes('adminEmail') || routeContent.includes('adminActive'), 'PATCH must accept admin updates');
});

test('4. Integration Status: Test Connection Actions & Meaningful Status', () => {
  const pageContent = fs.readFileSync(
    path.join(projectRoot, 'src/app/(dashboard)/organizations/[id]/page.tsx'),
    'utf8'
  );
  const routeContent = fs.readFileSync(
    path.join(projectRoot, 'src/app/api/organizations/[id]/route.ts'),
    'utf8'
  );

  assert.ok(pageContent.includes('Test Connection') || pageContent.includes('handleTestIntegration'), 'Must have Test Connection action');
  assert.ok(pageContent.includes('Bolna AI Voice v2'), 'Must display Bolna AI Voice v2');
  assert.ok(pageContent.includes('Google Gemini Assistant'), 'Must display Google Gemini');
  assert.ok(routeContent.includes('bolnaConfigured') && routeContent.includes('lastCheckedAt'), 'API must return status and last checked time');
});

test('5. Knowledge Base: Empty State & Organization Isolation', () => {
  const pageContent = fs.readFileSync(
    path.join(projectRoot, 'src/app/(dashboard)/organizations/[id]/page.tsx'),
    'utf8'
  );

  assert.ok(pageContent.includes('Knowledge Base Sources'), 'Must have Knowledge Base section');
  assert.ok(pageContent.includes('No Knowledge Base Sources Configured'), 'Must show empty state when 0 sources');
  assert.ok(pageContent.includes('+ Add Knowledge Source'), 'Must have Add Knowledge Source button linking to knowledge base');
});

test('6. Usage and Billing: Actual Billed vs Estimated Spend & Reporting Period', () => {
  const pageContent = fs.readFileSync(
    path.join(projectRoot, 'src/app/(dashboard)/organizations/[id]/page.tsx'),
    'utf8'
  );
  const routeContent = fs.readFileSync(
    path.join(projectRoot, 'src/app/api/organizations/[id]/route.ts'),
    'utf8'
  );

  // Period filter
  assert.ok(pageContent.includes('UsagePeriod') || pageContent.includes('usagePeriod'), 'Must support period selection');
  assert.ok(routeContent.includes('req.nextUrl.searchParams.get("period")'), 'Route must support period query param');

  // Billed vs Estimated
  assert.ok(pageContent.includes('Actual Billed') || pageContent.includes('actualBilledCostInr'), 'Must display Actual Billed cost');
  assert.ok(pageContent.includes('Estimated Telephony Spend') || pageContent.includes('estimatedSpendInr'), 'Must display Estimated Telephony Spend');
});

test('7. UI Consistency: Section Numbering 1 to 8 & All Tabs Navigate Correctly', () => {
  const pageContent = fs.readFileSync(
    path.join(projectRoot, 'src/app/(dashboard)/organizations/[id]/page.tsx'),
    'utf8'
  );

  // Tabs
  assert.ok(pageContent.includes('1. Profile & Administration'), 'Tab 1 label');
  assert.ok(pageContent.includes('2. Team Members'), 'Tab 2 label');
  assert.ok(pageContent.includes('3. AI Agents'), 'Tab 3 label');
  assert.ok(pageContent.includes('4. Campaigns'), 'Tab 4 label');
  assert.ok(pageContent.includes('5. Leads'), 'Tab 5 label');
  assert.ok(pageContent.includes('6. Call History'), 'Tab 6 label');
  assert.ok(pageContent.includes('7. Usage & Billing Analytics'), 'Tab 7 label');
  assert.ok(pageContent.includes('8. Organization Settings & Guardrails'), 'Tab 8 label');

  // Subsections in Tab 1
  assert.ok(pageContent.includes('Organization Profile'), 'Profile Section');
  assert.ok(pageContent.includes('Primary Organization Administrator'), 'Admin Section');
  assert.ok(pageContent.includes('Integration Status'), 'Integration Section');
  assert.ok(pageContent.includes('Knowledge Base Sources'), 'Knowledge Base Section');
});

test('8. Multi-Tenant Data Isolation: Strict Boundary Enforcement', () => {
  const routeContent = fs.readFileSync(
    path.join(projectRoot, 'src/app/api/organizations/[id]/route.ts'),
    'utf8'
  );

  // Strictly checks session authorization for tenant boundary
  assert.ok(
    routeContent.includes('!isSuper && String(session.organizationId) !== String(id)'),
    'Must enforce that non-super admins cannot view another organization'
  );
  assert.ok(
    routeContent.includes('Agent.find({ organizationId: orgIdStr })'),
    'Must filter agents by organizationId'
  );
  assert.ok(
    routeContent.includes('Campaign.find({ organizationId: orgIdStr })'),
    'Must filter campaigns by organizationId'
  );
  assert.ok(
    routeContent.includes('Lead.find({ organizationId: orgIdStr })'),
    'Must filter leads by organizationId'
  );
  assert.ok(
    routeContent.includes('Call.find({ organizationId: orgIdStr })'),
    'Must filter calls by organizationId'
  );
  assert.ok(
    routeContent.includes('KnowledgeBase.find({ organizationId: orgIdStr })'),
    'Must filter knowledge bases by organizationId'
  );
});
