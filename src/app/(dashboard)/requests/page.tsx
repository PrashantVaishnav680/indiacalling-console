'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Inbox,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Send,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

const TYPE_LABELS: Record<string, string> = {
  managed_access_request: 'Managed Service Access',
  enterprise_quote: 'Custom Enterprise Quote',
  quota_increase: 'Quota / Limit Increase',
  support_request: 'Support Request',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function OrganizationRequestsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [topups, setTopups] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [busyId, setBusyId] = useState<string | null>(null);

  // New Request Modal
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newForm, setNewForm] = useState({
    type: 'quota_increase' as 'enterprise_quote' | 'quota_increase' | 'support_request',
    title: '',
    details: '',
  });

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/requests');
      if (res.ok) {
        const json = await res.json();
        const list = json.requests || [];
        setRequests(list);
        setTopups(json.topupRequests || []);
        const hasIncoming = list.some((r: any) => r.direction === 'admin_to_org');
        if (!hasIncoming && list.some((r: any) => r.direction === 'org_to_admin')) {
          setActiveTab('outgoing');
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleDecision = async (reqId: string, status: 'approved' | 'rejected') => {
    setBusyId(reqId);
    try {
      const res = await fetch(`/api/requests/${reqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not update request.');
      } else {
        toast.success(
          status === 'approved'
            ? 'Request approved. Managed Service Access has been enabled.'
            : 'Request declined.'
        );
        loadRequests();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newForm.title.trim().length < 3) {
      toast.error('Please enter a short request title.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to submit request.');
      } else {
        toast.success('Request sent to IndiaCalling Platform Admin.');
        setNewForm({ type: 'quota_increase', title: '', details: '' });
        setShowNew(false);
        setActiveTab('outgoing');
        loadRequests();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const incoming = requests.filter((r) => r.direction === 'admin_to_org');
  const outgoing = requests.filter((r) => r.direction === 'org_to_admin');
  const incomingPendingCount = incoming.filter((r) => r.status === 'pending').length;
  const outgoingPendingCount = outgoing.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#20243A]">
            Requests &amp; Approvals
          </h1>
          <p className="text-xs text-[#747B91] mt-1">
            Approve admin requests or ask for upgrades and support.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadRequests}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8EAF1] bg-white hover:bg-[#F7F8FC] text-xs font-semibold text-[#20243A]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            New Request
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('incoming')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
            activeTab === 'incoming'
              ? 'bg-[#635BFF] text-white border-[#635BFF] shadow-sm'
              : 'bg-white text-[#20243A] border-[#E8EAF1] hover:bg-[#F7F8FC]'
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          Incoming from Admin ({incoming.length})
          {incomingPendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-[#20243A] text-[10px] font-bold">
              {incomingPendingCount} pending
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('outgoing')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
            activeTab === 'outgoing'
              ? 'bg-[#635BFF] text-white border-[#635BFF] shadow-sm'
              : 'bg-white text-[#20243A] border-[#E8EAF1] hover:bg-[#F7F8FC]'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          Your Submitted Requests ({outgoing.length})
          {outgoingPendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
              {outgoingPendingCount} open
            </span>
          )}
        </button>
      </div>

      {/* Request List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 rounded-2xl shimmer-loading" />
          ))}
        </div>
      ) : activeTab === 'incoming' ? (
        incoming.length === 0 ? (
          <div className="rounded-2xl border border-[#E8EAF1] bg-white p-10 text-center space-y-2">
            <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="text-sm font-bold text-[#20243A]">No Incoming Admin Requests</p>
            <p className="text-xs text-[#747B91] max-w-md mx-auto">
              Support access requests from IndiaCalling Admin will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {incoming.map((req) => (
              <div
                key={req._id}
                className="rounded-2xl border border-[#E8EAF1] bg-white p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#EEF0FF] text-[#635BFF] text-[10px] font-bold">
                      {TYPE_LABELS[req.type] || req.type}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                        STATUS_STYLES[req.status] || STATUS_STYLES.pending
                      }`}
                    >
                      {req.status}
                    </span>
                    <span className="text-[11px] text-[#747B91]">
                      {new Date(req.createdAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#20243A]">{req.title}</h3>
                  <p className="text-xs text-[#747B91]">{req.details}</p>
                  <p className="text-[11px] text-[#747B91]">
                    Requested by: <strong className="text-[#20243A]">{req.requestedByName}</strong> ({req.requestedByEmail})
                  </p>
                </div>

                {req.status === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busyId === req._id}
                      onClick={() => handleDecision(req._id, 'approved')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve &amp; Grant Access
                    </button>
                    <button
                      type="button"
                      disabled={busyId === req._id}
                      onClick={() => handleDecision(req._id, 'rejected')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Decline
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {outgoing.length === 0 ? (
            <div className="rounded-2xl border border-[#E8EAF1] bg-white p-10 text-center space-y-2">
              <Clock className="w-8 h-8 text-[#635BFF] mx-auto" />
              <p className="text-sm font-bold text-[#20243A]">No Submitted Requests Yet</p>
              <p className="text-xs text-[#747B91]">
                Need higher limits, custom pricing, or help? Click New Request.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {outgoing.map((req) => (
                <div
                  key={req._id}
                  className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-[#EEF0FF] text-[#635BFF] text-[10px] font-bold">
                        {TYPE_LABELS[req.type] || req.type}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                          STATUS_STYLES[req.status] || STATUS_STYLES.pending
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#747B91]">
                      {new Date(req.createdAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#20243A]">{req.title}</h3>
                  {req.details && <p className="text-xs text-[#747B91]">{req.details}</p>}
                  {req.resolutionNote && (
                    <div className="mt-2 p-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] text-xs text-[#20243A]">
                      <strong className="text-[#635BFF]">Admin Note:</strong> {req.resolutionNote}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {topups.length > 0 && (
            <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#747B91] flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-[#13B8A6]" />
                  Recent Wallet Top-Up Requests
                </h2>
                <Link
                  href="/billing"
                  className="text-xs font-semibold text-[#635BFF] hover:underline"
                >
                  Open Billing &amp; Wallet →
                </Link>
              </div>
              <div className="divide-y divide-[#E8EAF1]">
                {topups.slice(0, 5).map((t: any, idx: number) => (
                  <div
                    key={t.id || t.invoiceNumber || idx}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-[#20243A]">
                        ₹{Number(t.amountInr || 0).toLocaleString('en-IN')} · {t.description || t.invoiceNumber}
                      </p>
                      <p className="text-[11px] text-[#747B91]">{t.periodLabel}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                        t.status === 'paid'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Request Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 bg-[#20243A]/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#E8EAF1] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#20243A]">
                Send Request to Platform Admin
              </h2>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="p-1 text-[#747B91] hover:text-[#20243A]"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateRequest} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Request Category
                </label>
                <select
                  value={newForm.type}
                  onChange={(e) => setNewForm({ ...newForm, type: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                >
                  <option value="quota_increase">Quota / Limit Increase</option>
                  <option value="enterprise_quote">Custom Enterprise Pack Quote</option>
                  <option value="support_request">Technical / Account Support</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  value={newForm.title}
                  onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                  placeholder="e.g. Increase max concurrent calls to 25"
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Details
                </label>
                <textarea
                  rows={3}
                  value={newForm.details}
                  onChange={(e) => setNewForm({ ...newForm, details: e.target.value })}
                  placeholder="Share volume, timeline, or notes for our admin team..."
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="px-4 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#747B91]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Sending...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
