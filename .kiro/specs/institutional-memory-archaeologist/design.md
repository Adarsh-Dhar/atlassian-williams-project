# Design Document

## Overview

Legacy Keeper is a specialized Atlassian Forge application designed to solve the "Cognitive Offboarding" problem—the billions of dollars companies lose when developers leave with their tacit knowledge (the "why" behind the code). The system implements a targeted workflow: **Trigger (Offboarding) → Scan (Jira + Bitbucket) → Interview (Rovo) → Archive (Confluence)**.

The core problem Legacy Keeper addresses is that departing developers take with them critical understanding of code decisions, architectural choices, and undocumented processes that cannot be recovered from code comments or documentation alone. By analyzing the last 6 months of developer activity across both Jira tickets and Bitbucket commits/PRs, Legacy Keeper identifies areas of "Undocumented Intensity" and conducts forensic interviews to capture this knowledge before it's lost forever.

The architecture follows Forge's serverless model, utilizing Node.js resolvers for business logic, Rovo's conversational AI framework for forensic knowledge extraction, and Atlassian's REST APIs plus Bitbucket integration for comprehensive data access and storage.

## Architecture

The application follows a three-tier architecture within the Forge framework, expanded to support comprehensive cognitive offboarding:

### Presentation Layer
- **Rovo Agent Interface**: Conversational UI powered by Atlassian's Rovo framework
- **Forensic Prompt System**: Highly specific prompts that reference concrete artifacts (PR IDs, commit hashes, Jira tickets)

### Business Logic Layer
- **Undocumented Intensity Analyzer**: Processes Jira + Bitbucket data using the formula: High Undocumented Intensity = (High Complexity PRs + Critical Jira Tickets) / (Low Documentation Links)
- **Legacy Detector**: Scans the last 6 months of activity to identify departing developers with critical tacit knowledge
- **Interview Orchestrator**: Manages forensic knowledge extraction conversations with specific artifact references
- **Content Formatter**: Structures captured knowledge for Confluence storage with bidirectional links to source artifacts

### Data Access Layer
- **Jira Integration**: Reads work activity and ticket data via Forge API
- **Bitbucket Integration**: Analyzes commits, Pull Requests, and code complexity metrics
- **Confluence Integration**: Creates and manages documentation pages with artifact linking
- **User Management**: Accesses user profiles and permissions

## Components and Interfaces

### Legacy Keeper Agent
```javascript
// Rovo Agent Configuration - Forensic and Artifact-Specific
const agentPrompt = `You are a forensic technical interviewer specializing in cognitive offboarding. Your goal is to extract tacit knowledge by asking highly specific questions about concrete artifacts. Reference specific PR IDs, commit hashes, and Jira tickets. Example: "You changed the auth logic in PR #402. Why did you choose OAuth over SAML?" Always ask about the "why" behind code decisions, not just the "what".`;

// Agent Interface
interface LegacyKeeperAgent {
  conductForensicInterview(context: InterviewContext): Promise<InterviewResult>;
  extractTacitKnowledge(responses: UserResponse[]): KnowledgeArtifact;
  formatForArchival(knowledge: KnowledgeArtifact): ConfluenceContent;
  generateArtifactQuestions(artifacts: CodeArtifact[]): Question[];
}
```

### Legacy Detector (formerly Background Scanner)
```javascript
// Legacy Detector Interface - 6-month constraint
interface LegacyDetector {
  scanLastSixMonths(userId: string): Promise<UndocumentedIntensityReport>;
  calculateUndocumentedIntensity(data: DeveloperActivity): number;
  identifyHighComplexityPRs(userId: string): Promise<BitbucketPR[]>;
  identifyCriticalTickets(userId: string): Promise<JiraTicket[]>;
  findDocumentationLinks(artifacts: CodeArtifact[]): Promise<DocumentationLink[]>;
}

// Undocumented Intensity Algorithm
interface UndocumentedIntensityReport {
  userId: string;
  timeframe: '6_MONTHS';
  highComplexityPRs: BitbucketPR[];
  criticalJiraTickets: JiraTicket[];
  documentationLinks: DocumentationLink[];
  undocumentedIntensityScore: number; // (High Complexity PRs + Critical Jira Tickets) / (Low Documentation Links)
  specificArtifacts: string[]; // e.g., ["PR #402", "JIRA-123", "commit abc123"]
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}
```

