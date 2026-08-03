import mongoose from 'mongoose';

/**
 * Employee Loan / Salary Advance requests.
 * Flow: Employee submit → HR Approval Center → approved | rejected
 * Approved loans feed payroll installment schedule later.
 */
const loanAdvanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    empId: { type: String, index: true },
    employeeName: { type: String, default: '' },
    type: {
      type: String,
      enum: ['loan', 'advance'],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'PKR' },
    reason: { type: String, required: true, trim: true },
    /** Loan installment months; advance defaults to 1 */
    installments: { type: Number, default: 1, min: 1, max: 60 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNote: { type: String, default: '' },
    reviewedAt: Date,
  },
  { timestamps: true }
);

loanAdvanceSchema.index({ type: 1, status: 1, createdAt: -1 });

export default mongoose.model('LoanAdvanceRequest', loanAdvanceSchema);
