class HttpError extends Error {
  // `details` is optional, structured extra data for a response the client needs to branch on
  // programmatically (e.g. a blocked-delete conflict's machine-readable code) rather than
  // string-matching the human `message` — see errorHandler, which spreads it into the JSON body
  // only when present, so every existing caller that only ever passed (statusCode, message) is
  // unaffected.
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    if (details) this.details = details;
  }
}

module.exports = HttpError;
