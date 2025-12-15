const { mockHelpers } = require('../__mocks__/@forge/api');
const api = require('@forge/api');

/**
 * API Mocks Validation Tests
 * Validates: Requirements 5.2, 5.3, 5.4
 */
describe('API Mocks', () => {

  beforeEach(() => {
    mockHelpers.resetMocks();
  });

  describe('Jira API Mocks', () => {
    test('should return expected Zombie Ticket data', async () => {
      const response = await api.asApp().requestJira('/rest/api/3/search?jql=test');
      
      expect(response.status).toBe(200);
      expect(response.data.issues).toBeDefined();
      expect(Array.isArray(response.data.issues)).toBe(true);
      expect(response.data.issues.length).toBeGreaterThan(0);
      
      // Check for zombie tickets in the mock data
      const zombieTickets = response.data.issues.filter(issue => 
        issue.key.includes('ZOMBIE') || 
        (issue.fields.description && issue.fields.description.length < 50)
      );
      expect(zombieTickets.length).toBeGreaterThan(0);
    });

    test('should handle JQL search queries correctly', async () => {
      const jql = 'assignee = "user123" AND updated >= -30d';
      const response = await api.asApp().requestJira(`/rest/api/3/search?jql=${encodeURIComponent(jql)}`);
      
      expect(response.status).toBe(200);
      expect(response.data.issues).toBeDefined();
      expect(response.data.total).toBeDefined();
      expect(typeof response.data.total).toBe('number');
    });

    test('should return consistent ticket structure', async () => {
      const response = await api.asApp().requestJira('/rest/api/3/search?jql=test');
      const tickets = response.data.issues;
      
      tickets.forEach(ticket => {
        expect(ticket).toHaveProperty('id');
        expect(ticket).toHaveProperty('key');
        expect(ticket).toHaveProperty('fields');
        expect(ticket.fields).toHaveProperty('summary');
        expect(ticket.fields).toHaveProperty('assignee');
        expect(ticket.fields.assignee).toHaveProperty('accountId');
        expect(ticket.fields.assignee).toHaveProperty('displayName');
      });
    });

    test('should support mock state customization', async () => {
      const customTickets = [
        mockHelpers.createMockJiraTicket({
          key: 'CUSTOM-001',
          fields: {
            summary: 'Custom test ticket',
            assignee: {
              accountId: 'custom_user',
              displayName: 'Custom User'
            }
          }
        })
      ];

      mockHelpers.setMockJiraTickets(customTickets);
      
      const response = await api.asApp().requestJira('/rest/api/3/search?jql=test');
      
      expect(response.data.issues).toHaveLength(1);
      expect(response.data.issues[0].key).toBe('CUSTOM-001');
      expect(response.data.issues[0].fields.summary).toBe('Custom test ticket');
    });
  });

  describe('Confluence API Mocks', () => {
    test('should return proper 200 OK responses for user validation', async () => {
      const response = await api.asUser().requestConfluence('/wiki/rest/api/user/current');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('accountId');
      expect(response.data).toHaveProperty('displayName');
    });

    test('should handle page creation requests', async () => {
      const pageData = {
        type: 'page',
        title: 'Test Page',
        space: { key: 'TEST' },
        body: {
          storage: {
            value: '<p>Test content</p>',
            representation: 'storage'
          }
        }
      };

      const response = await api.asUser().requestConfluence('/wiki/rest/api/content', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pageData)
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('id');
      expect(response.data).toHaveProperty('title');
      expect(response.data).toHaveProperty('_links');
      expect(response.data._links).toHaveProperty('webui');
    });

    test('should support custom Confluence responses', async () => {
      const customResponse = mockHelpers.createMockConfluenceResponse({
        status: 201,
        data: {
          id: 'custom_page_123',
          title: 'Custom Test Page',
          _links: {
            webui: '/spaces/CUSTOM/pages/custom_page_123'
          }
        }
      });

      mockHelpers.setMockState({ confluenceResponse: customResponse });

      const response = await api.asUser().requestConfluence('/wiki/rest/api/content', {
        method: 'POST'
      });

      expect(response.status).toBe(201);
      expect(response.data.id).toBe('custom_page_123');
      expect(response.data.title).toBe('Custom Test Page');
    });
  });

  describe('Error Scenario Mocks', () => {
    test('should trigger 403 Forbidden errors appropriately', async () => {
      mockHelpers.simulate403Error();

      const response = await api.asUser().requestConfluence('/wiki/rest/api/user/current');

      expect(response.status).toBe(403);
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toContain('Forbidden');
    });

    test('should handle network errors', async () => {
      mockHelpers.simulateNetworkError();

      await expect(async () => {
        await api.asApp().requestJira('/rest/api/3/search?jql=test');
      }).rejects.toThrow();
    });

    test('should simulate various HTTP error codes', async () => {
      // Test 404 error
      mockHelpers.simulate404Error();
      let response = await api.asUser().requestConfluence('/wiki/rest/api/content/nonexistent');
      expect(response.status).toBe(404);

      // Reset and test 500 error
      mockHelpers.resetMocks();
      mockHelpers.simulate500Error();
      response = await api.asUser().requestConfluence('/wiki/rest/api/content');
      expect(response.status).toBe(500);
    });

    test('should handle Confluence-specific errors', async () => {
      mockHelpers.simulateError('confluence');

      await expect(async () => {
        await api.asUser().requestConfluence('/wiki/rest/api/user/current');
      }).rejects.toThrow('Permission validation failed');
    });
  });

  describe('Mock Helper Functions', () => {
    test('should create valid mock Jira tickets', () => {
      const ticket = mockHelpers.createMockJiraTicket({
        key: 'TEST-123',
        fields: {
          summary: 'Test ticket summary'
        }
      });

      expect(ticket).toHaveProperty('id');
      expect(ticket).toHaveProperty('key', 'TEST-123');
      expect(ticket.fields).toHaveProperty('summary', 'Test ticket summary');
      expect(ticket.fields).toHaveProperty('assignee');
      expect(ticket.fields.assignee).toHaveProperty('accountId');
    });

    test('should create valid mock Confluence responses', () => {
      const response = mockHelpers.createMockConfluenceResponse({
        status: 201,
        data: {
          title: 'Custom Page Title'
        }
      });

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('id');
      expect(response.data).toHaveProperty('title', 'Custom Page Title');
      expect(response.data).toHaveProperty('_links');
    });

    test('should track API call history', async () => {
      await api.asApp().requestJira('/rest/api/3/search?jql=test');
      await api.asUser().requestConfluence('/wiki/rest/api/user/current');

      const history = mockHelpers.getApiCallHistory();
      
      expect(history.jiraCalls.length).toBeGreaterThan(0);
      expect(history.confluenceCalls.length).toBeGreaterThan(0);
    });

    test('should verify specific API calls were made', async () => {
      await api.asApp().requestJira('/rest/api/3/search?jql=assignee="user123"');
      await api.asUser().requestConfluence('/wiki/rest/api/content', {
        method: 'POST'
      });

      expect(mockHelpers.verifyApiCalled('jira', '/search')).toBe(true);
      expect(mockHelpers.verifyApiCalled('confluence', '/content', 'POST')).toBe(true);
      expect(mockHelpers.verifyApiCalled('jira', '/nonexistent')).toBe(false);
    });

    test('should manage mock state correctly', () => {
      const initialState = mockHelpers.getMockState();
      expect(initialState.shouldThrowError).toBe(false);

      mockHelpers.simulateError('test');
      const errorState = mockHelpers.getMockState();
      expect(errorState.shouldThrowError).toBe(true);
      expect(errorState.errorType).toBe('test');

      mockHelpers.resetMocks();
      const resetState = mockHelpers.getMockState();
      expect(resetState.shouldThrowError).toBe(false);
      expect(resetState.errorType).toBeNull();
    });

    test('should add and manage Jira tickets dynamically', () => {
      const initialTickets = mockHelpers.getMockState().jiraTickets;
      const initialCount = initialTickets.length;

      const newTickets = [
        mockHelpers.createMockJiraTicket({ key: 'NEW-001' }),
        mockHelpers.createMockJiraTicket({ key: 'NEW-002' })
      ];

      mockHelpers.addMockJiraTickets(newTickets);
      
      const updatedState = mockHelpers.getMockState();
      expect(updatedState.jiraTickets.length).toBe(initialCount + 2);
      expect(updatedState.jiraTickets.some(t => t.key === 'NEW-001')).toBe(true);
      expect(updatedState.jiraTickets.some(t => t.key === 'NEW-002')).toBe(true);
    });
  });

  describe('Route Template Function', () => {
    test('should handle route template substitution', () => {
      const template = '/wiki/spaces/{spaceKey}/pages/{pageId}';
      const params = { spaceKey: 'TEST', pageId: '12345' };
      
      const result = api.route(template, params);
      
      expect(result).toBe('/wiki/spaces/TEST/pages/12345');
    });

    test('should handle templates without parameters', () => {
      const template = '/wiki/rest/api/user/current';
      const result = api.route(template);
      
      expect(result).toBe('/wiki/rest/api/user/current');
    });

    test('should handle partial parameter substitution', () => {
      const template = '/wiki/spaces/{spaceKey}/pages/{pageId}/comments';
      const params = { spaceKey: 'TEST' };
      
      const result = api.route(template, params);
      
      expect(result).toBe('/wiki/spaces/TEST/pages/{pageId}/comments');
    });
  });
});