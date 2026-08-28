const Message = require('./message.model');
const User = require('../users/user.model');
const HttpError = require('../../shared/httpError');
const { ROLES } = require('../../shared/constants');

async function sendMessage({ senderId, recipientIds, subject, body, important }) {
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
    throw new HttpError(400, 'Debes indicar al menos un destinatario');
  }
  if (!body || !body.trim()) {
    throw new HttpError(400, 'El mensaje no puede estar vacío');
  }

  const uniqueIds = Array.from(new Set(recipientIds.map(String)));
  const recipients = await User.find({ _id: { $in: uniqueIds }, role: ROLES.DRIVER });
  if (recipients.length !== uniqueIds.length) {
    throw new HttpError(400, 'Uno o más destinatarios no son choferes válidos');
  }

  const message = await Message.create({
    sender: senderId,
    recipients: uniqueIds,
    subject: (subject || '').trim(),
    body: body.trim(),
    important: Boolean(important),
    readBy: [],
  });

  return getMessageById(message._id);
}

function withReadState(doc, driverId) {
  const obj = doc.toObject ? doc.toObject() : doc;
  if (driverId) {
    obj.isRead = obj.readBy.some((r) => String(r.driver?._id || r.driver) === String(driverId));
  }
  return obj;
}

async function listInboxForDriver(driverId) {
  const messages = await Message.find({ recipients: driverId })
    .sort({ createdAt: -1 })
    .populate('sender', 'name email');

  return messages.map((m) => withReadState(m, driverId));
}

async function listAllMessages() {
  return Message.find({})
    .sort({ createdAt: -1 })
    .populate('sender', 'name email')
    .populate('recipients', 'name email')
    .populate('readBy.driver', 'name email');
}

async function loadMessageOrFail(id) {
  const message = await Message.findById(id)
    .populate('sender', 'name email')
    .populate('recipients', 'name email')
    .populate('readBy.driver', 'name email');

  if (!message) {
    throw new HttpError(404, 'Mensaje no encontrado');
  }
  return message;
}

async function getMessageById(id, requestingUser) {
  const message = await loadMessageOrFail(id);

  if (requestingUser?.role === ROLES.DRIVER) {
    const isRecipient = message.recipients.some((r) => String(r._id) === String(requestingUser.id));
    if (!isRecipient) {
      throw new HttpError(403, 'No tienes permiso para ver este mensaje');
    }
    return withReadState(message, requestingUser.id);
  }

  return withReadState(message, null);
}

// Idempotent: reading an already-read message just returns it unchanged.
async function markRead(id, driverId) {
  const message = await Message.findById(id);
  if (!message) {
    throw new HttpError(404, 'Mensaje no encontrado');
  }

  const isRecipient = message.recipients.some((r) => String(r) === String(driverId));
  if (!isRecipient) {
    throw new HttpError(403, 'No tienes permiso para marcar este mensaje');
  }

  const alreadyRead = message.readBy.some((r) => String(r.driver) === String(driverId));
  if (!alreadyRead) {
    message.readBy.push({ driver: driverId, readAt: new Date() });
    await message.save();
  }

  return getMessageById(id, { id: driverId, role: ROLES.DRIVER });
}

module.exports = {
  sendMessage,
  listInboxForDriver,
  listAllMessages,
  getMessageById,
  markRead,
};
