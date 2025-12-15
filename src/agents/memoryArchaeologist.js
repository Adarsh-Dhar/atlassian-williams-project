/**
 * Memory Archaeologist Agent
 * Handles the Rovo Agent configuration and conversation flow management
 */

const { saveToConfluence } = require('../services/confluenceService');
const { KnowledgeArtifact, InterviewContext } = require('../models');
const { handleApiError, logError, LOG_LEVELS } = require('../utils/errorHandler');

/**
 * Agent configuration and prompt
 */
const AGENT_CONFIG = {
  key: 'memory-archaeologist',
  name: 'Memory Archaeologist',
  prompt: 'You are a forensic technical interviewer. Your goal is to extract tacit knowledge about undocumented projects. Ask specific questions, then offer to save the findings.',
  description: 'AI agent specialized in conducting structured interviews to capture institutional knowledge from departing employees'
};

/**
 * Interview conversation templates and flows
 */
const INTERVIEW_TEMPLATES = {
  opening: [
    "Hello! I'm the Memory Archaeologist, and I'm here to help capture your valuable knowledge before you transition out of your role.",
    "I'll ask you some specific questions about your work, focusing on undocumented processes and insights that might be lost.",
    "Let's start with your current projects and responsibilities."
  ],
  
  projectQuestions: [
    "What projects are you currently working on that have minimal documentation?",
    "Are there any 'tribal knowledge' aspects of your work that only you know?",
    "What would a new person in your role struggle with the most?",
    "Are there any workarounds or shortcuts you use that aren't documented?",
    "What external dependencies or relationships are critical to your work?"
  ],
  
  processQuestions: [
    "What processes do you follow that aren't written down anywhere?",
    "Are there any tools or systems you use in ways that differ from the official documentation?",
    "What are the common pitfalls or gotchas in your area of work?",
    "How do you typically troubleshoot issues in your domain?",
    "What institutional knowledge would you want to pass on to your replacement?"
  ],
  
  closingQuestions: [
    "Is there anything else you think is important for the organization to know?",
    "What would you have wanted to know when you first started in this role?",
    "Are there any relationships or contacts that are crucial for this work?",
    "What advice would you give to someone taking over your responsibilities?"
  ]
};

/**
 * Create an interview context for a knowledge extraction session
 * @param {Object} params - Interview parameters
 * @returns {InterviewContext} Interview context object
 */
function createInterviewContext(params) {
  const {
    employeeId,
    department = 'Unknown',
    role = 'Unknown',
    identifiedGaps = [],
    sessionId = generateSessionId()
  } = params;

  return new InterviewContext({
    employeeId,
    department,
    role,
    identifiedGaps,
    sessionId
  });
}

/**
 * Generate a unique session ID for tracking interviews
 * @returns {string} Unique session identifier
 */
function generateSessionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `session_${timestamp}_${random}`;
}

/**
 * Extract knowledge artifacts from interview responses
 * @param {Array} responses - Array of interview responses
 * @param {InterviewContext} context - Interview context
 * @returns {KnowledgeArtifact} Extracted knowledge artifact
 */
