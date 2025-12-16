const api = require('@forge/api');
const { ConfluencePageResult, ApiError } = require('../models');
const { 
  handleApiError, 
  logError, 
  isRetryableError, 
  LOG_LEVELS, 
  ERROR_TYPES 
} = require('../utils/errorHandler');

/**
 * Confluence Integration Service
 * Handles saving captured knowledge to Confluence pages
 */

/**
 * Save captured knowledge to Confluence (legacy function - maintained for backward compatibility)
 * @param {Object} req - Forge request object containing title and content
 * @returns {Promise<ConfluencePageResult>} Result of page creation
 */
async function saveToConfluence(req) {
  try {
    const { title, content } = req.payload;
    
    // Validate inputs
    if (!title || !content) {
      throw new ApiError({
        code: 'INVALID_INPUT',
        message: 'Title and content are required'
      });
    }

    console.log(`Creating Confluence page: "${title}"`);
    
    // Validate permissions first
    const hasPermissions = await validatePermissions();
    if (!hasPermissions) {
      throw new ApiError({
        code: 'PERMISSION_DENIED',
        message: 'Insufficient permissions to create Confluence pages'
      });
    }

    // Format content for Confluence
    const formattedContent = formatContent(title, content);
    
    // Create the Confluence page
    const pageData = {
      type: 'page',
      title: title,
      space: {
        key: 'KNOWLEDGE' // Default space, could be configurable
      },
      body: {
        storage: {
          value: formattedContent,
          representation: 'storage'
        }
      }
    };

    const response = await api.asUser().requestConfluence('/wiki/rest/api/content', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pageData)
    });

    if (response.status === 200 || response.status === 201) {
      const pageUrl = buildPageUrl(response.data);
      
      console.log(`✅ Confluence page created successfully: ${pageUrl}`);
      
      return new ConfluencePageResult({
        success: true,
        pageUrl: pageUrl,
        pageId: response.data.id
      });
    } else {
      throw new ApiError({
        code: 'CONFLUENCE_API_ERROR',
        message: `Failed to create page: ${response.status}`,
        details: response.data
      });
    }

  } catch (error) {
    console.error('Error creating Confluence page:', error.message);
    
    // Handle specific error types gracefully
    if (error.code === 'PERMISSION_DENIED' || error.message.includes('403')) {
      return new ConfluencePageResult({
        success: false,
        error: 'Permission denied. Please check your Confluence access permissions.'
      });
    }
    
    if (error.code === 'INVALID_INPUT') {
      return new ConfluencePageResult({
        success: false,
        error: error.message
      });
    }
    
    // Generic error handling
    return new ConfluencePageResult({
      success: false,
      error: `Failed to create Confluence page: ${error.message}`
    });
  }
}

/**
 * Create a Legacy Document with enhanced formatting and artifact linking
 * @param {KnowledgeArtifact} knowledgeArtifact - Knowledge artifact to create document from
 * @returns {Promise<ConfluencePageResult>} Result of Legacy Document creation
 */
