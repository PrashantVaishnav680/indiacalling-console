import { NextRequest, NextResponse } from "next/server";
import {
  signToken,
  AUTH_COOKIE_NAME,
  DEV_DEMO_ACCOUNTS,
  normalizeUserRole,
  getRoleDisplayLabel,
} from "@/lib/auth";
import { loginSchema } from "@/schemas";
import { connectToDatabase } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import User from "@/models/User";
import Organization from "@/models/Organization";
import { getOrganizationById } from "@/lib/store";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = loginSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Please enter a valid email and password (min 6 characters)." },
        { status: 400 }
      );
    }

    const { email, password } = validated.data;
    const normalizedEmail = email.trim().toLowerCase();

    const db = await connectToDatabase();
    if (db) {
      const user = await User.findOne({ email: normalizedEmail });
      if (user) {
        if (!user.isActive) {
          return NextResponse.json(
            { error: "Account has been deactivated. Please contact support." },
            { status: 403 }
          );
        }

        const isDevSeedEmail =
          user.email === "superadmin@indiacalling.ai" ||
          user.email === "org@indiacalling.ai" ||
          user.email === "clientadmin@demo.com" ||
          user.email === "admin@demo.com";

        const isMatch =
          (await bcrypt.compare(password, user.password)) ||
          (process.env.NODE_ENV !== "production" &&
            isDevSeedEmail &&
            (password === "Demo@1234" || password === "Admin@123"));

        if (isMatch) {
          const canonicalRole = normalizeUserRole(user.role);
          const orgId =
            canonicalRole === "super_admin"
              ? "platform_hq"
              : user.organizationId?.toString() || "org_default_01";

          let workspaceName =
            canonicalRole === "super_admin"
              ? "IndiaCalling Platform Control Center"
              : "IndiaCalling Workspace";

          if (canonicalRole === "organization") {
            const orgDoc = await Organization.findOne({
              $or: [{ _id: orgId }, { slug: orgId }],
            }).lean();
            const memoryOrg = getOrganizationById(orgId);
            const orgStatus = orgDoc?.status || memoryOrg?.status;
            workspaceName = orgDoc?.name || memoryOrg?.name || workspaceName;

            if (!orgDoc && !memoryOrg) {
              return NextResponse.json(
                {
                  error:
                    "This organization account has been removed or is no longer available. Please contact platform administration.",
                },
                { status: 403 }
              );
            }
            if (orgStatus === "suspended" || orgStatus === "inactive") {
              return NextResponse.json(
                {
                  error:
                    "Your organization account is currently suspended. Please contact platform administration.",
                },
                { status: 403 }
              );
            }
          }

          const sessionPayload = {
            userId: user._id.toString(),
            email: user.email,
            name: user.name,
            role: canonicalRole,
            canonicalRole,
            roleLabel: getRoleDisplayLabel(canonicalRole),
            organizationId: orgId,
            workspaceName,
          };

          const token = signToken(sessionPayload);
          const redirectTo =
            canonicalRole === "super_admin" ? "/super-admin" : "/overview";

          const response = NextResponse.json({
            success: true,
            user: sessionPayload,
            redirectTo,
          });

          response.cookies.set(AUTH_COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60,
          });

          await logAuditEvent({
      action: canonicalRole === "super_admin" ? "Super Admin Sign-In" : "Organization Sign-In",
      category: "auth",
      actorEmail: sessionPayload.email,
      actorName: sessionPayload.name,
      targetOrgId: sessionPayload.organizationId,
      targetOrgName: sessionPayload.workspaceName,
      details: `${sessionPayload.name} signed in as ${canonicalRole}.`,
    });
    return response;
        }
      }
    }

    // Seeded development accounts fallback (strictly 2 roles: Super Admin & Organization)
    const aliasEmail =
      normalizedEmail === "admin@demo.com"
        ? "superadmin@indiacalling.ai"
        : normalizedEmail === "clientadmin@demo.com" ||
          normalizedEmail === "manager@demo.com" ||
          normalizedEmail === "salesrep@demo.com"
        ? "org@indiacalling.ai"
        : normalizedEmail;

    const matchedAccount = DEV_DEMO_ACCOUNTS.find(
      (d) => d.email.toLowerCase() === aliasEmail
    );

    if (
      matchedAccount &&
      (password === matchedAccount.password ||
        password === "Demo@1234" ||
        password === "Admin@123")
    ) {
      if (matchedAccount.role === "organization") {
        const orgId = matchedAccount.organizationId || "org_default_01";
        let orgDoc: any = null;
        if (db) {
          orgDoc = await Organization.findOne({
            $or: [{ _id: orgId }, { slug: orgId }],
          }).lean();
        }
        const memoryOrg = getOrganizationById(orgId);
        const orgStatus = orgDoc?.status || memoryOrg?.status;
        if (orgStatus === "suspended" || orgStatus === "inactive") {
          return NextResponse.json(
            {
              error:
                "Your organization account is currently suspended. Please contact platform administration.",
            },
            { status: 403 }
          );
        }
      }

      const sessionPayload = {
        userId: matchedAccount.userId,
        email: normalizedEmail,
        name: matchedAccount.name,
        role: matchedAccount.role,
        canonicalRole: matchedAccount.role,
        roleLabel: matchedAccount.roleLabel,
        organizationId: matchedAccount.organizationId,
        workspaceName: matchedAccount.workspaceName,
        sector: matchedAccount.sector,
      };

      const token = signToken(sessionPayload);
      const redirectTo =
        matchedAccount.role === "super_admin" ? "/super-admin" : "/overview";

      const response = NextResponse.json({
        success: true,
        user: sessionPayload,
        redirectTo,
      });

      response.cookies.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });

      await logAuditEvent({
        action: matchedAccount.role === "super_admin" ? "Super Admin Sign-In" : "Organization Sign-In",
        category: "auth",
        actorEmail: sessionPayload.email,
        actorName: sessionPayload.name,
        targetOrgId: sessionPayload.organizationId,
        targetOrgName: sessionPayload.workspaceName,
        details: `${sessionPayload.name} signed in as ${matchedAccount.role}.`,
      });

      return response;
    }

    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
