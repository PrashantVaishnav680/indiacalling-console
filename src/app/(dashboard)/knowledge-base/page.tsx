"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { LoadingState } from "@/components/LoadingSpinner";

const KB_CATEGORIES = [
  "Company Information",
  "Product Information",
  "Pricing & Plans",
  "Sales Playbooks",
  "FAQs",
  "Appointment Rules",
  "Customer Support",
  "Custom",
];

function ProcessingBadge({ status }: { status?: string }) {
  const s = (status || "ready").toLowerCase();
  if (s === "ready") {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        Ready
      </span>
    );
  }
  if (s === "processing") {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        Processing
      </span>
    );
  }
  if (s === "failed") {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        Failed
      </span>
    );
  }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
      Uploaded
    </span>
  );
}

export default function KnowledgeBasePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addDocInputRef = useRef<HTMLInputElement | null>(null);

  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Simplified Create Modal State (matching screenshot: Upload PDF | Add URL)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTab, setCreateTab] = useState<"pdf" | "url">("pdf");
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [languageSupport, setLanguageSupport] = useState("English (Default)");
  const [isDragging, setIsDragging] = useState(false);
  const [creating, setCreating] = useState(false);

  // Inspect / Manage Documents Modal State
  const [selectedKb, setSelectedKb] = useState<any | null>(null);
  const [uploadingToKb, setUploadingToKb] = useState(false);
  const [syncingWithBolna, setSyncingWithBolna] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadKnowledgeBaseData = async () => {
    setLoading(true);
    try {
      const [meRes, kbRes, orgsRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/knowledge-base"),
        fetch("/api/organizations"),
      ]);
      if (meRes.ok) {
        const d = await meRes.json();
        setCurrentUser(d.user);
      }
      if (kbRes.ok) {
        const d = await kbRes.json();
        setKnowledgeBases(d.knowledgeBases || []);
      }
      if (orgsRes.ok) {
        const d = await orgsRes.json();
        setOrganizations(d.organizations || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKnowledgeBaseData();
  }, []);

  const handleSyncWithBolna = async () => {
    setSyncingWithBolna(true);
    setBanner(null);
    try {
      const res = await fetch("/api/knowledge-base/sync", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({
          type: "error",
          text: data.details || data.error || "Failed to sync Knowledge Base with IndiaCalling Voice AI",
        });
        return;
      }
      setBanner({
        type: "success",
        text: `✓ ${data.message} (${data.stats?.readyDocumentsCount ?? 0} ready docs synced to ${data.stats?.syncedAgentsCount ?? 0} active voice agents)`,
      });
      await loadKnowledgeBaseData();
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Sync failed",
      });
    } finally {
      setSyncingWithBolna(false);
    }
  };

  const handleCreateKnowledgeBase = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBanner(null);

    if (createTab === "pdf") {
      if (!selectedPdf) {
        setBanner({ type: "error", text: "Please select a PDF file to upload." });
        return;
      }
      setCreating(true);
      try {
        const formData = new FormData();
        const derivedName = selectedPdf.name
          .replace(/\.pdf$/i, "")
          .replace(/[_\s]+/g, " ")
          .trim();
        formData.append("name", derivedName);
        formData.append("file", selectedPdf);
        formData.append("languageSupport", languageSupport);
        formData.append("sourceType", "pdf");
        formData.append("category", "Company Information");
        formData.append("status", "active");
        if (currentUser?.organizationId) {
          formData.append("organizationId", currentUser.organizationId);
        }

        const res = await fetch("/api/knowledge-base", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.details || data.error || "Failed to upload PDF");
        }
        setBanner({
          type: "success",
          text: `Knowledge Base "${data.knowledgeBase.name}" created successfully from PDF.`,
        });
        setShowCreateModal(false);
        setSelectedPdf(null);
        await loadKnowledgeBaseData();
      } catch (err: any) {
        setBanner({ type: "error", text: err?.message || "Failed to upload PDF" });
      } finally {
        setCreating(false);
      }
    } else {
      if (!urlInput.trim()) {
        setBanner({ type: "error", text: "Please enter a valid URL." });
        return;
      }
      setCreating(true);
      try {
        let cleanUrl = urlInput.trim();
        if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
          cleanUrl = "https://" + cleanUrl;
        }
        const res = await fetch("/api/knowledge-base", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: cleanUrl,
            sourceType: "url",
            languageSupport,
            category: "Company Information",
            status: "active",
            organizationId: currentUser?.organizationId,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.details || data.error || "Failed to add URL");
        }
        setBanner({
          type: "success",
          text: `Knowledge Base "${data.knowledgeBase.name}" added successfully from URL.`,
        });
        setShowCreateModal(false);
        setUrlInput("");
        await loadKnowledgeBaseData();
      } catch (err: any) {
        setBanner({ type: "error", text: err?.message || "Failed to add URL" });
      } finally {
        setCreating(false);
      }
    }
  };

  const handleToggleKbActiveStatus = async (kb: any) => {
    const nextStatus = kb.status === "active" ? "inactive" : "active";
    const res = await fetch(`/api/knowledge-base/${kb._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      await loadKnowledgeBaseData();
      if (selectedKb && selectedKb._id === kb._id) {
        const updated = await res.json();
        setSelectedKb(updated.knowledgeBase);
      }
    }
  };

  const handleUploadDocumentsToExistingKb = async (
    filesList: FileList | null
  ) => {
    if (!selectedKb || !filesList || filesList.length === 0) return;
    setUploadingToKb(true);
    try {
      const formData = new FormData();
      Array.from(filesList).forEach((f) => formData.append("files", f));
      const res = await fetch(`/api/knowledge-base/${selectedKb._id}`, {
        method: "PATCH",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.knowledgeBase) {
        setSelectedKb(data.knowledgeBase);
        await loadKnowledgeBaseData();
      }
    } finally {
      setUploadingToKb(false);
    }
  };

  const handleDeleteDocumentFromKb = async (docId: string) => {
    if (!selectedKb) return;
    const res = await fetch(`/api/knowledge-base/${selectedKb._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeDocumentId: docId }),
    });
    const data = await res.json();
    if (res.ok && data.knowledgeBase) {
      setSelectedKb(data.knowledgeBase);
      await loadKnowledgeBaseData();
    }
  };

  const handleDeleteKnowledgeBase = async (kbId: string) => {
    const res = await fetch(`/api/knowledge-base/${kbId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setSelectedKb(null);
      await loadKnowledgeBaseData();
    }
  };

  const getMatchedChunkSnippet = (kb: any, q: string): string | null => {
    if (!q) return null;
    for (const doc of kb.documents || []) {
      const chunks: string[] = Array.isArray(doc.chunks) ? doc.chunks : [];
      for (const chunk of chunks) {
        const idx = String(chunk || "").toLowerCase().indexOf(q);
        if (idx !== -1) {
          const start = Math.max(0, idx - 35);
          const snippet = String(chunk).slice(start, start + 140).trim();
          return `${doc.fileName || "Document"}: ${start > 0 ? "..." : ""}${snippet}...`;
        }
      }
      const rawText = String(doc.extractedText || "");
      const tIdx = rawText.toLowerCase().indexOf(q);
      if (tIdx !== -1) {
        const start = Math.max(0, tIdx - 35);
        const snippet = rawText.slice(start, start + 140).trim();
        return `${doc.fileName || "Document"}: ${start > 0 ? "..." : ""}${snippet}...`;
      }
    }
    return null;
  };

  const normalizedQuery = searchTerm.trim().toLowerCase();
  const filtered = knowledgeBases.filter((kb) => {
    const matchesCat =
      categoryFilter === "all" || kb.category === categoryFilter;
    if (!normalizedQuery) return matchesCat;
    const matchesMeta =
      (kb.name || "").toLowerCase().includes(normalizedQuery) ||
      (kb.description || "").toLowerCase().includes(normalizedQuery) ||
      (kb.category || "").toLowerCase().includes(normalizedQuery) ||
      (kb.sourceUrl || "").toLowerCase().includes(normalizedQuery) ||
      (kb.documents || []).some((d: any) =>
        String(d.fileName || "").toLowerCase().includes(normalizedQuery)
      );
    const matchesContent = Boolean(getMatchedChunkSnippet(kb, normalizedQuery));
    return matchesCat && (matchesMeta || matchesContent);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#20243A]">
            Knowledge Base Management
          </h1>
          <p className="text-sm text-[#747B91] mt-0.5">
            Create and manage organization knowledge bases, upload PDF documents or add documentation URLs, and connect verified sources to AI voice agents.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleSyncWithBolna}
            disabled={syncingWithBolna}
            className="px-3.5 py-2.5 bg-white border border-[#E8EAF1] hover:bg-[#F7F8FC] text-[#20243A] rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                syncingWithBolna ? "bg-amber-500 animate-ping" : "bg-emerald-500"
              }`}
            />
            {syncingWithBolna ? "Syncing with Voice AI Engine..." : "⚡ Sync with IndiaCalling Voice AI"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedPdf(null);
              setUrlInput("");
              setShowCreateModal(true);
            }}
            className="px-4 py-2.5 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
          >
            <span className="text-sm">+</span> Add Knowledge Base
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            banner.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="font-bold ml-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search & Category Filter */}
      <div className="bg-white border border-[#E8EAF1] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
          >
            <option value="all">All Categories</option>
            {KB_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <span className="text-[#747B91]">
            Supported Formats: <strong>PDF (or URL)</strong>
          </span>
        </div>

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Intelligent search across KB titles, categories, documents & content..."
          className="w-full sm:w-80 px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-[#20243A]"
        />
      </div>

      {/* Knowledge Base Cards Grid */}
      {loading ? (
        <LoadingState
          title="Loading Knowledge Bases..."
          subtitle="Fetching verified document repositories, text chunks, and agent associations"
        />
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((kb) => (
            <div
              key={kb._id}
              className="bg-white border border-[#E8EAF1] rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
                        {kb.sourceType === "url" ? "URL" : "PDF"}
                      </span>
                      {kb.languageSupport && (
                        <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                          {kb.languageSupport}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-[#20243A] mt-2">
                      {kb.name}
                    </h3>
                  </div>
                  <ProcessingBadge status={kb.processingStatus} />
                </div>

                <p className="text-xs text-[#747B91] line-clamp-2">
                  {kb.description ||
                    (kb.sourceUrl ? `URL: ${kb.sourceUrl}` : "Managed knowledge base for AI voice agents.")}
                </p>
                {normalizedQuery && getMatchedChunkSnippet(kb, normalizedQuery) && (
                  <div className="p-2 rounded-lg bg-[#EEF0FF]/70 border border-[#C7CBFF] text-[11px] text-[#20243A] line-clamp-2">
                    <span className="font-semibold text-[#635BFF]">Content match: </span>
                    {getMatchedChunkSnippet(kb, normalizedQuery)}
                  </div>
                )}

                <div className="space-y-1.5 pt-2 border-t border-[#E8EAF1] text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#747B91]">Source Documents:</span>
                    <span className="font-bold text-[#20243A]">
                      {kb.documentCount ?? (kb.documents || []).length} item(s)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#747B91]">Indexed Chunks:</span>
                    <span className="font-semibold text-blue-600">
                      {kb.totalChunks ?? 0} chunks
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#747B91]">Connected Agents:</span>
                    <span className="font-semibold text-[#20243A]">
                      {(kb.associatedAgents || []).length} agent(s)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#747B91]">Source Status:</span>
                    <span
                      className={`font-semibold capitalize ${
                        kb.status === "active"
                          ? "text-emerald-700"
                          : "text-gray-500"
                      }`}
                    >
                      {kb.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-[#E8EAF1] text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedKb(kb)}
                  className="flex-1 py-2 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded-lg font-semibold transition-colors"
                >
                  Inspect & Manage
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleKbActiveStatus(kb)}
                  className={`px-3 py-2 rounded-lg font-semibold border transition-colors ${
                    kb.status === "active"
                      ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                      : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  {kb.status === "active" ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-[#E8EAF1] rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-2xl font-bold">
            📚
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#20243A]">
              No Knowledge Bases Added Yet
            </h2>
            <p className="text-xs text-[#747B91] mt-1 leading-relaxed">
              Add your first Knowledge Base by uploading a PDF document or providing a documentation URL so your AI voice agents can reference verified company knowledge during calls.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedPdf(null);
              setUrlInput("");
              setShowCreateModal(true);
            }}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
          >
            + Add Knowledge Base
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* SIMPLIFIED "ADD KNOWLEDGE BASE" MODAL (MATCHING SCREENSHOT)         */}
      {/* =================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4">
              <h2 className="text-lg font-semibold text-[#111827]">
                Add Knowledge Base
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setSelectedPdf(null);
                  setUrlInput("");
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Segmented Pill Tabs: Upload PDF | Add URL */}
            <div className="bg-[#F3F4F6] p-1 rounded-xl flex gap-1 mb-5">
              <button
                type="button"
                onClick={() => setCreateTab("pdf")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  createTab === "pdf"
                    ? "bg-white text-blue-600 shadow-sm font-semibold"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                Upload PDF
              </button>
              <button
                type="button"
                onClick={() => setCreateTab("url")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  createTab === "url"
                    ? "bg-white text-blue-600 shadow-sm font-semibold"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                Add URL
              </button>
            </div>

            {/* Tab 1: Upload PDF */}
            {createTab === "pdf" && (
              <div>
                {/* Blue border container matching screenshot */}
                <div className="border-2 border-blue-600 rounded-xl p-2.5 bg-white space-y-2">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        const file = e.dataTransfer.files[0];
                        if (
                          file.type === "application/pdf" ||
                          file.name.toLowerCase().endsWith(".pdf")
                        ) {
                          setSelectedPdf(file);
                        } else {
                          setBanner({
                            type: "error",
                            text: "Only .pdf files are supported.",
                          });
                        }
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg py-8 px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                      isDragging
                        ? "border-blue-500 bg-blue-50/50"
                        : "border-gray-200 hover:bg-gray-50/60"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setSelectedPdf(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />

                    {/* Cloud icon with upward arrow */}
                    <div className="w-10 h-10 mb-2.5 text-slate-500 flex items-center justify-center">
                      <svg
                        className="w-9 h-9"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.4}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                    </div>

                    <p className="text-xs sm:text-sm text-gray-600">
                      Drag and drop your PDF here, or{" "}
                      <span className="text-blue-600 font-medium hover:underline">
                        click to browse
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Only .pdf files are supported
                    </p>
                  </div>

                  {/* Selected file indicator matching screenshot */}
                  {selectedPdf && (
                    <div className="px-2 pt-1 pb-0.5 flex items-center justify-between text-xs text-gray-800">
                      <div className="flex items-center gap-1.5 font-medium truncate">
                        <span className="text-emerald-600 font-bold text-sm">✓</span>
                        <span className="truncate">{selectedPdf.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPdf(null);
                        }}
                        className="text-gray-400 hover:text-rose-600 text-xs ml-2 font-bold px-1"
                        title="Remove file"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {/* Language Support Dropdown */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-800 mb-1.5">
                    Language Support
                  </label>
                  <div className="relative">
                    <select
                      value={languageSupport}
                      onChange={(e) => setLanguageSupport(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-xs sm:text-sm text-gray-800 appearance-none focus:outline-none focus:border-blue-500 pr-10"
                    >
                      <option value="English (Default)">English (Default)</option>
                      <option value="Hindi">Hindi</option>
                      <option value="English + Hindi">English + Hindi</option>
                      <option value="Hinglish">Hinglish</option>
                      <option value="Spanish">Spanish</option>
                      <option value="French">French</option>
                      <option value="German">German</option>
                      <option value="Arabic">Arabic</option>
                      <option value="Other">Other</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 9l4-4 4 4m0 6l-4 4-4-4"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Documentation Guidance Link */}
                <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                  Refer to the Knowledge documentation for step-by-step guidance on how to use it{" "}
                  <a
                    href="https://docs.indiacalling.ai"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline decoration-dotted underline-offset-2 hover:text-blue-700"
                  >
                    here
                  </a>
                  .
                </p>

                {/* Action Button */}
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateKnowledgeBase}
                    disabled={creating || !selectedPdf}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating ? "Uploading..." : "Upload PDF"}
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Add URL */}
            {createTab === "url" && (
              <div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1.5">
                      Website / Webpage URL
                    </label>
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://example.com/documentation"
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-xs sm:text-sm text-gray-800 focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Paste documentation, website, or FAQ URL to index for AI agents.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1.5">
                      Language Support
                    </label>
                    <div className="relative">
                      <select
                        value={languageSupport}
                        onChange={(e) => setLanguageSupport(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-xs sm:text-sm text-gray-800 appearance-none focus:outline-none focus:border-blue-500 pr-10"
                      >
                        <option value="English (Default)">English (Default)</option>
                        <option value="Hindi">Hindi</option>
                        <option value="English + Hindi">English + Hindi</option>
                        <option value="Hinglish">Hinglish</option>
                        <option value="Spanish">Spanish</option>
                        <option value="French">French</option>
                        <option value="German">German</option>
                        <option value="Arabic">Arabic</option>
                        <option value="Other">Other</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 9l4-4 4 4m0 6l-4 4-4-4"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    Refer to the Knowledge documentation for step-by-step guidance on how to use it{" "}
                    <a
                      href="https://docs.indiacalling.ai"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline decoration-dotted underline-offset-2 hover:text-blue-700"
                    >
                      here
                    </a>
                    .
                  </p>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleCreateKnowledgeBase}
                      disabled={creating || !urlInput.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {creating ? "Adding..." : "Add URL"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* INSPECT / MANAGE KNOWLEDGE BASE DOCUMENTS MODAL                     */}
      {/* =================================================================== */}
      {selectedKb && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8EAF1] rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-xl text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-[#E8EAF1] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#20243A]">
                    {selectedKb.name}
                  </h2>
                  <ProcessingBadge status={selectedKb.processingStatus} />
                </div>
                <p className="text-[#747B91] mt-0.5">
                  Category: <strong>{selectedKb.category}</strong> • Status:{" "}
                  <strong className="capitalize">{selectedKb.status}</strong> •{" "}
                  {(selectedKb.documents || []).length} Document(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedKb(null)}
                className="font-bold text-sm text-[#747B91]"
              >
                ✕
              </button>
            </div>

            {/* Upload Additional Document */}
            <div className="flex items-center justify-between bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl p-3.5">
              <div>
                <p className="font-semibold text-[#20243A]">
                  Add More Documents to This Knowledge Base
                </p>
                <p className="text-[11px] text-[#747B91]">
                  Upload PDF, TXT, DOCX, or CSV files.
                </p>
              </div>
              <div>
                <input
                  ref={addDocInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.txt,.docx,.csv"
                  onChange={(e) =>
                    handleUploadDocumentsToExistingKb(e.target.files)
                  }
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingToKb}
                  onClick={() => addDocInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  {uploadingToKb ? "Processing..." : "+ Upload Document"}
                </button>
              </div>
            </div>

            {/* Uploaded Documents List */}
            <div className="space-y-2.5">
              <h3 className="font-bold text-[#20243A]">
                Uploaded Documents ({(selectedKb.documents || []).length})
              </h3>
              {(selectedKb.documents || []).length > 0 ? (
                <div className="space-y-2">
                  {selectedKb.documents.map((doc: any) => (
                    <div
                      key={doc._id}
                      className="p-3.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-white border border-[#E8EAF1] font-mono uppercase text-[10px] font-bold text-blue-600">
                            {doc.fileType}
                          </span>
                          <span className="font-bold text-[#20243A]">
                            {doc.fileName}
                          </span>
                          <span className="text-[#747B91] text-[11px]">
                            ({Math.max(1, Math.round((doc.fileSizeBytes || 0) / 1024))} KB •{" "}
                            {(doc.chunks || []).length} chunks)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ProcessingBadge status={doc.processingStatus} />
                          <button
                            type="button"
                            onClick={() => handleDeleteDocumentFromKb(doc._id)}
                            className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded font-semibold hover:bg-rose-100"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {doc.errorMessage && (
                        <p className="text-rose-600 text-[11px]">
                          {doc.errorMessage}
                        </p>
                      )}

                      {doc.extractedText && (
                        <div className="p-2.5 bg-white border border-[#E8EAF1] rounded-lg font-mono text-[11px] text-[#747B91] max-h-28 overflow-y-auto whitespace-pre-wrap">
                          {doc.extractedText.slice(0, 600)}
                          {doc.extractedText.length > 600 ? "..." : ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#747B91] py-4 text-center">
                  No documents uploaded yet. Upload a PDF, TXT, DOCX, or CSV file above to make this source Ready.
                </p>
              )}
            </div>

            {/* Associated Agents */}
            <div className="pt-3 border-t border-[#E8EAF1] flex items-center justify-between">
              <div className="text-[#747B91]">
                Associated AI Agents:{" "}
                <strong className="text-[#20243A]">
                  {(selectedKb.associatedAgents || [])
                    .map((a: any) => a.name)
                    .join(", ") || "None connected yet"}
                </strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteKnowledgeBase(selectedKb._id)}
                  className="px-3.5 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg font-semibold"
                >
                  Delete Knowledge Base
                </button>
                <Link
                  href="/agents/new"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Connect in Agent Studio →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
