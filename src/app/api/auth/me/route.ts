import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import {
  getSessionFromRequest,
  signToken,
  AUTH_COOKIE_NAME,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ user: session });
}

/**
 * PATCH /api/auth/me
 * Allows the signed-in user (Organization or Super Admin) to update their display name.
 * Persists in MongoDB and re-issues the signed HTTP-only JWT cookie immediately.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const trimmedName = String(body.name || "").trim();

    if (trimmedName.length < 2 || trimmedName.length > 80) {
      return NextResponse.json(
        { error: "Display name must be between 2 and 80 characters." },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    if (db) {
      const filters: any[] = [];
      if (session.userId && mongoose.Types.ObjectId.isValid(session.userId)) {
        filters.push({ _id: new mongoose.Types.ObjectId(session.userId) });
      }
      if (session.userId) {
        filters.push({ _id: session.userId });
      }
      if (session.email) {
        filters.push({ email: session.email.toLowerCase() });
      }

      if (filters.length > 0) {
        await User.findOneAndUpdate(
          { $or: filters },
          { $set: { name: trimmedName, updatedAt: new Date() } }
        );
      }
    }

    const updatedSession = {
      ...session,
      name: trimmedName,
    };

    const newToken = signToken(updatedSession);
    const res = NextResponse.json({
      success: true,
      user: updatedSession,
      message: "Display name updated successfully.",
    });

    res.cookies.set(AUTH_COOKIE_NAME, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (err: any) {
    console.error("[PATCH /api/auth/me] error:", err);
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to update profile name") },
      { status: 500 }
    );
  }
}
