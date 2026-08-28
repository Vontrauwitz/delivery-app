const service = require('./messaging.service');

async function send(req, res, next) {
  try {
    const message = await service.sendMessage({
      senderId: req.user.id,
      recipientIds: req.body.recipients,
      subject: req.body.subject,
      body: req.body.body,
      important: req.body.important,
    });
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

async function inbox(req, res, next) {
  try {
    res.json(await service.listInboxForDriver(req.user.id));
  } catch (err) {
    next(err);
  }
}

async function listAll(req, res, next) {
  try {
    res.json(await service.listAllMessages());
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    res.json(await service.getMessageById(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    res.json(await service.markRead(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

module.exports = { send, inbox, listAll, getById, markRead };
