/**
 * Jest test setup configuration
 */

// Global test setup
beforeAll(async () => {
  // Setup test environment
  process.env['NODE_ENV'] = 'test';
  process.env['DB_HOST'] = 'localhost';
  process.env['DB_PORT'] = '5432';
  process.env['DB_NAME'] = 'seraphc2_test';
  process.env['DB_USER'] = 'seraphc2_test';
  process.env['DB_PASSWORD'] = 'test_password';
  process.env['REDIS_HOST'] = 'localhost';
  process.env['REDIS_PORT'] = '6379';
  process.env['JWT_SECRET'] = 'test_jwt_secret_key_for_testing_32chars';
  process.env['ENCRYPTION_KEY'] = 'test_encryption_key_for_testing_32chars';
  process.env['LOG_LEVEL'] = 'error'; // Reduce log noise in tests
});

afterAll(async () => {
  // Cleanup after all tests
});

// Global test configuration
jest.setTimeout(30000); // 30 second timeout for tests
