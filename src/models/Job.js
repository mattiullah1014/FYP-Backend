import mongoose from 'mongoose';

const JOB_DEPARTMENTS = [
  'Engineering',
  'Developer',
  'Manager',
  'Design',
  'Product',
  'HR',
  'Finance',
  'Marketing',
];

const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'];

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, default: 'Brilliance Base', trim: true },
    department: {
      type: String,
      required: true,
      enum: JOB_DEPARTMENTS,
    },
    location: { type: String, required: true, trim: true },
    types: {
      type: [{ type: String, enum: JOB_TYPES }],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: 'At least one employment type is required',
      },
    },
    salaryMin: { type: Number, min: 0 },
    salaryMax: { type: Number, min: 0 },
    currency: { type: String, default: 'USD', trim: true },
    description: {
      type: String,
      required: true,
      minlength: [30, 'Description must be at least 30 characters'],
    },
    requirements: {
      type: [String],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: 'At least one requirement is required',
      },
    },
    skills: { type: [String], default: [] },
    closesAt: Date,
    branch: { type: String, trim: true },
    status: {
      type: String,
      enum: ['Active', 'Closed'],
      default: 'Active',
      index: true,
    },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ title: 'text', description: 'text' });

export { JOB_DEPARTMENTS, JOB_TYPES };
export default mongoose.model('Job', jobSchema);
