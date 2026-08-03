import mongoose from 'mongoose';

const assignmentSchema = new mongoose.Schema(
  {
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // indexed via partial unique index below (one primary per employee)
    },
    relationshipType: {
      type: String,
      enum: ['primary', 'secondary'],
      default: 'secondary',
      index: true,
    },
  },
  { timestamps: true }
);

assignmentSchema.index({ manager: 1, employee: 1 }, { unique: true });
/** At most one primary manager per employee */
assignmentSchema.index(
  { employee: 1 },
  {
    unique: true,
    partialFilterExpression: { relationshipType: 'primary' },
  }
);

export default mongoose.model('ManagerEmployeeAssignment', assignmentSchema);
