// Mock implementation for @forge/api
const mockJiraTickets = [
  {
    id: "10001",
    key: "PROJ-123",
    fields: {
      summary: "Undocumented feature implementation with complex authentication system refactoring",
      description: "Brief",
      assignee: { 
        accountId: "user123",
        displayName: "John Developer"
      },
      status: { name: "Done" },
      created: "2024-01-01T10:00:00.000Z",
      updated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      comment: { total: 5 }
    }
  },
  {
    id: "10002", 
    key: "PROJ-124",
    fields: {
      summary: "Another undocumented ticket with very long summary that exceeds fifty characters",
      description: "Brief description only",
      assignee: {
        accountId: "user123", 
        displayName: "John Developer"
      },
      status: { name: "Done" },
      created: "2024-01-02T09:00:00.000Z",
      updated: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
      comment: { total: 1 }
    }
  },
  {
    id: "10003",
    key: "PROJ-125", 
    fields: {
      summary: "Well documented ticket",
      description: "Comprehensive documentation with links and details",
      assignee: {
        accountId: "user456",
        displayName: "Jane Documenter"  
      },
      status: { name: "Done" },
      created: "2024-01-03T11:00:00.000Z",
      updated: "2024-01-17T16:45:00.000Z",
      comment: { total: 8 }
    }
  },
  // Additional zombie tickets for testing
  {
    id: "10004",
    key: "ZOMBIE-001",
    fields: {
      summary: "High activity zombie ticket with very long summary that definitely exceeds fifty characters",
      description: "Brief",
      assignee: {
        accountId: "user789",
        displayName: "Zombie Developer"
      },
      status: { name: "Done" },
      created: "2024-01-01T10:00:00.000Z",
      updated: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
      comment: { total: 6 }
    }
  },
  {
    id: "10005",
    key: "ZOMBIE-002", 
    fields: {
      summary: "Another zombie ticket with extremely long summary that should trigger critical detection",
      description: "",
      assignee: {
        accountId: "user789",
        displayName: "Zombie Developer"
      },
      status: { name: "In Progress" },
      created: "2024-01-05T10:00:00.000Z",
      updated: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days ago
      comment: { total: 4 }
    }
  }
];

const mockConfluenceResponse = {
  status: 200,
  data: {
    id: "page123",
    title: "Knowledge Capture Session",
    _links: {
      webui: "/spaces/KNOWLEDGE/pages/page123"
    }
  }
};

const mockErrorResponses = {
  403: {
    status: 403,
    data: {
      message: "Forbidden - Insufficient permissions"
    }
  },
  404: {
    status: 404, 
    data: {
      message: "Not Found - Resource does not exist"
    }
  },
  500: {
    status: 500,
    data: {
      message: "Internal Server Error"
    }
  }
};

// Enhanced Mock Bitbucket data with 6-month constraint testing
const sixMonthsAgo = new Date();
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

const threeMonthsAgo = new Date();
threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

const oneMonthAgo = new Date();
oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

const sevenMonthsAgo = new Date();
sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);

