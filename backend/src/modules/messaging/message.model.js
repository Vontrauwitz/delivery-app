const mongoose = require('mongoose');

const readReceiptSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipients: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: (v) => Array.isArray(v) && v.length > 0,
    },
    subject: { type: String, default: '' },
    body: { type: String, required: true },
    // Optional manager-set flag for something that shouldn't wait to be read — purely a display
    // hint (see frontend), never changes delivery/read behavior.
    important: { type: Boolean, default: false },
    // One entry per recipient once they open it — never removed, "read" is permanent history.
    readBy: { type: [readReceiptSchema], default: [] },
  },
  { timestamps: true }
);

messageSchema.index({ recipients: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });

module.exports = mongoose.model('Message', messageSchema);
