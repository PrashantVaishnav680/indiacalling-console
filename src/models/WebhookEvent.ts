import mongoose, { Document, Schema, Model } from "mongoose";

export interface IWebhookEventDoc extends Document {
  eventId: string;
  source: string;
  eventType: string;
  payload: Record<string, any>;
  processed: boolean;
  processedAt?: Date;
  error?: string;
  createdAt: Date;
}

const WebhookEventSchema = new Schema<IWebhookEventDoc>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    source: { type: String, default: "bolna" },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    processed: { type: Boolean, default: false, index: true },
    processedAt: { type: Date },
    error: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const WebhookEvent: Model<IWebhookEventDoc> =
  mongoose.models.WebhookEvent || mongoose.model<IWebhookEventDoc>("WebhookEvent", WebhookEventSchema);

export default WebhookEvent;