const mockBitbucketPRs = [
  // High complexity PR within 6 months - should be included
  {
    id: 402,
    title: "Refactor authentication system - critical security update with complex OAuth implementation",
    author: { uuid: "user123", display_name: "John Developer" },
    created_on: threeMonthsAgo.toISOString(),
    updated_on: threeMonthsAgo.toISOString(),
    merge_commit: { hash: "abc123def456" },
    diff_stats: {
      lines_added: 245,
      lines_removed: 89,
      files_changed: 8
    },
    comment_count: 12,
    state: "MERGED",
    source: { 
      repository: { name: "auth-service" },
      branch: { name: "feature/oauth-refactor" }
    },
    destination: { branch: { name: "main" } },
    complexity_score: 8.5, // High complexity
    reviewers: [
      { uuid: "reviewer1", approved: true },
      { uuid: "reviewer2", approved: true }
    ]
  },
  // Medium complexity PR within 6 months
  {
    id: 403,
    title: "Add new API endpoint for user management",
    author: { uuid: "user123", display_name: "John Developer" },
    created_on: oneMonthAgo.toISOString(),
    updated_on: oneMonthAgo.toISOString(),
    merge_commit: { hash: "def456ghi789" },
    diff_stats: {
      lines_added: 156,
      lines_removed: 23,
      files_changed: 4
    },
    comment_count: 5,
    state: "MERGED",
    source: { 
      repository: { name: "api-service" },
      branch: { name: "feature/user-api" }
    },
    destination: { branch: { name: "develop" } },
    complexity_score: 5.2, // Medium complexity
    reviewers: [
      { uuid: "reviewer1", approved: true }
    ]
  },
  // High complexity PR outside 6 months - should be excluded
  {
    id: 404,
    title: "Legacy system migration - massive refactoring effort",
    author: { uuid: "user123", display_name: "John Developer" },
    created_on: sevenMonthsAgo.toISOString(),
    updated_on: sevenMonthsAgo.toISOString(),
    merge_commit: { hash: "old123legacy" },
    diff_stats: {
      lines_added: 500,
      lines_removed: 300,
      files_changed: 15
    },
    comment_count: 25,
    state: "MERGED",
    source: { 
      repository: { name: "legacy-service" },
      branch: { name: "feature/migration" }
    },
    destination: { branch: { name: "main" } },
    complexity_score: 9.8, // Very high complexity but outside 6 months
    reviewers: [
      { uuid: "reviewer1", approved: true },
      { uuid: "reviewer2", approved: true },
      { uuid: "reviewer3", approved: true }
    ]
  },
  // Different user PR within 6 months
  {
    id: 405,
    title: "Bug fix for payment processing",
    author: { uuid: "user456", display_name: "Jane Developer" },
    created_on: oneMonthAgo.toISOString(),
    updated_on: oneMonthAgo.toISOString(),
    merge_commit: { hash: "bug456fix789" },
    diff_stats: {
      lines_added: 45,
      lines_removed: 12,
      files_changed: 2
    },
    comment_count: 3,
    state: "MERGED",
    source: { 
      repository: { name: "payment-service" },
      branch: { name: "bugfix/payment-error" }
    },
    destination: { branch: { name: "main" } },
    complexity_score: 2.1, // Low complexity
    reviewers: [
      { uuid: "reviewer1", approved: true }
    ]
  },
  // Test user PR within 6 months
  {
    id: 406,
    title: "Test PR for unit tests",
    author: { uuid: "test-user", display_name: "Test User" },
    created_on: oneMonthAgo.toISOString(),
    updated_on: oneMonthAgo.toISOString(),
    merge_commit: { hash: "test123hash" },
    diff_stats: {
      lines_added: 100,
      lines_removed: 50,
      files_changed: 5
    },
    comment_count: 8,
    state: "MERGED",
    source: { 
      repository: { name: "test-service" },
      branch: { name: "feature/test" }
    },
    destination: { branch: { name: "main" } },
    complexity_score: 6.0, // Medium complexity
    reviewers: [
      { uuid: "reviewer1", approved: true }
    ]
  }
];

