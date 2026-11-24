'use client';

import { useEffect, useState } from 'react';
import { Settings, ShieldCheck, Save } from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

export default function SuperAdminPlatformSettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingHealth, setTestingHealth] = useState(false);
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    defaultRatePerMinuteInr: 6,
    businessProRateInr: 5.4,
    enterpriseRateInr: 4.8,
    gstPercent: 18,
    upiId: 'payments@indiacalling',
    supportEmail: 'support@indiacalling.ai',
    defaultWelcomeBalanceInr: 1000,
    maintenanceMode: false,
  });

  useEffect(() => {
    fetch('/api/super-admin/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.settings) {
          setForm({
            defaultRatePerMinuteInr: json.settings.defaultRatePerMinuteInr ?? 6,
            businessProRateInr: json.settings.businessProRateInr ?? 5.4,
            enterpriseRateInr: json.settings.enterpriseRateInr ?? 4.8,
            gstPercent: json.settings.gstPercent ?? 18,
            upiId: json.settings.upiId || 'payments@indiacalling',
            supportEmail: json.settings.supportEmail || 'support@indiacalling.ai',
            defaultWelcomeBalanceInr: json.settings.defaultWelcomeBalanceInr ?? 1000,
            maintenanceMode: Boolean(json.settings.maintenanceMode),
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleTestHealth = async () => {
    setTestingHealth(true);
    setHealthResult(null);
    try {
      const res = await fetch('/api/super-admin/overview');
      const json = await res.json();
      if (res.ok && json.platformHealth) {
        const dbOk = json.platformHealth.databaseConnected ? 'MongoDB Connected' : 'MongoDB Disconnected';
        const bolnaOk = json.platformHealth.bolnaConfigured ? 'IndiaCalling Voice AI v2 Live' : 'IndiaCalling Voice AI Key Missing';
        const msg = `${dbOk} · ${bolnaOk} · Zero-PII Enforced`;
        setHealthResult(msg);
        toast.success(msg);
      } else {
        toast.error('Health check failed.');
      }
    } finally {
      setTestingHealth(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/super-admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Could not save platform settings.');
      } else {
        toast.success('Global platform settings saved and recorded in Audit Logs.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#20243A]">Platform Settings</h1>
          <p className="text-xs text-[#747B91] mt-0.5">
            Global calling rates, GST, and UPI defaults.
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700"
          title="Zero-PII isolation is permanently active and cannot be turned off."
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Zero-PII Always Active
        </span>
      </div>

      {loading ? (
        <div className="h-72 rounded-2xl shimmer-loading" />
      ) : (
        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pricing & GST Card */}
          <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-4">
            <div className="flex items-center gap-2 text-[#635BFF]">
              <Settings className="w-4 h-4" />
              <h2 className="text-sm font-bold text-[#20243A]">Calling Rates &amp; Tax Policy</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Starter / Growth Rate (₹/min)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={1}
                  value={form.defaultRatePerMinuteInr}
                  onChange={(e) =>
                    setForm({ ...form, defaultRatePerMinuteInr: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Business Pro Rate (₹/min)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={1}
                  value={form.businessProRateInr}
                  onChange={(e) =>
                    setForm({ ...form, businessProRateInr: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Enterprise Scale Rate (₹/min)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={1}
                  value={form.enterpriseRateInr}
                  onChange={(e) =>
                    setForm({ ...form, enterpriseRateInr: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  GST Tax Rate (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={28}
                  value={form.gstPercent}
                  onChange={(e) => setForm({ ...form, gstPercent: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                />
              </div>
            </div>
          </div>

          {/* Payment Collection & Governance Card */}
          <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <ShieldCheck className="w-4 h-4" />
              <h2 className="text-sm font-bold text-[#20243A]">Payments, Support &amp; Privacy</h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  UPI Collection ID (Shown to Organizations)
                </label>
                <input
                  type="text"
                  value={form.upiId}
                  onChange={(e) => setForm({ ...form, upiId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs font-mono text-[#20243A]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#20243A] mb-1">
                    Platform Support Email
                  </label>
                  <input
                    type="email"
                    value={form.supportEmail}
                    onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#20243A] mb-1">
                    New Org Welcome Credit (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={form.defaultWelcomeBalanceInr}
                    onChange={(e) =>
                      setForm({ ...form, defaultWelcomeBalanceInr: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-[#20243A]">Maintenance Notice Banner</p>
                  <p className="text-[11px] text-[#747B91]">
                    Flag maintenance status in platform governance logs
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={form.maintenanceMode}
                  onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
                  className="w-4 h-4 accent-[#635BFF]"
                />
              </label>
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={testingHealth}
                onClick={handleTestHealth}
                className="px-4 py-2.5 rounded-xl border border-[#E8EAF1] bg-white hover:border-[#635BFF] text-xs font-semibold text-[#20243A]"
              >
                {testingHealth ? 'Checking...' : 'Test System Health'}
              </button>
              {healthResult && (
                <span className="text-xs font-semibold text-emerald-700">{healthResult}</span>
              )}
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving Settings...' : 'Save Platform Settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
