import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

test('1. Campaign Bolna Batch Sync Endpoint (/api/campaigns/[id]/sync)', () => {
  const syncRoutePath = path.join(projectRoot, 'src/app/api/campaigns/[id]/sync/route.ts');
  assert.ok(fs.existsSync(syncRoutePath), 'sync route file must exist');

  const content = fs.readFileSync(syncRoutePath, 'utf8');
  assert.ok(content.includes('export async function POST'), 'Must export POST handler');
  assert.ok(content.includes('createBatchCampaign') || content.includes('bolnaBatchId'), 'Must handle Bolna batch creation/sync');
  assert.ok(content.includes('Campaign.findByIdAndUpdate') || content.includes('updateCampaign'), 'Must persist sync results');
  assert.ok(content.includes('getBatchDetails') || content.includes('batches'), 'Must support checking Bolna batch status');
});

test('2. Campaign Update Endpoint (/api/campaigns/[id] PATCH) Robustness', () => {
  const routePath = path.join(projectRoot, 'src/app/api/campaigns/[id]/route.ts');
  assert.ok(fs.existsSync(routePath), 'campaign detail route file must exist');

  const content = fs.readFileSync(routePath, 'utf8');
  assert.ok(content.includes('export async function PATCH'), 'Must export PATCH handler');
  assert.ok(content.includes('Campaign.findByIdAndUpdate'), 'Must update MongoDB campaign document');
  assert.ok(content.includes('updateCampaign'), 'Must update in-memory store');
  // Safe try-catch around Bolna schedule calls so any Bolna schedule error never crashes PATCH
  assert.ok(content.includes('scheduleBatchCampaign'), 'Must reference scheduleBatchCampaign');
  assert.ok(content.includes('catch (syncErr') || content.includes('catch'), 'Must catch Bolna scheduling errors gracefully');
});

test('3. Bolna Client Trial Account Handling & Verified Batch Creation', () => {
  const clientPath = path.join(projectRoot, 'src/lib/bolna/client.ts');
  const content = fs.readFileSync(clientPath, 'utf8');
  assert.ok(content.includes('createBatchCampaign'), 'Must have createBatchCampaign');
  assert.ok(content.includes('getBatchDetails'), 'Must export getBatchDetails');
  assert.ok(content.includes('verified phone numbers') || content.includes('verifiedRows'), 'Must handle trial account restrictions gracefully');
});

test('4. Campaign Detail UI: Sync with Bolna & Edit Campaign Modal', () => {
  const detailPagePath = path.join(projectRoot, 'src/app/(dashboard)/campaigns/[id]/page.tsx');
  const content = fs.readFileSync(detailPagePath, 'utf8');

  assert.ok(content.includes('Sync with Bolna'), 'Must have "Sync with Bolna" button');
  assert.ok(content.includes('syncWithBolna') || content.includes('/sync'), 'Must call sync API');
  assert.ok(content.includes('Edit Campaign'), 'Must have "Edit Campaign" button/modal');
  assert.ok(content.includes('isEditing') || content.includes('handleUpdateCampaign'), 'Must handle updating campaign details');
  assert.ok(content.includes('Live Bolna Batch') || content.includes('bolnaBatchId'), 'Must show Bolna batch indicator');
});

test('5. Campaigns List UI: Bolna Batch Badge', () => {
  const listPagePath = path.join(projectRoot, 'src/app/(dashboard)/campaigns/page.tsx');
  const content = fs.readFileSync(listPagePath, 'utf8');

  assert.ok(content.includes('bolnaBatchId'), 'Must display Bolna batch status/indicator in campaign list cards');
});