### Bitbucket Integration
```javascript
// Bitbucket Service Interface
interface BitbucketService {
  getPullRequestsLastSixMonths(userId: string): Promise<BitbucketPR[]>;
  getCommitHistory(userId: string, timeframe: string): Promise<Commit[]>;
  analyzePRComplexity(prId: string): Promise<ComplexityMetrics>;
  getDiffContext(prId: string): Promise<DiffContext>;
}

// Bitbucket Data Models
interface BitbucketPR {
  id: string;
  title: string;
  author: string;
  created: Date;
  merged: Date;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  complexityScore: number;
  reviewComments: number;
}

interface Commit {
  hash: string;
  message: string;
  author: string;
  date: Date;
  filesChanged: string[];
  linesChanged: number;
}

interface DiffContext {
  prId: string;
  changedFiles: ChangedFile[];
  keyChanges: string[]; // Summary of critical changes
}

interface ChangedFile {
  path: string;
  linesAdded: number;
  linesDeleted: number;
  changeType: 'ADDED' | 'MODIFIED' | 'DELETED';
}
```

### Confluence Integration
```javascript
// Enhanced Confluence Service Interface with Artifact Linking
interface ConfluenceService {
  saveToConfluence(title: string, content: string): Promise<ConfluencePageResult>;
  createLegacyDocument(knowledge: KnowledgeArtifact): Promise<ConfluencePageResult>;
  linkToArtifacts(pageId: string, artifacts: CodeArtifact[]): Promise<boolean>;
  validatePermissions(): Promise<boolean>;
  formatContent(knowledge: KnowledgeArtifact): string;
}

// Enhanced Response Models
interface ConfluencePageResult {
  success: boolean;
  pageUrl?: string;
  pageId?: string;
  linkedArtifacts?: string[];
  error?: string;
}
```

## Data Models

