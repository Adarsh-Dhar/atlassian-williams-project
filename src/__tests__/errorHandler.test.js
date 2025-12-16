const fc = require('fast-check');
const {
  handleApiError,
  handle403Error,
  logError,
  validateInput,
  withErrorHandling,
  formatErrorMessage,
  isRetryableError,
  generateErrorId,
  LOG_LEVELS,
  ERROR_TYPES
} = require('../utils/errorHandler');
const { ApiError } = require('../models');

/**
 * Error Handler Tests
 * Validates: Requirements 3.4, 4.4, 4.5
 */
describe('Error Handler', () => {

  beforeEach(() => {
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods
    console.error.mockRestore?.();
    console.warn.mockRestore?.();
    console.info.mockRestore?.();
    console.log.mockRestore?.();
  });

  describe('API Error Handling', () => {
    /**
     * Feature: legacy-keeper, Property 7: Graceful error handling for API failures
     * Validates: Requirements 3.4, 4.4
     */
    test('property: graceful error handling for API failures', () => {
      fc.assert(
        fc.property(
          fc.record({
            message: fc.string({ minLength: 1 }),
            code: fc.option(fc.string()),
            name: fc.option(fc.string()),
            context: fc.string({ minLength: 1 })
          }),
          (errorData) => {
            const error = new Error(errorData.message);
            if (errorData.code) error.code = errorData.code;
            if (errorData.name) error.name = errorData.name;

            const result = handleApiError(error, errorData.context);
            
            // Property: For any API error, handling should be graceful
            expect(result).toBeDefined();
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            expect(result.errorId).toBeDefined();
            expect(result.errorType).toBeDefined();
            expect(result.timestamp).toBeDefined();
            
            // Should not expose sensitive information
            expect(result.error).not.toContain('stack');
            expect(result.error).not.toContain('Error:');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should handle 403 errors without exposing sensitive information', () => {
      const error = new Error('403 Forbidden - Access denied to sensitive resource');
      const result = handleApiError(error, 'Test Context');
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ERROR_TYPES.PERMISSION_DENIED);
      expect(result.error).toContain('Permission denied');
      expect(result.error).not.toContain('sensitive resource');
      expect(result.errorId).toBeDefined();
    });

    test('should handle 404 errors appropriately', () => {
      const error = new Error('404 Not Found');
      const result = handleApiError(error, 'Resource Lookup');
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ERROR_TYPES.API_ERROR);
      expect(result.error).toContain('not found');
    });

    test('should handle network errors', () => {
      const error = new Error('Network error');
      error.code = 'ENOTFOUND';
      
      const result = handleApiError(error, 'Network Call');
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ERROR_TYPES.NETWORK_ERROR);
      expect(result.error).toContain('Network connection error');
    });

    test('should handle validation errors', () => {
      const error = new ApiError({
        code: 'INVALID_INPUT',
        message: 'Title is required'
      });
      
      const result = handleApiError(error, 'Input Validation');
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ERROR_TYPES.VALIDATION_ERROR);
      expect(result.error).toContain('Title is required');
    });
  });

  describe('403 Error Handling', () => {
    test('should handle 403 errors securely', () => {
      const error = new Error('403 Forbidden - User lacks admin privileges for sensitive operation');
      const result = handle403Error(error, 'Admin Operation');
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ERROR_TYPES.PERMISSION_DENIED);
      expect(result.error).toContain('Access denied');
      expect(result.error).not.toContain('admin privileges');
      expect(result.error).not.toContain('sensitive operation');
      expect(result.errorId).toBeDefined();
    });

    test('property: 403 errors never expose sensitive information', () => {
      fc.assert(
        fc.property(
          fc.record({
            sensitiveInfo: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1 && !s.includes(' ')),
            context: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
          }),
          (data) => {
            const error = new Error(`403 Forbidden - ${data.sensitiveInfo}`);
            const result = handle403Error(error, data.context);
            
            // Property: 403 error responses should never contain sensitive information
            expect(result.success).toBe(false);
            expect(result.error).not.toContain(data.sensitiveInfo);
            expect(result.errorType).toBe(ERROR_TYPES.PERMISSION_DENIED);
            expect(result.error).toContain('Access denied');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Enhanced API Error Handling', () => {
    /**
     * **Feature: institutional-memory-archaeologist, Property 7: Graceful error handling for API failures**
     * **Validates: Requirements 3.4, 4.4**
     */
    test('property: graceful error handling for API failures including Bitbucket', () => {
      fc.assert(
        fc.property(
          fc.record({
            apiType: fc.constantFrom('jira', 'confluence', 'bitbucket'),
            errorType: fc.constantFrom('403', '404', '429', '500', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'),
            context: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            sensitiveInfo: fc.option(fc.string({ minLength: 5, maxLength: 30 }))
          }),
          (errorData) => {
            // Create error based on type
            let error;
            if (errorData.errorType.startsWith('E')) {
              // Network error
              error = new Error(`Network error: ${errorData.errorType}`);
              error.code = errorData.errorType;
            } else {
              // HTTP error
              error = new Error(`${errorData.errorType} ${errorData.apiType} API error${errorData.sensitiveInfo ? ` - ${errorData.sensitiveInfo}` : ''}`);
            }

            const result = handleApiError(error, `${errorData.apiType} ${errorData.context}`);
            
            // Property: For any API error from any service (Jira, Confluence, Bitbucket),
            // handling should be graceful and not expose sensitive information
            expect(result).toBeDefined();
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            expect(result.errorId).toBeDefined();
            expect(result.errorType).toBeDefined();
            expect(result.timestamp).toBeDefined();
            
            // Should not expose sensitive information
            if (errorData.sensitiveInfo) {
              expect(result.error).not.toContain(errorData.sensitiveInfo);
            }
            expect(result.error).not.toContain('stack');
            expect(result.error).not.toContain('Error:');
            
            // Should provide appropriate error types
            if (errorData.errorType === '403') {
              expect(result.errorType).toBe(ERROR_TYPES.PERMISSION_DENIED);
            } else if (errorData.errorType === '404') {
              expect(result.errorType).toBe(ERROR_TYPES.API_ERROR);
            } else if (errorData.errorType === '429') {
              expect(result.errorType).toBe(ERROR_TYPES.API_ERROR);
            } else if (errorData.errorType === '500') {
              expect(result.errorType).toBe(ERROR_TYPES.API_ERROR);
            } else if (errorData.errorType.startsWith('E')) {
              expect(result.errorType).toBe(ERROR_TYPES.NETWORK_ERROR);
            }
            
            // Should provide user-friendly messages
            expect(result.error.length).toBeGreaterThan(0);
            expect(result.error).not.toMatch(/^Error:/);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should handle Bitbucket rate limiting errors specifically', () => {
      const rateLimitError = new Error('429 Too Many Requests - Rate limit exceeded');
      const result = handleApiError(rateLimitError, 'Bitbucket API');
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ERROR_TYPES.API_ERROR);
      expect(result.error).toContain('server error');
      expect(result.error).not.toContain('Rate limit exceeded');
    });

    test('should handle Bitbucket permission errors without exposing repository details', () => {
      const permissionError = new Error('403 Forbidden - Access denied to private repository sensitive-repo');
      const result = handleApiError(permissionError, 'Bitbucket Repository Access');
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ERROR_TYPES.PERMISSION_DENIED);
      expect(result.error).toContain('Permission denied');
      expect(result.error).not.toContain('sensitive-repo');
      expect(result.error).not.toContain('private repository');
    });

    test('should handle network timeouts for all API services', () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ETIMEDOUT';
      
      const result = handleApiError(timeoutError, 'Bitbucket API Call');
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ERROR_TYPES.NETWORK_ERROR);
      expect(result.error).toContain('Network connection error');
    });
  });

  describe('Error Logging', () => {
    /**
     * Feature: legacy-keeper, Property 8: Error logging consistency
     * Validates: Requirements 4.5
     */
    test('property: error logging consistency', () => {
      fc.assert(
        fc.property(
          fc.record({
            errorId: fc.string({ minLength: 1 }),
            context: fc.string({ minLength: 1 }),
            errorType: fc.constantFrom(...Object.values(ERROR_TYPES)),
            level: fc.constantFrom(...Object.values(LOG_LEVELS))
          }),
          (logData) => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const infoSpy = jest.spyOn(console, 'info').mockImplementation();
            const logSpy = jest.spyOn(console, 'log').mockImplementation();
            
            logError(logData, logData.level);
            
            // Property: For any error logging, appropriate console method should be called
            const totalCalls = consoleSpy.mock.calls.length + 
                             warnSpy.mock.calls.length + 
                             infoSpy.mock.calls.length + 
                             logSpy.mock.calls.length;
            
            expect(totalCalls).toBeGreaterThan(0);
            
            // Check that the log contains required fields
            let loggedData = null;
            if (consoleSpy.mock.calls.length > 0) {
              loggedData = consoleSpy.mock.calls[0][1];
            } else if (warnSpy.mock.calls.length > 0) {
              loggedData = warnSpy.mock.calls[0][1];
            } else if (infoSpy.mock.calls.length > 0) {
              loggedData = infoSpy.mock.calls[0][1];
            } else if (logSpy.mock.calls.length > 0) {
              loggedData = logSpy.mock.calls[0][1];
            }
            
            if (loggedData) {
              const parsed = JSON.parse(loggedData);
              expect(parsed.service).toBe('legacy-keeper');
              expect(parsed.level).toBe(logData.level);
            }
            
            consoleSpy.mockRestore();
            warnSpy.mockRestore();
            infoSpy.mockRestore();
            logSpy.mockRestore();
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * **Feature: institutional-memory-archaeologist, Property 8: Error logging consistency**
     * **Validates: Requirements 4.5**
     */
    test('property: error logging consistency with artifact-specific context', () => {
      fc.assert(
        fc.property(
          fc.record({
            errorId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            context: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            errorType: fc.constantFrom(...Object.values(ERROR_TYPES)),
            level: fc.constantFrom(...Object.values(LOG_LEVELS)),
            artifactId: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
            artifactType: fc.option(fc.constantFrom('PR', 'JIRA_TICKET', 'COMMIT')),
            apiService: fc.option(fc.constantFrom('jira', 'confluence', 'bitbucket'))
          }),
          (logData) => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const infoSpy = jest.spyOn(console, 'info').mockImplementation();
            const logSpy = jest.spyOn(console, 'log').mockImplementation();
            
            // Add artifact-specific context if available
            const enhancedLogData = {
              ...logData,
              ...(logData.artifactId && { artifactId: logData.artifactId }),
              ...(logData.artifactType && { artifactType: logData.artifactType }),
              ...(logData.apiService && { apiService: logData.apiService })
            };
            
            logError(enhancedLogData, logData.level);
            
            // Property: For any error logging with artifact context, 
            // appropriate console method should be called with consistent format
            const totalCalls = consoleSpy.mock.calls.length + 
                             warnSpy.mock.calls.length + 
                             infoSpy.mock.calls.length + 
                             logSpy.mock.calls.length;
            
            expect(totalCalls).toBeGreaterThan(0);
            
            // Check that the log contains required fields and artifact context
            let loggedData = null;
            let logMessage = null;
            if (consoleSpy.mock.calls.length > 0) {
              logMessage = consoleSpy.mock.calls[0][0];
              loggedData = consoleSpy.mock.calls[0][1];
            } else if (warnSpy.mock.calls.length > 0) {
              logMessage = warnSpy.mock.calls[0][0];
              loggedData = warnSpy.mock.calls[0][1];
            } else if (infoSpy.mock.calls.length > 0) {
              logMessage = infoSpy.mock.calls[0][0];
              loggedData = infoSpy.mock.calls[0][1];
            } else if (logSpy.mock.calls.length > 0) {
              logMessage = logSpy.mock.calls[0][0];
              loggedData = logSpy.mock.calls[0][1];
            }
            
            // Verify log message format
            expect(logMessage).toBeDefined();
            expect(typeof logMessage).toBe('string');
            
            // Verify log data structure
            if (loggedData) {
              const parsed = JSON.parse(loggedData);
              expect(parsed.service).toBe('legacy-keeper');
              expect(parsed.level).toBe(logData.level);
              expect(parsed.errorId).toBe(logData.errorId);
              expect(parsed.context).toBe(logData.context);
              expect(parsed.errorType).toBe(logData.errorType);
              
              // Verify artifact-specific context is preserved
              if (logData.artifactId) {
                expect(parsed.artifactId).toBe(logData.artifactId);
              }
              if (logData.artifactType) {
                expect(parsed.artifactType).toBe(logData.artifactType);
              }
              if (logData.apiService) {
                expect(parsed.apiService).toBe(logData.apiService);
              }
            }
            
            consoleSpy.mockRestore();
            warnSpy.mockRestore();
            infoSpy.mockRestore();
            logSpy.mockRestore();
          }
        ),
        { numRuns: 50 }
      );
    });

    test('should log errors with appropriate levels', () => {
      const errorData = {
        errorId: 'test-error-123',
        context: 'Test Context',
        errorType: ERROR_TYPES.API_ERROR
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      logError(errorData, LOG_LEVELS.ERROR);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚨 ERROR:'),
        expect.stringContaining('legacy-keeper')
      );
      
      consoleSpy.mockRestore();
    });

    test('should log artifact-specific context for debugging', () => {
      const errorData = {
        errorId: 'test-error-456',
        context: 'Bitbucket PR Analysis',
        errorType: ERROR_TYPES.API_ERROR,
        artifactId: 'PR-402',
        artifactType: 'PR',
        apiService: 'bitbucket'
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      logError(errorData, LOG_LEVELS.ERROR);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚨 ERROR:'),
        expect.stringContaining('PR-402')
      );
      
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][1]);
      expect(loggedData.artifactId).toBe('PR-402');
      expect(loggedData.artifactType).toBe('PR');
      expect(loggedData.apiService).toBe('bitbucket');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Input Validation', () => {
    test('should validate required fields', () => {
      const schema = {
        title: { required: true, type: 'string' },
        content: { required: true, type: 'string' }
      };

      expect(() => {
        validateInput({}, schema);
      }).toThrow('title is required');
    });

    test('should validate field types', () => {
      const schema = {
        count: { type: 'number' }
      };

      expect(() => {
        validateInput({ count: 'not a number' }, schema);
      }).toThrow('count must be of type number');
    });

    test('should validate string lengths', () => {
      const schema = {
        title: { minLength: 5, maxLength: 10 }
      };

      expect(() => {
        validateInput({ title: 'abc' }, schema);
      }).toThrow('title must be at least 5 characters long');

      expect(() => {
        validateInput({ title: 'this is too long' }, schema);
      }).toThrow('title must be no more than 10 characters long');
    });

    test('property: validation always throws for invalid input', () => {
      fc.assert(
        fc.property(
          fc.record({
            fieldName: fc.string({ minLength: 1, maxLength: 10 }),
            minLength: fc.integer({ min: 5, max: 10 }),
            value: fc.string({ maxLength: 3 }) // Always too short
          }),
          (data) => {
            const schema = {
              [data.fieldName]: { 
                required: true, 
                type: 'string', 
                minLength: data.minLength 
              }
            };

            expect(() => {
              validateInput({ [data.fieldName]: data.value }, schema);
            }).toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Utility Functions', () => {
    test('should generate unique error IDs', () => {
      const id1 = generateErrorId();
      const id2 = generateErrorId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^err_/);
      expect(id2).toMatch(/^err_/);
    });

    test('should format error messages appropriately', () => {
      const permissionError = new ApiError({
        code: 'PERMISSION_DENIED',
        message: 'Access denied'
      });
      
      const message = formatErrorMessage(permissionError);
      expect(message).toContain('permission');
    });

    test('should identify retryable errors', () => {
      const networkError = new Error('Network error');
      networkError.code = 'ENOTFOUND';
      
      expect(isRetryableError(networkError)).toBe(true);
      
      const permissionError = new Error('403 Forbidden');
      expect(isRetryableError(permissionError)).toBe(false);
    });

    test('should wrap functions with error handling', async () => {
      const failingFunction = async () => {
        throw new Error('Test error');
      };
      
      const wrappedFunction = withErrorHandling(failingFunction, 'Test Context');
      const result = await wrappedFunction();
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorId).toBeDefined();
    });

    test('property: error IDs are always unique', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (count) => {
            const ids = Array.from({ length: count }, () => generateErrorId());
            const uniqueIds = new Set(ids);
            
            // Property: All generated error IDs should be unique
            expect(uniqueIds.size).toBe(ids.length);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});