import mongoose from 'mongoose';

const salaryStructureSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    basic: { type: Number, required: true, min: 0 },
    allowances: {
      housing: { type: Number, default: 0 },
      transport: { type: Number, default: 0 },
      medical: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
    deductions: {
      tax: { type: Number, default: 0 },
      providentFund: { type: Number, default: 0 },
      loan: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
    currency: { type: String, default: 'PKR' },
    effectiveFrom: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const payrollRunSchema = new mongoose.Schema(
  {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    status: {
      type: String,
      enum: ['draft', 'processed', 'paid'],
      default: 'draft',
    },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    processedAt: Date,
    notes: String,
  },
  { timestamps: true }
);

payrollRunSchema.index({ month: 1, year: 1 }, { unique: true });

const payslipSchema = new mongoose.Schema(
  {
    payrollRun: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PayrollRun',
      required: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    month: Number,
    year: Number,
    basic: Number,
    allowancesTotal: Number,
    deductionsTotal: Number,
    bonus: { type: Number, default: 0 },
    netSalary: Number,
    breakdown: mongoose.Schema.Types.Mixed,
    pdfUrl: String,
    pdfPublicId: String,
  },
  { timestamps: true }
);

payslipSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

export const SalaryStructure = mongoose.model('SalaryStructure', salaryStructureSchema);
export const PayrollRun = mongoose.model('PayrollRun', payrollRunSchema);
export const Payslip = mongoose.model('Payslip', payslipSchema);
