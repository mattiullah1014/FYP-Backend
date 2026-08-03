import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ALL_ROLES, ROLES } from '../constants/roles.js';

export const CANDIDATE_GENDERS = [
  'Male',
  'Female',
  'Other',
  'Prefer not to say',
];

const documentSchema = new mongoose.Schema(
  {
    name: String,
    url: String,
    publicId: String,
    type: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const emergencyContactSchema = new mongoose.Schema(
  {
    name: String,
    relation: String,
    phone: String,
  },
  { _id: false }
);

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

const personalInfoSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true },
    phone: { type: String, trim: true },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: CANDIDATE_GENDERS,
    },
    cnic: { type: String, trim: true },
    address: addressSchema,
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
    /** Candidate setup — personal information only */
    candidateProfile: {
      personalInfo: personalInfoSchema,
      isProfileComplete: { type: Boolean, default: false },
      avatar: String,
      avatarUrl: String,
    },
    /** Top-level avatar mirrors candidateProfile for convenience */
    avatar: String,
    avatarUrl: String,
    // Legacy job-application fields (optional; collected on POST /applications)
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
    /** Synced with candidateProfile.isProfileComplete for candidates */
    profileCompleted: { type: Boolean, default: false },
    profileCompletedAt: Date,
    employeeId: { type: String, unique: true, sparse: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    designation: String,
    address: addressSchema,
    dateOfBirth: Date,
    gender: String,
    cnic: String,
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
  if (obj.role === ROLES.CANDIDATE && obj.profileCompleted == null) {
    obj.profileCompleted = false;
  }
  if (obj.role === ROLES.CANDIDATE) {
    const complete =
      obj.candidateProfile?.isProfileComplete ?? obj.profileCompleted ?? false;
    obj.profileCompleted = complete;
    if (!obj.candidateProfile) {
      obj.candidateProfile = { personalInfo: {}, isProfileComplete: complete };
    } else if (obj.candidateProfile.isProfileComplete == null) {
      obj.candidateProfile.isProfileComplete = complete;
    }
  }
  return obj;
};

export default mongoose.model('User', userSchema);
