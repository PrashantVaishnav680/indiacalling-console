'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Building2,
  Bot,
  PhoneCall,
  IndianRupee,
  ShieldCheck,
  Activity,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

interface OrgRow {
  _id: string;
  name: string;
  industry: string;
  status: string;
  planName?: string;
  walletBalanceInr?: number;
  metrics?: {
    agentCount: number;
    activeAgentCount: number;
  };
  callsDispatched: number;
  callsConnected: number;
  billableMinutes: number;
  ratePerMinuteInr: number;
  subtotalInr: number;
  gstInr: number;
  totalWithGstInr: number;
  outstandingInr: number;
}

interface TrendRow {
  period: string;
  totalDispatches: number;
  durationMinutes: number;
  usageAmountInr: number;
  intensityPercent: number;
}

export default function SuperAdminControlCenterPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [trendMode, setTrendMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const loadPlatformOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/overview');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.error('Failed to load Platform Control Center.');
      }
    } catch {
      toast.error('Network error loading platform overview.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPlatformOverview();
  }, [loadPlatformOverview]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl shimmer-loading" />
          ))}
        </div>
        <div className="h-80 rounded-2xl shimmer-loading" />
        <div className="h-64 rounded-2xl shimmer-loading" />
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const orgs: OrgRow[] = Array.isArray(data?.recentOrganizations)
    ? data.recentOrganizations
    : [];
  const trends: TrendRow[] = data?.telephonyTrends?.[trendMode] || [];

  return (
    <div className="space-y-6">
      {/* Control Center Hero Banner */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold text-[#20243A]">
              Platform Control Center
            </h1>
            <span title="Customer phone numbers, recordings, and transcripts are hidden from Super Admin for privacy." className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700 whitespace-nowrap cursor-help">
              <ShieldCheck className="w-3.5 h-3.5" />
              Zero-PII Active
            </span>
          </div>
          <p className="text-xs text-[#747B91] mt-1">
            Platform overview, GST billing, and live calling activity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadPlatformOverview}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E8EAF1] bg-white hover:bg-[#F7F8FC] text-xs font-semibold text-[#20243A]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <Link
            href="/super-admin/organizations"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm"
          >
            Manage Organizations
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Platform KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#747B91]">
            <span>Total Organizations</span>
            <Building2 className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            {kpis.totalOrganizations || 0}
          </p>
          <p className="text-[11px] text-emerald-700 font-medium mt-1">
            {kpis.activeOrganizations || 0} active · {kpis.suspendedOrganizations || 0} suspended
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#747B91]">
            <span>Active AI Agents</span>
            <Bot className="w-4 h-4 text-[#13B8A6]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            {kpis.activeAgents || 0}{' '}
            <span className="text-xs font-medium text-[#747B91]">
              / {kpis.totalAgents || 0}
            </span>
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">Across all isolated workspaces</p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#747B91]">
            <span>Platform Telephony</span>
            <PhoneCall className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            {kpis.totalPlatformCalls || 0}{' '}
            <span className="text-xs font-medium text-[#747B91]">calls</span>
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            {kpis.totalConnectedCalls || 0} connected · {kpis.totalPlatformMinutes || 0} billable mins
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#747B91]">
            <span>Total Platform Revenue (incl. 18% GST)</span>
            <IndianRupee className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            ₹{Number(kpis.totalGrossRevenueInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            Subtotal ₹{Number(kpis.totalRevenueInr || 0).toLocaleString('en-IN')} + GST ₹{Number(kpis.totalGstInr || 0).toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Multi-Tenant Organizations & GST Billing Table (Ref Image 2) */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white overflow-hidden">
        <div className="p-5 border-b border-[#E8EAF1] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#20243A]">
              Multi-Tenant Organizations &amp; GST Billing Breakdown
            </h2>
            <p className="text-xs text-[#747B91]">
              Aggregated usage, wallet balance, subscription tier, 18% GST, and outstanding dues per tenant.
            </p>
          </div>
          <span className="text-xs font-semibold text-[#635BFF]">
            {orgs.length} organization(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91] uppercase">Organization</th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91] uppercase">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Agents</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Calls (Disp/Conn)</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Billable Mins</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Rate/Min</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Subtotal (₹)</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">GST (18%)</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Outstanding (₹)</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAF1]">
              {orgs.map((org) => (
                <tr key={org._id} className="hover:bg-[#F7F8FC] transition-colors">
                  <td className="px-4 py-3.5">
                    <p className="font-bold text-[#20243A]">{org.name}</p>
                    <p className="text-[11px] text-[#747B91]">
                      {org.industry} · {org.planName || 'Growth Pay-As-You-Go'} · Wallet ₹
                      {Number(org.walletBalanceInr || 0).toLocaleString('en-IN')}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                        org.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {org.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-[#20243A]">
                    {org.metrics?.agentCount ?? 0}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-[#20243A] whitespace-nowrap">
                    {org.callsDispatched} / {org.callsConnected}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-[#20243A]">
                    {org.billableMinutes}m
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-[#635BFF] whitespace-nowrap">
                    ₹{Number(org.ratePerMinuteInr || 6).toFixed(2)}/min
                  </td>
                  <td className="px-4 py-3.5 text-right text-[#20243A] whitespace-nowrap">
                    ₹{Number(org.subtotalInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3.5 text-right text-[#747B91] whitespace-nowrap">
                    ₹{Number(org.gstInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-[#20243A] whitespace-nowrap">
                    ₹{Number(org.outstandingInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <Link
                        href={`/super-admin/organizations/${org._id}`}
                        className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-[#E8EAF1] bg-white hover:border-[#635BFF] text-[#20243A] text-[11px] font-semibold transition-colors"
                      >
                        Inspect
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Telephony Activity Trends (Daily / Weekly / Monthly + Intensity Bar) */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#EEF0FF] text-[#635BFF] flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#20243A]">Telephony Activity Trends</h2>
              <p className="text-xs text-[#747B91]">
                Aggregated platform call dispatches, billed minutes, usage spend, and relative traffic intensity.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-1 self-start sm:self-auto">
            {(['daily', 'weekly', 'monthly'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTrendMode(m)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  trendMode === m
                    ? 'bg-[#635BFF] text-white shadow-xs'
                    : 'text-[#747B91] hover:text-[#20243A]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F7F8FC] border-y border-[#E8EAF1]">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-[#747B91] uppercase">Period</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#747B91] uppercase">Total Dispatches</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#747B91] uppercase">Duration (Mins)</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#747B91] uppercase">Usage Amount (₹)</th>
                <th className="px-4 py-2.5 text-left font-semibold text-[#747B91] uppercase min-w-[180px]">Intensity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAF1]">
              {trends.map((row) => (
                <tr key={row.period} className="hover:bg-[#F7F8FC]">
                  <td className="px-4 py-3 font-semibold text-[#20243A] whitespace-nowrap">
                    {row.period}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[#20243A]">
                    {row.totalDispatches}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[#20243A]">
                    {row.durationMinutes} min
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-[#20243A] whitespace-nowrap">
                    ₹{Number(row.usageAmountInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-2.5 rounded-full bg-[#EEF0FF] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#635BFF] transition-all duration-300"
                          style={{ width: `${row.intensityPercent}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-[#747B91] w-9 text-right">
                        {row.intensityPercent}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
