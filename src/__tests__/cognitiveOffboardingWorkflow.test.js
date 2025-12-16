/**
 * Integration tests for Cognitive Offboarding Workflow
 * Tests complete Trigger → Scan → Interview → Archive flow
 */

const {
  WORKFLOW_STATES,
  WorkflowSession,
  triggerCognitiveOffboarding,
  executeScanPhase,
  executeInterviewPhase,
  executeArchivePhase,
  executeCompleteWorkflow,
  getWorkflowSession,
  getAllActiveSessions,
  validateWorkflowCompletion,
  convertScanResultsToArtifacts,
  formatInterviewContent,
  extractTagsFromWorkflow
} = require('../workflows/cognitiveOffboardingWorkflow');

const { 
  UndocumentedIntensityReport,
  KnowledgeArtifact,
  CodeArtifact,
  JiraTicket,
  BitbucketPR
} = require('../models');

// Mock dependencies
jest.mock('../scanners/legacyDetector');
jest.mock('../agents/legacyKeeper');
jest.mock('../services/confluenceService');
jest.mock('../utils/errorHandler');

const mockScanLastSixMonths = require('../scanners/legacyDetector').scanLastSixMonths;
const mockConductForensicInterview = require('../agents/legacyKeeper').conductForensicInterview;
const mockExtractTacitKnowledge = require('../agents/legacyKeeper').extractTacitKnowledge;
const mockCreateInterviewContext = require('../agents/legacyKeeper').createInterviewContext;
const mockGenerateSessionId = require('../agents/legacyKeeper').generateSessionId;
const mockCreateLegacyDocument = require('../services/confluenceService').createLegacyDocument;
const mockLogError = require('../utils/errorHandler').logError;

