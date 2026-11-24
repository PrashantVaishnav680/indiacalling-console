'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  IndianRupee,
  Wallet,
  CheckCircle2,
  PlusCircle,
  Download,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

export default function SuperAdminBillingPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Credit Adjustment Modal
  const [creditOrg, setCreditOrg] = useState<any | null>(null);
  const [creditAmount, setCreditAmount] = useState('1000');
  const [creditReason, setCreditReason] = useState('Promotional / Verified Bank Credit');

  const loadBilling = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/billing');
      if (res.ok) setData(await res.json());
    } catch {
      toast.error('Failed to load platform billing.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);


  const handleAdjustCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditOrg) return;
    setBusyKey('adjust');
    try {
      const res = await fetch('/api/super-admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'adjust_credit',
          organizationId: creditOrg.organizationId,
          amountInr: Number(creditAmount),
          reason: creditReason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Could not adjust wallet balance.');
      } else {
        toast.success(json.message);
        setCreditOrg(null);
        loadBilling();
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleExportCsv = () => {
    const rows: any[] = data?.organizationBilling || [];
    const header = [
      'Organization',
      'Plan',
      'Rate/Min (INR)',
      'Minutes',
      'Subtotal (INR)',
      'GST 18% (INR)',
      'Total (INR)',
      'Wallet Balance (INR)',
      'Status',
    ];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          `"${r.organizationName}"`,
          `"${r.planName}"`,
          r.ratePerMinuteInr,
          r.totalMinutes,
          r.totalSpendInr,
          r.gstInr ?? 0,
          r.totalWithGstInr ?? r.totalSpendInr,
          r.balanceInr,
          r.billingStatus,
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `indiacalling-billing-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = data?.summary || {};
  const recentTopUps: any[] = Array.isArray(data?.recentTopUps) ? data.recentTopUps : [];
  const orgBilling: any[] = Array.isArray(data?.organizationBilling) ? data.organizationBilling : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-[#20243A]">Platform Billing &amp; Revenue</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700">
              <ShieldCheck className="w-3.5 h-3.5" />
              Aggregated Billing Only
            </span>
          </div>
          <p className="text-xs text-[#747B91] mt-0.5">
            Track organization wallet credits, adjust balances, and monitor 18% GST revenue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E8EAF1] bg-white hover:border-[#635BFF] text-xs font-semibold text-[#20243A]"
          >
            <Download className="w-3.5 h-3.5 text-[#635BFF]" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={loadBilling}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E8EAF1] bg-white hover:bg-[#F7F8FC] text-xs font-semibold text-[#20243A]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Total Revenue (incl. 18% GST)</span>
            <IndianRupee className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            ₹{Number(summary.totalGrossRevenueInr ?? summary.totalRevenueInr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            Subtotal ₹{Number(summary.totalRevenueInr || 0).toFixed(2)} + GST ₹{Number(summary.totalGstInr || 0).toFixed(2)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Wallet Credit Top-Ups</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            {recentTopUps.length}
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">Instant direct wallet credits</p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Total Wallet Credits Held</span>
            <Wallet className="w-4 h-4 text-[#13B8A6]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            ₹{Number(summary.totalWalletBalanceInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">Across {summary.organizationsCount || 0} organization(s)</p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between text-xs text-[#747B91]">
            <span>Billed Voice Minutes</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            {summary.totalBilledMinutes || 0}m
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            Outstanding: ₹{Number(summary.totalDueInr || 0).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Recent Wallet Top-Ups & Credits Ledger */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[#20243A]">
            Recent Wallet Top-Ups &amp; Credits ({recentTopUps.length})
          </h2>
          <span className="text-[11px] text-[#747B91]">
            Direct instant credits &amp; Super Admin balance adjustments
          </span>
        </div>
        {recentTopUps.length === 0 ? (
          <p className="text-xs text-[#747B91] py-3">
            No wallet top-ups or credit adjustments recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-[#E8EAF1]">
            {recentTopUps.slice(0, 12).map((item) => (
              <div
                key={item.invoiceId}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <p className="text-sm font-bold text-[#20243A]">
                    {item.organizationName} — ₹{Number(item.amountInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-[#747B91]">
                    {item.description || 'Wallet credit top-up'} · Ref #{item.invoiceNumber}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Credited
                  </span>
                  {item.createdAt && (
                    <span className="text-[11px] text-[#747B91]">
                      {new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-Organization Spend, GST & Credit Controls */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white overflow-x-auto">
        <div className="p-5 border-b border-[#E8EAF1]">
          <h2 className="text-base font-bold text-[#20243A]">Per-Organization Billing &amp; Wallet Controls</h2>
        </div>
        {loading ? (
          <div className="p-6 h-40 shimmer-loading" />
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91] uppercase">Organization</th>
                <th className="px-4 py-3 text-left font-semibold text-[#747B91] uppercase">Plan &amp; Rate</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Usage</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Subtotal + GST</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Wallet Balance</th>
                <th className="px-4 py-3 text-right font-semibold text-[#747B91] uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAF1]">
              {orgBilling.map((row) => (
                <tr key={row.organizationId} className="hover:bg-[#F7F8FC]">
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/super-admin/organizations/${row.organizationId}`}
                      className="font-bold text-[#20243A] hover:text-[#635BFF]"
                    >
                      {row.organizationName}
                    </Link>
                    <p className="text-[11px] text-[#747B91]">{row.industry}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-[#20243A]">{row.planName}</p>
                    <p className="text-[11px] text-[#747B91]">₹{Number(row.ratePerMinuteInr).toFixed(2)}/min</p>
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    {row.totalCalls} calls · {row.totalMinutes}m
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <p className="font-bold text-[#20243A]">
                      ₹{Number(row.totalWithGstInr ?? row.totalSpendInr).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-[#747B91]">
                      ₹{Number(row.totalSpendInr).toFixed(2)} + ₹{Number(row.gstInr || 0).toFixed(2)} GST
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-emerald-700 whitespace-nowrap">
                    ₹{Number(row.balanceInr).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCreditOrg(row);
                          setCreditAmount('1000');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#C7CBFF] bg-[#EEF0FF] hover:bg-[#635BFF] text-[#635BFF] hover:text-white font-semibold transition-colors"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        Adjust Credit
                      </button>
                      <Link
                        href={`/super-admin/organizations/${row.organizationId}`}
                        className="px-2.5 py-1.5 rounded-lg border border-[#E8EAF1] hover:border-[#635BFF] text-[#20243A] font-semibold"
                      >
                        Inspect
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Adjust Wallet Credit Modal */}
      {creditOrg && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#20243A]/45 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-[#E8EAF1] shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-[#20243A]">
              Adjust Wallet Credits — {creditOrg.organizationName}
            </h3>
            <p className="text-xs text-[#747B91]">
              Current balance: <strong className="text-[#20243A]">₹{Number(creditOrg.balanceInr).toLocaleString('en-IN')}</strong>. Use a positive amount to add credits or a negative amount to deduct.
            </p>
            <form onSubmit={handleAdjustCredit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Amount (INR)
                </label>
                <input
                  type="number"
                  step="50"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-sm text-[#20243A]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Reason (Logged in Audit Trail)
                </label>
                <input
                  type="text"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCreditOrg(null)}
                  className="px-4 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#747B91]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyKey === 'adjust'}
                  className="px-4 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold"
                >
                  {busyKey === 'adjust' ? 'Applying...' : 'Apply Credit Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
