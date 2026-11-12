/**
 * Jest globalSetup — starts MongoMemoryServer ONCE before all test workers.
 * Writes the URI to a temp file so workers can read it.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

const TMP_FILE = path.join(__dirname, '.mongo-test-uri');

module.exports = async function () {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // Persist URI for workers to read
  fs.writeFileSync(TMP_FILE, uri, 'utf8');

  // Keep reference so globalTeardown can stop it
  global.__MONGOD__ = mongod;
};
