const api = require('@forge/api');
const { JiraTicket, UndocumentedIntensityReport } = require('../models');

/**
 * Legacy Detector - Identifies departing developers with Undocumented Intensity by analyzing last 6 months of Jira + Bitbucket activity
 * Implements strict 6-month constraint and Undocumented Intensity algorithm: (High Complexity PRs + Critical Jira Tickets) / (Documentation Links)
 */

/**
 * Main Legacy Detector function that analyzes last 6 months of Jira + Bitbucket activity to identify Undocumented Intensity
 * @param {Object} req - Forge request object
 * @returns {Promise<UndocumentedIntensityReport[]>} Array of undocumented intensity reports
 */
async function scanLastSixMonths(req) {
  try {
    console.log('Starting Legacy Detector scan for Undocumented Intensity (strict 6-month constraint)...');
    
    // Enforce strict 6-month constraint
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    // Get all users with recent activity in last 6 months
    const activeUsers = await getActiveUsersLastSixMonths(sixMonthsAgo);
    console.log(`Found ${activeUsers.length} active users in last 6 months`);
    
    const reports = [];
    
    for (const user of activeUsers) {
      try {
        // Calculate Undocumented Intensity for this user
        const intensityReport = await calculateUndocumentedIntensity(user.accountId, sixMonthsAgo);
        
        if (intensityReport.undocumentedIntensityScore > 0) {
          reports.push(intensityReport);
          
          // Log notification for high-risk departing developers
          if (intensityReport.riskLevel === 'CRITICAL' || intensityReport.riskLevel === 'HIGH') {
            logKnowledgeGapNotification(user, intensityReport);
          }
        }
      } catch (userError) {
        console.error(`Error processing user ${user.accountId}:`, userError.message);
      }
    }
    
    console.log(`Legacy Detector scan completed. Found ${reports.length} departing developers with high Undocumented Intensity.`);
    
    return {
      success: true,
      reports,
      summary: {
        totalUsersScanned: activeUsers.length,
        usersWithGaps: reports.length,
        criticalRiskUsers: reports.filter(r => r.riskLevel === 'CRITICAL').length,
        highRiskUsers: reports.filter(r => r.riskLevel === 'HIGH').length
      }
    };
    
  } catch (error) {
    console.error('Error in Legacy Detector scanLastSixMonths:', error.message);
    return {
      success: false,
      error: error.message,
      reports: []
    };
  }
}

/**
 * Get active users from Jira with strict 6-month constraint
 * @param {Date} sixMonthsAgo - Date representing 6 months ago
 * @returns {Promise<Array>} Array of active users
 */
async function getActiveUsersLastSixMonths(sixMonthsAgo) {
  try {
    // Search for issues updated in last 6 months only
    const jql = `updated >= "${sixMonthsAgo.toISOString().split('T')[0]}" ORDER BY updated DESC`;
    const response = await api.asApp().requestJira(`/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=100`);
    
    if (!response.data || !response.data.issues) {
      return [];
    }
    
    // Extract unique assignees
    const userMap = new Map();
    response.data.issues.forEach(issue => {
      if (issue.fields.assignee && issue.fields.assignee.accountId) {
        userMap.set(issue.fields.assignee.accountId, {
          accountId: issue.fields.assignee.accountId,
          displayName: issue.fields.assignee.displayName || 'Unknown User'
        });
      }
    });
    
    return Array.from(userMap.values());
    
  } catch (error) {
    console.error('Error getting active users for last 6 months:', error.message);
    return [];
  }
}

/**
 * Calculate Undocumented Intensity using the formula: (High Complexity PRs + Critical Jira Tickets) / (Documentation Links)
 * @param {string} userId - User account ID
 * @param {Date} sixMonthsAgo - Date representing 6 months ago
 * @returns {Promise<UndocumentedIntensityReport>} Undocumented intensity report
 */
