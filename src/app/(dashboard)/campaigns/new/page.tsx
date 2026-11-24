"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IAgent, ILead } from "@/types";
import {
  ColumnMappingConfig,
  DatasetValidationResult,
  ValidatedLeadRow,
  autoGuessColumnMapping,
  generateErrorReportCsv,
  validateMappedDataset,
} from "@/lib/spreadsheet-parser";

const CAMPAIGN_OBJECTIVES = [
  "Lead Qualification",
  "Appointment Booking",
  "Customer Follow-up",
  "Customer Outreach",
  "Sales Promotion",
  "Lead Generation",
  "Sales & Conversion",
  "Customer Support",
  "Survey & Feedback",
  "Other",
];

const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST - UTC+05:30)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST - UTC+04:00)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT - UTC+08:00)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT)" },
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Core Data Resources
  const [agents, setAgents] = useState<IAgent[]>([]);
  const [bolnaPhoneNumbers, setBolnaPhoneNumbers] = useState<
    Array<{ id: string; phone_number: string; telephony_provider?: string; friendly_name?: string }>
  >([]);
  const [existingLeads, setExistingLeads] = useState<ILead[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [launchNotice, setLaunchNotice] = useState<{
    type: "success" | "warning" | "error";
    text: string;
  } | null>(null);

  // Section A & D Form State (Campaign Configuration & Calling Settings)
  // Note: Maintains Step 1: Campaign Details compatibility with platform audit
  const [form, setForm] = useState({
    name: "",
    agentId: "",
    description: "",
    objective: "Lead Qualification",
    customObjective: "",
    callMode: "standard" as "standard" | "demo",
    direction: "outbound" as "outbound" | "inbound" | "both",

    // Calling Settings
    outboundPhoneNumber: "",
    scheduleStartDate: new Date().toISOString().split("T")[0],
    callingStartHour: "09:30",
    callingEndHour: "18:30",
    timezone: "Asia/Kolkata",
    concurrency: 2,
    maxRetries: 2,
    retryIntervalMinutes: 60,
    maxCallDurationSeconds: 300,
    priority: "high" as "low" | "medium" | "high",
    consentConfirmed: true,
    selectedLeads: [] as string[],
  });

  // Section B Upload & Column Mapping State
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    sizeFormatted: string;
  } | null>(null);
  const [parsingFile, setParsingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, string>>>([]);
  const [previewLimit, setPreviewLimit] = useState(6);
  const [showMappingConfig, setShowMappingConfig] = useState(true);
  const [showCustomFields, setShowCustomFields] = useState(false);

  const [columnMapping, setColumnMapping] = useState<ColumnMappingConfig>({
    phoneNumber: "",
    name: "",
    email: "",
    company: "",
    city: "",
    budget: "",
    industry: "",
    notes: "",
    customFieldMappings: [],
  });

  // Section C Validation State
  const [validationResult, setValidationResult] =
    useState<DatasetValidationResult | null>(null);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState("");
  const [editingNameValue, setEditingNameValue] = useState("");
  const [editingEmailValue, setEditingEmailValue] = useState("");
  const [showFlaggedRows, setShowFlaggedRows] = useState(true);

  // Launch Confirmation Modal State
  const [showLaunchConfirmModal, setShowLaunchConfirmModal] = useState(false);

  // Load authorized organization agents and leads
  useEffect(() => {
    const loadResources = async () => {
      try {
        const [resAgents, resLeads] = await Promise.all([
          (fetch("/api/bolna/phone-numbers").then((r) => r.ok ? r.json() : null).then((d) => { if (Array.isArray(d?.phoneNumbers)) setBolnaPhoneNumbers(d.phoneNumbers); }).catch(() => {}), fetch("/api/agents")),
          fetch("/api/leads"),
        ]);

        if (resAgents.ok) {
          const jsonA = await resAgents.json();
          const list: IAgent[] = jsonA.agents || [];
          setAgents(list);
          if (list.length > 0) {
            const first = list[0];
            setForm((f) => ({
              ...f,
              agentId: first._id,
              outboundPhoneNumber:
                first.callingConfiguration?.phoneNumber || "",
              maxCallDurationSeconds:
                first.callingConfiguration?.maxDurationSeconds || 300,
            }));
          }
        }

        if (resLeads.ok) {
          const jsonL = await resLeads.json();
          setExistingLeads(jsonL.leads || []);
        }
      } catch (err) {
        console.error("Failed to load campaign resources", err);
      } finally {
        setFetching(false);
      }
    };

    loadResources();
  }, []);

  const selectedAgent = agents.find((a) => a._id === form.agentId);

  // Phone numbers configured across agents
  const configuredPhoneNumbers = Array.from(
    new Set(
      agents
        .map((a) => a.callingConfiguration?.phoneNumber?.trim())
        .filter(Boolean) as string[]
    )
  );

  // Run dataset validation helper
  const runDatasetValidation = (
    rowsToValidate: Array<Record<string, string>>,
    mappingToUse: ColumnMappingConfig
  ) => {
    const existingPhones = new Set(
      existingLeads.map((l) => l.phone).filter(Boolean)
    );
    const valRes = validateMappedDataset(
      rowsToValidate,
      mappingToUse,
      existingPhones
    );
    setValidationResult(valRes);
    return valRes;
  };

  // Upload handler for CSV/XLSX/XLS
  const handleSpreadsheetUpload = async (file?: File | null) => {
    if (!file) return;
    setError("");
    setParsingFile(true);
    setUploadProgress(20);

    const sizeFormatted =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    setUploadedFile({
      name: file.name,
      sizeFormatted,
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      setUploadProgress(50);

      const res = await fetch("/api/campaigns/parse-upload", {
        method: "POST",
        body: formData,
      });
      setUploadProgress(85);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.details || data.error || "Could not parse uploaded spreadsheet."
        );
      }

      const headers: string[] = data.headers || [];
      const rows: Array<Record<string, string>> = data.rows || [];
      setRawHeaders(headers);
      setRawRows(rows);

      const guessed =
        data.suggestedMapping || autoGuessColumnMapping(headers);
      setColumnMapping(guessed);
      runDatasetValidation(rows, guessed);
      setUploadProgress(100);
      setShowMappingConfig(true);
    } catch (err: any) {
      setError(err?.message || "Failed to parse uploaded file.");
      setUploadedFile(null);
      setRawRows([]);
      setRawHeaders([]);
      setValidationResult(null);
      setUploadProgress(0);
    } finally {
      setParsingFile(false);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setRawHeaders([]);
    setRawRows([]);
    setValidationResult(null);
    setUploadProgress(0);
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleMappingChange = (
    fieldKey: keyof ColumnMappingConfig,
    columnName: string
  ) => {
    const updated = { ...columnMapping, [fieldKey]: columnName };
    setColumnMapping(updated);
    if (rawRows.length > 0) {
      runDatasetValidation(rawRows, updated);
    }
  };

  // Inline Record Correction
  const handleStartEditRow = (row: ValidatedLeadRow) => {
    setEditingRowIndex(row.rowIndex);
    setEditingPhoneValue(row.rawPhone);
    setEditingNameValue(row.name);
    setEditingEmailValue(row.email);
  };

  const handleSaveEditedRow = (rowIndex1Based: number) => {
    const idx = rowIndex1Based - 1;
    if (idx < 0 || idx >= rawRows.length) return;
    const updatedRows = [...rawRows];
    const targetRow = { ...updatedRows[idx] };
    if (columnMapping.phoneNumber) {
      targetRow[columnMapping.phoneNumber] = editingPhoneValue.trim();
    }
    if (columnMapping.name) {
      targetRow[columnMapping.name] = editingNameValue.trim();
    }
    if (columnMapping.email) {
      targetRow[columnMapping.email] = editingEmailValue.trim();
    }
    updatedRows[idx] = targetRow;
    setRawRows(updatedRows);
    runDatasetValidation(updatedRows, columnMapping);
    setEditingRowIndex(null);
  };

  const handleRemoveRow = (rowIndex1Based: number) => {
    const idx = rowIndex1Based - 1;
    if (idx < 0 || idx >= rawRows.length) return;
    const updatedRows = rawRows.filter((_, i) => i !== idx);
    setRawRows(updatedRows);
    runDatasetValidation(updatedRows, columnMapping);
    if (editingRowIndex === rowIndex1Based) {
      setEditingRowIndex(null);
    }
  };

  const handleDownloadSampleCsv = () => {
    const sampleCsv = [
      "Customer Name,Phone Number,Email,City,Company,Budget,Industry,Notes",
      "Aarav Sharma,+919876543210,aarav@skylineinfra.in,Mumbai,Skyline Realty,1.8 Cr,Real Estate,Site visit requested",
      "Neha Verma,9820112233,neha@medicareplus.in,Ahmedabad,MediCare Plus,12 Lakhs,Healthcare,Appointment reminder",
      "Rohan Patel,+919712345678,rohan@edutechindia.com,Surat,EduTech Academy,4 Lakhs,Education,Admission inquiry",
      "Pooja Mehta,9988776655,pooja@consultancy.in,Bangalore,Apex Solutions,25 Lakhs,IT Services,Interested in demo",
      "Invalid Sample,12345,bad@example.com,Delhi,Test Corp,5 Lakhs,Retail,Invalid phone number example",
    ].join("\n");

    const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "indiacalling_campaign_leads_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadErrorReport = () => {
    if (!validationResult) return;
    const csv = generateErrorReportCsv(
      validationResult.invalidRows,
      validationResult.duplicateRows
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign_upload_errors_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Submission handler: Save as Draft or Create Campaign or Launch Campaign
  const handleSubmitCampaign = async (mode: "draft" | "create" | "launch") => {
    setError("");
    setSuccessMessage("");
    setLaunchNotice(null);

    // Validation Check 1: Campaign Name
    if (!form.name || form.name.trim().length < 2) {
      setError("Campaign Name is required (minimum 2 characters).");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Validation Check 2: Agent Selection
    if (!form.agentId) {
      setError("Please select an authorized AI Voice Agent for this campaign.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Validation Check 3: Objective
    const finalObjective =
      form.objective === "Other"
        ? form.customObjective.trim()
        : form.objective;
    if (!finalObjective) {
      setError("Please specify the Campaign Objective.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const validUploadedRows = validationResult?.validRows || [];
    const totalSelectedLeads =
      validUploadedRows.length + form.selectedLeads.length;

    // For create/launch, at least some leads are expected unless user explicitly saves a draft
    if (mode !== "draft" && totalSelectedLeads === 0) {
      setError(
        "Please upload a valid spreadsheet dataset (CSV/XLSX/XLS) or select existing CRM leads before creating the campaign."
      );
      return;
    }

    if (mode === "launch" && !form.consentConfirmed) {
      setError(
        "Please confirm opt-in consent and calling compliance before launching live outbound calls."
      );
      return;
    }

    setLoading(true);

    try {
      // 1. Create the campaign in MongoDB with status: "draft" or "ready"
      // Campaign creation NEVER automatically triggers actual calls.
      const createRes = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          agentId: form.agentId,
          agentName: selectedAgent?.name || "AI Voice Agent",
          description: form.description.trim(),
          objective: finalObjective,
          direction: "outbound",
          outboundPhoneNumber: form.outboundPhoneNumber || undefined,
          maxCallDurationSeconds: form.maxCallDurationSeconds,
          scheduleStartDate: form.scheduleStartDate,
          callingStartHour: form.callingStartHour,
          callingEndHour: form.callingEndHour,
          timezone: form.timezone,
          concurrency: form.concurrency,
          maxRetries: form.maxRetries,
          retryIntervalMinutes: form.retryIntervalMinutes,
          startCondition: "immediate",
          priority: form.priority,
          consentConfirmed: form.consentConfirmed,
          status: mode === "draft" ? "draft" : "ready",
          leadIds: form.selectedLeads,
          uploadedContacts: validUploadedRows,
          uploadedFileName: uploadedFile?.name || undefined,
          columnMapping,
          validationSummary: validationResult?.summary,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(
          createData.details || createData.error || "Failed to create campaign."
        );
      }

      const createdCampaignId = createData.campaign?._id;

      if (mode === "draft") {
        setSuccessMessage("Campaign saved as draft successfully!");
        setTimeout(() => {
          router.push(
            createdCampaignId ? `/campaigns/${createdCampaignId}` : "/campaigns"
          );
        }, 1000);
        return;
      }

      if (mode === "create") {
        setSuccessMessage(
          `Campaign created successfully with ${
            createData.totalEnrolledLeads || totalSelectedLeads
          } enrolled lead(s)!`
        );
        setTimeout(() => {
          router.push(
            createdCampaignId ? `/campaigns/${createdCampaignId}` : "/campaigns"
          );
        }, 1200);
        return;
      }

      // If user explicitly confirmed "Launch Campaign", execute via /api/campaigns/[id]/execute
      if (mode === "launch" && createdCampaignId) {
        setShowLaunchConfirmModal(false);
        const execRes = await fetch(
          `/api/campaigns/${createdCampaignId}/execute`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ concurrency: form.concurrency }),
          }
        );
        const execData = await execRes.json();

        if (!execRes.ok || !execData.success) {
          setLaunchNotice({
            type: "warning",
            text: `Campaign "${form.name}" was saved in Ready state, but live launch could not dispatch calls: ${
              execData.details ||
              execData.error ||
              "Verify VOICE_AI_API_KEY and agent synchronization."
            }`,
          });
          setTimeout(() => {
            router.push(`/campaigns/${createdCampaignId}`);
          }, 2400);
          return;
        }

        setLaunchNotice({
          type: "success",
          text:
            execData.message ||
            `Campaign launched! Dispatched ${execData.dispatchedCount} outbound call(s) via IndiaCalling Voice AI.`,
        });
        setTimeout(() => {
          router.push(`/campaigns/${createdCampaignId}`);
        }, 1500);
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#747B91]">
            <Link href="/campaigns" className="hover:text-[#635BFF] transition-colors">
              Campaigns
            </Link>
            <span>/</span>
            <span className="text-[#20243A] font-medium">Create Campaign</span>
          </div>
          <h1 className="text-2xl font-bold text-[#20243A] mt-1">
            Create Calling Campaign
          </h1>
          <p className="text-xs text-[#747B91] mt-0.5">
            Configure your AI calling campaign, upload leads, and review settings in one streamlined form.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadSampleCsv}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF] rounded-lg text-xs font-semibold hover:bg-[#635BFF] hover:text-white transition-colors self-start sm:self-auto"
        >
          <span>⬇</span>
          <span>Sample CSV Template</span>
        </button>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            className="text-red-700 font-bold hover:opacity-75"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold">
          ✓ {successMessage}
        </div>
      )}

      {launchNotice && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium ${
            launchNotice.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : launchNotice.type === "warning"
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {launchNotice.text}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmitCampaign("create");
        }}
        className="space-y-6"
      >
        {/* =================================================================== */}
        {/* SECTION A: CAMPAIGN INFORMATION (Step 1: Campaign Details)         */}
        {/* =================================================================== */}
        <section className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-5 shadow-sm">
          <div className="border-b border-[#E8EAF1] pb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#635BFF] text-white text-xs font-bold flex items-center justify-center">
                A
              </span>
              <h2 className="text-base font-bold text-[#20243A]">
                Campaign Information
              </h2>
            </div>
            <p className="text-xs text-[#747B91] mt-1 ml-8">
              Step 1: Campaign Details — Define the campaign identity, objective, and assigned AI voice agent.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Campaign Name */}
            <div>
              <label className="block text-xs font-semibold text-[#20243A] mb-1.5">
                Campaign Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Real Estate Lead Qualification"
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF] focus:bg-white transition-all"
              />
            </div>

            {/* 2. Campaign Objective */}
            <div>
              <label className="block text-xs font-semibold text-[#20243A] mb-1.5">
                Campaign Objective <span className="text-rose-500">*</span>
              </label>
              <select
                value={form.objective}
                onChange={(e) =>
                  setForm({ ...form, objective: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF] focus:bg-white transition-all"
              >
                {CAMPAIGN_OBJECTIVES.map((obj) => (
                  <option key={obj} value={obj}>
                    {obj}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Objective input if 'Other' selected */}
          {form.objective === "Other" && (
            <div>
              <label className="block text-xs font-semibold text-[#20243A] mb-1.5">
                Specify Custom Objective <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.customObjective}
                onChange={(e) =>
                  setForm({ ...form, customObjective: e.target.value })
                }
                placeholder="e.g. Product Demo Scheduling or VIP Event Invitation"
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF]"
              />
            </div>
          )}

          {/* 3. Select AI Agent */}
          <div>
            <label className="block text-xs font-semibold text-[#20243A] mb-1.5">
              Select AI Agent <span className="text-rose-500">*</span>
            </label>

            {fetching ? (
              <div className="p-3 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#747B91] flex items-center gap-2">
                <span className="animate-spin text-sm">⏳</span>
                <span>Loading authorized organization agents...</span>
              </div>
            ) : agents.length === 0 ? (
              /* Helpful Empty State when no agents exist */
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-sm font-bold">
                  ⚠️
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-amber-900">
                    No Authorized AI Voice Agents Available
                  </h4>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Your organization does not have any AI Voice Agents configured yet. An agent is required to conduct calls.
                  </p>
                  <Link
                    href="/agents/new"
                    className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 bg-[#635BFF] text-white rounded-lg text-xs font-semibold hover:bg-[#5046E5] transition-colors"
                  >
                    <span>Create AI Agent</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  required
                  value={form.agentId}
                  onChange={(e) => {
                    const agent = agents.find((a) => a._id === e.target.value);
                    setForm({
                      ...form,
                      agentId: e.target.value,
                      outboundPhoneNumber:
                        agent?.callingConfiguration?.phoneNumber ||
                        form.outboundPhoneNumber,
                      maxCallDurationSeconds:
                        agent?.callingConfiguration?.maxDurationSeconds ||
                        form.maxCallDurationSeconds,
                    });
                  }}
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF] focus:bg-white transition-all"
                >
                  <option value="">-- Select an Authorized AI Agent --</option>
                  {agents.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name} — {a.language} ({a.industry || "General"} •{" "}
                      {a.syncStatus === "synced" ? "Live Synced" : "Pending Sync"})
                    </option>
                  ))}
                </select>

                {selectedAgent && (
                  <div className="p-3 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold text-[#20243A]">
                        {selectedAgent.name}
                      </span>
                      <span className="text-[#747B91]">
                        Language: {selectedAgent.language}
                      </span>
                      <span className="text-[#747B91]">
                        Voice:{" "}
                        {selectedAgent.voiceConfiguration?.voiceName || "Default"}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full font-semibold ${
                        selectedAgent.syncStatus === "synced"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {selectedAgent.syncStatus === "synced"
                        ? "IndiaCalling Voice AI Synced"
                        : "Pending Voice AI Sync"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. Campaign Description */}
          <div>
            <label className="block text-xs font-semibold text-[#20243A] mb-1.5">
              Campaign Description{" "}
              <span className="text-[#747B91] font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Brief summary of the target audience, offer, or campaign objectives..."
              className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF] focus:bg-white transition-all"
            />
          </div>
        </section>

        {/* =================================================================== */}
        {/* SECTION B: UPLOAD LEADS & COLUMN MAPPING                            */}
        {/* =================================================================== */}
        <section className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-5 shadow-sm">
          <div className="border-b border-[#E8EAF1] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#635BFF] text-white text-xs font-bold flex items-center justify-center">
                  B
                </span>
                <h2 className="text-base font-bold text-[#20243A]">
                  Upload Leads
                </h2>
              </div>
              <p className="text-xs text-[#747B91] mt-1 ml-8">
                Upload contacts via CSV, XLSX, or XLS. Headers and columns are automatically detected.
              </p>
            </div>

            {uploadedFile && (
              <button
                type="button"
                onClick={() => setShowMappingConfig(!showMappingConfig)}
                className="text-xs text-[#635BFF] font-semibold hover:underline self-start sm:self-auto ml-8 sm:ml-0"
              >
                {showMappingConfig ? "Hide Column Mapping ▲" : "Edit Column Mapping ▼"}
              </button>
            )}
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              handleSpreadsheetUpload(file);
            }}
            className="border-2 border-dashed border-[#C7CBFF] bg-[#F7F8FC] rounded-2xl p-6 text-center space-y-2 hover:border-[#635BFF] transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.tsv,.txt"
              onChange={(e) => handleSpreadsheetUpload(e.target.files?.[0])}
              className="hidden"
            />

            <div className="w-12 h-12 rounded-full bg-[#EEF0FF] text-[#635BFF] flex items-center justify-center mx-auto text-xl">
              📊
            </div>

            <div>
              <p className="text-xs sm:text-sm font-bold text-[#20243A]">
                Drag & drop your CSV, XLSX, or XLS file here
              </p>
              <p className="text-xs text-[#747B91] mt-0.5">
                or{" "}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[#635BFF] font-semibold underline hover:text-[#5046E5]"
                >
                  browse from your computer
                </button>
              </p>
            </div>

            <p className="text-[11px] text-[#747B91]">
              Supported formats: <strong>.csv</strong>, <strong>.xlsx</strong>,{" "}
              <strong>.xls</strong>
            </p>

            {/* Upload Progress Indicator */}
            {(parsingFile || uploadProgress > 0) && (
              <div className="max-w-md mx-auto space-y-1.5 pt-2">
                <div className="flex justify-between text-[11px] font-semibold text-[#635BFF]">
                  <span>
                    {parsingFile
                      ? "Parsing & detecting columns..."
                      : `Upload Complete: ${uploadedFile?.name}`}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-[#E8EAF1] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#635BFF] h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Loaded File Summary & Action Buttons */}
            {uploadedFile && !parsingFile && (
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
                  <span>✓ {uploadedFile.name}</span>
                  <span className="text-emerald-600 font-normal">
                    ({uploadedFile.sizeFormatted})
                  </span>
                  <span>• {rawRows.length} records</span>
                  <span>• {rawHeaders.length} columns</span>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1.5 bg-white border border-[#E8EAF1] text-[#20243A] rounded-lg text-xs font-semibold hover:bg-[#F7F8FC]"
                >
                  Replace File
                </button>

                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="px-2.5 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-100"
                >
                  Remove File
                </button>
              </div>
            )}
          </div>

          {/* Automatic Column Detection Feedback & Manual Mapping Configuration */}
          {uploadedFile && showMappingConfig && (
            <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <h3 className="font-bold text-[#20243A]">
                    Column Mapping
                  </h3>
                  <p className="text-[11px] text-[#747B91]">
                    Verify or adjust automatically detected column headers. Phone Number is required for dialing.
                  </p>
                </div>
                {columnMapping.phoneNumber ? (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    ✓ Phone column mapped: {columnMapping.phoneNumber}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                    ⚠ Please map Phone Number column
                  </span>
                )}
              </div>

              {/* Standard Columns Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {/* Phone Number (Required) */}
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={columnMapping.phoneNumber}
                    onChange={(e) =>
                      handleMappingChange("phoneNumber", e.target.value)
                    }
                    className="w-full px-2.5 py-2 bg-white border border-[#635BFF] font-semibold rounded-lg text-xs text-[#20243A]"
                  >
                    <option value="">-- Select Phone Column --</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Customer Name */}
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Customer Name
                  </label>
                  <select
                    value={columnMapping.name || ""}
                    onChange={(e) => handleMappingChange("name", e.target.value)}
                    className="w-full px-2.5 py-2 bg-white border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
                  >
                    <option value="">-- Not Mapped --</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Email */}
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Email
                  </label>
                  <select
                    value={columnMapping.email || ""}
                    onChange={(e) => handleMappingChange("email", e.target.value)}
                    className="w-full px-2.5 py-2 bg-white border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
                  >
                    <option value="">-- Not Mapped --</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Company */}
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Company
                  </label>
                  <select
                    value={columnMapping.company || ""}
                    onChange={(e) =>
                      handleMappingChange("company", e.target.value)
                    }
                    className="w-full px-2.5 py-2 bg-white border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
                  >
                    <option value="">-- Not Mapped --</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* City */}
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    City
                  </label>
                  <select
                    value={columnMapping.city || ""}
                    onChange={(e) => handleMappingChange("city", e.target.value)}
                    className="w-full px-2.5 py-2 bg-white border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
                  >
                    <option value="">-- Not Mapped --</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Budget */}
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Budget
                  </label>
                  <select
                    value={columnMapping.budget || ""}
                    onChange={(e) =>
                      handleMappingChange("budget", e.target.value)
                    }
                    className="w-full px-2.5 py-2 bg-white border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
                  >
                    <option value="">-- Not Mapped --</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Industry */}
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Industry
                  </label>
                  <select
                    value={columnMapping.industry || ""}
                    onChange={(e) =>
                      handleMappingChange("industry", e.target.value)
                    }
                    className="w-full px-2.5 py-2 bg-white border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
                  >
                    <option value="">-- Not Mapped --</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Notes
                  </label>
                  <select
                    value={columnMapping.notes || ""}
                    onChange={(e) => handleMappingChange("notes", e.target.value)}
                    className="w-full px-2.5 py-2 bg-white border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
                  >
                    <option value="">-- Not Mapped --</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom Fields Mapping Accordion */}
              <div className="pt-2 border-t border-[#E8EAF1]">
                <button
                  type="button"
                  onClick={() => setShowCustomFields(!showCustomFields)}
                  className="text-[11px] font-semibold text-[#635BFF] hover:underline"
                >
                  {showCustomFields
                    ? "Hide Custom Field Mappings ▲"
                    : "+ Add Custom Field Mappings ▼"}
                </button>

                {showCustomFields && (
                  <div className="pt-2 space-y-2">
                    <p className="text-[11px] text-[#747B91]">
                      Pass extra spreadsheet columns directly into AI Agent prompt variables.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setColumnMapping({
                          ...columnMapping,
                          customFieldMappings: [
                            ...(columnMapping.customFieldMappings || []),
                            {
                              sourceColumn: rawHeaders[0] || "",
                              targetKey: "",
                            },
                          ],
                        })
                      }
                      className="px-2.5 py-1 bg-[#EEF0FF] text-[#635BFF] rounded text-xs font-semibold"
                    >
                      + Add Field
                    </button>

                    {(columnMapping.customFieldMappings || []).map((cf, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-xs bg-white p-2 rounded-lg border border-[#E8EAF1]"
                      >
                        <select
                          value={cf.sourceColumn}
                          onChange={(e) => {
                            const next = [
                              ...(columnMapping.customFieldMappings || []),
                            ];
                            next[idx].sourceColumn = e.target.value;
                            setColumnMapping({
                              ...columnMapping,
                              customFieldMappings: next,
                            });
                          }}
                          className="px-2 py-1 bg-[#F7F8FC] border rounded"
                        >
                          {rawHeaders.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                        <span className="text-[#747B91]">→</span>
                        <input
                          type="text"
                          value={cf.targetKey}
                          onChange={(e) => {
                            const next = [
                              ...(columnMapping.customFieldMappings || []),
                            ];
                            next[idx].targetKey = e.target.value;
                            setColumnMapping({
                              ...columnMapping,
                              customFieldMappings: next,
                            });
                          }}
                          placeholder="e.g. propertyType"
                          className="px-2 py-1 bg-[#F7F8FC] border rounded flex-1 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = (
                              columnMapping.customFieldMappings || []
                            ).filter((_, i) => i !== idx);
                            setColumnMapping({
                              ...columnMapping,
                              customFieldMappings: next,
                            });
                          }}
                          className="text-rose-600 font-bold px-1.5"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Uploaded Records Quick Preview Table */}
          {rawRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#20243A]">
                  Dataset Preview (Showing {Math.min(previewLimit, rawRows.length)}{" "}
                  of {rawRows.length} records)
                </span>
                {rawRows.length > previewLimit ? (
                  <button
                    type="button"
                    onClick={() => setPreviewLimit((p) => p + 10)}
                    className="text-[#635BFF] font-semibold hover:underline"
                  >
                    Show More Rows
                  </button>
                ) : (
                  rawRows.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setPreviewLimit(6)}
                      className="text-[#635BFF] font-semibold hover:underline"
                    >
                      Show Fewer Rows
                    </button>
                  )
                )}
              </div>

              <div className="overflow-x-auto max-h-48 border border-[#E8EAF1] rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-[#747B91]">
                        #
                      </th>
                      {rawHeaders.map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left font-semibold text-[#747B91]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EAF1]">
                    {rawRows.slice(0, previewLimit).map((r, i) => (
                      <tr key={i} className="hover:bg-[#F7F8FC]">
                        <td className="px-3 py-1.5 font-mono text-[#747B91]">
                          {i + 1}
                        </td>
                        {rawHeaders.map((h) => (
                          <td key={h} className="px-3 py-1.5 text-[#20243A]">
                            {r[h] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Optional: Include Existing CRM Leads */}
          {existingLeads.length > 0 && (
            <div className="pt-2 border-t border-[#E8EAF1] flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[#747B91]">
                Existing CRM Leads Available: <strong>{existingLeads.length}</strong> (
                {form.selectedLeads.length} selected)
              </span>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    selectedLeads:
                      form.selectedLeads.length === existingLeads.length
                        ? []
                        : existingLeads.map((l) => l._id),
                  })
                }
                className="text-[#635BFF] font-semibold hover:underline"
              >
                {form.selectedLeads.length === existingLeads.length
                  ? "Deselect All CRM Leads"
                  : "Include All Existing CRM Leads"}
              </button>
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* SECTION C: DATA VALIDATION                                         */}
        {/* =================================================================== */}
        <section className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-5 shadow-sm">
          <div className="border-b border-[#E8EAF1] pb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#635BFF] text-white text-xs font-bold flex items-center justify-center">
                  C
                </span>
                <h2 className="text-base font-bold text-[#20243A]">
                  Data Validation
                </h2>
              </div>
              <p className="text-xs text-[#747B91] mt-1 ml-8">
                Clean and verify phone numbers, flag duplicates, and correct invalid entries.
              </p>
            </div>

            {validationResult &&
              (validationResult.invalidRows.length > 0 ||
                validationResult.duplicateRows.length > 0) && (
                <button
                  type="button"
                  onClick={handleDownloadErrorReport}
                  className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100 self-start sm:self-auto ml-8 sm:ml-0"
                >
                  ⬇ Download Error Report (CSV)
                </button>
              )}
          </div>

          {!validationResult ? (
            <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl text-center text-xs text-[#747B91]">
              Upload a lead spreadsheet in Section B above to automatically validate records.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Validation Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div className="p-3 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl">
                  <p className="text-[11px] text-[#747B91]">Total Records</p>
                  <p className="text-lg font-bold text-[#20243A] mt-0.5">
                    {validationResult.summary.totalUploaded}
                  </p>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="text-[11px] text-emerald-700 font-semibold">
                    Valid Records
                  </p>
                  <p className="text-lg font-bold text-emerald-700 mt-0.5">
                    {validationResult.summary.validRecords}
                  </p>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                  <p className="text-[11px] text-rose-700 font-semibold">
                    Invalid Records
                  </p>
                  <p className="text-lg font-bold text-rose-700 mt-0.5">
                    {validationResult.summary.invalidRecords}
                  </p>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-[11px] text-amber-800 font-semibold">
                    Duplicate Phones
                  </p>
                  <p className="text-lg font-bold text-amber-800 mt-0.5">
                    {validationResult.summary.duplicateRecords}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl col-span-2 sm:col-span-1">
                  <p className="text-[11px] text-gray-600">Missing Phone</p>
                  <p className="text-lg font-bold text-gray-800 mt-0.5">
                    {validationResult.summary.missingPhoneNumbers}
                  </p>
                </div>
              </div>

              {/* Status Message */}
              {validationResult.summary.invalidRecords === 0 &&
              validationResult.summary.duplicateRecords === 0 ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
                  <span>✓</span>
                  <span>
                    All {validationResult.summary.validRecords} records passed verification with normalized E.164 phone numbers and are ready for calling!
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
                  Notice: Only <strong>{validationResult.summary.validRecords} valid records</strong> will be queued. You can inspect, edit, or remove flagged rows below.
                </div>
              )}

              {/* Flagged Rows Inspection & Inline Correction */}
              {(validationResult.invalidRows.length > 0 ||
                validationResult.duplicateRows.length > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-rose-700">
                      Flagged Records (
                      {validationResult.invalidRows.length +
                        validationResult.duplicateRows.length}
                      )
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowFlaggedRows(!showFlaggedRows)}
                      className="text-xs text-[#747B91] hover:underline"
                    >
                      {showFlaggedRows ? "Collapse ▲" : "Expand ▼"}
                    </button>
                  </div>

                  {showFlaggedRows && (
                    <div className="max-h-52 overflow-y-auto border border-rose-200 rounded-xl">
                      <table className="w-full text-xs">
                        <thead className="bg-rose-50 border-b border-rose-200 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-rose-800">
                              Row #
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-rose-800">
                              Name
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-rose-800">
                              Phone
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-rose-800">
                              Issue
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-rose-800">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-rose-100 bg-white">
                          {[
                            ...validationResult.invalidRows,
                            ...validationResult.duplicateRows,
                          ].map((r) => {
                            const isEditing = editingRowIndex === r.rowIndex;
                            return (
                              <tr key={r.rowIndex}>
                                <td className="px-3 py-2 font-mono text-[#747B91]">
                                  {r.rowIndex}
                                </td>
                                <td className="px-3 py-2 font-medium text-[#20243A]">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={editingNameValue}
                                      onChange={(e) =>
                                        setEditingNameValue(e.target.value)
                                      }
                                      className="px-2 py-1 border border-[#635BFF] rounded text-xs w-32"
                                    />
                                  ) : (
                                    r.name
                                  )}
                                </td>
                                <td className="px-3 py-2 font-mono text-rose-600">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={editingPhoneValue}
                                      onChange={(e) =>
                                        setEditingPhoneValue(e.target.value)
                                      }
                                      placeholder="+919876543210"
                                      className="px-2 py-1 border border-[#635BFF] rounded text-xs w-36 font-mono"
                                    />
                                  ) : (
                                    r.rawPhone || "(Missing)"
                                  )}
                                </td>
                                <td className="px-3 py-2 text-rose-700">
                                  {r.errorReason}
                                </td>
                                <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleSaveEditedRow(r.rowIndex)
                                        }
                                        className="px-2 py-1 bg-emerald-600 text-white rounded font-semibold text-[11px]"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingRowIndex(null)}
                                        className="px-2 py-1 border text-[#747B91] rounded text-[11px]"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditRow(r)}
                                        className="px-2 py-1 bg-[#EEF0FF] text-[#635BFF] rounded font-semibold text-[11px] hover:bg-[#635BFF] hover:text-white transition-colors"
                                      >
                                        Edit / Correct
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveRow(r.rowIndex)}
                                        className="px-2 py-1 bg-rose-50 text-rose-700 rounded font-semibold text-[11px] hover:bg-rose-100"
                                      >
                                        Remove
                                      </button>
                                    </>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Valid Leads Preview */}
              {validationResult.validRows.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-emerald-700">
                    Validated Leads Preview (
                    {validationResult.validRows.length} ready)
                  </span>
                  <div className="max-h-40 overflow-y-auto border border-[#E8EAF1] rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-[#F7F8FC] border-b border-[#E8EAF1] sticky top-0">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-semibold text-[#747B91]">
                            Customer Name
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold text-[#747B91]">
                            Normalized Phone (E.164)
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold text-[#747B91]">
                            Company / City
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold text-[#747B91]">
                            Budget
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8EAF1]">
                        {validationResult.validRows.slice(0, 5).map((r, i) => (
                          <tr key={i} className="hover:bg-[#F7F8FC]">
                            <td className="px-3 py-1.5 font-medium text-[#20243A]">
                              {r.name}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[#635BFF]">
                              {r.normalizedPhone}
                            </td>
                            <td className="px-3 py-1.5 text-[#747B91]">
                              {[r.company, r.city].filter(Boolean).join(" • ") ||
                                "—"}
                            </td>
                            <td className="px-3 py-1.5 text-[#20243A]">
                              {r.budget || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* SECTION D: CALLING SETTINGS                                         */}
        {/* =================================================================== */}
        <section className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-5 shadow-sm">
          <div className="border-b border-[#E8EAF1] pb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#635BFF] text-white text-xs font-bold flex items-center justify-center">
                D
              </span>
              <h2 className="text-base font-bold text-[#20243A]">
                Calling Settings & Schedule
              </h2>
            </div>
            <p className="text-xs text-[#747B91] mt-1 ml-8">
              Configure calling direction, schedule window, timezone, concurrency, and retry attempts.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            {/* Calling Direction */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Calling Direction
              </label>
              <select
                value={form.direction || "outbound"}
                onChange={(e) => setForm({ ...form, direction: e.target.value as any })}
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF]"
              >
                <option value="outbound">Outbound (AI Dials Leads)</option>
                <option value="inbound">Inbound (AI Receives Calls)</option>
              </select>
            </div>

            {/* Calling Mode (Standard vs Demo/Simulation) */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Campaign Execution Mode
              </label>
              <select
                value={form.callMode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    callMode: e.target.value as "standard" | "demo",
                  })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
              >
                <option value="standard">Standard Outbound Calling</option>
                <option value="demo">Dry Run / Validation Only (No Outbound Dialing)</option>
              </select>
            </div>

            {/* Timezone */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Timezone
              </label>
              <select
                value={form.timezone}
                onChange={(e) =>
                  setForm({ ...form, timezone: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Schedule Start Date */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Schedule Start Date
              </label>
              <input
                type="date"
                value={form.scheduleStartDate}
                onChange={(e) =>
                  setForm({ ...form, scheduleStartDate: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
              />
            </div>

            {/* Calling Hours Window */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Daily Window (Start & End)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={form.callingStartHour}
                  onChange={(e) =>
                    setForm({ ...form, callingStartHour: e.target.value })
                  }
                  className="w-1/2 px-2.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
                />
                <span className="text-[#747B91]">—</span>
                <input
                  type="time"
                  value={form.callingEndHour}
                  onChange={(e) =>
                    setForm({ ...form, callingEndHour: e.target.value })
                  }
                  className="w-1/2 px-2.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
                />
              </div>
            </div>

            {/* Maximum Concurrent Calls */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Max Concurrent Calls
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.concurrency}
                onChange={(e) =>
                  setForm({
                    ...form,
                    concurrency: Math.min(
                      20,
                      Math.max(1, Number(e.target.value) || 2)
                    ),
                  })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
              />
            </div>

            {/* Maximum Call Attempts / Retries */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Max Call Attempts (0–5)
              </label>
              <input
                type="number"
                min={0}
                max={5}
                value={form.maxRetries}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxRetries: Math.min(
                      5,
                      Math.max(0, Number(e.target.value) || 0)
                    ),
                  })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
              />
            </div>

            {/* Outbound Caller ID / Phone Number */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Outbound Number / Trunk (Optional)
              </label>
              <select
                value={form.outboundPhoneNumber}
                onChange={(e) =>
                  setForm({ ...form, outboundPhoneNumber: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
              >
                <option value="">IndiaCalling Voice AI Default Route (Auto-selected by IndiaCalling Voice AI)</option>
                {bolnaPhoneNumbers.map((num) => (
                  <option key={num.id} value={num.phone_number}>
                    {num.phone_number} ({num.telephony_provider || "IndiaCalling Voice AI"}){num.friendly_name ? ` — ${num.friendly_name}` : ""}
                  </option>
                ))}
                {configuredPhoneNumbers.map((num) => (
                  <option key={num} value={num}>
                    Configured Number: {num}
                  </option>
                ))}
              </select>
            </div>

            {/* Max Duration */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Max Call Duration (Seconds)
              </label>
              <input
                type="number"
                min={30}
                max={3600}
                step={30}
                value={form.maxCallDurationSeconds}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxCallDurationSeconds: Number(e.target.value) || 300,
                  })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A]"
              />
            </div>
          </div>

          {/* Compliance & Opt-in Consent */}
          <div className="p-3.5 bg-[#EEF0FF] border border-[#C7CBFF] rounded-xl text-xs space-y-1">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.consentConfirmed}
                onChange={(e) =>
                  setForm({ ...form, consentConfirmed: e.target.checked })
                }
                className="mt-0.5 accent-[#635BFF]"
              />
              <span className="text-[#20243A] leading-relaxed">
                <strong>Regulatory & Consent Confirmation:</strong> I confirm that all uploaded contacts have provided opt-in consent to be contacted within permitted calling hours (09:00–21:00 IST).
              </span>
            </label>
          </div>
        </section>

        {/* =================================================================== */}
        {/* SECTION E: ACTIONS (Cancel, Save as Draft, Create Campaign)         */}
        {/* =================================================================== */}
        <section className="bg-white border border-[#E8EAF1] rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/campaigns"
            className="px-4 py-2.5 border border-[#E8EAF1] text-[#747B91] hover:text-[#20243A] rounded-lg text-xs font-semibold hover:bg-[#F7F8FC] transition-colors"
          >
            Cancel
          </Link>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Save as Draft */}
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSubmitCampaign("draft")}
              className="px-4 py-2.5 bg-[#F7F8FC] hover:bg-[#E8EAF1] text-[#20243A] border border-[#E8EAF1] rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
            >
              Save as Draft
            </button>

            {/* Create Campaign (Does not trigger live calls) */}
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50 transition-colors"
            >
              {loading ? "Creating..." : "Create Campaign"}
            </button>

            {/* Optional: Launch Campaign with Explicit Confirmation Modal */}
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                if (!form.name || form.name.trim().length < 2) {
                  setError("Please enter a Campaign Name.");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  return;
                }
                if (!form.agentId) {
                  setError("Please select an AI Voice Agent.");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  return;
                }
                setShowLaunchConfirmModal(true);
              }}
              className="px-5 py-2.5 bg-[#13B8A6] hover:bg-[#0D9488] text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50 transition-colors"
            >
              Launch Campaign
            </button>
          </div>
        </section>
      </form>

      {/* Explicit Launch Confirmation Modal */}
      {showLaunchConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-[#E8EAF1]">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 text-lg">
                🚀
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#20243A]">
                  Confirm Live Campaign Launch
                </h3>
                <p className="text-xs text-[#747B91] mt-1">
                  You are about to create and immediately launch outbound calls for campaign:{" "}
                  <strong className="text-[#20243A]">{form.name}</strong>.
                </p>
              </div>
            </div>

            <div className="p-3 bg-[#F7F8FC] rounded-xl text-xs space-y-1.5 border border-[#E8EAF1]">
              <div className="flex justify-between">
                <span className="text-[#747B91]">Selected Agent:</span>
                <span className="font-semibold text-[#20243A]">
                  {selectedAgent?.name || "AI Agent"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Enrolled Contacts:</span>
                <span className="font-bold text-[#635BFF]">
                  {(validationResult?.validRows.length || 0) +
                    form.selectedLeads.length}{" "}
                  Lead(s)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747B91]">Concurrency:</span>
                <span className="font-semibold text-[#20243A]">
                  {form.concurrency} concurrent channels
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#747B91] leading-relaxed">
              This action will queue and dispatch real voice calls via IndiaCalling Voice AI according to your configured schedule and retry parameters.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowLaunchConfirmModal(false)}
                className="px-4 py-2 border border-[#E8EAF1] text-[#747B91] rounded-lg text-xs font-semibold hover:bg-[#F7F8FC]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSubmitCampaign("launch")}
                className="px-4 py-2 bg-[#13B8A6] hover:bg-[#0D9488] text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50"
              >
                {loading ? "Dispatching..." : "Confirm & Launch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