const mockBitbucketCommits = [
  // Commit within 6 months - should be included
  {
    hash: "abc123def456",
    message: "Switch from SAML to OAuth implementation - critical security update",
    author: { 
      raw: "user123 <user123@company.com>",
      user: { uuid: "user123", display_name: "John Developer" }
    },
    date: threeMonthsAgo.toISOString(),
    diff_stats: {
      lines_added: 156,
      lines_removed: 89,
      files: ["auth/oauth.js", "auth/saml.js", "config/auth.json"]
    },
    repository: { name: "auth-service" },
    branch: { name: "feature/oauth" },
    parents: [{ hash: "parent123" }]
  },
  // Another commit within 6 months
  {
    hash: "def456ghi789",
    message: "Update API documentation and add new endpoints",
    author: { 
      raw: "user123 <user123@company.com>",
      user: { uuid: "user123", display_name: "John Developer" }
    },
    date: oneMonthAgo.toISOString(),
    diff_stats: {
      lines_added: 45,
      lines_removed: 12,
      files: ["docs/api.md", "README.md", "src/api/users.js"]
    },
    repository: { name: "api-service" },
    branch: { name: "feature/docs" },
    parents: [{ hash: "parent456" }]
  },
  // Commit outside 6 months - should be excluded
  {
    hash: "old789commit",
    message: "Initial project setup and configuration",
    author: { 
      raw: "John Developer <john@company.com>",
      user: { uuid: "user123", display_name: "John Developer" }
    },
    date: sevenMonthsAgo.toISOString(),
    diff_stats: {
      lines_added: 1000,
      lines_removed: 0,
      files: ["package.json", "src/index.js", "config/database.js"]
    },
    repository: { name: "main-service" },
    branch: { name: "main" },
    parents: []
  },
  // Different user commit within 6 months
  {
    hash: "jane456commit",
    message: "Fix payment processing bug",
    author: { 
      raw: "Jane Developer <jane@company.com>",
      user: { uuid: "user456", display_name: "Jane Developer" }
    },
    date: oneMonthAgo.toISOString(),
    diff_stats: {
      lines_added: 25,
      lines_removed: 8,
      files: ["src/payment/processor.js"]
    },
    repository: { name: "payment-service" },
    branch: { name: "bugfix/payment" },
    parents: [{ hash: "parent789" }]
  },
  // Test user commit within 6 months
  {
    hash: "test123commit",
    message: "Test commit for unit tests",
    author: { 
      raw: "test-user",
      user: { uuid: "test-user", display_name: "Test User" }
    },
    date: oneMonthAgo.toISOString(),
    diff_stats: {
      lines_added: 75,
      lines_removed: 25,
      files: ["src/test/feature.js", "test/unit.test.js"]
    },
    repository: { name: "test-service" },
    branch: { name: "feature/test" },
    parents: [{ hash: "parenttest" }]
  }
];

// Mock Bitbucket rate limiting and error scenarios
const mockBitbucketRateLimitResponse = {
  status: 429,
  data: {
    type: "error",
    error: {
      message: "Rate limit exceeded. Try again later.",
      detail: "You have exceeded the rate limit. Please wait before making more requests."
    }
  },
  headers: {
    'X-RateLimit-Limit': '1000',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': Math.floor(Date.now() / 1000) + 3600
  }
};

const mockBitbucketPermissionError = {
  status: 403,
  data: {
    type: "error",
    error: {
      message: "Access denied. You do not have permission to access this repository.",
      detail: "Repository access requires read permissions."
    }
  }
};

// Mock state for controlling responses
let mockState = {
  shouldThrowError: false,
  errorType: null,
  jiraTickets: mockJiraTickets,
  confluenceResponse: mockConfluenceResponse,
  bitbucketPRs: mockBitbucketPRs,
  bitbucketCommits: mockBitbucketCommits,
  bitbucketRateLimitResponse: mockBitbucketRateLimitResponse,
  bitbucketPermissionError: mockBitbucketPermissionError,
  apiCallHistory: {
    jiraCalls: [],
    confluenceCalls: [],
    bitbucketCalls: []
  }
};

