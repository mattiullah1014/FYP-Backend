import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['success', 'info', 'warning', 'error'],
      default: 'info',
    },
    /** email | log | system */
    channel: { type: String, default: 'email' },
    subject: { type: String, default: '' },
    emailTo: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed },
    isRead: { type: Boolean, default: false, index: true },
    readAt: Date,
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
