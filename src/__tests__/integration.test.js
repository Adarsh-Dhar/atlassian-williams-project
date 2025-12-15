const { mockHelpers } = require('../__mocks__/@forge/api');
const { scanForGaps } = require('../scanners/backgroundScanner');
const { saveToConfluence } = require('../services/confluenceService');
const {
  createInterviewContext,
  extractKnowledgeFromResponses,
  formatKnowledgeForStorage
} = require('../agents/memoryArchaeologist');

/**
 * Integration Tests for Complete Workflows
 * Validates: Requirements 5.1
 * 
 * These tests verify end-to-end functionality across component boundaries,
 * testing complete workflows from knowledge gap detection through Confluence storage.
 */
describe('Integration Tests - Complete Workflows', () => {

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

  describe('Complete Knowledge Extraction and Storage Workflow', () => {
    /**
     * Test full workflow: Gap Detection → Interview → Knowledge Extraction → Confluence Storage
     * Validates: Requirements 5.1
     */
    test('should complete full knowledge extraction and storage workflow', async () => {
      // Step 1: Set up mock data for knowledge gap detection
      const mockJiraTickets = [
        {
          id: '1',
          key: 'PROJ-123',
          fields: {
            summary: 'Implement API integration',
            description: 'Brief description without documentation links',
            assignee: {
              accountId: 'emp123',
              displayName: 'John Developer'
            },
            status: { name: 'Done' },
            created: '2024-01-01T10:00:00.000Z',
            updated: '2024-01-15T15:30:00.000Z',
            comment: { total: 2 }
          }
        },
        {
          id: '2',
          key: 'PROJ-124',
          fields: {
            summary: 'Database migration script',
            description: 'Another brief description',
            assignee: {
              accountId: 'emp123',
              displayName: 'John Developer'
            },
            status: { name: 'Done' },
            created: '2024-01-02T10:00:00.000Z',
            updated: '2024-01-16T15:30:00.000Z',
            comment: { total: 1 }
          }
        },
        {
          id: '3',
          key: 'PROJ-125',
          fields: {
            summary: 'Legacy system integration',
            description: 'Minimal documentation',
            assignee: {
              accountId: 'emp123',
              displayName: 'John Developer'
            },
            status: { name: 'Done' },
            created: '2024-01-03T10:00:00.000Z',
            updated: '2024-01-17T15:30:00.000Z',
            comment: { total: 3 }
          }
        },
        {
          id: '4',
          key: 'PROJ-126',
          fields: {
            summary: 'Performance optimization',
            description: 'Brief notes',
            assignee: {
              accountId: 'emp123',
              displayName: 'John Developer'
            },
            status: { name: 'Done' },
            created: '2024-01-04T10:00:00.000Z',
            updated: '2024-01-18T15:30:00.000Z',
            comment: { total: 1 }
          }
        },
        {
          id: '5',
          key: 'PROJ-127',
          fields: {
            summary: 'Security updates',
            description: 'Quick fix',
            assignee: {
              accountId: 'emp123',
              displayName: 'John Developer'
            },
            status: { name: 'Done' },
            created: '2024-01-05T10:00:00.000Z',
            updated: '2024-01-19T15:30:00.000Z',
            comment: { total: 2 }
          }
        },
        {
          id: '6',
          key: 'PROJ-128',
          fields: {
            summary: 'Deployment automation',
            description: 'Automated deployment process',
            assignee: {
              accountId: 'emp123',
              displayName: 'John Developer'
            },
            status: { name: 'Done' },
            created: '2024-01-06T10:00:00.000Z',
            updated: '2024-01-20T15:30:00.000Z',
            comment: { total: 1 }
          }
        }
      ];

      mockHelpers.setMockState({
        jiraTickets: mockJiraTickets
      });

      // Step 2: Execute knowledge gap detection
      const gapScanResult = await scanForGaps({});
      
      expect(gapScanResult.success).toBe(true);
      expect(gapScanResult.reports).toBeDefined();
      expect(gapScanResult.reports.length).toBeGreaterThan(0);
      
      const report = gapScanResult.reports[0];
      expect(report.userId).toBe('emp123');
      expect(report.ticketCount).toBe(6); // Should detect 6 tickets for this user
      expect(report.riskLevel).toBeDefined();

      // Step 3: Create interview context based on detected gaps
      const interviewContext = createInterviewContext({
        employeeId: report.userId,
        department: 'Engineering',
        role: 'Senior Developer',
        identifiedGaps: [{
          ticketCount: report.ticketCount,
          ticketId: 'PROJ-123', // Add ticketId to make it available in relatedTickets
          description: 'High activity with minimal documentation'
        }]
      });

      expect(interviewContext.employeeId).toBe('emp123');
      expect(interviewContext.sessionId).toBeDefined();
      expect(interviewContext.identifiedGaps).toHaveLength(1);

      // Step 4: Simulate interview responses
      const interviewResponses = [
        {
          question: 'What undocumented processes do you use in your daily work?',
          answer: 'I have a custom deployment script that handles database migrations automatically. It connects to the legacy BILLING system and ensures data consistency during updates. This process isn\'t documented anywhere but is critical for our releases.'
        },
        {
          question: 'What knowledge would be difficult for a replacement to figure out?',
          answer: 'The integration with the legacy BILLING system requires specific API calls in a particular order. There\'s also a manual verification step that checks data integrity after migrations. The timing is crucial - you have to wait for the cache to clear before running the verification.'
        },
        {
          question: 'Are there any tribal knowledge or shortcuts you use?',
          answer: 'Yes, there\'s a specific sequence for deploying to production that bypasses some of the automated checks when we need emergency fixes. Also, the monitoring dashboard has hidden filters that show the real system health - most people don\'t know about these.'
        }
      ];

      // Step 5: Extract knowledge from responses
      const knowledgeArtifact = extractKnowledgeFromResponses(interviewResponses, interviewContext);
      
      expect(knowledgeArtifact.employeeId).toBe('emp123');
      expect(knowledgeArtifact.title).toContain('Senior Developer');
      expect(knowledgeArtifact.content).toContain('deployment script');
      expect(knowledgeArtifact.content).toContain('BILLING system');
      expect(knowledgeArtifact.content).toContain('database migrations');
      expect(knowledgeArtifact.tags.length).toBeGreaterThan(0);
      expect(knowledgeArtifact.confidence).toBeGreaterThan(0.4); // Should be reasonable confidence due to detailed responses
      expect(knowledgeArtifact.relatedTickets).toContain('PROJ-123');

      // Step 6: Format knowledge for storage
      const formattedKnowledge = formatKnowledgeForStorage(knowledgeArtifact);
      
      expect(formattedKnowledge.title).toBeDefined();
      expect(formattedKnowledge.content).toContain('Knowledge Transfer Session');
      expect(formattedKnowledge.content).toContain('emp123');

      // Step 7: Save to Confluence
      mockHelpers.setMockState({
        confluenceResponse: {
          status: 201,
          data: {
            id: 'page123',
            title: formattedKnowledge.title,
            _links: {
              webui: '/spaces/KNOWLEDGE/pages/page123'
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

      const saveResult = await saveToConfluence(saveRequest);
      
      expect(saveResult.success).toBe(true);
      expect(saveResult.pageUrl).toContain('page123');
      expect(saveResult.pageId).toBe('page123');
      expect(saveResult.error).toBeNull();

      // Step 8: Verify end-to-end data flow integrity
      // The knowledge should contain information from the original gap detection
      expect(knowledgeArtifact.content).toContain('deployment');
      expect(knowledgeArtifact.tags).toContain('deployment');
      
      // The saved content should preserve the extracted knowledge
      expect(formattedKnowledge.content).toContain('deployment script');
      expect(formattedKnowledge.content).toContain('BILLING system');
      
      // Verify that the workflow maintains traceability
      expect(knowledgeArtifact.relatedTickets.length).toBeGreaterThan(0);
      expect(formattedKnowledge.content).toContain('PROJ-');
    });

    test('should handle workflow with minimal knowledge extraction', async () => {
      // Test workflow with brief, low-confidence responses
      const mockJiraTickets = [
        {
          id: '1',
          key: 'SIMPLE-1',
          fields: {
            summary: 'Simple task',
            description: 'Basic work',
            assignee: {
              accountId: 'emp456',
              displayName: 'Jane Developer'
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

      // Execute gap detection
      const gapScanResult = await scanForGaps({});
      
      // Should still work even with minimal data
      expect(gapScanResult.success).toBe(true);
      
      // Create context for minimal case
      const interviewContext = createInterviewContext({
        employeeId: 'emp456',
        department: 'Engineering',
        role: 'Developer'
      });

      // Simulate brief responses
      const briefResponses = [
        {
          question: 'What processes do you use?',
          answer: 'Nothing special.'
        },
        {
          question: 'Any undocumented knowledge?',
          answer: 'Not really.'
        }
      ];

      // Extract knowledge (should handle brief responses gracefully)
      const knowledgeArtifact = extractKnowledgeFromResponses(briefResponses, interviewContext);
      
      expect(knowledgeArtifact.employeeId).toBe('emp456');
      expect(knowledgeArtifact.confidence).toBeLessThan(0.3); // Low confidence for brief responses
      
      // Format and save (should still work)
      const formattedKnowledge = formatKnowledgeForStorage(knowledgeArtifact);
      
      mockHelpers.setMockState({
        confluenceResponse: {
          status: 201,
          data: {
            id: 'page456',
            title: formattedKnowledge.title,
            _links: {
              webui: '/spaces/KNOWLEDGE/pages/page456'
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

      const saveResult = await saveToConfluence(saveRequest);
      
      expect(saveResult.success).toBe(true);
      expect(saveResult.pageUrl).toContain('page456');
    });
  });

  describe('Error Recovery Across Component Boundaries', () => {
    /**
     * Test error handling and recovery across different components
     * Validates: Requirements 5.1
     */
    test('should handle Jira API errors gracefully in workflow', async () => {
      // Simulate Jira API error
      mockHelpers.simulateError('jira');

      const gapScanResult = await scanForGaps({});
      
      // Should handle error gracefully - the scanner catches errors and returns empty results
      expect(gapScanResult.success).toBe(true);
      expect(gapScanResult.reports).toEqual([]);
      
      // Workflow should be able to continue with manual context creation
      const manualContext = createInterviewContext({
        employeeId: 'emp789',
        department: 'Engineering',
        role: 'Senior Developer',
        identifiedGaps: [
          { ticketCount: 5, description: 'Manually identified gaps' }
        ]
      });

      expect(manualContext.employeeId).toBe('emp789');
      expect(manualContext.identifiedGaps).toHaveLength(1);
      
      // Knowledge extraction should still work
      const responses = [
        {
          question: 'Test question',
          answer: 'Detailed response about processes and systems.'
        }
      ];

      const artifact = extractKnowledgeFromResponses(responses, manualContext);
      expect(artifact.employeeId).toBe('emp789');
    });

    test('should handle Confluence API errors in workflow', async () => {
      // Set up successful gap detection
      const mockJiraTickets = [
        {
          id: '1',
          key: 'TEST-1',
          fields: {
            summary: 'Test ticket',
            description: 'Test description',
            assignee: {
              accountId: 'emp999',
              displayName: 'Test User'
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

      // Execute successful gap detection
      const gapScanResult = await scanForGaps({});
      expect(gapScanResult.success).toBe(true);

      // Create interview context and extract knowledge
      const context = createInterviewContext({
        employeeId: 'emp999',
        department: 'Engineering',
        role: 'Developer'
      });

      const responses = [
        {
          question: 'Test question',
          answer: 'Test knowledge about systems and processes.'
        }
      ];

      const artifact = extractKnowledgeFromResponses(responses, context);
      const formatted = formatKnowledgeForStorage(artifact);

      // Simulate Confluence API error
      mockHelpers.simulateError('confluence');

      const saveRequest = {
        payload: {
          title: formatted.title,
          content: formatted.content
        }
      };

      const saveResult = await saveToConfluence(saveRequest);
      
      // Should handle Confluence error gracefully
      expect(saveResult.success).toBe(false);
      expect(saveResult.error).toBeDefined();
      expect(saveResult.pageUrl).toBeNull();
      
      // Knowledge extraction should still be valid even if save fails
      expect(artifact.content).toContain('systems and processes');
      expect(formatted.content).toContain('Knowledge Transfer Session');
    });

    test('should handle permission errors across workflow', async () => {
      // Test 403 Forbidden error handling throughout workflow
      
      // First, test with successful Jira but failed Confluence
      const mockJiraTickets = [
        {
          id: '1',
          key: 'PERM-1',
          fields: {
            summary: 'Permission test',
            description: 'Test description',
            assignee: {
              accountId: 'emp403',
              displayName: 'Permission User'
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

      // Gap detection should work
      const gapScanResult = await scanForGaps({});
      expect(gapScanResult.success).toBe(true);

      // Knowledge extraction should work
      const context = createInterviewContext({
        employeeId: 'emp403',
        department: 'Engineering',
        role: 'Developer'
      });

      const responses = [
        {
          question: 'Permission test question',
          answer: 'Knowledge that should be preserved even if save fails due to permissions.'
        }
      ];

      const artifact = extractKnowledgeFromResponses(responses, context);
      const formatted = formatKnowledgeForStorage(artifact);

      // Simulate 403 Forbidden error for Confluence
      mockHelpers.simulateError('403');

      const saveRequest = {
        payload: {
          title: formatted.title,
          content: formatted.content
        }
      };

      const saveResult = await saveToConfluence(saveRequest);
      
      // Should handle 403 error gracefully without exposing sensitive info
      expect(saveResult.success).toBe(false);
      expect(saveResult.error).toContain('Permission denied');
      expect(saveResult.error).not.toContain('403'); // Should not expose raw error codes
      
      // Knowledge should still be extractable for manual handling
      expect(artifact.content).toContain('preserved');
      expect(formatted.title).toBeDefined();
    });

    test('should maintain data integrity during partial failures', async () => {
      // Test that data remains consistent even when parts of the workflow fail
      
      const mockJiraTickets = [
        {
          id: '1',
          key: 'INTEGRITY-1',
          fields: {
            summary: 'Data integrity test',
            description: 'Test for maintaining data consistency',
            assignee: {
              accountId: 'emp-integrity',
              displayName: 'Integrity User'
            },
            status: { name: 'Done' },
            created: '2024-01-01T10:00:00.000Z',
            updated: '2024-01-02T10:00:00.000Z',
            comment: { total: 2 }
          }
        }
      ];

      mockHelpers.setMockState({
        jiraTickets: mockJiraTickets
      });

      // Execute gap detection
      const gapScanResult = await scanForGaps({});
      expect(gapScanResult.success).toBe(true);
      
      const originalReport = gapScanResult.reports[0];
      
      // Create context
      const context = createInterviewContext({
        employeeId: originalReport.userId,
        department: 'Engineering',
        role: 'Developer',
        identifiedGaps: [{
          ticketCount: originalReport.ticketCount,
          description: 'Test gap'
        }]
      });

      // Extract knowledge
      const responses = [
        {
          question: 'Data integrity question',
          answer: 'This knowledge should remain consistent throughout the workflow, even if later steps fail. The ticket INTEGRITY-1 contains important information.'
        }
      ];

      const artifact = extractKnowledgeFromResponses(responses, context);
      
      // Verify data integrity before save attempt
      expect(artifact.employeeId).toBe(originalReport.userId);
      expect(artifact.content).toContain('INTEGRITY-1');
      // Note: relatedTickets comes from context.identifiedGaps, not from content parsing
      expect(artifact.relatedTickets).toEqual([]); // Empty because we didn't provide ticketId in identifiedGaps
      
      // Format knowledge
      const formatted = formatKnowledgeForStorage(artifact);
      
      // Verify formatted data maintains integrity
      expect(formatted.content).toContain('INTEGRITY-1');
      expect(formatted.content).toContain(originalReport.userId);
      
      // Even if save fails, the extracted and formatted knowledge should remain valid
      mockHelpers.simulateError('confluence');
      
      const saveRequest = {
        payload: {
          title: formatted.title,
          content: formatted.content
        }
      };

      const saveResult = await saveToConfluence(saveRequest);
      expect(saveResult.success).toBe(false);
      
      // Data integrity should be maintained
      expect(artifact.employeeId).toBe(originalReport.userId);
      expect(artifact.content).toContain('INTEGRITY-1');
      expect(formatted.content).toContain('INTEGRITY-1');
      expect(formatted.title).toBeDefined();
    });
  });

  describe('Cross-Component Data Flow Validation', () => {
    test('should maintain consistent data types across workflow', async () => {
      // Test that data types remain consistent as data flows between components
      
      const mockJiraTickets = [
        {
          id: '1',
          key: 'TYPE-1',
          fields: {
            summary: 'Type consistency test',
            description: 'Testing data type consistency',
            assignee: {
              accountId: 'emp-types',
              displayName: 'Type User'
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
            id: 'page-types',
            title: 'Type Test Page',
            _links: {
              webui: '/spaces/KNOWLEDGE/pages/page-types'
            }
          }
        }
      });

      // Execute workflow and validate data types at each step
      const gapScanResult = await scanForGaps({});
      
      // Validate gap scan result types
      expect(typeof gapScanResult.success).toBe('boolean');
      expect(Array.isArray(gapScanResult.reports)).toBe(true);
      expect(typeof gapScanResult.reports[0].userId).toBe('string');
      expect(typeof gapScanResult.reports[0].ticketCount).toBe('number');
      expect(typeof gapScanResult.reports[0].documentationRatio).toBe('number');
      
      const context = createInterviewContext({
        employeeId: gapScanResult.reports[0].userId,
        department: 'Engineering',
        role: 'Developer'
      });

      // Validate context types
      expect(typeof context.employeeId).toBe('string');
      expect(typeof context.department).toBe('string');
      expect(typeof context.role).toBe('string');
      expect(typeof context.sessionId).toBe('string');
      expect(Array.isArray(context.identifiedGaps)).toBe(true);

      const responses = [
        {
          question: 'Type test question',
          answer: 'Type test answer with sufficient detail for confidence calculation.'
        }
      ];

      const artifact = extractKnowledgeFromResponses(responses, context);
      
      // Validate artifact types
      expect(typeof artifact.id).toBe('string');
      expect(typeof artifact.employeeId).toBe('string');
      expect(typeof artifact.title).toBe('string');
      expect(typeof artifact.content).toBe('string');
      expect(Array.isArray(artifact.tags)).toBe(true);
      expect(artifact.extractedAt instanceof Date).toBe(true);
      expect(typeof artifact.confidence).toBe('number');
      expect(Array.isArray(artifact.relatedTickets)).toBe(true);

      const formatted = formatKnowledgeForStorage(artifact);
      
      // Validate formatted types
      expect(typeof formatted.title).toBe('string');
      expect(typeof formatted.content).toBe('string');

      const saveRequest = {
        payload: {
          title: formatted.title,
          content: formatted.content
        }
      };

      const saveResult = await saveToConfluence(saveRequest);
      
      // Validate save result types
      expect(typeof saveResult.success).toBe('boolean');
      expect(typeof saveResult.pageUrl).toBe('string');
      expect(typeof saveResult.pageId).toBe('string');
      expect(saveResult.error).toBeNull();
    });

    test('should handle edge cases in data flow', async () => {
      // Test workflow with edge case data
      
      const edgeCaseTickets = [
        {
          id: '1',
          key: 'EDGE-1',
          fields: {
            summary: '', // Empty summary
            description: null, // Null description
            assignee: {
              accountId: 'emp-edge',
              displayName: 'Edge User'
            },
            status: { name: 'Done' },
            created: '2024-01-01T10:00:00.000Z',
            updated: '2024-01-02T10:00:00.000Z',
            comment: { total: 0 } // No comments
          }
        }
      ];

      mockHelpers.setMockState({
        jiraTickets: edgeCaseTickets,
        confluenceResponse: {
          status: 201,
          data: {
            id: 'page-edge',
            title: 'Edge Case Page',
            _links: {
              webui: '/spaces/KNOWLEDGE/pages/page-edge'
            }
          }
        }
      });

      // Should handle edge case data gracefully
      const gapScanResult = await scanForGaps({});
      expect(gapScanResult.success).toBe(true);

      const context = createInterviewContext({
        employeeId: 'emp-edge',
        department: '', // Empty department
        role: null // Null role
      });

      // Should handle empty/null values (the function uses defaults from parameters)
      expect(context.department).toBe(''); // Empty string is passed through
      expect(context.role).toBe(null); // Null is passed through

      const edgeResponses = [
        {
          question: 'Edge case question',
          answer: '' // Empty answer
        }
      ];

      const artifact = extractKnowledgeFromResponses(edgeResponses, context);
      
      // Should handle empty responses gracefully
      expect(artifact.employeeId).toBe('emp-edge');
      expect(artifact.confidence).toBe(0); // Should be 0 for empty responses
      expect(Array.isArray(artifact.tags)).toBe(true);

      const formatted = formatKnowledgeForStorage(artifact);
      
      // Should still produce valid formatted output
      expect(formatted.title).toBeDefined();
      expect(formatted.content).toBeDefined();
      expect(formatted.content.length).toBeGreaterThan(0);
    });
  });
});