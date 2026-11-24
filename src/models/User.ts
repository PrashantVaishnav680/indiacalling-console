import mongoose, { Document, Schema, Model } from "mongoose";

export type TeamDepartment =
  | "Sales"
  | "Support"
  | "Operations"
  | "Admin"
  | "Engineering";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role:
    | "super_admin"
    | "organization"
    | "client_admin"
    | "sales_manager"
    | "sales_rep"
    | "salesperson";
  organizationId?: mongoose.Types.ObjectId | string;
  department?: TeamDepartment | string;
  title?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    _id: { type: Schema.Types.Mixed },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: [
        "super_admin",
        "organization",
        "client_admin",
        "sales_manager",
        "sales_rep",
        "salesperson",
      ],
      default: "organization",
      required: true,
    },
    organizationId: { type: Schema.Types.Mixed, index: true },
    department: { type: String, trim: true, default: "Operations" },
    title: { type: String, trim: true, default: "Team Member" },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

if (mongoose.models.User) {
  delete (mongoose.models as any).User;
}

const User: Model<IUser> = mongoose.model<IUser>("User", UserSchema);

export default User;
