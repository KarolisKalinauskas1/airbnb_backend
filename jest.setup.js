// Set Jest timeout
jest.setTimeout(30000);

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Global test environment setup
process.env.NODE_ENV = 'test';
