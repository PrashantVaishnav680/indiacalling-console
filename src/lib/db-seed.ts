import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Organization from "@/models/Organization";
import User from "@/models/User";
import { DEV_DEMO_ACCOUNTS } from "@/lib/auth";
import { addOrganization, getStore } from "@/lib/store";

let seedingPromise: Promise<void> | null = null;

export async function ensureDatabaseSeeded(): Promise<void> {
  if (seedingPromise) {
    return seedingPromise;
  }

  // Ensure production environments never automatically create demo accounts
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEMO_SEED !== "true"
  ) {
    return;
  }

  seedingPromise = (async () => {
    try {
      // 1. Ensure Default Organization exists in MongoDB
      const defaultOrgId = "org_default_01";
      const existingOrg = await Organization.findOne({
        $or: [{ _id: defaultOrgId }, { slug: "indiacalling-org" }],
      }).lean();

      const defaultOrgDoc = {
        _id: defaultOrgId,
        name: "IndiaCalling Console",
        slug: "indiacalling-org",
        email: "admin@indiacalling.ai",
        phone: "+91 11 6929 4000",
        address: "Cyber City, Gurugram, India",
        industry: "B2B SaaS & Automation",
        ownerName: "Aditi Rao",
        ownerEmail: "clientadmin@demo.com",
        status: "active" as const,
        settings: {
          callingHours: {
            start: "09:30",
            end: "18:30",
            timezone: "Asia/Kolkata",
          },
          maxConcurrentCalls: 10,
          defaultLanguage: "English + Hindi",
        },
      };

      if (!existingOrg) {
        await Organization.create(defaultOrgDoc);
      }
      addOrganization(defaultOrgDoc as any);

      // 2. Ensure initial standard operational users exist in MongoDB
      // (super_admin, client_admin, sales_manager, sales_rep)
      const hashedPassword = await bcrypt.hash("Demo@1234", 10);

      for (const account of DEV_DEMO_ACCOUNTS) {
        const existingUser = await User.findOne({
          email: account.email.toLowerCase(),
        }).lean();

        if (!existingUser) {
          await User.create({
            _id: account.userId,
            name: account.name,
            email: account.email.toLowerCase(),
            password: hashedPassword,
            role: account.role,
            organizationId: defaultOrgId,
            isActive: true,
          });
        }
      }

      // Also ensure memory store has all accounts
      if (!(global as any).__INDIACALLING_TEAM_USERS__) {
        (global as any).__INDIACALLING_TEAM_USERS__ = DEV_DEMO_ACCOUNTS.map(
          ({ password, ...u }) => ({
            _id: u.userId,
            name: u.name,
            email: u.email,
            role: u.role,
            organizationId: u.organizationId || defaultOrgId,
            isActive: true,
          })
        );
      }
    } catch (err: any) {
      console.warn("Database auto-seeding notice:", err?.message);
    }
  })();

  return seedingPromise;
}
