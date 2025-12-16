const fc = require('fast-check');
const {
  KnowledgeArtifact,
  InterviewContext,
  JiraTicket,
  KnowledgeGapReport,
  ConfluencePageResult,
  ForgeApiResponse,
  ApiError,
  BitbucketPR,
  Commit,
  DiffContext,
  ChangedFile,
  CodeArtifact,
  DeveloperActivity,
  UndocumentedIntensityReport
} = require('../models');

/**
 * Feature: legacy-keeper, Property 4: Structured data return format
 * Validates: Requirements 1.4
 */
describe('Data Model Validation', () => {

  describe('KnowledgeArtifact', () => {
    test('should create valid knowledge artifact with required fields', () => {
      const artifact = new KnowledgeArtifact({
        id: 'test-id',
        employeeId: 'emp-123',
        title: 'Test Knowledge',
        content: 'Test content'
      });

      const validation = artifact.validate();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should fail validation with missing required fields', () => {
      const artifact = new KnowledgeArtifact({});
      const validation = artifact.validate();
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('ID is required');
      expect(validation.errors).toContain('Employee ID is required');
      expect(validation.errors).toContain('Title is required');
      expect(validation.errors).toContain('Content is required');
    });

    /**
     * Property: For any valid knowledge artifact data, 
     * the created object should pass validation
     */
    test('property: valid knowledge artifacts pass validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1 }),
            employeeId: fc.string({ minLength: 1 }),
            title: fc.string({ minLength: 1 }),
            content: fc.string({ minLength: 1 }),
            tags: fc.array(fc.string()),
            confidence: fc.float({ min: 0, max: 1, noNaN: true }),
            relatedTickets: fc.array(fc.string()),
            relatedPRs: fc.array(fc.string()),
            relatedCommits: fc.array(fc.string()),
            sourceArtifacts: fc.array(fc.object())
          }),
          (data) => {
            const artifact = new KnowledgeArtifact(data);
            const validation = artifact.validate();
            expect(validation.isValid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('JiraTicket', () => {
    test('should calculate documentation ratio correctly', () => {
      const ticket = new JiraTicket({
        id: '1',
        key: 'TEST-1',
        summary: 'Test ticket',
        description: 'A'.repeat(500), // Long description
        assignee: 'user1',
        status: 'Done',
        created: '2024-01-01',
        updated: '2024-01-02',
        commentCount: 10,
        documentationLinks: ['link1', 'link2', 'link3']
      });

      const ratio = ticket.getDocumentationRatio();
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThanOrEqual(1);
    });

    /**
     * Property: For any valid Jira ticket data,
     * documentation ratio should be between 0 and 1
     */
    test('property: documentation ratio is always between 0 and 1', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1 }),
            key: fc.string({ minLength: 1 }),
            summary: fc.string({ minLength: 1 }),
            description: fc.string(),
            assignee: fc.string({ minLength: 1 }),
            status: fc.string(),
            created: fc.date().map(d => d.toISOString()),
            updated: fc.date().map(d => d.toISOString()),
            commentCount: fc.nat({ max: 100 }),
            documentationLinks: fc.array(fc.string())
          }),
          (data) => {
            const ticket = new JiraTicket(data);
            const ratio = ticket.getDocumentationRatio();
            expect(ratio).toBeGreaterThanOrEqual(0);
            expect(ratio).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('KnowledgeGapReport', () => {
    test('should calculate risk level correctly', () => {
      expect(KnowledgeGapReport.calculateRiskLevel(6, 0.2)).toBe('HIGH');
      expect(KnowledgeGapReport.calculateRiskLevel(4, 0.4)).toBe('MEDIUM');
      expect(KnowledgeGapReport.calculateRiskLevel(2, 0.8)).toBe('LOW');
    });

    /**
     * Property: For any ticket count > 5 and documentation ratio < 0.3,
     * risk level should be HIGH
     */
    test('property: high activity with low documentation results in HIGH risk', () => {
      fc.assert(
        fc.property(
          fc.record({
            ticketCount: fc.integer({ min: 6, max: 50 }),
            documentationRatio: fc.float({ min: 0, max: Math.fround(0.29), noNaN: true })
          }),
          (data) => {
            const riskLevel = KnowledgeGapReport.calculateRiskLevel(
              data.ticketCount, 
              data.documentationRatio
            );
            expect(riskLevel).toBe('HIGH');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any valid knowledge gap report data,
     * the created object should have all required fields
     */
    test('property: valid reports contain all required fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            userId: fc.string({ minLength: 1 }),
            ticketCount: fc.nat({ max: 100 }),
            documentationRatio: fc.float({ min: 0, max: 1, noNaN: true }),
            riskLevel: fc.constantFrom('HIGH', 'MEDIUM', 'LOW'),
            recommendedActions: fc.array(fc.string())
          }),
          (data) => {
            const report = new KnowledgeGapReport(data);
            const validation = report.validate();
            expect(validation.isValid).toBe(true);
            expect(report.userId).toBe(data.userId);
            expect(report.ticketCount).toBe(data.ticketCount);
            expect(report.documentationRatio).toBe(data.documentationRatio);
            expect(report.riskLevel).toBe(data.riskLevel);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('ConfluencePageResult', () => {
    test('should validate successful page creation', () => {
      const result = new ConfluencePageResult({
        success: true,
        pageUrl: 'https://example.atlassian.net/wiki/spaces/TEST/pages/123',
        pageId: '123'
      });

      const validation = result.validate();
      expect(validation.isValid).toBe(true);
    });

    test('should validate failed page creation', () => {
      const result = new ConfluencePageResult({
        success: false,
        error: 'Permission denied'
      });

      const validation = result.validate();
      expect(validation.isValid).toBe(true);
    });

    /**
     * Property: For any successful page creation,
     * pageUrl should be present
     */
    test('property: successful operations must have page URL', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          (pageUrl) => {
            const result = new ConfluencePageResult({
              success: true,
              pageUrl: pageUrl
            });
            const validation = result.validate();
            expect(validation.isValid).toBe(true);
            expect(result.pageUrl).toBe(pageUrl);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('ForgeApiResponse', () => {
    test('should identify successful responses', () => {
      const response = new ForgeApiResponse({
        status: 200,
        data: { message: 'success' }
      });

      expect(response.isSuccess()).toBe(true);
    });

    test('should identify failed responses', () => {
      const response = new ForgeApiResponse({
        status: 404,
        data: { error: 'not found' }
      });

      expect(response.isSuccess()).toBe(false);
    });

    /**
     * Property: For any HTTP status code in 200-299 range,
     * isSuccess() should return true
     */
    test('property: 2xx status codes are successful', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 200, max: 299 }),
          (status) => {
            const response = new ForgeApiResponse({
              status: status,
              data: {}
            });
            expect(response.isSuccess()).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('ApiError', () => {
    test('should create valid API error', () => {
      const error = new ApiError({
        code: 'PERMISSION_DENIED',
        message: 'Access denied'
      });

      const validation = error.validate();
      expect(validation.isValid).toBe(true);
      expect(error.name).toBe('ApiError');
    });

    /**
     * Property: For any valid error code and message,
     * ApiError should validate successfully
     */
    test('property: valid errors pass validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            code: fc.string({ minLength: 1 }),
            message: fc.string({ minLength: 1 }),
            details: fc.option(fc.object())
          }),
          (data) => {
            const error = new ApiError(data);
            const validation = error.validate();
            expect(validation.isValid).toBe(true);
            expect(error.code).toBe(data.code);
            expect(error.message).toBe(data.message);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('BitbucketPR', () => {
    test('should create valid Bitbucket PR with required fields', () => {
      const pr = new BitbucketPR({
        id: 'pr-123',
        title: 'Test PR',
        author: 'user1',
        created: '2024-01-01T10:00:00Z'
      });

      const validation = pr.validate();
      expect(validation.isValid).toBe(true);
      expect(pr.getTotalLinesChanged()).toBe(0);
      expect(pr.isHighComplexity()).toBe(false);
    });

    test('should identify high complexity PRs', () => {
      const pr = new BitbucketPR({
        id: 'pr-456',
        title: 'Complex PR',
        author: 'user2',
        created: '2024-01-01T10:00:00Z',
        complexityScore: 8.5
      });

      expect(pr.isHighComplexity()).toBe(true);
    });

    /**
     * Property: For any valid Bitbucket PR data,
     * the created object should pass validation
     */
    test('property: valid Bitbucket PRs pass validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1 }),
            title: fc.string({ minLength: 1 }),
            author: fc.string({ minLength: 1 }),
            created: fc.date().map(d => d.toISOString()),
            complexityScore: fc.float({ min: 0, max: 10, noNaN: true }),
            linesAdded: fc.nat({ max: 10000 }),
            linesDeleted: fc.nat({ max: 10000 })
          }),
          (data) => {
            const pr = new BitbucketPR(data);
            const validation = pr.validate();
            expect(validation.isValid).toBe(true);
            expect(pr.getTotalLinesChanged()).toBe(data.linesAdded + data.linesDeleted);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Commit', () => {
    test('should create valid commit with required fields', () => {
      const commit = new Commit({
        hash: 'abc123def456',
        message: 'Test commit',
        author: 'user1',
        date: '2024-01-01T10:00:00Z'
      });

      const validation = commit.validate();
      expect(validation.isValid).toBe(true);
    });

    /**
     * Property: For any valid commit data,
     * the created object should pass validation
     */
    test('property: valid commits pass validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            hash: fc.string({ minLength: 1 }),
            message: fc.string({ minLength: 1 }),
            author: fc.string({ minLength: 1 }),
            date: fc.date().map(d => d.toISOString()),
            filesChanged: fc.array(fc.string()),
            linesChanged: fc.nat({ max: 10000 })
          }),
          (data) => {
            const commit = new Commit(data);
            const validation = commit.validate();
            expect(validation.isValid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('CodeArtifact', () => {
    test('should create valid code artifact with required fields', () => {
      const artifact = new CodeArtifact({
        type: 'PR',
        id: 'pr-123',
        title: 'Test PR',
        author: 'user1',
        date: '2024-01-01T10:00:00Z'
      });

      const validation = artifact.validate();
      expect(validation.isValid).toBe(true);
    });

    /**
     * Property: For any valid code artifact data,
     * the created object should pass validation
     */
    test('property: valid code artifacts pass validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom('PR', 'COMMIT', 'JIRA_TICKET'),
            id: fc.string({ minLength: 1 }),
            title: fc.string({ minLength: 1 }),
            author: fc.string({ minLength: 1 }),
            date: fc.date().map(d => d.toISOString()),
            documentationLevel: fc.constantFrom('NONE', 'MINIMAL', 'ADEQUATE', 'COMPREHENSIVE'),
            complexityIndicators: fc.array(fc.string())
          }),
          (data) => {
            const artifact = new CodeArtifact(data);
            const validation = artifact.validate();
            expect(validation.isValid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('DeveloperActivity', () => {
    test('should create valid developer activity with required fields', () => {
      const activity = new DeveloperActivity({
        userId: 'user123'
      });

      const validation = activity.validate();
      expect(validation.isValid).toBe(true);
      expect(activity.getTotalActivity()).toBe(0);
    });

    /**
     * Property: For any valid developer activity data,
     * the created object should pass validation
     */
    test('property: valid developer activities pass validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            userId: fc.string({ minLength: 1 }),
            jiraTickets: fc.array(fc.object()),
            pullRequests: fc.array(fc.object()),
            commits: fc.array(fc.object()),
            totalComplexityScore: fc.float({ min: 0, max: 100, noNaN: true }),
            documentationRatio: fc.float({ min: 0, max: 1, noNaN: true })
          }),
          (data) => {
            const activity = new DeveloperActivity(data);
            const validation = activity.validate();
            expect(validation.isValid).toBe(true);
            expect(activity.getTotalActivity()).toBe(
              data.jiraTickets.length + data.pullRequests.length + data.commits.length
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('UndocumentedIntensityReport', () => {
    test('should create valid undocumented intensity report', () => {
      const report = new UndocumentedIntensityReport({
        userId: 'user123'
      });

      const validation = report.validate();
      expect(validation.isValid).toBe(true);
    });

    test('should calculate risk level correctly', () => {
      expect(UndocumentedIntensityReport.calculateRiskLevel(8.5)).toBe('CRITICAL');
      expect(UndocumentedIntensityReport.calculateRiskLevel(6.5)).toBe('HIGH');
      expect(UndocumentedIntensityReport.calculateRiskLevel(4.0)).toBe('MEDIUM');
      expect(UndocumentedIntensityReport.calculateRiskLevel(2.0)).toBe('LOW');
    });

    /**
     * Property: For any valid undocumented intensity report data,
     * the created object should pass validation
     */
    test('property: valid undocumented intensity reports pass validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            userId: fc.string({ minLength: 1 }),
            highComplexityPRs: fc.array(fc.object()),
            criticalJiraTickets: fc.array(fc.object()),
            documentationLinks: fc.array(fc.string()),
            undocumentedIntensityScore: fc.float({ min: 0, max: 20, noNaN: true }),
            specificArtifacts: fc.array(fc.string()),
            riskLevel: fc.constantFrom('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')
          }),
          (data) => {
            const report = new UndocumentedIntensityReport(data);
            const validation = report.validate();
            expect(validation.isValid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('InterviewContext', () => {
    test('should create valid interview context with enhanced fields', () => {
      const context = new InterviewContext({
        employeeId: 'emp-123',
        sessionId: 'session-456',
        recentPullRequests: [],
        commitHistory: [],
        undocumentedIntensityScore: 5.5,
        specificArtifacts: ['PR #123', 'JIRA-456']
      });

      const validation = context.validate();
      expect(validation.isValid).toBe(true);
    });

    /**
     * Property: For any valid interview context data,
     * the created object should pass validation
     */
    test('property: valid interview contexts pass validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            employeeId: fc.string({ minLength: 1 }),
            sessionId: fc.string({ minLength: 1 }),
            department: fc.string(),
            role: fc.string(),
            identifiedGaps: fc.array(fc.object()),
            recentPullRequests: fc.array(fc.object()),
            commitHistory: fc.array(fc.object()),
            undocumentedIntensityScore: fc.float({ min: 0, max: 20, noNaN: true }),
            specificArtifacts: fc.array(fc.string())
          }),
          (data) => {
            const context = new InterviewContext(data);
            const validation = context.validate();
            expect(validation.isValid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});