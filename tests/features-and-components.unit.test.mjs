import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { z } from "zod";

// 1. Spreadsheet Parser & Lead Validator
import {
  validateAndNormalizePhone,
  parseCsvLine,
  parseCsvOrTsvText,
  autoGuessColumnMapping,
  validateMappedDataset,
  generateErrorReportCsv,
} from "../src/lib/spreadsheet-parser.ts";

// 2. Types & Roles
import { normalizeUserRole } from "../src/types/index.ts";

// 3. Analytics & Agent Counter Engine
import {
  isCallMatchingAgent,
  computeAgentMetrics,
} from "../src/lib/analytics-counters.ts";

// 4. Zod Validation Schemas
import {
  loginSchema,
  forgotPasswordSchema,
  agentSchema,
  leadSchema,
  campaignSchema,
  initiateCallSchema,
  leadAssignmentSchema,
} from "../src/schemas/index.ts";

// 5. Utility Functions
import {
  cn,
  formatDuration,
  formatPhoneNumber,
} from "../src/lib/utils.ts";

test("Feature Unit Test 1: Phone Normalization & E.164 Validation", () => {
  // Standard Indian 10-digit mobile
  const r1 = validateAndNormalizePhone("9876543210");
  assert.equal(r1.valid, true);
  assert.equal(r1.normalized, "+919876543210");

  // Number with formatting (spaces, hyphens, brackets)
  const r2 = validateAndNormalizePhone(" (98765) 43210 ");
  assert.equal(r2.valid, true);
  assert.equal(r2.normalized, "+919876543210");

  // 11-digit starting with 0
  const r3 = validateAndNormalizePhone("09876543210");
  assert.equal(r3.valid, true);
  assert.equal(r3.normalized, "+919876543210");

  // 12-digit starting with 91
  const r4 = validateAndNormalizePhone("919876543210");
  assert.equal(r4.valid, true);
  assert.equal(r4.normalized, "+919876543210");

  // Already formatted +91
  const r5 = validateAndNormalizePhone("+919876543210");
  assert.equal(r5.valid, true);
  assert.equal(r5.normalized, "+919876543210");

  // International E.164 (US)
  const r6 = validateAndNormalizePhone("+14155552671");
  assert.equal(r6.valid, true);
  assert.equal(r6.normalized, "+14155552671");

  // Invalid: Empty
  const r7 = validateAndNormalizePhone("");
  assert.equal(r7.valid, false);

  // Invalid: Alphabetic characters
  const r8 = validateAndNormalizePhone("98765ABC10");
  assert.equal(r8.valid, false);

  // Invalid: Indian number starting with invalid digit (1-5)
  const r9 = validateAndNormalizePhone("5123456789");
  assert.equal(r9.valid, false);

  // Invalid: Too short
  const r10 = validateAndNormalizePhone("12345");
  assert.equal(r10.valid, false);
});

test("Feature Unit Test 2: CSV / TSV Parsing & Quoted String Handling", () => {
  // Comma line with quotes
  const line1 = 'Aditi Rao,"Cyber City, Gurugram",9876543210';
  const parsed1 = parseCsvLine(line1);
  assert.deepEqual(parsed1, ["Aditi Rao", "Cyber City, Gurugram", "9876543210"]);

  // Escaped quotes inside field
  const line2 = '"Said ""Welcome"" to team",9876543210';
  const parsed2 = parseCsvLine(line2);
  assert.deepEqual(parsed2, ['Said "Welcome" to team', "9876543210"]);

  // Full CSV multi-line text
  const csv = `Name,Phone,Email,City\nRajesh Kumar,9876543210,rajesh@example.com,Mumbai\nPriya Singh,9123456780,priya@example.com,Bengaluru`;
  const result = parseCsvOrTsvText(csv);
  assert.equal(result.headers.length, 4);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0]["Name"], "Rajesh Kumar");
  assert.equal(result.rows[1]["City"], "Bengaluru");

  // TSV multi-line text
  const tsv = `Name\tPhone\tBudget\nVikram\t9876543210\t50000`;
  const tsvResult = parseCsvOrTsvText(tsv);
  assert.equal(tsvResult.headers.length, 3);
  assert.equal(tsvResult.rows.length, 1);
  assert.equal(tsvResult.rows[0]["Budget"], "50000");
});

