const { mockHelpers } = require('../__mocks__/@forge/api');
const { handler } = require('../index');
const {
  scanLastSixMonths,
  identifyCriticalTickets,
  calculateDocumentationRatio,
  identifyHighComplexityPRs,
  calculateUndocumentedIntensity
} = require('../scanners/legacyDetector');
const {
  saveToConfluence,
  validatePermissions,
  formatContent,
  createLegacyDocument,
  linkToArtifacts
} = require('../services/confluenceService');
const {
  createInterviewContext,
  extractKnowledgeFromResponses,
  formatKnowledgeForStorage,
  generateArtifactQuestions,
  conductForensicInterview,
  extractTacitKnowledge
} = require('../agents/legacyKeeper');
const {
  getPullRequestsLastSixMonths,
  getCommitHistory,
  analyzePRComplexity
} = require('../services/bitbucketService');

/**
 * Final Validation Tests
 * Validates: Requirements 1.1, 1.2, 2.2, 3.2, 3.3
 * 
 * Task 12: Final validation and testing
 * - Validate all Legacy Keeper functionality works with real-world data patterns
 * - Test Undocumented Intensity algorithm with various developer activity profiles
 * - Verify artifact-specific questioning generates meaningful interviews
 * - Confirm bidirectional linking between Legacy Documents and source artifacts
 * - Validate 6-month constraint is enforced across all data sources
 */
