import mongoose, { Document, Schema, Model } from "mongoose";

export interface IOrganizationMembershipDoc extends Document {
  organizationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: "super_admin" | "client_admin" | "salesperson";
  status: "active" | "invited" | "suspended";
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationMembershipSchema = new Schema<IOrganizationMembershipDoc>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["super_admin", "client_admin", "salesperson"],
      required: true,
      default: "salesperson",
    },
    status: {
      type: String,
      enum: ["active", "invited", "suspended"],
      default: "active",
    },
  },
  { timestamps: true }
);

OrganizationMembershipSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true }
);

const OrganizationMembership: Model<IOrganizationMembershipDoc> =
  mongoose.models.OrganizationMembership ||
  mongoose.model<IOrganizationMembershipDoc>(
    "OrganizationMembership",
    OrganizationMembershipSchema
  );

export default OrganizationMembership;
