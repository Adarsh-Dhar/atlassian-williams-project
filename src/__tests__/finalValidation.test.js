const { mockHelpers } = require('../__mocks__/@forge/api');
const { handler } = require('../index');
const {
  scanForGaps,
  identifyZombieTickets,
  calculateDocumentationRatio
} = require('../scanners/backgroundScanner');
const {
  saveToConfluence,
  validatePermissions,
  formatContent
} = require('../services/confluenceService');
const {
  createInterviewContext,
  extractKnowledgeFromResponses,
  formatKnowledgeForStorage
} = require('../agents/memoryArchaeologist');

/**
 * Final Validation Tests
 * Validates: Requirements 5.1, 5.5
 * 
 * Comprehensive validation of all error handling scenarios and complete workflows.
 * This test suite ensures the entire system works correctly under all conditions.
 */
describe('Final Validation - Complete System Testing', () => {

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

  describe('Complete System Workflow Validation', () => {
    test('should handle complete end-to-end workflow with all components', async () => {
      // This test validates the complete workflow from Requirements 5.1
      
      // Step 1: Set up comprehensive test data
      const comprehensiveJiraTickets = [
        // High-activity user with poor documentation
        {
          id: '1',
          key: 'FINAL-1',
          fields: {
            summary: 'Critical system integration',
            description: 'Brief notes only',
            assignee: {
              accountId: 'critical-user',
              displayName: 'Critical Developer'
            },
            status: { name: 'Done' },
            created: '2024-01-01T10:00:00.000Z',
            updated: '2024-01-20T15:30:00.000Z',
            comment: { total: 1 }
          }
        },
        {
          id: '2',
          key: 'FINAL-2',
          fields: {
            summary: 'Legacy system maintenance',
            description: 'Quick fix',
            assignee: {
              accountId: 'critical-user',
              displayName: 'Critical Developer'
            },
            status: { name: 'Done' },
            created: '2024-01-02T10:00:00.000Z',
            updated: '2024-01-21T15:30:00.000Z',
            comment: { total: 0 }
          }
        },
        {
          id: '3',
          key: 'FINAL-3',
          fields: {
            summary: 'Database optimization',
            description: 'Performance improvements',
            assignee: {
              accountId: 'critical-user',
              displayName: 'Critical Developer'
            },
            status: { name: 'Done' },
            created: '2024-01-03T10:00:00.000Z',
            updated: '2024-01-22T15:30:00.000Z',
            comment: { total: 2 }
          }
        },
        {
          id: '4',
          key: 'FINAL-4',
          fields: {
            summary: 'Security patch deployment',
            description: 'Urgent security fix',
            assignee: {
              accountId: 'critical-user',
              displayName: 'Critical Developer'
            },
            status: { name: 'Done' },
            created: '2024-01-04T10:00:00.000Z',
            updated: '2024-01-23T15:30:00.000Z',
            comment: { total: 1 }
          }
        },
        {
          id: '5',
          key: 'FINAL-5',
          fields: {
            summary: 'API endpoint modifications',
            description: 'Modified endpoints for new requirements',
            assignee: {
              accountId: 'critical-user',
              displayName: 'Critical Developer'
            },
            status: { name: 'Done' },
            created: '2024-01-05T10:00:00.000Z',
            updated: '2024-01-24T15:30:00.000Z',
            comment: { total: 3 }
          }
        },
        {
          id: '6',
          key: 'FINAL-6',
          fields: {
            summary: 'Deployment pipeline updates',
            description: 'Updated CI/CD configuration',
            assignee: {
              accountId: 'critical-user',
              displayName: 'Critical Developer'
            },
            status: { name: 'Done' },
            created: '2024-01-06T10:00:00.000Z',
            updated: '2024-01-25T15:30:00.000Z',
            comment: { total: 1 }
          }
        }
      ];

      mockHelpers.setMockState({
        jiraTickets: comprehensiveJiraTickets
      });

      // Step 2: Execute knowledge gap detection via resolver
      const gapScanResult = await handler.scanForGaps({});
      
      expect(gapScanResult.success).toBe(true);
      expect(gapScanResult.reports).toBeDefined();
      expect(gapScanResult.reports.length).toBeGreaterThan(0);
      
      const criticalUserReport = gapScanResult.reports.find(r => r.userId === 'critical-user');
      expect(criticalUserReport).toBeDefined();
      expect(criticalUserReport.ticketCount).toBe(6);
      expect(criticalUserReport.riskLevel).toBe('HIGH'); // 6 tickets with low documentation

      // Step 3: Create interview context with detected gaps
      const interviewContext = createInterviewContext({
        employeeId: criticalUserReport.userId,
        department: 'Engineering',
        role: 'Senior Systems Engineer',
        identifiedGaps: [{
          ticketCount: criticalUserReport.ticketCount,
          ticketId: 'FINAL-1',
          description: 'Critical systems work with minimal documentation'
        }]
      });

      expect(interviewContext.employeeId).toBe('critical-user');
      expect(interviewContext.identifiedGaps).toHaveLength(1);

      // Step 4: Simulate comprehensive interview responses
      const comprehensiveResponses = [
        {
          question: 'What critical processes do you manage that aren\'t documented?',
          answer: 'I manage the legacy BILLING system integration that processes all customer payments. The system requires a specific sequence of API calls to maintain data consistency. There\'s also a manual verification process that runs after each deployment to ensure the payment gateway is functioning correctly. This process involves checking specific database tables and running custom SQL queries that I\'ve developed over time.'
        },
        {
          question: 'What would be most difficult for a replacement to understand?',
          answer: 'The deployment pipeline has several hidden dependencies that aren\'t obvious from the configuration files. For example, the database migration scripts must run in a specific order, and there\'s a 5-minute wait period between certain steps to allow for cache invalidation. Also, the monitoring dashboard has custom alerts that I set up - the thresholds are based on historical performance data that only I know about.'
        },
        {
          question: 'Are there any emergency procedures or shortcuts you use?',
          answer: 'Yes, when the payment system goes down, there\'s an emergency rollback procedure that bypasses the normal approval process. It involves directly accessing the production database and running a series of commands to restore the previous state. I also have a set of diagnostic scripts that can quickly identify the root cause of system failures. These scripts check log files, database connections, and external API status in a specific sequence.'
        },
        {
          question: 'What tribal knowledge should be preserved?',
          answer: 'The BILLING system has quirks that aren\'t documented anywhere. For instance, it can\'t handle more than 1000 concurrent transactions, so we have a custom throttling mechanism. There\'s also a specific time window (2-4 AM) when certain maintenance operations must be performed to avoid conflicts with the nightly batch jobs. The system integration with the legacy CUSTOMER database requires special handling for data encoding - some fields need to be converted from Latin-1 to UTF-8 before processing.'
        }
      ];

      // Step 5: Extract knowledge from responses
      const knowledgeArtifact = extractKnowledgeFromResponses(comprehensiveResponses, interviewContext);
      
      expect(knowledgeArtifact.employeeId).toBe('critical-user');
      expect(knowledgeArtifact.title).toContain('Senior Systems Engineer');
      expect(knowledgeArtifact.content).toContain('BILLING system');
      expect(knowledgeArtifact.content).toContain('deployment pipeline');
      expect(knowledgeArtifact.content).toContain('emergency rollback');
      expect(knowledgeArtifact.tags).toContain('database');
      expect(knowledgeArtifact.tags).toContain('deployment');
      expect(knowledgeArtifact.confidence).toBeGreaterThan(0.5); // Good confidence due to detailed responses
      expect(knowledgeArtifact.relatedTickets).toContain('FINAL-1');

      // Step 6: Format knowledge for storage
      const formattedKnowledge = formatKnowledgeForStorage(knowledgeArtifact);
      
      expect(formattedKnowledge.title).toBeDefined();
      expect(formattedKnowledge.content).toContain('Knowledge Transfer Session');
      expect(formattedKnowledge.content).toContain('critical-user');
      expect(formattedKnowledge.content).toContain('BILLING system');

      // Step 7: Save to Confluence via resolver
      mockHelpers.setMockState({
        confluenceResponse: {
          status: 201,
          data: {
            id: 'final-validation-page',
            title: formattedKnowledge.title,
            _links: {
              webui: '/spaces/KNOWLEDGE/pages/final-validation-page'
            }
          }
        }
      });

      const saveRequest = {
        payload: {
          title: formattedKnowledge.title,
          content: formattedKnowledge.content
        }
      };

      const saveResult = await handler.saveToConfluence(saveRequest);
      
      expect(saveResult.success).toBe(true);
      expect(saveResult.pageUrl).toContain('final-validation-page');
      expect(saveResult.pageId).toBe('final-validation-page');
      expect(saveResult.error).toBeNull();

      // Step 8: Validate end-to-end data integrity
      expect(knowledgeArtifact.content).toContain('BILLING system');
      expect(knowledgeArtifact.content).toContain('deployment pipeline');
      expect(formattedKnowledge.content).toContain('BILLING system');
      expect(formattedKnowledge.content).toContain('deployment pipeline');
      
      // Validate traceability
      expect(knowledgeArtifact.relatedTickets.length).toBeGreaterThan(0);
      expect(formattedKnowledge.content).toContain('FINAL-');
      
      // Validate confidence and metadata
      expect(knowledgeArtifact.confidence).toBeGreaterThan(0.5);
      expect(knowledgeArtifact.tags.length).toBeGreaterThan(3);
      expect(formattedKnowledge.content).toContain(Math.round(knowledgeArtifact.confidence * 100) + '%');
    });
  });

  describe('Comprehensive Error Handling Validation', () => {
    test('should handle all possible error scenarios gracefully', async () => {
      // Test all error scenarios from Requirements 5.1, 5.5
      
      const errorScenarios = [
        {
          name: 'Jira API Network Error',
          setup: () => mockHelpers.simulateError('jira'),
          test: async () => {
            const result = await handler.scanForGaps({});
            expect(result.success).toBe(true); // Scanner handles errors internally
            expect(result.reports).toEqual([]);
          }
        },
        {
          name: 'Confluence API Network Error',
          setup: () => mockHelpers.simulateError('confluence'),
          test: async () => {
            const result = await handler.saveToConfluence({
              payload: { title: 'Test', content: 'Test content' }
            });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
          }
        },
        {
          name: '403 Forbidden Error',
          setup: () => mockHelpers.simulateError('403'),
          test: async () => {
            const result = await handler.saveToConfluence({
              payload: { title: 'Test', content: 'Test content' }
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Permission denied');
            expect(result.error).not.toContain('403'); // Should not expose raw error codes
          }
        },
        {
          name: '404 Not Found Error',
          setup: () => mockHelpers.simulateError('404'),
          test: async () => {
            const result = await handler.saveToConfluence({
              payload: { title: 'Test', content: 'Test content' }
            });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
          }
        },
        {
          name: '500 Internal Server Error',
          setup: () => mockHelpers.simulateError('500'),
          test: async () => {
            const result = await handler.saveToConfluence({
              payload: { title: 'Test', content: 'Test content' }
            });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
          }
        }
      ];

      for (const scenario of errorScenarios) {
        // Reset state for each scenario
        mockHelpers.resetMocks();
        scenario.setup();
        
        // Execute test
        await scenario.test();
      }
    });

    test('should maintain system stability under concurrent operations', async () => {
      // Test system behavior under concurrent load
      
      const mockJiraTickets = [
        {
          id: '1',
          key: 'CONCURRENT-1',
          fields: {
            summary: 'Concurrent test ticket',
            description: 'Testing concurrent operations',
            assignee: {
              accountId: 'concurrent-user',
              displayName: 'Concurrent User'
            },
            status: { name: 'Done' },
            created: '2024-01-01T10:00:00.000Z',
            updated: '2024-01-02T10:00:00.000Z',
            comment: { total: 1 }
          }
        }
      ];

      mockHelpers.setMockState({
        jiraTickets: mockJiraTickets,
        confluenceResponse: {
          status: 201,
          data: {
            id: 'concurrent-page',
            title: 'Concurrent Test Page',
            _links: {
              webui: '/spaces/KNOWLEDGE/pages/concurrent-page'
            }
          }
        }
      });

      // Execute multiple operations concurrently
      const operations = [
        handler.scanForGaps({}),
        handler.scanForGaps({}),
        handler.saveToConfluence({
          payload: { title: 'Concurrent Test 1', content: 'Test content 1' }
        }),
        handler.saveToConfluence({
          payload: { title: 'Concurrent Test 2', content: 'Test content 2' }
        })
      ];

      const results = await Promise.all(operations);
      
      // All operations should complete successfully
      expect(results[0].success).toBe(true); // First scan
      expect(results[1].success).toBe(true); // Second scan
      expect(results[2].success).toBe(true); // First save
      expect(results[3].success).toBe(true); // Second save
      
      // Results should be consistent
      expect(results[0].reports).toEqual(results[1].reports);
    });
  });

  describe('Data Validation and Integrity', () => {
    test('should validate all data models and maintain integrity', async () => {
      // Test data model validation throughout the workflow
      
      const testData = {
        jiraTickets: [
          {
            id: '1',
            key: 'VALIDATION-1',
            fields: {
              summary: 'Data validation test',
              description: 'Testing data model validation and integrity',
              assignee: {
                accountId: 'validation-user',
                displayName: 'Validation User'
              },
              status: { name: 'Done' },
              created: '2024-01-01T10:00:00.000Z',
              updated: '2024-01-02T10:00:00.000Z',
              comment: { total: 2 }
            }
          }
        ]
      };

      mockHelpers.setMockState(testData);

      // Execute workflow and validate data at each step
      const gapScanResult = await handler.scanForGaps({});
      
      // Validate gap scan result structure
      expect(gapScanResult).toHaveProperty('success');
      expect(gapScanResult).toHaveProperty('reports');
      expect(gapScanResult).toHaveProperty('summary');
      expect(Array.isArray(gapScanResult.reports)).toBe(true);
      
      if (gapScanResult.reports.length > 0) {
        const report = gapScanResult.reports[0];
        expect(report).toHaveProperty('userId');
        expect(report).toHaveProperty('ticketCount');
        expect(report).toHaveProperty('documentationRatio');
        expect(report).toHaveProperty('riskLevel');
        expect(report).toHaveProperty('recommendedActions');
        
        // Validate data types
        expect(typeof report.userId).toBe('string');
        expect(typeof report.ticketCount).toBe('number');
        expect(typeof report.documentationRatio).toBe('number');
        expect(['HIGH', 'MEDIUM', 'LOW']).toContain(report.riskLevel);
        expect(Array.isArray(report.recommendedActions)).toBe(true);
      }

      // Test knowledge extraction with validated data
      const context = createInterviewContext({
        employeeId: 'validation-user',
        department: 'Engineering',
        role: 'Developer'
      });

      const responses = [
        {
          question: 'Validation test question',
          answer: 'Validation test answer with sufficient detail for processing.'
        }
      ];

      const artifact = extractKnowledgeFromResponses(responses, context);
      
      // Validate artifact structure
      expect(artifact).toHaveProperty('id');
      expect(artifact).toHaveProperty('employeeId');
      expect(artifact).toHaveProperty('title');
      expect(artifact).toHaveProperty('content');
      expect(artifact).toHaveProperty('tags');
      expect(artifact).toHaveProperty('extractedAt');
      expect(artifact).toHaveProperty('confidence');
      expect(artifact).toHaveProperty('relatedTickets');
      
      // Validate data types and constraints
      expect(typeof artifact.id).toBe('string');
      expect(typeof artifact.employeeId).toBe('string');
      expect(typeof artifact.title).toBe('string');
      expect(typeof artifact.content).toBe('string');
      expect(Array.isArray(artifact.tags)).toBe(true);
      expect(artifact.extractedAt instanceof Date).toBe(true);
      expect(typeof artifact.confidence).toBe('number');
      expect(artifact.confidence).toBeGreaterThanOrEqual(0);
      expect(artifact.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(artifact.relatedTickets)).toBe(true);
    });

    test('should handle edge cases and boundary conditions', async () => {
      // Test system behavior with edge case data
      
      const edgeCaseData = [
        // Empty data
        {
          name: 'Empty Jira Response',
          jiraTickets: [],
          expectedReports: 0
        },
        // Single ticket
        {
          name: 'Single Ticket',
          jiraTickets: [
            {
              id: '1',
              key: 'EDGE-1',
              fields: {
                summary: 'Single ticket test',
                description: 'Single ticket for edge case testing',
                assignee: {
                  accountId: 'edge-user',
                  displayName: 'Edge User'
                },
                status: { name: 'Done' },
                created: '2024-01-01T10:00:00.000Z',
                updated: '2024-01-02T10:00:00.000Z',
                comment: { total: 0 }
              }
            }
          ],
          expectedReports: 1 // Single ticket with low documentation will trigger knowledge gap
        },
        // Maximum tickets
        {
          name: 'Many Tickets',
          jiraTickets: Array.from({ length: 20 }, (_, i) => ({
            id: `${i + 1}`,
            key: `MANY-${i + 1}`,
            fields: {
              summary: `Ticket ${i + 1}`,
              description: 'Brief description',
              assignee: {
                accountId: 'many-user',
                displayName: 'Many User'
              },
              status: { name: 'Done' },
              created: '2024-01-01T10:00:00.000Z',
              updated: '2024-01-02T10:00:00.000Z',
              comment: { total: 1 }
            }
          })),
          expectedReports: 1 // Should trigger knowledge gap for many tickets
        }
      ];

      for (const testCase of edgeCaseData) {
        mockHelpers.resetMocks();
        mockHelpers.setMockState({ jiraTickets: testCase.jiraTickets });

        const result = await handler.scanForGaps({});
        
        expect(result.success).toBe(true);
        expect(result.reports.length).toBe(testCase.expectedReports);
      }
    });
  });

  describe('Performance and Reliability Validation', () => {
    test('should handle large datasets efficiently', async () => {
      // Test system performance with large datasets
      
      const largeDataset = Array.from({ length: 100 }, (_, i) => ({
        id: `${i + 1}`,
        key: `PERF-${i + 1}`,
        fields: {
          summary: `Performance test ticket ${i + 1}`,
          description: `Description for ticket ${i + 1}`,
          assignee: {
            accountId: `user-${Math.floor(i / 10)}`, // 10 users with 10 tickets each
            displayName: `User ${Math.floor(i / 10)}`
          },
          status: { name: 'Done' },
          created: '2024-01-01T10:00:00.000Z',
          updated: '2024-01-02T10:00:00.000Z',
          comment: { total: Math.floor(Math.random() * 5) }
        }
      }));

      mockHelpers.setMockState({ jiraTickets: largeDataset });

      const startTime = Date.now();
      const result = await handler.scanForGaps({});
      const endTime = Date.now();
      
      // Should complete within reasonable time (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
      
      // Should handle large dataset correctly
      expect(result.success).toBe(true);
      expect(result.summary.totalUsersScanned).toBe(10);
      expect(result.reports.length).toBeGreaterThan(0);
    });

    test('should maintain consistency across multiple executions', async () => {
      // Test that multiple executions produce consistent results
      
      const consistentData = [
        {
          id: '1',
          key: 'CONSISTENT-1',
          fields: {
            summary: 'Consistency test ticket',
            description: 'Testing result consistency',
            assignee: {
              accountId: 'consistent-user',
              displayName: 'Consistent User'
            },
            status: { name: 'Done' },
            created: '2024-01-01T10:00:00.000Z',
            updated: '2024-01-02T10:00:00.000Z',
            comment: { total: 1 }
          }
        }
      ];

      mockHelpers.setMockState({ jiraTickets: consistentData });

      // Execute multiple times
      const results = await Promise.all([
        handler.scanForGaps({}),
        handler.scanForGaps({}),
        handler.scanForGaps({})
      ]);

      // All results should be identical
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
      
      // All should be successful
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });
});