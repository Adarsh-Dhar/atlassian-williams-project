# Legacy Keeper Implementation Plan

- [x] 1. Refactor existing codebase to Legacy Keeper branding
  - Update all references from "Memory Archaeologist" to "Legacy Keeper" in code files
  - Update agent prompts to forensic, artifact-specific questioning style
  - Rename MemoryArchaeologistAgent to LegacyKeeperAgent in all files
  - Update Background Scanner to Legacy Detector with 6-month constraint
  - _Requirements: 2.1, 2.2_

- [x] 1.1 Write property test for Legacy Keeper agent artifact-specific questions
  - **Property 2: Agent generates artifact-specific questions**
  - **Validates: Requirements 2.2**

- [x] 2. Implement Bitbucket integration service
  - Create BitbucketService class with API integration methods
  - Implement getPullRequestsLastSixMonths function with 6-month constraint
  - Add getCommitHistory function for developer activity analysis
  - Create analyzePRComplexity function to calculate complexity scores
  - Implement getDiffContext function for code change analysis
  - _Requirements: 1.1, 1.2_

- [x] 2.1 Write property test for Bitbucket integration data consistency
  - **Property 6: Bitbucket integration data consistency**
  - **Validates: Requirements 1.1**

- [x] 3. Implement enhanced data models for Legacy Keeper
  - Create BitbucketPR, Commit, DiffContext, and ChangedFile interfaces
  - Update KnowledgeArtifact to include relatedPRs and relatedCommits fields
  - Enhance InterviewContext with recentPullRequests and commitHistory
  - Add CodeArtifact and DeveloperActivity models for comprehensive tracking
  - Create UndocumentedIntensityReport model for scan results
  - _Requirements: 1.1, 1.2, 1.4_

- [x] 4. Implement Undocumented Intensity algorithm in Legacy Detector
  - Replace existing knowledge gap logic with Undocumented Intensity calculation
  - Implement formula: (High Complexity PRs + Critical Jira Tickets) / (Documentation Links)
  - Add identifyHighComplexityPRs function using Bitbucket data
  - Create identifyCriticalTickets function for Jira analysis
  - Implement findDocumentationLinks function to count existing documentation
  - Enforce strict 6-month lookback constraint across all data sources
  - _Requirements: 1.1, 1.2_

- [x] 4.1 Write property test for six-month constraint enforcement
  - **Property 4: Six-month constraint enforcement**
  - **Validates: Requirements 1.1**

- [x] 4.2 Write property test for Undocumented Intensity calculation
  - **Property 5: Undocumented Intensity calculation accuracy**
  - **Validates: Requirements 1.2**

- [x] 4.3 Write property test for Legacy Detector identification
  - **Property 1: Legacy Detector identifies departing users with Undocumented Intensity**
  - **Validates: Requirements 1.1, 1.2**

- [x] 5. Update Legacy Keeper Agent with forensic questioning capabilities
  - Modify agent prompt to reference specific artifacts (PR IDs, commit hashes, Jira tickets)
  - Implement generateArtifactQuestions function for context-specific interviews
  - Update conductForensicInterview to use artifact-specific context
  - Add extractTacitKnowledge function focused on "why" behind code decisions
  - Enhance formatForArchival to include artifact references and bidirectional links
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 6. Enhance Confluence integration with artifact linking
  - Update saveToConfluence to support Legacy Document creation with artifact links
  - Implement createLegacyDocument function with enhanced formatting
  - Add linkToArtifacts function for bidirectional linking to PRs and Jira tickets
  - Update content formatting to include references to specific artifacts
  - Ensure Legacy Documents link back to original source artifacts
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 6.1 Write property test for archive process artifact linking
  - **Property 3: Archive process links Legacy Documents to source artifacts**
  - **Validates: Requirements 3.2, 3.3**

- [x] 7. Update comprehensive API mocking for Bitbucket integration
  - Extend __mocks__/@forge/api.js to include Bitbucket API responses
  - Create mock implementations for Bitbucket PR and commit data
  - Add mock scenarios for Bitbucket API errors and rate limiting
  - Update existing Jira and Confluence mocks to support new data models
  - Include mock data that supports 6-month constraint testing
  - _Requirements: 5.2, 5.3, 5.4_

- [x] 7.1 Write unit tests for enhanced API mocking
  - Test Bitbucket API mocks return expected PR and commit data
  - Test six-month constraint is properly enforced in mock data
  - Test error scenario mocks for all three APIs (Jira, Confluence, Bitbucket)
  - _Requirements: 5.2, 5.3, 5.4_

- [x] 8. Update manifest.yml for Bitbucket permissions
  - Add required Bitbucket API permissions to manifest
  - Update Rovo Agent configuration with new Legacy Keeper prompt
  - Ensure all existing permissions (Jira, Confluence) remain intact
  - Update function configurations to support new Bitbucket integration
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 9. Implement enhanced error handling for Bitbucket integration
  - Add try-catch blocks for Bitbucket API calls with specific error handling
  - Implement graceful handling for Bitbucket rate limiting and permission errors
  - Update error logging to include artifact-specific context
  - Add fallback mechanisms when Bitbucket data is unavailable
  - Enhance existing error handling for Jira and Confluence APIs
  - _Requirements: 3.4, 4.4, 4.5_

- [x] 9.1 Write property test for enhanced API error handling
  - **Property 7: Graceful error handling for API failures**
  - **Validates: Requirements 3.4, 4.4**

- [x] 9.2 Write property test for error logging consistency
  - **Property 8: Error logging consistency**
  - **Validates: Requirements 4.5**

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement cognitive offboarding workflow integration
  - Create end-to-end workflow: Trigger → Scan → Interview → Archive
  - Integrate Legacy Detector with Legacy Keeper Agent for seamless handoff
  - Implement workflow state management for offboarding sessions
  - Add progress tracking for cognitive offboarding completion
  - Create workflow validation to ensure all artifacts are properly captured
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 11.1 Write integration tests for cognitive offboarding workflow
  - Test complete Trigger → Scan → Interview → Archive flow
  - Test workflow handles missing or incomplete data gracefully
  - Test artifact references are maintained throughout the workflow
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 12. Final validation and testing
  - Validate all Legacy Keeper functionality works with real-world data patterns
  - Test Undocumented Intensity algorithm with various developer activity profiles
  - Verify artifact-specific questioning generates meaningful interviews
  - Confirm bidirectional linking between Legacy Documents and source artifacts
  - Validate 6-month constraint is enforced across all data sources
  - _Requirements: 1.1, 1.2, 2.2, 3.2, 3.3_

- [ ] 13. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.