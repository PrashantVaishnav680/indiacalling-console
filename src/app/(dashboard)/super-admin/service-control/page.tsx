'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Power,
  Database,
  Radio,
  Lock,
  Eye,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Sliders,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

export default function SuperAdminServiceControlPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [togglingKillSwitch, setTogglingKillSwitch] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [health, setHealth] = useState<{
    dbConnected: boolean;
    voiceEngineConnected: boolean;
  }>({ dbConnected: true, voiceEngineConnected: true });

  // Inline Service Control Inspector (stays inside /super-admin/service-control)
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  const [quotaForm, setQuotaForm] = useState({
    maxAgents: 25,
    maxConcurrentCalls: 10,
    monthlyCallLimit: 10000,
  });
  const [savingOrgControl, setSavingOrgControl] = useState(false);
  const [openingWorkspace, setOpeningWorkspace] = useState(false);

  const loadControlData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, orgsRes, overviewRes] = await Promise.all([
        fetch('/api/super-admin/settings'),
        fetch('/api/super-admin/organizations'),
        fetch('/api/super-admin/overview'),
      ]);

      if (settingsRes.ok) {
        const sJson = await settingsRes.json();
        setSettings(sJson.settings || null);
      }
      if (orgsRes.ok) {
        const oJson = await orgsRes.json();
        const list = oJson.organizations || [];
        setOrgs(list);
        setSelectedOrg((prev: any) =>
          prev ? list.find((o: any) => o._id === prev._id) || null : null
        );
      }
      if (overviewRes.ok) {
        const ovJson = await overviewRes.json();
        setHealth({
          dbConnected: ovJson?.infrastructure?.mongodb !== 'disconnected',
          voiceEngineConnected: ovJson?.infrastructure?.bolnaApi !== 'mock',
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadControlData();
  }, [loadControlData]);

  const openInspector = (org: any) => {
    setSelectedOrg(org);
    setQuotaForm({
      maxAgents: org.limits?.maxAgents ?? 25,
      maxConcurrentCalls: org.limits?.maxConcurrentCalls ?? 10,
      monthlyCallLimit: org.limits?.monthlyCallLimit ?? 10000,
    });
  };

  const handleToggleGlobalKillSwitch = async () => {
    if (!settings) return;
    setTogglingKillSwitch(true);
    const nextMaintenance = !Boolean(settings.maintenanceMode);
    try {
      const res = await fetch('/api/super-admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          maintenanceMode: nextMaintenance,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings || { ...settings, maintenanceMode: nextMaintenance });
        toast.success(
          nextMaintenance
            ? 'Global Emergency Calling Kill-Switch ACTIVATED. Outbound dispatches are paused platform-wide.'
            : 'Global Calling Resumed. All active organizations can dispatch calls normally.'
        );
      } else {
        toast.error('Failed to update global calling guardrail.');
      }
    } finally {
      setTogglingKillSwitch(false);
    }
  };

  const handleToggleOrgStatus = async (org: any) => {
    const nextStatus = org.status === 'active' ? 'suspended' : 'active';
    setSavingOrgControl(true);
    try {
      const res = await fetch(`/api/super-admin/organizations/${org._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        toast.success(
          nextStatus === 'suspended'
            ? `Outbound calling paused for ${org.name}.`
            : `Outbound calling resumed for ${org.name}.`
        );
        await loadControlData();
      } else {
        toast.error('Could not update organization service status.');
      }
    } finally {
      setSavingOrgControl(false);
    }
  };

  const handleSaveOrgQuotas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setSavingOrgControl(true);
    try {
      const res = await fetch(`/api/super-admin/organizations/${selectedOrg._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotaForm),
      });
      if (res.ok) {
        toast.success(`Updated service quotas for ${selectedOrg.name}.`);
        await loadControlData();
      } else {
        toast.error('Could not save service quotas.');
      }
    } finally {
      setSavingOrgControl(false);
    }
  };

  const handleDirectWorkspaceAccess = async (org: any) => {
    setOpeningWorkspace(true);
    try {
      const res = await fetch('/api/super-admin/impersonate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: org._id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not open organization workspace.');
        setOpeningWorkspace(false);
        return;
      }
      toast.success(`Opening ${org.name} workspace...`);
      window.location.assign(data.redirectTo || '/overview');
    } catch {
      toast.error('Unable to reach server while opening organization workspace.');
      setOpeningWorkspace(false);
    }
  };

  const maintenanceOn = Boolean(settings?.maintenanceMode);
  const activeOrgsCount = orgs.filter((o) => o.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#20243A]">
            Platform Service Control &amp; Global Guardrails
          </h1>
          <p className="text-xs text-[#747B91] mt-1">
            Global kill-switch, system health, and per-organization calling quotas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="w-3.5 h-3.5" />
            Zero-PII Active
          </span>
          <button
            type="button"
            onClick={loadControlData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E8EAF1] bg-white hover:bg-[#F7F8FC] text-xs font-semibold text-[#20243A]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Global Emergency Calling Kill-Switch */}
      <div
        className={`rounded-2xl border p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          maintenanceOn ? 'border-red-300 bg-red-50/70' : 'border-[#E8EAF1] bg-white'
        }`}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              maintenanceOn ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {maintenanceOn ? <AlertTriangle className="w-5 h-5" /> : <Power className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-[#20243A]">
                Global Emergency Calling Kill-Switch
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  maintenanceOn
                    ? 'bg-red-100 text-red-700 border-red-300'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {maintenanceOn ? 'PAUSED (Maintenance Active)' : 'OPERATIONAL (Normal Dispatch)'}
              </span>
            </div>
            <p className="text-xs text-[#747B91] mt-1 max-w-2xl">
              Pause or resume outbound calling across all {orgs.length} organization(s) during maintenance.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={loading || togglingKillSwitch}
          onClick={handleToggleGlobalKillSwitch}
          className={`shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 ${
            maintenanceOn
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              : 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
          }`}
        >
          <Power className="w-4 h-4" />
          {togglingKillSwitch
            ? 'Applying...'
            : maintenanceOn
            ? 'Resume Platform Calling'
            : 'Activate Emergency Kill-Switch'}
        </button>
      </div>

      {/* Live Platform Guardrails & Health Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Database Cluster</span>
            <Database className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-sm font-bold text-emerald-700 mt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            {health.dbConnected ? 'Connected & Healthy' : 'Reconnecting'}
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            Multi-tenant document isolation active
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>IndiaCalling Voice AI Engine</span>
            <Radio className="w-4 h-4 text-[#13B8A6]" />
          </div>
          <p className="text-sm font-bold text-emerald-700 mt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            {health.voiceEngineConnected ? 'Live Engine Connected' : 'Simulation Mode'}
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            Voice, STT &amp; telephony sync ready
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Zero-PII Isolation Guard</span>
            <Lock className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-sm font-bold text-emerald-700 mt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Enforced on All Routes
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            {activeOrgsCount} / {orgs.length} organization(s) active
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Direct Admin Access</span>
            <Sliders className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-sm font-bold text-[#20243A] mt-2">
            {orgs.length} Workspace(s) Ready
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            Full audit trail on every session
          </p>
        </div>
      </div>

      {/* Inline Service Control Inspector (keeps user on /super-admin/service-control) */}
      {selectedOrg && (
        <div className="rounded-2xl border-2 border-[#635BFF]/30 bg-white p-5 sm:p-6 space-y-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#E8EAF1]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#EEF0FF] text-[#635BFF] text-[10px] font-bold uppercase">
                  Service Control Inspector
                </span>
                <h2 className="text-base font-bold text-[#20243A]">{selectedOrg.name}</h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                    selectedOrg.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}
                >
                  {selectedOrg.status}
                </span>
              </div>
              <p className="text-xs text-[#747B91] mt-1">
                {selectedOrg.industry} · {selectedOrg.metrics?.agentCount || 0} agent(s) · {selectedOrg.metrics?.totalCalls || 0} calls dispatched
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={openingWorkspace}
                onClick={() => handleDirectWorkspaceAccess(selectedOrg)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {openingWorkspace ? 'Opening...' : 'Open Workspace (Direct Access)'}
              </button>
              <button
                type="button"
                disabled={savingOrgControl}
                onClick={() => handleToggleOrgStatus(selectedOrg)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  selectedOrg.status === 'active'
                    ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                {selectedOrg.status === 'active' ? (
                  <>
                    <PauseCircle className="w-3.5 h-3.5" />
                    Pause Outbound Calling
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-3.5 h-3.5" />
                    Resume Outbound Calling
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSelectedOrg(null)}
                className="p-2 rounded-xl border border-[#E8EAF1] text-[#747B91] hover:text-[#20243A] hover:bg-[#F7F8FC]"
                aria-label="Close inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSaveOrgQuotas} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-[#20243A] mb-1">
                Max AI Agents
              </label>
              <input
                type="number"
                min={1}
                value={quotaForm.maxAgents}
                onChange={(e) => setQuotaForm({ ...quotaForm, maxAgents: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#20243A] mb-1">
                Max Concurrent Calls
              </label>
              <input
                type="number"
                min={1}
                value={quotaForm.maxConcurrentCalls}
                onChange={(e) =>
                  setQuotaForm({ ...quotaForm, maxConcurrentCalls: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#20243A] mb-1">
                Monthly Call Limit
              </label>
              <input
                type="number"
                min={100}
                step={100}
                value={quotaForm.monthlyCallLimit}
                onChange={(e) =>
                  setQuotaForm({ ...quotaForm, monthlyCallLimit: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savingOrgControl}
                className="flex-1 py-2 rounded-xl bg-[#20243A] hover:bg-[#313654] text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {savingOrgControl ? 'Saving...' : 'Save Quotas'}
              </button>
              <Link
                href={`/super-admin/organizations/${selectedOrg._id}`}
                className="px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#635BFF] hover:bg-[#F7F8FC] whitespace-nowrap"
              >
                Full Profile →
              </Link>
            </div>
          </form>
        </div>
      )}

      {/* Organization Service Controls List */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8EAF1] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#20243A]">
              Organization Service Controls
            </h2>
            <p className="text-[11px] text-[#747B91] mt-0.5">
              Inspect any organization right here to pause/resume calling, adjust quotas, or open its workspace directly.
            </p>
          </div>
          <Link
            href="/super-admin/organizations"
            className="text-xs font-semibold text-[#635BFF] hover:underline"
          >
            View All Organizations →
          </Link>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 rounded-xl shimmer-loading" />
            ))}
          </div>
        ) : orgs.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#747B91]">
            No organizations provisioned yet.
          </div>
        ) : (
          <div className="divide-y divide-[#E8EAF1]">
            {orgs.map((org) => {
              const isSelected = selectedOrg?._id === org._id;
              return (
                <div
                  key={org._id}
                  className={`px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                    isSelected ? 'bg-[#EEF0FF]/40' : 'hover:bg-[#F7F8FC]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-[#20243A]">{org.name}</p>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                          org.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                      >
                        {org.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#747B91] mt-0.5">
                      {org.industry} · {org.metrics?.agentCount || 0} agent(s) · {org.metrics?.totalCalls || 0} calls · Limit: {org.limits?.maxConcurrentCalls ?? 10} concurrent
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openInspector(org)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      isSelected
                        ? 'bg-[#635BFF] text-white'
                        : 'bg-[#EEF0FF] hover:bg-[#635BFF] text-[#635BFF] hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {isSelected ? 'Inspecting' : 'Inspect & Manage'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
