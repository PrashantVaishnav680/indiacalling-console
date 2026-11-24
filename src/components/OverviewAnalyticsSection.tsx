'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { BarChart3, Clock, CheckCircle2, TrendingUp } from 'lucide-react';

const PIE_COLORS = ['#635BFF', '#13B8A6', '#F59E0B', '#EF4444', '#94A3B8'];

export default function OverviewAnalyticsSection() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<any>(null);

  const fetchAnalytics = useCallback(async (range: '7d' | '30d' | '90d') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/overview?timeRange=${range}`);
      if (res.ok) {
        const json = await res.json();
        setAnalytics(json);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(timeRange);
  }, [timeRange, fetchAnalytics]);

  const kpis = analytics?.kpis || {};
  const totalCalls = Number(kpis.totalCalls || 0);
  const completedCalls = Number(kpis.completedCalls ?? kpis.successfulCalls ?? 0);
  const qualifiedLeads = Number(kpis.qualifiedLeads || 0);
  const qualificationRate = Number(kpis.qualificationRate ?? kpis.conversionRate ?? 0);
  const avgDurationSeconds = Number(kpis.avgDurationSeconds || 0);
  const completionRatio =
    totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;

  const dailyTrend: any[] =
    Array.isArray(analytics?.dailyTrend) && analytics.dailyTrend.length > 0
      ? analytics.dailyTrend
      : Array.isArray(analytics?.activityChart)
      ? analytics.activityChart.map((d: any) => ({
          date: d.day,
          calls: Number(d.calls || 0),
          qualified: 0,
        }))
      : [];

  const hasTrendCalls = dailyTrend.some((d) => Number(d.calls || 0) > 0);

  const outcomeDistribution: any[] =
    Array.isArray(analytics?.outcomeDistribution) && analytics.outcomeDistribution.length > 0
      ? analytics.outcomeDistribution
      : Array.isArray(analytics?.qualificationDistribution)
      ? analytics.qualificationDistribution.filter((o: any) => Number(o.value || 0) > 0)
      : [];

  const agentStats: any[] = Array.isArray(analytics?.agentPerformance)
    ? analytics.agentPerformance
    : [];

  return (
    <section
      id="analytics"
      className="rounded-2xl border border-[#E8EAF1] bg-white p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#EEF0FF] text-[#635BFF] flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#20243A]">
              Call Performance &amp; Conversion Analytics
            </h2>
            <p className="text-xs text-[#747B91]">
              Organization-scoped calling trends, qualification conversion, and agent efficiency.
            </p>
          </div>
        </div>

        <div className="inline-flex items-center rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-1 self-start sm:self-auto">
          {(['7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeRange === r
                  ? 'bg-[#635BFF] text-white shadow-xs'
                  : 'text-[#747B91] hover:text-[#20243A]'
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Compact Analytics KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] p-3.5">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Calls ({timeRange.toUpperCase()})</span>
            <BarChart3 className="w-3.5 h-3.5 text-[#635BFF]" />
          </div>
          <p className="text-xl font-bold text-[#20243A] mt-1">{totalCalls}</p>
          <p className="text-[11px] text-[#747B91] mt-0.5">{completedCalls} completed</p>
        </div>

        <div className="rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] p-3.5">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Qualification Rate</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#13B8A6]" />
          </div>
          <p className="text-xl font-bold text-[#20243A] mt-1">
            {qualificationRate.toFixed(1)}%
          </p>
          <p className="text-[11px] text-[#747B91] mt-0.5">{qualifiedLeads} qualified leads</p>
        </div>

        <div className="rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] p-3.5">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Avg Call Duration</span>
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-[#20243A] mt-1">
            {Math.round(avgDurationSeconds)}s
          </p>
          <p className="text-[11px] text-[#747B91] mt-0.5">Per connected call</p>
        </div>

        <div className="rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] p-3.5">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Completion Ratio</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-[#20243A] mt-1">{completionRatio}%</p>
          <p className="text-[11px] text-[#747B91] mt-0.5">Answered vs dispatched</p>
        </div>
      </div>

      {loading ? (
        <div className="h-56 rounded-xl shimmer-loading" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Call Volume & Conversion Trend */}
          <div className="lg:col-span-2 rounded-xl border border-[#E8EAF1] p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#747B91] mb-3">
              Call Volume &amp; Qualified Trend ({timeRange.toUpperCase()})
            </h3>
            {hasTrendCalls ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyTrend}>
                    <defs>
                      <linearGradient id="overviewCallsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#635BFF" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#635BFF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8EAF1" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#747B91' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#747B91' }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #E8EAF1',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="calls"
                      name="Total Calls"
                      stroke="#635BFF"
                      strokeWidth={2}
                      fill="url(#overviewCallsGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="qualified"
                      name="Qualified"
                      stroke="#13B8A6"
                      strokeWidth={2}
                      fillOpacity={0}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56 flex items-center justify-center text-xs text-[#747B91] bg-[#F7F8FC] rounded-xl">
                No calls recorded in the selected {timeRange.toUpperCase()} window yet.
              </div>
            )}
          </div>

          {/* Outcome Distribution */}
          <div className="rounded-xl border border-[#E8EAF1] p-4 flex flex-col">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#747B91] mb-3">
              Call Outcome Breakdown
            </h3>
            {outcomeDistribution.length > 0 ? (
              <>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={outcomeDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={68}
                        paddingAngle={3}
                      >
                        {outcomeDistribution.map((_, idx) => (
                          <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1.5">
                  {outcomeDistribution.slice(0, 4).map((item, idx) => (
                    <div
                      key={`${item.name || 'outcome'}-${idx}`}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="flex items-center gap-2 text-[#20243A] truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                        />
                        {item.name}
                      </span>
                      <span className="font-semibold text-[#20243A]">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 min-h-[180px] flex items-center justify-center text-xs text-[#747B91] bg-[#F7F8FC] rounded-xl text-center px-4">
                Outcome breakdown appears automatically once your agents complete calls.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agent Performance Strip */}
      {agentStats.length > 0 && (
        <div className="rounded-xl border border-[#E8EAF1] overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-[#747B91] uppercase">
                  AI Agent
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#747B91] uppercase">
                  Calls
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#747B91] uppercase">
                  Qualified
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#747B91] uppercase">
                  Conversion
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAF1]">
              {agentStats.map((a: any, idx: number) => {
                const callsCount = Number(a.totalCalls ?? a.calls ?? 0);
                const qualCount = Number(a.qualifiedLeads ?? a.qualified ?? 0);
                const conv =
                  callsCount > 0 ? Math.round((qualCount / callsCount) * 100) : 0;
                return (
                  <tr
                    key={a.agentId || a._id || a.agentName || a.name || `agent-row-${idx}`}
                    className="hover:bg-[#F7F8FC]"
                  >
                    <td className="px-4 py-2.5 font-semibold text-[#20243A]">
                      {a.agentName || a.name || `AI Agent #${idx + 1}`}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-[#20243A]">
                      {callsCount}
                    </td>
                    <td className="px-4 py-2.5 text-right text-emerald-700 font-semibold">
                      {qualCount}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-[#635BFF]">
                      {conv}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
