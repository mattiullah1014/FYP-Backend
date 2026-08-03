import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: { type: String, required: true },
    description: String,
    framework: { type: String, enum: ['okr', 'kpi'], default: 'kpi' },
    targetValue: Number,
    currentValue: { type: Number, default: 0 },
    unit: String,
    dueDate: Date,
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
  },
  { timestamps: true }
);

const performanceReviewSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /** Alias for manager portal (same as reviewer when manager creates) */
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    period: { type: String, required: true },
    selfAssessment: String,
    managerComments: String,
    feedback: String,
    rating: { type: Number, min: 1, max: 5 },
    kpis: [
      {
        name: String,
        target: String,
        actual: String,
      },
    ],
    promotionRecommendation: {
      type: String,
      enum: ['none', 'promote', 'demote'],
      default: 'none',
    },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'completed'],
      default: 'draft',
    },
  },
  { timestamps: true }
);

export const Goal = mongoose.model('Goal', goalSchema);
export const PerformanceReview = mongoose.model(
  'PerformanceReview',
  performanceReviewSchema
);
