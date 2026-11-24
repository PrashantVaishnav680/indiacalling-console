import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import {
  CanonicalUserRole,
  getRoleDisplayLabel,
  normalizeUserRole,
  UserRole,
} from "@/types";

export { normalizeUserRole, getRoleDisplayLabel };

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "development_jwt_secret_key_change_in_production_32chars";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
export const AUTH_COOKIE_NAME = "indiacalling_session";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: CanonicalUserRole;
  canonicalRole: CanonicalUserRole;
  roleLabel: "Super Admin" | "Organization";
  organizationId: string;
  workspaceName?: string;
  sector?: string;
  impersonatedBy?: {
    userId: string;
    email: string;
    name: string;
    role: "super_admin";
  };
}

export interface DevDemoAccount {
  userId: string;
  email: string;
  password: string;
  name: string;
  role: CanonicalUserRole;
  roleLabel: "Super Admin" | "Organization";
  organizationId: string;
  workspaceName: string;
  sector: string;
}

/**
 * Strictly 2-Role Seeded Accounts for Development:
 * 1. Super Admin (Platform Control Center — Zero-PII metadata only)
 * 2. Organization (Tenant Workspace — full operational portal)
 */
export const DEV_DEMO_ACCOUNTS: DevDemoAccount[] = [
  {
    userId: "user_super_admin_01",
    email: "superadmin@indiacalling.ai",
    password: "Demo@1234",
    name: "Platform Super Admin",
    role: "super_admin",
    roleLabel: "Super Admin",
    organizationId: "platform_hq",
    workspaceName: "IndiaCalling Platform Control Center",
    sector: "Multi-Tenant SaaS",
  },
  {
    userId: "user_org_admin_01",
    email: "org@indiacalling.ai",
    password: "Demo@1234",
    name: "Aditi Rao",
    role: "organization",
    roleLabel: "Organization",
    organizationId: "org_default_01",
    workspaceName: "IndiaCalling Enterprise Workspace",
    sector: "Enterprise Operations",
  },
];

export function signToken(
  payload: Omit<SessionPayload, "role" | "canonicalRole" | "roleLabel"> & {
    role: UserRole | string;
  }
): string {
  const canonicalRole = normalizeUserRole(payload.role);
  const tokenPayload: SessionPayload = {
    ...payload,
    role: canonicalRole,
    canonicalRole,
    roleLabel: getRoleDisplayLabel(canonicalRole),
  };
  return jwt.sign(tokenPayload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as any,
  });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<SessionPayload> & {
      role?: string;
    };
    if (!decoded || !decoded.userId || !decoded.email) {
      return null;
    }
    const canonicalRole = normalizeUserRole(decoded.role);
    return {
      userId: String(decoded.userId),
      email: String(decoded.email),
      name: String(decoded.name || "User"),
      role: canonicalRole,
      canonicalRole,
      roleLabel: getRoleDisplayLabel(canonicalRole),
      organizationId:
        canonicalRole === "super_admin"
          ? "platform_hq"
          : String(decoded.organizationId || "org_default_01"),
      workspaceName: decoded.workspaceName,
      sector: decoded.sector,
      ...(decoded.impersonatedBy ? { impersonatedBy: decoded.impersonatedBy } : {}),
    };
  } catch {
    return null;
  }
}

export async function getServerSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(AUTH_COOKIE_NAME)?.value ||
    cookieStore.get("token")?.value;

  if (!token) {
    return null;
  }

  return verifyToken(token);
}

export function getSessionFromRequest(req: NextRequest): SessionPayload | null {
  const token =
    req.cookies.get(AUTH_COOKIE_NAME)?.value ||
    req.cookies.get("token")?.value;

  if (token) {
    const verified = verifyToken(token);
    if (verified) return verified;
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const verified = verifyToken(authHeader.substring(7));
    if (verified) return verified;
  }

  return null;
}

export function isAuthorizedRole(
  userRole: string | undefined | null,
  allowedRoles: CanonicalUserRole[]
): boolean {
  if (!userRole) return false;
  const normalized = normalizeUserRole(userRole);
  return allowedRoles.includes(normalized);
}
