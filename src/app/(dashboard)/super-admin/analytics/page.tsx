'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { BarChart3, ShieldCheck, PhoneCall, Clock, IndianRupee, RefreshCw } from 'lucide-react';

export default function SuperAdminUsageAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [trendMode, setTrendMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/overview');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const kpis = data?.kpis || {};
  const orgs: any[] = Array.isArray(data?.recentOrganizations) ? data.recentOrganizations : [];
  const trends: any[] = data?.telephonyTrends?.[trendMode] || [];

  const orgChartData = orgs.map((o) => ({
    name: o.name.length > 16 ? `${o.name.slice(0, 16)}…` : o.name,
    minutes: Number(o.billableMinutes || 0),
    spend: Number(o.subtotalInr || 0),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#20243A]">Usage Analytics</h1>
          <p className="text-xs text-[#747B91] mt-0.5">
            Call volume, minutes, and revenue across organizations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700"
            title="Only aggregated call totals are shown. Customer PII is hidden."
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Zero-PII Active
          </span>
          <button
            type="button"
            onClick={loadAnalytics}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E8EAF1] bg-white text-xs font-semibold text-[#20243A] hover:bg-[#F7F8FC]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Top Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Total Calls Dispatched</span>
            <PhoneCall className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-1">{kpis.totalPlatformCalls || 0}</p>
          <p className="text-[11px] text-[#747B91]">{kpis.totalConnectedCalls || 0} connected</p>
        </div>
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Total Billable Minutes</span>
            <Clock className="w-4 h-4 text-[#13B8A6]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-1">{kpis.totalPlatformMinutes || 0}m</p>
          <p className="text-[11px] text-[#747B91]">Across {orgs.length} organization(s)</p>
        </div>
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Usage Subtotal</span>
            <IndianRupee className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-1">
            ₹{Number(kpis.totalRevenueInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#747B91]">Before 18% GST</p>
        </div>
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Total Incl. 18% GST</span>
            <BarChart3 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-1">
            ₹{Number(kpis.totalGrossRevenueInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#747B91]">GST: ₹{Number(kpis.totalGstInr || 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Charts Row */}
      {loading ? (
        <div className="h-64 rounded-2xl shimmer-loading" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Call Volume & Usage Spend Over Time */}
          <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#20243A]">Calls &amp; Spend Trend</h2>
              <div className="inline-flex rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-1">
                {(['daily', 'weekly', 'monthly'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTrendMode(m)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize ${
                      trendMode === m ? 'bg-[#635BFF] text-white' : 'text-[#747B91]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends}>
                  <defs>
                    <linearGradient id="saUsageGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#635BFF" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#635BFF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EAF1" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#747B91' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#747B91' }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="totalDispatches"
                    name="Calls"
                    stroke="#635BFF"
                    strokeWidth={2}
                    fill="url(#saUsageGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="durationMinutes"
                    name="Billable Mins"
                    stroke="#13B8A6"
                    strokeWidth={2}
                    fillOpacity={0}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Per-Organization Comparison BarChart */}
          <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-3">
            <h2 className="text-sm font-bold text-[#20243A]">
              Minutes &amp; Spend by Organization
            </h2>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orgChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EAF1" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#747B91' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#747B91' }} />
                  <Tooltip />
                  <Bar dataKey="minutes" name="Billable Mins" fill="#635BFF" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="spend" name="Subtotal (₹)" fill="#13B8A6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Per-Organization Breakdown Table */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-[#747B91] uppercase">Organization</th>
              <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Calls</th>
              <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Connect Rate</th>
              <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Minutes</th>
              <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Subtotal</th>
              <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">GST (18%)</th>
              <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8EAF1]">
            {orgs.map((org) => {
              const ratePct =
                org.callsDispatched > 0
                  ? Math.round((org.callsConnected / org.callsDispatched) * 100)
                  : 0;
              return (
                <tr key={org._id} className="hover:bg-[#F7F8FC]">
                  <td className="px-4 py-3 font-bold text-[#20243A]">{org.name}</td>
                  <td className="px-4 py-3 text-right font-mono">{org.callsDispatched}</td>
                  <td className="px-4 py-3 text-right text-emerald-700 font-semibold">{ratePct}%</td>
                  <td className="px-4 py-3 text-right font-semibold">{org.billableMinutes}m</td>
                  <td className="px-4 py-3 text-right">₹{Number(org.subtotalInr || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-[#747B91]">₹{Number(org.gstInr || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/super-admin/organizations/${org._id}`}
                      className="text-[#635BFF] font-semibold hover:underline"
                    >
                      Inspect →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
