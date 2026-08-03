import mongoose from 'mongoose';

export const POLICY_CATEGORIES = [
  'General',
  'Attendance',
  'Leave',
  'Conduct',
  'IT & Security',
  'Payroll',
];

const companyPolicySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    category: {
      type: String,
      trim: true,
      default: 'General',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
  },
  { timestamps: true }
);

companyPolicySchema.index({ updatedAt: -1 });
companyPolicySchema.index({ isDeleted: 1, updatedAt: -1 });

export default mongoose.model('CompanyPolicy', companyPolicySchema);
