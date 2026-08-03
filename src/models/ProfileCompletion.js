import mongoose from 'mongoose';

/**
 * Tracks profile completion sections for employees and managers.
 */
const profileCompletionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    personalInfoComplete: { type: Boolean, default: false },
    documentsComplete: { type: Boolean, default: false },
    emergencyContactComplete: { type: Boolean, default: false },
    bankDetailsComplete: { type: Boolean, default: false },
    bankDetails: {
      accountTitle: String,
      bankName: String,
      accountNumber: String,
      iban: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model('ProfileCompletion', profileCompletionSchema);
