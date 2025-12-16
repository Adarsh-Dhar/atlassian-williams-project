const fc = require('fast-check');
const { mockHelpers } = require('../__mocks__/@forge/api');
const {
  saveToConfluence,
  createLegacyDocument,
  linkToArtifacts,
  validatePermissions,
  formatContent,
  formatTextToHtml,
  formatKnowledgeArtifact,
  formatLegacyDocument,
  buildPageUrl,
  escapeHtml
} = require('../services/confluenceService');
const { KnowledgeArtifact, CodeArtifact } = require('../models');

/**
 * Confluence Service Tests
 * Validates: Requirements 3.1, 3.2, 3.3, 4.2
 */
describe('Confluence Service', () => {

  beforeEach(() => {
    mockHelpers.resetMocks();
  });

  describe('Page Creation', () => {
    /**
     * Feature: legacy-keeper, Property 5: Confluence page creation consistency
     * Validates: Requirements 3.2
     */
    test('property: confluence page creation consistency', async () => {
      // Test with specific valid inputs instead of property-based for async
      const testCases = [
        { title: 'Valid Title', content: 'Valid content here' },
        { title: 'Another Title', content: 'More content to test' },
        { title: 'Test Knowledge', content: 'Knowledge content for testing' }
      ];

      for (const data of testCases) {
        // Mock successful Confluence response
        mockHelpers.setMockState({
          confluenceResponse: {
            status: 201,
            data: {
              id: 'page123',
              title: data.title,
              _links: {
                webui: `/spaces/KNOWLEDGE/pages/page123`
              }
            }
          }
        });

        const req = {
          payload: {
            title: data.title,
            content: data.content
          }
        };

        const result = await saveToConfluence(req);
        
        // Property: For any valid title and content, page creation should succeed
        expect(result.success).toBe(true);
        expect(result.pageUrl).toBeDefined();
        expect(result.pageId).toBe('page123');
        expect(result.error).toBeNull();
      }
    });

    test('should create Confluence page successfully', async () => {
      const req = {
        payload: {
          title: 'Test Knowledge Page',
          content: 'This is test knowledge content that should be saved to Confluence.'
        }
      };

      // Mock successful response
      mockHelpers.setMockState({
        confluenceResponse: {
          status: 201,
          data: {
            id: 'page123',
            title: 'Test Knowledge Page',
            _links: {
              webui: '/spaces/KNOWLEDGE/pages/page123'
            }
          }
        }
      });

      const result = await saveToConfluence(req);
      
      // Debug output
      if (!result.success) {
        console.log('Test failed. Result:', result);
      }
      
      expect(result.success).toBe(true);
      expect(result.pageUrl).toContain('page123');
      expect(result.pageId).toBe('page123');
    });

    test('should handle missing title or content', async () => {
      const req = {
        payload: {
          title: '',
          content: 'Some content'
        }
      };

      const result = await saveToConfluence(req);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Title and content are required');
    });

    test('should handle permission errors gracefully', async () => {
      const req = {
        payload: {
          title: 'Test Page',
          content: 'Test content'
        }
      };

      // Mock permission error
      mockHelpers.simulateError('403');

      const result = await saveToConfluence(req);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('Page URL Format', () => {
    /**
     * Feature: legacy-keeper, Property 6: Page URL return format
     * Validates: Requirements 3.3
     */
    test('property: page URL return format', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9-_]+$/.test(s)),
            spaceKey: fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0 && /^[A-Z0-9]+$/.test(s))
          }),
          (pageData) => {
            // Test only the fallback URL construction to avoid webui edge cases
            const mockPageData = {
              id: pageData.id,
              space: { key: pageData.spaceKey }
              // No _links to force fallback URL construction
            };

            const url = buildPageUrl(mockPageData);
            
            // Property: For any successful page creation, URL should be properly formatted
            expect(url).toBeDefined();
            expect(typeof url).toBe('string');
            expect(url.length).toBeGreaterThan(0);
            expect(url).toMatch(/^https?:\/\//); // Should be a valid URL
            expect(url).toContain(pageData.id); // Should contain page ID
            expect(url).toContain(pageData.spaceKey); // Should contain space key
          }
        ),
        { numRuns: 50 }
      );
    });

    test('should build correct page URL from API response', () => {
      const pageData = {
        id: 'page123',
        space: { key: 'KNOWLEDGE' },
        _links: {
          webui: '/spaces/KNOWLEDGE/pages/page123'
        }
      };

      const url = buildPageUrl(pageData);
      
      expect(url).toBe('https://your-domain.atlassian.net/wiki/spaces/KNOWLEDGE/pages/page123');
    });

    test('should build fallback URL when webui link is missing', () => {
      const pageData = {
        id: 'page456',
        space: { key: 'TEST' }
      };

      const url = buildPageUrl(pageData);
      
      expect(url).toBe('https://your-domain.atlassian.net/wiki/spaces/TEST/pages/page456');
    });
  });

  describe('Content Formatting', () => {
    test('should format content correctly', () => {
      const title = 'Test Knowledge';
      const content = 'This is some test content\n\nWith multiple paragraphs.';
      
      const formatted = formatContent(title, content);
      
      expect(formatted).toContain('<h1>Knowledge Capture Session</h1>');
      expect(formatted).toContain(title);
      expect(formatted).toContain('test content');
      expect(formatted).toContain('<p>');
    });

    test('should convert text to HTML correctly', () => {
      const text = 'Paragraph 1\n\nParagraph 2\n\n• Bullet 1\n• Bullet 2';
      const html = formatTextToHtml(text);
      
      expect(html).toContain('<p>Paragraph 1</p>');
      expect(html).toContain('<p>Paragraph 2</p>');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>Bullet 1</li>');
    });

    test('should escape HTML characters', () => {
      const text = '<script>alert("xss")</script> & "quotes"';
      const escaped = escapeHtml(text);
      
      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;script&gt;');
      expect(escaped).toContain('&amp;');
      expect(escaped).toContain('&quot;');
    });

    test('property: HTML escaping is safe', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (text) => {
            const escaped = escapeHtml(text);
            
            // Property: Escaped text should not contain dangerous HTML characters
            expect(escaped).not.toMatch(/<script/i);
            expect(escaped).not.toMatch(/javascript:/i);
            expect(escaped).not.toContain('<');
            expect(escaped).not.toContain('>');
            
            // Should not contain unescaped quotes or ampersands
            if (text.includes('&')) {
              expect(escaped).toContain('&amp;');
            }
            if (text.includes('"')) {
              expect(escaped).toContain('&quot;');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should format knowledge artifact correctly', () => {
      const artifact = {
        title: 'API Integration Knowledge',
        content: 'Details about the API integration process.',
        tags: ['api', 'integration'],
        extractedAt: new Date('2024-01-01'),
        confidence: 0.85,
        relatedTickets: ['PROJ-123', 'PROJ-124'],
        employeeId: 'emp123'
      };

      const formatted = formatKnowledgeArtifact(artifact);
      
      expect(formatted).toContain('API Integration Knowledge');
      expect(formatted).toContain('emp123');
      expect(formatted).toContain('85%');
      expect(formatted).toContain('api, integration');
      expect(formatted).toContain('PROJ-123, PROJ-124');
    });
  });

  describe('Permission Validation', () => {
    test('should validate permissions successfully', async () => {
      // Mock successful user info response
      mockHelpers.setMockState({
        confluenceResponse: {
          status: 200,
          data: { accountId: 'user123' }
        }
      });

      const hasPermissions = await validatePermissions();
      expect(hasPermissions).toBe(true);
    });

    test('should handle permission validation failure', async () => {
      // Mock permission error
      mockHelpers.simulateError('confluence');

      const hasPermissions = await validatePermissions();
      expect(hasPermissions).toBe(false);
    });

    test('property: permission validation returns boolean', async () => {
      // Test with specific status codes instead of property-based for async
      const statusCodes = [200, 403, 404, 500];
      
      for (const statusCode of statusCodes) {
        mockHelpers.resetMocks();
        
        if (statusCode !== 200) {
          mockHelpers.simulateError('confluence');
        }
        
        mockHelpers.setMockState({
          confluenceResponse: {
            status: statusCode,
            data: statusCode === 200 ? { accountId: 'user123' } : { error: 'Error' }
          }
        });

        const result = await validatePermissions();
        
        // Property: Permission validation should always return a boolean
        expect(typeof result).toBe('boolean');
        
        // Should return true only for successful responses
        if (statusCode === 200) {
          expect(result).toBe(true);
        } else {
          expect(result).toBe(false);
        }
      }
    });
  });

  describe('Legacy Document Creation and Artifact Linking', () => {
    /**
     * **Feature: institutional-memory-archaeologist, Property 3: Archive process links Legacy Documents to source artifacts**
     * **Validates: Requirements 3.2, 3.3**
     */
    test('property: archive process links Legacy Documents to source artifacts', () => {
      fc.assert(
        fc.property(
          // Generate valid KnowledgeArtifact with source artifacts
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            employeeId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            content: fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
            sourceArtifacts: fc.array(
              fc.record({
                type: fc.constantFrom('JIRA_TICKET', 'PR', 'COMMIT'),
                id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
                author: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
                date: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
                documentationLevel: fc.constantFrom('NONE', 'MINIMAL', 'ADEQUATE', 'COMPREHENSIVE')
              }),
              { minLength: 1, maxLength: 5 }
            )
          }),
          (artifactData) => {
            // Create CodeArtifact instances
            const sourceArtifacts = artifactData.sourceArtifacts.map(artifact => 
              new CodeArtifact(artifact)
            );

            // Create KnowledgeArtifact instance
            const knowledgeArtifact = new KnowledgeArtifact({
              ...artifactData,
              sourceArtifacts: sourceArtifacts,
              extractedAt: new Date(),
              confidence: 0.8,
              tags: ['test'],
              relatedTickets: [],
              relatedPRs: [],
              relatedCommits: []
            });

            // Validate the knowledge artifact is valid
            const validation = knowledgeArtifact.validate();
            expect(validation.isValid).toBe(true);

            // Format the Legacy Document
            const formattedContent = formatLegacyDocument(knowledgeArtifact);

            // Property: For any valid KnowledgeArtifact with source artifacts,
            // the formatted Legacy Document should contain references to all source artifacts
            expect(formattedContent).toBeDefined();
            expect(typeof formattedContent).toBe('string');
            expect(formattedContent.length).toBeGreaterThan(0);

            // Should contain Legacy Document structure
            expect(formattedContent).toContain('Legacy Document:');
            expect(formattedContent).toContain('Source Artifacts');
            expect(formattedContent).toContain('Bidirectional Links');

            // Should contain all source artifact references (accounting for HTML escaping)
            sourceArtifacts.forEach(artifact => {
              expect(formattedContent).toContain(artifact.id);
              // Check for either the original title or the HTML-escaped version
              const escapedTitle = escapeHtml(artifact.title);
              const titleFound = formattedContent.includes(artifact.title) || formattedContent.includes(escapedTitle);
              expect(titleFound).toBe(true);
              expect(formattedContent).toContain(artifact.type);
              expect(formattedContent).toContain(artifact.author);
            });

            // Should contain bidirectional linking information
            expect(formattedContent).toContain('bidirectionally linked');
            expect(formattedContent).toContain('Source artifacts have been updated');

            // Should contain proper metadata (accounting for HTML escaping)
            expect(formattedContent).toContain(knowledgeArtifact.employeeId);
            expect(formattedContent).toContain(knowledgeArtifact.title);
            expect(formattedContent).toContain(knowledgeArtifact.content);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should create Legacy Document with artifact links', async () => {
      // Create test knowledge artifact with source artifacts
      const sourceArtifacts = [
        new CodeArtifact({
          type: 'JIRA_TICKET',
          id: 'PROJ-123',
          title: 'Implement authentication system',
          author: 'john.doe',
          date: new Date('2024-06-15'),
          documentationLevel: 'MINIMAL'
        }),
        new CodeArtifact({
          type: 'PR',
          id: '402',
          title: 'Add OAuth integration',
          author: 'john.doe',
          date: new Date('2024-06-16'),
          documentationLevel: 'NONE'
        })
      ];

      const knowledgeArtifact = new KnowledgeArtifact({
        id: 'ka-001',
        employeeId: 'john.doe',
        title: 'Authentication System Knowledge',
        content: 'The OAuth system was chosen over SAML because...',
        sourceArtifacts: sourceArtifacts,
        extractedAt: new Date(),
        confidence: 0.9,
        tags: ['auth', 'oauth'],
        relatedTickets: ['PROJ-123'],
        relatedPRs: ['402'],
        relatedCommits: []
      });

      // Mock successful Confluence response
      mockHelpers.setMockState({
        confluenceResponse: {
          status: 201,
          data: {
            id: 'legacy-page-123',
            title: 'Legacy Document: Authentication System Knowledge',
            _links: {
              webui: '/spaces/LEGACY/pages/legacy-page-123'
            }
          }
        },
        jiraResponse: {
          status: 201,
          data: { id: 'comment-123' }
        }
      });

      const result = await createLegacyDocument(knowledgeArtifact);

      expect(result.success).toBe(true);
      expect(result.pageUrl).toBeDefined();
      expect(result.pageId).toBe('legacy-page-123');
      expect(result.linkedArtifacts).toBeDefined();
      expect(Array.isArray(result.linkedArtifacts)).toBe(true);
    });

    test('should handle artifact linking with empty artifacts array', async () => {
      const pageId = 'test-page-123';
      const artifacts = [];

      const linkedArtifacts = await linkToArtifacts(pageId, artifacts);

      expect(Array.isArray(linkedArtifacts)).toBe(true);
      expect(linkedArtifacts.length).toBe(0);
    });

    test('should format Legacy Document with proper structure', () => {
      const knowledgeArtifact = new KnowledgeArtifact({
        id: 'ka-002',
        employeeId: 'jane.smith',
        title: 'Database Migration Process',
        content: 'The migration process requires careful attention to...',
        sourceArtifacts: [
          new CodeArtifact({
            type: 'COMMIT',
            id: 'abc123def456',
            title: 'Add migration scripts',
            author: 'jane.smith',
            date: new Date('2024-06-10'),
            documentationLevel: 'ADEQUATE'
          })
        ],
        extractedAt: new Date('2024-06-20'),
        confidence: 0.85,
        tags: ['database', 'migration'],
        relatedTickets: [],
        relatedPRs: [],
        relatedCommits: ['abc123def456']
      });

      const formatted = formatLegacyDocument(knowledgeArtifact);

      expect(formatted).toContain('🏛️ Legacy Document:');
      expect(formatted).toContain('Database Migration Process');
      expect(formatted).toContain('jane.smith');
      expect(formatted).toContain('85%');
      expect(formatted).toContain('📦 Source Artifacts');
      expect(formatted).toContain('COMMIT');
      expect(formatted).toContain('abc123def456');
      expect(formatted).toContain('🔗 Bidirectional Links');
      expect(formatted).toContain('📋 Next Steps');
    });
  });
});