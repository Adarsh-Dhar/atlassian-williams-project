/**
 * Cognitive Offboarding Workflow Integration
 * Implements end-to-end workflow: Trigger → Scan → Interview → Archive
 * Integrates Legacy Detector with Legacy Keeper Agent for seamless handoff
 */

const { scanLastSixMonths } = require('../scanners/legacyDetector');
const { 
  conductForensicInterview, 
  extractTacitKnowledge, 
  formatForArchival,
  createInterviewContext,
  generateSessionId
} = require('../agents/legacyKeeper');
const { createLegacyDocument } = require('../services/confluenceService');
const { 
  InterviewContext, 
  KnowledgeArtifact, 
  CodeArtifact,
  UndocumentedIntensityReport 
} = require('../models');
const { handleApiError, logError, LOG_LEVELS } = require('../utils/errorHandler');

/**
 * Workflow states for cognitive offboarding sessions
 */
const WORKFLOW_STATES = {
  TRIGGERED: 'TRIGGERED',
  SCANNING: 'SCANNING',
  SCAN_COMPLETE: 'SCAN_COMPLETE',
  INTERVIEWING: 'INTERVIEWING',
  INTERVIEW_COMPLETE: 'INTERVIEW_COMPLETE',
  ARCHIVING: 'ARCHIVING',
  ARCHIVED: 'ARCHIVED',
  FAILED: 'FAILED'
};

/**
 * Workflow Session - Tracks the state of a cognitive offboarding session
 */
class WorkflowSession {
  constructor({
    sessionId,
    employeeId,
    triggeredBy,
    triggeredAt = new Date(),
    state = WORKFLOW_STATES.TRIGGERED,
    scanResults = null,
    interviewResults = null,
    archiveResults = null,
    progress = {},
    errors = []
  }) {
    this.sessionId = sessionId;
    this.employeeId = employeeId;
    this.triggeredBy = triggeredBy;
    this.triggeredAt = triggeredAt;
    this.state = state;
    this.scanResults = scanResults;
    this.interviewResults = interviewResults;
    this.archiveResults = archiveResults;
    this.progress = progress;
    this.errors = errors;
  }

