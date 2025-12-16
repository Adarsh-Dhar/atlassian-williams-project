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
    test('should trigger 403 Forbidden errors appropriately for Confluence', async () => {
      mockHelpers.simulate403Error();

      const response = await api.asUser().requestConfluence('/wiki/rest/api/user/current');

      expect(response.status).toBe(403);
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toContain('Forbidden');
    });

    test('should trigger 403 Forbidden errors appropriately for Bitbucket', async () => {
      mockHelpers.simulateBitbucket403Error();

      const response = await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests');

      expect(response.status).toBe(403);
      expect(response.data.error).toHaveProperty('message');
      expect(response.data.error.message).toContain('Access denied');
    });

    test('should handle network errors for Jira', async () => {
      mockHelpers.simulateNetworkError();

      await expect(async () => {
        await api.asApp().requestJira('/rest/api/3/search?jql=test');
      }).rejects.toThrow();
    });

    test('should handle network errors for Bitbucket', async () => {
      mockHelpers.simulateBitbucketNetworkError();

      await expect(async () => {
        await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests');
      }).rejects.toThrow('Bitbucket API Error');
    });

    test('should simulate various HTTP error codes for Confluence', async () => {
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

    test('should simulate Bitbucket rate limiting', async () => {
      mockHelpers.simulateBitbucketRateLimit();

      const response = await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests');
      
      expect(response.status).toBe(429);
      expect(response.data.error.message).toContain('Rate limit exceeded');
      expect(response.headers).toHaveProperty('X-RateLimit-Limit');
      expect(response.headers['X-RateLimit-Remaining']).toBe('0');
    });

    test('should handle Confluence-specific errors', async () => {
      mockHelpers.simulateError('confluence');

      await expect(async () => {
        await api.asUser().requestConfluence('/wiki/rest/api/user/current');
      }).rejects.toThrow('Permission validation failed');
    });

    test('should handle all three API error scenarios in sequence', async () => {
      // Test Jira error
      mockHelpers.simulateNetworkError();
      await expect(async () => {
        await api.asApp().requestJira('/rest/api/3/search?jql=test');
      }).rejects.toThrow();

      // Reset and test Confluence error
      mockHelpers.resetMocks();
      mockHelpers.simulate403Error();
      let response = await api.asUser().requestConfluence('/wiki/rest/api/user/current');
      expect(response.status).toBe(403);

      // Reset and test Bitbucket error
      mockHelpers.resetMocks();
      mockHelpers.simulateBitbucket403Error();
      response = await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests');
      expect(response.status).toBe(403);
    });
  });

  describe('Bitbucket API Mocks', () => {
    test('should return expected PR data with proper structure', async () => {
      const response = await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests');
      
      expect(response.status).toBe(200);
      expect(response.data.values).toBeDefined();
      expect(Array.isArray(response.data.values)).toBe(true);
      expect(response.data.values.length).toBeGreaterThan(0);
      
      // Verify PR structure
      const pr = response.data.values[0];
      expect(pr).toHaveProperty('id');
      expect(pr).toHaveProperty('title');
      expect(pr).toHaveProperty('author');
      expect(pr.author).toHaveProperty('uuid');
      expect(pr).toHaveProperty('created_on');
      expect(pr).toHaveProperty('diff_stats');
      expect(pr.diff_stats).toHaveProperty('lines_added');
      expect(pr.diff_stats).toHaveProperty('lines_removed');
      expect(pr.diff_stats).toHaveProperty('files_changed');
    });

    test('should return expected commit data with proper structure', async () => {
      const response = await api.asApp().requestBitbucket('/repositories/workspace/repo/commits');
      
      expect(response.status).toBe(200);
      expect(response.data.values).toBeDefined();
      expect(Array.isArray(response.data.values)).toBe(true);
      expect(response.data.values.length).toBeGreaterThan(0);
      
      // Verify commit structure
      const commit = response.data.values[0];
      expect(commit).toHaveProperty('hash');
      expect(commit).toHaveProperty('message');
      expect(commit).toHaveProperty('author');
      expect(commit.author).toHaveProperty('user');
      expect(commit.author.user).toHaveProperty('uuid');
      expect(commit).toHaveProperty('date');
      expect(commit).toHaveProperty('diff_stats');
    });

    test('should enforce six-month constraint on PR data', async () => {
      const response = await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests?created_on>=2024-06-01');
      
      expect(response.status).toBe(200);
      const prs = response.data.values;
      
      // Verify all PRs are within 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      prs.forEach(pr => {
        const prDate = new Date(pr.created_on);
        expect(prDate.getTime()).toBeGreaterThanOrEqual(sixMonthsAgo.getTime());
      });
    });

    test('should enforce six-month constraint on commit data', async () => {
      const response = await api.asApp().requestBitbucket('/repositories/workspace/repo/commits?since=2024-06-01');
      
      expect(response.status).toBe(200);
      const commits = response.data.values;
      
      // Verify all commits are within 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      commits.forEach(commit => {
        const commitDate = new Date(commit.date);
        expect(commitDate.getTime()).toBeGreaterThanOrEqual(sixMonthsAgo.getTime());
      });
    });

    test('should filter PRs by user ID', async () => {
      const userId = 'user123';
      const response = await api.asApp().requestBitbucket(`/repositories/workspace/repo/pullrequests?author=${userId}`);
      
      expect(response.status).toBe(200);
      const prs = response.data.values;
      
      prs.forEach(pr => {
        expect(pr.author.uuid).toBe(userId);
      });
    });

    test('should filter commits by user ID', async () => {
      const userId = 'user123';
      const response = await api.asApp().requestBitbucket(`/repositories/workspace/repo/commits?author=${userId}`);
      
      expect(response.status).toBe(200);
      const commits = response.data.values;
      
      commits.forEach(commit => {
        expect(commit.author.user.uuid).toBe(userId);
      });
    });

    test('should return specific PR by ID', async () => {
      const prId = '402';
      const response = await api.asApp().requestBitbucket(`/repositories/workspace/repo/pullrequests/${prId}`);
      
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.id).toBeDefined();
      expect(response.data.id.toString()).toBe(prId);
      expect(response.data.title).toContain('authentication system');
    });

    test('should return 404 for non-existent PR', async () => {
      const response = await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests/99999');
      
      expect(response.status).toBe(404);
      expect(response.data.error.message).toContain('Pull request not found');
    });

    test('should return PR diff data', async () => {
      const response = await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests/402/diff');
      
      expect(response.status).toBe(200);
      expect(typeof response.data).toBe('string');
      expect(response.data).toContain('diff --git');
      expect(response.data).toContain('auth/oauth.js');
    });

    test('should handle Bitbucket rate limiting', async () => {
      mockHelpers.simulateBitbucketRateLimit();
      
      const response = await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests');
      
      expect(response.status).toBe(429);
      expect(response.data.error.message).toContain('Rate limit exceeded');
      expect(response.headers).toHaveProperty('X-RateLimit-Limit');
      expect(response.headers).toHaveProperty('X-RateLimit-Remaining');
      expect(response.headers).toHaveProperty('X-RateLimit-Reset');
    });

    test('should handle Bitbucket permission errors', async () => {
      mockHelpers.simulateBitbucket403Error();
      
      const response = await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests');
      
      expect(response.status).toBe(403);
      expect(response.data.error.message).toContain('Access denied');
    });

    test('should handle Bitbucket network errors', async () => {
      mockHelpers.simulateBitbucketNetworkError();
      
      await expect(async () => {
        await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests');
      }).rejects.toThrow('Bitbucket API Error');
    });

    test('should handle repository not found errors', async () => {
      mockHelpers.simulateBitbucketRepositoryNotFound();
      
      const response = await api.asApp().requestBitbucket('/repositories/workspace/nonexistent');
      
      expect(response.status).toBe(404);
      expect(response.data.error.message).toContain('Repository not found');
    });

    test('should track Bitbucket API calls', async () => {
      await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests');
      await api.asApp().requestBitbucket('/repositories/workspace/repo/commits');
      
      const history = mockHelpers.getApiCallHistory();
      expect(history.bitbucketCalls.length).toBe(2);
      expect(mockHelpers.verifyApiCalled('bitbucket', '/pullrequests')).toBe(true);
      expect(mockHelpers.verifyApiCalled('bitbucket', '/commits')).toBe(true);
    });
  });

  describe('Enhanced Bitbucket Helper Functions', () => {
    test('should create valid mock Bitbucket PRs', () => {
      const pr = mockHelpers.createMockBitbucketPR({
        id: 999,
        title: 'Test PR',
        author: { uuid: 'test_user' }
      });

      expect(pr.id).toBe(999);
      expect(pr.title).toBe('Test PR');
      expect(pr.author.uuid).toBe('test_user');
      expect(pr).toHaveProperty('created_on');
      expect(pr).toHaveProperty('diff_stats');
      expect(pr.diff_stats).toHaveProperty('lines_added');
    });

    test('should create valid mock Bitbucket commits', () => {
      const commit = mockHelpers.createMockBitbucketCommit({
        hash: 'test123',
        message: 'Test commit',
        author: { user: { uuid: 'test_user' } }
      });

      expect(commit.hash).toBe('test123');
      expect(commit.message).toBe('Test commit');
      expect(commit.author.user.uuid).toBe('test_user');
      expect(commit).toHaveProperty('date');
      expect(commit).toHaveProperty('diff_stats');
    });

    test('should create mock data within six months', () => {
      const { pr, commit } = mockHelpers.createMockDataWithinSixMonths('test_user');
      
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      expect(new Date(pr.created_on).getTime()).toBeGreaterThanOrEqual(sixMonthsAgo.getTime());
      expect(new Date(commit.date).getTime()).toBeGreaterThanOrEqual(sixMonthsAgo.getTime());
      expect(pr.author.uuid).toBe('test_user');
      expect(commit.author.user.uuid).toBe('test_user');
    });

    test('should create mock data outside six months', () => {
      const { pr, commit } = mockHelpers.createMockDataOutsideSixMonths('test_user');
      
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      expect(new Date(pr.created_on).getTime()).toBeLessThan(sixMonthsAgo.getTime());
      expect(new Date(commit.date).getTime()).toBeLessThan(sixMonthsAgo.getTime());
    });

    test('should filter data by six-month constraint', () => {
      const testData = [
        { created_on: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }, // 1 month ago
        { created_on: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString() }, // 6 months ago
        { created_on: new Date(Date.now() - 210 * 24 * 60 * 60 * 1000).toISOString() } // 7 months ago
      ];

      const filtered = mockHelpers.filterDataBySixMonthConstraint(testData);
      expect(filtered.length).toBe(2); // Should exclude the 7-month-old item
    });

    test('should validate six-month constraint', () => {
      const validData = [
        { created_on: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
        { created_on: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString() }
      ];

      const invalidData = [
        { created_on: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
        { created_on: new Date(Date.now() - 210 * 24 * 60 * 60 * 1000).toISOString() }
      ];

      expect(mockHelpers.validateSixMonthConstraint(validData)).toBe(true);
      expect(mockHelpers.validateSixMonthConstraint(invalidData)).toBe(false);
    });

    test('should get filtered Bitbucket data with constraints', () => {
      // Add test data
      const withinSixMonths = mockHelpers.createMockDataWithinSixMonths('user123');
      const outsideSixMonths = mockHelpers.createMockDataOutsideSixMonths('user123');
      
      mockHelpers.setBitbucketPRs([withinSixMonths.pr, outsideSixMonths.pr]);
      mockHelpers.setBitbucketCommits([withinSixMonths.commit, outsideSixMonths.commit]);

      const { prs, commits } = mockHelpers.getBitbucketDataWithConstraints('user123', true);
      
      expect(prs.length).toBe(1); // Only within 6 months
      expect(commits.length).toBe(1); // Only within 6 months
      expect(mockHelpers.validateSixMonthConstraint(prs)).toBe(true);
      expect(mockHelpers.validateSixMonthConstraint(commits, 'date')).toBe(true);
    });

    test('should manage Bitbucket mock state', () => {
      const testPRs = [mockHelpers.createMockBitbucketPR({ id: 999 })];
      const testCommits = [mockHelpers.createMockBitbucketCommit({ hash: 'test999' })];

      mockHelpers.setBitbucketPRs(testPRs);
      mockHelpers.setBitbucketCommits(testCommits);

      const state = mockHelpers.getMockState();
      expect(state.bitbucketPRs.length).toBe(1);
      expect(state.bitbucketCommits.length).toBe(1);
      expect(state.bitbucketPRs[0].id).toBe(999);
      expect(state.bitbucketCommits[0].hash).toBe('test999');

      mockHelpers.clearBitbucketData();
      const clearedState = mockHelpers.getMockState();
      expect(clearedState.bitbucketPRs.length).toBe(0);
      expect(clearedState.bitbucketCommits.length).toBe(0);
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

    test('should track API call history for all three APIs', async () => {
      await api.asApp().requestJira('/rest/api/3/search?jql=test');
      await api.asUser().requestConfluence('/wiki/rest/api/user/current');
      await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests');

      const history = mockHelpers.getApiCallHistory();
      
      expect(history.jiraCalls.length).toBeGreaterThan(0);
      expect(history.confluenceCalls.length).toBeGreaterThan(0);
      expect(history.bitbucketCalls.length).toBeGreaterThan(0);
    });

    test('should verify specific API calls were made for all APIs', async () => {
      await api.asApp().requestJira('/rest/api/3/search?jql=assignee="user123"');
      await api.asUser().requestConfluence('/wiki/rest/api/content', {
        method: 'POST'
      });
      await api.asApp().requestBitbucket('/repositories/workspace/repo/pullrequests');

      expect(mockHelpers.verifyApiCalled('jira', '/search')).toBe(true);
      expect(mockHelpers.verifyApiCalled('confluence', '/content', 'POST')).toBe(true);
      expect(mockHelpers.verifyApiCalled('bitbucket', '/pullrequests')).toBe(true);
      expect(mockHelpers.verifyApiCalled('jira', '/nonexistent')).toBe(false);
      expect(mockHelpers.verifyApiCalled('bitbucket', '/nonexistent')).toBe(false);
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