// Mock API object
const api = {
  asApp: () => ({
    requestJira: jest.fn().mockImplementation((path, options = {}) => {
      // Track API call
      mockState.apiCallHistory.jiraCalls.push([path, options]);
      
      if (mockState.shouldThrowError && mockState.errorType === 'jira') {
        throw new Error('Jira API Error');
      }
      
      // Simulate JQL search
      if (path.includes('/search')) {
        return Promise.resolve({
          status: 200,
          data: {
            issues: mockState.jiraTickets,
            total: mockState.jiraTickets.length
          }
        });
      }
      
      return Promise.resolve({
        status: 200,
        data: mockState.jiraTickets[0]
      });
    }),

    requestBitbucket: jest.fn().mockImplementation((path, options = {}) => {
      // Track API call
      mockState.apiCallHistory.bitbucketCalls = mockState.apiCallHistory.bitbucketCalls || [];
      mockState.apiCallHistory.bitbucketCalls.push([path, options]);
      
      // Handle various error scenarios
      if (mockState.shouldThrowError) {
        if (mockState.errorType === 'bitbucket') {
          throw new Error('Bitbucket API Error');
        }
        if (mockState.errorType === 'bitbucket_403') {
          return Promise.resolve(mockBitbucketPermissionError);
        }
        if (mockState.errorType === 'bitbucket_429') {
          return Promise.resolve(mockBitbucketRateLimitResponse);
        }
        if (mockState.errorType === 'bitbucket_404') {
          return Promise.resolve({
            status: 404,
            data: { 
              type: "error",
              error: {
                message: "Repository not found",
                detail: "The repository does not exist or you don't have access to it."
              }
            }
          });
        }
        if (mockState.errorType === '403') {
          return Promise.resolve({
            status: 403,
            data: { message: "Forbidden - Insufficient permissions" }
          });
        }
      }
      
      // Apply 6-month constraint filtering
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      // Simulate PR diff endpoint (must come before general pullrequests endpoint)
      if (path.includes('/diff')) {
        const prId = path.match(/\/pullrequests\/(\d+)\/diff/)?.[1];
        if (prId) {
          return Promise.resolve({
            status: 200,
            data: `diff --git a/auth/oauth.js b/auth/oauth.js
index 1234567..abcdefg 100644
--- a/auth/oauth.js
+++ b/auth/oauth.js
@@ -1,10 +1,15 @@
 const OAuth = require('oauth');
+const config = require('../config/auth');
 
 class OAuthService {
   constructor() {
-    this.client = new OAuth.Client();
+    this.client = new OAuth.Client(config.oauth);
   }
+  
+  authenticate(token) {
+    return this.client.verify(token);
+  }
 }
 
 module.exports = OAuthService;`,
            headers: {
              'Content-Type': 'text/plain'
            }
          });
        }
      }

      // Simulate specific PR endpoint (must come before general pullrequests endpoint)
      if (path.match(/\/pullrequests\/\d+$/)) {
        const prId = path.split('/').pop();
        const pr = (mockState.bitbucketPRs || mockBitbucketPRs).find(p => p.id.toString() === prId);
        if (pr) {
          return Promise.resolve({
            status: 200,
            data: pr
          });
        }
        return Promise.resolve({
          status: 404,
          data: { 
            type: "error",
            error: {
              message: "Pull request not found",
              detail: `Pull request with ID ${prId} does not exist or you don't have access to it.`
            }
          }
        });
      }

      // Simulate pull requests endpoint with 6-month filtering
      if (path === '/2.0/pullrequests' || path.includes('/pullrequests')) {
        let prs = mockState.bitbucketPRs || mockBitbucketPRs;
        
        // Apply user filtering if specified in query parameters
        if (options.params && options.params.q) {
          const query = options.params.q;
          const userMatch = query.match(/author\.uuid="([^"]+)"/);
          if (userMatch) {
            const userId = userMatch[1];
            prs = prs.filter(pr => pr.author.uuid === userId);
          }
          
          // Apply date filtering if specified in query
          const dateMatch = query.match(/created_on>=([^&\s]+)/);
          if (dateMatch) {
            const dateFilter = new Date(dateMatch[1]);
            prs = prs.filter(pr => new Date(pr.created_on) >= dateFilter);
          }
        }
        
        // Always apply 6-month constraint for consistency
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        prs = prs.filter(pr => new Date(pr.created_on) >= sixMonthsAgo);
        
        return Promise.resolve({
          status: 200,
          data: {
            values: prs,
            size: prs.length,
            page: 1,
            pagelen: 50
          }
        });
      }
      
      // Simulate commits endpoint with 6-month filtering
      if (path === '/2.0/commits' || path.includes('/commits')) {
        let commits = mockState.bitbucketCommits || mockBitbucketCommits;
        
        // Apply user filtering if specified in query parameters
        if (options.params && options.params.q) {
          const query = options.params.q;
          const userMatch = query.match(/author\.raw:"([^"]+)"/);
          if (userMatch) {
            const userId = userMatch[1];
            commits = commits.filter(commit => commit.author.raw.includes(userId) || 
              (commit.author.user && commit.author.user.uuid === userId));
          }
          
          // Apply date filtering if specified in query
          const dateMatch = query.match(/date>=([^&\s]+)/);
          if (dateMatch) {
            const dateFilter = new Date(dateMatch[1]);
            commits = commits.filter(commit => new Date(commit.date) >= dateFilter);
          }
        }
        
        // Always apply 6-month constraint for consistency
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        commits = commits.filter(commit => new Date(commit.date) >= sixMonthsAgo);
        
        return Promise.resolve({
          status: 200,
          data: {
            values: commits,
            size: commits.length,
            page: 1,
            pagelen: 50
          }
        });
      }
      

      
      // Simulate PR activity endpoint
      if (path.includes('/activity')) {
        return Promise.resolve({
          status: 200,
          data: {
            values: [
              {
                update: {
                  date: new Date().toISOString(),
                  author: { uuid: "user123", display_name: "John Developer" },
                  description: "Pull request created"
                }
              }
            ]
          }
        });
      }
      
      // Simulate user endpoint
      if (path.includes('/user')) {
        return Promise.resolve({
          status: 200,
          data: { 
            uuid: "user123", 
            display_name: "Test User",
            account_id: "user123"
          }
        });
      }
      
      // Simulate repository endpoint
      if (path.match(/\/repositories\/[^\/]+\/[^\/]+$/)) {
        return Promise.resolve({
          status: 200,
          data: {
            name: "test-repo",
            full_name: "workspace/test-repo",
            is_private: false,
            created_on: "2024-01-01T00:00:00.000Z",
            updated_on: new Date().toISOString()
          }
        });
      }
      
      return Promise.resolve({
        status: 200,
        data: {}
      });
    })
  }),
  
  asUser: () => ({
    requestConfluence: jest.fn().mockImplementation((path, options = {}) => {
      // Track API call
      mockState.apiCallHistory.confluenceCalls.push([path, options]);
      
      if (mockState.shouldThrowError) {
        if (mockState.errorType === '403') {
          return Promise.resolve(mockErrorResponses[403]);
        }
        if (mockState.errorType === '404') {
          return Promise.resolve(mockErrorResponses[404]);
        }
        if (mockState.errorType === '500') {
          return Promise.resolve(mockErrorResponses[500]);
        }
        if (mockState.errorType === 'confluence') {
          throw new Error('Permission validation failed');
        }
      }
      
      // Simulate user info request for permission validation
      if (path.includes('/user/current')) {
        return Promise.resolve({
          status: 200,
          data: { accountId: 'user123', displayName: 'Test User' }
        });
      }
      
      // Simulate page creation
      if (options.method === 'POST' && path.includes('/content')) {
        return Promise.resolve(mockState.confluenceResponse);
      }
      
      return Promise.resolve(mockState.confluenceResponse);
    })
  }),

  route: jest.fn().mockImplementation((template, params = {}) => {
    // Mock route template function
    let result = template;
    Object.keys(params).forEach(key => {
      result = result.replace(`{${key}}`, params[key]);
    });
    return result;
  })
};

