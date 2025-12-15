const { mockHelpers } = require('../__mocks__/@forge/api');

// Global test setup
beforeEach(() => {
  // Reset all mocks before each test
  mockHelpers.resetMocks();
  
  // Clear console to avoid noise in tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  // Restore console after each test
  console.log.mockRestore?.();
  console.error.mockRestore?.();
  console.warn.mockRestore?.();
});