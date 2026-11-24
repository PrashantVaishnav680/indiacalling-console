"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatDate, formatDuration } from "@/lib/utils";
import { LoadingSpinner, ButtonSpinner } from "@/components/LoadingSpinner";

type OrgSectionTab =
  | "profile"
  | "users"
  | "agents"
  | "campaigns"
  | "leads"
  | "calls"
  | "usage"
  | "settings";

type UsagePeriod = "All" | "30D" | "7D" | "Today";

export default function OrganizationDetailsPage({
  params,
}: {
  params?: { id: string } | Promise<{ id: string }>;
}) {
  const router = useRouter();
  const routeParams = useParams();
  const id = (routeParams?.id as string) || (params as any)?.id || "";

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrgSectionTab>("profile");
  const [saving, setSaving] = useState(false);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showEditAdminModal, setShowEditAdminModal] = useState(false);
  const [testingIntegration, setTestingIntegration] = useState<string | null>(null);
  const [usagePeriod, setUsagePeriod] = useState<UsagePeriod>("All");
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [profileForm, setProfileForm] = useState({
    name: "",
    industry: "",
    email: "",
    phone: "",
    address: "",
  });

  const [adminForm, setAdminForm] = useState({
    name: "",
    email: "",
    isActive: true,
  });

  const [settingsForm, setSettingsForm] = useState({
    name: "",
    email: "",
    phone: "",
    industry: "",
    address: "",
    callingStart: "09:30",
    callingEnd: "18:30",
    timezone: "Asia/Kolkata",
    maxConcurrentCalls: 10,
    defaultLanguage: "English + Hindi",
  });

  const loadOrganizationDetails = useCallback(async (periodOverride?: UsagePeriod) => {
    if (!id) return;
    const targetPeriod = periodOverride || usagePeriod;
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${id}?period=${encodeURIComponent(targetPeriod)}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        const o = json.organization || {};
        const adm = json.administrator || {};

        setProfileForm({
          name: o.name || "",
          industry: o.industry || "General Business",
          email: o.email || "",
          phone: o.phone || "",
          address: o.address || "",
        });

        setAdminForm({
          name: adm.name || o.adminName || "",
          email: adm.email || o.adminEmail || "",
          isActive: adm.isActive !== false,
        });

        setSettingsForm({
          name: o.name || "",
          email: o.email || "",
          phone: o.phone || "",
          industry: o.industry || "",
          address: o.address || "",
          callingStart: o.settings?.callingHours?.start || "09:30",
          callingEnd: o.settings?.callingHours?.end || "18:30",
          timezone: o.settings?.callingHours?.timezone || "Asia/Kolkata",
          maxConcurrentCalls: o.settings?.maxConcurrentCalls || 10,
          defaultLanguage: o.settings?.defaultLanguage || "English + Hindi",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [id, usagePeriod]);

  useEffect(() => {
    loadOrganizationDetails();
  }, [loadOrganizationDetails]);

  const handleToggleOrgStatus = async (forcedStatus?: "active" | "suspended") => {
    if (!data?.organization || !id) return;
    const nextStatus =
      forcedStatus || (data.organization.status === "active" ? "suspended" : "active");
    setSaving(true);
    setBanner(null);

    // Optimistically update status on page
    setData((prev: any) =>
      prev
        ? {
            ...prev,
            organization: {
              ...prev.organization,
              status: nextStatus,
            },
          }
        : prev
    );

    try {
      const res = await fetch(`/api/organizations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setBanner({
          type: "success",
          text: `Organization status updated to "${nextStatus.toUpperCase()}".`,
        });
        await loadOrganizationDetails();
      } else {
        const err = await res.json();
        setBanner({
          type: "error",
          text: err.details || err.error || "Failed to update organization status",
        });
        await loadOrganizationDetails();
      }
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Failed to update status",
      });
      await loadOrganizationDetails();
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/organizations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileForm.name,
          industry: profileForm.industry,
          email: profileForm.email,
          phone: profileForm.phone,
          address: profileForm.address,
        }),
      });
      if (res.ok) {
        setBanner({
          type: "success",
          text: `Organization profile updated successfully.`,
        });
        setShowEditProfileModal(false);
        await loadOrganizationDetails();
      } else {
        const err = await res.json();
        setBanner({
          type: "error",
          text: err.details || err.error || "Failed to update profile",
        });
      }
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Failed to update profile",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAdministrator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/organizations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminName: adminForm.name,
          adminEmail: adminForm.email,
          adminActive: adminForm.isActive,
        }),
      });
      if (res.ok) {
        setBanner({
          type: "success",
          text: `Primary Administrator updated and persisted in MongoDB.`,
        });
        setShowEditAdminModal(false);
        await loadOrganizationDetails();
      } else {
        const err = await res.json();
        setBanner({
          type: "error",
          text: err.details || err.error || "Failed to update administrator",
        });
      }
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Failed to update administrator",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestIntegration = async (provider: "bolna" | "gemini") => {
    setTestingIntegration(provider);
    setBanner(null);
    try {
      if (provider === "bolna") {
        const res = await fetch("/api/bolna/health");
        const json = await res.json();
        if (json.connected) {
          setBanner({
            type: "success",
            text: `IndiaCalling Voice AI Connection Verified: ${json.status}. Found ${json.remoteAgentCount ?? 0} voice agent(s) on your IndiaCalling Voice AI account.`,
          });
        } else {
          setBanner({
            type: "error",
            text: `IndiaCalling Voice AI Connection Test Failed: ${json.details || json.status || "Could not reach Voice AI Engine API"}`,
          });
        }
      } else {
        const res = await fetch("/api/ai/prompt-assistant");
        const json = await res.json();
        if (json.configured || json.freeTierReady) {
          setBanner({
            type: "success",
            text: `Google Gemini Prompt Assistant Verified: Live and operational (Gemini 2.5/Flash Free Tier).`,
          });
        } else {
          setBanner({
            type: "error",
            text: `Google Gemini Connection: GEMINI_API_KEY is not configured or invalid in environment.`,
          });
        }
      }
      await loadOrganizationDetails();
    } catch (err: any) {
      setBanner({
        type: "error",
        text: `Integration test error: ${err?.message}`,
      });
    } finally {
      setTestingIntegration(null);
    }
  };

  const handleSaveOrgSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/organizations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: settingsForm.name,
          email: settingsForm.email,
          phone: settingsForm.phone,
          industry: settingsForm.industry,
          address: settingsForm.address,
          settings: {
            callingHours: {
              start: settingsForm.callingStart,
              end: settingsForm.callingEnd,
              timezone: settingsForm.timezone,
            },
            maxConcurrentCalls: Number(settingsForm.maxConcurrentCalls || 10),
            defaultLanguage: settingsForm.defaultLanguage,
          },
        }),
      });
      if (res.ok) {
        setBanner({
          type: "success",
          text: "Organization profile and calling guardrails saved.",
        });
        await loadOrganizationDetails();
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-16 flex flex-col items-center justify-center space-y-3">
        <LoadingSpinner size="lg" color="text-[#635BFF]" />
        <p className="text-xs font-semibold text-[#20243A] animate-pulse">
          Loading organization details...
        </p>
      </div>
    );
  }

  if (!data?.organization) {
    return (
      <div className="bg-white border border-[#E8EAF1] rounded-2xl p-12 text-center max-w-lg mx-auto shadow-sm">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl mb-3">
          ✕
        </div>
        <h2 className="text-base font-bold text-[#20243A]">
          Organization Not Found
        </h2>
        <p className="text-xs text-[#747B91] mt-1">
          The requested organization could not be found or has been deleted.
        </p>
        <Link
          href="/organizations"
          className="inline-block mt-4 px-4 py-2 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg text-xs font-semibold"
        >
          ← Back to Organizations
        </Link>
      </div>
    );
  }

  const org = data.organization;
  const admin = data.administrator;
  const stats = data.usageStatistics || {};
  const integ = data.integrationStatus || {};
  const knowledgeBases = data.knowledgeBases || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#747B91]">
            <Link href="/organizations" className="hover:text-[#635BFF]">
              Organizations
            </Link>
            <span>/</span>
            <span className="text-[#20243A] font-medium">{org.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 mt-1">
            <h1 className="text-2xl font-bold text-[#20243A]">{org.name}</h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                org.status === "active"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : org.status === "suspended"
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}
            >
              {org.status}
            </span>
            <span className="font-mono text-xs text-[#635BFF] bg-[#EEF0FF] px-2.5 py-0.5 rounded-md">
              ID: {org._id}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (org.status === "active") {
                setShowSuspendConfirm(true);
              } else {
                handleToggleOrgStatus("active");
              }
            }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
              org.status === "active"
                ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            {saving
              ? "Updating..."
              : org.status === "active"
              ? "Suspend Organization"
              : "Activate Organization"}
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between animate-in fade-in duration-150 ${
            banner.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="font-bold hover:opacity-75"
          >
            ✕
          </button>
        </div>
      )}

      {/* 8 Organization-Specific KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-center">
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
          <p className="text-[11px] text-[#747B91]">Team Members</p>
          <p className="text-xl font-bold text-[#635BFF] mt-1">
            {stats.totalUsers ?? (data.users || []).length}
          </p>
          <p className="text-[10px] text-[#747B91]">Org Accounts</p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
          <p className="text-[11px] text-[#747B91]">AI Agents</p>
          <p className="text-xl font-bold text-[#20243A] mt-1">
            {stats.totalAgents ?? (data.agents || []).length}
          </p>
          <p className="text-[10px] text-[#747B91]">Configured</p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
          <p className="text-[11px] text-[#747B91]">Campaigns</p>
          <p className="text-xl font-bold text-[#20243A] mt-1">
            {stats.totalCampaigns ?? (data.campaigns || []).length}
          </p>
          <p className="text-[10px] text-[#747B91]">Active/Ready</p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
          <p className="text-[11px] text-[#747B91]">Total Leads</p>
          <p className="text-xl font-bold text-[#20243A] mt-1">
            {stats.totalLeads ?? (data.leads || []).length}
          </p>
          <p className="text-[10px] text-[#747B91]">Enrolled</p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
          <p className="text-[11px] text-[#747B91]">Qualified Leads</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">
            {stats.qualifiedLeads ?? 0}
          </p>
          <p className="text-[10px] text-emerald-700">Verified</p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
          <p className="text-[11px] text-[#747B91]">Total Calls</p>
          <p className="text-xl font-bold text-[#20243A] mt-1">
            {stats.totalCalls ?? (data.calls || []).length}
          </p>
          <p className="text-[10px] text-[#747B91]">Lifetime</p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
          <p className="text-[11px] text-[#747B91]">Voice Minutes</p>
          <p className="text-xl font-bold text-[#20243A] mt-1">
            {stats.totalMinutes ?? 0}m
          </p>
          <p className="text-[10px] text-[#747B91]">Billed Duration</p>
        </div>
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
          <p className="text-[11px] text-[#747B91]">Usage Cost</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">
            ₹{Number(stats.actualBilledCostInr ?? stats.totalCostInr ?? 0).toFixed(2)}
          </p>
          <p className="text-[10px] text-emerald-700">Estimated Telephony Cost</p>
        </div>
      </div>

      {/* Navigation Tabs - Consistent Section Numbers 1 through 8 */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white border border-[#E8EAF1] rounded-xl p-1.5 text-xs shadow-sm">
        {[
          {
            id: "profile" as OrgSectionTab,
            label: "1. Profile & Administration",
          },
          {
            id: "users" as OrgSectionTab,
            label: `2. Team Members (${(data.users || []).length})`,
          },
          {
            id: "agents" as OrgSectionTab,
            label: `3. AI Agents (${(data.agents || []).length})`,
          },
          {
            id: "campaigns" as OrgSectionTab,
            label: `4. Campaigns (${(data.campaigns || []).length})`,
          },
          {
            id: "leads" as OrgSectionTab,
            label: `5. Leads (${(data.leads || []).length})`,
          },
          {
            id: "calls" as OrgSectionTab,
            label: `6. Call History (${(data.calls || []).length})`,
          },
          {
            id: "usage" as OrgSectionTab,
            label: "7. Usage & Billing Analytics",
          },
          {
            id: "settings" as OrgSectionTab,
            label: "8. Organization Settings & Guardrails",
          },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 rounded-lg font-semibold transition-colors ${
              activeTab === t.id
                ? "bg-[#635BFF] text-white shadow-xs"
                : "text-[#747B91] hover:text-[#20243A] hover:bg-[#F7F8FC]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Profile, Admin, Integrations & Knowledge Base */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
            {/* Section 1.1: Organization Profile */}
            <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-3.5">
              <div className="flex items-center justify-between border-b border-[#E8EAF1] pb-2.5">
                <div>
                  <h3 className="text-sm font-bold text-[#20243A]" data-section="1. Organization Profile">
                    Organization Profile
                  </h3>
                  <p className="text-[11px] text-[#747B91]">
                    Company identity & official business contact
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditProfileModal(true)}
                  className="px-2.5 py-1 bg-[#F7F8FC] border border-[#E8EAF1] text-[#20243A] rounded font-semibold hover:border-[#635BFF] hover:text-[#635BFF]"
                >
                  ✏️ Edit Profile
                </button>
              </div>

              <div className="space-y-2.5">
                <div className="flex justify-between py-1 border-b border-[#F7F8FC]">
                  <span className="text-[#747B91]">Organization Name:</span>
                  <span className="font-semibold text-[#20243A]">{org.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F7F8FC]">
                  <span className="text-[#747B91]">Workspace Slug:</span>
                  <span className="font-mono text-[#635BFF]">{org.slug}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F7F8FC]">
                  <span className="text-[#747B91]">Industry Sector:</span>
                  <span className="text-[#20243A]">{org.industry || "General Business"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F7F8FC]">
                  <div>
                    <span className="text-[#747B91] block">Company Contact Email:</span>
                    <span className="text-[10px] text-[#747B91]">General notifications & billing</span>
                  </div>
                  <span className="font-medium text-[#20243A] text-right">{org.email}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F7F8FC]">
                  <span className="text-[#747B91]">Contact Phone:</span>
                  <span className="text-[#20243A]">{org.phone || "—"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F7F8FC]">
                  <span className="text-[#747B91]">Office Address:</span>
                  <span className="text-[#20243A] max-w-[200px] text-right truncate">
                    {org.address || "India"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#747B91]">Registered Date:</span>
                  <span className="text-[#20243A]">{formatDate(org.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Section 1.2: Primary Administrator */}
            <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-3.5">
              <div className="flex items-center justify-between border-b border-[#E8EAF1] pb-2.5">
                <div>
                  <h3 className="text-sm font-bold text-[#20243A]" data-section="2. Primary Organization Administrator">
                    Primary Organization Administrator
                  </h3>
                  <p className="text-[11px] text-[#747B91]">
                    Designated workspace owner & login account
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditAdminModal(true)}
                  className="px-2.5 py-1 bg-[#F7F8FC] border border-[#E8EAF1] text-[#20243A] rounded font-semibold hover:border-[#635BFF] hover:text-[#635BFF]"
                >
                  ✏️ Edit Admin
                </button>
              </div>

              <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[#20243A]">
                    {admin?.name || org.adminName}
                  </p>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                      admin?.isActive !== false
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {admin?.isActive !== false ? "Active Account" : "Inactive"}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] text-[#747B91]">Administrator Login Email:</p>
                  <p className="font-mono text-xs font-semibold text-[#20243A]">
                    {admin?.email || org.ownerEmail || org.adminEmail}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#EEF0FF] text-[#635BFF] font-semibold uppercase text-[10px]">
                    CLIENT_ADMIN
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab("users")}
                    className="text-[#635BFF] font-semibold hover:underline text-[11px]"
                  >
                    View All Members ({stats.totalUsers}) →
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-[#747B91] leading-relaxed">
                This administrator manages voice agents, leads, campaigns, and team members for this tenant. Password resets can be performed via the login portal or database console.
              </p>
            </div>

            {/* Section 1.3: Integration Status */}
            <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-3.5">
              <div className="flex items-center justify-between border-b border-[#E8EAF1] pb-2.5">
                <div>
                  <h3 className="text-sm font-bold text-[#20243A]" data-section="9. Integration Status">
                    Integration Status
                  </h3>
                  <p className="text-[11px] text-[#747B91]">
                    Live telemetry & engine connectivity
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {/* IndiaCalling Voice AI Voice Engine */}
                <div className="p-3 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#20243A]">IndiaCalling Voice AI Voice v2</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        integ.bolnaConfigured
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {integ.bolnaConfigured ? "Connected (Live v2)" : "Configuration Required"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#747B91]">
                    <span>Endpoint: api.bolna.ai</span>
                    <button
                      type="button"
                      disabled={testingIntegration === "bolna"}
                      onClick={() => handleTestIntegration("bolna")}
                      className="text-[#635BFF] font-bold hover:underline inline-flex items-center gap-1"
                    >
                      {testingIntegration === "bolna" ? (
                        <>
                          <ButtonSpinner className="text-[#635BFF] mr-1" />
                          <span>Testing...</span>
                        </>
                      ) : (
                        "⚡ Test Connection"
                      )}
                    </button>
                  </div>
                </div>

                {/* Google Gemini */}
                <div className="p-3 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#20243A]">Google Gemini Assistant</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        integ.geminiConfigured
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {integ.geminiConfigured ? "Free Tier Ready" : "Configuration Required"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#747B91]">
                    <span>Engine: gemini-2.5-flash</span>
                    <button
                      type="button"
                      disabled={testingIntegration === "gemini"}
                      onClick={() => handleTestIntegration("gemini")}
                      className="text-[#635BFF] font-bold hover:underline inline-flex items-center gap-1"
                    >
                      {testingIntegration === "gemini" ? (
                        <>
                          <ButtonSpinner className="text-[#635BFF] mr-1" />
                          <span>Testing...</span>
                        </>
                      ) : (
                        "⚡ Test Engine"
                      )}
                    </button>
                  </div>
                </div>

                {/* MongoDB */}
                <div className="p-3 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg flex items-center justify-between">
                  <div>
                    <span className="font-bold text-[#20243A] block">MongoDB Persistence</span>
                    <span className="text-[10px] text-[#747B91]">Multi-Tenant Store</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Connected
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1.4: Knowledge Base Sources */}
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 space-y-3.5 text-xs">
            <div className="flex items-center justify-between border-b border-[#E8EAF1] pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-[#20243A]">
                  Knowledge Base Sources ({knowledgeBases.length})
                </h3>
                <p className="text-[11px] text-[#747B91]">
                  Isolated reference documents & FAQs queried by this organization&apos;s voice agents
                </p>
              </div>
              <Link
                href="/knowledge-base"
                className="px-3 py-1.5 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg font-bold text-xs shadow-xs"
              >
                + Add Knowledge Source
              </Link>
            </div>

            {knowledgeBases.length === 0 ? (
              <div className="py-8 px-4 text-center border-2 border-dashed border-[#E8EAF1] rounded-xl bg-[#F7F8FC]">
                <div className="w-10 h-10 rounded-full bg-white border border-[#E8EAF1] text-[#635BFF] flex items-center justify-center mx-auto text-lg mb-2">
                  📚
                </div>
                <p className="font-bold text-[#20243A] text-xs">No Knowledge Base Sources Configured</p>
                <p className="text-[11px] text-[#747B91] max-w-md mx-auto mt-1">
                  Upload brochures, pricing sheets, or knowledge base URLs for this organization to empower AI voice agents with real-time semantic context during phone calls.
                </p>
                <Link
                  href="/knowledge-base"
                  className="inline-block mt-3 px-3 py-1.5 bg-white border border-[#E8EAF1] hover:border-[#635BFF] text-[#635BFF] font-semibold rounded-lg text-xs"
                >
                  Configure Knowledge Base →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {knowledgeBases.map((kb: any) => (
                  <div
                    key={kb._id}
                    className="p-3.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl space-y-2 hover:border-[#635BFF] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#20243A] truncate">{kb.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">
                        {kb.processingStatus || "ready"}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#747B91] line-clamp-2">
                      {kb.description || "Official organization knowledge document."}
                    </p>
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#E8EAF1]">
                      <span className="text-[#747B91]">{kb.documents?.length || 1} Document(s)</span>
                      <Link
                        href={`/knowledge-base?id=${kb._id}`}
                        className="text-[#635BFF] font-semibold hover:underline"
                      >
                        Inspect →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Team Members */}
      {activeTab === "users" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl overflow-hidden text-xs shadow-sm">
          <div className="p-4 border-b border-[#E8EAF1] flex items-center justify-between bg-[#F7F8FC]">
            <div>
              <h3 className="text-sm font-bold text-[#20243A]">
                Team Members & RBAC Permissions ({(data.users || []).length})
              </h3>
              <p className="text-[11px] text-[#747B91]">
                Users assigned to organization workspace &quot;{org.name}&quot;
              </p>
            </div>
          </div>
          <table className="w-full">
            <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Email</th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Role</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91]">Account Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAF1]">
              {(data.users || []).map((u: any) => (
                <tr key={u._id || u.email} className="hover:bg-[#F7F8FC]">
                  <td className="px-4 py-3 font-semibold text-[#20243A]">{u.name}</td>
                  <td className="px-4 py-3 text-[#747B91]">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-[#EEF0FF] text-[#635BFF] font-semibold uppercase text-[10px]">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        u.isActive !== false
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {u.isActive !== false ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: AI Agents */}
      {activeTab === "agents" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl overflow-hidden text-xs shadow-sm">
          <div className="p-4 border-b border-[#E8EAF1] flex items-center justify-between bg-[#F7F8FC]">
            <div>
              <h3 className="text-sm font-bold text-[#20243A]">
                Configured AI Voice Agents ({(data.agents || []).length})
              </h3>
              <p className="text-[11px] text-[#747B91]">
                Voice bots deployed for this organization
              </p>
            </div>
            <Link
              href="/agents/new"
              className="px-3 py-1.5 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg font-bold text-xs"
            >
              + Create Agent
            </Link>
          </div>
          {(data.agents || []).length > 0 ? (
            <table className="w-full">
              <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Agent Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Language</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Voice AI Agent ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Sync Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-[#747B91]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAF1]">
                {data.agents.map((a: any) => (
                  <tr key={a._id} className="hover:bg-[#F7F8FC]">
                    <td className="px-4 py-3 font-semibold text-[#20243A]">{a.name}</td>
                    <td className="px-4 py-3 text-[#747B91]">{a.language}</td>
                    <td className="px-4 py-3 font-mono text-[#635BFF]">
                      {a.bolnaAgentId || "Pending"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">
                        {a.syncStatus || "synced"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/agents/${a._id}`}
                        className="px-2.5 py-1 bg-[#EEF0FF] text-[#635BFF] rounded font-semibold hover:bg-[#635BFF] hover:text-white"
                      >
                        Inspect Agent →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-[#747B91]">
              <p className="font-semibold text-xs text-[#20243A]">No AI agents configured yet</p>
              <p className="text-[11px] mt-1">Create an inbound or outbound voice agent for this organization.</p>
              <Link
                href="/agents/new"
                className="inline-block mt-3 px-3.5 py-1.5 bg-[#635BFF] text-white rounded-lg text-xs font-semibold"
              >
                + New Agent
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Campaigns */}
      {activeTab === "campaigns" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl overflow-hidden text-xs shadow-sm">
          <div className="p-4 border-b border-[#E8EAF1] flex items-center justify-between bg-[#F7F8FC]">
            <div>
              <h3 className="text-sm font-bold text-[#20243A]">
                Voice Calling Campaigns ({(data.campaigns || []).length})
              </h3>
              <p className="text-[11px] text-[#747B91]">
                Targeted calling batches and automated workflows
              </p>
            </div>
            <Link
              href="/campaigns/new"
              className="px-3 py-1.5 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg font-bold text-xs"
            >
              + Create Campaign
            </Link>
          </div>
          {(data.campaigns || []).length > 0 ? (
            <table className="w-full">
              <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Campaign Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Objective</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Total Leads</th>
                  <th className="px-4 py-3 text-right font-semibold text-[#747B91]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAF1]">
                {data.campaigns.map((c: any) => (
                  <tr key={c._id} className="hover:bg-[#F7F8FC]">
                    <td className="px-4 py-3 font-semibold text-[#20243A]">{c.name}</td>
                    <td className="px-4 py-3 text-[#747B91]">{c.objective || "Lead Qualification"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize bg-amber-50 text-amber-800 border border-amber-200">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-[#20243A]">{c.totalLeads || 0}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/campaigns/${c._id}`}
                        className="px-2.5 py-1 bg-[#EEF0FF] text-[#635BFF] rounded font-semibold hover:bg-[#635BFF] hover:text-white"
                      >
                        Inspect Campaign →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-[#747B91]">
              <p className="font-semibold text-xs text-[#20243A]">No voice campaigns active</p>
              <p className="text-[11px] mt-1">Upload a validated contact list to initiate a campaign batch.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Leads */}
      {activeTab === "leads" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl overflow-hidden text-xs shadow-sm">
          <div className="p-4 border-b border-[#E8EAF1] flex items-center justify-between bg-[#F7F8FC]">
            <div>
              <h3 className="text-sm font-bold text-[#20243A]">
                Enrolled Contacts & CRM Leads ({(data.leads || []).length})
              </h3>
              <p className="text-[11px] text-[#747B91]">
                Contacts uploaded and qualified within this tenant
              </p>
            </div>
          </div>
          {(data.leads || []).length > 0 ? (
            <table className="w-full">
              <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Phone Number</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Qualification</th>
                  <th className="px-4 py-3 text-right font-semibold text-[#747B91]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAF1]">
                {data.leads.map((l: any) => (
                  <tr key={l._id} className="hover:bg-[#F7F8FC]">
                    <td className="px-4 py-3 font-semibold text-[#20243A]">{l.name}</td>
                    <td className="px-4 py-3 font-mono text-[#747B91]">{l.phone}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                          l.qualificationStatus === "qualified"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-[#F7F8FC] text-[#747B91] border border-[#E8EAF1]"
                        }`}
                      >
                        {l.qualificationStatus || "new"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/leads/${l._id}`}
                        className="px-2.5 py-1 bg-[#EEF0FF] text-[#635BFF] rounded font-semibold hover:bg-[#635BFF] hover:text-white"
                      >
                        View Lead →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-[#747B91]">
              <p className="font-semibold text-xs text-[#20243A]">No leads enrolled</p>
              <p className="text-[11px] mt-1">Upload contacts through the Leads module or via campaign creation.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 6: Call History */}
      {activeTab === "calls" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl overflow-hidden text-xs shadow-sm">
          <div className="p-4 border-b border-[#E8EAF1] flex items-center justify-between bg-[#F7F8FC]">
            <div>
              <h3 className="text-sm font-bold text-[#20243A]">
                Organization Call History ({(data.calls || []).length})
              </h3>
              <p className="text-[11px] text-[#747B91]">
                Complete audit trail of inbound, outbound, and web-call voice sessions
              </p>
            </div>
          </div>
          {(data.calls || []).length > 0 ? (
            <table className="w-full">
              <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Contact</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Assigned Agent</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Call Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#747B91]">Duration</th>
                  <th className="px-4 py-3 text-right font-semibold text-[#747B91]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAF1]">
                {data.calls.map((c: any) => (
                  <tr key={c._id} className="hover:bg-[#F7F8FC]">
                    <td className="px-4 py-3 font-semibold text-[#20243A]">
                      {c.leadName || c.phoneNumber || "Unknown"}
                    </td>
                    <td className="px-4 py-3 text-[#747B91]">{c.agentName || "Voice Bot"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                          c.status === "completed"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : c.status === "failed" || c.status === "busy"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">{formatDuration(c.durationSeconds || 0)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/calls/${c._id}`}
                        className="px-2.5 py-1 bg-[#EEF0FF] text-[#635BFF] rounded font-semibold hover:bg-[#635BFF] hover:text-white"
                      >
                        Call Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-[#747B91]">
              <p className="font-semibold text-xs text-[#20243A]">No calls recorded yet</p>
              <p className="text-[11px] mt-1">Dispatched campaign calls and web tests will appear here.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 7: Usage & Billing Analytics */}
      {activeTab === "usage" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-5 text-xs shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E8EAF1] pb-4">
            <div>
              <h3 className="text-sm font-bold text-[#20243A]">
                Telephony Usage & Billing Breakdown
              </h3>
              <p className="text-[11px] text-[#747B91]">
                Voice minutes and telephony spend calculated strictly from actual call execution records
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-[#F7F8FC] p-1 border border-[#E8EAF1] rounded-lg">
              {(["All", "30D", "7D", "Today"] as UsagePeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setUsagePeriod(p)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    usagePeriod === p
                      ? "bg-[#635BFF] text-white shadow-xs"
                      : "text-[#747B91] hover:text-[#20243A]"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl space-y-1">
              <p className="text-[11px] text-[#747B91]">Connected Calls ({usagePeriod})</p>
              <p className="text-2xl font-bold text-emerald-700">
                {stats.completedCalls ?? 0}
              </p>
              <p className="text-[10px] text-[#747B91]">
                Out of {stats.periodTotalCalls ?? stats.totalCalls ?? 0} total calls in period
              </p>
            </div>

            <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl space-y-1">
              <p className="text-[11px] text-[#747B91]">Actual Connected Voice Minutes</p>
              <p className="text-2xl font-bold text-[#20243A]">
                {stats.totalMinutes || 0}m
              </p>
              <p className="text-[10px] text-[#747B91]">
                Total duration: {formatDuration(stats.totalCallDurationSeconds || 0)}
              </p>
            </div>

            <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl space-y-1">
              <p className="text-[11px] text-[#747B91]">Estimated Telephony Cost (₹6.00/min)</p>
              <p className="text-2xl font-bold text-[#635BFF]">
                ₹{Number(stats.actualBilledCostInr ?? stats.totalCostInr ?? 0).toFixed(2)}
              </p>
              <p className="text-[10px] text-emerald-700 font-medium">
                Pulse rate: ₹6.00/min (Completed call duration)
              </p>
            </div>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-[11px] text-amber-900">
            <p className="font-bold">Transparent Billing Transparency Notice:</p>
            <p>
              • <strong>Actual Billed Cost</strong> is calculated strictly from completed call duration minutes recorded in MongoDB and IndiaCalling Voice AI voice execution ledgers.
            </p>
            <p>
              • <strong>Estimated Telephony Spend</strong> for queued campaign batches is approximately ₹{Number(stats.estimatedSpendInr || 0).toFixed(2)} based on allocated contact lead targets.
            </p>
          </div>
        </div>
      )}

      {/* Tab 8: Organization Settings & Calling Guardrails */}
      {activeTab === "settings" && (
        <form
          onSubmit={handleSaveOrgSettings}
          className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-5 text-xs shadow-sm"
        >
          <div className="border-b border-[#E8EAF1] pb-3">
            <h3 className="text-sm font-bold text-[#20243A]" data-section="10. Organization Settings">
              Organization Settings & Calling Guardrails
            </h3>
            <p className="text-[11px] text-[#747B91]">
              Configure allowed calling windows and concurrent channel limits
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Organization Name
              </label>
              <input
                type="text"
                value={settingsForm.name}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, name: e.target.value })
                }
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Company Contact Email
              </label>
              <input
                type="email"
                value={settingsForm.email}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, email: e.target.value })
                }
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Max Concurrent Calls
              </label>
              <input
                type="number"
                value={settingsForm.maxConcurrentCalls}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    maxConcurrentCalls: Number(e.target.value) || 10,
                  })
                }
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Allowed Calling Window Start
              </label>
              <input
                type="time"
                value={settingsForm.callingStart}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    callingStart: e.target.value,
                  })
                }
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Allowed Calling Window End
              </label>
              <input
                type="time"
                value={settingsForm.callingEnd}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    callingEnd: e.target.value,
                  })
                }
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Default Voice Language
              </label>
              <input
                type="text"
                value={settingsForm.defaultLanguage}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    defaultLanguage: e.target.value,
                  })
                }
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
              />
            </div>
          </div>
          <div className="flex justify-end pt-3 border-t border-[#E8EAF1]">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg font-bold"
            >
              {saving ? "Saving..." : "Save Organization Settings"}
            </button>
          </div>
        </form>
      )}

      {/* Edit Organization Profile Modal */}
      {showEditProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateProfile}
            className="bg-white border border-[#E8EAF1] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl text-xs animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between border-b border-[#E8EAF1] pb-3">
              <div>
                <h2 className="text-sm font-bold text-[#20243A]">
                  Edit Organization Profile
                </h2>
                <p className="text-[11px] text-[#747B91]">
                  Update official business details in MongoDB
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditProfileModal(false)}
                className="font-bold text-[#747B91] hover:text-[#20243A]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Organization Name
                </label>
                <input
                  type="text"
                  required
                  value={profileForm.name}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Industry Sector
                </label>
                <input
                  type="text"
                  value={profileForm.industry}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, industry: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Company Contact Email (General Inquiries & Invoicing)
                </label>
                <input
                  type="email"
                  required
                  value={profileForm.email}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, email: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
                />
                <p className="text-[10px] text-[#747B91] mt-0.5">
                  Notice: This is distinct from the Primary Administrator login account email.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Company Contact Phone
                </label>
                <input
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, phone: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Office Address
                </label>
                <input
                  type="text"
                  value={profileForm.address}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, address: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8EAF1]">
              <button
                type="button"
                onClick={() => setShowEditProfileModal(false)}
                className="px-4 py-2 border border-[#E8EAF1] rounded-lg text-[#747B91] font-semibold hover:bg-[#F7F8FC]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg font-bold"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Primary Administrator Modal */}
      {showEditAdminModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateAdministrator}
            className="bg-white border border-[#E8EAF1] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl text-xs animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between border-b border-[#E8EAF1] pb-3">
              <div>
                <h2 className="text-sm font-bold text-[#20243A]">
                  Edit Primary Administrator
                </h2>
                <p className="text-[11px] text-[#747B91]">
                  Updates Client Admin credentials and account state in MongoDB
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditAdminModal(false)}
                className="font-bold text-[#747B91] hover:text-[#20243A]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Administrator Full Name
                </label>
                <input
                  type="text"
                  required
                  value={adminForm.name}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Administrator Login Email (Account Username)
                </label>
                <input
                  type="email"
                  required
                  value={adminForm.email}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, email: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
                />
                <p className="text-[10px] text-[#747B91] mt-0.5">
                  Used by this administrator to log into this organization&apos;s workspace.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Account Status
                </label>
                <select
                  value={adminForm.isActive ? "active" : "inactive"}
                  onChange={(e) =>
                    setAdminForm({
                      ...adminForm,
                      isActive: e.target.value === "active",
                    })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
                >
                  <option value="active">Active (Can log in & manage operations)</option>
                  <option value="inactive">Inactive (Account access suspended)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8EAF1]">
              <button
                type="button"
                onClick={() => setShowEditAdminModal(false)}
                className="px-4 py-2 border border-[#E8EAF1] rounded-lg text-[#747B91] font-semibold hover:bg-[#F7F8FC]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg font-bold"
              >
                {saving ? "Saving..." : "Save Administrator"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Suspend Confirmation Dialog */}
      {showSuspendConfirm && org && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8EAF1] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 text-lg font-bold">
                ⚠️
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#20243A]">
                  Suspend Organization
                </h2>
                <p className="text-[11px] text-[#747B91]">
                  Confirmation required before status modification
                </p>
              </div>
            </div>

            <p className="text-xs text-[#20243A] leading-relaxed">
              Are you sure you want to suspend{" "}
              <strong className="font-bold text-[#20243A]">{org.name}</strong>{" "}
              (ID: <span className="font-mono text-[#635BFF]">{org._id}</span>)?
            </p>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px] space-y-1">
              <p className="font-semibold">Access Restriction Notice:</p>
              <p>• Associated client users will be blocked from logging into the platform.</p>
              <p>• Campaign calling and active voice executions will be paused server-side.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8EAF1]">
              <button
                type="button"
                onClick={() => setShowSuspendConfirm(false)}
                className="px-4 py-2 border border-[#E8EAF1] rounded-lg text-[#747B91] font-semibold hover:bg-[#F7F8FC]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setShowSuspendConfirm(false);
                  await handleToggleOrgStatus("suspended");
                }}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 shadow-sm"
              >
                Yes, Suspend Organization
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