async function calculateUndocumentedIntensity(userId, sixMonthsAgo) {
  try {
    // Get critical Jira tickets (high activity, low documentation) for last 6 months
    const criticalTickets = await identifyCriticalTickets(userId, sixMonthsAgo);
    
    // For now, simulate high complexity PRs (Bitbucket integration will be added in task 2)
    const highComplexityPRs = await identifyHighComplexityPRs(userId, sixMonthsAgo);
    
    // Find documentation links across all artifacts
    const documentationLinks = await findDocumentationLinks(criticalTickets, highComplexityPRs);
    
    // Calculate Undocumented Intensity Score
    const numerator = highComplexityPRs.length + criticalTickets.length;
    const denominator = Math.max(documentationLinks.length, 1); // Avoid division by zero
    const undocumentedIntensityScore = numerator / denominator;
    
    // Determine risk level based on score
    let riskLevel = 'LOW';
    if (undocumentedIntensityScore >= 5) riskLevel = 'CRITICAL';
    else if (undocumentedIntensityScore >= 3) riskLevel = 'HIGH';
    else if (undocumentedIntensityScore >= 1.5) riskLevel = 'MEDIUM';
    
    // Generate specific artifacts for forensic questioning
    const specificArtifacts = [
      ...criticalTickets.map(ticket => `JIRA-${ticket.key}`),
      ...highComplexityPRs.map(pr => `PR #${pr.id}`)
    ];
    
    return new UndocumentedIntensityReport({
      userId,
      timeframe: '6_MONTHS',
      highComplexityPRs,
      criticalJiraTickets: criticalTickets,
      documentationLinks,
      undocumentedIntensityScore,
      specificArtifacts,
      riskLevel
    });
    
  } catch (error) {
    console.error(`Error calculating Undocumented Intensity for user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Identify critical Jira tickets (high activity, low documentation) for a specific user within 6-month constraint
 * @param {string} userId - User account ID
 * @param {Date} sixMonthsAgo - Date representing 6 months ago
 * @returns {Promise<JiraTicket[]>} Array of critical tickets
 */
async function identifyCriticalTickets(userId, sixMonthsAgo) {
  try {
    // Search for tickets assigned to this user in the last 6 months with strict date constraint
    const jql = `assignee = "${userId}" AND updated >= "${sixMonthsAgo.toISOString().split('T')[0]}" ORDER BY updated DESC`;
    const response = await api.asApp().requestJira(`/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=50&expand=changelog`);
    
    if (!response.data || !response.data.issues) {
      return [];
    }
    
    const criticalTickets = [];
    
    for (const issue of response.data.issues) {
      // Enforce 6-month constraint at data level
      const updatedDate = new Date(issue.fields.updated);
      if (updatedDate < sixMonthsAgo) {
        continue; // Skip tickets older than 6 months
      }
      
      const ticket = new JiraTicket({
        id: issue.id,
        key: issue.key,
        summary: issue.fields.summary,
        description: issue.fields.description || '',
        assignee: issue.fields.assignee.accountId,
        status: issue.fields.status.name,
        created: issue.fields.created,
        updated: issue.fields.updated,
        commentCount: issue.fields.comment ? issue.fields.comment.total : 0,
        documentationLinks: extractDocumentationLinks(issue.fields.description || '')
      });
      
      // Consider it critical if high activity but low documentation
      const docRatio = ticket.getDocumentationRatio();
      const isHighActivity = ticket.commentCount > 3 || ticket.summary.length > 50;
      
      if (isHighActivity && docRatio < 0.3) {
        criticalTickets.push(ticket);
      }
    }
    
    return criticalTickets;
    
  } catch (error) {
    console.error(`Error identifying critical tickets for user ${userId}:`, error.message);
    return [];
  }
}

/**
 * Identify high complexity PRs for a user using Bitbucket data with strict 6-month constraint
 * @param {string} userId - User account ID
 * @param {Date} sixMonthsAgo - Date representing 6 months ago
 * @returns {Promise<Array>} Array of high complexity PRs
 */
async function identifyHighComplexityPRs(userId, sixMonthsAgo) {
  try {
    const bitbucketService = require('../services/bitbucketService');
    
    // Get all PRs for the user from last 6 months
    const allPRs = await bitbucketService.getPullRequestsLastSixMonths(userId);
    
    // Filter PRs to enforce strict 6-month constraint at data level
    const filteredPRs = allPRs.filter(pr => {
      const prDate = new Date(pr.created);
      return prDate >= sixMonthsAgo;
    });
    
    // Identify high complexity PRs (complexity score >= 6 out of 10)
    const highComplexityPRs = filteredPRs.filter(pr => {
      return pr.complexityScore >= 6;
    });
    
    console.log(`Found ${highComplexityPRs.length} high complexity PRs for user ${userId} in last 6 months`);
    return highComplexityPRs;
    
  } catch (error) {
    console.error(`Error identifying high complexity PRs for user ${userId}:`, error.message);
    
    // If Bitbucket integration fails, return empty array to maintain algorithm structure
    // This allows the system to continue with Jira-only analysis
    if (error.code === 'PERMISSION_DENIED' || error.code === 'BITBUCKET_API_ERROR') {
      console.warn(`Bitbucket integration unavailable for user ${userId}, continuing with Jira-only analysis`);
      return [];
    }
    
    throw error;
  }
}

/**
 * Find documentation links across all artifacts
 * @param {Array} criticalTickets - Array of critical Jira tickets
 * @param {Array} highComplexityPRs - Array of high complexity PRs
 * @returns {Promise<Array>} Array of documentation links
 */
async function findDocumentationLinks(criticalTickets, highComplexityPRs) {
  const documentationLinks = new Set();
  
  // Extract documentation links from Jira tickets
  criticalTickets.forEach(ticket => {
    ticket.documentationLinks.forEach(link => {
      documentationLinks.add(link);
    });
  });
  
  // Extract documentation links from PRs
  highComplexityPRs.forEach(pr => {
    // Extract documentation links from PR title and description
    const prText = `${pr.title || ''} ${pr.description || ''}`;
    const prDocLinks = extractDocumentationLinks(prText);
    prDocLinks.forEach(link => {
      documentationLinks.add(link);
    });
  });
  
  return Array.from(documentationLinks);
}

/**
 * Calculate overall documentation ratio for a set of tickets
 * @param {JiraTicket[]} tickets - Array of Jira tickets
 * @returns {number} Average documentation ratio (0-1)
 */
function calculateDocumentationRatio(tickets) {
  if (tickets.length === 0) return 0;
  
  const totalRatio = tickets.reduce((sum, ticket) => {
    return sum + ticket.getDocumentationRatio();
  }, 0);
  
  return totalRatio / tickets.length;
}

/**
 * Extract documentation links from ticket description
 * @param {string} description - Ticket description
 * @returns {string[]} Array of documentation links
 */
function extractDocumentationLinks(description) {
  if (!description) return [];
  
  // Simple regex to find URLs that might be documentation
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = description.match(urlRegex) || [];
  
  // Filter for likely documentation URLs
  return urls.filter(url => {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('confluence') || 
           lowerUrl.includes('wiki') || 
           lowerUrl.includes('docs') ||
           lowerUrl.includes('documentation');
  });
}

/**
 * Generate recommended actions based on risk level and ticket count
 * @param {string} riskLevel - Risk level (HIGH, MEDIUM, LOW)
 * @param {number} ticketCount - Number of zombie tickets
 * @returns {string[]} Array of recommended actions
 */
function generateRecommendedActions(riskLevel, ticketCount) {
  const actions = [];
  
  if (riskLevel === 'HIGH') {
    actions.push('Schedule immediate knowledge transfer session');
    actions.push('Prioritize documentation of critical processes');
    actions.push('Assign backup team members to shadow work');
  } else if (riskLevel === 'MEDIUM') {
    actions.push('Plan knowledge sharing sessions');
    actions.push('Create documentation templates');
    actions.push('Set up regular check-ins');
  } else {
    actions.push('Encourage documentation best practices');
    actions.push('Provide documentation training');
  }
  
  if (ticketCount > 10) {
    actions.push('Consider workload redistribution');
  }
  
  return actions;
}

/**
 * Log notification for detected Undocumented Intensity (simulates Slack/email notification)
 * @param {Object} user - User object
 * @param {UndocumentedIntensityReport} report - Undocumented intensity report
 */
function logKnowledgeGapNotification(user, report) {
  const notification = {
    type: 'UNDOCUMENTED_INTENSITY_DETECTED',
    timestamp: new Date().toISOString(),
    user: {
      accountId: user.accountId,
      displayName: user.displayName
    },
    riskLevel: report.riskLevel,
    undocumentedIntensityScore: report.undocumentedIntensityScore,
    criticalTickets: report.criticalJiraTickets.length,
    highComplexityPRs: report.highComplexityPRs.length,
    documentationLinks: report.documentationLinks.length,
    specificArtifacts: report.specificArtifacts,
    message: `High Undocumented Intensity detected for ${user.displayName}: Score ${report.undocumentedIntensityScore.toFixed(2)} (${report.criticalJiraTickets.length} critical tickets + ${report.highComplexityPRs.length} complex PRs / ${report.documentationLinks.length} docs)`,
    recommendedActions: generateRecommendedActions(report.riskLevel, report.criticalJiraTickets.length)
  };
  
  // In a real implementation, this would send to Slack/email
  console.log('📢 LEGACY KEEPER NOTIFICATION:', JSON.stringify(notification, null, 2));
  
  // Simulate organizational outreach for cognitive offboarding
  console.log(`🔔 Simulated notification sent to HR and team leads about ${user.displayName}'s high Undocumented Intensity - cognitive offboarding recommended.`);
}

module.exports = {
  scanLastSixMonths,
  calculateUndocumentedIntensity,
  identifyCriticalTickets,
  identifyHighComplexityPRs,
  findDocumentationLinks,
  calculateDocumentationRatio,
  extractDocumentationLinks,
  generateRecommendedActions,
  logKnowledgeGapNotification
};