/**
 * Core data models and interfaces for the Institutional Memory Archaeologist
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
    relatedTickets = []
  }) {
    this.id = id;
    this.employeeId = employeeId;
    this.title = title;
    this.content = content;
    this.tags = tags;
    this.extractedAt = extractedAt;
    this.confidence = confidence;
    this.relatedTickets = relatedTickets;
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
    sessionId
  }) {
    this.employeeId = employeeId;
    this.department = department;
    this.role = role;
    this.identifiedGaps = identifiedGaps;
    this.sessionId = sessionId;
  }

  validate() {
    const errors = [];
    
    if (!this.employeeId) errors.push('Employee ID is required');
    if (!this.sessionId) errors.push('Session ID is required');
    
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
    pageId = null
  }) {
    this.success = success;
    this.pageUrl = pageUrl;
    this.error = error;
    this.pageId = pageId;
  }

  validate() {
    const errors = [];
    
    if (typeof this.success !== 'boolean') errors.push('Success must be a boolean');
    if (this.success && !this.pageUrl) errors.push('Page URL is required for successful operations');
    if (!this.success && !this.error) errors.push('Error message is required for failed operations');
    
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

module.exports = {
  KnowledgeArtifact,
  InterviewContext,
  JiraTicket,
  KnowledgeGapReport,
  ConfluencePageResult,
  ForgeApiResponse,
  ApiError
};