/**
 * Jest setupFiles for the integration project.
 * Reads the MongoMemoryServer URI written by globalSetup into env.
 */
const fs = require('fs');
const path = require('path');

const TMP_FILE = path.join(__dirname, '.mongo-test-uri');

if (!process.env.MONGO_TEST_URI) {
  try {
    const uri = fs.readFileSync(TMP_FILE, 'utf8').trim();
    if (uri) process.env.MONGO_TEST_URI = uri;
  } catch {
    // globalSetup may not have run (e.g. direct single-file run) — start fresh below
  }
}
