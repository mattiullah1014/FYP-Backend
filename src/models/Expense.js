import mongoose from 'mongoose';

const expenseClaimSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    category: {
      type: String,
      enum: ['travel', 'meal', 'equipment', 'training', 'other'],
      default: 'other',
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'PKR' },
    description: String,
    expenseDate: { type: Date, required: true },
    receipt: {
      url: String,
      publicId: String,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'reimbursed'],
      default: 'pending',
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNote: String,
    isHighValue: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('ExpenseClaim', expenseClaimSchema);
