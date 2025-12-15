const fc = require('fast-check');
const {
  KnowledgeArtifact,
  InterviewContext,
  JiraTicket,
  KnowledgeGapReport,
  ConfluencePageResult,
  ForgeApiResponse,
  ApiError
} = require('../models');

/**
 * Feature: institutional-memory-archaeologist, Property 4: Structured data return format
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
            relatedTickets: fc.array(fc.string())
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
});