### Core Domain Models
```javascript
// Enhanced Knowledge Artifact with Artifact Linking
interface KnowledgeArtifact {
  id: string;
  employeeId: string;
  title: string;
  content: string;
  tags: string[];
  extractedAt: Date;
  confidence: number;
  relatedTickets: string[];
  relatedPRs: string[]; // New: Bitbucket PR references
  relatedCommits: string[]; // New: Commit hash references
  sourceArtifacts: CodeArtifact[]; // New: Complete artifact context
}

// Enhanced Interview Context with Bitbucket Data
interface InterviewContext {
  employeeId: string;
  department: string;
  role: string;
  identifiedGaps: KnowledgeGap[];
  recentPullRequests: BitbucketPR[]; // New: Last 6 months of PRs
  commitHistory: Commit[]; // New: Last 6 months of commits
  undocumentedIntensityScore: number; // New: Calculated intensity score
  specificArtifacts: string[]; // New: e.g., ["PR #402", "JIRA-123"]
  sessionId: string;
}

// Retained Jira Ticket Model (unchanged)
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

// New: Code Artifact Model
interface CodeArtifact {
  type: 'PR' | 'COMMIT' | 'JIRA_TICKET';
  id: string;
  title: string;
  author: string;
  date: Date;
  complexityIndicators: string[];
  documentationLevel: 'NONE' | 'MINIMAL' | 'ADEQUATE' | 'COMPREHENSIVE';
}

// New: Developer Activity Model
interface DeveloperActivity {
  userId: string;
  timeframe: '6_MONTHS';
  jiraTickets: JiraTicket[];
  pullRequests: BitbucketPR[];
  commits: Commit[];
  totalComplexityScore: number;
  documentationRatio: number;
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

Based on the Legacy Keeper refactoring, the following correctness properties have been updated:

**Property 1: Legacy Detector identifies departing users with Undocumented Intensity**
*For any* departing user with activity in the last 6 months, when the Legacy_Detector analyzes combined Jira and Bitbucket data, users with high Undocumented Intensity scores should be correctly identified and flagged for cognitive offboarding
**Validates: Requirements 1.1, 1.2**

**Property 2: Agent generates artifact-specific questions**
*For any* interview session with identified code artifacts (PRs, commits, Jira tickets), the Legacy_Keeper_Agent should generate questions that reference specific PR IDs, commit hashes, or Jira ticket numbers rather than generic questions
**Validates: Requirements 2.2**

**Property 3: Archive process links Legacy Documents to source artifacts**
*For any* completed cognitive offboarding interview that generates a Legacy Document, the Confluence_Service should successfully create bidirectional links between the generated document and the original Jira Tickets and Bitbucket PRs that triggered the interview
**Validates: Requirements 3.2, 3.3**

**Property 4: Six-month constraint enforcement**
*For any* Legacy Detector scan, the system should strictly analyze only the last 6 months of activity and exclude any data older than 6 months from the Undocumented Intensity calculation
**Validates: Requirements 1.1**

**Property 5: Undocumented Intensity calculation accuracy**
*For any* developer activity dataset, the Undocumented Intensity score should be calculated as (High Complexity PRs + Critical Jira Tickets) / (Documentation Links), and the result should correctly classify risk levels
**Validates: Requirements 1.2**

**Property 6: Bitbucket integration data consistency**
*For any* valid Bitbucket API response, the system should correctly parse PR data, commit history, and diff context into the expected data models without data loss
**Validates: Requirements 1.1**

**Property 7: Graceful error handling for API failures**
*For any* Confluence or Bitbucket API error (including 403 Forbidden), the Legacy_Keeper should handle it gracefully without exposing sensitive information
**Validates: Requirements 3.4, 4.4**

**Property 8: Error logging consistency**
*For any* system error that occurs, the Legacy_Keeper should log appropriate error messages that aid in debugging without compromising security
**Validates: Requirements 4.5**

## Error Handling

Legacy Keeper implements comprehensive error handling across all integration points, including the new Bitbucket integration:

### API Error Handling
- **Confluence API Errors**: All Confluence operations are wrapped in try-catch blocks with specific handling for 403 Forbidden, 404 Not Found, and 500 Internal Server errors
- **Jira API Errors**: Jira data access includes retry logic for transient failures and graceful degradation for permission issues
- **Bitbucket API Errors**: Bitbucket integration includes specific handling for rate limiting, repository access permissions, and PR/commit data unavailability
- **Network Failures**: All external API calls implement timeout handling and connection error recovery
- **Six-Month Data Constraints**: Error handling for cases where insufficient historical data exists within the 6-month window

### User Experience Error Handling
- **Agent Conversation Errors**: The Legacy Keeper Agent includes fallback responses for unexpected conversation states and missing artifact context
- **Data Validation Errors**: Input validation occurs at all entry points with user-friendly error messages
- **Permission Errors**: Clear messaging when users lack required permissions for Jira, Confluence, or Bitbucket access
- **Artifact Reference Errors**: Graceful handling when referenced PRs, commits, or tickets are no longer accessible

### System Error Handling
- **Logging Strategy**: Structured logging with appropriate log levels (ERROR, WARN, INFO, DEBUG) including artifact-specific context
- **Error Propagation**: Errors are caught at appropriate levels and transformed into user-actionable messages
- **Monitoring Integration**: Error patterns are logged for operational monitoring and alerting, with specific tracking of cognitive offboarding success rates

## Testing Strategy

Legacy Keeper employs a comprehensive dual testing approach combining unit tests and property-based tests to ensure correctness and reliability across the expanded Bitbucket integration and cognitive offboarding workflow.

### Unit Testing Approach
Unit tests focus on specific examples, edge cases, and integration points:

- **Resolver Function Testing**: Each Forge resolver function has dedicated unit tests covering success and failure scenarios
- **API Integration Testing**: Mock-based testing of Jira, Confluence, and Bitbucket API interactions using comprehensive mocks
- **Undocumented Intensity Algorithm Testing**: Specific tests for the calculation formula: (High Complexity PRs + Critical Jira Tickets) / (Documentation Links)
- **Six-Month Constraint Testing**: Validation that only data from the last 6 months is included in analysis
- **Artifact Reference Testing**: Tests ensuring PR IDs, commit hashes, and Jira tickets are correctly referenced in agent questions
- **Error Scenario Testing**: Specific tests for 403 Forbidden errors, network failures, and malformed data across all three APIs
- **Configuration Testing**: Validation of manifest.yml permissions and Legacy Keeper Agent configuration

### Property-Based Testing Approach
Property-based tests verify universal properties across all valid inputs using **fast-check** as the testing library:

- **Legacy Detector Properties**: Tests that verify Undocumented Intensity detection works correctly across all possible developer activity patterns
- **Artifact-Specific Question Generation**: Tests ensuring the agent generates questions with specific PR/commit/ticket references
- **Bidirectional Linking Properties**: Tests verifying that Legacy Documents are correctly linked back to source artifacts
- **Data Transformation Properties**: Tests ensuring that knowledge artifacts are correctly formatted for Confluence storage with artifact links
- **API Response Properties**: Tests verifying that all API responses (Jira, Confluence, Bitbucket) conform to expected schemas
- **Error Handling Properties**: Tests ensuring graceful error handling across all possible error conditions

### Testing Framework Configuration
- **Primary Framework**: Jest with jest-when for behavior-driven testing
- **Property Testing Library**: fast-check for generating test cases and verifying universal properties
- **Mock Strategy**: Comprehensive __mocks__/@forge/api.js file providing realistic API response simulation for all three services
- **Coverage Requirements**: 100% coverage for all resolver functions with minimum 100 iterations per property test

### Mock Implementation Strategy
The testing strategy includes robust mocking of all external dependencies, including the new Bitbucket integration:

```javascript
// Enhanced Mock Configuration Example
const mockJiraResponse = {
  issues: [
    {
      id: "10001",
      key: "PROJ-123",
      fields: {
        summary: "Undocumented auth system refactor",
        assignee: { accountId: "user123" },
        comment: { total: 2 },
        created: "2024-06-15T10:00:00.000Z"
      }
    }
  ]
};

