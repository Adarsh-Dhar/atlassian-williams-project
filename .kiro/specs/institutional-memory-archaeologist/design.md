# Design Document

## Overview

The Institutional Memory Archaeologist is a sophisticated Atlassian Forge application that combines automated knowledge gap detection with AI-powered knowledge extraction. The system operates through three core components: a background scanner that identifies employees with undocumented expertise, a Rovo Agent that conducts structured interviews, and a Confluence integration that preserves captured knowledge.

The architecture follows Forge's serverless model, utilizing Node.js resolvers for business logic, Rovo's conversational AI framework for knowledge extraction, and Atlassian's REST APIs for data access and storage.

## Architecture

The application follows a three-tier architecture within the Forge framework:

### Presentation Layer
- **Rovo Agent Interface**: Conversational UI powered by Atlassian's Rovo framework
- **Agent Prompt System**: Structured prompts that guide the forensic interviewing process

### Business Logic Layer
- **Knowledge Gap Analyzer**: Processes Jira data to identify documentation gaps
- **Interview Orchestrator**: Manages the flow of knowledge extraction conversations
- **Content Formatter**: Structures captured knowledge for Confluence storage

### Data Access Layer
- **Jira Integration**: Reads work activity and ticket data via Forge API
- **Confluence Integration**: Creates and manages documentation pages
- **User Management**: Accesses user profiles and permissions

## Components and Interfaces

### Memory Archaeologist Agent
```javascript
// Rovo Agent Configuration
const agentPrompt = `You are a forensic technical interviewer. Your goal is to extract tacit knowledge about undocumented projects. Ask specific questions, then offer to save the findings.`;

// Agent Interface
interface MemoryArchaeologistAgent {
  conductInterview(context: InterviewContext): Promise<InterviewResult>;
  extractKnowledge(responses: UserResponse[]): KnowledgeArtifact;
  formatForStorage(knowledge: KnowledgeArtifact): ConfluenceContent;
}
```

### Background Scanner
```javascript
// Scanner Interface
interface BackgroundScanner {
  scanForGaps(): Promise<KnowledgeGapReport>;
  identifyZombieTickets(userId: string): Promise<JiraTicket[]>;
  calculateDocumentationRatio(tickets: JiraTicket[]): number;
}

// Data Models
interface KnowledgeGapReport {
  userId: string;
  ticketCount: number;
  documentationRatio: number;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendedActions: string[];
}
```

### Confluence Integration
```javascript
// Confluence Service Interface
interface ConfluenceService {
  saveToConfluence(title: string, content: string): Promise<ConfluencePageResult>;
  validatePermissions(): Promise<boolean>;
  formatContent(knowledge: KnowledgeArtifact): string;
}

// Response Models
interface ConfluencePageResult {
  success: boolean;
  pageUrl?: string;
  error?: string;
}
```

## Data Models

### Core Domain Models
```javascript
// Knowledge Artifact
interface KnowledgeArtifact {
  id: string;
  employeeId: string;
  title: string;
  content: string;
  tags: string[];
  extractedAt: Date;
  confidence: number;
  relatedTickets: string[];
}

// Interview Context
interface InterviewContext {
  employeeId: string;
  department: string;
  role: string;
  identifiedGaps: KnowledgeGap[];
  sessionId: string;
}

// Jira Ticket Model
interface JiraTicket {
  id: string;
  key: string;
  summary: string;
  description: string;
  assignee: string;
  status: string;
  created: Date;
  updated: Date;
  commentCount: number;
  documentationLinks: string[];
}
```

