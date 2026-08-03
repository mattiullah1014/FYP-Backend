import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    street: String,
    city: String,
    state: String,
    zip: String,
    country: String,
  },
  { _id: false }
);

const emergencyContactSchema = new mongoose.Schema(
  {
    name: String,
    phone: String,
    relation: String,
  },
  { _id: false }
);

const bankSchema = new mongoose.Schema(
  {
    bankName: String,
    accountNumber: String,
    iban: String,
  },
  { _id: false }
);

const assetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    tag: { type: String, trim: true },
    status: { type: String, default: 'Assigned', trim: true },
    assignedOn: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const documentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, default: 'document', trim: true },
    url: String,
    publicId: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const employeeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    empId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: String,
    designation: { type: String, trim: true },
    department: { type: String, trim: true },
    branch: { type: String, trim: true },
    role: { type: String, trim: true },
    manager: { type: String, trim: true },
    salary: { type: Number, min: 0 },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
    },
    cnic: { type: String, trim: true },
    address: addressSchema,
    emergencyContact: emergencyContactSchema,
    bank: bankSchema,
    assets: { type: [assetSchema], default: [] },
    documents: { type: [documentSchema], default: [] },
    joinedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Deleted'],
      default: 'Active',
    },
    isActive: { type: Boolean, default: true },
    fromApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
    },
  },
  { timestamps: true }
);

employeeSchema.index({ name: 'text', email: 'text', empId: 'text' });
employeeSchema.index({ department: 1, status: 1 });

const Employee = mongoose.model('Employee', employeeSchema);

/**
 * Generate next EMP001-style id from existing Employee records.
 */
export const generateEmpId = async (session = null) => {
  const query = Employee.findOne().sort({ empId: -1 }).select('empId');
  if (session) query.session(session);
  const latest = await query.lean();

  let next = 1;
  if (latest?.empId) {
    const match = String(latest.empId).match(/(\d+)$/);
    if (match) next = Number(match[1]) + 1;
  }
  return `EMP${String(next).padStart(3, '0')}`;
};

export default Employee;
