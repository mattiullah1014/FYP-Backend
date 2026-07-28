import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    audience: {
      type: String,
      enum: ['all', 'department', 'team'],
      default: 'all',
    },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isPinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: String,
    body: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    readAt: Date,
  },
  { timestamps: true }
);

export const Announcement = mongoose.model('Announcement', announcementSchema);
export const Message = mongoose.model('Message', messageSchema);