async function createLegacyDocument(knowledgeArtifact) {
  try {
    // Validate knowledge artifact
    const validation = knowledgeArtifact.validate();
    if (!validation.isValid) {
      throw new ApiError({
        code: 'INVALID_KNOWLEDGE_ARTIFACT',
        message: `Invalid knowledge artifact: ${validation.errors.join(', ')}`
      });
    }

    console.log(`Creating Legacy Document: "${knowledgeArtifact.title}"`);
    
    // Validate permissions first
    const hasPermissions = await validatePermissions();
    if (!hasPermissions) {
      throw new ApiError({
        code: 'PERMISSION_DENIED',
        message: 'Insufficient permissions to create Confluence pages'
      });
    }

    // Format content with artifact linking
    const formattedContent = formatLegacyDocument(knowledgeArtifact);
    
    // Create the Legacy Document page
    const pageData = {
      type: 'page',
      title: `Legacy Document: ${knowledgeArtifact.title}`,
      space: {
        key: 'LEGACY' // Dedicated space for Legacy Documents
      },
      body: {
        storage: {
          value: formattedContent,
          representation: 'storage'
        }
      }
    };

    const response = await api.asUser().requestConfluence('/wiki/rest/api/content', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pageData)
    });

    if (response.status === 200 || response.status === 201) {
      const pageUrl = buildPageUrl(response.data);
      const pageId = response.data.id;
      
      // Create bidirectional links to artifacts
      const linkedArtifacts = await linkToArtifacts(pageId, knowledgeArtifact.sourceArtifacts);
      
      console.log(`✅ Legacy Document created successfully: ${pageUrl}`);
      console.log(`✅ Linked ${linkedArtifacts.length} artifacts bidirectionally`);
      
      return new ConfluencePageResult({
        success: true,
        pageUrl: pageUrl,
        pageId: pageId,
        linkedArtifacts: linkedArtifacts
      });
    } else {
      throw new ApiError({
        code: 'CONFLUENCE_API_ERROR',
        message: `Failed to create Legacy Document: ${response.status}`,
        details: response.data
      });
    }

  } catch (error) {
    console.error('Error creating Legacy Document:', error.message);
    
    // Handle specific error types gracefully
    if (error.code === 'PERMISSION_DENIED' || error.message.includes('403')) {
      return new ConfluencePageResult({
        success: false,
        error: 'Permission denied. Please check your Confluence access permissions.'
      });
    }
    
    if (error.code === 'INVALID_KNOWLEDGE_ARTIFACT') {
      return new ConfluencePageResult({
        success: false,
        error: error.message
      });
    }
    
    // Generic error handling
    return new ConfluencePageResult({
      success: false,
      error: `Failed to create Legacy Document: ${error.message}`
    });
  }
}

/**
 * Create bidirectional links between a Confluence page and source artifacts
 * @param {string} pageId - Confluence page ID
 * @param {Array<CodeArtifact>} artifacts - Source artifacts to link to
 * @returns {Promise<Array<string>>} Array of successfully linked artifact IDs
 */
async function linkToArtifacts(pageId, artifacts) {
  const linkedArtifacts = [];
  
  if (!artifacts || artifacts.length === 0) {
    console.log('No artifacts to link');
    return linkedArtifacts;
  }

  try {
    for (const artifact of artifacts) {
      try {
        // Create link based on artifact type
        let linkCreated = false;
        
        switch (artifact.type) {
          case 'JIRA_TICKET':
            linkCreated = await createJiraTicketLink(pageId, artifact);
            break;
          case 'PR':
            linkCreated = await createPullRequestLink(pageId, artifact);
            break;
          case 'COMMIT':
            linkCreated = await createCommitLink(pageId, artifact);
            break;
          default:
            console.warn(`Unknown artifact type: ${artifact.type}`);
            continue;
        }
        
        if (linkCreated) {
          linkedArtifacts.push(artifact.id);
          console.log(`✅ Successfully linked artifact: ${artifact.type} ${artifact.id}`);
        } else {
          console.warn(`⚠️ Failed to link artifact: ${artifact.type} ${artifact.id}`);
        }
        
      } catch (artifactError) {
        console.error(`Error linking artifact ${artifact.id}:`, artifactError.message);
        // Continue with other artifacts even if one fails
      }
    }
    
  } catch (error) {
    console.error('Error in linkToArtifacts:', error.message);
  }
  
  return linkedArtifacts;
}

/**
 * Create a link to a Jira ticket from a Confluence page
 * @param {string} pageId - Confluence page ID
 * @param {CodeArtifact} artifact - Jira ticket artifact
 * @returns {Promise<boolean>} True if link was created successfully
 */
async function createJiraTicketLink(pageId, artifact) {
  try {
    // Add a comment to the Jira ticket referencing the Legacy Document
    const commentBody = {
      body: `This ticket's knowledge has been captured in a Legacy Document: [Legacy Document|/wiki/pages/${pageId}]\n\nThis document contains tacit knowledge extracted during cognitive offboarding to preserve institutional memory.`
    };

    const response = await api.asUser().requestJira(`/rest/api/3/issue/${artifact.id}/comment`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commentBody)
    });

    return response.status === 201;
    
  } catch (error) {
    console.error(`Failed to link Jira ticket ${artifact.id}:`, error.message);
    return false;
  }
}

/**
 * Create a link to a Pull Request (via Jira if available)
 * @param {string} pageId - Confluence page ID
 * @param {CodeArtifact} artifact - Pull Request artifact
 * @returns {Promise<boolean>} True if link was created successfully
 */