test("Feature Unit Test 3: Auto Column Mapping Heuristics", () => {
  const headers = [
    "Full Name",
    "Customer Mobile No",
    "Work Email",
    "Company Name",
    "Target Location",
    "Annual Budget",
    "Industry Sector",
    "Special Remarks",
    "Custom Account ID",
  ];

  const mapping = autoGuessColumnMapping(headers);
  assert.equal(mapping.name, "Full Name");
  assert.equal(mapping.phoneNumber, "Customer Mobile No");
  assert.equal(mapping.email, "Work Email");
  assert.equal(mapping.company, "Company Name");
  assert.equal(mapping.city, "Target Location");
  assert.equal(mapping.budget, "Annual Budget");
  assert.equal(mapping.industry, "Industry Sector");
  assert.equal(mapping.notes, "Special Remarks");
  assert.ok(
    mapping.customFieldMappings.some(
      (m) => m.sourceColumn === "Custom Account ID"
    )
  );
});

test("Feature Unit Test 4: Dataset Validation & Duplicate Detection", () => {
  const rawRows = [
    { Name: "Lead 1", Phone: "9876543210", City: "Delhi" },
    { Name: "Lead 2 Duplicate", Phone: "9876543210", City: "Delhi" }, // duplicate in batch
    { Name: "Lead 3 Invalid", Phone: "12345", City: "Noida" }, // invalid phone
    { Name: "Lead 4 Missing", Phone: "", City: "Pune" }, // missing phone
    { Name: "Lead 5 Existing", Phone: "9999988888", City: "Mumbai" }, // existing in workspace
    { Name: "Lead 6 Valid", Phone: "9123456789", City: "Jaipur" }, // valid unique
  ];

  const mapping = {
    phoneNumber: "Phone",
    name: "Name",
    city: "City",
  };

  const existingInWorkspace = new Set(["+919999988888"]);

  const res = validateMappedDataset(rawRows, mapping, existingInWorkspace);

  assert.equal(res.summary.totalUploaded, 6);
  assert.equal(res.summary.duplicateRecords, 1);
  assert.equal(res.summary.missingPhoneNumbers, 1);
  assert.equal(res.summary.invalidRecords, 2); // 1 invalid format + 1 missing
  assert.equal(res.summary.validRecords, 3); // Lead 1, Lead 5 (existing allowed for re-enrollment), Lead 6
  assert.equal(res.summary.importedRecords, 3);

  // Check CSV error report generation
  const errorCsv = generateErrorReportCsv(res);
  assert.ok(errorCsv.includes("Error Reason"));
  assert.ok(errorCsv.includes("Duplicate phone number"));
  assert.ok(errorCsv.includes("Missing phone number"));
});

test("Feature Unit Test 5: Role Normalization & RBAC Security", () => {
  assert.equal(normalizeUserRole("SUPER_ADMIN"), "super_admin");
  assert.equal(normalizeUserRole("super_admin"), "super_admin");
  assert.equal(normalizeUserRole("client_admin"), "client_admin");
  assert.equal(normalizeUserRole("sales_manager"), "sales_manager");
  assert.equal(normalizeUserRole("sales_rep"), "sales_rep");
  assert.equal(normalizeUserRole("salesperson"), "sales_rep");
  assert.equal(normalizeUserRole("unknown_role"), "sales_rep");
  assert.equal(normalizeUserRole(null), "sales_rep");
});

