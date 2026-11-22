const mongoose = require('mongoose');
const os = require('os');

/**
 * Test database helper.
 * Uses a pre-started MongoMemoryServer URI set by globalSetup.js.
 * Each test file connects/disconnects from the shared in-memory instance.
 */
const connect = async () => {
  const uri = process.env.MONGO_TEST_URI;
  if (!uri) throw new Error('MONGO_TEST_URI not set — ensure globalSetup ran');
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      // Driver 7.x loads its `os` runtime adapter via dynamic import(), which
      // fails inside Jest's vm sandbox without --experimental-vm-modules.
      // Without it, the client metadata handshake is malformed and mongod
      // rejects the connection ("Missing required sub-document 'driver'").
      // Providing the adapter explicitly avoids the dynamic import entirely.
      runtimeAdapters: { os },
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
