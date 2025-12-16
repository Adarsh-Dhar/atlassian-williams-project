/**
 * Core data models and interfaces for the Legacy Keeper
 */

/**
 * Knowledge Artifact - Represents captured tacit knowledge
 */
class KnowledgeArtifact {
  constructor({
    id,
    employeeId,
    title,
    content,
    tags = [],
    extractedAt = new Date(),
    confidence = 0.5,
    relatedTickets = [],
    relatedPRs = [],
    relatedCommits = [],
    sourceArtifacts = []
  }) {
    this.id = id;
    this.employeeId = employeeId;
    this.title = title;
    this.content = content;
    this.tags = tags;
    this.extractedAt = extractedAt;
    this.confidence = confidence;
    this.relatedTickets = relatedTickets;
    this.relatedPRs = relatedPRs;
    this.relatedCommits = relatedCommits;
    this.sourceArtifacts = sourceArtifacts;
  }

  validate() {
    const errors = [];
    
    if (!this.id) errors.push('ID is required');
    if (!this.employeeId) errors.push('Employee ID is required');
    if (!this.title) errors.push('Title is required');
    if (!this.content) errors.push('Content is required');
    if (this.confidence < 0 || this.confidence > 1) {
      errors.push('Confidence must be between 0 and 1');
    }
    if (!Array.isArray(this.relatedTickets)) errors.push('Related tickets must be an array');
    if (!Array.isArray(this.relatedPRs)) errors.push('Related PRs must be an array');
    if (!Array.isArray(this.relatedCommits)) errors.push('Related commits must be an array');
    if (!Array.isArray(this.sourceArtifacts)) errors.push('Source artifacts must be an array');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Interview Context - Context for conducting knowledge extraction interviews
 */
class InterviewContext {
  constructor({
    employeeId,
    department,
    role,
    identifiedGaps = [],
    recentPullRequests = [],
    commitHistory = [],
    undocumentedIntensityScore = 0,
    specificArtifacts = [],
    sessionId
  }) {
    this.employeeId = employeeId;
    this.department = department;
    this.role = role;
    this.identifiedGaps = identifiedGaps;
    this.recentPullRequests = recentPullRequests;
    this.commitHistory = commitHistory;
    this.undocumentedIntensityScore = undocumentedIntensityScore;
    this.specificArtifacts = specificArtifacts;
    this.sessionId = sessionId;
  }

  validate() {
    const errors = [];
    
    if (!this.employeeId) errors.push('Employee ID is required');
    if (!this.sessionId) errors.push('Session ID is required');
    if (!Array.isArray(this.identifiedGaps)) errors.push('Identified gaps must be an array');
    if (!Array.isArray(this.recentPullRequests)) errors.push('Recent pull requests must be an array');
    if (!Array.isArray(this.commitHistory)) errors.push('Commit history must be an array');
    if (!Array.isArray(this.specificArtifacts)) errors.push('Specific artifacts must be an array');
    if (typeof this.undocumentedIntensityScore !== 'number') errors.push('Undocumented intensity score must be a number');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Jira Ticket Model - Represents a Jira ticket with documentation analysis
 */
class JiraTicket {
  constructor({
    id,
    key,
    summary,
    description,
    assignee,
    status,
    created,
    updated,
    commentCount = 0,
    documentationLinks = []
  }) {
    this.id = id;
    this.key = key;
    this.summary = summary;
    this.description = description;
    this.assignee = assignee;
    this.status = status;
    this.created = new Date(created);
    this.updated = new Date(updated);
    this.commentCount = commentCount;
    this.documentationLinks = documentationLinks;
  }

  validate() {
    const errors = [];
    
    if (!this.id) errors.push('ID is required');
    if (!this.key) errors.push('Key is required');
    if (!this.summary) errors.push('Summary is required');
    if (!this.assignee) errors.push('Assignee is required');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  getDocumentationRatio() {
    const descriptionLength = this.description ? this.description.length : 0;
    const linksCount = this.documentationLinks.length;
    const commentsCount = this.commentCount;
    
    // Simple heuristic: well-documented tickets have longer descriptions,
    // more documentation links, and more comments
    const documentationScore = (descriptionLength / 100) + (linksCount * 2) + (commentsCount * 0.5);
    
    // Normalize to 0-1 scale
    return Math.min(documentationScore / 10, 1);
  }
}

/**
 * Knowledge Gap Report - Report of identified knowledge gaps
 */
class KnowledgeGapReport {
  constructor({
    userId,
    ticketCount,
    documentationRatio,
    riskLevel,
    recommendedActions = []
  }) {
    this.userId = userId;
    this.ticketCount = ticketCount;
    this.documentationRatio = documentationRatio;
    this.riskLevel = riskLevel;
    this.recommendedActions = recommendedActions;
  }

  validate() {
    const errors = [];
    
    if (!this.userId) errors.push('User ID is required');
    if (typeof this.ticketCount !== 'number') errors.push('Ticket count must be a number');
    if (typeof this.documentationRatio !== 'number') errors.push('Documentation ratio must be a number');
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(this.riskLevel)) {
      errors.push('Risk level must be HIGH, MEDIUM, or LOW');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static calculateRiskLevel(ticketCount, documentationRatio) {
    if (ticketCount > 5 && documentationRatio < 0.3) return 'HIGH';
    if (ticketCount > 3 && documentationRatio < 0.5) return 'MEDIUM';
    return 'LOW';
  }
}

/**
 * Confluence Page Result - Result of creating a Confluence page
 */
class ConfluencePageResult {
  constructor({
    success,
    pageUrl = null,
    error = null,
    pageId = null,
    linkedArtifacts = []
  }) {
    this.success = success;
    this.pageUrl = pageUrl;
    this.error = error;
    this.pageId = pageId;
    this.linkedArtifacts = linkedArtifacts;
  }

  validate() {
    const errors = [];
    
    if (typeof this.success !== 'boolean') errors.push('Success must be a boolean');
    if (this.success && !this.pageUrl) errors.push('Page URL is required for successful operations');
    if (!this.success && !this.error) errors.push('Error message is required for failed operations');
    if (!Array.isArray(this.linkedArtifacts)) errors.push('Linked artifacts must be an array');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Forge API Response Wrapper - Generic wrapper for API responses
 */
class ForgeApiResponse {
  constructor({
    status,
    data,
    headers = {}
  }) {
    this.status = status;
    this.data = data;
    this.headers = headers;
  }

  validate() {
    const errors = [];
    
    if (typeof this.status !== 'number') errors.push('Status must be a number');
    if (this.status < 100 || this.status >= 600) errors.push('Status must be a valid HTTP status code');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  isSuccess() {
    return this.status >= 200 && this.status < 300;
  }
}

/**
 * API Error - Represents an API error
 */
class ApiError extends Error {
  constructor({
    code,
    message,
    details = null
  }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }

  validate() {
    const errors = [];
    
    if (!this.code) errors.push('Error code is required');
    if (!this.message) errors.push('Error message is required');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Bitbucket Pull Request Model
 */
class BitbucketPR {
  constructor({
    id,
    title,
    author,
    created,
    merged = null,
    linesAdded = 0,
    linesDeleted = 0,
    filesChanged = 0,
    complexityScore = 0,
    reviewComments = 0,
    state = 'OPEN',
    sourceRepository = null,
    destinationBranch = null
  }) {
    this.id = id;
    this.title = title;
    this.author = author;
    this.created = new Date(created);
    this.merged = merged ? new Date(merged) : null;
    this.linesAdded = linesAdded;
    this.linesDeleted = linesDeleted;
    this.filesChanged = filesChanged;
    this.complexityScore = complexityScore;
    this.reviewComments = reviewComments;
    this.state = state;
    this.sourceRepository = sourceRepository;
    this.destinationBranch = destinationBranch;
  }

  validate() {
    const errors = [];
    
    if (!this.id) errors.push('ID is required');
    if (!this.title) errors.push('Title is required');
    if (!this.author) errors.push('Author is required');
    if (this.complexityScore < 0 || this.complexityScore > 10) {
      errors.push('Complexity score must be between 0 and 10');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  getTotalLinesChanged() {
    return this.linesAdded + this.linesDeleted;
  }

  isHighComplexity() {
    return this.complexityScore >= 7;
  }
}

/**
 * Commit Model
 */
class Commit {
  constructor({
    hash,
    message,
    author,
    date,
    filesChanged = [],
    linesChanged = 0,
    repository = null,
    branch = null
  }) {
    this.hash = hash;
    this.message = message;
    this.author = author;
    this.date = new Date(date);
    this.filesChanged = filesChanged;
    this.linesChanged = linesChanged;
    this.repository = repository;
    this.branch = branch;
  }

  validate() {
    const errors = [];
    
    if (!this.hash) errors.push('Hash is required');
    if (!this.message) errors.push('Message is required');
    if (!this.author) errors.push('Author is required');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Diff Context Model
 */
class DiffContext {
  constructor({
    prId,
    changedFiles = [],
    keyChanges = [],
    totalLinesAdded = 0,
    totalLinesDeleted = 0,
    totalFilesChanged = 0
  }) {
    this.prId = prId;
    this.changedFiles = changedFiles;
    this.keyChanges = keyChanges;
    this.totalLinesAdded = totalLinesAdded;
    this.totalLinesDeleted = totalLinesDeleted;
    this.totalFilesChanged = totalFilesChanged;
  }

  validate() {
    const errors = [];
    
    if (!this.prId) errors.push('PR ID is required');
    if (!Array.isArray(this.changedFiles)) errors.push('Changed files must be an array');
    if (!Array.isArray(this.keyChanges)) errors.push('Key changes must be an array');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Changed File Model
 */
class ChangedFile {
  constructor({
    path,
    linesAdded = 0,
    linesDeleted = 0,
    changeType = 'MODIFIED'
  }) {
    this.path = path;
    this.linesAdded = linesAdded;
    this.linesDeleted = linesDeleted;
    this.changeType = changeType;
  }

  validate() {
    const errors = [];
    
    if (!this.path) errors.push('Path is required');
    if (!['ADDED', 'MODIFIED', 'DELETED'].includes(this.changeType)) {
      errors.push('Change type must be ADDED, MODIFIED, or DELETED');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  getTotalLinesChanged() {
    return this.linesAdded + this.linesDeleted;
  }
}

/**
 * Code Artifact Model
 */
class CodeArtifact {
  constructor({
    type,
    id,
    title,
    author,
    date,
    complexityIndicators = [],
    documentationLevel = 'NONE'
  }) {
    this.type = type;
    this.id = id;
    this.title = title;
    this.author = author;
    this.date = new Date(date);
    this.complexityIndicators = complexityIndicators;
    this.documentationLevel = documentationLevel;
  }

  validate() {
    const errors = [];
    
    if (!['PR', 'COMMIT', 'JIRA_TICKET'].includes(this.type)) {
      errors.push('Type must be PR, COMMIT, or JIRA_TICKET');
    }
    if (!this.id) errors.push('ID is required');
    if (!this.title) errors.push('Title is required');
    if (!this.author) errors.push('Author is required');
    if (!['NONE', 'MINIMAL', 'ADEQUATE', 'COMPREHENSIVE'].includes(this.documentationLevel)) {
      errors.push('Documentation level must be NONE, MINIMAL, ADEQUATE, or COMPREHENSIVE');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Developer Activity Model
 */
class DeveloperActivity {
  constructor({
    userId,
    timeframe = '6_MONTHS',
    jiraTickets = [],
    pullRequests = [],
    commits = [],
    totalComplexityScore = 0,
    documentationRatio = 0
  }) {
    this.userId = userId;
    this.timeframe = timeframe;
    this.jiraTickets = jiraTickets;
    this.pullRequests = pullRequests;
    this.commits = commits;
    this.totalComplexityScore = totalComplexityScore;
    this.documentationRatio = documentationRatio;
  }

  validate() {
    const errors = [];
    
    if (!this.userId) errors.push('User ID is required');
    if (this.timeframe !== '6_MONTHS') errors.push('Only 6_MONTHS timeframe is supported');
    if (!Array.isArray(this.jiraTickets)) errors.push('Jira tickets must be an array');
    if (!Array.isArray(this.pullRequests)) errors.push('Pull requests must be an array');
    if (!Array.isArray(this.commits)) errors.push('Commits must be an array');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  getTotalActivity() {
    return this.jiraTickets.length + this.pullRequests.length + this.commits.length;
  }
}

/**
 * Undocumented Intensity Report Model
 */
class UndocumentedIntensityReport {
  constructor({
    userId,
    timeframe = '6_MONTHS',
    highComplexityPRs = [],
    criticalJiraTickets = [],
    documentationLinks = [],
    undocumentedIntensityScore = 0,
    specificArtifacts = [],
    riskLevel = 'LOW'
  }) {
    this.userId = userId;
    this.timeframe = timeframe;
    this.highComplexityPRs = highComplexityPRs;
    this.criticalJiraTickets = criticalJiraTickets;
    this.documentationLinks = documentationLinks;
    this.undocumentedIntensityScore = undocumentedIntensityScore;
    this.specificArtifacts = specificArtifacts;
    this.riskLevel = riskLevel;
  }

  validate() {
    const errors = [];
    
    if (!this.userId) errors.push('User ID is required');
    if (this.timeframe !== '6_MONTHS') errors.push('Only 6_MONTHS timeframe is supported');
    if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(this.riskLevel)) {
      errors.push('Risk level must be CRITICAL, HIGH, MEDIUM, or LOW');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static calculateRiskLevel(undocumentedIntensityScore) {
    if (undocumentedIntensityScore >= 8) return 'CRITICAL';
    if (undocumentedIntensityScore >= 6) return 'HIGH';
    if (undocumentedIntensityScore >= 3) return 'MEDIUM';
    return 'LOW';
  }
}

module.exports = {
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
};