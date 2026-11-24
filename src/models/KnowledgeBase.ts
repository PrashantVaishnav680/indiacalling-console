import mongoose, { Document, Schema, Model } from "mongoose";

export interface IKnowledgeDocumentSubdoc {
  _id: string;
  fileName: string;
  fileType: "pdf" | "txt" | "docx" | "csv";
  fileSizeBytes: number;
  extractedText: string;
  chunks: string[];
  rowCount?: number;
  processingStatus: "uploaded" | "processing" | "ready" | "failed";
  errorMessage?: string;
  uploadedAt: Date;
}

export interface IKnowledgeBaseDoc extends Document {
  organizationId: any;
  name: string;
  description?: string;
  category: string;
  languageSupport?: string;
  sourceType?: "pdf" | "url" | "manual";
  sourceUrl?: string;
  status: "active" | "inactive";
  processingStatus: "uploaded" | "processing" | "ready" | "failed";
  documents: IKnowledgeDocumentSubdoc[];
  documentCount: number;
  totalChunks: number;
  associatedAgentIds: string[];
  bolnaRagId?: string;
  bolnaSyncStatus?: "synced" | "pending" | "syncing" | "failed" | "needs_attention";
  bolnaSyncError?: string | null;
  lastSyncedAt?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeDocumentSchema = new Schema<IKnowledgeDocumentSubdoc>(
  {
    _id: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: {
      type: String,
      enum: ["pdf", "txt", "docx", "csv"],
      required: true,
    },
    fileSizeBytes: { type: Number, default: 0 },
    extractedText: { type: String, default: "" },
    chunks: [{ type: String }],
    rowCount: { type: Number, default: 0 },
    processingStatus: {
      type: String,
      enum: ["uploaded", "processing", "ready", "failed"],
      default: "ready",
    },
    errorMessage: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const KnowledgeBaseSchema = new Schema<IKnowledgeBaseDoc>(
  {
    organizationId: { type: Schema.Types.Mixed, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: {
      type: String,
      default: "Company Information",
      index: true,
    },
    languageSupport: { type: String, default: "English (Default)" },
    sourceType: {
      type: String,
      enum: ["pdf", "url", "manual"],
      default: "pdf",
    },
    sourceUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    processingStatus: {
      type: String,
      enum: ["uploaded", "processing", "ready", "failed"],
      default: "ready",
    },
    documents: [KnowledgeDocumentSchema],
    documentCount: { type: Number, default: 0 },
    totalChunks: { type: Number, default: 0 },
    associatedAgentIds: [{ type: String }],
    bolnaRagId: { type: String, index: true },
    bolnaSyncStatus: {
      type: String,
      enum: ["synced", "pending", "syncing", "failed", "needs_attention"],
      default: "pending",
    },
    bolnaSyncError: { type: String, default: null },
    lastSyncedAt: { type: Date },
    createdBy: { type: String },
  },
  { timestamps: true }
);

KnowledgeBaseSchema.index({ organizationId: 1, status: 1 });

if (mongoose.models.KnowledgeBase) {
  delete (mongoose.models as any).KnowledgeBase;
}

const KnowledgeBase: Model<IKnowledgeBaseDoc> =
  mongoose.model<IKnowledgeBaseDoc>("KnowledgeBase", KnowledgeBaseSchema);

export default KnowledgeBase;
