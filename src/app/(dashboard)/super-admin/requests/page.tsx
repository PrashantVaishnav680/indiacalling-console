'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Inbox,
  Send,
  CheckCircle2,
  XCircle,
  KeyRound,
  RefreshCw,
  Wallet,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

const TYPE_LABELS: Record<string, string> = {
  general_support: 'Managed Service Access',
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

export default function SuperAdminRequestsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [pendingTopupCount, setPendingTopupCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  // Request Access Modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [targetOrgId, setTargetOrgId] = useState('');
  const [accessReason, setAccessReason] = useState('');
  const [sendingAccess, setSendingAccess] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, orgRes] = await Promise.all([
        fetch('/api/super-admin/requests'),
        fetch('/api/super-admin/organizations'),
      ]);
      if (reqRes.ok) {
        const json = await reqRes.json();
        setRequests(json.requests || []);
        setPendingTopupCount(Number(json.counts?.pendingTopupCount || 0));
      }
      if (orgRes.ok) {
        const oJson = await orgRes.json();
        const list = oJson.organizations || [];
        setOrgs(list);
        if (list.length > 0 && !targetOrgId) {
          setTargetOrgId(list[0]._id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [targetOrgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleResolve = async (
    reqId: string,
    status: 'approved' | 'completed' | 'rejected'
  ) => {
    setBusyId(reqId);
    try {
      const res = await fetch(`/api/super-admin/requests/${reqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          resolutionNote: (notesById[reqId] || '').trim(),
        }),
      });
      if (res.ok) {
        toast.success(`Request marked as ${status}.`);
        loadData();
      } else {
        toast.error('Failed to update request.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleSendAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetOrgId) {
      toast.error('Please select an organization.');
      return;
    }
    setSendingAccess(true);
    try {
      const res = await fetch('/api/super-admin/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: targetOrgId,
          details: accessReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not send access request.');
      } else {
        toast.success('Managed Service Access request sent to organization.');
        setAccessReason('');
        setShowRequestModal(false);
        setActiveTab('outgoing');
        loadData();
      }
    } finally {
      setSendingAccess(false);
    }
  };

  const incoming = requests.filter((r) => r.direction === 'org_to_admin');
  const outgoing = requests.filter((r) => r.direction === 'admin_to_org');
  const incomingPending = incoming.filter((r) => r.status === 'pending').length;
  const outgoingPending = outgoing.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-[#E8EAF1] bg-white p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#20243A]">
            Organization Requests &amp; Access Approvals
          </h1>
          <p className="text-xs text-[#747B91] mt-1">
            Review organization requests or ask for workspace support access.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="w-3.5 h-3.5" />
            Zero-PII Active
          </span>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8EAF1] bg-white hover:bg-[#F7F8FC] text-xs font-semibold text-[#20243A]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowRequestModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Request Organization Access
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
          From Organizations ({incoming.length})
          {incomingPending > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-[#20243A] text-[10px] font-bold">
              {incomingPending} pending
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
          Sent Access Requests ({outgoing.length})
          {outgoingPending > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
              {outgoingPending} awaiting org
            </span>
          )}
        </button>
      </div>

      {/* Lists */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 rounded-2xl shimmer-loading" />
          ))}
        </div>
      ) : activeTab === 'incoming' ? (
        incoming.length === 0 ? (
          <div className="rounded-2xl border border-[#E8EAF1] bg-white p-10 text-center space-y-2">
            <Inbox className="w-8 h-8 text-[#635BFF] mx-auto" />
            <p className="text-sm font-bold text-[#20243A]">No Organization Requests Yet</p>
            <p className="text-xs text-[#747B91]">
              Enterprise quotes, quota upgrades, and support requests will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {incoming.map((req) => (
              <div
                key={req._id}
                className="rounded-2xl border border-[#E8EAF1] bg-white p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/super-admin/organizations/${req.organizationId}`}
                        className="text-xs font-bold text-[#635BFF] hover:underline"
                      >
                        {req.organizationName}
                      </Link>
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
                    <h3 className="text-sm font-bold text-[#20243A]">{req.title}</h3>
                    {req.details && <p className="text-xs text-[#747B91]">{req.details}</p>}
                    <p className="text-[11px] text-[#747B91]">
                      Submitted by {req.requestedByName} ({req.requestedByEmail}) ·{' '}
                      {new Date(req.createdAt).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>

                {req.status === 'pending' ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-[#E8EAF1]">
                    <input
                      type="text"
                      value={notesById[req._id] || ''}
                      onChange={(e) =>
                        setNotesById((prev) => ({ ...prev, [req._id]: e.target.value }))
                      }
                      placeholder="Optional response note for the organization..."
                      className="flex-1 px-3 py-1.5 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === req._id}
                        onClick={() => handleResolve(req._id, 'approved')}
                        className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === req._id}
                        onClick={() => handleResolve(req._id, 'rejected')}
                        className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  req.resolutionNote && (
                    <p className="text-xs text-[#747B91] pt-2 border-t border-[#E8EAF1]">
                      <strong className="text-[#20243A]">Resolution Note:</strong> {req.resolutionNote}
                    </p>
                  )
                )}
              </div>
            ))}
          </div>
        )
      ) : outgoing.length === 0 ? (
        <div className="rounded-2xl border border-[#E8EAF1] bg-white p-10 text-center space-y-2">
          <KeyRound className="w-8 h-8 text-[#635BFF] mx-auto" />
          <p className="text-sm font-bold text-[#20243A]">No Access Requests Sent Yet</p>
          <p className="text-xs text-[#747B91]">
            Need temporary workspace access? Click Request Organization Access.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {outgoing.map((req) => (
            <div
              key={req._id}
              className="rounded-2xl border border-[#E8EAF1] bg-white p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-[#20243A]">{req.organizationName}</span>
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
                <p className="text-xs text-[#747B91]">{req.details}</p>
              </div>
              <Link
                href={`/super-admin/organizations/${req.organizationId}`}
                className="px-3.5 py-1.5 rounded-xl bg-[#EEF0FF] hover:bg-[#635BFF] text-[#635BFF] hover:text-white text-xs font-semibold transition-colors"
              >
                Inspect Organization →
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Request Access Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-[#20243A]/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#E8EAF1] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#20243A]">
                Request Managed Service Access
              </h2>
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                className="p-1 text-[#747B91] hover:text-[#20243A]"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSendAccessRequest} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Target Organization
                </label>
                <select
                  value={targetOrgId}
                  onChange={(e) => setTargetOrgId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                >
                  {orgs.map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#20243A] mb-1">
                  Reason for Access
                </label>
                <textarea
                  rows={3}
                  value={accessReason}
                  onChange={(e) => setAccessReason(e.target.value)}
                  placeholder="e.g. Need temporary workspace access to help configure your AI voice agent and call transfer..."
                  className="w-full px-3 py-2 rounded-xl border border-[#E8EAF1] text-xs text-[#20243A]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E8EAF1] text-xs font-semibold text-[#747B91]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingAccess}
                  className="px-4 py-2 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {sendingAccess ? 'Sending...' : 'Send Access Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
