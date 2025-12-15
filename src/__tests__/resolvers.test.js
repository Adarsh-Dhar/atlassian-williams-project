const { handler } = require('../index');
const { mockHelpers } = require('../__mocks__/@forge/api');

/**
 * Resolver Functions Tests
 * Validates: Requirements 5.1, 5.5
 * 
 * Tests the main resolver functions to ensure 100% coverage
 * and proper integration with the Forge framework.
 */
describe('Resolver Functions', () => {

  beforeEach(() => {
    mockHelpers.resetMocks();
    
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods
    console.log.mockRestore?.();
    console.error.mockRestore?.();
    console.warn.mockRestore?.();
    console.info.mockRestore?.();
  });

  describe('Handler Registration', () => {
    test('should register all required resolver functions', () => {
      // The handler should be defined and contain the resolver definitions
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('object');
      
      // Should have the expected resolver functions registered
      const resolverKeys = Object.keys(handler);
      expect(resolverKeys).toContain('scanForGaps');
      expect(resolverKeys).toContain('saveToConfluence');
      
      // Each resolver should be a function
      expect(typeof handler.scanForGaps).toBe('function');
      expect(typeof handler.saveToConfluence).toBe('function');
    });
  });

  describe('scanForGaps Resolver', () => {
    test('should execute scanForGaps resolver successfully', async () => {
      // Set up mock data for successful scan
      const mockJiraTickets = [
        {
          id: '1',
          key: 'RESOLVER-1',
          fields: {
            summary: 'Resolver test ticket',
            description: 'Brief description',
            assignee: {
              accountId: 'resolver-user',
              displayName: 'Resolver User'
            },
            status: { name: 'Done' },
            created: '2024-01-01T10:00:00.000Z',
            updated: '2024-01-02T10:00:00.000Z',
            comment: { total: 1 }
          }
        }
      ];

      mockHelpers.setMockState({
        jiraTickets: mockJiraTickets
      });

      // Execute the resolver function
      const result = await handler.scanForGaps({});
      
      // Validate the result
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(Array.isArray(result.reports)).toBe(true);
      expect(result.summary).toBeDefined();
      expect(typeof result.summary.totalUsersScanned).toBe('number');
      expect(typeof result.summary.usersWithGaps).toBe('number');
      expect(typeof result.summary.highRiskUsers).toBe('number');
    });

    test('should handle scanForGaps resolver errors gracefully', async () => {
      // Simulate API error
      mockHelpers.simulateError('jira');

      // Execute the resolver function
      const result = await handler.scanForGaps({});
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.success).toBe(true); // Scanner catches errors internally
      expect(Array.isArray(result.reports)).toBe(true);
      expect(result.reports).toEqual([]); // Empty results when API fails
    });
  });

  describe('saveToConfluence Resolver', () => {
    test('should execute saveToConfluence resolver successfully', async () => {
      // Set up mock data for successful save
      mockHelpers.setMockState({
        confluenceResponse: {
          status: 201,
          data: {
            id: 'resolver-page',
            title: 'Resolver Test Page',
            _links: {
              webui: '/spaces/KNOWLEDGE/pages/resolver-page'
            }
          }
        }
      });

      const request = {
        payload: {
          title: 'Resolver Test Knowledge',
          content: 'This is test knowledge content for the resolver test.'
        }
      };

      // Execute the resolver function
      const result = await handler.saveToConfluence(request);
      
      // Validate the result
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.pageUrl).toContain('resolver-page');
      expect(result.pageId).toBe('resolver-page');
      expect(result.error).toBeNull();
    });

    test('should handle saveToConfluence resolver errors gracefully', async () => {
      // Simulate Confluence API error
      mockHelpers.simulateError('confluence');

      const request = {
        payload: {
          title: 'Error Test Page',
          content: 'This should fail to save.'
        }
      };

      // Execute the resolver function
      const result = await handler.saveToConfluence(request);
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.pageUrl).toBeNull();
    });

    test('should handle invalid saveToConfluence input', async () => {
      const request = {
        payload: {
          title: '', // Invalid empty title
          content: 'Some content'
        }
      };

      // Execute the resolver function
      const result = await handler.saveToConfluence(request);
      
      // Should handle validation error
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Title and content are required');
    });
  });

  describe('Resolver Integration', () => {
    test('should handle resolver functions as part of complete workflow', async () => {
      // Test that both resolvers work together in sequence
      
      // Step 1: Set up data for gap scanning
      const mockJiraTickets = [
        {
          id: '1',
          key: 'WORKFLOW-1',
          fields: {
            summary: 'Workflow integration test',
            description: 'Testing resolver integration',
            assignee: {
              accountId: 'workflow-user',
              displayName: 'Workflow User'
            },
            status: { name: 'Done' },
            created: '2024-01-01T10:00:00.000Z',
            updated: '2024-01-02T10:00:00.000Z',
            comment: { total: 1 }
          }
        }
      ];

      mockHelpers.setMockState({
        jiraTickets: mockJiraTickets
      });

      // Step 2: Execute gap scan
      const scanResult = await handler.scanForGaps({});
      expect(scanResult.success).toBe(true);

      // Step 3: Set up Confluence mock for saving
      mockHelpers.setMockState({
        confluenceResponse: {
          status: 201,
          data: {
            id: 'workflow-page',
            title: 'Workflow Knowledge Page',
            _links: {
              webui: '/spaces/KNOWLEDGE/pages/workflow-page'
            }
          }
        }
      });

      // Step 4: Execute save to Confluence
      const saveRequest = {
        payload: {
          title: 'Workflow Knowledge Capture',
          content: 'Knowledge captured from workflow integration test.'
        }
      };

      const saveResult = await handler.saveToConfluence(saveRequest);
      expect(saveResult.success).toBe(true);
      expect(saveResult.pageUrl).toContain('workflow-page');

      // Both resolvers should work independently and in sequence
      expect(scanResult.success).toBe(true);
      expect(saveResult.success).toBe(true);
    });

    test('should maintain resolver function isolation', async () => {
      // Test that resolver functions don't interfere with each other
      
      // Execute scanForGaps with error
      mockHelpers.simulateError('jira');
      const scanResult = await handler.scanForGaps({});
      
      // Reset mocks and execute saveToConfluence successfully
      mockHelpers.resetMocks();
      mockHelpers.setMockState({
        confluenceResponse: {
          status: 201,
          data: {
            id: 'isolation-page',
            title: 'Isolation Test Page',
            _links: {
              webui: '/spaces/KNOWLEDGE/pages/isolation-page'
            }
          }
        }
      });

      const saveRequest = {
        payload: {
          title: 'Isolation Test',
          content: 'Testing resolver isolation.'
        }
      };

      const saveResult = await handler.saveToConfluence(saveRequest);
      
      // scanForGaps error should not affect saveToConfluence
      expect(scanResult.success).toBe(true); // Scanner handles errors internally
      expect(saveResult.success).toBe(true);
      expect(saveResult.pageUrl).toContain('isolation-page');
    });
  });

  describe('Error Handling Validation', () => {
    test('should handle all error scenarios across resolvers', async () => {
      // Test comprehensive error handling
      
      const errorScenarios = [
        {
          name: 'Jira API Error',
          setup: () => mockHelpers.simulateError('jira'),
          resolver: 'scanForGaps',
          request: {}
        },
        {
          name: 'Confluence API Error',
          setup: () => mockHelpers.simulateError('confluence'),
          resolver: 'saveToConfluence',
          request: { payload: { title: 'Test', content: 'Test content' } }
        },
        {
          name: '403 Forbidden Error',
          setup: () => mockHelpers.simulateError('403'),
          resolver: 'saveToConfluence',
          request: { payload: { title: 'Test', content: 'Test content' } }
        }
      ];

      for (const scenario of errorScenarios) {
        // Reset and set up error condition
        mockHelpers.resetMocks();
        scenario.setup();

        // Execute resolver
        const result = await handler[scenario.resolver](scenario.request);
        
        // Validate error handling
        expect(result).toBeDefined();
        
        if (scenario.resolver === 'scanForGaps') {
          // Scanner handles errors internally and returns success with empty results
          expect(result.success).toBe(true);
          expect(result.reports).toEqual([]);
        } else {
          // Confluence service returns error results
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
        }
      }
    });

    test('should validate input parameters for all resolvers', async () => {
      // Test input validation across all resolvers
      
      // scanForGaps should handle empty/undefined input
      const scanResult1 = await handler.scanForGaps();
      const scanResult2 = await handler.scanForGaps({});
      const scanResult3 = await handler.scanForGaps(null);
      
      expect(scanResult1.success).toBe(true);
      expect(scanResult2.success).toBe(true);
      expect(scanResult3.success).toBe(true);

      // saveToConfluence should validate required fields
      const saveResult1 = await handler.saveToConfluence({});
      const saveResult2 = await handler.saveToConfluence({ payload: {} });
      const saveResult3 = await handler.saveToConfluence({ payload: { title: 'Test' } });
      
      expect(saveResult1.success).toBe(false);
      expect(saveResult2.success).toBe(false);
      expect(saveResult3.success).toBe(false);
      
      // The error messages should indicate failure to create Confluence page
      expect(saveResult1.error).toContain('Failed to create Confluence page');
      expect(saveResult2.error).toContain('Title and content are required');
      expect(saveResult3.error).toContain('Title and content are required');
    });
  });
});