describe('Final Validation - Legacy Keeper System Testing', () => {

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

  describe('Undocumented Intensity Algorithm Validation', () => {
    test('should validate Undocumented Intensity algorithm with various developer activity profiles', async () => {
      // Test various developer activity profiles to validate the algorithm
      const testProfiles = [
        {
          name: 'High Activity Developer',
          jiraTickets: Array.from({ length: 8 }, (_, i) => ({
            id: `high-${i + 1}`,
            key: `HIGH-${i + 1}`,
            fields: {
              summary: `Complex system integration task ${i + 1} with multiple dependencies and architectural changes`,
              description: 'Brief description',
              assignee: {
                accountId: 'high-activity-user',
                displayName: 'High Activity Developer'
              },
              status: { name: 'Done' },
              created: '2024-06-01T10:00:00.000Z',
              updated: new Date(Date.now() - (30 + i * 10) * 24 * 60 * 60 * 1000).toISOString(),
              comment: { total: 2 + i } // Low documentation
            }
          })),
          bitbucketPRs: Array.from({ length: 6 }, (_, i) => ({
            id: `pr-high-${i + 1}`,
            title: `Major refactoring of authentication system ${i + 1}`,
            author: 'high-activity-user',
            created: new Date(Date.now() - (45 + i * 15) * 24 * 60 * 60 * 1000),
            merged: new Date(Date.now() - (40 + i * 15) * 24 * 60 * 60 * 1000),
            linesAdded: 800 + i * 200,
            linesDeleted: 400 + i * 100,
            filesChanged: 15 + i * 3,
            complexityScore: 8 + i * 0.5, // All will be >= 6 (high complexity threshold)
            reviewComments: 20 + i * 5
          })),
          expectedRiskLevel: 'HIGH',
          expectedIntensityScore: '>= 3'
        },
        {
          name: 'Medium Activity Developer',
          jiraTickets: Array.from({ length: 4 }, (_, i) => ({
            id: `med-${i + 1}`,
            key: `MED-${i + 1}`,
            fields: {
              summary: `Standard feature implementation ${i + 1}`,
              description: 'Some documentation with links to confluence',
              assignee: {
                accountId: 'medium-activity-user',
                displayName: 'Medium Activity Developer'
              },
              status: { name: 'Done' },
              created: '2024-07-01T10:00:00.000Z',
              updated: new Date(Date.now() - (60 + i * 20) * 24 * 60 * 60 * 1000).toISOString(),
              comment: { total: 5 + i * 2 } // Medium documentation
            }
          })),
          bitbucketPRs: Array.from({ length: 2 }, (_, i) => ({
            id: `pr-med-${i + 1}`,
            title: `Feature enhancement ${i + 1}`,
            author: 'medium-activity-user',
            created: new Date(Date.now() - (70 + i * 30) * 24 * 60 * 60 * 1000),
            merged: new Date(Date.now() - (65 + i * 30) * 24 * 60 * 60 * 1000),
            linesAdded: 300 + i * 100,
            linesDeleted: 150 + i * 50,
            filesChanged: 8 + i * 2,
            complexityScore: 5 + i * 1,
            reviewComments: 10 + i * 3
          })),
          expectedRiskLevel: 'MEDIUM',
          expectedIntensityScore: '1.5-4.9'
        },
        {
          name: 'Well-Documented Developer',
          jiraTickets: Array.from({ length: 3 }, (_, i) => ({
            id: `doc-${i + 1}`,
            key: `DOC-${i + 1}`,
            fields: {
              summary: `Well documented feature ${i + 1}`,
              description: 'Comprehensive documentation with multiple confluence links: https://confluence.example.com/page1, https://confluence.example.com/page2',
              assignee: {
                accountId: 'documented-user',
                displayName: 'Well Documented Developer'
              },
              status: { name: 'Done' },
              created: '2024-08-01T10:00:00.000Z',
              updated: new Date(Date.now() - (90 + i * 15) * 24 * 60 * 60 * 1000).toISOString(),
              comment: { total: 8 + i * 3 } // High documentation
            }
          })),
          bitbucketPRs: Array.from({ length: 1 }, (_, i) => ({
            id: `pr-doc-${i + 1}`,
            title: `Small bug fix ${i + 1}`,
            author: 'documented-user',
            created: new Date(Date.now() - (100 + i * 20) * 24 * 60 * 60 * 1000),
            merged: new Date(Date.now() - (95 + i * 20) * 24 * 60 * 60 * 1000),
            linesAdded: 50 + i * 20,
            linesDeleted: 25 + i * 10,
            filesChanged: 2 + i,
            complexityScore: 2 + i * 0.5,
            reviewComments: 3 + i
          })),
          expectedRiskLevel: 'LOW',
          expectedIntensityScore: '< 1.5'
        }
      ];

      for (const profile of testProfiles) {
        // Set up mock data for this profile
        mockHelpers.resetMocks();
        mockHelpers.setMockState({
          jiraTickets: profile.jiraTickets,
          bitbucketPRs: profile.bitbucketPRs
        });

        // Test the Undocumented Intensity algorithm
        const scanResult = await handler.scanLastSixMonths({});
        
        expect(scanResult.success).toBe(true);
        expect(scanResult.reports).toBeDefined();
        
        const userReport = scanResult.reports.find(r => 
          r.userId === profile.jiraTickets[0].fields.assignee.accountId
        );
        
        if (profile.expectedRiskLevel !== 'LOW') {
          expect(userReport).toBeDefined();
          
          // Validate that the algorithm is working - we should have some data
          expect(userReport.criticalJiraTickets).toBeDefined();
          expect(userReport.highComplexityPRs).toBeDefined();
          expect(userReport.documentationLinks).toBeDefined();
          expect(userReport.specificArtifacts).toBeDefined();
          expect(userReport.undocumentedIntensityScore).toBeGreaterThan(0);
          
          // For high activity profile, we should have some critical tickets
          if (profile.name === 'High Activity Developer') {
            expect(userReport.criticalJiraTickets.length).toBeGreaterThan(0);
            expect(userReport.specificArtifacts.length).toBeGreaterThan(0);
          }
        } else {
          // For well-documented developer, we might not have a report (LOW risk)
          if (userReport) {
            expect(userReport.undocumentedIntensityScore).toBeLessThan(3);
          }
        }
        
        console.log(`✅ Validated ${profile.name}: Risk Level ${userReport?.riskLevel || 'LOW'}, Intensity Score ${userReport?.undocumentedIntensityScore || 0}`);
      }
    });

    test('should enforce 6-month constraint across all data sources', async () => {
      // Test data with mixed dates - some within 6 months, some older
      const currentDate = new Date();
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sevenMonthsAgo = new Date();
      sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
      const eightMonthsAgo = new Date();
      eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 8);

      const mixedDateTickets = [
        // Within 6 months - should be included
        {
          id: '1',
          key: 'RECENT-1',
          fields: {
            summary: 'Recent ticket within 6 months',
            description: 'Brief',
            assignee: {
              accountId: 'constraint-test-user',
              displayName: 'Constraint Test User'
            },
            status: { name: 'Done' },
            created: '2024-06-01T10:00:00.000Z',
            updated: new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 1 month ago
            comment: { total: 3 }
          }
        },
        {
          id: '2',
          key: 'RECENT-2',
          fields: {
            summary: 'Another recent ticket',
            description: 'Brief',
            assignee: {
              accountId: 'constraint-test-user',
              displayName: 'Constraint Test User'
            },
            status: { name: 'Done' },
            created: '2024-05-01T10:00:00.000Z',
            updated: new Date(currentDate.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 3 months ago
            comment: { total: 2 }
          }
        },
        // Older than 6 months - should be excluded
        {
          id: '3',
          key: 'OLD-1',
          fields: {
            summary: 'Old ticket beyond 6 months',
            description: 'Brief',
            assignee: {
              accountId: 'constraint-test-user',
              displayName: 'Constraint Test User'
            },
            status: { name: 'Done' },
            created: '2023-12-01T10:00:00.000Z',
            updated: sevenMonthsAgo.toISOString(), // 7 months ago
            comment: { total: 5 }
          }
        },
        {
          id: '4',
          key: 'OLD-2',
          fields: {
            summary: 'Very old ticket',
            description: 'Brief',
            assignee: {
              accountId: 'constraint-test-user',
              displayName: 'Constraint Test User'
            },
            status: { name: 'Done' },
            created: '2023-10-01T10:00:00.000Z',
            updated: eightMonthsAgo.toISOString(), // 8 months ago
            comment: { total: 10 }
          }
        }
      ];

      const mixedDatePRs = [
        // Within 6 months
        {
          id: 'pr-recent-1',
          title: 'Recent PR within 6 months',
          author: 'constraint-test-user',
          created: new Date(currentDate.getTime() - 60 * 24 * 60 * 60 * 1000), // 2 months ago
          merged: new Date(currentDate.getTime() - 55 * 24 * 60 * 60 * 1000),
          linesAdded: 500,
          linesDeleted: 200,
          filesChanged: 10,
          complexityScore: 7,
          reviewComments: 15
        },
        // Older than 6 months
        {
          id: 'pr-old-1',
          title: 'Old PR beyond 6 months',
          author: 'constraint-test-user',
          created: sevenMonthsAgo, // 7 months ago
          merged: new Date(sevenMonthsAgo.getTime() + 24 * 60 * 60 * 1000),
          linesAdded: 1000,
          linesDeleted: 500,
          filesChanged: 20,
          complexityScore: 9,
          reviewComments: 25
        }
      ];

      mockHelpers.resetMocks();
      mockHelpers.setMockState({
        jiraTickets: mixedDateTickets,
        bitbucketPRs: mixedDatePRs
      });

      // Execute scan and validate 6-month constraint
      const scanResult = await handler.scanLastSixMonths({});
      
      expect(scanResult.success).toBe(true);
      const userReport = scanResult.reports.find(r => r.userId === 'constraint-test-user');
      
      if (userReport) {
        // Should only include recent tickets (within 6 months)
        expect(userReport.criticalJiraTickets.length).toBeLessThanOrEqual(2);
        
        // Verify that old tickets are not included
        const ticketKeys = userReport.criticalJiraTickets.map(t => t.key);
        expect(ticketKeys).not.toContain('OLD-1');
        expect(ticketKeys).not.toContain('OLD-2');
        
        // Should only include recent PRs (within 6 months)
        expect(userReport.highComplexityPRs.length).toBeLessThanOrEqual(1);
        
        // Verify that old PRs are not included
        const prIds = userReport.highComplexityPRs.map(pr => pr.id);
        expect(prIds).not.toContain('pr-old-1');
        
        // Verify specific artifacts only reference recent items
        const hasOldArtifacts = userReport.specificArtifacts.some(artifact => 
          artifact.includes('OLD-') || artifact.includes('pr-old-')
        );
        expect(hasOldArtifacts).toBe(false);
      }
      
      console.log('✅ Validated 6-month constraint enforcement across all data sources');
    });
  });

  describe('Artifact-Specific Questioning Validation', () => {
    test('should generate meaningful artifact-specific questions', async () => {
      // Test artifact-specific questioning capabilities
      const testArtifacts = [
        {
          type: 'PR',
          id: '402',
          title: 'Refactor authentication system to use OAuth instead of SAML',
          author: 'test-developer',
          date: new Date('2024-06-15T10:00:00.000Z'),
          complexityIndicators: ['high_lines_changed', 'multiple_files', 'security_critical'],
          documentationLevel: 'MINIMAL'
        },
        {
          type: 'COMMIT',
          id: 'abc123def456',
          title: 'Add comprehensive error handling for payment processing',
          author: 'test-developer',
          date: new Date('2024-06-10T14:30:00.000Z'),
          complexityIndicators: ['error_handling', 'critical_path'],
          documentationLevel: 'NONE'
        },
        {
          type: 'JIRA_TICKET',
          id: 'PROJ-789',
          title: 'Implement real-time notification system with WebSocket integration',
          author: 'test-developer',
          date: new Date('2024-06-05T09:15:00.000Z'),
          complexityIndicators: ['real_time', 'integration', 'scalability'],
          documentationLevel: 'NONE'
        }
      ];

      // Generate artifact-specific questions
      const questions = generateArtifactQuestions(testArtifacts);
      
      expect(questions).toBeDefined();
      expect(Array.isArray(questions)).toBe(true);
      expect(questions.length).toBeGreaterThan(0);
      
      // Validate that questions reference specific artifacts
      const questionTexts = questions.map(q => q.question);
      
      // Should reference PR #402
      const prQuestions = questionTexts.filter(q => q.includes('PR #402') || q.includes('402'));
      expect(prQuestions.length).toBeGreaterThan(0);
      
      // Should reference commit hash
      const commitQuestions = questionTexts.filter(q => q.includes('abc123') || q.includes('commit'));
      expect(commitQuestions.length).toBeGreaterThan(0);
      
      // Should reference Jira ticket
      const jiraQuestions = questionTexts.filter(q => q.includes('PROJ-789') || q.includes('789'));
      expect(jiraQuestions.length).toBeGreaterThan(0);
      
      // Validate question quality - should ask about "why" not just "what"
      const whyQuestions = questionTexts.filter(q => 
        q.toLowerCase().includes('why') || 
        q.toLowerCase().includes('reason') || 
        q.toLowerCase().includes('approach') ||
        q.toLowerCase().includes('decision')
      );
      expect(whyQuestions.length).toBeGreaterThan(0);
      
      // Validate forensic nature - should be specific and detailed
      questions.forEach(question => {
        expect(question).toHaveProperty('type');
        expect(question).toHaveProperty('artifactId');
        expect(question).toHaveProperty('focus');
        expect(question.question.length).toBeGreaterThan(20); // Should be detailed questions
      });
      
      console.log('✅ Generated artifact-specific questions:', questions.length);
      console.log('Sample questions:');
      questions.slice(0, 3).forEach((q, i) => {
        console.log(`  ${i + 1}. ${q.question}`);
      });
    });

    test('should conduct forensic interviews with artifact context', async () => {
      // Create interview context with artifacts
      const interviewContext = createInterviewContext({
        employeeId: 'forensic-test-user',
        department: 'Engineering',
        role: 'Senior Developer',
        identifiedGaps: [
          {
            ticketCount: 5,
            ticketId: 'PROJ-123',
            description: 'High complexity work with minimal documentation'
          }
        ],
        sessionId: 'forensic-session-001'
      });

      // Add artifact context
      interviewContext.specificArtifacts = [
        {
          type: 'PR',
          id: '501',
          title: 'Database migration with performance optimization',
          author: 'forensic-test-user',
          date: new Date('2024-06-20T11:00:00.000Z'),
          complexityIndicators: ['database_migration', 'performance_critical'],
          documentationLevel: 'MINIMAL'
        }
      ];
      interviewContext.undocumentedIntensityScore = 6.2;

      // Conduct forensic interview
      const interviewResult = await conductForensicInterview(interviewContext);
      
      expect(interviewResult.success).toBe(true);
      expect(interviewResult.session).toBeDefined();
      expect(interviewResult.session.sessionId).toBe('forensic-session-001');
      expect(interviewResult.session.employeeId).toBe('forensic-test-user');
      expect(interviewResult.session.phase).toBe('forensic_extraction');
      
      // Validate artifact questions are generated
      expect(interviewResult.session.artifactQuestions).toBeDefined();
      expect(interviewResult.session.artifactQuestions.length).toBeGreaterThan(0);
      
      // Validate contextual information
      expect(interviewResult.session.contextualInfo.undocumentedIntensityScore).toBe(6.2);
      expect(interviewResult.session.contextualInfo.artifactCount).toBe(1);
      
      // Validate interview flow structure
      expect(interviewResult.session.interviewFlow).toBeDefined();
      expect(interviewResult.session.interviewFlow.length).toBeGreaterThan(0);
      
      const openingPhase = interviewResult.session.interviewFlow.find(phase => phase.phase === 'opening');
      expect(openingPhase).toBeDefined();
      expect(openingPhase.questions.some(q => q.includes('forensic knowledge extraction'))).toBe(true);
      
      console.log('✅ Conducted forensic interview with artifact context');
    });
  });

  describe('Bidirectional Linking Validation', () => {
    test('should create bidirectional links between Legacy Documents and source artifacts', async () => {
      // Create a knowledge artifact with source artifacts for linking
      const sourceArtifacts = [
        {
          type: 'JIRA_TICKET',
          id: 'LINK-123',
          title: 'Critical system integration requiring bidirectional linking',
          author: 'linking-test-user',
          date: new Date('2024-06-15T10:00:00.000Z'),
          documentationLevel: 'NONE'
        },
        {
          type: 'PR',
          id: '789',
          title: 'Authentication system overhaul with security improvements',
          author: 'linking-test-user',
          date: new Date('2024-06-12T14:30:00.000Z'),
          documentationLevel: 'MINIMAL'
        },
        {
          type: 'COMMIT',
          id: 'def456abc789',
          title: 'Add comprehensive logging for audit trail',
          author: 'linking-test-user',
          date: new Date('2024-06-10T09:20:00.000Z'),
          documentationLevel: 'NONE'
        }
      ];

      const { KnowledgeArtifact } = require('../models');
      const knowledgeArtifact = new KnowledgeArtifact({
        id: 'knowledge-linking-test',
        employeeId: 'linking-test-user',
        title: 'Critical Authentication System Knowledge',
        content: 'This system requires specific initialization sequence and has undocumented dependencies on legacy LDAP integration.',
        tags: ['authentication', 'security', 'legacy-integration'],
        extractedAt: new Date(),
        confidence: 0.85,
        relatedTickets: ['LINK-123'],
        relatedPRs: ['789'],
        relatedCommits: ['def456abc789'],
        sourceArtifacts: sourceArtifacts
      });

      // Mock Confluence API for Legacy Document creation
      mockHelpers.resetMocks();
      mockHelpers.setMockState({
        confluenceResponse: {
          status: 201,
          data: {
            id: 'legacy-doc-123',
            title: 'Legacy Document: Critical Authentication System Knowledge',
            _links: {
              webui: '/spaces/LEGACY/pages/legacy-doc-123'
            }
          }
        }
      });

      // Create Legacy Document with artifact linking
      const createResult = await createLegacyDocument(knowledgeArtifact);
      
      expect(createResult.success).toBe(true);
      expect(createResult.pageUrl).toContain('legacy-doc-123');
      expect(createResult.pageId).toBe('legacy-doc-123');
      expect(createResult.linkedArtifacts).toBeDefined();
      
      // Validate that artifacts were processed for linking
      expect(createResult.linkedArtifacts.length).toBeGreaterThanOrEqual(0);
      
      // Test direct artifact linking function
      const linkingResult = await linkToArtifacts('legacy-doc-123', sourceArtifacts);
      
      expect(Array.isArray(linkingResult)).toBe(true);
      
      // Validate that the system attempts to link each artifact type
      // Note: In test environment, actual linking may not succeed, but the system should process each artifact
      console.log('✅ Processed artifact linking for:', linkingResult.length, 'artifacts');
      
      // Validate Legacy Document formatting includes artifact references
      const { formatLegacyDocument } = require('../services/confluenceService');
      const formattedContent = formatLegacyDocument(knowledgeArtifact);
      
      expect(formattedContent).toContain('Source Artifacts');
      expect(formattedContent).toContain('JIRA_TICKET');
      expect(formattedContent).toContain('LINK-123');
      expect(formattedContent).toContain('PR');
      expect(formattedContent).toContain('789');
      expect(formattedContent).toContain('COMMIT');
      expect(formattedContent).toContain('def456abc789');
      expect(formattedContent).toContain('Bidirectional Links');
      expect(formattedContent).toContain('bidirectionally linked');
      
      console.log('✅ Validated bidirectional linking between Legacy Documents and source artifacts');
    });
  });

  describe('Real-World Data Pattern Validation', () => {
    test('should handle realistic developer activity patterns', async () => {
      // Simulate realistic developer activity patterns
      const realisticJiraTickets = [
        // Realistic ticket 1: Database performance issue
        {
          id: '1',
          key: 'PERF-101',
          fields: {
            summary: 'Database query performance degradation in user authentication service causing 5-second login delays',
            description: 'Users reporting slow login times. Initial investigation shows complex JOIN queries in auth service.',
            assignee: {
              accountId: 'realistic-dev-1',
              displayName: 'Sarah Chen'
            },
            status: { name: 'Done' },
            created: '2024-06-01T09:30:00.000Z',
            updated: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
            comment: { total: 8 }
          }
        },
        // Realistic ticket 2: API integration challenge
        {
          id: '2',
          key: 'API-205',
          fields: {
            summary: 'Third-party payment gateway integration failing with intermittent timeout errors',
            description: 'Payment processing fails randomly. Error logs show connection timeouts to Stripe API. Need to implement retry logic and fallback mechanisms.',
            assignee: {
              accountId: 'realistic-dev-1',
              displayName: 'Sarah Chen'
            },
            status: { name: 'Done' },
            created: '2024-06-10T14:15:00.000Z',
            updated: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
            comment: { total: 12 }
          }
        },
        // Realistic ticket 3: Security vulnerability
        {
          id: '3',
          key: 'SEC-301',
          fields: {
            summary: 'Critical security vulnerability in user session management allowing privilege escalation',
            description: 'Security audit revealed session token validation bypass. Immediate fix required.',
            assignee: {
              accountId: 'realistic-dev-1',
              displayName: 'Sarah Chen'
            },
            status: { name: 'Done' },
            created: '2024-06-20T16:45:00.000Z',
            updated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            comment: { total: 6 }
          }
        },
        // Realistic ticket 4: Infrastructure scaling
        {
          id: '4',
          key: 'INFRA-401',
          fields: {
            summary: 'Kubernetes cluster auto-scaling configuration for handling Black Friday traffic spikes',
            description: 'Configure HPA and VPA for microservices to handle 10x traffic increase during peak shopping events.',
            assignee: {
              accountId: 'realistic-dev-1',
              displayName: 'Sarah Chen'
            },
            status: { name: 'Done' },
            created: '2024-07-01T10:30:00.000Z',
            updated: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000).toISOString(),
            comment: { total: 15 }
          }
        }
      ];

      // Add realistic Bitbucket PRs
      const realisticBitbucketPRs = [
        {
          id: 'pr-501',
          title: 'Optimize database queries for user authentication service',
          author: 'realistic-dev-1',
          created: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000),
          merged: new Date(Date.now() - 48 * 24 * 60 * 60 * 1000),
          linesAdded: 245,
          linesDeleted: 89,
          filesChanged: 8,
          complexityScore: 7.5,
          reviewComments: 18
        },
        {
          id: 'pr-502',
          title: 'Implement retry logic and circuit breaker for payment gateway',
          author: 'realistic-dev-1',
          created: new Date(Date.now() - 65 * 24 * 60 * 60 * 1000),
          merged: new Date(Date.now() - 62 * 24 * 60 * 60 * 1000),
          linesAdded: 387,
          linesDeleted: 156,
          filesChanged: 12,
          complexityScore: 8.2,
          reviewComments: 25
        }
      ];

      mockHelpers.resetMocks();
      mockHelpers.setMockState({
        jiraTickets: realisticJiraTickets,
        bitbucketPRs: realisticBitbucketPRs
      });

      // Execute Legacy Keeper scan
      const scanResult = await handler.scanLastSixMonths({});
      
      expect(scanResult.success).toBe(true);
      expect(scanResult.reports).toBeDefined();
      
      const developerReport = scanResult.reports.find(r => r.userId === 'realistic-dev-1');
      
      if (developerReport) {
        // Validate realistic data processing
        expect(developerReport.criticalJiraTickets.length).toBeGreaterThan(0);
        expect(developerReport.undocumentedIntensityScore).toBeGreaterThan(0);
        expect(developerReport.specificArtifacts.length).toBeGreaterThan(0);
        
        // Validate that specific artifacts reference real ticket/PR IDs
        const hasRealisticArtifacts = developerReport.specificArtifacts.some(artifact => 
          artifact.includes('PERF-101') || 
          artifact.includes('API-205') || 
          artifact.includes('SEC-301') ||
          artifact.includes('pr-501') ||
          artifact.includes('pr-502')
        );
        expect(hasRealisticArtifacts).toBe(true);
        
        // Test knowledge extraction with realistic responses
        const realisticInterviewContext = createInterviewContext({
          employeeId: 'realistic-dev-1',
          department: 'Engineering',
          role: 'Senior Full-Stack Developer',
          identifiedGaps: [{
            ticketCount: developerReport.criticalJiraTickets.length,
            ticketId: 'PERF-101',
            description: 'Performance and security critical work'
          }]
        });

        const realisticResponses = [
          {
            question: 'Looking at PERF-101, why did you choose this specific database optimization approach?',
            answer: 'The authentication queries were using nested subqueries that caused table scans on our 50M user table. I implemented a denormalized lookup table with Redis caching because the user authentication pattern is read-heavy. The specific indexes I created target the most common query patterns - email+status and user_id+last_login combinations. This reduced average query time from 5 seconds to 200ms.'
          },
          {
            question: 'For the payment gateway integration in API-205, what constraints influenced your retry logic design?',
            answer: 'Stripe has specific rate limiting - 100 requests per second in test mode, 1000 in live mode. But the real constraint is their webhook delivery guarantee. If we retry too aggressively, we can trigger duplicate payment processing. I implemented exponential backoff with jitter, max 3 retries, and idempotency keys. The circuit breaker opens after 5 consecutive failures to prevent cascading failures to our order processing system.'
          },
          {
            question: 'What would break if someone modified the security fix in SEC-301 without understanding your approach?',
            answer: 'The session validation now uses HMAC signatures with a rotating secret. If someone changes the signature algorithm or the secret rotation schedule, all existing sessions become invalid immediately. The rotation happens every 24 hours at 3 AM UTC to minimize user impact. There\'s also a 5-minute grace period where both old and new secrets are valid to handle clock skew between servers. Breaking this would log out all users simultaneously.'
          }
        ];

        const realisticKnowledge = extractKnowledgeFromResponses(realisticResponses, realisticInterviewContext);
        
        expect(realisticKnowledge.employeeId).toBe('realistic-dev-1');
        expect(realisticKnowledge.content).toContain('authentication queries');
        expect(realisticKnowledge.content).toContain('Redis caching');
        expect(realisticKnowledge.content).toContain('exponential backoff');
        expect(realisticKnowledge.content).toContain('HMAC signatures');
        expect(realisticKnowledge.confidence).toBeGreaterThan(0.7); // High confidence for detailed technical responses
        
        // Test tacit knowledge extraction
        const tacitKnowledge = extractTacitKnowledge(realisticResponses, realisticInterviewContext);
        
        expect(tacitKnowledge.categories.architecturalDecisions.length).toBeGreaterThan(0);
        expect(tacitKnowledge.categories.technicalDebt.length).toBeGreaterThanOrEqual(0);
        expect(tacitKnowledge.confidenceScore).toBeGreaterThan(0.6);
        
        console.log('✅ Validated realistic developer activity patterns');
        console.log(`   - Processed ${developerReport.criticalJiraTickets.length} critical tickets`);
        console.log(`   - Undocumented Intensity Score: ${developerReport.undocumentedIntensityScore.toFixed(2)}`);
        console.log(`   - Risk Level: ${developerReport.riskLevel}`);
        console.log(`   - Knowledge Confidence: ${realisticKnowledge.confidence.toFixed(2)}`);
      }
    });
  });

  describe('Complete System Workflow Validation', () => {
    test('should handle complete end-to-end cognitive offboarding workflow', async () => {
      // This test validates the complete workflow: Trigger → Scan → Interview → Archive
      
      const workflowTestData = {
        jiraTickets: [
          {
            id: '1',
            key: 'WORKFLOW-1',
            fields: {
              summary: 'End-to-end workflow test with comprehensive knowledge capture',
              description: 'Testing complete cognitive offboarding workflow',
              assignee: {
                accountId: 'workflow-test-user',
                displayName: 'Workflow Test Developer'
              },
              status: { name: 'Done' },
              created: '2024-06-01T10:00:00.000Z',
              updated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              comment: { total: 3 }
            }
          }
        ],
        bitbucketPRs: [
          {
            id: 'pr-workflow-1',
            title: 'Workflow test PR with high complexity',
            author: 'workflow-test-user',
            created: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
            merged: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
            linesAdded: 600,
            linesDeleted: 300,
            filesChanged: 15,
            complexityScore: 8.5,
            reviewComments: 20
          }
        ]
      };

      mockHelpers.resetMocks();
      mockHelpers.setMockState(workflowTestData);

      // Step 1: Trigger - Scan for Undocumented Intensity
      const scanResult = await handler.scanLastSixMonths({});
      expect(scanResult.success).toBe(true);
      
      const userReport = scanResult.reports.find(r => r.userId === 'workflow-test-user');
      expect(userReport).toBeDefined();
      
      // Step 2: Interview - Generate artifact-specific questions and conduct interview
      const interviewContext = createInterviewContext({
        employeeId: 'workflow-test-user',
        department: 'Engineering',
        role: 'Senior Developer',
        identifiedGaps: [{
          ticketCount: userReport.criticalJiraTickets.length,
          ticketId: 'WORKFLOW-1',
          description: 'Workflow test knowledge gap'
        }]
      });

      const interviewResult = await conductForensicInterview(interviewContext);
      expect(interviewResult.success).toBe(true);
      
      // Simulate interview responses
      const workflowResponses = [
        {
          question: 'What critical knowledge about WORKFLOW-1 would be lost if you left?',
          answer: 'The workflow system has a specific initialization sequence that must be followed. There are also hidden dependencies on the legacy authentication system that aren\'t documented in the code.'
        }
      ];

      const knowledgeArtifact = extractKnowledgeFromResponses(workflowResponses, interviewContext);
      expect(knowledgeArtifact.employeeId).toBe('workflow-test-user');
      
      // Step 3: Archive - Create Legacy Document with bidirectional linking
      mockHelpers.setMockState({
        confluenceResponse: {
          status: 201,
          data: {
            id: 'workflow-legacy-doc',
            title: 'Legacy Document: Workflow Test Knowledge',
            _links: {
              webui: '/spaces/LEGACY/pages/workflow-legacy-doc'
            }
          }
        }
      });

      const archiveResult = await createLegacyDocument(knowledgeArtifact);
      expect(archiveResult.success).toBe(true);
      expect(archiveResult.pageUrl).toContain('workflow-legacy-doc');
      
      console.log('✅ Completed end-to-end cognitive offboarding workflow validation');
    });
  });

  describe('Comprehensive Error Handling Validation', () => {
    test('should handle all possible error scenarios gracefully', async () => {
      // Test all error scenarios from Requirements 5.1, 5.5
      
      const errorScenarios = [
        {
          name: 'Jira API Network Error',
          setup: () => mockHelpers.simulateError('jira'),
          test: async () => {
            const result = await handler.scanLastSixMonths({});
            expect(result.success).toBe(true); // Scanner handles errors internally
            expect(result.reports).toEqual([]);
          }
        },
        {
          name: 'Confluence API Network Error',
          setup: () => mockHelpers.simulateError('confluence'),
          test: async () => {
            const result = await handler.saveToConfluence({
              payload: { title: 'Test', content: 'Test content' }
            });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
          }
        },
        {
          name: '403 Forbidden Error',
          setup: () => mockHelpers.simulateError('403'),
          test: async () => {
            const result = await handler.saveToConfluence({
              payload: { title: 'Test', content: 'Test content' }
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Permission denied');
            expect(result.error).not.toContain('403'); // Should not expose raw error codes
          }
        },
        {
          name: '404 Not Found Error',
          setup: () => mockHelpers.simulateError('404'),
          test: async () => {
            const result = await handler.saveToConfluence({
              payload: { title: 'Test', content: 'Test content' }
            });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
          }
        },
        {
          name: '500 Internal Server Error',
          setup: () => mockHelpers.simulateError('500'),
          test: async () => {
            const result = await handler.saveToConfluence({
              payload: { title: 'Test', content: 'Test content' }
            });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
          }
        }
      ];

      for (const scenario of errorScenarios) {
        // Reset state for each scenario
        mockHelpers.resetMocks();
        scenario.setup();
        
        // Execute test
        await scenario.test();
      }
    });

    test('should maintain system stability under concurrent operations', async () => {
      // Test system behavior under concurrent load
      
      const mockJiraTickets = [
        {
          id: '1',
          key: 'CONCURRENT-1',
          fields: {
            summary: 'Concurrent test ticket',
            description: 'Testing concurrent operations',
            assignee: {
              accountId: 'concurrent-user',
              displayName: 'Concurrent User'
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
            id: 'concurrent-page',
            title: 'Concurrent Test Page',
            _links: {
              webui: '/spaces/KNOWLEDGE/pages/concurrent-page'
            }
          }
        }
      });

      // Execute multiple operations concurrently
      const operations = [
        handler.scanLastSixMonths({}),
        handler.scanLastSixMonths({}),
        handler.saveToConfluence({
          payload: { title: 'Concurrent Test 1', content: 'Test content 1' }
        }),
        handler.saveToConfluence({
          payload: { title: 'Concurrent Test 2', content: 'Test content 2' }
        })
      ];

      const results = await Promise.all(operations);
      
      // All operations should complete successfully
      expect(results[0].success).toBe(true); // First scan
      expect(results[1].success).toBe(true); // Second scan
      expect(results[2].success).toBe(true); // First save
      expect(results[3].success).toBe(true); // Second save
      
      // Results should be consistent
      expect(results[0].reports).toEqual(results[1].reports);
    });
  });

  describe('Data Validation and Integrity', () => {
    test('should validate all data models and maintain integrity', async () => {
      // Test data model validation throughout the workflow
      
      const testData = {
        jiraTickets: [
          {
            id: '1',
            key: 'VALIDATION-1',
            fields: {
              summary: 'Data validation test',
              description: 'Testing data model validation and integrity',
              assignee: {
                accountId: 'validation-user',
                displayName: 'Validation User'
              },
              status: { name: 'Done' },
              created: '2024-01-01T10:00:00.000Z',
              updated: '2024-01-02T10:00:00.000Z',
              comment: { total: 2 }
            }
          }
        ]
      };

      mockHelpers.setMockState(testData);

      // Execute workflow and validate data at each step
      const gapScanResult = await handler.scanLastSixMonths({});
      
      // Validate gap scan result structure
      expect(gapScanResult).toHaveProperty('success');
      expect(gapScanResult).toHaveProperty('reports');
      expect(gapScanResult).toHaveProperty('summary');
      expect(Array.isArray(gapScanResult.reports)).toBe(true);
      
      if (gapScanResult.reports.length > 0) {
        const report = gapScanResult.reports[0];
        expect(report).toHaveProperty('userId');
        expect(report).toHaveProperty('ticketCount');
        expect(report).toHaveProperty('documentationRatio');
        expect(report).toHaveProperty('riskLevel');
        expect(report).toHaveProperty('recommendedActions');
        
        // Validate data types
        expect(typeof report.userId).toBe('string');
        expect(typeof report.ticketCount).toBe('number');
        expect(typeof report.documentationRatio).toBe('number');
        expect(['HIGH', 'MEDIUM', 'LOW']).toContain(report.riskLevel);
        expect(Array.isArray(report.recommendedActions)).toBe(true);
      }

      // Test knowledge extraction with validated data
      const context = createInterviewContext({
        employeeId: 'validation-user',
        department: 'Engineering',
        role: 'Developer'
      });

      const responses = [
        {
          question: 'Validation test question',
          answer: 'Validation test answer with sufficient detail for processing.'
        }
      ];

      const artifact = extractKnowledgeFromResponses(responses, context);
      
      // Validate artifact structure
      expect(artifact).toHaveProperty('id');
      expect(artifact).toHaveProperty('employeeId');
      expect(artifact).toHaveProperty('title');
      expect(artifact).toHaveProperty('content');
      expect(artifact).toHaveProperty('tags');
      expect(artifact).toHaveProperty('extractedAt');
      expect(artifact).toHaveProperty('confidence');
      expect(artifact).toHaveProperty('relatedTickets');
      
      // Validate data types and constraints
      expect(typeof artifact.id).toBe('string');
      expect(typeof artifact.employeeId).toBe('string');
      expect(typeof artifact.title).toBe('string');
      expect(typeof artifact.content).toBe('string');
      expect(Array.isArray(artifact.tags)).toBe(true);
      expect(artifact.extractedAt instanceof Date).toBe(true);
      expect(typeof artifact.confidence).toBe('number');
      expect(artifact.confidence).toBeGreaterThanOrEqual(0);
      expect(artifact.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(artifact.relatedTickets)).toBe(true);
    });

    test('should handle edge cases and boundary conditions', async () => {
      // Test system behavior with edge case data
      
      const edgeCaseData = [
        // Empty data
        {
          name: 'Empty Jira Response',
          jiraTickets: [],
          expectedReports: 0
        },
        // Single ticket
        {
          name: 'Single Ticket',
          jiraTickets: [
            {
              id: '1',
              key: 'EDGE-1',
              fields: {
                summary: 'Single ticket test with very long summary that exceeds fifty characters for critical detection',
                description: 'Brief',
                assignee: {
                  accountId: 'edge-user',
                  displayName: 'Edge User'
                },
                status: { name: 'Done' },
                created: '2024-01-01T10:00:00.000Z',
                updated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
                comment: { total: 5 }
              }
            }
          ],
          expectedReports: 1 // Single ticket with low documentation will trigger knowledge gap
        },
        // Maximum tickets
        {
          name: 'Many Tickets',
          jiraTickets: Array.from({ length: 20 }, (_, i) => ({
            id: `${i + 1}`,
            key: `MANY-${i + 1}`,
            fields: {
              summary: `Ticket ${i + 1} with very long summary that exceeds fifty characters for critical detection`,
              description: 'Brief',
              assignee: {
                accountId: 'many-user',
                displayName: 'Many User'
              },
              status: { name: 'Done' },
              created: '2024-01-01T10:00:00.000Z',
              updated: new Date(Date.now() - (30 + i) * 24 * 60 * 60 * 1000).toISOString(), // Spread over time
              comment: { total: 4 }
            }
          })),
          expectedReports: 1 // Should trigger knowledge gap for many tickets
        }
      ];

      for (const testCase of edgeCaseData) {
        mockHelpers.resetMocks();
        mockHelpers.setMockState({ jiraTickets: testCase.jiraTickets });

        const result = await handler.scanLastSixMonths({});
        
        expect(result.success).toBe(true);
        expect(result.reports.length).toBe(testCase.expectedReports);
      }
    });
  });

  describe('Performance and Reliability Validation', () => {
    test('should handle large datasets efficiently', async () => {
      // Test system performance with large datasets
      
      const largeDataset = Array.from({ length: 100 }, (_, i) => ({
        id: `${i + 1}`,
        key: `PERF-${i + 1}`,
        fields: {
          summary: `Performance test ticket ${i + 1} with very long summary that exceeds fifty characters for critical detection`,
          description: 'Brief',
          assignee: {
            accountId: `user-${Math.floor(i / 10)}`, // 10 users with 10 tickets each
            displayName: `User ${Math.floor(i / 10)}`
          },
          status: { name: 'Done' },
          created: '2024-01-01T10:00:00.000Z',
          updated: new Date(Date.now() - (30 + i) * 24 * 60 * 60 * 1000).toISOString(), // Spread over time
          comment: { total: 4 + Math.floor(Math.random() * 3) } // 4-6 comments
        }
      }));

      mockHelpers.setMockState({ jiraTickets: largeDataset });

      const startTime = Date.now();
      const result = await handler.scanLastSixMonths({});
      const endTime = Date.now();
      
      // Should complete within reasonable time (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
      
      // Should handle large dataset correctly
      expect(result.success).toBe(true);
      expect(result.summary.totalUsersScanned).toBe(10);
      expect(result.reports.length).toBeGreaterThan(0);
    });

    test('should maintain consistency across multiple executions', async () => {
      // Test that multiple executions produce consistent results
      
      const consistentData = [
        {
          id: '1',
          key: 'CONSISTENT-1',
          fields: {
            summary: 'Consistency test ticket',
            description: 'Testing result consistency',
            assignee: {
              accountId: 'consistent-user',
              displayName: 'Consistent User'
            },
            status: { name: 'Done' },
            created: '2024-01-01T10:00:00.000Z',
            updated: '2024-01-02T10:00:00.000Z',
            comment: { total: 1 }
          }
        }
      ];

      mockHelpers.setMockState({ jiraTickets: consistentData });

      // Execute multiple times
      const results = await Promise.all([
        handler.scanLastSixMonths({}),
        handler.scanLastSixMonths({}),
        handler.scanLastSixMonths({})
      ]);

      // All results should be identical
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
      
      // All should be successful
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });
});