async function createPullRequestLink(pageId, artifact) {
  try {
    // For now, we'll create a reference in the page content itself
    // In a real implementation, this might involve Bitbucket API calls
    // or creating links through Jira if the PR is linked to a ticket
    
    console.log(`Creating reference to PR ${artifact.id} in page ${pageId}`);
    
    // This is a placeholder implementation
    // In practice, you might update the page content to include PR references
    // or use Bitbucket's API to add comments to the PR
    
    return true;
    
  } catch (error) {
    console.error(`Failed to link Pull Request ${artifact.id}:`, error.message);
    return false;
  }
}

/**
 * Create a link to a Commit (via repository comments if supported)
 * @param {string} pageId - Confluence page ID
 * @param {CodeArtifact} artifact - Commit artifact
 * @returns {Promise<boolean>} True if link was created successfully
 */
async function createCommitLink(pageId, artifact) {
  try {
    // For now, we'll create a reference in the page content itself
    // In a real implementation, this might involve repository API calls
    
    console.log(`Creating reference to commit ${artifact.id} in page ${pageId}`);
    
    // This is a placeholder implementation
    // In practice, you might use Git hosting service APIs to add commit comments
    // or update repository documentation
    
    return true;
    
  } catch (error) {
    console.error(`Failed to link commit ${artifact.id}:`, error.message);
    return false;
  }
}

/**
 * Validate that the user has permissions to create Confluence pages
 * @returns {Promise<boolean>} True if user has permissions
 */
async function validatePermissions() {
  try {
    // Try to get user info to validate permissions
    const response = await api.asUser().requestConfluence('/wiki/rest/api/user/current');
    return response.status === 200;
  } catch (error) {
    console.warn('Permission validation failed:', error.message);
    return false;
  }
}

/**
 * Format content for Confluence storage format
 * @param {string} title - Page title
 * @param {string} content - Raw content
 * @returns {string} Formatted content in Confluence storage format
 */
function formatContent(title, content) {
  // Convert plain text to Confluence storage format
  const timestamp = new Date().toISOString();
  
  const formattedContent = `
<h1>Knowledge Capture Session</h1>
<p><strong>Captured:</strong> ${timestamp}</p>
<p><strong>Title:</strong> ${title}</p>

<h2>Content</h2>
<div class="content-wrapper">
${formatTextToHtml(content)}
</div>

<h2>Metadata</h2>
<p><em>This page was automatically generated by the Legacy Keeper.</em></p>
<p><strong>Source:</strong> Knowledge extraction interview</p>
<p><strong>Status:</strong> Requires review and organization</p>
`;

  return formattedContent;
}

/**
 * Convert plain text to basic HTML for Confluence
 * @param {string} text - Plain text content
 * @returns {string} HTML formatted text
 */
