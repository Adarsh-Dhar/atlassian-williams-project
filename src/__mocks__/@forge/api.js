// Mock implementation for @forge/api
const mockJiraTickets = [
  {
    id: "10001",
    key: "PROJ-123",
    fields: {
      summary: "Undocumented feature implementation",
      description: "Complex feature with minimal documentation",
      assignee: { 
        accountId: "user123",
        displayName: "John Developer"
      },
      status: { name: "Done" },
      created: "2024-01-01T10:00:00.000Z",
      updated: "2024-01-15T15:30:00.000Z",
      comment: { total: 2 }
    }
  },
  {
    id: "10002", 
    key: "PROJ-124",
    fields: {
      summary: "Another undocumented ticket",
      description: "Brief description only",
      assignee: {
        accountId: "user123", 
        displayName: "John Developer"
      },
      status: { name: "Done" },
      created: "2024-01-02T09:00:00.000Z",
      updated: "2024-01-16T14:20:00.000Z",
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
      summary: "High activity zombie ticket",
      description: "Brief",
      assignee: {
        accountId: "user789",
        displayName: "Zombie Developer"
      },
      status: { name: "Done" },
      created: "2024-01-01T10:00:00.000Z",
      updated: "2024-01-20T15:30:00.000Z",
      comment: { total: 0 }
    }
  },
  {
    id: "10005",
    key: "ZOMBIE-002", 
    fields: {
      summary: "Another zombie ticket",
      description: "",
      assignee: {
        accountId: "user789",
        displayName: "Zombie Developer"
      },
      status: { name: "In Progress" },
      created: "2024-01-05T10:00:00.000Z",
      updated: "2024-01-25T15:30:00.000Z",
      comment: { total: 1 }
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

// Mock state for controlling responses
let mockState = {
  shouldThrowError: false,
  errorType: null,
  jiraTickets: mockJiraTickets,
  confluenceResponse: mockConfluenceResponse,
  apiCallHistory: {
    jiraCalls: [],
    confluenceCalls: []
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
      apiCallHistory: {
        jiraCalls: [],
        confluenceCalls: []
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
      confluenceCalls: mockState.apiCallHistory.confluenceCalls
    };
  },
  
  verifyApiCalled: (apiType, path, method = 'GET') => {
    const history = mockHelpers.getApiCallHistory();
    const calls = apiType === 'jira' ? history.jiraCalls : history.confluenceCalls;
    
    return calls.some(call => {
      const [callPath, options = {}] = call;
      return callPath.includes(path) && (options.method || 'GET') === method;
    });
  }
};

module.exports = api;
module.exports.mockHelpers = mockHelpers;