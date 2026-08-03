import mongoose from 'mongoose';

export const MANAGER_PERMISSION_KEYS = [
  'teamManagement',
  'approvals',
  'performance',
  'tasks',
  'reports',
  'communication',
];

const defaultPermissions = () =>
  Object.fromEntries(MANAGER_PERMISSION_KEYS.map((k) => [k, false]));

const managerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    title: { type: String, trim: true },
    department: { type: String, trim: true },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    permissions: {
      teamManagement: { type: Boolean, default: true },
      approvals: { type: Boolean, default: true },
      performance: { type: Boolean, default: true },
      tasks: { type: Boolean, default: true },
      reports: { type: Boolean, default: true },
      communication: { type: Boolean, default: true },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

managerProfileSchema.statics.defaultPermissions = defaultPermissions;

export default mongoose.model('ManagerProfile', managerProfileSchema);
