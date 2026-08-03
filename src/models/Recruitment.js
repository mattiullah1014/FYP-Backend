/**
 * Legacy interview feedback models (separate from Application.interview embed).
 * Job / Application live in models/Job.js and models/Application.js.
 */
import mongoose from 'mongoose';

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
      enum: ['in-person', 'online', 'phone', 'Onsite', 'Online'],
      default: 'Onsite',
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

export const Interview = mongoose.model('Interview', interviewSchema);
export const InterviewFeedback = mongoose.model(
  'InterviewFeedback',
  interviewFeedbackSchema
);

// Re-exports for any legacy imports
export { default as Job } from './Job.js';
export { default as Application } from './Application.js';
export { default as JobPosting } from './Job.js';
