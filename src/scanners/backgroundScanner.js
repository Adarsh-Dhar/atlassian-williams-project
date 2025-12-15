const api = require('@forge/api');
const { JiraTicket, KnowledgeGapReport } = require('../models');

/**
 * Background Scanner - Identifies knowledge gaps by analyzing Jira work activity
 */

/**
 * Main scanner function that analyzes Jira work activity to identify knowledge gaps
 * @param {Object} req - Forge request object
 * @returns {Promise<KnowledgeGapReport[]>} Array of knowledge gap reports
 */
async function scanForGaps(req) {
  try {
    console.log('Starting knowledge gap scan...');
    
    // Get all users with recent activity
    const activeUsers = await getActiveUsers();
    console.log(`Found ${activeUsers.length} active users`);
    
    const reports = [];
    
    for (const user of activeUsers) {
      try {
        // Identify zombie tickets for this user
        const zombieTickets = await identifyZombieTickets(user.accountId);
        
        if (zombieTickets.length > 0) {
          // Calculate documentation ratio
          const documentationRatio = calculateDocumentationRatio(zombieTickets);
          
          // Determine risk level
          const riskLevel = KnowledgeGapReport.calculateRiskLevel(
            zombieTickets.length, 
            documentationRatio
          );
          
          // Create knowledge gap report
          const report = new KnowledgeGapReport({
            userId: user.accountId,
            ticketCount: zombieTickets.length,
            documentationRatio,
            riskLevel,
            recommendedActions: generateRecommendedActions(riskLevel, zombieTickets.length)
          });
          
          reports.push(report);
          
          // Log notification for detected knowledge gaps
          if (zombieTickets.length > 5) {
            logKnowledgeGapNotification(user, report);
          }
        }
      } catch (userError) {
        console.error(`Error processing user ${user.accountId}:`, userError.message);
      }
    }
    
    console.log(`Knowledge gap scan completed. Found ${reports.length} users with potential knowledge gaps.`);
    
    return {
      success: true,
      reports,
      summary: {
        totalUsersScanned: activeUsers.length,
        usersWithGaps: reports.length,
        highRiskUsers: reports.filter(r => r.riskLevel === 'HIGH').length
      }
    };
    
  } catch (error) {
    console.error('Error in scanForGaps:', error.message);
    return {
      success: false,
      error: error.message,
      reports: []
    };
  }
}

/**
 * Get active users from Jira
 * @returns {Promise<Array>} Array of active users
 */
async function getActiveUsers() {
  try {
    // Search for recently updated issues to find active users
    const jql = 'updated >= -30d ORDER BY updated DESC';
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
    console.error('Error getting active users:', error.message);
    return [];
  }
}

/**
 * Identify zombie tickets (high activity, low documentation) for a specific user
 * @param {string} userId - User account ID
 * @returns {Promise<JiraTicket[]>} Array of zombie tickets
 */
async function identifyZombieTickets(userId) {
  try {
    // Search for tickets assigned to this user in the last 6 months
    const jql = `assignee = "${userId}" AND updated >= -180d ORDER BY updated DESC`;
    const response = await api.asApp().requestJira(`/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=50&expand=changelog`);
    
    if (!response.data || !response.data.issues) {
      return [];
    }
    
    const zombieTickets = [];
    
    for (const issue of response.data.issues) {
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
      
      // Consider it a zombie ticket if documentation ratio is low
      const docRatio = ticket.getDocumentationRatio();
      if (docRatio < 0.4) {
        zombieTickets.push(ticket);
      }
    }
    
    return zombieTickets;
    
  } catch (error) {
    console.error(`Error identifying zombie tickets for user ${userId}:`, error.message);
    return [];
  }
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
 * Log notification for detected knowledge gaps (simulates Slack/email notification)
 * @param {Object} user - User object
 * @param {KnowledgeGapReport} report - Knowledge gap report
 */
function logKnowledgeGapNotification(user, report) {
  const notification = {
    type: 'KNOWLEDGE_GAP_DETECTED',
    timestamp: new Date().toISOString(),
    user: {
      accountId: user.accountId,
      displayName: user.displayName
    },
    riskLevel: report.riskLevel,
    ticketCount: report.ticketCount,
    documentationRatio: report.documentationRatio,
    message: `Knowledge gap detected for ${user.displayName}: ${report.ticketCount} underdocumented tickets (${Math.round(report.documentationRatio * 100)}% documentation ratio)`,
    recommendedActions: report.recommendedActions
  };
  
  // In a real implementation, this would send to Slack/email
  console.log('📢 NOTIFICATION:', JSON.stringify(notification, null, 2));
  
  // Simulate organizational outreach
  console.log(`🔔 Simulated notification sent to HR and team leads about ${user.displayName}'s knowledge gap risk.`);
}

module.exports = {
  scanForGaps,
  identifyZombieTickets,
  calculateDocumentationRatio,
  extractDocumentationLinks,
  generateRecommendedActions,
  logKnowledgeGapNotification
};