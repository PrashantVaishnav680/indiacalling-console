"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function OrganizationsManagementPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [platformMetrics, setPlatformMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any | null>(null);
  const [confirmSuspendOrg, setConfirmSuspendOrg] = useState<any | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [userRole, setUserRole] = useState<string>("super_admin");

  const [createForm, setCreateForm] = useState({
    businessName: "",
    industry: "Real Estate",
    contactEmail: "",
    contactPhone: "+91 ",
    address: "",
    ownerName: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });

  const loadOrganizations = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/organizations");
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
        setPlatformMetrics(data.platformMetrics || null);
      }
    } catch {
      // Ignore error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrganizations();
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.role) setUserRole(d.user.role);
      })
      .catch(() => {});
  }, []);

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const res = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setBanner({
        type: "error",
        text: data.details || data.error || "Failed to create organization",
      });
      return;
    }
    setBanner({
      type: "success",
      text: `Created organization "${data.organization.name}" and provisioned CLIENT_ADMIN (${data.initialClientAdmin.email}).`,
    });
    setShowCreateModal(false);
    setCreateForm({
      businessName: "",
      industry: "Real Estate",
      contactEmail: "",
      contactPhone: "+91 ",
      address: "",
      ownerName: "",
      adminName: "",
      adminEmail: "",
      adminPassword: "",
    });
    await loadOrganizations();
  };

  const handleUpdateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg) return;
    setBanner(null);
    const res = await fetch(`/api/organizations/${editingOrg._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editingOrg.name,
        email: editingOrg.email,
        phone: editingOrg.phone,
        industry: editingOrg.industry,
        address: editingOrg.address,
        ownerName: editingOrg.ownerName || editingOrg.adminName,
        ownerEmail: editingOrg.ownerEmail || editingOrg.adminEmail,
        status: editingOrg.status,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBanner({
        type: "error",
        text: data.details || data.error || "Failed to update organization",
      });
      return;
    }
    setBanner({
      type: "success",
      text: `Updated organization "${editingOrg.name}".`,
    });
    setEditingOrg(null);
    await loadOrganizations();
  };

  const handleToggleStatus = async (org: any, forcedStatus?: "active" | "suspended") => {
    const nextStatus = forcedStatus || (org.status === "active" ? "suspended" : "active");
    setBanner(null);
    setStatusUpdatingId(org._id);

    // Immediate optimistic update for table and platform summary metrics without requiring refresh
    setOrganizations((prev) =>
      prev.map((o) => (o._id === org._id ? { ...o, status: nextStatus } : o))
    );
    setPlatformMetrics((prev: any) => {
      if (!prev) return prev;
      const wasActive = org.status === "active";
      return {
        ...prev,
        activeOrganizations: Math.max(
          0,
          prev.activeOrganizations + (nextStatus === "active" ? 1 : wasActive ? -1 : 0)
        ),
        suspendedOrganizations: Math.max(
          0,
          prev.suspendedOrganizations + (nextStatus === "suspended" ? 1 : !wasActive ? -1 : 0)
        ),
      };
    });

    try {
      const res = await fetch(`/api/organizations/${org._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setBanner({
          type: "success",
          text: `Organization "${org.name}" is now ${nextStatus.toUpperCase()}.`,
        });
        await loadOrganizations();
      } else {
        const err = await res.json();
        setBanner({
          type: "error",
          text: err.details || err.error || "Failed to update organization status",
        });
        await loadOrganizations();
      }
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Failed to update organization status",
      });
      await loadOrganizations();
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const filtered = organizations.filter((o) => {
    const orgStatus =
      o.status === "inactive" ? "suspended" : (o.status || "active").toLowerCase();
    const matchesStatus =
      statusFilter === "all" || orgStatus === statusFilter.toLowerCase();

    const q = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (o.name || "").toLowerCase().includes(q) ||
      String(o._id || "").toLowerCase().includes(q) ||
      (o.slug || "").toLowerCase().includes(q) ||
      (o.email || "").toLowerCase().includes(q) ||
      (o.adminName || "").toLowerCase().includes(q) ||
      (o.adminEmail || "").toLowerCase().includes(q) ||
      (o.ownerName || "").toLowerCase().includes(q) ||
      (o.ownerEmail || "").toLowerCase().includes(q);

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#20243A]">
            {userRole === "super_admin"
              ? "Organizations Management"
              : "Organization Management"}
          </h1>
          <p className="text-sm text-[#747B91] mt-0.5">
            {userRole === "super_admin"
              ? "SUPER_ADMIN control plane for onboarding, inspecting, activating, and suspending client organizations."
              : "Manage your business profile, calling configuration, and connected voice operations."}
          </p>
        </div>
        {userRole === "super_admin" && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg text-xs font-bold shadow-sm"
          >
            + Create Organization
          </button>
        )}
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
            className="font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Platform Summary Metrics */}
      {platformMetrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-center">
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
            <p className="text-[11px] text-[#747B91]">Total Orgs</p>
            <p className="text-xl font-bold text-[#20243A] mt-1">
              {platformMetrics.totalOrganizations}
            </p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
            <p className="text-[11px] text-emerald-700">Active</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">
              {platformMetrics.activeOrganizations}
            </p>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5">
            <p className="text-[11px] text-rose-700">Suspended</p>
            <p className="text-xl font-bold text-rose-700 mt-1">
              {platformMetrics.suspendedOrganizations}
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
            <p className="text-[11px] text-amber-800">Pending</p>
            <p className="text-xl font-bold text-amber-800 mt-1">
              {platformMetrics.pendingOrganizations}
            </p>
          </div>
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
            <p className="text-[11px] text-[#747B91]">Total Users</p>
            <p className="text-xl font-bold text-[#635BFF] mt-1">
              {platformMetrics.totalUsers}
            </p>
          </div>
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
            <p className="text-[11px] text-[#747B91]">Total Agents</p>
            <p className="text-xl font-bold text-[#20243A] mt-1">
              {platformMetrics.totalAgents}
            </p>
          </div>
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
            <p className="text-[11px] text-[#747B91]">Total Campaigns</p>
            <p className="text-xl font-bold text-[#20243A] mt-1">
              {platformMetrics.totalCampaigns}
            </p>
          </div>
          <div className="bg-white border border-[#E8EAF1] rounded-xl p-3.5">
            <p className="text-[11px] text-[#747B91]">Total Calls</p>
            <p className="text-xl font-bold text-[#20243A] mt-1">
              {platformMetrics.totalCalls}
            </p>
          </div>
        </div>
      )}

      {/* Search & Status Filters */}
      <div className="bg-white border border-[#E8EAF1] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          {["all", "active", "suspended", "pending"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-semibold capitalize ${
                statusFilter === st
                  ? "bg-[#635BFF] text-white"
                  : "bg-[#F7F8FC] text-[#747B91] hover:text-[#20243A]"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search organization name, ID, admin, or email..."
          className="w-full sm:w-80 px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
        />
      </div>

      {/* Required 11-Column Organization Table */}
      <div className="bg-white border border-[#E8EAF1] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                  Organization Name
                </th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                  Organization ID
                </th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                  Admin (CLIENT_ADMIN)
                </th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                  Email
                </th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                  Status
                </th>
                <th className="px-4 py-3 text-center font-semibold text-[#747B91]">
                  Total Users
                </th>
                <th className="px-4 py-3 text-center font-semibold text-[#747B91]">
                  Total Agents
                </th>
                <th className="px-4 py-3 text-center font-semibold text-[#747B91]">
                  Total Campaigns
                </th>
                <th className="px-4 py-3 text-center font-semibold text-[#747B91]">
                  Total Calls
                </th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91]">
                  Created Date
                </th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAF1]">
              {loading ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-12 text-center text-[#747B91]"
                  >
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <LoadingSpinner size="md" color="text-[#635BFF]" />
                      <span className="text-xs font-semibold text-[#20243A] animate-pulse">
                        Loading organizations...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-8 text-center text-[#747B91]"
                  >
                    No organizations match your filter.
                  </td>
                </tr>
              ) : (
                filtered.map((org) => (
                  <tr
                    key={org._id}
                    onClick={() => router.push(`/organizations/${org._id}`)}
                    className="hover:bg-[#F7F8FC] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#20243A]">{org.name}</p>
                      <p className="text-[11px] text-[#747B91]">
                        {org.industry || "General Business"}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#635BFF]">
                      {org._id}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#20243A]">
                      {org.adminName || "Client Admin"}
                    </td>
                    <td className="px-4 py-3 text-[#747B91]">
                      {org.adminEmail || org.email}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                          org.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : org.status === "suspended"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {org.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-[#20243A]">
                      {org.totalUsers ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-[#20243A]">
                      {org.totalAgents ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-[#20243A]">
                      {org.totalCampaigns ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-[#635BFF]">
                      {org.totalCalls ?? 0}
                    </td>
                    <td className="px-4 py-3 text-[#747B91] whitespace-nowrap">
                      {formatDate(org.createdAt)}
                    </td>
                    <td
                      className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        href={`/organizations/${org._id}`}
                        className="px-2.5 py-1 bg-[#EEF0FF] text-[#635BFF] rounded font-semibold hover:bg-[#635BFF] hover:text-white"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => setEditingOrg({ ...org })}
                        className="px-2.5 py-1 bg-[#F7F8FC] border border-[#E8EAF1] text-[#20243A] rounded font-semibold hover:border-[#635BFF]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={statusUpdatingId === org._id}
                        onClick={() => {
                          if (org.status === "active") {
                            setConfirmSuspendOrg(org);
                          } else {
                            handleToggleStatus(org, "active");
                          }
                        }}
                        className={`px-2.5 py-1 rounded font-semibold border transition-all ${
                          org.status === "active"
                            ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                        } ${
                          statusUpdatingId === org._id
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        {statusUpdatingId === org._id
                          ? "..."
                          : org.status === "active"
                          ? "Suspend"
                          : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateOrganization}
            className="bg-white border border-[#E8EAF1] rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl text-xs max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#E8EAF1] pb-3">
              <div>
                <h2 className="text-base font-bold text-[#20243A]">
                  Create New Organization & Provision CLIENT_ADMIN
                </h2>
                <p className="text-[#747B91]">
                  Creates an isolated tenant workspace in MongoDB and sets up its primary CLIENT_ADMIN account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="font-bold text-sm text-[#747B91]"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Organization Name *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.businessName}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      businessName: e.target.value,
                    })
                  }
                  placeholder="e.g. Skyline Realty Pvt Ltd"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Industry *
                </label>
                <select
                  value={createForm.industry}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, industry: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                >
                  <option value="Real Estate">Real Estate</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Education">Education</option>
                  <option value="Banking & Finance">Banking & Finance</option>
                  <option value="Insurance">Insurance</option>
                  <option value="E-commerce">E-commerce</option>
                  <option value="Hospitality">Hospitality</option>
                  <option value="Automotive">Automotive</option>
                  <option value="IT & Software">IT & Software</option>
                  <option value="Telecommunications">Telecommunications</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Contact Email *
                </label>
                <input
                  type="email"
                  required
                  value={createForm.contactEmail}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      contactEmail: e.target.value,
                    })
                  }
                  placeholder="contact@company.com"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={createForm.contactPhone}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      contactPhone: e.target.value,
                    })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#20243A] mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={createForm.address}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, address: e.target.value })
                  }
                  placeholder="City, State, India"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8EAF1] grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  CLIENT Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.adminName}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, adminName: e.target.value })
                  }
                  placeholder="e.g. Vikram Mehta"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  CLIENT Login Email *
                </label>
                <input
                  type="email"
                  required
                  value={createForm.adminEmail}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, adminEmail: e.target.value })
                  }
                  placeholder="admin@company.com"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  value={createForm.adminPassword}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      adminPassword: e.target.value,
                    })
                  }
                  placeholder="Min 6 characters"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E8EAF1]">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-[#E8EAF1] rounded-lg font-semibold text-[#747B91]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg font-bold"
              >
                Create Organization
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Organization Modal */}
      {editingOrg && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateOrganization}
            className="bg-white border border-[#E8EAF1] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#E8EAF1] pb-3">
              <h2 className="text-base font-bold text-[#20243A]">
                Edit Organization: {editingOrg.name}
              </h2>
              <button
                type="button"
                onClick={() => setEditingOrg(null)}
                className="font-bold text-sm text-[#747B91]"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Organization Name
                </label>
                <input
                  type="text"
                  required
                  value={editingOrg.name || ""}
                  onChange={(e) =>
                    setEditingOrg({ ...editingOrg, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Status
                </label>
                <select
                  value={editingOrg.status || "active"}
                  onChange={(e) =>
                    setEditingOrg({ ...editingOrg, status: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={editingOrg.email || ""}
                  onChange={(e) =>
                    setEditingOrg({ ...editingOrg, email: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={editingOrg.phone || ""}
                  onChange={(e) =>
                    setEditingOrg({ ...editingOrg, phone: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#20243A] mb-1">
                  Industry
                </label>
                <input
                  type="text"
                  value={editingOrg.industry || ""}
                  onChange={(e) =>
                    setEditingOrg({ ...editingOrg, industry: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E8EAF1]">
              <button
                type="button"
                onClick={() => setEditingOrg(null)}
                className="px-4 py-2 border border-[#E8EAF1] rounded-lg font-semibold text-[#747B91]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#635BFF] text-white rounded-lg font-bold"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Suspend Confirmation Dialog */}
      {confirmSuspendOrg && (
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
              <strong className="font-bold text-[#20243A]">
                {confirmSuspendOrg.name}
              </strong>{" "}
              (ID:{" "}
              <span className="font-mono text-[#635BFF]">
                {confirmSuspendOrg._id}
              </span>
              )?
            </p>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px] space-y-1">
              <p className="font-semibold">Access Restriction Notice:</p>
              <p>• Client users belonging to this organization will be blocked from platform access.</p>
              <p>• Outbound voice calling and campaign dispatches will be immediately paused.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8EAF1]">
              <button
                type="button"
                onClick={() => setConfirmSuspendOrg(null)}
                className="px-4 py-2 border border-[#E8EAF1] rounded-lg text-[#747B91] font-semibold hover:bg-[#F7F8FC]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmSuspendOrg;
                  setConfirmSuspendOrg(null);
                  await handleToggleStatus(target, "suspended");
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
