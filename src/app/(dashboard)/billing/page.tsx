'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  Clock,
  CreditCard,
  RefreshCw,
  CheckCircle2,
  Download,
  Sparkles,
  Building2,
  Calendar,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

const TWO_PLANS = [
  {
    id: 'standard',
    name: 'Standard Pay-As-You-Go',
    priceLabel: '₹6.00',
    priceUnit: '/ min',
    badge: 'Best Price · Popular Offer',
    highlighted: true,
    description:
      'Transparent pay-per-minute AI calling with zero monthly lock-in. Ideal for growing teams.',
    features: [
      '₹6.00 / billed minute (+18% GST)',
      'Up to 25 AI Voice Agents & IndiaCalling Voice AI v2 RAG sync',
      'Unlimited Campaigns, Batch Calling & Lead Qualification',
      'Real-time Call Scheduling, Sales Handoff & PDF Invoices',
    ],
  },
  {
    id: 'custom',
    name: 'Custom Enterprise Pack',
    priceLabel: 'Custom Pricing',
    priceUnit: '',
    badge: 'High Volume',
    highlighted: false,
    description:
      'Tailored for high-volume teams needing dedicated SIP trunks, custom concurrency, and volume discounts.',
    features: [
      'Custom discounted per-minute calling rates',
      'Unlimited AI Voice Agents & multi-team seats',
      'Dedicated SIP trunks, higher concurrency & SLA',
      'Priority onboarding, custom CRM webhooks & GST billing',
    ],
  },
];

export default function UnifiedBillingAndWalletPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<any>(null);
  const [amountInr, setAmountInr] = useState('2500');
  const [submitting, setSubmitting] = useState(false);
  const [switchingPlan, setSwitchingPlan] = useState(false);

  // Custom Enterprise Request Modal
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const [enterpriseMinutes, setEnterpriseMinutes] = useState('50,000+ mins/month');
  const [enterpriseNote, setEnterpriseNote] = useState('');
  const [sendingEnterprise, setSendingEnterprise] = useState(false);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing');
      if (res.ok) {
        const json = await res.json();
        setBilling(json.billing);
      }
    } catch {
      toast.error('Failed to load billing and wallet data.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  const handleAddWalletCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmt = Number(amountInr);
    if (!Number.isFinite(numericAmt) || numericAmt < 500) {
      toast.warning('Minimum wallet top-up amount is ₹500.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_wallet_credits',
          amountInr: numericAmt,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Could not add money to your wallet.');
      } else {
        toast.success(json.message || 'Wallet credited immediately.');
        loadBilling();
      }
    } catch {
      toast.error('Unable to reach the server while adding wallet credits.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectStandardPlan = async () => {
    setSwitchingPlan(true);
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_plan',
          planName: 'Standard Pay-As-You-Go',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Could not activate Standard Pay-As-You-Go plan.');
      } else {
        toast.success('Standard Pay-As-You-Go (₹6.00/min) is active.');
        loadBilling();
      }
    } finally {
      setSwitchingPlan(false);
    }
  };

  const handleRequestCustomEnterprise = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingEnterprise(true);
    try {
      const reqRes = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'enterprise_quote',
          title: `Custom Enterprise Pack Inquiry (${enterpriseMinutes})`,
          details:
            enterpriseNote.trim() ||
            `Requested custom high-volume enterprise pricing for ${enterpriseMinutes}.`,
          metadata: { expectedVolume: enterpriseMinutes },
        }),
      });
      if (!reqRes.ok) {
        const errJson = await reqRes.json().catch(() => ({}));
        toast.error(errJson.error || 'Could not submit enterprise request.');
        return;
      }
      toast.success(
        `Custom Enterprise request submitted (${enterpriseMinutes}). Track status anytime in Requests.`
      );
      setEnterpriseOpen(false);
      setEnterpriseNote('');
    } finally {
      setSendingEnterprise(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl shimmer-loading" />
          ))}
        </div>
        <div className="h-72 rounded-2xl shimmer-loading" />
      </div>
    );
  }

  const rate = billing?.ratePerMinuteInr || 6;
  const activePlanName = billing?.planName || 'Standard Pay-As-You-Go';
  const isCustomActive = activePlanName.toLowerCase().includes('enterprise') || activePlanName.toLowerCase().includes('custom');
  const ledger: any[] = Array.isArray(billing?.walletLedger) ? billing.walletLedger : [];
  const invoices: any[] = Array.isArray(billing?.invoices) ? billing.invoices : [];
  const gstPercent = Number(billing?.gstRatePercent ?? 18);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#20243A]">Billing &amp; Wallet</h1>
          <p className="text-xs text-[#747B91] mt-0.5">
            Your wallet balance, calling plan, and GST invoices.
          </p>
        </div>
        <button
          type="button"
          onClick={loadBilling}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E8EAF1] bg-white hover:bg-[#F7F8FC] text-xs font-semibold text-[#20243A] self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Wallet KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#747B91]">
            <span>Available Wallet Balance</span>
            <Wallet className="w-4 h-4 text-[#13B8A6]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            ₹{Number(billing?.balanceInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-emerald-700 font-medium mt-1">
            Active &amp; ready for outbound calls
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#747B91]">
            <span>Per-Minute Calling Rate</span>
            <Clock className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            ₹{Number(rate).toFixed(2)}{' '}
            <span className="text-xs font-medium text-[#747B91]">/ min</span>
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">{activePlanName}</p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#747B91]">
            <span>Usage Subtotal ({billing?.totalMinutes || 0} mins)</span>
            <ArrowDownRight className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            ₹{Number(billing?.subtotalInr ?? billing?.totalSpendInr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            +{gstPercent}% GST: ₹{Number(billing?.gstInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#747B91]">
            <span>Unbilled Usage</span>
            <ShieldCheck className="w-4 h-4 text-[#635BFF]" />
          </div>
          <p className="text-2xl font-bold text-[#20243A] mt-2">
            ₹{Number(billing?.unbilledInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#747B91] mt-1">
            Total w/ GST: ₹{Number(billing?.totalWithGstInr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Subscription Packs (Strictly 2 Clean Plans) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#20243A]">Subscription Packs</h2>
            <p className="text-xs text-[#747B91]">
              Simple, transparent pricing—start at ₹6.00/min or request a tailored Enterprise package.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {TWO_PLANS.map((plan) => {
            const isActive = plan.id === 'standard' ? !isCustomActive : isCustomActive;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-6 flex flex-col justify-between transition-all bg-white relative ${
                  plan.highlighted
                    ? 'border-[#635BFF] ring-2 ring-[#635BFF]/15 shadow-md'
                    : 'border-[#E8EAF1] hover:border-[#C7CBFF]'
                }`}
              >
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold ${
                        plan.highlighted
                          ? 'bg-[#635BFF] text-white'
                          : 'bg-[#F7F8FC] text-[#20243A] border border-[#E8EAF1]'
                      }`}
                    >
                      {plan.highlighted ? (
                        <Sparkles className="w-3 h-3" />
                      ) : (
                        <Building2 className="w-3 h-3 text-[#635BFF]" />
                      )}
                      {plan.badge}
                    </span>
                    {isActive && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                        Active Plan
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-[#20243A]">{plan.name}</h3>
                    <p className="text-3xl font-extrabold text-[#20243A] mt-1">
                      {plan.priceLabel}
                      {plan.priceUnit && (
                        <span className="text-sm font-medium text-[#747B91]"> {plan.priceUnit}</span>
                      )}
                    </p>
                    <p className="text-xs text-[#747B91] mt-1.5">{plan.description}</p>
                  </div>

                  <ul className="space-y-2 pt-3 border-t border-[#E8EAF1]">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-xs text-[#20243A]">
                        <CheckCircle2 className="w-4 h-4 text-[#13B8A6] flex-shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {plan.id === 'standard' ? (
                  <button
                    type="button"
                    disabled={isActive || switchingPlan}
                    onClick={handleSelectStandardPlan}
                    className={`mt-6 w-full py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF] cursor-default'
                        : 'bg-[#635BFF] hover:bg-[#5046E5] text-white shadow-sm'
                    }`}
                  >
                    {isActive
                      ? 'Current Active Pack (₹6.00/min)'
                      : switchingPlan
                      ? 'Activating...'
                      : 'Switch to Standard Pay-As-You-Go'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEnterpriseOpen(true)}
                    className="mt-6 w-full py-2.5 rounded-xl border border-[#635BFF] text-[#635BFF] hover:bg-[#635BFF] hover:text-white text-xs font-semibold transition-colors"
                  >
                    Contact Sales / Request Custom Plan
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Verified Top-Up + Transaction Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#20243A]">Add Money to Wallet</h2>
            <p className="text-xs text-[#747B91] mt-0.5">
              Choose a quick amount or enter a custom INR top-up (minimum ₹500). Credits are added to your wallet immediately.
            </p>
          </div>
          <form onSubmit={handleAddWalletCredits} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#20243A] mb-1">
                Top-Up Amount (INR)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2.5">
                {['1000', '2500', '5000', '10000'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmountInr(preset)}
                    className={`py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      amountInr === preset
                        ? 'bg-[#EEF0FF] border-[#635BFF] text-[#635BFF]'
                        : 'border-[#E8EAF1] text-[#747B91] hover:bg-[#F7F8FC]'
                    }`}
                  >
                    ₹{Number(preset).toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={500}
                step={100}
                value={amountInr}
                onChange={(e) => setAmountInr(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8EAF1] text-sm text-[#20243A] focus:outline-none focus:border-[#635BFF]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Adding Credits...' : `Add ₹${Number(amountInr || 0).toLocaleString('en-IN')} to Wallet`}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#20243A]">Transaction &amp; Usage Ledger</h2>
            <span className="text-xs text-[#747B91]">{ledger.length} entries</span>
          </div>

          {ledger.length === 0 ? (
            <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] p-10 text-center text-xs text-[#747B91]">
              No wallet transactions recorded yet. Usage deductions at ₹{Number(rate).toFixed(2)}/min and verified credits appear here automatically.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F7F8FC] border-y border-[#E8EAF1]">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-[#747B91] uppercase">Description</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-[#747B91] uppercase">Date</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-[#747B91] uppercase">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-[#747B91] uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EAF1]">
                  {ledger.map((row) => (
                    <tr key={row.id} className="hover:bg-[#F7F8FC]">
                      <td className="px-4 py-3 font-medium text-[#20243A]">
                        <span className="inline-flex items-center gap-1.5">
                          {row.type === 'credit' ? (
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5 text-amber-600" />
                          )}
                          {row.description}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#747B91] whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                            row.status === 'paid' || row.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : row.status === 'pending'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-bold whitespace-nowrap ${
                          row.type === 'credit' ? 'text-emerald-700' : 'text-[#20243A]'
                        }`}
                      >
                        {row.type === 'credit' ? '+' : '-'}₹
                        {Number(row.amountInr || 0).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Invoices & GST Billing History */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#635BFF]" />
            <h2 className="text-base font-bold text-[#20243A]">Invoices &amp; Payment History (GST)</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-[#747B91]">
            <Calendar className="w-3.5 h-3.5" />
            {gstPercent}% GST applied on telephony invoices
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F7F8FC] border-y border-[#E8EAF1]">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-[#747B91] uppercase">Invoice #</th>
                <th className="px-4 py-2.5 text-left font-semibold text-[#747B91] uppercase">Period / Description</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#747B91] uppercase">Subtotal</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#747B91] uppercase">GST ({gstPercent}%)</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#747B91] uppercase">Total (INR)</th>
                <th className="px-4 py-2.5 text-left font-semibold text-[#747B91] uppercase">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#747B91] uppercase">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAF1]">
              {invoices.map((inv) => {
                const sub = Number(inv.amountInr || 0);
                const gst = Number(((sub * gstPercent) / 100).toFixed(2));
                const total = Number((sub + gst).toFixed(2));
                return (
                  <tr key={inv.id} className="hover:bg-[#F7F8FC]">
                    <td className="px-4 py-3 font-mono font-semibold text-[#20243A] whitespace-nowrap">
                      {inv.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-[#20243A]">
                      <p className="font-semibold">{inv.periodLabel}</p>
                      <p className="text-[11px] text-[#747B91]">{inv.description}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-[#20243A] whitespace-nowrap">
                      ₹{sub.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right text-[#747B91] whitespace-nowrap">
                      ₹{gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-[#20243A] whitespace-nowrap">
                      ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                          inv.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : inv.status === 'pending'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <a
                        href={`/api/billing/invoice/${encodeURIComponent(inv.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E8EAF1] hover:border-[#635BFF] text-[#635BFF] font-semibold transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom Enterprise Pack Inquiry Modal */}
      {enterpriseOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#20243A]/45 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-[#E8EAF1] shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[#20243A]">
                  Request Custom Enterprise Pack
                </h3>
                <p className="text-xs text-[#747B91] mt-0.5">
                  Tell us your expected monthly volume for custom per-minute pricing and dedicated SIP trunks.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnterpriseOpen(false)}
                className="p-1 rounded-lg text-[#747B91] hover:bg-[#F7F8FC]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleRequestCustomEnterprise} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Estimated Monthly Volume
                </label>
                <select
                  value={enterpriseMinutes}
                  onChange={(e) => setEnterpriseMinutes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs bg-white text-[#20243A]"
                >
                  <option value="25,000 - 50,000 mins/month">25,000 – 50,000 mins/month</option>
                  <option value="50,000+ mins/month">50,000+ mins/month</option>
                  <option value="200,000+ mins/month (Dedicated Cluster)">200,000+ mins/month (Dedicated Cluster)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Requirements (SIP Trunks, Concurrency, CRM)
                </label>
                <textarea
                  rows={3}
                  value={enterpriseNote}
                  onChange={(e) => setEnterpriseNote(e.target.value)}
                  placeholder="Share preferred calling hours, concurrency needs, or CRM integrations..."
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                />
              </div>
              <div className="rounded-xl border border-[#E8EAF1] bg-[#F7F8FC] p-3 space-y-1.5">
                <p className="text-[11px] font-bold text-[#20243A]">
                  Prefer to contact our sales team directly?
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#747B91]">
                  <a
                    href="mailto:sales@indiacalling.ai?subject=Custom%20Enterprise%20Pricing%20Inquiry"
                    className="font-semibold text-[#635BFF] hover:underline"
                  >
                    Email: sales@indiacalling.ai
                  </a>
                  <a
                    href="tel:+919876543210"
                    className="font-semibold text-[#20243A] hover:text-[#635BFF]"
                  >
                    Phone / WhatsApp: +91 98765 43210
                  </a>
                </div>
                <p className="text-[10px] text-[#747B91]">
                  Submitting the form also creates a tracked request for the service provider in your Requests inbox.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEnterpriseOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#747B91]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEnterprise}
                  className="px-4 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold"
                >
                  {sendingEnterprise ? 'Sending...' : 'Submit Custom Plan Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
