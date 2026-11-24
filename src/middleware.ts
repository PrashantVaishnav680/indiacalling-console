import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function decodeJwtRoleUnsafe(token: string): "super_admin" | "organization" | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    const payload = JSON.parse(json);

    // Reject expired tokens immediately at the edge
    if (typeof payload?.exp === "number" && payload.exp * 1000 < Date.now()) {
      return null;
    }

    const rawRole = String(payload?.canonicalRole || payload?.role || "").toLowerCase();
    if (rawRole === "super_admin") return "super_admin";
    if (rawRole) return "organization";
    return null;
  } catch {
    return null;
  }
}

const ORG_PORTAL_PREFIXES = [
  "/overview",
  "/agents",
  "/knowledge-base",
  "/campaigns",
  "/calls",
  "/leads",
  "/recordings",
  "/transcripts",
  "/sales-handoff",
  "/analytics",
  "/billing",
  "/settings",
  "/testing",
];

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const token =
    request.cookies.get("indiacalling_session")?.value ||
    request.cookies.get("token")?.value;

  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/forgot-password");
  const isSuperAdminRoute =
    pathname.startsWith("/super-admin") || pathname.startsWith("/organizations");
  const isOrgRoute = ORG_PORTAL_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isProtectedRoute = isSuperAdminRoute || isOrgRoute;

  // If server-side verification rejected a stale/invalid cookie (e.g. JWT_SECRET rotated),
  // clear the stale cookies and allow /login to render without redirecting back.
  if (isAuthRoute && searchParams.get("expired") === "1") {
    const res = NextResponse.next();
    res.cookies.delete("indiacalling_session");
    res.cookies.delete("token");
    return res;
  }

  const role = token ? decodeJwtRoleUnsafe(token) : null;

  if (isProtectedRoute && (!token || !role)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    const res = NextResponse.redirect(loginUrl);
    if (token && !role) {
      res.cookies.delete("indiacalling_session");
      res.cookies.delete("token");
    }
    return res;
  }

  if (isAuthRoute && token && role) {
    return NextResponse.redirect(
      new URL(role === "super_admin" ? "/super-admin" : "/overview", request.url)
    );
  }

  // Strict 2-role route isolation:
  if (role === "super_admin" && isOrgRoute) {
    return NextResponse.redirect(new URL("/super-admin", request.url));
  }

  if (role === "super_admin" && pathname.startsWith("/organizations")) {
    return NextResponse.redirect(new URL("/super-admin/organizations", request.url));
  }

  if (role === "organization" && isSuperAdminRoute) {
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/super-admin/:path*",
    "/overview/:path*",
    "/organizations/:path*",
    "/agents/:path*",
    "/knowledge-base/:path*",
    "/campaigns/:path*",
    "/calls/:path*",
    "/leads/:path*",
    "/recordings/:path*",
    "/transcripts/:path*",
    "/sales-handoff/:path*",
    "/analytics/:path*",
    "/billing/:path*",
    "/settings/:path*",
    "/testing/:path*",
    "/login",
    "/forgot-password",
  ],
};
