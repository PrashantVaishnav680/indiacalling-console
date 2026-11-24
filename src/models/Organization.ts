import mongoose, { Document, Schema, Model } from "mongoose";

export interface IOrganizationInvoiceSubdoc {
  id: string;
  invoiceNumber: string;
  periodLabel: string;
  amountInr: number;
  minutesBilled: number;
  status: "paid" | "due" | "pending";
  issuedAt: string;
  paidAt?: string;
  type: "usage" | "topup" | "plan";
  description?: string;
}

export interface IOrganizationDoc extends Document {
  name: string;
  slug: string;
  email: string;
  phone?: string;
  address?: string;
  industry?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  status: "active" | "suspended" | "pending" | "inactive";
  settings: {
    callingHours?: {
      start: string;
      end: string;
      timezone: string;
    };
    maxConcurrentCalls?: number;
    maxAgents?: number;
    monthlyCallLimit?: number;
    defaultLanguage?: string;
    webhookUrl?: string;
  };
  billing?: {
    planName?: string;
    balanceInr?: number;
    ratePerMinuteInr?: number;
    unbilledInr?: number;
    dueInr?: number;
    invoices?: IOrganizationInvoiceSubdoc[];
  };
  managedServiceAccess?: {
    enabled: boolean;
    grantedAt?: Date | string | null;
    grantedBy?: string | null;
    planLabel?: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationInvoiceSchema = new Schema<IOrganizationInvoiceSubdoc>(
  {
    id: { type: String, required: true },
    invoiceNumber: { type: String, required: true },
    periodLabel: { type: String, required: true },
    amountInr: { type: Number, default: 0 },
    minutesBilled: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["paid", "due", "pending"],
      default: "paid",
    },
    issuedAt: { type: String, required: true },
    paidAt: { type: String },
    type: {
      type: String,
      enum: ["usage", "topup", "plan"],
      default: "usage",
    },
    description: { type: String },
  },
  { _id: false }
);

const OrganizationSchema = new Schema<IOrganizationDoc>(
  {
    _id: { type: Schema.Types.Mixed },
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String },
    industry: { type: String, default: "General Business" },
    ownerName: { type: String, trim: true },
    ownerEmail: { type: String, lowercase: true, trim: true },
    ownerPhone: { type: String, trim: true },
    status: {
      type: String,
      enum: ["active", "suspended", "pending", "inactive"],
      default: "active",
    },
    settings: {
      callingHours: {
        start: { type: String, default: "09:30" },
        end: { type: String, default: "18:30" },
        timezone: { type: String, default: "Asia/Kolkata" },
      },
      maxConcurrentCalls: { type: Number, default: 10 },
      maxAgents: { type: Number, default: 25 },
      monthlyCallLimit: { type: Number, default: 10000 },
      defaultLanguage: { type: String, default: "English + Hindi" },
      webhookUrl: { type: String },
    },
    billing: {
      planName: { type: String, default: "Growth Pay-As-You-Go" },
      balanceInr: { type: Number, default: 2500 },
      ratePerMinuteInr: { type: Number, default: 6 },
      unbilledInr: { type: Number, default: 0 },
      dueInr: { type: Number, default: 0 },
      invoices: [OrganizationInvoiceSchema],
    },
    managedServiceAccess: {
      enabled: { type: Boolean, default: false },
      grantedAt: { type: Date, default: null },
      grantedBy: { type: String, default: null },
      planLabel: { type: String, default: "Managed Service Plan" },
    },
  },
  { timestamps: true }
);

OrganizationSchema.index({ status: 1 });

if (mongoose.models.Organization) {
  delete (mongoose.models as any).Organization;
}

const Organization: Model<IOrganizationDoc> = mongoose.model<IOrganizationDoc>(
  "Organization",
  OrganizationSchema
);

export default Organization;