const mockBitbucketResponse = {
  pullRequests: [
    {
      id: "402",
      title: "Refactor authentication system",
      author: "user123",
      created: "2024-06-15T10:00:00.000Z",
      merged: "2024-06-16T14:30:00.000Z",
      linesAdded: 245,
      linesDeleted: 89,
      filesChanged: 8,
      complexityScore: 8.5,
      reviewComments: 12
    }
  ],
  commits: [
    {
      hash: "abc123def456",
      message: "Switch from SAML to OAuth implementation",
      author: "user123",
      date: "2024-06-15T10:00:00.000Z",
      filesChanged: ["auth/oauth.js", "auth/saml.js"],
      linesChanged: 156
    }
  ]
};

const mockConfluenceResponse = {
  status: 200,
  data: {
    id: "page123",
    _links: {
      webui: "/spaces/LEGACY/pages/page123"
    }
  }
};
```

### Test Execution Strategy
- **Continuous Integration**: All tests must pass before deployment
- **Test Isolation**: Each test runs in isolation with fresh mocks and state
- **Performance Testing**: Property-based tests run with sufficient iterations to catch edge cases
- **Error Injection**: Systematic testing of error conditions through mock manipulation across all three API integrations
- **Cognitive Offboarding Workflow Testing**: End-to-end testing of the complete Trigger → Scan → Interview → Archive workflow