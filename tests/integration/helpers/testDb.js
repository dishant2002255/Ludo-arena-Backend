/**
 * Test database helper.
 * Uses a pre-started MongoMemoryServer URI set by globalSetup.js.
 * Each test file connects/disconnects from the shared in-memory instance.
 */
const mongoose = require('mongoose');

const connect = async () => {
  const uri = process.env.MONGO_TEST_URI;
  if (!uri) throw new Error('MONGO_TEST_URI not set — ensure globalSetup ran');

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
  }
};

const disconnect = async () => {
  try {
    await mongoose.connection.dropDatabase();
  } catch {}
  // Don't close — shared across test files; globalTeardown stops the server
};

const clearCollections = async () => {
  if (mongoose.connection.readyState !== 1) return;
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map(col => col.deleteMany({}).catch(() => {}))
  );
};

module.exports = { connect, disconnect, clearCollections };