// Helper functions for test control
const mockHelpers = {
  setMockState: (newState) => {
    mockState = { ...mockState, ...newState };
  },
  
  resetMocks: () => {
    mockState = {
      shouldThrowError: false,
      errorType: null,
      jiraTickets: mockJiraTickets,
      confluenceResponse: mockConfluenceResponse,
      bitbucketPRs: mockBitbucketPRs,
      bitbucketCommits: mockBitbucketCommits,
      bitbucketRateLimitResponse: mockBitbucketRateLimitResponse,
      bitbucketPermissionError: mockBitbucketPermissionError,
      apiCallHistory: {
        jiraCalls: [],
        confluenceCalls: [],
        bitbucketCalls: []
      }
    };
    jest.clearAllMocks();
  },
  
  simulateError: (errorType) => {
    mockState.shouldThrowError = true;
    mockState.errorType = errorType;
  },
  
  getMockState: () => ({ ...mockState }),
  
  // Enhanced helper functions for comprehensive testing
  createMockJiraTicket: (overrides = {}) => {
    const defaultTicket = {
      id: `mock_${Date.now()}`,
      key: `MOCK-${Math.floor(Math.random() * 1000)}`,
      fields: {
        summary: "Mock ticket",
        description: "Mock description",
        assignee: {
          accountId: "mock_user",
          displayName: "Mock User"
        },
        status: { name: "Done" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        comment: { total: 0 }
      }
    };
    
    return {
      ...defaultTicket,
      ...overrides,
      fields: {
        ...defaultTicket.fields,
        ...(overrides.fields || {})
      }
    };
  },
  
  createMockConfluenceResponse: (overrides = {}) => {
    const defaultResponse = {
      status: 201,
      data: {
        id: `page_${Date.now()}`,
        title: "Mock Page",
        _links: {
          webui: `/spaces/MOCK/pages/page_${Date.now()}`
        }
      }
    };
    
    return {
      ...defaultResponse,
      ...overrides,
      data: {
        ...defaultResponse.data,
        ...(overrides.data || {})
      }
    };
  },
  
  addMockJiraTickets: (tickets) => {
    mockState.jiraTickets = [...mockState.jiraTickets, ...tickets];
  },
  
  clearMockJiraTickets: () => {
    mockState.jiraTickets = [];
  },
  
  setMockJiraTickets: (tickets) => {
    mockState.jiraTickets = tickets;
  },
  
  simulateJiraSearchResponse: (tickets, total = null) => {
    mockState.jiraSearchResponse = {
      status: 200,
      data: {
        issues: tickets,
        total: total !== null ? total : tickets.length,
        startAt: 0,
        maxResults: 50
      }
    };
  },
  
  simulateConfluencePageCreation: (pageData) => {
    mockState.confluenceResponse = mockHelpers.createMockConfluenceResponse({
      data: pageData
    });
  },
  
  simulate403Error: () => {
    mockState.shouldThrowError = true;
    mockState.errorType = '403';
  },
  
  simulate404Error: () => {
    mockState.shouldThrowError = true;
    mockState.errorType = '404';
  },
  
  simulate500Error: () => {
    mockState.shouldThrowError = true;
    mockState.errorType = '500';
  },
  
  simulateNetworkError: () => {
    mockState.shouldThrowError = true;
    mockState.errorType = 'jira';
  },
  
  getApiCallHistory: () => {
    return {
      jiraCalls: mockState.apiCallHistory.jiraCalls,
      confluenceCalls: mockState.apiCallHistory.confluenceCalls,
      bitbucketCalls: mockState.apiCallHistory.bitbucketCalls || []
    };
  },
  
  verifyApiCalled: (apiType, path, method = 'GET') => {
    const history = mockHelpers.getApiCallHistory();
    let calls;
    if (apiType === 'jira') calls = history.jiraCalls;
    else if (apiType === 'confluence') calls = history.confluenceCalls;
    else if (apiType === 'bitbucket') calls = history.bitbucketCalls;
    else return false;
    
    return calls.some(call => {
      const [callPath, options = {}] = call;
      return callPath.includes(path) && (options.method || 'GET') === method;
    });
  },

  // Bitbucket-specific helper functions
  createMockBitbucketPR: (overrides = {}) => {
    const defaultPR = {
      id: Math.floor(Math.random() * 1000),
      title: "Mock PR",
      author: { uuid: "mock_user" },
      created_on: new Date().toISOString(),
      updated_on: new Date().toISOString(),
      merge_commit: null,
      diff_stats: {
        lines_added: 50,
        lines_removed: 20,
        files_changed: 3
      },
      comment_count: 2,
      state: "OPEN",
      source: { repository: { name: "mock-repo" } },
      destination: { branch: { name: "main" } }
    };
    
    return { ...defaultPR, ...overrides };
  },

  createMockBitbucketCommit: (overrides = {}) => {
    const defaultCommit = {
      hash: `mock${Math.random().toString(36).substr(2, 9)}`,
      message: "Mock commit message",
      author: { raw: "mock_user" },
      date: new Date().toISOString(),
      diff_stats: {
        lines_added: 25,
        lines_removed: 10,
        files: ["mock/file.js"]
      },
      repository: { name: "mock-repo" },
      branch: { name: "main" }
    };
    
    return { ...defaultCommit, ...overrides };
  },

  setBitbucketPRs: (prs) => {
    mockState.bitbucketPRs = prs;
  },

  setBitbucketCommits: (commits) => {
    mockState.bitbucketCommits = commits;
  },

  addMockBitbucketPR: (pr) => {
    mockState.bitbucketPRs = [...(mockState.bitbucketPRs || []), pr];
  },

  addMockBitbucketCommit: (commit) => {
    mockState.bitbucketCommits = [...(mockState.bitbucketCommits || []), commit];
  },

  clearBitbucketData: () => {
    mockState.bitbucketPRs = [];
    mockState.bitbucketCommits = [];
  },

  simulateBitbucketError: () => {
    mockState.shouldThrowError = true;
    mockState.errorType = 'bitbucket';
  },

  simulateBitbucket403Error: () => {
    mockState.shouldThrowError = true;
    mockState.errorType = 'bitbucket_403';
  },

  simulateBitbucketRateLimit: () => {
    mockState.shouldThrowError = true;
    mockState.errorType = 'bitbucket_429';
  },

  // Enhanced helper functions for 6-month constraint testing
  createMockDataWithinSixMonths: (userId = 'user123') => {
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    
    const pr = mockHelpers.createMockBitbucketPR({
      author: { uuid: userId },
      created_on: threeMonthsAgo.toISOString(),
      updated_on: threeMonthsAgo.toISOString()
    });
    
    const commit = mockHelpers.createMockBitbucketCommit({
      author: { 
        raw: `${userId} <${userId}@company.com>`,
        user: { uuid: userId }
      },
      date: threeMonthsAgo.toISOString()
    });
    
    return { pr, commit };
  },

  createMockDataOutsideSixMonths: (userId = 'user123') => {
    const sevenMonthsAgo = new Date();
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
    
    const pr = mockHelpers.createMockBitbucketPR({
      author: { uuid: userId },
      created_on: sevenMonthsAgo.toISOString(),
      updated_on: sevenMonthsAgo.toISOString()
    });
    
    const commit = mockHelpers.createMockBitbucketCommit({
      author: { 
        raw: `${userId} <${userId}@company.com>`,
        user: { uuid: userId }
      },
      date: sevenMonthsAgo.toISOString()
    });
    
    return { pr, commit };
  },

  filterDataBySixMonthConstraint: (data, dateField = 'created_on') => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    return data.filter(item => {
      const itemDate = new Date(item[dateField] || item.date);
      return itemDate >= sixMonthsAgo;
    });
  },

  validateSixMonthConstraint: (data, dateField = 'created_on') => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    return data.every(item => {
      const itemDate = new Date(item[dateField] || item.date);
      return itemDate >= sixMonthsAgo;
    });
  },

  // Enhanced Bitbucket-specific error simulation
  simulateBitbucketNetworkError: () => {
    mockState.shouldThrowError = true;
    mockState.errorType = 'bitbucket';
  },

  simulateBitbucketRepositoryNotFound: () => {
    mockState.shouldThrowError = true;
    mockState.errorType = 'bitbucket_404';
  },

  // Helper to get filtered data as the API would return it
  getBitbucketDataWithConstraints: (userId, enforce6Month = true) => {
    let prs = mockState.bitbucketPRs || mockBitbucketPRs;
    let commits = mockState.bitbucketCommits || mockBitbucketCommits;
    
    if (userId) {
      prs = prs.filter(pr => pr.author.uuid === userId);
      commits = commits.filter(commit => commit.author.user?.uuid === userId);
    }
    
    if (enforce6Month) {
      prs = mockHelpers.filterDataBySixMonthConstraint(prs, 'created_on');
      commits = mockHelpers.filterDataBySixMonthConstraint(commits, 'date');
    }
    
    return { prs, commits };
  }
};

module.exports = api;
module.exports.mockHelpers = mockHelpers;