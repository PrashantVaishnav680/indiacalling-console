"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewLeadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
    location: "Bengaluru, Karnataka",
    industry: "Information Technology",
    source: "Manual Entry",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) {
      setError("Name and phone number are required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error("Failed to create lead");
      router.push("/leads");
    } catch (err: any) {
      setError(err.message || "Failed to create lead");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-[#747B91]">
          <Link href="/leads" className="hover:text-[#635BFF]">
            Leads
          </Link>
          <span>/</span>
          <span className="text-[#20243A]">Create New Lead</span>
        </div>
        <h1 className="text-2xl font-bold text-[#20243A]">Add Prospect Record</h1>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[#20243A] mb-1">Customer Full Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Rahul Sharma"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-sm text-[#20243A] focus:outline-none focus:border-[#635BFF]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#20243A] mb-1">Phone Number (E.164) *</label>
            <input
              type="text"
              required
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-sm font-mono text-[#20243A] focus:outline-none focus:border-[#635BFF]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#20243A] mb-1">Email Address</label>
            <input
              type="email"
              placeholder="rahul@company.in"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-sm text-[#20243A] focus:outline-none focus:border-[#635BFF]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#20243A] mb-1">Company / Organization</label>
            <input
              type="text"
              placeholder="e.g. TechVision India"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-sm text-[#20243A] focus:outline-none focus:border-[#635BFF]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#20243A] mb-1">Location</label>
            <input
              type="text"
              placeholder="e.g. Mumbai, Maharashtra"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-sm text-[#20243A] focus:outline-none focus:border-[#635BFF]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#20243A] mb-1">Notes / Context</label>
          <textarea
            rows={3}
            placeholder="Add any initial business requirements or background for the AI caller..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-sm text-[#20243A] focus:outline-none focus:border-[#635BFF]"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E8EAF1]">
          <Link
            href="/leads"
            className="px-4 py-2 border border-[#E8EAF1] rounded-lg text-xs font-semibold text-[#747B91] hover:bg-[#F7F8FC]"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-[#635BFF] text-white rounded-lg text-xs font-semibold hover:bg-[#5046E5] disabled:opacity-50"
          >
            {loading ? "Saving Lead..." : "Save Prospect"}
          </button>
        </div>
      </form>
    </div>
  );
}

