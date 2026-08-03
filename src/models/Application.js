import mongoose from 'mongoose';

const APPLICATION_STATUSES = [
  'Applied',
  'Review',
  'Shortlisted',
  'Interview',
  'Selected',
  'Rejected',
  'Withdrawn',
];

const interviewSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ['Onsite', 'Online'],
      required: true,
    },
    datetime: { type: Date, required: true },
    location: String,
    meetingLink: String,
    message: String,
  },
  { _id: false }
);

const rescheduleRequestSchema = new mongoose.Schema(
  {
    note: { type: String, required: true },
    requestedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const resumeSchema = new mongoose.Schema(
  {
    name: String,
    url: String,
    mimeType: String,
    size: Number,
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    candidateName: { type: String, required: true, trim: true },
    candidateEmail: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    experience: { type: String, trim: true },
    education: { type: String, trim: true },
    expectedSalary: { type: mongoose.Schema.Types.Mixed },
    linkedin: { type: String, trim: true },
    coverLetter: {
      type: String,
      required: true,
      minlength: [20, 'Cover letter must be at least 20 characters'],
    },
    resume: resumeSchema,
    status: {
      type: String,
      enum: APPLICATION_STATUSES,
      default: 'Applied',
      index: true,
    },
    reviewNote: String,
    interview: { type: interviewSchema, default: null },
    rescheduleRequest: { type: rescheduleRequestSchema, default: null },
  },
  { timestamps: true }
);

/** One active (non-Withdrawn) application per job+candidate; re-apply after Withdrawn allowed */
applicationSchema.index(
  { job: 1, candidate: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: 'Withdrawn' } },
  }
);
applicationSchema.index({ status: 1, createdAt: -1 });
applicationSchema.index({ candidateName: 1, candidateEmail: 1 });

export { APPLICATION_STATUSES };
export default mongoose.model('Application', applicationSchema);
