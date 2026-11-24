import mongoose, { Document, Schema, Model } from "mongoose";

export interface ILeadAssignmentDoc extends Document {
  organizationId: mongoose.Types.ObjectId;
  leadId: mongoose.Types.ObjectId;
  salespersonId: mongoose.Types.ObjectId;
  assignedBy: mongoose.Types.ObjectId;
  assignmentMethod: "round_robin" | "least_assigned" | "manual" | "availability";
  status: "pending" | "accepted" | "completed" | "cancelled";
  assignedAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeadAssignmentSchema = new Schema<ILeadAssignmentDoc>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    salespersonId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignmentMethod: {
      type: String,
      enum: ["round_robin", "least_assigned", "manual", "availability"],
      default: "manual",
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "completed", "cancelled"],
      default: "pending",
      index: true,
    },
    assignedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date },
    completedAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

const LeadAssignment: Model<ILeadAssignmentDoc> =
  mongoose.models.LeadAssignment ||
  mongoose.model<ILeadAssignmentDoc>("LeadAssignment", LeadAssignmentSchema);

export default LeadAssignment;