  validate() {
    const errors = [];
    
    if (!this.sessionId) errors.push('Session ID is required');
    if (!this.employeeId) errors.push('Employee ID is required');
    if (!this.triggeredBy) errors.push('Triggered by is required');
    if (!Object.values(WORKFLOW_STATES).includes(this.state)) {
      errors.push('Invalid workflow state');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  updateState(newState, progressUpdate = {}) {
    this.state = newState;
    this.progress = { ...this.progress, ...progressUpdate };
    this.progress.lastUpdated = new Date();
    
    logError({
      message: `Workflow state updated: ${this.state}`,
      sessionId: this.sessionId,
      employeeId: this.employeeId,
      progress: this.progress
    }, LOG_LEVELS.INFO);
  }

  addError(error) {
    this.errors.push({
      timestamp: new Date(),
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      details: error.details || null
    });
  }

  getProgressPercentage() {
    const stateProgress = {
      [WORKFLOW_STATES.TRIGGERED]: 10,
      [WORKFLOW_STATES.SCANNING]: 25,
      [WORKFLOW_STATES.SCAN_COMPLETE]: 40,
      [WORKFLOW_STATES.INTERVIEWING]: 60,
      [WORKFLOW_STATES.INTERVIEW_COMPLETE]: 80,
      [WORKFLOW_STATES.ARCHIVING]: 90,
      [WORKFLOW_STATES.ARCHIVED]: 100,
      [WORKFLOW_STATES.FAILED]: 0
    };
    
    return stateProgress[this.state] || 0;
  }
}

/**
 * In-memory workflow session storage (in production, this would be a database)
 */
const activeSessions = new Map();

/**
 * Trigger cognitive offboarding workflow for a departing employee
 * @param {Object} params - Trigger parameters
 * @returns {Promise<WorkflowSession>} Workflow session
 */
async function triggerCognitiveOffboarding(params) {
  try {
    const {
      employeeId,
      triggeredBy = 'system',
      department = 'Unknown',
      role = 'Unknown',
      offboardingDate = null
    } = params;

    // Validate required parameters
    if (!employeeId) {
      throw new Error('Employee ID is required to trigger cognitive offboarding');
    }

    // Generate unique session ID
    const sessionId = generateSessionId();
    
    // Create workflow session
    const session = new WorkflowSession({
      sessionId,
      employeeId,
      triggeredBy,
      triggeredAt: new Date(),
      state: WORKFLOW_STATES.TRIGGERED,
      progress: {
        department,
        role,
        offboardingDate,
        triggeredAt: new Date()
      }
    });

    // Validate session
    const validation = session.validate();
    if (!validation.isValid) {
      throw new Error(`Invalid workflow session: ${validation.errors.join(', ')}`);
    }

    // Store session
    activeSessions.set(sessionId, session);

    logError({
      message: 'Cognitive offboarding workflow triggered',
      sessionId,
      employeeId,
      triggeredBy,
      department,
      role
    }, LOG_LEVELS.INFO);

    return session;

  } catch (error) {
    logError({
      message: 'Failed to trigger cognitive offboarding workflow',
      error: error.message,
      employeeId: params.employeeId
    }, LOG_LEVELS.ERROR);
    
    throw error;
  }
}

/**
 * Execute the scan phase of the workflow
 * @param {string} sessionId - Workflow session ID
 * @returns {Promise<UndocumentedIntensityReport>} Scan results
 */
async function executeScanPhase(sessionId) {
  try {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Workflow session not found: ${sessionId}`);
    }

    // Update state to scanning
    session.updateState(WORKFLOW_STATES.SCANNING, {
      scanStarted: new Date()
    });

    logError({
      message: 'Starting scan phase for cognitive offboarding',
      sessionId,
      employeeId: session.employeeId
    }, LOG_LEVELS.INFO);

    // Execute Legacy Detector scan for this specific user
    const scanRequest = {
      payload: {
        userId: session.employeeId,
        timeframe: '6_MONTHS'
      }
    };

    const scanResponse = await scanLastSixMonths(scanRequest);
    
    if (!scanResponse.success) {
      throw new Error(`Scan failed: ${scanResponse.error}`);
    }

    // Find the report for this specific user
    let userReport = scanResponse.reports.find(report => 
      report.userId === session.employeeId
    );

    if (!userReport) {
      // Create a minimal report if no undocumented intensity found
      userReport = new UndocumentedIntensityReport({
        userId: session.employeeId,
        timeframe: '6_MONTHS',
        highComplexityPRs: [],
        criticalJiraTickets: [],
        documentationLinks: [],
        undocumentedIntensityScore: 0,
        specificArtifacts: [],
        riskLevel: 'LOW'
      });
    }

    // Store scan results
    session.scanResults = userReport;
    session.updateState(WORKFLOW_STATES.SCAN_COMPLETE, {
      scanCompleted: new Date(),
      undocumentedIntensityScore: userReport.undocumentedIntensityScore,
      riskLevel: userReport.riskLevel,
      artifactsFound: userReport.specificArtifacts.length
    });

    logError({
      message: 'Scan phase completed successfully',
      sessionId,
      employeeId: session.employeeId,
      undocumentedIntensityScore: userReport.undocumentedIntensityScore,
      riskLevel: userReport.riskLevel,
      artifactsFound: userReport.specificArtifacts.length
    }, LOG_LEVELS.INFO);

    return userReport;

  } catch (error) {
    const session = activeSessions.get(sessionId);
    if (session) {
      session.addError(error);
      session.updateState(WORKFLOW_STATES.FAILED);
    }

    logError({
      message: 'Scan phase failed',
      error: error.message,
      sessionId
    }, LOG_LEVELS.ERROR);
    
    throw error;
  }
}

/**
 * Execute the interview phase of the workflow
 * @param {string} sessionId - Workflow session ID
 * @returns {Promise<Object>} Interview results
 */
async function executeInterviewPhase(sessionId) {
  try {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Workflow session not found: ${sessionId}`);
    }

    if (!session.scanResults) {
      throw new Error('Scan phase must be completed before interview phase');
    }

    // Update state to interviewing
    session.updateState(WORKFLOW_STATES.INTERVIEWING, {
      interviewStarted: new Date()
    });

    logError({
      message: 'Starting interview phase for cognitive offboarding',
      sessionId,
      employeeId: session.employeeId
    }, LOG_LEVELS.INFO);

    // Convert scan results to code artifacts for interview context
    const codeArtifacts = convertScanResultsToArtifacts(session.scanResults);

    // Create interview context with scan results
    const interviewContext = createInterviewContext({
      employeeId: session.employeeId,
      department: session.progress.department || 'Unknown',
      role: session.progress.role || 'Unknown',
      identifiedGaps: [], // Legacy field, kept for compatibility
      sessionId: session.sessionId
    });

    // Enhance interview context with scan data
    interviewContext.recentPullRequests = session.scanResults.highComplexityPRs;
    interviewContext.commitHistory = []; // Would be populated from Bitbucket service
    interviewContext.undocumentedIntensityScore = session.scanResults.undocumentedIntensityScore;
    interviewContext.specificArtifacts = codeArtifacts;

    // Conduct forensic interview
    const interviewSession = await conductForensicInterview(interviewContext);
    
    if (!interviewSession.success) {
      throw new Error('Failed to conduct forensic interview');
    }

    // Store interview results
    session.interviewResults = {
      interviewSession: interviewSession.session,
      context: interviewContext,
      artifactsAnalyzed: codeArtifacts.length,
      questionsGenerated: interviewSession.session.artifactQuestions.length
    };

    session.updateState(WORKFLOW_STATES.INTERVIEW_COMPLETE, {
      interviewCompleted: new Date(),
      artifactsAnalyzed: codeArtifacts.length,
      questionsGenerated: interviewSession.session.artifactQuestions.length
    });

    logError({
      message: 'Interview phase completed successfully',
      sessionId,
      employeeId: session.employeeId,
      artifactsAnalyzed: codeArtifacts.length,
      questionsGenerated: interviewSession.session.artifactQuestions.length
    }, LOG_LEVELS.INFO);

    return session.interviewResults;

  } catch (error) {
    const session = activeSessions.get(sessionId);
    if (session) {
      session.addError(error);
      session.updateState(WORKFLOW_STATES.FAILED);
    }

    logError({
      message: 'Interview phase failed',
      error: error.message,
      sessionId
    }, LOG_LEVELS.ERROR);
    
    throw error;
  }
}

