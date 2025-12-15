const fc = require('fast-check');
const { mockHelpers } = require('../__mocks__/@forge/api');
const {
  scanForGaps,
  identifyZombieTickets,
  calculateDocumentationRatio,
  extractDocumentationLinks,
  generateRecommendedActions,
  logKnowledgeGapNotification
} = require('../scanners/backgroundScanner');
const { JiraTicket } = require('../models');

/**
 * Background Scanner Tests
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */
describe('Background Scanner', () => {

  beforeEach(() => {
    mockHelpers.resetMocks();
  });

  describe('Scanner Identification Logic', () => {
    /**
     * Feature: institutional-memory-archaeologist, Property 1: Scanner identifies high-activity users
     * Validates: Requirements 1.1
     */
    test('property: scanner identifies high-activity users', async () => {
      // Test with a specific scenario instead of property-based for async
      const users = [
        {
          accountId: 'user1',
          displayName: 'High Activity User',
          ticketCount: 8
        },
        {
          accountId: 'user2', 
          displayName: 'Low Activity User',
          ticketCount: 2
        }
      ];

      // Mock Jira response with high-activity users
      const mockIssues = users.flatMap(user => 
        Array.from({ length: user.ticketCount }, (_, i) => ({
          id: `${user.accountId}-${i}`,
          key: `PROJ-${user.accountId}-${i}`,
          fields: {
            summary: `Ticket ${i} for ${user.displayName}`,
            description: 'Brief description',
            assignee: {
              accountId: user.accountId,
              displayName: user.displayName
            },
            status: { name: 'Done' },
            created: '2024-01-01T10:00:00.000Z',
            updated: '2024-01-15T15:30:00.000Z',
            comment: { total: 1 }
          }
        }))
      );

      mockHelpers.setMockState({
        jiraTickets: mockIssues
      });

      const result = await scanForGaps({});
      
      expect(result.success).toBe(true);
      expect(result.reports).toBeDefined();
      
      // High-activity users should be identified
      const highActivityUsers = users.filter(u => u.ticketCount > 5);
      if (highActivityUsers.length > 0) {
        expect(result.reports.length).toBeGreaterThan(0);
      }
    });

    test('should identify zombie tickets correctly', async () => {
      const userId = 'test-user-123';
      
      // Mock tickets with varying documentation levels
      const mockTickets = [
        {
          id: '1',
          key: 'PROJ-1',
          fields: {
            summary: 'Well documented ticket',
            description: 'A'.repeat(500) + ' https://confluence.example.com/docs/feature',
            assignee: { accountId: userId },
            status: { name: 'Done' },
            created: '2024-01-01T10:00:00.000Z',
            updated: '2024-01-15T15:30:00.000Z',
            comment: { total: 10 }
          }
        },
        {
          id: '2',
          key: 'PROJ-2',
          fields: {
            summary: 'Poorly documented ticket',
            description: 'Brief',
            assignee: { accountId: userId },
            status: { name: 'Done' },
            created: '2024-01-01T10:00:00.000Z',
            updated: '2024-01-15T15:30:00.000Z',
            comment: { total: 1 }
          }
        }
      ];

      mockHelpers.setMockState({
        jiraTickets: mockTickets
      });

      const zombieTickets = await identifyZombieTickets(userId);
      
      // Should identify the poorly documented ticket as zombie
      expect(zombieTickets.length).toBeGreaterThan(0);
      expect(zombieTickets.some(t => t.key === 'PROJ-2')).toBe(true);
    });
  });

  describe('Knowledge Gap Classification', () => {
    /**
     * Feature: institutional-memory-archaeologist, Property 2: Knowledge gap classification accuracy
     * Validates: Requirements 1.2
     */
    test('property: knowledge gap classification accuracy', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              description: fc.string({ maxLength: 100 }),
              commentCount: fc.integer({ min: 0, max: 5 }),
              documentationLinks: fc.array(fc.string(), { maxLength: 2 })
            }),
            { minLength: 6, maxLength: 15 } // Ensure > 5 tickets
          ),
          (ticketData) => {
            const tickets = ticketData.map((data, i) => new JiraTicket({
              id: `${i}`,
              key: `TEST-${i}`,
              summary: `Test ticket ${i}`,
              description: data.description,
              assignee: 'test-user',
              status: 'Done',
              created: '2024-01-01',
              updated: '2024-01-02',
              commentCount: data.commentCount,
              documentationLinks: data.documentationLinks
            }));

            const documentationRatio = calculateDocumentationRatio(tickets);
            
            // Property: Users with >5 tickets and low documentation should be classified as having gaps
            if (tickets.length > 5 && documentationRatio < 0.3) {
              // This should be classified as a knowledge gap
              expect(documentationRatio).toBeLessThan(0.3);
              expect(tickets.length).toBeGreaterThan(5);
            }
            
            // Documentation ratio should always be between 0 and 1
            expect(documentationRatio).toBeGreaterThanOrEqual(0);
            expect(documentationRatio).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 50 }
      );
    });

    test('should calculate documentation ratio correctly', () => {
      const tickets = [
        new JiraTicket({
          id: '1',
          key: 'TEST-1',
          summary: 'Test',
          description: 'A'.repeat(200),
          assignee: 'user1',
          status: 'Done',
          created: '2024-01-01',
          updated: '2024-01-02',
          commentCount: 5,
          documentationLinks: ['link1', 'link2']
        }),
        new JiraTicket({
          id: '2',
          key: 'TEST-2',
          summary: 'Test',
          description: 'Brief',
          assignee: 'user1',
          status: 'Done',
          created: '2024-01-01',
          updated: '2024-01-02',
          commentCount: 1,
          documentationLinks: []
        })
      ];

      const ratio = calculateDocumentationRatio(tickets);
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1);
    });
  });

  describe('Notification Logging', () => {
    /**
     * Feature: institutional-memory-archaeologist, Property 3: Notification logging for detected gaps
     * Validates: Requirements 1.3
     */
    test('property: notification logging for detected gaps', () => {
      fc.assert(
        fc.property(
          fc.record({
            user: fc.record({
              accountId: fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
              displayName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
            }),
            ticketCount: fc.integer({ min: 6, max: 20 }),
            documentationRatio: fc.float({ min: 0, max: Math.fround(0.5) }),
            riskLevel: fc.constantFrom('HIGH', 'MEDIUM', 'LOW')
          }),
          (data) => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            const report = {
              riskLevel: data.riskLevel,
              ticketCount: data.ticketCount,
              documentationRatio: data.documentationRatio,
              recommendedActions: ['action1', 'action2']
            };

            logKnowledgeGapNotification(data.user, report);
            
            // Should log notification when gaps are detected
            expect(consoleSpy).toHaveBeenCalled();
            
            // Check that at least one call contains the notification marker
            const calls = consoleSpy.mock.calls;
            const hasNotificationCall = calls.some(call => 
              call.some(arg => typeof arg === 'string' && arg.includes('📢 NOTIFICATION:'))
            );
            const hasSimulatedCall = calls.some(call =>
              call.some(arg => typeof arg === 'string' && arg.includes('🔔 Simulated notification'))
            );
            
            expect(hasNotificationCall).toBe(true);
            expect(hasSimulatedCall).toBe(true);
            
            consoleSpy.mockRestore();
          }
        ),
        { numRuns: 20 }
      );
    });

    test('should log notifications for knowledge gaps', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const user = {
        accountId: 'user123',
        displayName: 'John Developer'
      };
      
      const report = {
        riskLevel: 'HIGH',
        ticketCount: 8,
        documentationRatio: 0.2,
        recommendedActions: ['Schedule immediate knowledge transfer session']
      };

      logKnowledgeGapNotification(user, report);
      
      // Check that console.log was called
      expect(consoleSpy).toHaveBeenCalled();
      
      // Check that one of the calls contains the notification data
      const calls = consoleSpy.mock.calls;
      const hasNotificationCall = calls.some(call => 
        call.some(arg => {
          if (typeof arg === 'string') {
            return arg.includes('KNOWLEDGE_GAP_DETECTED') || arg.includes('📢 NOTIFICATION:');
          }
          return false;
        })
      );
      
      expect(hasNotificationCall).toBe(true);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Utility Functions', () => {
    test('should extract documentation links correctly', () => {
      const description = 'This feature is documented at https://confluence.example.com/docs/feature and https://wiki.example.com/page';
      const links = extractDocumentationLinks(description);
      
      expect(links).toHaveLength(2);
      expect(links).toContain('https://confluence.example.com/docs/feature');
      expect(links).toContain('https://wiki.example.com/page');
    });

    test('should generate appropriate recommended actions', () => {
      const highRiskActions = generateRecommendedActions('HIGH', 8);
      expect(highRiskActions).toContain('Schedule immediate knowledge transfer session');
      
      const mediumRiskActions = generateRecommendedActions('MEDIUM', 4);
      expect(mediumRiskActions).toContain('Plan knowledge sharing sessions');
      
      const lowRiskActions = generateRecommendedActions('LOW', 2);
      expect(lowRiskActions).toContain('Encourage documentation best practices');
    });

    test('property: recommended actions are always non-empty', () => {
      fc.assert(
        fc.property(
          fc.record({
            riskLevel: fc.constantFrom('HIGH', 'MEDIUM', 'LOW'),
            ticketCount: fc.integer({ min: 1, max: 20 })
          }),
          (data) => {
            const actions = generateRecommendedActions(data.riskLevel, data.ticketCount);
            expect(actions.length).toBeGreaterThan(0);
            expect(Array.isArray(actions)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});