### API Response Models
```javascript
// Forge API Response Wrappers
interface ForgeApiResponse<T> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

// Error Models
interface ApiError {
  code: string;
  message: string;
  details?: any;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following correctness properties have been identified:

**Property 1: Scanner identifies high-activity users**
*For any* set of Jira user data, when the Background_Scanner analyzes work activity, users with high code contributions should be correctly identified in the results
**Validates: Requirements 1.1**

**Property 2: Knowledge gap classification accuracy**
*For any* user with more than 5 tickets having minimal documentation, the Background_Scanner should classify them as having potential knowledge gaps
**Validates: Requirements 1.2**

**Property 3: Notification logging for detected gaps**
*For any* scan execution that detects knowledge gaps, the Background_Scanner should log appropriate notifications for organizational outreach
**Validates: Requirements 1.3**

**Property 4: Structured data return format**
*For any* completed scan, the Background_Scanner should return data that conforms to the KnowledgeGapReport structure with all required fields
**Validates: Requirements 1.4**

**Property 5: Confluence page creation consistency**
*For any* valid title and content pair, calling saveToConfluence should result in a new Confluence page being created with matching content
**Validates: Requirements 3.2**

**Property 6: Page URL return format**
*For any* successful page creation, the saveToConfluence function should return a properly formatted page URL that can be accessed
**Validates: Requirements 3.3**

**Property 7: Graceful error handling for API failures**
*For any* Confluence API error (including 403 Forbidden), the Forge_App should handle it gracefully without exposing sensitive information
**Validates: Requirements 3.4, 4.4**

**Property 8: Error logging consistency**
*For any* system error that occurs, the Forge_App should log appropriate error messages that aid in debugging without compromising security
**Validates: Requirements 4.5**

## Error Handling

The application implements comprehensive error handling across all integration points:

### API Error Handling
- **Confluence API Errors**: All Confluence operations are wrapped in try-catch blocks with specific handling for 403 Forbidden, 404 Not Found, and 500 Internal Server errors
- **Jira API Errors**: Jira data access includes retry logic for transient failures and graceful degradation for permission issues
- **Network Failures**: All external API calls implement timeout handling and connection error recovery

### User Experience Error Handling
- **Agent Conversation Errors**: The Rovo Agent includes fallback responses for unexpected conversation states
- **Data Validation Errors**: Input validation occurs at all entry points with user-friendly error messages
- **Permission Errors**: Clear messaging when users lack required permissions, with guidance on resolution

### System Error Handling
- **Logging Strategy**: Structured logging with appropriate log levels (ERROR, WARN, INFO, DEBUG)
- **Error Propagation**: Errors are caught at appropriate levels and transformed into user-actionable messages
- **Monitoring Integration**: Error patterns are logged for operational monitoring and alerting

## Testing Strategy

The application employs a comprehensive dual testing approach combining unit tests and property-based tests to ensure correctness and reliability.

### Unit Testing Approach
Unit tests focus on specific examples, edge cases, and integration points:

- **Resolver Function Testing**: Each Forge resolver function has dedicated unit tests covering success and failure scenarios
- **API Integration Testing**: Mock-based testing of Jira and Confluence API interactions using comprehensive mocks
- **Error Scenario Testing**: Specific tests for 403 Forbidden errors, network failures, and malformed data
- **Configuration Testing**: Validation of manifest.yml permissions and Rovo Agent configuration

### Property-Based Testing Approach
Property-based tests verify universal properties across all valid inputs using **fast-check** as the testing library:

- **Scanner Logic Properties**: Tests that verify knowledge gap detection works correctly across all possible user activity patterns
- **Data Transformation Properties**: Tests ensuring that knowledge artifacts are correctly formatted for Confluence storage
- **API Response Properties**: Tests verifying that all API responses conform to expected schemas regardless of input variation
- **Error Handling Properties**: Tests ensuring graceful error handling across all possible error conditions

### Testing Framework Configuration
- **Primary Framework**: Jest with jest-when for behavior-driven testing
- **Property Testing Library**: fast-check for generating test cases and verifying universal properties
- **Mock Strategy**: Comprehensive __mocks__/@forge/api.js file providing realistic API response simulation
- **Coverage Requirements**: 100% coverage for all resolver functions with minimum 100 iterations per property test

### Mock Implementation Strategy
The testing strategy includes robust mocking of all external dependencies:

```javascript
// Mock Configuration Example
const mockJiraResponse = {
  issues: [
    {
      id: "10001",
      key: "PROJ-123",
      fields: {
        summary: "Undocumented feature implementation",
        assignee: { accountId: "user123" },
        comment: { total: 2 }
      }
    }
  ]
};

const mockConfluenceResponse = {
  status: 200,
  data: {
    id: "page123",
    _links: {
      webui: "/spaces/SPACE/pages/page123"
    }
  }
};
```

### Test Execution Strategy
- **Continuous Integration**: All tests must pass before deployment
- **Test Isolation**: Each test runs in isolation with fresh mocks and state
- **Performance Testing**: Property-based tests run with sufficient iterations to catch edge cases
- **Error Injection**: Systematic testing of error conditions through mock manipulation