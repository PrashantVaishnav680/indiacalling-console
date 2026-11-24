import mongoose, { Document, Schema, Model } from "mongoose";

export interface IPlatformSettingsDoc extends Document {
  key: string;
  defaultRatePerMinuteInr: number;
  businessProRateInr: number;
  enterpriseRateInr: number;
  gstPercent: number;
  upiId: string;
  supportEmail: string;
  defaultWelcomeBalanceInr: number;
  zeroPiiEnforced: boolean;
  maintenanceMode: boolean;
  updatedBy?: string;
  updatedAt: Date;
}

const PlatformSettingsSchema = new Schema<IPlatformSettingsDoc>(
  {
    key: { type: String, default: "global_platform_settings", unique: true },
    defaultRatePerMinuteInr: { type: Number, default: 6 },
    businessProRateInr: { type: Number, default: 5.4 },
    enterpriseRateInr: { type: Number, default: 4.8 },
    gstPercent: { type: Number, default: 18 },
    upiId: { type: String, default: "payments@indiacalling" },
    supportEmail: { type: String, default: "support@indiacalling.ai" },
    defaultWelcomeBalanceInr: { type: Number, default: 1000 },
    zeroPiiEnforced: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

const PlatformSettings: Model<IPlatformSettingsDoc> =
  mongoose.models.PlatformSettings ||
  mongoose.model<IPlatformSettingsDoc>("PlatformSettings", PlatformSettingsSchema);

export default PlatformSettings;
