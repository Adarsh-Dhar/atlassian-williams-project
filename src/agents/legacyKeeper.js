/**
 * Legacy Keeper Agent
 * Handles the Rovo Agent configuration and forensic knowledge extraction for cognitive offboarding
 */

const { saveToConfluence } = require('../services/confluenceService');
const { KnowledgeArtifact, InterviewContext } = require('../models');
const { handleApiError, logError, LOG_LEVELS } = require('../utils/errorHandler');

/**
 * Agent configuration and prompt - Forensic and Artifact-Specific
 */
const AGENT_CONFIG = {
  key: 'legacy-keeper',
  name: 'Legacy Keeper',
  prompt: `You are a forensic technical interviewer specializing in cognitive offboarding. Your mission is to extract tacit knowledge by asking highly specific questions about concrete artifacts before critical knowledge is lost forever.

ALWAYS reference specific artifacts in your questions:
- PR IDs: "In PR #402, you changed the auth logic..."
- Commit hashes: "Looking at commit abc123, you refactored..."
- Jira tickets: "For JIRA-456, you implemented..."

Focus on the "WHY" behind code decisions, not just the "what":
- Why did you choose this approach over alternatives?
- What constraints influenced this decision?
- What would break if someone modified this without understanding your reasoning?
- What tribal knowledge is needed to maintain this properly?

Example questions:
- "You changed the auth logic in PR #402. Why did you choose OAuth over SAML?"
- "In commit abc123, you added error handling. What edge cases were you anticipating?"
- "For JIRA-456, you used a specific design pattern. What problems does this solve that aren't obvious from the code?"

Always dig deeper into architectural decisions, trade-offs, and undocumented constraints.`,
  description: 'AI agent specialized in conducting forensic interviews to capture tacit knowledge from departing developers before it\'s lost forever'
};

/**
 * Interview conversation templates and flows
 */
