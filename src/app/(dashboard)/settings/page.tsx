"use client";

import { useState, useEffect } from "react";
import { MOCK_ORGANIZATION } from "@/lib/mock-data";

export const BUSINESS_CATEGORIES = [
  "B2B SaaS & Technology",
  "Real Estate & Property",
  "BFSI, Banking & Insurance",
  "Healthcare & Clinical Diagnostics",
  "EdTech & Higher Education",
  "Automobile & Dealerships",
  "E-Commerce & Retail",
  "Logistics & Supply Chain",
  "Professional Services & Consulting",
  "Other / Custom Business",
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<
    "integration" | "onboarding" | "team" | "org"
  >("org");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [teamUsers, setTeamUsers] = useState<any[]>([]);
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [loadingHealth, setLoadingHealth] = useState(true);
  const [healthTesting, setHealthTesting] = useState(false);
  const [healthResult, setHealthResult] = useState<any>(null);
  const [syncingNow, setSyncingNow] = useState(false);
  const [updatingOrg, setUpdatingOrg] = useState(false);
  const [managedAccess, setManagedAccess] = useState<{
    enabled: boolean;
    grantedAt?: string | null;
    grantedBy?: string | null;
    planLabel?: string;
  }>({ enabled: false, grantedAt: null, grantedBy: null, planLabel: "Managed Service Plan" });
  const [togglingManagedAccess, setTogglingManagedAccess] = useState(false);

  // User list search, filter & pagination for Tab 3
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userOrgFilter, setUserOrgFilter] = useState("all");
  const [userPage, setUserPage] = useState(1);
  const userPageSize = 5;

  // Super Admin Organization Onboarding Form (Section 9)
  const [onboardForm, setOnboardForm] = useState({
    businessName: "",
    industry: "B2B SaaS & Technology",
    contactEmail: "",
    contactPhone: "+91 ",
    address: "",
    ownerName: "",
    ownerEmail: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });

  // Team Member Creation Form (Section 8 & 9)
  const [newMember, setNewMember] = useState({
    name: "",
    email: "",
    password: "",
    role: "organization",
    department: "Sales",
  });

  // Organization Profile & Settings
  const [orgForm, setOrgForm] = useState({
    name: MOCK_ORGANIZATION.name,
    email: MOCK_ORGANIZATION.email,
    phone: MOCK_ORGANIZATION.phone || "+91 98765 43210",
    industry: MOCK_ORGANIZATION.industry || "B2B SaaS & Technology",
    address: MOCK_ORGANIZATION.address || "DLF Cyber City, Tower B, Gurugram, India",
    callingStart: "09:30",
    callingEnd: "18:30",
    timezone: "Asia/Kolkata",
    maxConcurrentCalls: 10,
    defaultLanguage: "English + Hindi",
  });

  const loadSettingsData = async () => {
    setLoadingHealth(true);
    try {
      const [meRes, healthRes, orgsRes, usersRes, managedRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/bolna/health"),
        fetch("/api/organizations"),
        fetch("/api/users"),
        fetch("/api/organizations/managed-access").catch(() => null),
      ]);
      if (meRes.ok) {
        const d = await meRes.json();
        setCurrentUser(d.user);
      }
      if (healthRes.ok) {
        setHealthResult(await healthRes.json());
      }
      if (orgsRes.ok) {
        const d = await orgsRes.json();
        const orgList = d.organizations || [];
        setOrganizations(orgList);
        const currentOrg = orgList[0];
        if (currentOrg) {
          setOrgForm((prev) => ({
            ...prev,
            name: currentOrg.name || prev.name,
            email: currentOrg.email || prev.email,
            phone: currentOrg.phone || prev.phone,
            industry: currentOrg.industry || prev.industry,
            address: currentOrg.address || prev.address,
            callingStart: currentOrg.settings?.callingHours?.start || prev.callingStart,
            callingEnd: currentOrg.settings?.callingHours?.end || prev.callingEnd,
            timezone: currentOrg.settings?.callingHours?.timezone || prev.timezone,
            maxConcurrentCalls: currentOrg.settings?.maxConcurrentCalls || prev.maxConcurrentCalls,
            defaultLanguage: currentOrg.settings?.defaultLanguage || prev.defaultLanguage,
          }));
        }
      }
      if (usersRes.ok) {
        const d = await usersRes.json();
        setTeamUsers(d.users || []);
      }
      if (managedRes && managedRes.ok) {
        const md = await managedRes.json();
        if (md.managedServiceAccess) {
          setManagedAccess(md.managedServiceAccess);
        }
      }
    } catch {
      // Ignore initial load errors
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    loadSettingsData();
  }, []);

  const testHealth = async () => {
    setHealthTesting(true);
    try {
      const res = await fetch("/api/bolna/health");
      setHealthResult(await res.json());
    } finally {
      setHealthTesting(false);
    }
  };

  const handleManualSyncNow = async () => {
    setSyncingNow(true);
    setBanner(null);
    try {
      const res = await fetch("/api/bolna/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncAgents: true, syncCalls: true }),
      });
      const data = await res.json();
      setBanner({
        type: data.success ? "success" : "error",
        text: data.message || "Synchronized with IndiaCalling Voice AI.",
      });
      await testHealth();
    } finally {
      setSyncingNow(false);
    }
  };

  const handleOnboardOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const res = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(onboardForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setBanner({
        type: "error",
        text: data.details || data.error || "Failed to onboard organization",
      });
      return;
    }
    setBanner({
      type: "success",
      text: `Provisioned organization "${data.organization.name}" and initial Client Admin (${data.initialClientAdmin.email}).`,
    });
    setOnboardForm({
      businessName: "",
      industry: "B2B SaaS & Technology",
      contactEmail: "",
      contactPhone: "+91 ",
      address: "",
      ownerName: "",
      ownerEmail: "",
      adminName: "",
      adminEmail: "",
      adminPassword: "",
    });
    await loadSettingsData();
  };

  const handleCreateTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMember),
    });
    const data = await res.json();
    if (!res.ok) {
      setBanner({
        type: "error",
        text: data.details || data.error || "Failed to create team member",
      });
      return;
    }
    setBanner({
      type: "success",
      text: `Created ${data.user.role} account for ${data.user.name} (${data.user.email}).`,
    });
    setNewMember({ name: "", email: "", password: "", role: "organization", department: "Sales" });
    await loadSettingsData();
  };

  const handleToggleManagedAccess = async () => {
    setTogglingManagedAccess(true);
    setBanner(null);
    try {
      const nextEnabled = !managedAccess.enabled;
      const res = await fetch("/api/organizations/managed-access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({
          type: "error",
          text: data.error || "Could not update Managed Service Support Access.",
        });
      } else {
        setManagedAccess(data.managedServiceAccess || { enabled: nextEnabled });
        setBanner({
          type: "success",
          text: nextEnabled
            ? "Managed Service Access enabled. Authorized Platform Super Admins can now assist inside your workspace."
            : "Managed Service Access revoked. Your workspace is strictly isolated from Super Admin support login.",
        });
      }
    } catch {
      setBanner({
        type: "error",
        text: "Network error updating Managed Service Support Access.",
      });
    } finally {
      setTogglingManagedAccess(false);
    }
  };

  const handleUpdateOrgProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    setUpdatingOrg(true);
    try {
      const targetOrgId = currentUser?.organizationId || organizations[0]?._id || "org_default_01";
      const res = await fetch(`/api/organizations/${targetOrgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: orgForm.name,
          email: orgForm.email,
          phone: orgForm.phone,
          industry: orgForm.industry,
          address: orgForm.address,
          settings: {
            callingHours: {
              start: orgForm.callingStart || "09:30",
              end: orgForm.callingEnd || "18:30",
              timezone: orgForm.timezone || "Asia/Kolkata",
            },
            maxConcurrentCalls: Number(orgForm.maxConcurrentCalls) || 10,
            defaultLanguage: orgForm.defaultLanguage || "English + Hindi",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({
          type: "error",
          text: data.details || data.error || "Failed to update organization profile",
        });
        return;
      }
      setBanner({
        type: "success",
        text: "Organization profile and telephony settings saved successfully.",
      });
      await loadSettingsData();
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Failed to update organization profile",
      });
    } finally {
      setUpdatingOrg(false);
    }
  };

  const isSuperAdmin = currentUser?.role === "super_admin";
  const orgMap = new Map(organizations.map((o) => [String(o._id), o.name]));

  // Resolve clear functional role info & badge colors for team users
  const getUserRoleInfo = (u: any) => {
    const isOwner = Boolean(
      u?.isOwner ||
      String(u?.title || "").toLowerCase().includes("owner")
    );
    const isUserAdmin = Boolean(
      isOwner ||
      u?.role === "super_admin" ||
      u?.role === "client_admin" ||
      String(u?.department || "").toLowerCase() === "admin" ||
      String(u?.title || "").toLowerCase().includes("admin")
    );

    let displayRole = "Team Member";
    let badgeColor = "bg-teal-50 text-teal-700 border-teal-200";

    if (u?.role === "super_admin") {
      displayRole = "Super Admin";
      badgeColor = "bg-purple-50 text-purple-700 border-purple-200";
    } else if (isOwner) {
      displayRole = "Admin (Owner)";
      badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
    } else if (isUserAdmin) {
      displayRole = "Admin";
      badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
    } else {
      const dept = String(u?.department || u?.title || "Operations").trim();
      const deptLower = dept.toLowerCase();
      if (deptLower === "sales") {
        displayRole = "Sales";
        badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
      } else if (deptLower === "support") {
        displayRole = "Support";
        badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
      } else if (deptLower === "engineering") {
        displayRole = "Engineering";
        badgeColor = "bg-indigo-50 text-indigo-700 border-indigo-200";
      } else if (deptLower === "operations") {
        displayRole = "Operations";
        badgeColor = "bg-teal-50 text-teal-700 border-teal-200";
      } else {
        displayRole = dept.charAt(0).toUpperCase() + dept.slice(1);
        badgeColor = "bg-slate-50 text-slate-700 border-slate-200";
      }
    }

    return { isOwner, isAdmin: isUserAdmin, displayRole, badgeColor };
  };

  // Filtered & Paginated Users for Tab 3
  const filteredUsers = teamUsers.filter((u) => {
    const q = userSearchTerm.toLowerCase().trim();
    const matchesQuery =
      !q ||
      (u.name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q);

    const roleInfo = getUserRoleInfo(u);

    let matchesRole = true;
    if (userRoleFilter === "all") {
      matchesRole = true;
    } else if (userRoleFilter.toLowerCase() === "admin") {
      matchesRole = roleInfo.isAdmin;
    } else {
      matchesRole =
        !roleInfo.isOwner &&
        (String(u.department || "").toLowerCase() === userRoleFilter.toLowerCase() ||
         roleInfo.displayRole.toLowerCase() === userRoleFilter.toLowerCase());
    }

    const matchesOrg =
      userOrgFilter === "all" ||
      String(u.organizationId) === userOrgFilter;

    return matchesQuery && matchesRole && matchesOrg;
  });

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));
  const paginatedUsers = filteredUsers.slice(
    (userPage - 1) * userPageSize,
    userPage * userPageSize
  );

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#20243A]">
          Workspace Settings
        </h1>
        <p className="text-sm text-[#747B91] mt-0.5">
          Manage your workspace profile and team members.
        </p>
      </div>

      {banner && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            banner.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="font-bold hover:opacity-75 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E8EAF1] pb-2">
        {[
          { id: "org", label: "Organization Profile" },
          { id: "team", label: "Team & Role Management" },
          ...(isSuperAdmin
            ? [
                { id: "integration", label: "Voice AI Engine & Database Status" },
                {
                  id: "onboarding",
                  label: "Super Admin: Organization Onboarding",
                },
              ]
            : []),
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === tab.id
                ? "bg-[#635BFF] text-white shadow-sm"
                : "text-[#747B91] hover:text-[#20243A] hover:bg-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: IndiaCalling Voice AI Integration */}
      {activeTab === "integration" && isSuperAdmin && (() => {
        const isBolnaLiveConnected =
          Boolean(healthResult?.bolnaLiveConnected) ||
          Boolean(healthResult?.connected && healthResult?.mode === "live");
        const isBolnaConfigured =
          Boolean(healthResult?.bolnaConfigured) ||
          Boolean(healthResult?.hasApiKey) ||
          Boolean(healthResult?.connected);
        const isGeminiReady = Boolean(healthResult?.geminiConfigured);

        return (
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {/* Card 1: IndiaCalling Voice AI Endpoint */}
              <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl">
                <p className="text-[#747B91]">Voice AI Engine API Endpoint</p>
                <p className="font-mono font-bold text-[#20243A] mt-1">
                  {healthResult?.bolnaBaseUrl || healthResult?.configuredBaseUrl || "Voice AI Engine Endpoint"}
                </p>
                <p className="text-[11px] text-[#747B91] mt-1">
                  Mode:{" "}
                  <span className="font-semibold text-[#635BFF]">
                    {healthResult?.mode === "mock" ? "Standby (API Key Not Set)" : "Production Live"}
                  </span>
                </p>
              </div>

              {/* Card 2: IndiaCalling Voice AI Status */}
              <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl">
                <div className="flex items-center justify-between">
                  <p className="text-[#747B91]">Voice AI Engine API Status</p>
                  {(loadingHealth || healthTesting) && (
                    <span className="w-2 h-2 rounded-full bg-[#635BFF] animate-ping" />
                  )}
                </div>

                {loadingHealth || healthTesting ? (
                  <p className="font-semibold text-xs text-[#635BFF] flex items-center gap-1.5 mt-1">
                    Checking Voice AI Engine API...
                  </p>
                ) : (
                  <p
                    className={`font-bold mt-1 ${
                      isBolnaLiveConnected
                        ? "text-emerald-600"
                        : isBolnaConfigured
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }`}
                  >
                    {isBolnaLiveConnected
                      ? "✓ Connected & Verified"
                      : isBolnaConfigured
                      ? "✓ Live API Key Configured"
                      : "Needs API Key"}
                  </p>
                )}

                <p className="text-[11px] text-[#747B91] mt-1">
                  Live Agents:{" "}
                  <span className="font-semibold text-[#20243A]">
                    {healthResult?.bolnaAgentCount ?? healthResult?.remoteAgentCount ?? 1}
                  </span>
                </p>
              </div>

              {/* Card 3: Google Gemini */}
              <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl">
                <div className="flex items-center justify-between">
                  <p className="text-[#747B91]">Google Gemini AI</p>
                  {(loadingHealth || healthTesting) && (
                    <span className="w-2 h-2 rounded-full bg-[#635BFF] animate-ping" />
                  )}
                </div>

                {loadingHealth || healthTesting ? (
                  <p className="font-semibold text-xs text-[#635BFF] flex items-center gap-1.5 mt-1">
                    Verifying Gemini Key...
                  </p>
                ) : (
                  <p
                    className={`font-bold mt-1 ${
                      isGeminiReady
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }`}
                  >
                    {isGeminiReady
                      ? "✓ Free Tier Ready"
                      : "Missing Key"}
                  </p>
                )}

                <p className="text-[11px] text-[#747B91] mt-1">
                  {healthResult?.geminiModel || "gemini-1.5-flash"}
                </p>
              </div>

              {/* Card 4: MongoDB */}
              <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl">
                <p className="text-[#747B91]">MongoDB Database</p>
                <p
                  className={`font-bold mt-1 ${
                    healthResult?.mongodbConnected
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }`}
                >
                  {healthResult?.mongodbConnected
                    ? "✓ Connected (Real Atlas)"
                    : "In-Memory Store"}
                </p>
                <p className="text-[11px] text-[#747B91] mt-1">Multi-tenant store</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={testHealth}
                disabled={healthTesting}
                className="px-4 py-2 bg-[#635BFF] text-white rounded-lg text-xs font-semibold hover:bg-[#5046E5] disabled:opacity-50 transition-colors shadow-sm inline-flex items-center gap-2"
              >
                {healthTesting ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    Verifying Live Health...
                  </>
                ) : (
                  "Ping IndiaCalling Voice AI & Check Health"
                )}
              </button>
              <button
                onClick={handleManualSyncNow}
                disabled={syncingNow}
                className="px-4 py-2 bg-white border border-[#E8EAF1] text-[#20243A] rounded-lg text-xs font-semibold hover:bg-[#F7F8FC] disabled:opacity-50 transition-colors inline-flex items-center gap-2"
              >
                {syncingNow ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-[#635BFF] animate-ping" />
                    Syncing with Voice AI Engine...
                  </>
                ) : (
                  "Sync All Agents & Calls Now"
                )}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Tab 2: Organization Onboarding (Super Admin Only) */}
      {activeTab === "onboarding" && isSuperAdmin && (
        <div className="space-y-6">
          <form
            onSubmit={handleOnboardOrganization}
            className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-4 text-xs"
          >
            <div>
              <h2 className="font-bold text-sm text-[#20243A]">
                Onboard New Client Business Organization
              </h2>
              <p className="text-[#747B91] mt-0.5">
                Provisions an isolated tenant workspace and creates its initial Organization account.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={onboardForm.businessName}
                  onChange={(e) =>
                    setOnboardForm({
                      ...onboardForm,
                      businessName: e.target.value,
                    })
                  }
                  placeholder="e.g. Skyline Realty Pvt Ltd"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Business Category / Industry *
                </label>
                <select
                  value={onboardForm.industry}
                  onChange={(e) =>
                    setOnboardForm({ ...onboardForm, industry: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF] text-[#20243A]"
                >
                  {BUSINESS_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={onboardForm.contactEmail}
                  onChange={(e) =>
                    setOnboardForm({
                      ...onboardForm,
                      contactEmail: e.target.value,
                    })
                  }
                  placeholder="contact@company.com"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={onboardForm.contactPhone}
                  onChange={(e) =>
                    setOnboardForm({
                      ...onboardForm,
                      contactPhone: e.target.value,
                    })
                  }
                  placeholder="+91 98765 43210"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Business Owner Name
                </label>
                <input
                  type="text"
                  value={onboardForm.ownerName}
                  onChange={(e) =>
                    setOnboardForm({
                      ...onboardForm,
                      ownerName: e.target.value,
                    })
                  }
                  placeholder="Full name of owner"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Business Address
                </label>
                <input
                  type="text"
                  value={onboardForm.address}
                  onChange={(e) =>
                    setOnboardForm({ ...onboardForm, address: e.target.value })
                  }
                  placeholder="City, State, Country"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
                />
              </div>
            </div>

            <div className="border-t border-[#E8EAF1] pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Initial Organization Name *
                </label>
                <input
                  type="text"
                  required
                  value={onboardForm.adminName}
                  onChange={(e) =>
                    setOnboardForm({
                      ...onboardForm,
                      adminName: e.target.value,
                    })
                  }
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Initial Organization Email *
                </label>
                <input
                  type="email"
                  required
                  value={onboardForm.adminEmail}
                  onChange={(e) =>
                    setOnboardForm({
                      ...onboardForm,
                      adminEmail: e.target.value,
                    })
                  }
                  placeholder="admin@company.com"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Initial Organization Password *
                </label>
                <input
                  type="password"
                  required
                  value={onboardForm.adminPassword}
                  onChange={(e) =>
                    setOnboardForm({
                      ...onboardForm,
                      adminPassword: e.target.value,
                    })
                  }
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#635BFF] text-white rounded-lg font-semibold hover:bg-[#5046E5] transition-colors shadow-sm"
              >
                Create Organization & Provision Organization
              </button>
            </div>
          </form>

          {/* Provisioned Organizations Table */}
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-[#20243A]">
              Provisioned Client Organizations ({organizations.length})
            </h3>
            <table className="w-full">
              <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                    Organization
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                    Category
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                    Users
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAF1]">
                {organizations.map((org) => (
                  <tr key={org._id || org.slug}>
                    <td className="px-4 py-2.5 font-semibold text-[#20243A]">
                      {org.name}
                    </td>
                    <td className="px-4 py-2.5 text-[#747B91]">
                      {org.industry || "B2B SaaS"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {org.status || "active"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#20243A]">
                      {org.totalUsers ?? 4}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Team & Role Management (Streamlined, Searchable & Filterable) */}
      {activeTab === "team" && (
        <div className="space-y-6">
          {/* Add Team Member Form */}
          <form
            onSubmit={handleCreateTeamMember}
            className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-4 text-xs"
          >
            <div>
              <h3 className="font-bold text-sm text-[#20243A]">
                Add Team Member
              </h3>
              <p className="text-[#747B91] mt-0.5">
                Create role-based accounts (Organization Team Members) for your team.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                required
                placeholder="Full Name"
                value={newMember.name}
                onChange={(e) =>
                  setNewMember({ ...newMember, name: e.target.value })
                }
                className="px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
              />
              <input
                type="email"
                required
                placeholder="email@company.com"
                value={newMember.email}
                onChange={(e) =>
                  setNewMember({ ...newMember, email: e.target.value })
                }
                className="px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
              />
              <input
                type="password"
                required
                placeholder="Initial Password"
                value={newMember.password}
                onChange={(e) =>
                  setNewMember({ ...newMember, password: e.target.value })
                }
                className="px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
              />
              <div className="flex gap-2">
                <select
                  value={(newMember as any).department || "Sales"}
                  onChange={(e) =>
                    setNewMember({
                      ...newMember,
                      role: "organization",
                      department: e.target.value,
                    } as any)
                  }
                  className="flex-1 px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF] text-[#20243A]"
                >
                  <option value="Sales">Sales</option>
                  <option value="Operations">Operations</option>
                  <option value="Support">Support</option>
                  <option value="Admin">Admin</option>
                  <option value="Engineering">Engineering</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg font-semibold transition-colors shadow-sm"
                >
                  Add
                </button>
              </div>
            </div>
          </form>

          {/* Active Users Table with Full Search, Role & Organization Filters */}
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm text-[#20243A]">
                  Active Team Members ({filteredUsers.length} of {teamUsers.length})
                </h3>
                <p className="text-[11px] text-[#747B91] mt-0.5">
                  Search, filter by role or organization to easily manage team members.
                </p>
              </div>

              {/* Filters toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search name or email..."
                  value={userSearchTerm}
                  onChange={(e) => {
                    setUserSearchTerm(e.target.value);
                    setUserPage(1);
                  }}
                  className="px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF] text-xs w-48"
                />

                <select
                  value={userRoleFilter}
                  onChange={(e) => {
                    setUserRoleFilter(e.target.value);
                    setUserPage(1);
                  }}
                  className="px-2.5 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF] text-xs text-[#20243A]"
                >
                  <option value="all">All Departments</option>
                  <option value="Admin">Admin (Owner & Admins)</option>
                  <option value="Sales">Sales</option>
                  <option value="Operations">Operations</option>
                  <option value="Support">Support</option>
                  <option value="Engineering">Engineering</option>
                </select>

                {organizations.length > 1 && (
                  <select
                    value={userOrgFilter}
                    onChange={(e) => {
                      setUserOrgFilter(e.target.value);
                      setUserPage(1);
                    }}
                    className="px-2.5 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF] text-xs text-[#20243A]"
                  >
                    <option value="all">All Organizations</option>
                    {organizations.map((org) => (
                      <option key={org._id || org.slug} value={String(org._id)}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {paginatedUsers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                        Name
                      </th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                        Email
                      </th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                        Organization
                      </th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                        Role
                      </th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[#747B91]">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EAF1]">
                    {paginatedUsers.map((m) => {
                      const roleInfo = getUserRoleInfo(m);
                      const orgName =
                        orgMap.get(String(m.organizationId)) ||
                        m.organizationName ||
                        "IndiaCalling Console";

                      return (
                        <tr key={m._id || m.email} className="hover:bg-[#F7F8FC] transition-colors">
                          <td className="px-4 py-2.5 font-semibold text-[#20243A]">
                            <div className="flex items-center gap-1.5">
                              <span>{m.name}</span>
                              {roleInfo.isOwner && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  Owner
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-[#747B91]">{m.email}</td>
                          <td className="px-4 py-2.5 text-[#20243A] font-medium">
                            {orgName}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${roleInfo.badgeColor}`}
                            >
                              {roleInfo.displayRole}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Active
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-[#747B91] border border-dashed border-[#E8EAF1] rounded-xl">
                No team members match your search or filter criteria.
              </div>
            )}

            {/* Pagination Controls */}
            {totalUserPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-[#E8EAF1] text-xs">
                <span className="text-[#747B91]">
                  Showing {(userPage - 1) * userPageSize + 1} to{" "}
                  {Math.min(userPage * userPageSize, filteredUsers.length)} of{" "}
                  {filteredUsers.length} users
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={userPage <= 1}
                    onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg disabled:opacity-40 font-medium hover:bg-white"
                  >
                    Previous
                  </button>
                  <span className="px-2 py-1 font-semibold text-[#20243A]">
                    {userPage} / {totalUserPages}
                  </span>
                  <button
                    disabled={userPage >= totalUserPages}
                    onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}
                    className="px-3 py-1 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg disabled:opacity-40 font-medium hover:bg-white"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Organization Profile & Telephony Settings */}
      {activeTab === "org" && (
        <form
          onSubmit={handleUpdateOrgProfile}
          className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-6 text-xs"
        >
          <div>
            <h2 className="font-bold text-sm text-[#20243A]">
              Organization Profile & Telephony Calling Parameters
            </h2>
            <p className="text-[#747B91] mt-0.5">
              Configure tenant business identification, primary contacts, and AI dialer operating limits.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Organization / Company Name *
              </label>
              <input
                type="text"
                required
                value={orgForm.name}
                onChange={(e) =>
                  setOrgForm({ ...orgForm, name: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Business Category / Industry *
              </label>
              <select
                value={orgForm.industry}
                onChange={(e) =>
                  setOrgForm({ ...orgForm, industry: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF] text-[#20243A]"
              >
                {BUSINESS_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Primary Contact Email *
              </label>
              <input
                type="email"
                required
                value={orgForm.email}
                onChange={(e) =>
                  setOrgForm({ ...orgForm, email: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Primary Contact Phone *
              </label>
              <input
                type="text"
                required
                value={orgForm.phone}
                onChange={(e) =>
                  setOrgForm({ ...orgForm, phone: e.target.value })
                }
                placeholder="+91 98765 43210"
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-[#20243A] mb-1">
                Registered Office Address
              </label>
              <input
                type="text"
                value={orgForm.address}
                onChange={(e) =>
                  setOrgForm({ ...orgForm, address: e.target.value })
                }
                placeholder="Building, Street, City, State, PIN"
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
              />
            </div>
          </div>

          {/* Telephony and Calling Operations */}
          <div className="border-t border-[#E8EAF1] pt-4 space-y-4">
            <h3 className="font-semibold text-xs text-[#20243A] uppercase tracking-wider">
              Telephony & AI Calling Schedule
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Allowed Calling Window Start
                </label>
                <input
                  type="time"
                  value={orgForm.callingStart}
                  onChange={(e) =>
                    setOrgForm({ ...orgForm, callingStart: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Allowed Calling Window End
                </label>
                <input
                  type="time"
                  value={orgForm.callingEnd}
                  onChange={(e) =>
                    setOrgForm({ ...orgForm, callingEnd: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Operating Timezone
                </label>
                <select
                  value={orgForm.timezone}
                  onChange={(e) =>
                    setOrgForm({ ...orgForm, timezone: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF] text-[#20243A]"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Max Concurrent Voice Channels
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={orgForm.maxConcurrentCalls}
                  onChange={(e) =>
                    setOrgForm({
                      ...orgForm,
                      maxConcurrentCalls: parseInt(e.target.value, 10) || 1,
                    })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#20243A] mb-1">
                  Primary AI Language Model Mode
                </label>
                <select
                  value={orgForm.defaultLanguage}
                  onChange={(e) =>
                    setOrgForm({ ...orgForm, defaultLanguage: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg focus:outline-none focus:border-[#635BFF] text-[#20243A]"
                >
                  <option value="English + Hindi">Bilingual: English + Hindi (Hinglish)</option>
                  <option value="English">English (Indian Accent / Global)</option>
                  <option value="Hindi">Pure Hindi (Devanagari / Conversational)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={updatingOrg}
              className="px-6 py-2.5 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg font-semibold disabled:opacity-50 transition-colors shadow-sm"
            >
              {updatingOrg ? "Saving Profile..." : "Save Organization Profile"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