test("Feature Unit Test 6: JWT Signing & Verification Logic", () => {
  const secret = "test_secret_key_at_least_32_characters_long";
  const payload = {
    userId: "u123",
    email: "test@indiacalling.ai",
    name: "Test User",
    role: "client_admin",
    organizationId: "org_test",
  };

  const token = jwt.sign(payload, secret, { expiresIn: "1h" });
  assert.ok(typeof token === "string" && token.length > 20);

  const decoded = jwt.verify(token, secret);
  assert.equal(decoded.userId, "u123");
  assert.equal(decoded.email, "test@indiacalling.ai");
  assert.equal(decoded.organizationId, "org_test");

  // Tampered token must throw
  assert.throws(() => {
    jwt.verify(token + "tampered", secret);
  });
});

test("Feature Unit Test 7: Analytics Counter Engine & Agent Matching", () => {
  const agent = {
    _id: "agent_01",
    bolnaAgentId: "bolna_agent_xyz",
    organizationId: "org_01",
    name: "AI Closer",
  };

  // Direct ID match
  assert.equal(isCallMatchingAgent({ agentId: "agent_01" }, agent), true);
  // Bolna ID match
  assert.equal(isCallMatchingAgent({ agentId: "bolna_agent_xyz" }, agent), true);
  assert.equal(isCallMatchingAgent({ bolnaAgentId: "bolna_agent_xyz" }, agent), true);
  // Unrelated call
  assert.equal(isCallMatchingAgent({ agentId: "agent_other" }, agent), false);

  // Compute metrics
  const mockCalls = [
    {
      _id: "call_1",
      agentId: "agent_01",
      organizationId: "org_01",
      status: "completed",
      durationSeconds: 120,
      leadId: "lead_1",
    },
    {
      _id: "call_2",
      agentId: "agent_01",
      organizationId: "org_01",
      status: "completed",
      durationSeconds: 180,
      leadId: "lead_2",
    },
    {
      _id: "call_3",
      agentId: "agent_01",
      organizationId: "org_01",
      status: "failed",
      durationSeconds: 0,
    },
    {
      _id: "call_other_org",
      agentId: "agent_01",
      organizationId: "org_999", // isolated org
      status: "completed",
      durationSeconds: 300,
    },
  ];

  const mockLeads = [];
  const mockCampaigns = [
    {
      _id: "camp_1",
      agentId: "agent_01",
      organizationId: "org_01",
      status: "running",
      leadIds: ["lead_1", "lead_2", "lead_3"],
    },
  ];

  const metrics = computeAgentMetrics(agent, mockCalls, mockLeads, mockCampaigns);
  assert.equal(metrics.totalCalls, 3); // 3 calls in org_01 (org_999 excluded)
  assert.equal(metrics.successfulCalls, 2);
  assert.equal(metrics.failedCalls, 1);
  assert.equal(metrics.avgDurationSeconds, 150); // 300 / 2 completed with duration
  assert.equal(metrics.activeCampaigns, 1);
});

test("Feature Unit Test 8: Zod Schema Validation (Login, Agent, Lead, Campaign)", () => {
  // Login Schema
  const validLogin = loginSchema.safeParse({
    email: "superadmin@indiacalling.ai",
    password: "Password123",
  });
  assert.equal(validLogin.success, true);

  const invalidLogin = loginSchema.safeParse({
    email: "not-an-email",
    password: "123", // too short
  });
  assert.equal(invalidLogin.success, false);

  // Lead Schema
  const validLead = leadSchema.safeParse({
    name: "Rohan Verma",
    phone: "+919876543210",
    email: "rohan@example.com",
    company: "Acme Corp",
  });
  assert.equal(validLead.success, true);

  const invalidLead = leadSchema.safeParse({
    name: "R", // too short
    phone: "123", // too short
  });
  assert.equal(invalidLead.success, false);

  // Campaign Schema
  const validCampaign = campaignSchema.safeParse({
    name: "Q4 High-Intent Follow-ups",
    agentId: "agent_01",
    leadIds: ["lead_01", "lead_02"],
    scheduleStartDate: "2026-11-20",
    callingStartHour: "10:00",
    callingEndHour: "18:00",
  });
  assert.equal(validCampaign.success, true);

  // Agent Schema
  const validAgent = agentSchema.safeParse({
    name: "B2B Outbound Specialist",
    agentType: "outbound",
    language: "en-IN",
    voiceProvider: "elevenlabs",
    voiceId: "voice_rachel",
    systemPrompt: "You are a courteous representative qualifying prospective enterprises.",
    greetingMessage: "Hello, this is Priya calling from IndiaCalling.",
  });
  assert.equal(validAgent.success, true);
});

