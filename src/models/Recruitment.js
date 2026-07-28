import mongoose from 'mongoose';

const jobPostingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    description: { type: String, required: true },
    requirements: [String],
    employmentType: {
      type: String,
      enum: ['full-time', 'part-time', 'contract', 'internship'],
      default: 'full-time',
    },
    location: String,
    salaryRange: {
      min: Number,
      max: Number,
      currency: { type: String, default: 'PKR' },
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'closed'],
      default: 'active',
    },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closesAt: Date,
  },
  { timestamps: true }
);

const applicationSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobPosting',
      required: true,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    coverLetter: String,
    resume: {
      url: String,
      publicId: String,
    },
    status: {
      type: String,
      enum: ['applied', 'shortlisted', 'interview', 'hired', 'rejected'],
      default: 'applied',
    },
    notes: String,
  },
  { timestamps: true }
);

applicationSchema.index({ job: 1, candidate: 1 }, { unique: true });

const interviewSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
    },
    scheduledAt: { type: Date, required: true },
    mode: {
      type: String,
      enum: ['in-person', 'online', 'phone'],
      default: 'in-person',
    },
    location: String,
    interviewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'],
      default: 'scheduled',
    },
    notes: String,
  },
  { timestamps: true }
);

const interviewFeedbackSchema = new mongoose.Schema(
  {
    interview: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interview',
      required: true,
    },
    interviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    score: { type: Number, min: 1, max: 10, required: true },
    comments: String,
    recommendation: {
      type: String,
      enum: ['strong-hire', 'hire', 'no-hire', 'strong-no-hire'],
      required: true,
    },
  },
  { timestamps: true }
);

interviewFeedbackSchema.index({ interview: 1, interviewer: 1 }, { unique: true });

export const JobPosting = mongoose.model('JobPosting', jobPostingSchema);
export const Application = mongoose.model('Application', applicationSchema);
export const Interview = mongoose.model('Interview', interviewSchema);
export const InterviewFeedback = mongoose.model(
  'InterviewFeedback',
  interviewFeedbackSchema
);
