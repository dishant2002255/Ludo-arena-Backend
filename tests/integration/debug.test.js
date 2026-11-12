const { connect, disconnect } = require('./helpers/testDb');

beforeAll(async () => {
  await connect();
});

afterAll(async () => {
  await disconnect();
});

test('db connects', () => {
  expect(true).toBe(true);
});