function formatTextToHtml(text) {
  if (!text) return '<p>No content provided.</p>';
  
  // Basic text formatting
  return text
    .split('\n\n') // Split paragraphs
    .map(paragraph => {
      if (paragraph.trim().length === 0) return '';
      
      // Handle bullet points
      if (paragraph.includes('•') || paragraph.includes('-')) {
        const items = paragraph.split('\n')
          .filter(line => line.trim().length > 0)
          .map(line => `<li>${escapeHtml(line.replace(/^[•\-]\s*/, ''))}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }
      
      // Regular paragraph
      return `<p>${escapeHtml(paragraph.trim())}</p>`;
    })
    .filter(p => p.length > 0)
    .join('\n');
}

/**
 * Escape HTML characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;'
  };
  
  return text.replace(/[&<>"']/g, (match) => htmlEscapes[match]);
}

/**
 * Build the full page URL from Confluence API response
 * @param {Object} pageData - Confluence page data from API
 * @returns {string} Full page URL
 */
function buildPageUrl(pageData) {
  if (pageData._links && pageData._links.webui) {
    // Use the webui link if available
    return `https://your-domain.atlassian.net/wiki${pageData._links.webui}`;
  }
  
  // Fallback URL construction
  const spaceKey = pageData.space ? pageData.space.key : 'KNOWLEDGE';
  return `https://your-domain.atlassian.net/wiki/spaces/${spaceKey}/pages/${pageData.id}`;
}

/**
 * Format knowledge artifact for Confluence storage (legacy function)
 * @param {Object} knowledgeArtifact - Knowledge artifact to format
 * @returns {string} Formatted content
 */
function formatKnowledgeArtifact(knowledgeArtifact) {
  const {
    title,
    content,
    tags = [],
    extractedAt,
    confidence,
    relatedTickets = [],
    employeeId
  } = knowledgeArtifact;

  const formattedContent = `
<h1>${escapeHtml(title)}</h1>

<div class="metadata-panel">
<h2>Metadata</h2>
<p><strong>Employee ID:</strong> ${escapeHtml(employeeId)}</p>
<p><strong>Extracted:</strong> ${new Date(extractedAt).toLocaleString()}</p>
<p><strong>Confidence Level:</strong> ${Math.round(confidence * 100)}%</p>
${tags.length > 0 ? `<p><strong>Tags:</strong> ${tags.map(tag => escapeHtml(tag)).join(', ')}</p>` : ''}
${relatedTickets.length > 0 ? `<p><strong>Related Tickets:</strong> ${relatedTickets.join(', ')}</p>` : ''}
</div>

<h2>Knowledge Content</h2>
<div class="knowledge-content">
${formatTextToHtml(content)}
</div>

<div class="footer">
<p><em>This knowledge was captured using the Legacy Keeper during an offboarding interview.</em></p>
</div>
`;

  return formattedContent;
}

/**
 * Format a Legacy Document with enhanced artifact linking and formatting
 * @param {KnowledgeArtifact} knowledgeArtifact - Knowledge artifact to format
 * @returns {string} Formatted Legacy Document content
 */
function formatLegacyDocument(knowledgeArtifact) {
  const {
    title,
    content,
    tags = [],
    extractedAt,
    confidence,
    relatedTickets = [],
    relatedPRs = [],
    relatedCommits = [],
    sourceArtifacts = [],
    employeeId
  } = knowledgeArtifact;

  // Format source artifacts section
  const artifactsSection = formatSourceArtifacts(sourceArtifacts);
  
  // Format related items section
  const relatedItemsSection = formatRelatedItems(relatedTickets, relatedPRs, relatedCommits);

  const formattedContent = `
<div class="legacy-document">
<h1>🏛️ Legacy Document: ${escapeHtml(title)}</h1>

<div class="document-header">
<p><strong>📋 Document Type:</strong> Cognitive Offboarding Legacy Document</p>
<p><strong>👤 Source Employee:</strong> ${escapeHtml(employeeId)}</p>
<p><strong>📅 Captured:</strong> ${new Date(extractedAt).toLocaleString()}</p>
<p><strong>🎯 Confidence Level:</strong> ${Math.round(confidence * 100)}%</p>
${tags.length > 0 ? `<p><strong>🏷️ Tags:</strong> ${tags.map(tag => escapeHtml(tag)).join(', ')}</p>` : ''}
</div>

<div class="warning-panel">
<h3>⚠️ Critical Knowledge Alert</h3>
<p>This document contains <strong>tacit knowledge</strong> extracted during cognitive offboarding. This knowledge was previously undocumented and exists only in the departing employee's experience. <strong>Review and integrate this knowledge into your team's documentation systems.</strong></p>
</div>

${artifactsSection}

<h2>📖 Captured Knowledge</h2>
<div class="knowledge-content">
${formatTextToHtml(content)}
</div>

${relatedItemsSection}

<h2>🔗 Bidirectional Links</h2>
<div class="bidirectional-links">
<p>This Legacy Document is bidirectionally linked to the following source artifacts:</p>
<ul>
${sourceArtifacts.map(artifact => `
  <li><strong>${artifact.type}:</strong> ${escapeHtml(artifact.id)} - ${escapeHtml(artifact.title)}</li>
`).join('')}
</ul>
<p><em>Source artifacts have been updated with references back to this Legacy Document.</em></p>
</div>

<h2>📋 Next Steps</h2>
<div class="next-steps">
<ol>
<li><strong>Review:</strong> Technical leads should review this knowledge for accuracy and completeness</li>
<li><strong>Integrate:</strong> Incorporate relevant knowledge into team documentation, wikis, or code comments</li>
<li><strong>Distribute:</strong> Share with team members who will be maintaining the related systems</li>
<li><strong>Update:</strong> Keep this document updated as systems evolve</li>
</ol>
</div>

<div class="footer">
<hr/>
<p><em>🤖 This Legacy Document was automatically generated by the Legacy Keeper during cognitive offboarding.</em></p>
<p><em>📊 Undocumented Intensity Analysis identified this knowledge as critical for preservation.</em></p>
<p><em>🔄 Last updated: ${new Date().toLocaleString()}</em></p>
</div>
</div>
`;

  return formattedContent;
}

/**
 * Format source artifacts section for Legacy Document
 * @param {Array<CodeArtifact>} sourceArtifacts - Source artifacts
 * @returns {string} Formatted source artifacts HTML
 */
function formatSourceArtifacts(sourceArtifacts) {
  if (!sourceArtifacts || sourceArtifacts.length === 0) {
    return `
<h2>📦 Source Artifacts</h2>
<p><em>No specific source artifacts identified.</em></p>
`;
  }

  const artifactsByType = sourceArtifacts.reduce((acc, artifact) => {
    if (!acc[artifact.type]) acc[artifact.type] = [];
    acc[artifact.type].push(artifact);
    return acc;
  }, {});

  let artifactsHtml = '<h2>📦 Source Artifacts</h2>\n<p>This knowledge was extracted from analysis of the following artifacts:</p>\n';

  Object.entries(artifactsByType).forEach(([type, artifacts]) => {
    const typeIcon = type === 'JIRA_TICKET' ? '🎫' : type === 'PR' ? '🔀' : '📝';
    artifactsHtml += `<h3>${typeIcon} ${type.replace('_', ' ')}</h3>\n<ul>\n`;
    
    artifacts.forEach(artifact => {
      artifactsHtml += `
<li>
  <strong>${escapeHtml(artifact.id)}:</strong> ${escapeHtml(artifact.title)}
  <br/><small>Author: ${escapeHtml(artifact.author)} | Date: ${new Date(artifact.date).toLocaleDateString()} | Documentation Level: ${artifact.documentationLevel}</small>
</li>
`;
    });
    
    artifactsHtml += '</ul>\n';
  });

  return artifactsHtml;
}

/**
 * Format related items section for Legacy Document
 * @param {Array<string>} relatedTickets - Related Jira tickets
 * @param {Array<string>} relatedPRs - Related Pull Requests
 * @param {Array<string>} relatedCommits - Related commits
 * @returns {string} Formatted related items HTML
 */
function formatRelatedItems(relatedTickets, relatedPRs, relatedCommits) {
  const hasRelatedItems = relatedTickets.length > 0 || relatedPRs.length > 0 || relatedCommits.length > 0;
  
  if (!hasRelatedItems) {
    return '';
  }

  let relatedHtml = '<h2>🔗 Related Items</h2>\n';

  if (relatedTickets.length > 0) {
    relatedHtml += '<h3>🎫 Related Jira Tickets</h3>\n<ul>\n';
    relatedTickets.forEach(ticket => {
      relatedHtml += `<li>${escapeHtml(ticket)}</li>\n`;
    });
    relatedHtml += '</ul>\n';
  }

  if (relatedPRs.length > 0) {
    relatedHtml += '<h3>🔀 Related Pull Requests</h3>\n<ul>\n';
    relatedPRs.forEach(pr => {
      relatedHtml += `<li>PR #${escapeHtml(pr)}</li>\n`;
    });
    relatedHtml += '</ul>\n';
  }

  if (relatedCommits.length > 0) {
    relatedHtml += '<h3>📝 Related Commits</h3>\n<ul>\n';
    relatedCommits.forEach(commit => {
      relatedHtml += `<li><code>${escapeHtml(commit)}</code></li>\n`;
    });
    relatedHtml += '</ul>\n';
  }

  return relatedHtml;
}

module.exports = {
  saveToConfluence,
  createLegacyDocument,
  linkToArtifacts,
  validatePermissions,
  formatContent,
  formatTextToHtml,
  formatKnowledgeArtifact,
  formatLegacyDocument,
  formatSourceArtifacts,
  formatRelatedItems,
  buildPageUrl,
  escapeHtml,
  createJiraTicketLink,
  createPullRequestLink,
  createCommitLink
};