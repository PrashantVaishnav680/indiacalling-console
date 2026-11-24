'use client';

import { useEffect, useState } from 'react';
import { Activity, ShieldCheck, CheckCircle2, Server } from 'lucide-react';

export default function SuperAdminActivityPage() {
  const [data, setData] = useState<any>(null);
  const [mode, setMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  useEffect(() => {
    fetch('/api/super-admin/overview')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setData(json))
      .catch(() => {});
  }, []);

  const rows: any[] = data?.telephonyTrends?.[mode] || [];
  const health = data?.platformHealth || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#20243A]">Activity Monitoring</h1>
          <p className="text-xs text-[#747B91] mt-0.5">
            Real-time infrastructure telemetry and aggregated telephony volume (Zero-PII enforced).
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
          <ShieldCheck className="w-3.5 h-3.5" />
          Zero-PII Active
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 flex items-center gap-3">
          <Server className="w-5 h-5 text-[#635BFF]" />
          <div>
            <p className="text-xs text-[#747B91]">MongoDB Atlas Cluster</p>
            <p className="text-sm font-bold text-emerald-700">
              {health.databaseConnected ? 'Connected' : 'Checking...'}
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 flex items-center gap-3">
          <Activity className="w-5 h-5 text-[#13B8A6]" />
          <div>
            <p className="text-xs text-[#747B91]">IndiaCalling Voice AI Voice API v2</p>
            <p className="text-sm font-bold text-[#20243A]">
              {health.bolnaConfigured ? 'Live Configured' : 'API Key Required'}
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="text-xs text-[#747B91]">Tenant Isolation Guard</p>
            <p className="text-sm font-bold text-emerald-700">Enforced on All Routes</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[#20243A]">Telephony Dispatch Intensity</h2>
          <div className="inline-flex rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-1">
            {(['daily', 'weekly', 'monthly'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize ${
                  mode === m ? 'bg-[#635BFF] text-white' : 'text-[#747B91]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.period} className="flex items-center gap-4 text-xs">
              <span className="w-28 font-semibold text-[#20243A]">{r.period}</span>
              <div className="flex-1 h-3 rounded-full bg-[#EEF0FF] overflow-hidden">
                <div
                  className="h-full bg-[#635BFF] rounded-full"
                  style={{ width: `${r.intensityPercent}%` }}
                />
              </div>
              <span className="w-24 text-right font-mono text-[#747B91]">
                {r.totalDispatches} calls
              </span>
              <span className="w-24 text-right font-bold text-[#20243A]">
                ₹{Number(r.usageAmountInr || 0).toLocaleString('en-IN')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