/**
 * Execute the archive phase of the workflow
 * @param {string} sessionId - Workflow session ID
 * @param {Array} interviewResponses - Responses from the interview
 * @returns {Promise<Object>} Archive results
 */
async function executeArchivePhase(sessionId, interviewResponses = []) {
  try {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Workflow session not found: ${sessionId}`);
    }

    if (!session.interviewResults) {
      throw new Error('Interview phase must be completed before archive phase');
    }

    // Update state to archiving
    session.updateState(WORKFLOW_STATES.ARCHIVING, {
      archiveStarted: new Date()
    });

    logError({
      message: 'Starting archive phase for cognitive offboarding',
      sessionId,
      employeeId: session.employeeId
    }, LOG_LEVELS.INFO);

    // Extract tacit knowledge from interview responses
    const tacitKnowledge = extractTacitKnowledge(
      interviewResponses, 
      session.interviewResults.context
    );

    // Create knowledge artifact
    const knowledgeArtifact = new KnowledgeArtifact({
      id: `knowledge_${sessionId}_${Date.now()}`,
      employeeId: session.employeeId,
      title: `Cognitive Offboarding - ${session.progress.role || 'Unknown Role'}`,
      content: formatInterviewContent(interviewResponses, tacitKnowledge),
      tags: extractTagsFromWorkflow(session, tacitKnowledge),
      extractedAt: new Date(),
      confidence: tacitKnowledge.confidenceScore || 0.5,
      relatedTickets: session.scanResults.criticalJiraTickets.map(ticket => ticket.key),
      relatedPRs: session.scanResults.highComplexityPRs.map(pr => pr.id),
      relatedCommits: [], // Would be populated from commit analysis
      sourceArtifacts: session.interviewResults.context.specificArtifacts
    });

    // Validate knowledge artifact
    const validation = knowledgeArtifact.validate();
    if (!validation.isValid) {
      throw new Error(`Invalid knowledge artifact: ${validation.errors.join(', ')}`);
    }

    // Create Legacy Document in Confluence
    const confluenceResult = await createLegacyDocument(knowledgeArtifact);
    
    if (!confluenceResult.success) {
      throw new Error(`Failed to create Legacy Document: ${confluenceResult.error}`);
    }

    // Store archive results
    session.archiveResults = {
      knowledgeArtifact,
      confluenceResult,
      tacitKnowledge,
      artifactsLinked: confluenceResult.linkedArtifacts || []
    };

    session.updateState(WORKFLOW_STATES.ARCHIVED, {
      archiveCompleted: new Date(),
      confluencePageUrl: confluenceResult.pageUrl,
      artifactsLinked: (confluenceResult.linkedArtifacts || []).length,
      knowledgeConfidence: knowledgeArtifact.confidence
    });

    logError({
      message: 'Archive phase completed successfully - Cognitive offboarding workflow complete',
      sessionId,
      employeeId: session.employeeId,
      confluencePageUrl: confluenceResult.pageUrl,
      artifactsLinked: (confluenceResult.linkedArtifacts || []).length,
      knowledgeConfidence: knowledgeArtifact.confidence
    }, LOG_LEVELS.INFO);

    return session.archiveResults;

  } catch (error) {
    const session = activeSessions.get(sessionId);
    if (session) {
      session.addError(error);
      session.updateState(WORKFLOW_STATES.FAILED);
    }

    logError({
      message: 'Archive phase failed',
      error: error.message,
      sessionId
    }, LOG_LEVELS.ERROR);
    
    throw error;
  }
}

/**
 * Execute the complete cognitive offboarding workflow
 * @param {Object} params - Workflow parameters
 * @param {Array} interviewResponses - Interview responses (optional for testing)
 * @returns {Promise<WorkflowSession>} Completed workflow session
 */
async function executeCompleteWorkflow(params, interviewResponses = []) {
  let session = null;
  
  try {
    // Phase 1: Trigger
    session = await triggerCognitiveOffboarding(params);
    
    // Phase 2: Scan
    await executeScanPhase(session.sessionId);
    
    // Phase 3: Interview
    await executeInterviewPhase(session.sessionId);
    
    // Phase 4: Archive
    await executeArchivePhase(session.sessionId, interviewResponses);
    
    logError({
      message: 'Complete cognitive offboarding workflow executed successfully',
      sessionId: session.sessionId,
      employeeId: session.employeeId,
      finalState: session.state,
      progressPercentage: session.getProgressPercentage()
    }, LOG_LEVELS.INFO);

    return session;

  } catch (error) {
    logError({
      message: 'Complete cognitive offboarding workflow failed',
      error: error.message,
      sessionId: session ? session.sessionId : 'unknown',
      employeeId: params.employeeId
    }, LOG_LEVELS.ERROR);
    
    throw error;
  }
}

/**
 * Get workflow session by ID
 * @param {string} sessionId - Session ID
 * @returns {WorkflowSession|null} Workflow session or null if not found
 */
function getWorkflowSession(sessionId) {
  return activeSessions.get(sessionId) || null;
}

/**
 * Get all active workflow sessions
 * @returns {Array<WorkflowSession>} Array of active sessions
 */
function getAllActiveSessions() {
  return Array.from(activeSessions.values());
}

/**
 * Validate workflow completion - ensures all artifacts are properly captured
 * @param {string} sessionId - Session ID
 * @returns {Object} Validation result
 */
function validateWorkflowCompletion(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return {
      isValid: false,
      errors: ['Session not found']
    };
  }

  const errors = [];
  
  // Check workflow state
  if (session.state !== WORKFLOW_STATES.ARCHIVED) {
    errors.push(`Workflow not completed. Current state: ${session.state}`);
  }

  // Check scan results
  if (!session.scanResults) {
    errors.push('Scan results missing');
  } else {
    if (session.scanResults.undocumentedIntensityScore === undefined) {
      errors.push('Undocumented intensity score missing');
    }
  }

  // Check interview results
  if (!session.interviewResults) {
    errors.push('Interview results missing');
  } else {
    if (!session.interviewResults.context || !session.interviewResults.context.specificArtifacts) {
      errors.push('Interview context or artifacts missing');
    }
  }

  // Check archive results
  if (!session.archiveResults) {
    errors.push('Archive results missing');
  } else {
    if (!session.archiveResults.knowledgeArtifact) {
      errors.push('Knowledge artifact missing');
    }
    if (!session.archiveResults.confluenceResult || !session.archiveResults.confluenceResult.success) {
      errors.push('Confluence document creation failed or missing');
    }
  }

  // Check artifact references are maintained
  if (session.scanResults && session.archiveResults) {
    const scanArtifacts = session.scanResults.specificArtifacts || [];
    const archiveArtifacts = session.archiveResults.knowledgeArtifact.sourceArtifacts || [];
    
    if (scanArtifacts.length > 0 && archiveArtifacts.length === 0) {
      errors.push('Artifact references not maintained from scan to archive');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    session: session
  };
}

/**
 * Convert scan results to code artifacts for interview context
 * @param {UndocumentedIntensityReport} scanResults - Scan results
 * @returns {Array<CodeArtifact>} Array of code artifacts
 */
function convertScanResultsToArtifacts(scanResults) {
  const artifacts = [];

  // Convert Jira tickets to code artifacts
  scanResults.criticalJiraTickets.forEach(ticket => {
    artifacts.push(new CodeArtifact({
      type: 'JIRA_TICKET',
      id: ticket.key,
      title: ticket.summary,
      author: ticket.assignee,
      date: ticket.updated,
      complexityIndicators: ['high_activity', 'low_documentation'],
      documentationLevel: ticket.getDocumentationRatio() < 0.3 ? 'MINIMAL' : 'ADEQUATE'
    }));
  });

  // Convert PRs to code artifacts
  scanResults.highComplexityPRs.forEach(pr => {
    artifacts.push(new CodeArtifact({
      type: 'PR',
      id: pr.id,
      title: pr.title,
      author: pr.author,
      date: pr.created,
      complexityIndicators: [`complexity_${pr.complexityScore}`, `files_${pr.filesChanged}`, `lines_${pr.linesAdded + pr.linesDeleted}`],
      documentationLevel: pr.complexityScore >= 8 ? 'MINIMAL' : 'ADEQUATE'
    }));
  });

  return artifacts;
}

/**
 * Format interview content for knowledge artifact
 * @param {Array} interviewResponses - Interview responses
 * @param {Object} tacitKnowledge - Extracted tacit knowledge
 * @returns {string} Formatted content
 */
function formatInterviewContent(interviewResponses, tacitKnowledge) {
  if (!interviewResponses || interviewResponses.length === 0) {
    return 'No interview responses captured. This knowledge artifact was generated from automated analysis of code artifacts and undocumented intensity patterns.';
  }

  let content = '# Cognitive Offboarding Interview Results\n\n';
  
  // Add interview responses
  content += '## Interview Responses\n\n';
  interviewResponses.forEach((response, index) => {
    content += `**Question ${index + 1}:** ${response.question}\n\n`;
    content += `**Response:** ${response.answer}\n\n`;
    if (response.artifactId) {
      content += `*Related to artifact: ${response.artifactId}*\n\n`;
    }
    content += '---\n\n';
  });

  // Add tacit knowledge analysis if available
  if (tacitKnowledge && tacitKnowledge.criticalInsights && tacitKnowledge.criticalInsights.length > 0) {
    content += '## Critical Insights Extracted\n\n';
    tacitKnowledge.criticalInsights.forEach((insight, index) => {
      content += `${index + 1}. **${insight.reason}**\n`;
      content += `   ${insight.content}\n\n`;
    });
  }

  return content;
}

/**
 * Extract tags from workflow session and tacit knowledge
 * @param {WorkflowSession} session - Workflow session
 * @param {Object} tacitKnowledge - Tacit knowledge
 * @returns {Array<string>} Array of tags
 */
function extractTagsFromWorkflow(session, tacitKnowledge) {
  const tags = new Set();
  
  // Add workflow-based tags
  tags.add('cognitive-offboarding');
  tags.add(`risk-${session.scanResults.riskLevel.toLowerCase()}`);
  tags.add(`intensity-${Math.round(session.scanResults.undocumentedIntensityScore)}`);
  
  if (session.progress.department && session.progress.department !== 'Unknown') {
    tags.add(`dept-${session.progress.department.toLowerCase().replace(/\s+/g, '-')}`);
  }
  
  if (session.progress.role && session.progress.role !== 'Unknown') {
    tags.add(`role-${session.progress.role.toLowerCase().replace(/\s+/g, '-')}`);
  }

  // Add artifact-based tags
  if (session.scanResults.criticalJiraTickets.length > 0) {
    tags.add('jira-tickets');
  }
  
  if (session.scanResults.highComplexityPRs.length > 0) {
    tags.add('complex-prs');
  }

  // Add tacit knowledge category tags
  if (tacitKnowledge && tacitKnowledge.categories) {
    Object.keys(tacitKnowledge.categories).forEach(category => {
      if (tacitKnowledge.categories[category].length > 0) {
        tags.add(`knowledge-${category.toLowerCase()}`);
      }
    });
  }

  return Array.from(tags).slice(0, 10); // Limit to 10 tags
}

module.exports = {
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
};