function extractKnowledgeFromResponses(responses, context) {
  try {
    // Combine all responses into structured content
    const content = responses.map((response, index) => {
      return `**Question ${index + 1}:** ${response.question}\n**Response:** ${response.answer}\n`;
    }).join('\n');

    // Extract tags from responses
    const tags = extractTagsFromContent(content);
    
    // Calculate confidence based on response quality
    const confidence = calculateResponseConfidence(responses);

    const artifact = new KnowledgeArtifact({
      id: `knowledge_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      employeeId: context.employeeId,
      title: `Knowledge Transfer Session - ${context.role}`,
      content: content,
      tags: tags,
      extractedAt: new Date(),
      confidence: confidence,
      relatedTickets: context.identifiedGaps.map(gap => gap.ticketId).filter(Boolean)
    });

    logError({
      message: 'Knowledge artifact extracted successfully',
      artifactId: artifact.id,
      employeeId: context.employeeId,
      confidence: confidence
    }, LOG_LEVELS.INFO);

    return artifact;

  } catch (error) {
    logError({
      message: 'Failed to extract knowledge from responses',
      error: error.message,
      context: context.sessionId
    }, LOG_LEVELS.ERROR);
    
    throw error;
  }
}

/**
 * Extract relevant tags from interview content
 * @param {string} content - Interview content
 * @returns {Array<string>} Array of extracted tags
 */
function extractTagsFromContent(content) {
  const tags = new Set();
  
  // Common technical terms that might indicate important topics
  const technicalTerms = [
    'api', 'database', 'integration', 'deployment', 'testing', 'monitoring',
    'security', 'performance', 'architecture', 'documentation', 'process',
    'workflow', 'automation', 'configuration', 'troubleshooting'
  ];
  
  const lowerContent = content.toLowerCase();
  
  technicalTerms.forEach(term => {
    if (lowerContent.includes(term)) {
      tags.add(term);
    }
  });
  
  // Extract project names (assuming they follow PROJ-XXX pattern)
  const projectMatches = content.match(/[A-Z]+-\d+/g);
  if (projectMatches) {
    projectMatches.forEach(match => tags.add(`project:${match}`));
  }
  
  // Extract system names (words in quotes or caps)
  const systemMatches = content.match(/"([^"]+)"|([A-Z]{2,})/g);
  if (systemMatches) {
    systemMatches.slice(0, 5).forEach(match => {
      const cleaned = match.replace(/"/g, '').toLowerCase();
      if (cleaned.length > 2 && cleaned.length < 20) {
        tags.add(`system:${cleaned}`);
      }
    });
  }
  
  return Array.from(tags).slice(0, 10); // Limit to 10 tags
}

/**
 * Calculate confidence score based on response quality
 * @param {Array} responses - Array of interview responses
 * @returns {number} Confidence score between 0 and 1
 */
function calculateResponseConfidence(responses) {
  if (!responses || responses.length === 0) return 0;
  
  let totalScore = 0;
  
  responses.forEach(response => {
    let score = 0;
    
    // Length indicates detail level
    const answerLength = response.answer ? response.answer.length : 0;
    if (answerLength > 100) score += 0.3;
    else if (answerLength > 50) score += 0.2;
    else if (answerLength > 20) score += 0.1;
    
    // Specific details indicate quality
    if (response.answer && response.answer.includes('example')) score += 0.1;
    if (response.answer && response.answer.includes('process')) score += 0.1;
    if (response.answer && response.answer.includes('because')) score += 0.1;
    
    // Technical terms indicate domain knowledge
    const technicalTermCount = (response.answer.match(/\b(api|database|system|process|integration|deployment)\b/gi) || []).length;
    score += Math.min(technicalTermCount * 0.05, 0.2);
    
    totalScore += Math.min(score, 1.0);
  });
  
  return Math.min(totalScore / responses.length, 1.0);
}

/**
 * Format knowledge for Confluence storage
 * @param {KnowledgeArtifact} artifact - Knowledge artifact to format
 * @returns {Object} Formatted content for Confluence
 */
function formatKnowledgeForStorage(artifact) {
  const formattedContent = `
# Knowledge Transfer Session

**Employee:** ${artifact.employeeId}
**Session Date:** ${artifact.extractedAt.toLocaleDateString()}
**Confidence Level:** ${Math.round(artifact.confidence * 100)}%

## Captured Knowledge

${artifact.content}

## Metadata

**Tags:** ${artifact.tags.join(', ')}
**Related Tickets:** ${artifact.relatedTickets.join(', ')}

---
*This knowledge was captured using the Institutional Memory Archaeologist during an offboarding interview.*
`;

  return {
    title: artifact.title,
    content: formattedContent
  };
}

/**
 * Get appropriate interview questions based on context
 * @param {InterviewContext} context - Interview context
 * @param {string} phase - Interview phase (opening, projects, processes, closing)
 * @returns {Array<string>} Array of relevant questions
 */
function getInterviewQuestions(context, phase = 'opening') {
  const questions = INTERVIEW_TEMPLATES[phase] || INTERVIEW_TEMPLATES.opening;
  
  // Customize questions based on identified gaps
  if (context.identifiedGaps && context.identifiedGaps.length > 0) {
    const gapQuestions = context.identifiedGaps.map(gap => 
      `I noticed you have ${gap.ticketCount} tickets with minimal documentation. Can you tell me about the undocumented aspects of this work?`
    );
    return [...questions, ...gapQuestions];
  }
  
  return questions;
}

/**
 * Validate agent configuration
 * @returns {Object} Validation result
 */
function validateAgentConfiguration() {
  const errors = [];
  
  if (!AGENT_CONFIG.key) errors.push('Agent key is required');
  if (!AGENT_CONFIG.name) errors.push('Agent name is required');
  if (!AGENT_CONFIG.prompt) errors.push('Agent prompt is required');
  
  if (!AGENT_CONFIG.prompt.includes('forensic technical interviewer')) {
    errors.push('Agent prompt must identify as forensic technical interviewer');
  }
  
  if (!AGENT_CONFIG.prompt.includes('extract tacit knowledge')) {
    errors.push('Agent prompt must mention extracting tacit knowledge');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    config: AGENT_CONFIG
  };
}

module.exports = {
  AGENT_CONFIG,
  INTERVIEW_TEMPLATES,
  createInterviewContext,
  extractKnowledgeFromResponses,
  formatKnowledgeForStorage,
  getInterviewQuestions,
  validateAgentConfiguration,
  generateSessionId,
  extractTagsFromContent,
  calculateResponseConfidence
};