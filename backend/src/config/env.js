require('dotenv').config();

const env = {
  port: process.env.PORT || 4000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/delivery-app',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Set only by test/runTests.js's throwaway server spawn — never by a developer directly, and
  // never true for a normal `npm run dev`/`npm start` process. Gates the test-only identity
  // route in app.js (see the comment there) so it never exists on a real dev/prod server.
  isTestMode: process.env.TEST_MODE === 'true',
};

module.exports = env;