describe('Cognitive Offboarding Workflow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks with unique session IDs
    let sessionCounter = 0;
    mockGenerateSessionId.mockImplementation(() => `test-session-${++sessionCounter}`);
    mockLogError.mockImplementation(() => {});
    
    // Mock scan results
    mockScanLastSixMonths.mockResolvedValue({
      success: true,
      reports: [
        new UndocumentedIntensityReport({
          userId: 'user123',
          timeframe: '6_MONTHS',
          highComplexityPRs: [
            new BitbucketPR({
              id: '402',
              title: 'Refactor authentication system',
              author: 'user123',
              created: new Date('2024-06-15'),
              complexityScore: 8.5
            })
          ],
          criticalJiraTickets: [
            new JiraTicket({
              id: '10001',
              key: 'PROJ-123',
              summary: 'Implement OAuth integration',
              description: 'Complex auth changes',
              assignee: 'user123',
              status: 'Done',
              created: '2024-06-01',
              updated: '2024-06-20',
              commentCount: 5,
              documentationLinks: []
            })
          ],
          documentationLinks: ['https://wiki.example.com/auth'],
          undocumentedIntensityScore: 4.5,
          specificArtifacts: ['PR #402', 'PROJ-123'],
          riskLevel: 'HIGH'
        })
      ]
    });

    // Mock interview context creation
    mockCreateInterviewContext.mockImplementation((params) => ({
      employeeId: params.employeeId,
      department: params.department,
      role: params.role,
      identifiedGaps: params.identifiedGaps || [],
      sessionId: params.sessionId,
      recentPullRequests: [],
      commitHistory: [],
      undocumentedIntensityScore: 0,
      specificArtifacts: [],
      validate: () => ({ isValid: true, errors: [] })
    }));

    // Mock forensic interview
    mockConductForensicInterview.mockResolvedValue({
      success: true,
      session: {
        sessionId: 'test-session-123',
        employeeId: 'user123',
        startTime: new Date(),
        phase: 'forensic_extraction',
        artifactQuestions: [
          {
            question: 'Looking at PR #402, why did you choose this approach?',
            type: 'PR',
            artifactId: '402',
            focus: 'implementation_rationale'
          }
        ],
        contextualInfo: {
          undocumentedIntensityScore: 4.5,
          recentPRCount: 1,
          commitCount: 0,
          artifactCount: 2
        }
      }
    });

    // Mock tacit knowledge extraction
    mockExtractTacitKnowledge.mockReturnValue({
      sessionId: 'test-session-123',
      employeeId: 'user123',
      extractedAt: new Date(),
      categories: {
        architecturalDecisions: [
          {
            content: 'Chose OAuth over SAML for better mobile support',
            artifactId: '402',
            confidence: 0.9
          }
        ],
        businessConstraints: [],
        technicalDebt: [],
        processKnowledge: [],
        riskFactors: [],
        undocumentedDependencies: []
      },
      artifactMappings: {
        '402': ['OAuth implementation details']
      },
      confidenceScore: 0.85,
      criticalInsights: [
        {
          content: 'OAuth implementation has specific mobile constraints',
          artifactId: '402',
          reason: 'High confidence architectural decision'
        }
      ]
    });

    // Mock Confluence document creation
    mockCreateLegacyDocument.mockResolvedValue({
      success: true,
      pageUrl: 'https://company.atlassian.net/wiki/spaces/LEGACY/pages/123456',
      pageId: '123456',
      linkedArtifacts: ['PROJ-123', '402']
    });
  });

  describe('WorkflowSession', () => {
    test('should create valid workflow session', () => {
      const session = new WorkflowSession({
        sessionId: 'test-123',
        employeeId: 'user123',
        triggeredBy: 'hr-manager',
        state: WORKFLOW_STATES.TRIGGERED
      });

      expect(session.validate().isValid).toBe(true);
      expect(session.sessionId).toBe('test-123');
      expect(session.employeeId).toBe('user123');
      expect(session.state).toBe(WORKFLOW_STATES.TRIGGERED);
    });

    test('should calculate progress percentage correctly', () => {
      const session = new WorkflowSession({
        sessionId: 'test-123',
        employeeId: 'user123',
        triggeredBy: 'system',
        state: WORKFLOW_STATES.SCAN_COMPLETE
      });

      expect(session.getProgressPercentage()).toBe(40);
    });

    test('should update state and progress', () => {
      const session = new WorkflowSession({
        sessionId: 'test-123',
        employeeId: 'user123',
        triggeredBy: 'system',
        state: WORKFLOW_STATES.TRIGGERED
      });

      session.updateState(WORKFLOW_STATES.SCANNING, { scanStarted: new Date() });

      expect(session.state).toBe(WORKFLOW_STATES.SCANNING);
      expect(session.progress.scanStarted).toBeDefined();
      expect(session.progress.lastUpdated).toBeDefined();
    });
  });

  describe('Trigger Phase', () => {
    test('should trigger cognitive offboarding workflow successfully', async () => {
      const params = {
        employeeId: 'user123',
        triggeredBy: 'hr-manager',
        department: 'Engineering',
        role: 'Senior Developer'
      };

      const session = await triggerCognitiveOffboarding(params);

      expect(session).toBeInstanceOf(WorkflowSession);
      expect(session.employeeId).toBe('user123');
      expect(session.state).toBe(WORKFLOW_STATES.TRIGGERED);
      expect(session.progress.department).toBe('Engineering');
      expect(session.progress.role).toBe('Senior Developer');
    });

    test('should fail when employee ID is missing', async () => {
      const params = {
        triggeredBy: 'hr-manager'
      };

      await expect(triggerCognitiveOffboarding(params))
        .rejects.toThrow('Employee ID is required');
    });
  });

  describe('Scan Phase', () => {
    test('should execute scan phase successfully', async () => {
      // First trigger the workflow
      const session = await triggerCognitiveOffboarding({
        employeeId: 'user123',
        triggeredBy: 'system'
      });

      // Execute scan phase
      const scanResults = await executeScanPhase(session.sessionId);

      expect(mockScanLastSixMonths).toHaveBeenCalledWith({
        payload: {
          userId: 'user123',
          timeframe: '6_MONTHS'
        }
      });

      expect(scanResults).toBeInstanceOf(UndocumentedIntensityReport);
      expect(scanResults.userId).toBe('user123');
      expect(scanResults.undocumentedIntensityScore).toBe(4.5);
      expect(scanResults.riskLevel).toBe('HIGH');

      // Check session state
      const updatedSession = getWorkflowSession(session.sessionId);
      expect(updatedSession.state).toBe(WORKFLOW_STATES.SCAN_COMPLETE);
      expect(updatedSession.scanResults).toBe(scanResults);
    });

    test('should handle scan failure gracefully', async () => {
      mockScanLastSixMonths.mockResolvedValue({
        success: false,
        error: 'API connection failed'
      });

      const session = await triggerCognitiveOffboarding({
        employeeId: 'user123',
        triggeredBy: 'system'
      });

      await expect(executeScanPhase(session.sessionId))
        .rejects.toThrow('Scan failed: API connection failed');

      const updatedSession = getWorkflowSession(session.sessionId);
      expect(updatedSession.state).toBe(WORKFLOW_STATES.FAILED);
    });

    test('should create minimal report when no undocumented intensity found', async () => {
      mockScanLastSixMonths.mockResolvedValue({
        success: true,
        reports: [] // No reports for this user
      });

      const session = await triggerCognitiveOffboarding({
        employeeId: 'user123',
        triggeredBy: 'system'
      });

      const scanResults = await executeScanPhase(session.sessionId);

      expect(scanResults.userId).toBe('user123');
      expect(scanResults.undocumentedIntensityScore).toBe(0);
      expect(scanResults.riskLevel).toBe('LOW');
    });
  });

  describe('Interview Phase', () => {
    test('should execute interview phase successfully', async () => {
      // Setup workflow through scan phase
      const session = await triggerCognitiveOffboarding({
        employeeId: 'user123',
        triggeredBy: 'system',
        department: 'Engineering',
        role: 'Senior Developer'
      });
      await executeScanPhase(session.sessionId);

      // Execute interview phase
      const interviewResults = await executeInterviewPhase(session.sessionId);

      expect(mockCreateInterviewContext).toHaveBeenCalledWith({
        employeeId: 'user123',
        department: 'Engineering',
        role: 'Senior Developer',
        identifiedGaps: [],
        sessionId: session.sessionId
      });

      expect(mockConductForensicInterview).toHaveBeenCalled();

      expect(interviewResults.artifactsAnalyzed).toBe(2); // 1 PR + 1 Jira ticket
      expect(interviewResults.questionsGenerated).toBe(1);

      // Check session state
      const updatedSession = getWorkflowSession(session.sessionId);
      expect(updatedSession.state).toBe(WORKFLOW_STATES.INTERVIEW_COMPLETE);
    });

    test('should fail when scan phase not completed', async () => {
      const session = await triggerCognitiveOffboarding({
        employeeId: 'user123',
        triggeredBy: 'system'
      });

      await expect(executeInterviewPhase(session.sessionId))
        .rejects.toThrow('Scan phase must be completed before interview phase');
    });
  });

  describe('Archive Phase', () => {
    test('should execute archive phase successfully', async () => {
      // Setup workflow through interview phase
      const session = await triggerCognitiveOffboarding({
        employeeId: 'user123',
        triggeredBy: 'system',
        department: 'Engineering',
        role: 'Senior Developer'
      });
      await executeScanPhase(session.sessionId);
      await executeInterviewPhase(session.sessionId);

      // Mock interview responses
      const interviewResponses = [
        {
          question: 'Looking at PR #402, why did you choose this approach?',
          answer: 'I chose OAuth because it provides better mobile support and is more secure for our use case.',
          artifactId: '402'
        }
      ];

      // Execute archive phase
      const archiveResults = await executeArchivePhase(session.sessionId, interviewResponses);

      expect(mockExtractTacitKnowledge).toHaveBeenCalledWith(
        interviewResponses,
        expect.any(Object)
      );

      expect(mockCreateLegacyDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'user123',
          title: 'Cognitive Offboarding - Senior Developer'
        })
      );

      expect(archiveResults.confluenceResult.success).toBe(true);
      expect(archiveResults.confluenceResult.pageUrl).toContain('wiki/spaces/LEGACY');

      // Check session state
      const updatedSession = getWorkflowSession(session.sessionId);
      expect(updatedSession.state).toBe(WORKFLOW_STATES.ARCHIVED);
      expect(updatedSession.getProgressPercentage()).toBe(100);
    });

    test('should fail when interview phase not completed', async () => {
      const session = await triggerCognitiveOffboarding({
        employeeId: 'user123',
        triggeredBy: 'system'
      });
      await executeScanPhase(session.sessionId);

      await expect(executeArchivePhase(session.sessionId, []))
        .rejects.toThrow('Interview phase must be completed before archive phase');
    });
  });

  describe('Complete Workflow Integration', () => {
    test('should execute complete Trigger → Scan → Interview → Archive flow', async () => {
      const params = {
        employeeId: 'user123',
        triggeredBy: 'hr-manager',
        department: 'Engineering',
        role: 'Senior Developer'
      };

      const interviewResponses = [
        {
          question: 'Looking at PR #402, why did you choose OAuth over SAML?',
          answer: 'OAuth provides better mobile support and integrates more easily with our existing infrastructure.',
          artifactId: '402'
        },
        {
          question: 'What would break if someone modified the auth system without understanding your design?',
          answer: 'The mobile app authentication would fail because it relies on specific OAuth scopes that aren\'t documented.',
          artifactId: '402'
        }
      ];

      const completedSession = await executeCompleteWorkflow(params, interviewResponses);

      // Verify all phases were executed
      expect(completedSession.state).toBe(WORKFLOW_STATES.ARCHIVED);
      expect(completedSession.getProgressPercentage()).toBe(100);

      // Verify scan results
      expect(completedSession.scanResults).toBeDefined();
      expect(completedSession.scanResults.undocumentedIntensityScore).toBe(4.5);

      // Verify interview results
      expect(completedSession.interviewResults).toBeDefined();
      expect(completedSession.interviewResults.artifactsAnalyzed).toBe(2);

      // Verify archive results
      expect(completedSession.archiveResults).toBeDefined();
      expect(completedSession.archiveResults.confluenceResult.success).toBe(true);

      // Verify all API calls were made
      expect(mockScanLastSixMonths).toHaveBeenCalled();
      expect(mockConductForensicInterview).toHaveBeenCalled();
      expect(mockExtractTacitKnowledge).toHaveBeenCalled();
      expect(mockCreateLegacyDocument).toHaveBeenCalled();
    });

    test('should handle workflow failure at any phase', async () => {
      // Mock scan failure
      mockScanLastSixMonths.mockResolvedValue({
        success: false,
        error: 'Network timeout'
      });

      const params = {
        employeeId: 'user123',
        triggeredBy: 'system'
      };

      await expect(executeCompleteWorkflow(params))
        .rejects.toThrow('Scan failed: Network timeout');
    });
  });

  describe('Workflow State Management', () => {
    test('should track multiple active sessions', async () => {
      const session1 = await triggerCognitiveOffboarding({
        employeeId: 'user123',
        triggeredBy: 'hr-manager'
      });

      const session2 = await triggerCognitiveOffboarding({
        employeeId: 'user456',
        triggeredBy: 'team-lead'
      });

      const activeSessions = getAllActiveSessions();
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map(s => s.employeeId)).toContain('user123');
      expect(activeSessions.map(s => s.employeeId)).toContain('user456');
    });

    test('should retrieve specific workflow session', async () => {
      const session = await triggerCognitiveOffboarding({
        employeeId: 'user123',
        triggeredBy: 'system'
      });

      const retrievedSession = getWorkflowSession(session.sessionId);
      expect(retrievedSession).toBe(session);
      expect(retrievedSession.employeeId).toBe('user123');
    });

    test('should return null for non-existent session', () => {
      const session = getWorkflowSession('non-existent-session');
      expect(session).toBeNull();
    });
  });

  describe('Workflow Validation', () => {
    test('should validate complete workflow successfully', async () => {
      const session = await executeCompleteWorkflow({
        employeeId: 'user123',
        triggeredBy: 'system',
        department: 'Engineering',
        role: 'Senior Developer'
      }, [
        {
          question: 'Test question',
          answer: 'Test answer',
          artifactId: '402'
        }
      ]);

      const validation = validateWorkflowCompletion(session.sessionId);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.session).toBe(session);
    });

    test('should detect incomplete workflow', async () => {
      const session = await triggerCognitiveOffboarding({
        employeeId: 'user123',
        triggeredBy: 'system'
      });

      const validation = validateWorkflowCompletion(session.sessionId);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Workflow not completed. Current state: TRIGGERED');
      expect(validation.errors).toContain('Scan results missing');
    });

    test('should detect missing artifact references', async () => {
      const session = await triggerCognitiveOffboarding({
        employeeId: 'user123',
        triggeredBy: 'system'
      });
      
      // Manually set up incomplete session state
      session.state = WORKFLOW_STATES.ARCHIVED;
      session.scanResults = new UndocumentedIntensityReport({
        userId: 'user123',
        specificArtifacts: ['PR #402', 'PROJ-123'] // Has artifacts
      });
      session.interviewResults = { context: { specificArtifacts: [] } };
      session.archiveResults = {
        knowledgeArtifact: { sourceArtifacts: [] }, // Missing artifacts
        confluenceResult: { success: true }
      };

      const validation = validateWorkflowCompletion(session.sessionId);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Artifact references not maintained from scan to archive');
    });
  });

  describe('Utility Functions', () => {
    test('should convert scan results to code artifacts', () => {
      const scanResults = new UndocumentedIntensityReport({
        userId: 'user123',
        criticalJiraTickets: [
          new JiraTicket({
            id: '10001',
            key: 'PROJ-123',
            summary: 'Test ticket',
            assignee: 'user123',
            status: 'Done',
            created: '2024-06-01',
            updated: '2024-06-20'
          })
        ],
        highComplexityPRs: [
          new BitbucketPR({
            id: '402',
            title: 'Test PR',
            author: 'user123',
            created: new Date('2024-06-15'),
            complexityScore: 8.5
          })
        ]
      });

      const artifacts = convertScanResultsToArtifacts(scanResults);

      expect(artifacts).toHaveLength(2);
      expect(artifacts[0].type).toBe('JIRA_TICKET');
      expect(artifacts[0].id).toBe('PROJ-123');
      expect(artifacts[1].type).toBe('PR');
      expect(artifacts[1].id).toBe('402');
    });

    test('should format interview content correctly', () => {
      const responses = [
        {
          question: 'Why did you choose this approach?',
          answer: 'Because it provides better performance.',
          artifactId: 'PR-123'
        }
      ];

      const tacitKnowledge = {
        criticalInsights: [
          {
            reason: 'Performance optimization',
            content: 'This approach reduces latency by 50%'
          }
        ]
      };

      const content = formatInterviewContent(responses, tacitKnowledge);

      expect(content).toContain('# Cognitive Offboarding Interview Results');
      expect(content).toContain('Why did you choose this approach?');
      expect(content).toContain('Because it provides better performance.');
      expect(content).toContain('Related to artifact: PR-123');
      expect(content).toContain('Performance optimization');
    });

    test('should extract workflow tags correctly', () => {
      const session = new WorkflowSession({
        sessionId: 'test-123',
        employeeId: 'user123',
        triggeredBy: 'system',
        progress: {
          department: 'Engineering',
          role: 'Senior Developer'
        }
      });

      session.scanResults = {
        riskLevel: 'HIGH',
        undocumentedIntensityScore: 4.5,
        criticalJiraTickets: [{}],
        highComplexityPRs: [{}]
      };

      const tacitKnowledge = {
        categories: {
          architecturalDecisions: [{}],
          technicalDebt: []
        }
      };

      const tags = extractTagsFromWorkflow(session, tacitKnowledge);

      expect(tags).toContain('cognitive-offboarding');
      expect(tags).toContain('risk-high');
      expect(tags).toContain('intensity-5');
      expect(tags).toContain('dept-engineering');
      expect(tags).toContain('role-senior-developer');
      expect(tags).toContain('jira-tickets');
      expect(tags).toContain('complex-prs');
      expect(tags).toContain('knowledge-architecturaldecisions');
    });
  });

  describe('Error Handling and Missing Data', () => {
    test('should handle missing or incomplete scan data gracefully', async () => {
      mockScanLastSixMonths.mockResolvedValue({
        success: true,
        reports: [
          new UndocumentedIntensityReport({
            userId: 'user123',
            timeframe: '6_MONTHS',
            highComplexityPRs: [], // No PRs
            criticalJiraTickets: [], // No tickets
            documentationLinks: [],
            undocumentedIntensityScore: 0,
            specificArtifacts: [], // No artifacts
            riskLevel: 'LOW'
          })
        ]
      });

      const session = await executeCompleteWorkflow({
        employeeId: 'user123',
        triggeredBy: 'system'
      }, []);

      expect(session.state).toBe(WORKFLOW_STATES.ARCHIVED);
      expect(session.scanResults.undocumentedIntensityScore).toBe(0);
      expect(session.scanResults.riskLevel).toBe('LOW');
      
      // Should still complete workflow even with no artifacts
      expect(session.archiveResults).toBeDefined();
    });

    test('should handle empty interview responses', async () => {
      const session = await executeCompleteWorkflow({
        employeeId: 'user123',
        triggeredBy: 'system'
      }, []); // Empty responses

      expect(session.state).toBe(WORKFLOW_STATES.ARCHIVED);
      
      // Should still create knowledge artifact with automated analysis
      const content = session.archiveResults.knowledgeArtifact.content;
      expect(content).toContain('No interview responses captured');
      expect(content).toContain('automated analysis');
    });

    test('should maintain artifact references throughout workflow', async () => {
      const session = await executeCompleteWorkflow({
        employeeId: 'user123',
        triggeredBy: 'system'
      }, [
        {
          question: 'About PR #402?',
          answer: 'It was complex due to auth requirements.',
          artifactId: '402'
        }
      ]);

      // Verify artifacts are maintained from scan to archive
      expect(session.scanResults.specificArtifacts).toContain('PR #402');
      expect(session.scanResults.specificArtifacts).toContain('PROJ-123');
      
      expect(session.interviewResults.context.specificArtifacts).toHaveLength(2);
      
      expect(session.archiveResults.knowledgeArtifact.sourceArtifacts).toHaveLength(2);
      expect(session.archiveResults.knowledgeArtifact.relatedPRs).toContain('402');
      expect(session.archiveResults.knowledgeArtifact.relatedTickets).toContain('PROJ-123');
    });
  });
});