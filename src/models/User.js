import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ALL_ROLES, ROLES } from '../constants/roles.js';

const documentSchema = new mongoose.Schema(
  {
    name: String,
    url: String,
    publicId: String,
    type: String,
  },
  { _id: false }
);

const emergencyContactSchema = new mongoose.Schema(
  {
    name: String,
    relation: String,
    phone: String,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6, select: false },
    role: {
      type: String,
      enum: ALL_ROLES,
      default: ROLES.CANDIDATE,
    },
    phone: String,
    photo: {
      url: String,
      publicId: String,
    },
    // Candidate onboarding / application profile
    education: String,
    experience: String,
    linkedin: String,
    preferredLocation: String,
    expectedSalary: String,
    coverLetter: String,
    skills: { type: [String], default: undefined },
    resume: {
      url: String,
      publicId: String,
      originalName: String,
    },
    profileCompleted: { type: Boolean, default: false },
    profileCompletedAt: Date,
    employeeId: { type: String, unique: true, sparse: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    designation: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zip: String,
    },
    documents: [documentSchema],
    emergencyContacts: [emergencyContactSchema],
    dateOfJoining: Date,
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorToken: String,
    twoFactorExpire: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = async function matchPassword(entered) {
  return bcrypt.compare(entered, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpire;
  delete obj.twoFactorToken;
  delete obj.twoFactorExpire;
  // Legacy candidates created before this field existed
  if (obj.role === ROLES.CANDIDATE && obj.profileCompleted == null) {
    obj.profileCompleted = false;
  }
  return obj;
};

export default mongoose.model('User', userSchema);