const INTERVIEW_TEMPLATES = {
  opening: [
    "Hello! I'm the Legacy Keeper, and I'm here to conduct a forensic knowledge extraction session before you transition out of your role.",
    "I'll ask you highly specific questions about concrete artifacts - your PRs, commits, and Jira tickets - focusing on the 'why' behind your code decisions.",
    "Let's start by examining your recent development activity and the undocumented reasoning behind your technical choices."
  ],
  
  artifactQuestions: [
    "Looking at PR #{prId}, why did you choose this specific implementation approach?",
    "In commit {commitHash}, you made significant changes to {fileName}. What was the reasoning behind this architectural decision?",
    "For Jira ticket {ticketKey}, what undocumented constraints or requirements influenced your solution?",
    "What alternative approaches did you consider for {specificArtifact} and why did you reject them?",
    "What would break if someone modified {specificComponent} without understanding your design decisions?"
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
 * Format knowledge for archival with artifact references and bidirectional links
 * @param {KnowledgeArtifact} artifact - Knowledge artifact to format
 * @param {Object} tacitKnowledge - Optional tacit knowledge analysis
 * @returns {Object} Formatted content for Confluence with artifact links
 */
function formatForArchival(artifact, tacitKnowledge = null) {
  try {
    // Build artifact reference section
    const artifactReferences = buildArtifactReferences(artifact);
    
    // Build tacit knowledge summary if available
    const tacitKnowledgeSummary = tacitKnowledge ? buildTacitKnowledgeSummary(tacitKnowledge) : '';
    
    // Build bidirectional links section
    const bidirectionalLinks = buildBidirectionalLinks(artifact);
    
    const formattedContent = `
# Legacy Document: ${artifact.title}

**Employee:** ${artifact.employeeId}
**Session Date:** ${artifact.extractedAt.toLocaleDateString()}
**Confidence Level:** ${Math.round(artifact.confidence * 100)}%
**Knowledge Extraction Type:** Forensic Cognitive Offboarding

## Executive Summary

This Legacy Document captures critical tacit knowledge from ${artifact.employeeId} through forensic interviewing techniques. The knowledge is directly linked to specific code artifacts to ensure traceability and context preservation.

${artifactReferences}

## Captured Knowledge

${artifact.content}

${tacitKnowledgeSummary}

## Source Artifact Links

${bidirectionalLinks}

## Metadata

**Tags:** ${artifact.tags.join(', ')}
**Related Jira Tickets:** ${artifact.relatedTickets.join(', ')}
**Related Pull Requests:** ${artifact.relatedPRs.join(', ')}
**Related Commits:** ${artifact.relatedCommits.join(', ')}
**Source Artifacts Count:** ${artifact.sourceArtifacts.length}

## Knowledge Preservation Notes

- This document contains **tacit knowledge** that exists only in the departing employee's experience
- Each insight is linked to specific code artifacts for context
- Critical insights are marked with ⚠️ for immediate attention
- This knowledge should be reviewed and integrated into formal documentation

---
*This Legacy Document was generated by Legacy Keeper during a cognitive offboarding session on ${artifact.extractedAt.toISOString()}*
*For questions about this knowledge, refer to the linked artifacts and consider consulting with team members who worked closely with ${artifact.employeeId}*
`;

    return {
      title: `Legacy Document: ${artifact.title}`,
      content: formattedContent,
      artifactLinks: extractArtifactLinks(artifact),
      metadata: {
        employeeId: artifact.employeeId,
        extractedAt: artifact.extractedAt,
        confidence: artifact.confidence,
        artifactCount: artifact.sourceArtifacts.length,
        linkedTickets: artifact.relatedTickets,
        linkedPRs: artifact.relatedPRs,
        linkedCommits: artifact.relatedCommits
      }
    };

  } catch (error) {
    logError({
      message: 'Failed to format knowledge for archival',
      error: error.message,
      artifactId: artifact.id
    }, LOG_LEVELS.ERROR);
    
    // Return basic format as fallback
    return {
      title: artifact.title,
      content: artifact.content,
      artifactLinks: [],
      metadata: {}
    };
  }
}

/**
 * Build artifact references section for the Legacy Document
 * @param {KnowledgeArtifact} artifact - Knowledge artifact
 * @returns {string} Formatted artifact references section
 */
function buildArtifactReferences(artifact) {
  if (!artifact.sourceArtifacts || artifact.sourceArtifacts.length === 0) {
    return '## Source Artifacts\n\nNo specific artifacts were identified for this knowledge transfer session.\n';
  }

  let references = '## Source Artifacts\n\n';
  references += 'This knowledge is directly linked to the following code artifacts:\n\n';

  const groupedArtifacts = {
    'PR': [],
    'COMMIT': [],
    'JIRA_TICKET': []
  };

  artifact.sourceArtifacts.forEach(sourceArtifact => {
    if (groupedArtifacts[sourceArtifact.type]) {
      groupedArtifacts[sourceArtifact.type].push(sourceArtifact);
    }
  });

  // Format Pull Requests
  if (groupedArtifacts.PR.length > 0) {
    references += '### Pull Requests\n';
    groupedArtifacts.PR.forEach(pr => {
      references += `- **PR #${pr.id}**: ${pr.title} (${pr.date.toLocaleDateString()}) - ${pr.author}\n`;
      if (pr.complexityIndicators && pr.complexityIndicators.length > 0) {
        references += `  - Complexity indicators: ${pr.complexityIndicators.join(', ')}\n`;
      }
      references += `  - Documentation level: ${pr.documentationLevel}\n`;
    });
    references += '\n';
  }

  // Format Commits
  if (groupedArtifacts.COMMIT.length > 0) {
    references += '### Commits\n';
    groupedArtifacts.COMMIT.forEach(commit => {
      const shortHash = commit.id.substring(0, 8);
      references += `- **${shortHash}**: ${commit.title} (${commit.date.toLocaleDateString()}) - ${commit.author}\n`;
    });
    references += '\n';
  }

  // Format Jira Tickets
  if (groupedArtifacts.JIRA_TICKET.length > 0) {
    references += '### Jira Tickets\n';
    groupedArtifacts.JIRA_TICKET.forEach(ticket => {
      references += `- **${ticket.id}**: ${ticket.title} (${ticket.date.toLocaleDateString()}) - ${ticket.author}\n`;
      references += `  - Documentation level: ${ticket.documentationLevel}\n`;
    });
    references += '\n';
  }

  return references;
}

/**
 * Build tacit knowledge summary section
 * @param {Object} tacitKnowledge - Tacit knowledge analysis
 * @returns {string} Formatted tacit knowledge summary
 */
function buildTacitKnowledgeSummary(tacitKnowledge) {
  let summary = '## Tacit Knowledge Analysis\n\n';
  summary += `**Extraction Confidence:** ${Math.round(tacitKnowledge.confidenceScore * 100)}%\n\n`;

  // Critical insights first
  if (tacitKnowledge.criticalInsights && tacitKnowledge.criticalInsights.length > 0) {
    summary += '### ⚠️ Critical Insights\n\n';
    tacitKnowledge.criticalInsights.forEach((insight, index) => {
      summary += `${index + 1}. **${insight.reason}**\n`;
      summary += `   ${insight.content}\n`;
      if (insight.artifactId) {
        summary += `   *Related to: ${insight.artifactId}*\n`;
      }
      summary += '\n';
    });
  }

  // Knowledge categories
  const categories = tacitKnowledge.categories;
  const categoryTitles = {
    architecturalDecisions: '🏗️ Architectural Decisions',
    businessConstraints: '💼 Business Constraints',
    technicalDebt: '⚠️ Technical Debt',
    processKnowledge: '⚙️ Process Knowledge',
    riskFactors: '🚨 Risk Factors',
    undocumentedDependencies: '🔗 Undocumented Dependencies'
  };

  Object.keys(categories).forEach(category => {
    if (categories[category] && categories[category].length > 0) {
      summary += `### ${categoryTitles[category] || category}\n\n`;
      categories[category].forEach((item, index) => {
        summary += `${index + 1}. ${item.content}\n`;
        if (item.artifactId) {
          summary += `   *Related to: ${item.artifactId}*\n`;
        }
        summary += '\n';
      });
    }
  });

  return summary;
}

/**
 * Build bidirectional links section
 * @param {KnowledgeArtifact} artifact - Knowledge artifact
 * @returns {string} Formatted bidirectional links section
 */
function buildBidirectionalLinks(artifact) {
  let links = 'The following artifacts should be updated to reference this Legacy Document:\n\n';

  // Jira ticket links
  if (artifact.relatedTickets && artifact.relatedTickets.length > 0) {
    links += '**Jira Tickets to Update:**\n';
    artifact.relatedTickets.forEach(ticketId => {
      links += `- Add comment to ${ticketId}: "Critical knowledge documented in Legacy Document: [Link to this page]"\n`;
    });
    links += '\n';
  }

  // Pull request links
  if (artifact.relatedPRs && artifact.relatedPRs.length > 0) {
    links += '**Pull Requests to Reference:**\n';
    artifact.relatedPRs.forEach(prId => {
      links += `- PR #${prId}: Add comment linking to this Legacy Document for context\n`;
    });
    links += '\n';
  }

  // Commit references
  if (artifact.relatedCommits && artifact.relatedCommits.length > 0) {
    links += '**Related Commits:**\n';
    artifact.relatedCommits.forEach(commitHash => {
      const shortHash = commitHash.substring(0, 8);
      links += `- ${shortHash}: Context and rationale documented in this Legacy Document\n`;
    });
    links += '\n';
  }

  return links;
}

/**
 * Extract artifact links for external reference
 * @param {KnowledgeArtifact} artifact - Knowledge artifact
 * @returns {Array} Array of artifact link objects
 */
function extractArtifactLinks(artifact) {
  const links = [];

  // Add Jira ticket links
  if (artifact.relatedTickets) {
    artifact.relatedTickets.forEach(ticketId => {
      links.push({
        type: 'JIRA_TICKET',
        id: ticketId,
        url: `https://your-domain.atlassian.net/browse/${ticketId}`,
        title: `Jira Ticket ${ticketId}`
      });
    });
  }

  // Add PR links
  if (artifact.relatedPRs) {
    artifact.relatedPRs.forEach(prId => {
      links.push({
        type: 'PULL_REQUEST',
        id: prId,
        url: `https://bitbucket.org/your-workspace/your-repo/pull-requests/${prId}`,
        title: `Pull Request #${prId}`
      });
    });
  }

  // Add commit links
  if (artifact.relatedCommits) {
    artifact.relatedCommits.forEach(commitHash => {
      links.push({
        type: 'COMMIT',
        id: commitHash,
        url: `https://bitbucket.org/your-workspace/your-repo/commits/${commitHash}`,
        title: `Commit ${commitHash.substring(0, 8)}`
      });
    });
  }

  return links;
}

/**
 * Generate artifact-specific questions for forensic interviews
 * @param {Array} artifacts - Array of code artifacts (PRs, commits, Jira tickets)
 * @returns {Array<Object>} Array of artifact-specific question objects with metadata
 */
function generateArtifactQuestions(artifacts) {
  const questions = [];
  
  if (!artifacts || artifacts.length === 0) {
    // Return generic forensic questions if no artifacts available
    return [
      {
        question: "What are the most critical pieces of undocumented knowledge in your area of work?",
        type: "general",
        artifactId: null,
        focus: "tacit_knowledge"
      },
      {
        question: "What would be the biggest risk if someone took over your work without proper knowledge transfer?",
        type: "general", 
        artifactId: null,
        focus: "risk_assessment"
      }
    ];
  }
  
  artifacts.forEach(artifact => {
    switch (artifact.type) {
      case 'PR':
        questions.push({
          question: `Looking at PR #${artifact.id} "${artifact.title}", why did you choose this specific implementation approach over alternatives?`,
          type: "PR",
          artifactId: artifact.id,
          focus: "implementation_rationale",
          followUp: `What constraints or requirements influenced your decision in PR #${artifact.id} that aren't obvious from the code?`
        });
        
        questions.push({
          question: `In PR #${artifact.id}, what would break or behave unexpectedly if someone modified your changes without understanding your design decisions?`,
          type: "PR",
          artifactId: artifact.id,
          focus: "maintenance_risks",
          followUp: `What tribal knowledge is essential for maintaining the code from PR #${artifact.id}?`
        });
        
        if (artifact.complexityIndicators && artifact.complexityIndicators.length > 0) {
          questions.push({
            question: `PR #${artifact.id} shows high complexity indicators (${artifact.complexityIndicators.join(', ')}). What makes this change particularly complex that isn't documented?`,
            type: "PR",
            artifactId: artifact.id,
            focus: "complexity_rationale"
          });
        }
        break;
        
      case 'COMMIT':
        const shortHash = artifact.id.substring(0, 8);
        questions.push({
          question: `In commit ${shortHash}, you made significant changes to ${artifact.title}. What was the reasoning behind this architectural decision?`,
          type: "COMMIT",
          artifactId: artifact.id,
          focus: "architectural_decision",
          followUp: `What alternative approaches did you consider for commit ${shortHash} and why did you reject them?`
        });
        
        questions.push({
          question: `Looking at commit ${shortHash}, what edge cases or scenarios were you anticipating that led to this specific implementation?`,
          type: "COMMIT",
          artifactId: artifact.id,
          focus: "edge_case_handling"
        });
        break;
        
      case 'JIRA_TICKET':
        questions.push({
          question: `For Jira ticket ${artifact.id} "${artifact.title}", what undocumented constraints or business requirements influenced your solution?`,
          type: "JIRA_TICKET",
          artifactId: artifact.id,
          focus: "business_constraints",
          followUp: `What stakeholder discussions or decisions shaped the approach in ${artifact.id} that aren't captured in the ticket?`
        });
        
        questions.push({
          question: `In ${artifact.id}, what technical debt or compromises did you have to make, and why were they necessary?`,
          type: "JIRA_TICKET",
          artifactId: artifact.id,
          focus: "technical_debt"
        });
        
        if (artifact.documentationLevel === 'NONE' || artifact.documentationLevel === 'MINIMAL') {
          questions.push({
            question: `${artifact.id} has minimal documentation. What critical knowledge about this work exists only in your head?`,
            type: "JIRA_TICKET",
            artifactId: artifact.id,
            focus: "undocumented_knowledge"
          });
        }
        break;
        
      default:
        questions.push({
          question: `Regarding ${artifact.id}, what critical context would be lost if you weren't here to explain it?`,
          type: "unknown",
          artifactId: artifact.id,
          focus: "general_context"
        });
    }
  });
  
  // Add cross-artifact questions if multiple artifacts exist
  if (artifacts.length > 1) {
    const artifactIds = artifacts.map(a => a.id).slice(0, 3).join(', ');
    questions.push({
      question: `Looking at the relationship between ${artifactIds}, how do these pieces work together in ways that aren't documented?`,
      type: "cross_artifact",
      artifactId: null,
      focus: "system_integration"
    });
  }
  
  return questions;
}

/**
 * Conduct a forensic interview using artifact-specific context
 * @param {InterviewContext} context - Interview context with artifacts
 * @returns {Promise<Object>} Interview session result
 */
async function conductForensicInterview(context) {
  try {
    // Validate context
    const validation = context.validate();
    if (!validation.isValid) {
      throw new Error(`Invalid interview context: ${validation.errors.join(', ')}`);
    }

    // Generate artifact-specific questions
    const artifactQuestions = generateArtifactQuestions(context.specificArtifacts);
    
    // Create interview session structure
    const interviewSession = {
      sessionId: context.sessionId,
      employeeId: context.employeeId,
      startTime: new Date(),
      phase: 'forensic_extraction',
      artifactQuestions: artifactQuestions,
      contextualInfo: {
        undocumentedIntensityScore: context.undocumentedIntensityScore,
        recentPRCount: context.recentPullRequests.length,
        commitCount: context.commitHistory.length,
        artifactCount: context.specificArtifacts.length
      },
      interviewFlow: [
        {
          phase: 'opening',
          questions: [
            `Hello! I'm conducting a forensic knowledge extraction session. I've analyzed your recent activity and identified ${context.specificArtifacts.length} artifacts with high undocumented intensity.`,
            `Your undocumented intensity score is ${context.undocumentedIntensityScore.toFixed(2)}, indicating significant tacit knowledge that needs to be captured.`,
            `I'll ask specific questions about your PRs, commits, and Jira tickets to extract the "why" behind your code decisions.`
          ]
        },
        {
          phase: 'artifact_deep_dive',
          questions: artifactQuestions
        },
        {
          phase: 'cross_cutting_concerns',
          questions: [
            "What patterns or principles guide your decision-making that aren't written down anywhere?",
            "What would you want your replacement to know about the codebase that they can't learn from documentation?",
            "What are the most dangerous assumptions someone could make about your work?"
          ]
        }
      ]
    };

    logError({
      message: 'Forensic interview session initiated',
      sessionId: context.sessionId,
      employeeId: context.employeeId,
      artifactCount: context.specificArtifacts.length,
      intensityScore: context.undocumentedIntensityScore
    }, LOG_LEVELS.INFO);

    return {
      success: true,
      session: interviewSession,
      nextSteps: [
        'Present opening questions to establish context',
        'Conduct artifact-specific questioning',
        'Extract tacit knowledge through follow-up questions',
        'Format findings for archival with artifact links'
      ]
    };

  } catch (error) {
    logError({
      message: 'Failed to conduct forensic interview',
      error: error.message,
      sessionId: context.sessionId
    }, LOG_LEVELS.ERROR);
    
    throw error;
  }
}

/**
 * Extract tacit knowledge focused on "why" behind code decisions
 * @param {Array} responses - Array of interview responses
 * @param {InterviewContext} context - Interview context
 * @returns {Object} Extracted tacit knowledge with categorization
 */
function extractTacitKnowledge(responses, context) {
  try {
    const tacitKnowledge = {
      sessionId: context.sessionId,
      employeeId: context.employeeId,
      extractedAt: new Date(),
      categories: {
        architecturalDecisions: [],
        businessConstraints: [],
        technicalDebt: [],
        processKnowledge: [],
        riskFactors: [],
        undocumentedDependencies: []
      },
      artifactMappings: {},
      confidenceScore: 0,
      criticalInsights: []
    };

    if (!responses || responses.length === 0) {
      return tacitKnowledge;
    }

    responses.forEach((response, index) => {
      const insight = analyzeResponseForTacitKnowledge(response, context);
      
      // Categorize the knowledge
      if (insight.category) {
        tacitKnowledge.categories[insight.category].push({
          content: insight.content,
          artifactId: insight.artifactId,
          confidence: insight.confidence,
          responseIndex: index
        });
      }

      // Map to specific artifacts
      if (insight.artifactId) {
        if (!tacitKnowledge.artifactMappings[insight.artifactId]) {
          tacitKnowledge.artifactMappings[insight.artifactId] = [];
        }
        tacitKnowledge.artifactMappings[insight.artifactId].push(insight.content);
      }

      // Identify critical insights
      if (insight.confidence > 0.8 || insight.isCritical) {
        tacitKnowledge.criticalInsights.push({
          content: insight.content,
          artifactId: insight.artifactId,
          reason: insight.criticalReason || 'High confidence knowledge'
        });
      }
    });

    // Calculate overall confidence score
    tacitKnowledge.confidenceScore = calculateTacitKnowledgeConfidence(responses, tacitKnowledge);

    logError({
      message: 'Tacit knowledge extracted successfully',
      sessionId: context.sessionId,
      categoriesFound: Object.keys(tacitKnowledge.categories).filter(cat => 
        tacitKnowledge.categories[cat].length > 0
      ).length,
      criticalInsights: tacitKnowledge.criticalInsights.length,
      confidenceScore: tacitKnowledge.confidenceScore
    }, LOG_LEVELS.INFO);

    return tacitKnowledge;

  } catch (error) {
    logError({
      message: 'Failed to extract tacit knowledge',
      error: error.message,
      sessionId: context.sessionId
    }, LOG_LEVELS.ERROR);
    
    throw error;
  }
}

/**
 * Analyze individual response for tacit knowledge patterns
 * @param {Object} response - Individual interview response
 * @param {InterviewContext} context - Interview context
 * @returns {Object} Analyzed insight with categorization
 */
function analyzeResponseForTacitKnowledge(response, context) {
  const insight = {
    content: response.answer || '',
    artifactId: response.artifactId || null,
    confidence: 0.5,
    category: null,
    isCritical: false,
    criticalReason: null
  };

  if (!insight.content) {
    return insight;
  }

  const lowerContent = insight.content.toLowerCase();

  // Detect architectural decisions
  if (lowerContent.includes('chose') || lowerContent.includes('decided') || 
      lowerContent.includes('approach') || lowerContent.includes('pattern')) {
    insight.category = 'architecturalDecisions';
    insight.confidence += 0.2;
  }

  // Detect business constraints
  if (lowerContent.includes('requirement') || lowerContent.includes('stakeholder') || 
      lowerContent.includes('business') || lowerContent.includes('deadline')) {
    insight.category = 'businessConstraints';
    insight.confidence += 0.2;
  }

  // Detect technical debt
  if (lowerContent.includes('compromise') || lowerContent.includes('workaround') || 
      lowerContent.includes('hack') || lowerContent.includes('temporary')) {
    insight.category = 'technicalDebt';
    insight.confidence += 0.3;
    insight.isCritical = true;
    insight.criticalReason = 'Technical debt requires careful handling';
  }

  // Detect process knowledge
  if (lowerContent.includes('process') || lowerContent.includes('workflow') || 
      lowerContent.includes('procedure') || lowerContent.includes('steps')) {
    insight.category = 'processKnowledge';
    insight.confidence += 0.2;
  }

  // Detect risk factors
  if (lowerContent.includes('break') || lowerContent.includes('fail') || 
      lowerContent.includes('dangerous') || lowerContent.includes('careful')) {
    insight.category = 'riskFactors';
    insight.confidence += 0.3;
    insight.isCritical = true;
    insight.criticalReason = 'Risk factor requires immediate attention';
  }

  // Detect undocumented dependencies
  if (lowerContent.includes('depends') || lowerContent.includes('relies') || 
      lowerContent.includes('assumes') || lowerContent.includes('expects')) {
    insight.category = 'undocumentedDependencies';
    insight.confidence += 0.2;
  }

  // Boost confidence for detailed responses
  if (insight.content.length > 200) {
    insight.confidence += 0.1;
  }

  // Boost confidence for responses with specific examples
  if (lowerContent.includes('example') || lowerContent.includes('instance') || 
      lowerContent.includes('case')) {
    insight.confidence += 0.1;
  }

  // Cap confidence at 1.0
  insight.confidence = Math.min(insight.confidence, 1.0);

  return insight;
}

/**
 * Calculate overall confidence score for extracted tacit knowledge
 * @param {Array} responses - Interview responses
 * @param {Object} tacitKnowledge - Extracted tacit knowledge
 * @returns {number} Confidence score between 0 and 1
 */
function calculateTacitKnowledgeConfidence(responses, tacitKnowledge) {
  if (!responses || responses.length === 0) return 0;

  let totalConfidence = 0;
  let weightedResponses = 0;

  responses.forEach(response => {
    const responseLength = response.answer ? response.answer.length : 0;
    const weight = Math.min(responseLength / 100, 2); // Max weight of 2
    
    let responseConfidence = 0.5;
    
    // Boost for detailed responses
    if (responseLength > 100) responseConfidence += 0.2;
    if (responseLength > 300) responseConfidence += 0.2;
    
    // Boost for responses with specific technical terms
    const technicalTerms = ['because', 'reason', 'approach', 'decision', 'constraint'];
    const lowerAnswer = (response.answer || '').toLowerCase();
    technicalTerms.forEach(term => {
      if (lowerAnswer.includes(term)) responseConfidence += 0.1;
    });
    
    totalConfidence += responseConfidence * weight;
    weightedResponses += weight;
  });

  const baseConfidence = weightedResponses > 0 ? totalConfidence / weightedResponses : 0;
  
  // Boost for having multiple categories of knowledge
  const categoriesWithContent = Object.keys(tacitKnowledge.categories).filter(cat => 
    tacitKnowledge.categories[cat].length > 0
  ).length;
  
  const categoryBonus = Math.min(categoriesWithContent * 0.05, 0.2);
  
  // Boost for critical insights
  const criticalBonus = Math.min(tacitKnowledge.criticalInsights.length * 0.03, 0.15);
  
  return Math.min(baseConfidence + categoryBonus + criticalBonus, 1.0);
}

/**
 * Get appropriate interview questions based on context
 * @param {InterviewContext} context - Interview context
 * @param {string} phase - Interview phase (opening, projects, processes, closing)
 * @returns {Array<string>} Array of relevant questions
 */
function getInterviewQuestions(context, phase = 'opening') {
  const questions = INTERVIEW_TEMPLATES[phase] || INTERVIEW_TEMPLATES.opening;
  
  // Generate artifact-specific questions if artifacts are available
  if (phase === 'artifactQuestions' && context.specificArtifacts) {
    const artifactQuestions = generateArtifactQuestions(context.specificArtifacts);
    return [...questions, ...artifactQuestions.map(q => q.question)];
  }
  
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
  formatKnowledgeForStorage: formatForArchival, // Maintain backward compatibility
  formatForArchival,
  getInterviewQuestions,
  generateArtifactQuestions,
  conductForensicInterview,
  extractTacitKnowledge,
  validateAgentConfiguration,
  generateSessionId,
  extractTagsFromContent,
  calculateResponseConfidence,
  analyzeResponseForTacitKnowledge,
  calculateTacitKnowledgeConfidence,
  buildArtifactReferences,
  buildTacitKnowledgeSummary,
  buildBidirectionalLinks,
  extractArtifactLinks
};