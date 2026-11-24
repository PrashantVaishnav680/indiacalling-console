import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import Organization from "@/models/Organization";
import User from "@/models/User";
import { addOrganization } from "@/lib/store";
import { AUTH_COOKIE_NAME, signToken } from "@/lib/auth";

const registerOrgSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(120, "Organization name is too long"),
  industry: z.string().trim().min(2, "Industry is required").default("General Business"),
  ownerName: z
    .string()
    .trim()
    .min(2, "Your full name must be at least 2 characters"),
  email: z.string().trim().email("Please enter a valid work email address"),
  phone: z.string().trim().optional(),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password is too long"),
});

function buildOrgSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || "org"}-${suffix}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerOrgSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: firstIssue?.message || "Please check your registration details.",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { organizationName, industry, ownerName, email, phone, password } =
      parsed.data;
    const normalizedEmail = email.toLowerCase();

    const db = await connectToDatabase();
    if (db) {
      const existingUser = await User.findOne({ email: normalizedEmail }).lean();
      if (existingUser) {
        return NextResponse.json(
          {
            error: "An account with this email already exists. Please sign in instead.",
          },
          { status: 409 }
        );
      }
    }

    const orgId = new mongoose.Types.ObjectId().toHexString();
    const userId = new mongoose.Types.ObjectId().toHexString();
    const slug = buildOrgSlug(organizationName);
    const hashedPassword = await bcrypt.hash(password, 10);

    const newOrg = {
      _id: orgId,
      name: organizationName,
      slug,
      email: normalizedEmail,
      phone: phone || "",
      industry: industry || "General Business",
      ownerName,
      ownerEmail: normalizedEmail,
      ownerPhone: phone || "",
      status: "active" as const,
      settings: {
        callingHours: {
          start: "09:30",
          end: "18:30",
          timezone: "Asia/Kolkata",
        },
        maxConcurrentCalls: 10,
        maxAgents: 25,
        monthlyCallLimit: 10000,
        defaultLanguage: "English + Hindi",
      },
      billing: {
        planName: "Growth Pay-As-You-Go",
        balanceInr: 1000,
        ratePerMinuteInr: 6,
        unbilledInr: 0,
        dueInr: 0,
        invoices: [
          {
            id: `inv_welcome_${Date.now().toString(36)}`,
            invoiceNumber: `IC-${new Date().getFullYear()}-001`,
            periodLabel: "Welcome Credit",
            amountInr: 1000,
            minutesBilled: 0,
            status: "paid" as const,
            issuedAt: new Date().toISOString(),
            paidAt: new Date().toISOString(),
            type: "topup" as const,
            description: "Initial Organization Onboarding Credit",
          },
        ],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (db) {
      await Organization.create({
        ...newOrg,
        _id: new mongoose.Types.ObjectId(orgId),
      });

      await User.create({
        _id: new mongoose.Types.ObjectId(userId),
        name: ownerName,
        email: normalizedEmail,
        password: hashedPassword,
        role: "organization",
        organizationId: orgId,
        title: "Organization Owner",
        isActive: true,
      });
    }

    addOrganization(newOrg);

    if (!(global as any).__INDIACALLING_TEAM_USERS__) {
      (global as any).__INDIACALLING_TEAM_USERS__ = [];
    }
    (global as any).__INDIACALLING_TEAM_USERS__.push({
      _id: userId,
      name: ownerName,
      email: normalizedEmail,
      role: "organization",
      organizationId: orgId,
      title: "Organization Owner",
      isActive: true,
      createdAt: new Date(),
    });

    const sessionPayload = {
      userId,
      email: normalizedEmail,
      name: ownerName,
      role: "organization" as const,
      canonicalRole: "organization" as const,
      roleLabel: "Organization" as const,
      organizationId: orgId,
      workspaceName: organizationName,
      sector: industry,
    };

    const token = signToken(sessionPayload);
    const response = NextResponse.json(
      {
        success: true,
        user: sessionPayload,
        organization: newOrg,
        redirectTo: "/overview",
      },
      { status: 201 }
    );

    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    console.error("Organization registration error:", error);
    return NextResponse.json(
      {
        error: "Unable to complete organization registration.",
        details: error?.message,
      },
      { status: 500 }
    );
  }
}
