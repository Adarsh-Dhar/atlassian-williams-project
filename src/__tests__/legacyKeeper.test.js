const fc = require('fast-check');
const {
  AGENT_CONFIG,
  INTERVIEW_TEMPLATES,
  createInterviewContext,
  extractKnowledgeFromResponses,
  formatKnowledgeForStorage,
  getInterviewQuestions,
  generateArtifactQuestions,
  validateAgentConfiguration,
  generateSessionId,
  extractTagsFromContent,
  calculateResponseConfidence
} = require('../agents/legacyKeeper');

/**
 * Legacy Keeper Agent Tests
 * Validates: Requirements 2.1, 2.3, 3.1
 */
describe('Legacy Keeper Agent', () => {

  beforeEach(() => {
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods
    console.error.mockRestore?.();
    console.warn.mockRestore?.();
    console.info.mockRestore?.();
    console.log.mockRestore?.();
  });

  describe('Agent Configuration', () => {
    test('should have correct forensic interviewer prompt with artifact-specific questioning', () => {
      expect(AGENT_CONFIG.prompt).toContain('forensic technical interviewer');
      expect(AGENT_CONFIG.prompt).toContain('cognitive offboarding');
      expect(AGENT_CONFIG.prompt).toContain('concrete artifacts');
      expect(AGENT_CONFIG.prompt).toContain('PR IDs:');
      expect(AGENT_CONFIG.prompt).toContain('Commit hashes:');
      expect(AGENT_CONFIG.prompt).toContain('Jira tickets:');
      expect(AGENT_CONFIG.prompt).toContain('WHY');
    });

    test('should have proper agent identification', () => {
      expect(AGENT_CONFIG.key).toBe('legacy-keeper');
      expect(AGENT_CONFIG.name).toBe('Legacy Keeper');
      expect(AGENT_CONFIG.description).toBeDefined();
    });

    test('should validate agent configuration successfully', () => {
      const validation = validateAgentConfiguration();
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.config).toBe(AGENT_CONFIG);
    });

    test('should detect invalid agent configuration', () => {
      // Temporarily modify the config to test validation
      const originalPrompt = AGENT_CONFIG.prompt;
      AGENT_CONFIG.prompt = 'Invalid prompt without required terms';
      
      const validation = validateAgentConfiguration();
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors.some(error => 
        error.includes('forensic technical interviewer')
      )).toBe(true);
      
      // Restore original prompt
      AGENT_CONFIG.prompt = originalPrompt;
    });
  });

  describe('Interview Context Management', () => {
    test('should create interview context with required fields', () => {
      const params = {
        employeeId: 'emp123',
        department: 'Engineering',
        role: 'Senior Developer',
        identifiedGaps: [
          { ticketId: 'PROJ-123', ticketCount: 8 }
        ]
      };

      const context = createInterviewContext(params);
      
      expect(context.employeeId).toBe('emp123');
      expect(context.department).toBe('Engineering');
      expect(context.role).toBe('Senior Developer');
      expect(context.identifiedGaps).toHaveLength(1);
      expect(context.sessionId).toBeDefined();
      expect(context.sessionId).toMatch(/^session_/);
    });

    test('should generate unique session IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^session_/);
      expect(id2).toMatch(/^session_/);
    });

    test('should provide default values for missing context fields', () => {
      const context = createInterviewContext({ employeeId: 'emp123' });
      
      expect(context.employeeId).toBe('emp123');
      expect(context.department).toBe('Unknown');
      expect(context.role).toBe('Unknown');
      expect(context.identifiedGaps).toEqual([]);
      expect(context.sessionId).toBeDefined();
    });
  });

  describe('Interview Question Management', () => {
    test('should provide opening questions', () => {
      const context = createInterviewContext({ employeeId: 'emp123' });
      const questions = getInterviewQuestions(context, 'opening');
      
      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0]).toContain('Legacy Keeper');
      expect(questions.some(q => q.includes('knowledge'))).toBe(true);
    });

    test('should provide artifact-specific questions', () => {
      const context = {
        specificArtifacts: [
          { type: 'JIRA_TICKET', id: 'PROJ-123', title: 'Test ticket', author: 'user1', date: new Date() }
        ]
      };
      const questions = getInterviewQuestions(context, 'artifactQuestions');
      
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.some(q => q.includes('PR #') || q.includes('commit') || q.includes('Jira ticket'))).toBe(true);
      expect(questions.some(q => q.includes('PROJ-123'))).toBe(true);
    });

    test('should customize questions based on identified gaps', () => {
      const context = createInterviewContext({
        employeeId: 'emp123',
        identifiedGaps: [
          { ticketCount: 8, description: 'API integration work' }
        ]
      });

      const questions = getInterviewQuestions(context, 'opening');
      
      expect(questions.some(q => q.includes('8 tickets'))).toBe(true);
      expect(questions.some(q => q.includes('minimal documentation'))).toBe(true);
    });

    test('should have all interview template phases', () => {
      expect(INTERVIEW_TEMPLATES.opening).toBeDefined();
      expect(INTERVIEW_TEMPLATES.artifactQuestions).toBeDefined();
      expect(INTERVIEW_TEMPLATES.processQuestions).toBeDefined();
      expect(INTERVIEW_TEMPLATES.closingQuestions).toBeDefined();
      
      expect(INTERVIEW_TEMPLATES.opening.length).toBeGreaterThan(0);
      expect(INTERVIEW_TEMPLATES.artifactQuestions.length).toBeGreaterThan(0);
      expect(INTERVIEW_TEMPLATES.processQuestions.length).toBeGreaterThan(0);
      expect(INTERVIEW_TEMPLATES.closingQuestions.length).toBeGreaterThan(0);
    });

    /**
     * Feature: legacy-keeper, Property 2: Agent generates artifact-specific questions
     * Validates: Requirements 2.2
     */
    test('Property: Agent generates artifact-specific questions', () => {
      fc.assert(fc.property(
        fc.array(fc.record({
          type: fc.constantFrom('PR', 'COMMIT', 'JIRA_TICKET'),
          id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          title: fc.string({ minLength: 5, maxLength: 100 }),
          author: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          date: fc.date()
        }), { minLength: 1, maxLength: 10 }),
        (artifacts) => {
          const questionObjects = generateArtifactQuestions(artifacts);
          
          // Property: For any set of artifacts, generated questions should reference specific artifact IDs
          const hasSpecificReferences = questionObjects.some(questionObj => {
            const question = questionObj.question;
            return artifacts.some(artifact => {
              if (artifact.type === 'PR') {
                return question.includes(`PR #${artifact.id}`);
              } else if (artifact.type === 'COMMIT') {
                return question.includes(artifact.id.substring(0, 8));
              } else if (artifact.type === 'JIRA_TICKET') {
                return question.includes(artifact.id);
              }
              return false;
            });
          });
          
          // Property: Questions should be artifact-specific, not generic
          const isArtifactSpecific = questionObjects.length > 0 && hasSpecificReferences;
          
          // Property: Each artifact type should generate appropriate questions
          const prArtifacts = artifacts.filter(a => a.type === 'PR');
          const commitArtifacts = artifacts.filter(a => a.type === 'COMMIT');
          const jiraArtifacts = artifacts.filter(a => a.type === 'JIRA_TICKET');
          
          const questions = questionObjects.map(q => q.question);
          const prQuestionsExist = prArtifacts.length === 0 || questions.some(q => q.includes('PR #'));
          const commitQuestionsExist = commitArtifacts.length === 0 || questions.some(q => q.includes('commit'));
          const jiraQuestionsExist = jiraArtifacts.length === 0 || questions.some(q => q.includes('Jira ticket'));
          
          return isArtifactSpecific && prQuestionsExist && commitQuestionsExist && jiraQuestionsExist;
        }
      ), { numRuns: 100 });
    });
  });

  describe('Knowledge Extraction', () => {
    test('should extract knowledge from interview responses', () => {
      const responses = [
        {
          question: 'What undocumented processes do you use?',
          answer: 'I have a custom deployment script that handles database migrations automatically. It\'s not documented anywhere but saves hours of work.'
        },
        {
          question: 'What would be difficult for a replacement?',
          answer: 'Understanding the integration with the legacy BILLING system. There are specific API calls that need to happen in a particular order.'
        }
      ];

      const context = createInterviewContext({
        employeeId: 'emp123',
        role: 'Senior Developer'
      });

      const artifact = extractKnowledgeFromResponses(responses, context);
      
      expect(artifact.employeeId).toBe('emp123');
      expect(artifact.title).toContain('Senior Developer');
      expect(artifact.content).toContain('deployment script');
      expect(artifact.content).toContain('BILLING system');
      expect(artifact.tags.length).toBeGreaterThan(0);
      expect(artifact.confidence).toBeGreaterThan(0);
      expect(artifact.confidence).toBeLessThanOrEqual(1);
    });

    test('should extract relevant tags from content', () => {
      const content = `
        I work with the API integration and database migrations.
        The BILLING system requires special handling.
        Project PROJ-123 has deployment automation.
        We use "Jenkins" for CI/CD processes.
      `;

      const tags = extractTagsFromContent(content);
      
      expect(tags).toContain('api');
      expect(tags).toContain('database');
      expect(tags).toContain('deployment');
      expect(tags).toContain('project:PROJ-123');
      
      // For now, just check that we get some system tags
      const hasSystemTags = tags.some(tag => tag.startsWith('system:'));
      expect(hasSystemTags).toBe(true);
    });

    test('should calculate confidence based on response quality', () => {
      const detailedResponses = [
        {
          question: 'Test question',
          answer: 'This is a very detailed response with specific examples of how the process works. For example, when we deploy to production, we need to run the database migration script first because the new API endpoints depend on the updated schema.'
        }
      ];

      const briefResponses = [
        {
          question: 'Test question',
          answer: 'Not much to say.'
        }
      ];

      const detailedConfidence = calculateResponseConfidence(detailedResponses);
      const briefConfidence = calculateResponseConfidence(briefResponses);
      
      expect(detailedConfidence).toBeGreaterThan(briefConfidence);
      expect(detailedConfidence).toBeGreaterThan(0.3);
      expect(briefConfidence).toBeLessThan(0.2);
    });

    test('should handle empty responses gracefully', () => {
      const emptyResponses = [];
      const context = createInterviewContext({ employeeId: 'emp123' });
      
      expect(() => {
        extractKnowledgeFromResponses(emptyResponses, context);
      }).not.toThrow();
      
      const confidence = calculateResponseConfidence(emptyResponses);
      expect(confidence).toBe(0);
    });
  });

  describe('Knowledge Formatting', () => {
    test('should format knowledge for Confluence storage', () => {
      const artifact = {
        id: 'test-id',
        employeeId: 'emp123',
        title: 'Test Knowledge Session',
        content: 'Test knowledge content',
        tags: ['api', 'database'],
        extractedAt: new Date('2024-01-01'),
        confidence: 0.85,
        relatedTickets: ['PROJ-123', 'PROJ-124'],
        relatedPRs: ['PR-456'],
        relatedCommits: ['abc123def'],
        sourceArtifacts: []
      };

      const formatted = formatKnowledgeForStorage(artifact);
      
      expect(formatted.title).toContain('Legacy Document:');
      expect(formatted.content).toContain('emp123');
      expect(formatted.content).toContain('85%');
      expect(formatted.content).toContain('api, database');
      expect(formatted.content).toContain('PROJ-123, PROJ-124');
      expect(formatted.content).toContain('Legacy Document');
    });

    test('should handle artifacts with minimal data', () => {
      const minimalArtifact = {
        id: 'test-id',
        employeeId: 'emp123',
        title: 'Minimal Session',
        content: 'Brief content',
        tags: [],
        extractedAt: new Date(),
        confidence: 0.1,
        relatedTickets: [],
        relatedPRs: [],
        relatedCommits: [],
        sourceArtifacts: []
      };

      const formatted = formatKnowledgeForStorage(minimalArtifact);
      
      expect(formatted.title).toContain('Legacy Document:');
      expect(formatted.content).toContain('emp123');
      expect(formatted.content).toContain('10%');
      expect(formatted.content).toBeDefined();
    });
  });

  describe('Utility Functions', () => {
    test('should limit extracted tags to reasonable number', () => {
      const contentWithManyTerms = `
        api database integration deployment testing monitoring security performance 
        architecture documentation process workflow automation configuration 
        troubleshooting system network storage backup recovery scaling optimization
      `;

      const tags = extractTagsFromContent(contentWithManyTerms);
      
      expect(tags.length).toBeLessThanOrEqual(10);
      expect(tags).toContain('api');
      expect(tags).toContain('database');
    });

    test('should extract project references correctly', () => {
      const content = 'Working on PROJ-123, TASK-456, and BUG-789 tickets';
      const tags = extractTagsFromContent(content);
      
      expect(tags).toContain('project:PROJ-123');
      expect(tags).toContain('project:TASK-456');
      expect(tags).toContain('project:BUG-789');
    });

    test('should handle content without technical terms', () => {
      const content = 'This is just regular conversation without technical terms';
      const tags = extractTagsFromContent(content);
      
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThanOrEqual(0);
    });
  });
});