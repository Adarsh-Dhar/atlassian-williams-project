const fc = require('fast-check');
const { mockHelpers } = require('../__mocks__/@forge/api');
const bitbucketService = require('../services/bitbucketService');
const { BitbucketPR, Commit, DiffContext, ChangedFile } = require('../models');

describe('Bitbucket Service', () => {
  beforeEach(() => {
    mockHelpers.resetMocks();
  });

  describe('Unit Tests', () => {
    describe('getPullRequestsLastSixMonths', () => {
      it('should fetch pull requests for a valid user', async () => {
        const userId = 'user123';
        const result = await bitbucketService.getPullRequestsLastSixMonths(userId);
        
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        
        // Verify first PR structure
        const firstPR = result[0];
        expect(firstPR).toHaveProperty('id');
        expect(firstPR).toHaveProperty('title');
        expect(firstPR).toHaveProperty('author');
        expect(firstPR).toHaveProperty('created');
        expect(firstPR).toHaveProperty('complexityScore');
        
        // Verify API was called
        expect(mockHelpers.verifyApiCalled('bitbucket', '/pullrequests')).toBe(true);
      });

      it('should throw error for missing user ID', async () => {
        await expect(bitbucketService.getPullRequestsLastSixMonths()).rejects.toThrow('User ID is required');
      });

      it('should handle API errors gracefully', async () => {
        mockHelpers.simulateBitbucketError();
        
        await expect(bitbucketService.getPullRequestsLastSixMonths('user123')).rejects.toThrow('Failed to fetch pull requests');
      });

      it('should handle 403 permission errors', async () => {
        mockHelpers.simulateBitbucket403Error();
        
        await expect(bitbucketService.getPullRequestsLastSixMonths('user123')).rejects.toThrow('Insufficient permissions');
      });
    });

    describe('getCommitHistory', () => {
      it('should fetch commit history for a valid user', async () => {
        const userId = 'user123';
        const result = await bitbucketService.getCommitHistory(userId);
        
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        
        // Verify first commit structure
        const firstCommit = result[0];
        expect(firstCommit).toHaveProperty('hash');
        expect(firstCommit).toHaveProperty('message');
        expect(firstCommit).toHaveProperty('author');
        expect(firstCommit).toHaveProperty('date');
        
        // Verify API was called
        expect(mockHelpers.verifyApiCalled('bitbucket', '/commits')).toBe(true);
      });

      it('should enforce 6-month timeframe constraint', async () => {
        const userId = 'user123';
        await bitbucketService.getCommitHistory(userId, '6_MONTHS');
        
        // Verify the API call includes date constraint
        const history = mockHelpers.getApiCallHistory();
        const bitbucketCalls = history.bitbucketCalls;
        const commitCall = bitbucketCalls.find(call => call[0].includes('/commits'));
        
        expect(commitCall).toBeDefined();
        expect(commitCall[1].params.q).toContain('date>=');
      });

      it('should reject invalid timeframes', async () => {
        await expect(bitbucketService.getCommitHistory('user123', 'INVALID')).rejects.toThrow('Only 6_MONTHS timeframe is supported');
      });
    });

    describe('analyzePRComplexity', () => {
      it('should analyze PR complexity and return score', async () => {
        const prId = '402';
        const result = await bitbucketService.analyzePRComplexity(prId);
        
        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(10);
        
        // Verify API was called for specific PR
        expect(mockHelpers.verifyApiCalled('bitbucket', `/pullrequests/${prId}`)).toBe(true);
      });

      it('should throw error for missing PR ID', async () => {
        await expect(bitbucketService.analyzePRComplexity()).rejects.toThrow('Pull Request ID is required');
      });
    });

    describe('getDiffContext', () => {
      it('should get diff context for a PR', async () => {
        const prId = '402';
        const result = await bitbucketService.getDiffContext(prId);
        
        expect(result).toHaveProperty('prId', prId);
        expect(result).toHaveProperty('changedFiles');
        expect(result).toHaveProperty('keyChanges');
        expect(Array.isArray(result.changedFiles)).toBe(true);
        expect(Array.isArray(result.keyChanges)).toBe(true);
        
        // Verify API calls for PR details and diff
        expect(mockHelpers.verifyApiCalled('bitbucket', `/pullrequests/${prId}/diff`)).toBe(true);
        expect(mockHelpers.verifyApiCalled('bitbucket', `/pullrequests/${prId}`)).toBe(true);
      });
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * **Feature: institutional-memory-archaeologist, Property 6: Bitbucket integration data consistency**
     * **Validates: Requirements 1.1**
     */
    describe('Property 6: Bitbucket integration data consistency', () => {
      it('should maintain data consistency when parsing Bitbucket API responses', async () => {
        // First test with a simple case to debug
        const recentDate = new Date();
        recentDate.setMonth(recentDate.getMonth() - 2); // 2 months ago, well within 6 months
        
        const simplePR = {
          id: 1,
          title: "test pr",
          author: { uuid: "test-user" },
          created_on: recentDate.toISOString(),
          updated_on: recentDate.toISOString(),
          diff_stats: { lines_added: 0, lines_removed: 0, files_changed: 0 },
          comment_count: 0,
          state: "OPEN",
          source: { repository: { name: "testrepo" } },
          destination: { branch: { name: "main" } }
        };
        
        mockHelpers.setBitbucketPRs([simplePR]);
        const result = await bitbucketService.getPullRequestsLastSixMonths('test-user');
        expect(result).toHaveLength(1);
        
        return fc.assert(fc.asyncProperty(
          // Generate arbitrary Bitbucket PR data
          fc.record({
            id: fc.integer({ min: 1, max: 9999 }),
            title: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', ' '), { minLength: 5, maxLength: 50 }),
            author: fc.record({ uuid: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 5, maxLength: 20 }) }),
            created_on: fc.date({ min: new Date('2024-01-01'), max: new Date() }).map(d => d.toISOString()),
            updated_on: fc.date({ min: new Date('2024-01-01'), max: new Date() }).map(d => d.toISOString()),
            diff_stats: fc.record({
              lines_added: fc.integer({ min: 0, max: 10000 }),
              lines_removed: fc.integer({ min: 0, max: 10000 }),
              files_changed: fc.integer({ min: 0, max: 100 })
            }),
            comment_count: fc.integer({ min: 0, max: 100 }),
            state: fc.constantFrom('OPEN', 'MERGED', 'DECLINED'),
            source: fc.record({
              repository: fc.record({ name: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '-'), { minLength: 3, maxLength: 20 }) })
            }),
            destination: fc.record({
              branch: fc.record({ name: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '-'), { minLength: 3, maxLength: 20 }) })
            })
          }),
          async (mockPRData) => {
            // Ensure the generated PR has the correct author UUID and recent date
            const testUserId = 'test-user';
            const recentDate = new Date();
            recentDate.setMonth(recentDate.getMonth() - 2); // 2 months ago, within 6 months
            
            const adjustedPRData = {
              ...mockPRData,
              author: { uuid: testUserId },
              created_on: recentDate.toISOString(),
              updated_on: recentDate.toISOString()
            };
            
            // Set up mock with adjusted data
            mockHelpers.setBitbucketPRs([adjustedPRData]);
            
            // Call the service
            const result = await bitbucketService.getPullRequestsLastSixMonths(testUserId);
            
            // Verify data consistency - all input data should be preserved in output
            expect(result).toHaveLength(1);
            const transformedPR = result[0];
            
            // Core data consistency checks
            expect(transformedPR.id).toBe(adjustedPRData.id.toString());
            expect(transformedPR.title).toBe(adjustedPRData.title);
            expect(transformedPR.author).toBe(adjustedPRData.author.uuid);
            expect(transformedPR.linesAdded).toBe(adjustedPRData.diff_stats.lines_added);
            expect(transformedPR.linesDeleted).toBe(adjustedPRData.diff_stats.lines_removed);
            expect(transformedPR.filesChanged).toBe(adjustedPRData.diff_stats.files_changed);
            expect(transformedPR.reviewComments).toBe(adjustedPRData.comment_count);
            expect(transformedPR.state).toBe(mockPRData.state);
            expect(transformedPR.sourceRepository).toBe(mockPRData.source.repository.name);
            expect(transformedPR.destinationBranch).toBe(mockPRData.destination.branch.name);
            
            // Date consistency
            expect(transformedPR.created).toEqual(new Date(adjustedPRData.created_on));
            
            // Complexity score should be a valid number
            expect(typeof transformedPR.complexityScore).toBe('number');
            expect(transformedPR.complexityScore).toBeGreaterThanOrEqual(0);
            expect(transformedPR.complexityScore).toBeLessThanOrEqual(10);
            
            // Validate the transformed PR using the model
            const prModel = new BitbucketPR(transformedPR);
            const validation = prModel.validate();
            if (!validation.isValid) {
              console.log('Validation failed:', validation.errors);
              console.log('Transformed PR:', transformedPR);
              console.log('Mock PR Data:', mockPRData);
            }
            expect(validation.isValid).toBe(true);
          }
        ), { numRuns: 100 });
      });

      it('should maintain commit data consistency when parsing Bitbucket commit responses', async () => {
        return fc.assert(fc.asyncProperty(
          // Generate arbitrary Bitbucket commit data
          fc.record({
            hash: fc.hexaString({ minLength: 8, maxLength: 40 }),
            message: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', ' '), { minLength: 5, maxLength: 50 }),
            author: fc.record({ raw: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 3, maxLength: 20 }) }),
            date: fc.date({ min: new Date('2024-01-01'), max: new Date() }).map(d => d.toISOString()),
            diff_stats: fc.record({
              lines_added: fc.integer({ min: 0, max: 1000 }),
              lines_removed: fc.integer({ min: 0, max: 1000 }),
              files: fc.array(fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '/', '.'), { minLength: 3, maxLength: 20 }), { minLength: 0, maxLength: 10 })
            }),
            repository: fc.record({ name: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '-'), { minLength: 3, maxLength: 20 }) }),
            branch: fc.record({ name: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '-'), { minLength: 3, maxLength: 20 }) })
          }),
          async (mockCommitData) => {
            // Ensure the generated commit has the correct author and recent date
            const testUserId = 'test-user';
            const recentDate = new Date();
            recentDate.setMonth(recentDate.getMonth() - 2); // 2 months ago, within 6 months
            
            const adjustedCommitData = {
              ...mockCommitData,
              author: { raw: `${testUserId} <${testUserId}@company.com>` },
              date: recentDate.toISOString()
            };
            
            // Set up mock with adjusted data
            mockHelpers.setBitbucketCommits([adjustedCommitData]);
            
            // Call the service
            const result = await bitbucketService.getCommitHistory(testUserId);
            
            // Verify data consistency
            expect(result).toHaveLength(1);
            const transformedCommit = result[0];
            
            // Core data consistency checks
            expect(transformedCommit.hash).toBe(adjustedCommitData.hash);
            expect(transformedCommit.message).toBe(adjustedCommitData.message);
            expect(transformedCommit.author).toBe(adjustedCommitData.author.raw);
            expect(transformedCommit.date).toEqual(new Date(adjustedCommitData.date));
            expect(transformedCommit.filesChanged).toEqual(adjustedCommitData.diff_stats.files);
            expect(transformedCommit.linesChanged).toBe(
              adjustedCommitData.diff_stats.lines_added + adjustedCommitData.diff_stats.lines_removed
            );
            expect(transformedCommit.repository).toBe(adjustedCommitData.repository.name);
            expect(transformedCommit.branch).toBe(adjustedCommitData.branch.name);
            
            // Validate the transformed commit using the model
            const commitModel = new Commit(transformedCommit);
            const validation = commitModel.validate();
            expect(validation.isValid).toBe(true);
          }
        ), { numRuns: 100 });
      });

      it('should maintain diff context data consistency', () => {
        fc.assert(fc.property(
          fc.record({
            prId: fc.integer({ min: 1, max: 9999 }).map(n => n.toString()),
            changedFiles: fc.array(
              fc.record({
                path: fc.string({ minLength: 1, maxLength: 100 }),
                linesAdded: fc.integer({ min: 0, max: 1000 }),
                linesDeleted: fc.integer({ min: 0, max: 1000 }),
                changeType: fc.constantFrom('ADDED', 'MODIFIED', 'DELETED')
              }),
              { minLength: 0, maxLength: 20 }
            ),
            keyChanges: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 10 }),
            totalLinesAdded: fc.integer({ min: 0, max: 10000 }),
            totalLinesDeleted: fc.integer({ min: 0, max: 10000 }),
            totalFilesChanged: fc.integer({ min: 0, max: 100 })
          }),
          (mockDiffData) => {
            // Create DiffContext model with generated data
            const diffContext = new DiffContext(mockDiffData);
            
            // Validate data consistency
            const validation = diffContext.validate();
            expect(validation.isValid).toBe(true);
            
            // Verify all properties are preserved
            expect(diffContext.prId).toBe(mockDiffData.prId);
            expect(diffContext.changedFiles).toEqual(mockDiffData.changedFiles);
            expect(diffContext.keyChanges).toEqual(mockDiffData.keyChanges);
            expect(diffContext.totalLinesAdded).toBe(mockDiffData.totalLinesAdded);
            expect(diffContext.totalLinesDeleted).toBe(mockDiffData.totalLinesDeleted);
            expect(diffContext.totalFilesChanged).toBe(mockDiffData.totalFilesChanged);
            
            // Validate each changed file
            diffContext.changedFiles.forEach(file => {
              const changedFile = new ChangedFile(file);
              const fileValidation = changedFile.validate();
              expect(fileValidation.isValid).toBe(true);
            });
          }
        ), { numRuns: 100 });
      });

      it('should handle empty or minimal data consistently', async () => {
        return fc.assert(fc.asyncProperty(
          fc.record({
            id: fc.integer({ min: 1, max: 9999 }),
            title: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', ' '), { minLength: 3, maxLength: 10 }),
            author: fc.record({ uuid: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 3, maxLength: 10 }) }),
            created_on: fc.date({ min: new Date('2024-01-01'), max: new Date() }).map(d => d.toISOString()),
            updated_on: fc.date({ min: new Date('2024-01-01'), max: new Date() }).map(d => d.toISOString()),
            // Minimal or missing diff_stats
            diff_stats: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.record({
                lines_added: fc.constant(0),
                lines_removed: fc.constant(0),
                files_changed: fc.constant(0)
              })
            ),
            comment_count: fc.oneof(fc.constant(0), fc.constant(null), fc.constant(undefined)),
            state: fc.constantFrom('OPEN', 'MERGED'),
            source: fc.oneof(
              fc.constant(null),
              fc.record({ repository: fc.record({ name: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '-'), { minLength: 3, maxLength: 10 }) }) })
            ),
            destination: fc.oneof(
              fc.constant(null),
              fc.record({ branch: fc.record({ name: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '-'), { minLength: 3, maxLength: 10 }) }) })
            )
          }),
          async (mockPRData) => {
            // Set up mock with minimal data
            mockHelpers.setBitbucketPRs([mockPRData]);
            
            // Call the service
            const result = await bitbucketService.getPullRequestsLastSixMonths('test-user');
            
            // Should handle minimal data gracefully
            expect(result).toHaveLength(1);
            const transformedPR = result[0];
            
            // Should have default values for missing data
            expect(transformedPR.linesAdded).toBeGreaterThanOrEqual(0);
            expect(transformedPR.linesDeleted).toBeGreaterThanOrEqual(0);
            expect(transformedPR.filesChanged).toBeGreaterThanOrEqual(0);
            expect(transformedPR.reviewComments).toBeGreaterThanOrEqual(0);
            
            // Should still be valid
            const prModel = new BitbucketPR(transformedPR);
            const validation = prModel.validate();
            expect(validation.isValid).toBe(true);
          }
        ), { numRuns: 50 });
      });
    });
  });
});