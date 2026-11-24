/**
 * Seed Script for IndiaCalling Console v2.1.3 (`scripts/seed.js`)
 * Enforces the strict 2-role architecture:
 *   - super_admin (`superadmin@indiacalling.ai` / `Demo@1234`)
 *   - organization (`org@indiacalling.ai` / `Demo@1234`)
 * Idempotent: safe to run on a fresh MongoDB Atlas cluster without duplicating records.
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

function loadEnvUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  for (const fname of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), fname);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf8");
      const m = content.match(/^MONGODB_URI=(.+)$/m);
      if (m) return m[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return "mongodb://localhost:27017/indiacalling_console";
}

async function seed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    console.error("Refusing to seed in production unless ALLOW_PROD_SEED=true is set.");
    process.exit(1);
  }

  const uri = loadEnvUri();
  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const orgId = "org_default_01";

  // 1. Ensure default Organization exists with ₹6/min Growth plan
  await db.collection("organizations").updateOne(
    { _id: orgId },
    {
      $setOnInsert: {
        _id: orgId,
        name: "IndiaCalling Console",
        slug: "indiacalling-org",
        email: "org@indiacalling.ai",
        phone: "+91 98200 12345",
        address: "India",
        industry: "AI Voice Automation",
        ownerName: "Aditi Rao",
        ownerEmail: "org@indiacalling.ai",
        status: "active",
        plan: "growth",
        billing: {
          walletBalanceInr: 3000,
          ratePerMinuteInr: 6,
          unbilledInr: 0,
          monthlyLimitInr: 50000,
          invoices: [],
        },
        settings: {
          callingHours: { start: "09:30", end: "18:30", timezone: "Asia/Kolkata" },
          maxConcurrentCalls: 15,
          defaultLanguage: "English + Hindi",
        },
        createdAt: new Date(),
      },
      $set: { updatedAt: new Date() },
    },
    { upsert: true }
  );

  // 2. Seed strictly 2 canonical role accounts
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash("Demo@1234", salt);

  const users = [
    {
      name: "Platform Super Admin",
      email: "superadmin@indiacalling.ai",
      password: hashedPassword,
      role: "super_admin",
      department: "Admin",
      title: "Platform Governance Lead",
      organizationId: orgId,
      isActive: true,
    },
    {
      name: "Aditi Rao",
      email: "org@indiacalling.ai",
      password: hashedPassword,
      role: "organization",
      department: "Sales",
      title: "Organization Owner",
      organizationId: orgId,
      isActive: true,
    },
  ];

  for (const user of users) {
    await db.collection("users").updateOne(
      { email: user.email },
      {
        $setOnInsert: { ...user, createdAt: new Date() },
        $set: { updatedAt: new Date() },
      },
      { upsert: true }
    );
  }

  console.log("Seed complete (2-role architecture: super_admin & organization, ₹6/min rate).");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});