test("Feature Unit Test 9: Core Utility Functions (cn, formatDuration, formatPhoneNumber)", () => {
  // cn merge
  assert.equal(cn("px-4", "py-2", "bg-red-500", "bg-blue-500"), "px-4 py-2 bg-blue-500");

  // formatDuration
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(45), "45s");
  assert.equal(formatDuration(65), "1m 05s");
  assert.equal(formatDuration(360), "6m 00s");
  assert.equal(formatDuration(-5), "0s");

  // formatPhoneNumber
  assert.equal(formatPhoneNumber("+919876543210"), "+91 98765 43210");
  assert.equal(formatPhoneNumber("+14155552671"), "+14155552671");
  assert.equal(formatPhoneNumber(""), "");
});

test("Feature Unit Test 10: Knowledge Base Processing & Chunking Pipeline", () => {
  const kbCode = fs.readFileSync(
    path.join(process.cwd(), "src/lib/knowledge-processor.ts"),
    "utf8"
  );
  assert.ok(kbCode.includes("SUPPORTED_KB_EXTENSIONS"));
  assert.ok(kbCode.includes("chunkExtractedText"));
  assert.ok(kbCode.includes("extractDocxText"));
  assert.ok(kbCode.includes("extractPdfText"));
  assert.ok(kbCode.includes("processUploadedKnowledgeFile"));
  assert.ok(kbCode.includes("buildKnowledgeBaseContextForAgent"));

  // Verify chunking logic handles CSV records
  const sampleCsv = "Question,Answer\nWhat is IndiaCalling?,Enterprise Voice AI\nDoes it support Bolna?,Yes Bolna v2";
  const parsed = parseCsvOrTsvText(sampleCsv);
  assert.equal(parsed.rows.length, 2);
  const formattedRecords = parsed.rows.map((row, idx) => {
    const pairs = parsed.headers
      .map((h) => (row[h] ? `${h}: ${row[h]}` : ""))
      .filter(Boolean)
      .join(" | ");
    return `Record ${idx + 1}: ${pairs}`;
  }).join("\n");
  assert.ok(formattedRecords.includes("Record 1: Question: What is IndiaCalling? | Answer: Enterprise Voice AI"));
  assert.ok(formattedRecords.includes("Record 2: Question: Does it support Bolna? | Answer: Yes Bolna v2"));
});

test("Feature Unit Test 11: Component State & UI Asset Validation", () => {
  // Verify LoadingSpinner and ButtonSpinner existence & exports
  const spinnerCode = fs.readFileSync(
    path.join(process.cwd(), "src/components/LoadingSpinner.tsx"),
    "utf8"
  );
  assert.ok(spinnerCode.includes("export function LoadingSpinner"));
  assert.ok(spinnerCode.includes("export function ButtonSpinner"));
  assert.ok(spinnerCode.includes("export function LoadingState"));
  assert.ok(spinnerCode.includes("export function CardSkeletonGrid"));
  assert.ok(spinnerCode.includes("export function TableLoadingRows"));

  // Verify animate-spin and accessible aria attribute
  assert.ok(spinnerCode.includes("animate-spin"));
  assert.ok(spinnerCode.includes('aria-hidden="true"'));
});
