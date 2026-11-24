import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { DEV_DEMO_ACCOUNTS } from "@/lib/auth";
import { requireOrganizationRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import Organization from "@/models/Organization";

declare global {
  var __INDIACALLING_TEAM_USERS__: any[] | undefined;
}

function getInMemoryUsers() {
  if (!global.__INDIACALLING_TEAM_USERS__) {
    global.__INDIACALLING_TEAM_USERS__ = DEV_DEMO_ACCOUNTS.filter(
      (u) => u.role === "organization"
    ).map(({ password, ...u }) => ({
      _id: u.userId,
      name: u.name,
      email: u.email,
      role: "organization",
      department: "Admin",
      title: "Organization Owner",
      organizationId: u.organizationId,
      isActive: true,
      createdAt: new Date(),
    }));
  }
  return global.__INDIACALLING_TEAM_USERS__;
}

function buildOrgMatch(orgId: string) {
  return mongoose.Types.ObjectId.isValid(orgId)
    ? {
        $or: [
          { organizationId: orgId },
          { organizationId: new mongoose.Types.ObjectId(orgId) },
        ],
      }
    : { organizationId: orgId };
}

function buildUserIdMatch(userId: string) {
  return mongoose.Types.ObjectId.isValid(userId)
    ? {
        $or: [{ _id: userId }, { _id: new mongoose.Types.ObjectId(userId) }],
      }
    : { _id: userId };
}

async function resolveOrgOwnerEmail(orgId: string, db: any): Promise<string> {
  if (!db) return "org@indiacalling.ai";
  const orgFilter = mongoose.Types.ObjectId.isValid(orgId)
    ? { _id: new mongoose.Types.ObjectId(orgId) }
    : { $or: [{ _id: orgId }, { slug: orgId }] };
  const org: any = await Organization.findOne(orgFilter)
    .select("ownerEmail email")
    .lean();
  return String(org?.ownerEmail || org?.email || "").trim().toLowerCase();
}

function isOrganizationOwnerUser(user: any, ownerEmail: string): boolean {
  if (!user) return false;
  const email = String(user.email || "").trim().toLowerCase();
  if (ownerEmail && email === ownerEmail) return true;
  if (String(user.title || "").trim().toLowerCase() === "organization owner") return true;
  return false;
}

/**
 * GET /api/users
 * Lists team members strictly scoped to the authenticated Organization.
 * Optional query param: ?department=Sales
 */
export async function GET(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const orgId = rbac.organizationId;
  const { searchParams } = new URL(req.url);
  const deptFilter = (searchParams.get("department") || "").trim().toLowerCase();

  const db = await connectToDatabase();
  let users: any[] = [];

  if (db) {
    const dbUsers = await User.find({
      ...buildOrgMatch(orgId),
      role: { $ne: "super_admin" },
    })
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    if (dbUsers.length > 0) {
      users = dbUsers.map((u: any) => ({
        ...u,
        _id: String(u._id),
        role: "organization",
        department: u.department || "Operations",
        title: u.title || "Team Member",
        isActive: u.isActive !== false,
      }));
    }
  }

  if (users.length === 0) {
    users = getInMemoryUsers()
      .filter((u) => String(u.organizationId) === String(orgId))
      .map((u) => ({
        ...u,
        department: u.department || "Operations",
        isActive: u.isActive !== false,
      }));
  }

  if (deptFilter && deptFilter !== "all") {
    users = users.filter(
      (u) => String(u.department || "").toLowerCase() === deptFilter
    );
  }

  const ownerEmail = await resolveOrgOwnerEmail(orgId, db);
  const tagged = users.map((u: any) => ({
    ...u,
    isOwner: isOrganizationOwnerUser(u, ownerEmail),
  }));

  return NextResponse.json({ users: tagged, ownerEmail });
}

/**
 * POST /api/users
 * Adds a new team member with Department to the authenticated Organization.
 */
export async function POST(req: NextRequest) {
  try {
    const rbac = requireOrganizationRole(req);
    if (!rbac.ok) return rbac.response;

    const orgId = rbac.organizationId;
    const body = await req.json();
    const { name, email, password, title, department } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required." },
        { status: 400 }
      );
    }

    if (String(password).length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedDepartment = String(department || "Sales").trim();
    const db = await connectToDatabase();
    if (db) {
      const exists = await User.findOne({ email: normalizedEmail }).lean();
      if (exists) {
        return NextResponse.json(
          { error: "A user with this email already exists." },
          { status: 409 }
        );
      }
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const userObjectId = new mongoose.Types.ObjectId().toHexString();

    const newUser = {
      _id: userObjectId,
      name: String(name).trim(),
      email: normalizedEmail,
      role: "organization" as const,
      department: normalizedDepartment,
      title: String(title || `${normalizedDepartment} Specialist`).trim(),
      organizationId: orgId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (db) {
      await User.create({
        ...newUser,
        _id: new mongoose.Types.ObjectId(userObjectId),
        password: hashedPassword,
      });
    }

    getInMemoryUsers().unshift(newUser);

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Failed to add team member") },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users
 * Toggle active <-> inactive status, update department or title of a team member in the same organization.
 */
export async function PATCH(req: NextRequest) {
  try {
    const rbac = requireOrganizationRole(req);
    if (!rbac.ok) return rbac.response;

    const orgId = rbac.organizationId;
    const body = await req.json();
    const { userId, isActive, title, department } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (typeof isActive === "boolean") updates.isActive = isActive;
    if (typeof title === "string" && title.trim()) updates.title = title.trim();
    if (typeof department === "string" && department.trim()) {
      updates.department = department.trim();
    }

    const db = await connectToDatabase();
    const ownerEmail = await resolveOrgOwnerEmail(orgId, db);

    if (updates.isActive === false) {
      let targetUser: any = getInMemoryUsers().find(
        (u) => String(u._id) === String(userId) && String(u.organizationId) === String(orgId)
      );
      if (db) {
        const dbTarget = await User.findOne({
          $and: [buildUserIdMatch(String(userId)), buildOrgMatch(orgId), { role: { $ne: "super_admin" } }],
        }).lean();
        if (dbTarget) targetUser = dbTarget;
      }
      if (isOrganizationOwnerUser(targetUser, ownerEmail)) {
        return NextResponse.json(
          {
            error:
              "The Organization Owner cannot be deactivated. Transfer ownership to another active team member first.",
          },
          { status: 403 }
        );
      }
    }

    let updatedDoc: any = null;
    if (db) {
      updatedDoc = await User.findOneAndUpdate(
        {
          $and: [
            buildUserIdMatch(String(userId)),
            buildOrgMatch(orgId),
            { role: { $ne: "super_admin" } },
          ],
        },
        { $set: updates },
        { new: true }
      )
        .select("-password")
        .lean();
    }

    const mem = getInMemoryUsers().find(
      (u) =>
        String(u._id) === String(userId) &&
        String(u.organizationId) === String(orgId)
    );
    if (mem) {
      Object.assign(mem, updates);
    }

    if (!updatedDoc && !mem) {
      return NextResponse.json(
        { error: "Team member not found in your organization." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: updatedDoc
        ? { ...updatedDoc, _id: String(updatedDoc._id) }
        : mem,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Failed to update team member") },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users?userId=...
 * Permanently removes a team member from the authenticated Organization.
 */
export async function DELETE(req: NextRequest) {
  try {
    const rbac = requireOrganizationRole(req);
    if (!rbac.ok) return rbac.response;

    const orgId = rbac.organizationId;
    const { searchParams } = new URL(req.url);
    let userId = searchParams.get("userId") || "";
    if (!userId) {
      const body = await req.json().catch(() => ({}));
      userId = String(body.userId || "");
    }

    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }

    if (String(userId) === String(rbac.session.userId)) {
      return NextResponse.json(
        { error: "You cannot delete your own currently signed-in account." },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const ownerEmail = await resolveOrgOwnerEmail(orgId, db);

    let targetForDelete: any = getInMemoryUsers().find(
      (u) => String(u._id) === String(userId) && String(u.organizationId) === String(orgId)
    );
    if (db) {
      const dbTarget = await User.findOne({
        $and: [buildUserIdMatch(String(userId)), buildOrgMatch(orgId), { role: { $ne: "super_admin" } }],
      }).lean();
      if (dbTarget) targetForDelete = dbTarget;
    }
    if (isOrganizationOwnerUser(targetForDelete, ownerEmail)) {
      return NextResponse.json(
        {
          error:
            "The Organization Owner cannot be removed directly. Transfer ownership to another active team member first.",
        },
        { status: 403 }
      );
    }

    let deletedFromDb = false;
    if (db) {
      const res = await User.findOneAndDelete({
        $and: [
          buildUserIdMatch(String(userId)),
          buildOrgMatch(orgId),
          { role: { $ne: "super_admin" } },
        ],
      });
      deletedFromDb = Boolean(res);
    }

    const list = getInMemoryUsers();
    const idx = list.findIndex(
      (u) =>
        String(u._id) === String(userId) &&
        String(u.organizationId) === String(orgId)
    );
    let deletedFromMem = false;
    if (idx !== -1) {
      list.splice(idx, 1);
      deletedFromMem = true;
    }

    if (!deletedFromDb && !deletedFromMem) {
      return NextResponse.json(
        { error: "Team member not found in your organization." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedUserId: userId,
      message: "Team member removed successfully.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Failed to remove team member") },
      { status: 500 }
    );
  }
}
