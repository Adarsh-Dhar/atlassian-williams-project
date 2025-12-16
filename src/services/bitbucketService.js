const api = require('@forge/api');
const { ApiError } = require('../models');
const { 
  handleApiError, 
  logError, 
  isRetryableError, 
  LOG_LEVELS, 
  ERROR_TYPES 
} = require('../utils/errorHandler');

/**
 * Bitbucket Integration Service
 * Handles integration with Bitbucket API for analyzing developer activity
 */

/**
 * Get Pull Requests from the last 6 months for a specific user
 * @param {string} userId - User account ID
 * @returns {Promise<BitbucketPR[]>} Array of pull requests from last 6 months
 */
async function getPullRequestsLastSixMonths(userId) {
  const context = 'Bitbucket getPullRequestsLastSixMonths';
  
  try {
    if (!userId) {
      const validationError = new ApiError({
        code: 'INVALID_INPUT',
        message: 'User ID is required'
      });
      
      logError({
        context,
        errorType: ERROR_TYPES.VALIDATION_ERROR,
        message: 'Missing required userId parameter',
        artifactType: 'USER',
        apiService: 'bitbucket'
      }, LOG_LEVELS.WARN);
      
      throw validationError;
    }

    logError({
      context,
      message: `Fetching pull requests for user: ${userId} (last 6 months)`,
      artifactId: userId,
      artifactType: 'USER',
      apiService: 'bitbucket'
    }, LOG_LEVELS.INFO);
    
    // Calculate 6 months ago date
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const dateFilter = sixMonthsAgo.toISOString().split('T')[0];

    // Bitbucket API query for PRs by user in last 6 months
    const query = `author.uuid="${userId}" AND created_on>=${dateFilter}`;
    
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        response = await api.asApp().requestBitbucket('/2.0/pullrequests', {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          params: {
            q: query,
            sort: '-created_on',
            pagelen: 100
          }
        });
        break; // Success, exit retry loop
        
      } catch (apiError) {
        retryCount++;
        
        // Log the API error with artifact context
        logError({
          context: `${context} - API Call Attempt ${retryCount}`,
          errorType: ERROR_TYPES.API_ERROR,
          message: `Bitbucket API error: ${apiError.message}`,
          artifactId: userId,
          artifactType: 'USER',
          apiService: 'bitbucket',
          retryAttempt: retryCount
        }, LOG_LEVELS.ERROR);
        
        // Check if error is retryable
        if (retryCount >= maxRetries || !isRetryableError(apiError)) {
          throw apiError;
        }
        
        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Handle response errors
    if (!response || response.status !== 200) {
      const errorContext = {
        context,
        artifactId: userId,
        artifactType: 'USER',
        apiService: 'bitbucket',
        responseStatus: response?.status,
        responseData: response?.data
      };
      
      // Handle specific error codes with enhanced logging
      if (response?.status === 403) {
        logError({
          ...errorContext,
          errorType: ERROR_TYPES.PERMISSION_DENIED,
          message: 'Bitbucket permission denied - insufficient access to pull request data'
        }, LOG_LEVELS.WARN);
        
        throw new ApiError({
          code: 'PERMISSION_DENIED',
          message: 'Insufficient permissions to access Bitbucket data'
        });
      }
      
      if (response?.status === 429) {
        logError({
          ...errorContext,
          errorType: ERROR_TYPES.API_ERROR,
          message: 'Bitbucket rate limit exceeded'
        }, LOG_LEVELS.WARN);
        
        throw new ApiError({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Bitbucket API rate limit exceeded. Please try again later.'
        });
      }
      
      if (response?.status === 404) {
        logError({
          ...errorContext,
          errorType: ERROR_TYPES.API_ERROR,
          message: 'Bitbucket user or repository not found'
        }, LOG_LEVELS.WARN);
        
        throw new ApiError({
          code: 'USER_NOT_FOUND',
          message: 'User not found in Bitbucket'
        });
      }
      
      // Generic API error
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: `Bitbucket API error: ${response?.status || 'Unknown error'}`
      }, LOG_LEVELS.ERROR);
      
      throw new ApiError({
        code: 'BITBUCKET_API_ERROR',
        message: `Failed to fetch pull requests: ${response?.status || 'Unknown error'}`,
        details: response?.data
      });
    }

    const pullRequests = response.data.values || [];
    
    logError({
      context,
      message: `Successfully retrieved ${pullRequests.length} pull requests from Bitbucket`,
      artifactId: userId,
      artifactType: 'USER',
      apiService: 'bitbucket',
      resultCount: pullRequests.length
    }, LOG_LEVELS.INFO);
    
    // Transform API response to our BitbucketPR model with error handling
    const transformedPRs = [];
    for (const pr of pullRequests) {
      try {
        const complexityScore = await calculatePRComplexity(pr);
        
        const transformedPR = {
          id: pr.id.toString(),
          title: pr.title,
          author: pr.author.uuid,
          created: new Date(pr.created_on),
          merged: pr.merge_commit ? new Date(pr.updated_on) : null,
          linesAdded: pr.diff_stats?.lines_added || 0,
          linesDeleted: pr.diff_stats?.lines_removed || 0,
          filesChanged: pr.diff_stats?.files_changed || 0,
          complexityScore: complexityScore,
          reviewComments: pr.comment_count || 0,
          state: pr.state,
          sourceRepository: pr.source?.repository?.name,
          destinationBranch: pr.destination?.branch?.name
        };
        
        transformedPRs.push(transformedPR);
        
      } catch (transformError) {
        // Log transformation error but continue with other PRs
        logError({
          context: `${context} - PR Transformation`,
          errorType: ERROR_TYPES.API_ERROR,
          message: `Failed to transform PR ${pr.id}: ${transformError.message}`,
          artifactId: pr.id?.toString(),
          artifactType: 'PR',
          apiService: 'bitbucket'
        }, LOG_LEVELS.WARN);
        
        // Add PR with default complexity score as fallback
        transformedPRs.push({
          id: pr.id.toString(),
          title: pr.title || 'Unknown Title',
          author: pr.author?.uuid || 'Unknown Author',
          created: new Date(pr.created_on),
          merged: pr.merge_commit ? new Date(pr.updated_on) : null,
          linesAdded: pr.diff_stats?.lines_added || 0,
          linesDeleted: pr.diff_stats?.lines_removed || 0,
          filesChanged: pr.diff_stats?.files_changed || 0,
          complexityScore: 0, // Default fallback
          reviewComments: pr.comment_count || 0,
          state: pr.state || 'UNKNOWN',
          sourceRepository: pr.source?.repository?.name,
          destinationBranch: pr.destination?.branch?.name
        });
      }
    }

    logError({
      context,
      message: `Successfully processed ${transformedPRs.length} pull requests for user ${userId}`,
      artifactId: userId,
      artifactType: 'USER',
      apiService: 'bitbucket',
      processedCount: transformedPRs.length
    }, LOG_LEVELS.INFO);
    
    return transformedPRs;

  } catch (error) {
    // Enhanced error handling with artifact-specific context
    const errorContext = {
      context,
      artifactId: userId,
      artifactType: 'USER',
      apiService: 'bitbucket',
      originalError: {
        name: error.name,
        message: error.message,
        code: error.code
      }
    };
    
    if (error instanceof ApiError) {
      // Log and re-throw ApiError with context
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: `Bitbucket service error: ${error.message}`
      }, LOG_LEVELS.ERROR);
      
      throw error;
    }
    
    // Handle specific Bitbucket API errors with enhanced logging
    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.PERMISSION_DENIED,
        message: 'Bitbucket permission denied during pull request fetch'
      }, LOG_LEVELS.WARN);
      
      throw new ApiError({
        code: 'PERMISSION_DENIED',
        message: 'Insufficient permissions to access Bitbucket data'
      });
    }
    
    if (error.message.includes('429') || error.message.includes('Rate limit')) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: 'Bitbucket rate limit exceeded during pull request fetch'
      }, LOG_LEVELS.WARN);
      
      throw new ApiError({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Bitbucket API rate limit exceeded. Please try again later.'
      });
    }
    
    if (error.message.includes('404')) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: 'Bitbucket user not found during pull request fetch'
      }, LOG_LEVELS.WARN);
      
      throw new ApiError({
        code: 'USER_NOT_FOUND',
        message: 'User not found in Bitbucket'
      });
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.NETWORK_ERROR,
        message: `Bitbucket network error: ${error.message}`
      }, LOG_LEVELS.ERROR);
      
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: 'Unable to connect to Bitbucket. Please check your network connection.'
      });
    }
    
    // Generic error handling
    logError({
      ...errorContext,
      errorType: ERROR_TYPES.UNKNOWN_ERROR,
      message: `Unexpected error during Bitbucket pull request fetch: ${error.message}`
    }, LOG_LEVELS.ERROR);
    
    throw new ApiError({
      code: 'BITBUCKET_API_ERROR',
      message: `Failed to fetch pull requests: ${error.message}`
    });
  }
}

/**
 * Get commit history for a user within a specific timeframe
 * @param {string} userId - User account ID
 * @param {string} timeframe - Timeframe (defaults to '6_MONTHS')
 * @returns {Promise<Commit[]>} Array of commits
 */
async function getCommitHistory(userId, timeframe = '6_MONTHS') {
  const context = 'Bitbucket getCommitHistory';
  
  try {
    if (!userId) {
      const validationError = new ApiError({
        code: 'INVALID_INPUT',
        message: 'User ID is required'
      });
      
      logError({
        context,
        errorType: ERROR_TYPES.VALIDATION_ERROR,
        message: 'Missing required userId parameter for commit history',
        artifactType: 'USER',
        apiService: 'bitbucket'
      }, LOG_LEVELS.WARN);
      
      throw validationError;
    }

    logError({
      context,
      message: `Fetching commit history for user: ${userId} (${timeframe})`,
      artifactId: userId,
      artifactType: 'USER',
      apiService: 'bitbucket',
      timeframe
    }, LOG_LEVELS.INFO);
    
    // Calculate date constraint based on timeframe
    let dateConstraint;
    if (timeframe === '6_MONTHS') {
      dateConstraint = new Date();
      dateConstraint.setMonth(dateConstraint.getMonth() - 6);
    } else {
      logError({
        context,
        errorType: ERROR_TYPES.VALIDATION_ERROR,
        message: `Invalid timeframe specified: ${timeframe}`,
        artifactId: userId,
        artifactType: 'USER',
        apiService: 'bitbucket',
        timeframe
      }, LOG_LEVELS.WARN);
      
      throw new ApiError({
        code: 'INVALID_TIMEFRAME',
        message: 'Only 6_MONTHS timeframe is supported'
      });
    }

    const dateFilter = dateConstraint.toISOString().split('T')[0];
    
    // Query commits by author in the specified timeframe
    const query = `author.raw:"${userId}" AND date>=${dateFilter}`;
    
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        response = await api.asApp().requestBitbucket('/2.0/commits', {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          params: {
            q: query,
            sort: '-date',
            pagelen: 100
          }
        });
        break; // Success, exit retry loop
        
      } catch (apiError) {
        retryCount++;
        
        logError({
          context: `${context} - API Call Attempt ${retryCount}`,
          errorType: ERROR_TYPES.API_ERROR,
          message: `Bitbucket commit API error: ${apiError.message}`,
          artifactId: userId,
          artifactType: 'USER',
          apiService: 'bitbucket',
          retryAttempt: retryCount
        }, LOG_LEVELS.ERROR);
        
        if (retryCount >= maxRetries || !isRetryableError(apiError)) {
          throw apiError;
        }
        
        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Handle response errors with enhanced logging
    if (!response || response.status !== 200) {
      const errorContext = {
        context,
        artifactId: userId,
        artifactType: 'USER',
        apiService: 'bitbucket',
        responseStatus: response?.status,
        timeframe
      };
      
      if (response?.status === 403) {
        logError({
          ...errorContext,
          errorType: ERROR_TYPES.PERMISSION_DENIED,
          message: 'Bitbucket permission denied - insufficient access to commit data'
        }, LOG_LEVELS.WARN);
        
        throw new ApiError({
          code: 'PERMISSION_DENIED',
          message: 'Insufficient permissions to access Bitbucket commit data'
        });
      }
      
      if (response?.status === 429) {
        logError({
          ...errorContext,
          errorType: ERROR_TYPES.API_ERROR,
          message: 'Bitbucket rate limit exceeded for commit history'
        }, LOG_LEVELS.WARN);
        
        throw new ApiError({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Bitbucket API rate limit exceeded. Please try again later.'
        });
      }
      
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: `Bitbucket commit API error: ${response?.status || 'Unknown error'}`
      }, LOG_LEVELS.ERROR);
      
      throw new ApiError({
        code: 'BITBUCKET_API_ERROR',
        message: `Failed to fetch commit history: ${response?.status || 'Unknown error'}`,
        details: response?.data
      });
    }

    const commits = response.data.values || [];
    
    logError({
      context,
      message: `Successfully retrieved ${commits.length} commits from Bitbucket`,
      artifactId: userId,
      artifactType: 'USER',
      apiService: 'bitbucket',
      resultCount: commits.length,
      timeframe
    }, LOG_LEVELS.INFO);
    
    // Transform API response to our Commit model with error handling
    const transformedCommits = [];
    for (const commit of commits) {
      try {
        const transformedCommit = {
          hash: commit.hash,
          message: commit.message,
          author: commit.author.raw,
          date: new Date(commit.date),
          filesChanged: commit.diff_stats?.files || [],
          linesChanged: (commit.diff_stats?.lines_added || 0) + (commit.diff_stats?.lines_removed || 0),
          repository: commit.repository?.name,
          branch: commit.branch?.name
        };
        
        transformedCommits.push(transformedCommit);
        
      } catch (transformError) {
        // Log transformation error but continue with other commits
        logError({
          context: `${context} - Commit Transformation`,
          errorType: ERROR_TYPES.API_ERROR,
          message: `Failed to transform commit ${commit.hash}: ${transformError.message}`,
          artifactId: commit.hash,
          artifactType: 'COMMIT',
          apiService: 'bitbucket'
        }, LOG_LEVELS.WARN);
        
        // Add commit with fallback data
        transformedCommits.push({
          hash: commit.hash || 'unknown',
          message: commit.message || 'Unknown commit message',
          author: commit.author?.raw || 'Unknown author',
          date: commit.date ? new Date(commit.date) : new Date(),
          filesChanged: [],
          linesChanged: 0,
          repository: commit.repository?.name,
          branch: commit.branch?.name
        });
      }
    }

    logError({
      context,
      message: `Successfully processed ${transformedCommits.length} commits for user ${userId}`,
      artifactId: userId,
      artifactType: 'USER',
      apiService: 'bitbucket',
      processedCount: transformedCommits.length,
      timeframe
    }, LOG_LEVELS.INFO);
    
    return transformedCommits;

  } catch (error) {
    // Enhanced error handling with artifact-specific context
    const errorContext = {
      context,
      artifactId: userId,
      artifactType: 'USER',
      apiService: 'bitbucket',
      timeframe,
      originalError: {
        name: error.name,
        message: error.message,
        code: error.code
      }
    };
    
    if (error instanceof ApiError) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: `Bitbucket commit service error: ${error.message}`
      }, LOG_LEVELS.ERROR);
      
      throw error;
    }
    
    // Handle specific errors with enhanced logging
    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.PERMISSION_DENIED,
        message: 'Bitbucket permission denied during commit history fetch'
      }, LOG_LEVELS.WARN);
      
      throw new ApiError({
        code: 'PERMISSION_DENIED',
        message: 'Insufficient permissions to access Bitbucket commit data'
      });
    }
    
    if (error.message.includes('429') || error.message.includes('Rate limit')) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: 'Bitbucket rate limit exceeded during commit history fetch'
      }, LOG_LEVELS.WARN);
      
      throw new ApiError({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Bitbucket API rate limit exceeded. Please try again later.'
      });
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.NETWORK_ERROR,
        message: `Bitbucket network error during commit fetch: ${error.message}`
      }, LOG_LEVELS.ERROR);
      
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: 'Unable to connect to Bitbucket. Please check your network connection.'
      });
    }
    
    // Generic error handling
    logError({
      ...errorContext,
      errorType: ERROR_TYPES.UNKNOWN_ERROR,
      message: `Unexpected error during Bitbucket commit history fetch: ${error.message}`
    }, LOG_LEVELS.ERROR);
    
    throw new ApiError({
      code: 'BITBUCKET_API_ERROR',
      message: `Failed to fetch commit history: ${error.message}`
    });
  }
}

/**
 * Analyze Pull Request complexity and calculate complexity score
 * @param {Object} pr - Pull request data from Bitbucket API
 * @returns {Promise<number>} Complexity score (0-10 scale)
 */
async function analyzePRComplexity(prId) {
  const context = 'Bitbucket analyzePRComplexity';
  
  try {
    if (!prId) {
      const validationError = new ApiError({
        code: 'INVALID_INPUT',
        message: 'Pull Request ID is required'
      });
      
      logError({
        context,
        errorType: ERROR_TYPES.VALIDATION_ERROR,
        message: 'Missing required prId parameter for complexity analysis',
        artifactType: 'PR',
        apiService: 'bitbucket'
      }, LOG_LEVELS.WARN);
      
      throw validationError;
    }

    logError({
      context,
      message: `Analyzing complexity for PR: ${prId}`,
      artifactId: prId,
      artifactType: 'PR',
      apiService: 'bitbucket'
    }, LOG_LEVELS.INFO);
    
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        // Get detailed PR information
        response = await api.asApp().requestBitbucket(`/2.0/pullrequests/${prId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
        break; // Success, exit retry loop
        
      } catch (apiError) {
        retryCount++;
        
        logError({
          context: `${context} - API Call Attempt ${retryCount}`,
          errorType: ERROR_TYPES.API_ERROR,
          message: `Bitbucket PR complexity API error: ${apiError.message}`,
          artifactId: prId,
          artifactType: 'PR',
          apiService: 'bitbucket',
          retryAttempt: retryCount
        }, LOG_LEVELS.ERROR);
        
        if (retryCount >= maxRetries || !isRetryableError(apiError)) {
          throw apiError;
        }
        
        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Handle response errors with enhanced logging
    if (!response || response.status !== 200) {
      const errorContext = {
        context,
        artifactId: prId,
        artifactType: 'PR',
        apiService: 'bitbucket',
        responseStatus: response?.status
      };
      
      if (response?.status === 403) {
        logError({
          ...errorContext,
          errorType: ERROR_TYPES.PERMISSION_DENIED,
          message: 'Bitbucket permission denied - insufficient access to PR details'
        }, LOG_LEVELS.WARN);
        
        throw new ApiError({
          code: 'PERMISSION_DENIED',
          message: 'Insufficient permissions to access Bitbucket PR details'
        });
      }
      
      if (response?.status === 404) {
        logError({
          ...errorContext,
          errorType: ERROR_TYPES.API_ERROR,
          message: 'Bitbucket PR not found for complexity analysis'
        }, LOG_LEVELS.WARN);
        
        throw new ApiError({
          code: 'PR_NOT_FOUND',
          message: 'Pull Request not found in Bitbucket'
        });
      }
      
      if (response?.status === 429) {
        logError({
          ...errorContext,
          errorType: ERROR_TYPES.API_ERROR,
          message: 'Bitbucket rate limit exceeded for PR complexity analysis'
        }, LOG_LEVELS.WARN);
        
        throw new ApiError({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Bitbucket API rate limit exceeded. Please try again later.'
        });
      }
      
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: `Bitbucket PR complexity API error: ${response?.status || 'Unknown error'}`
      }, LOG_LEVELS.ERROR);
      
      throw new ApiError({
        code: 'BITBUCKET_API_ERROR',
        message: `Failed to fetch PR details: ${response?.status || 'Unknown error'}`
      });
    }

    const pr = response.data;
    
    try {
      const complexityScore = await calculatePRComplexity(pr);
      
      logError({
        context,
        message: `Successfully calculated complexity score ${complexityScore} for PR ${prId}`,
        artifactId: prId,
        artifactType: 'PR',
        apiService: 'bitbucket',
        complexityScore
      }, LOG_LEVELS.INFO);
      
      return complexityScore;
      
    } catch (calculationError) {
      // Log calculation error but provide fallback
      logError({
        context: `${context} - Complexity Calculation`,
        errorType: ERROR_TYPES.API_ERROR,
        message: `Failed to calculate complexity for PR ${prId}: ${calculationError.message}`,
        artifactId: prId,
        artifactType: 'PR',
        apiService: 'bitbucket'
      }, LOG_LEVELS.WARN);
      
      // Return default complexity score as fallback
      return 0;
    }

  } catch (error) {
    // Enhanced error handling with artifact-specific context
    const errorContext = {
      context,
      artifactId: prId,
      artifactType: 'PR',
      apiService: 'bitbucket',
      originalError: {
        name: error.name,
        message: error.message,
        code: error.code
      }
    };
    
    if (error instanceof ApiError) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: `Bitbucket PR complexity service error: ${error.message}`
      }, LOG_LEVELS.ERROR);
      
      throw error;
    }
    
    // Handle specific errors with enhanced logging
    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.PERMISSION_DENIED,
        message: 'Bitbucket permission denied during PR complexity analysis'
      }, LOG_LEVELS.WARN);
      
      throw new ApiError({
        code: 'PERMISSION_DENIED',
        message: 'Insufficient permissions to access Bitbucket PR details'
      });
    }
    
    if (error.message.includes('404')) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: 'Bitbucket PR not found during complexity analysis'
      }, LOG_LEVELS.WARN);
      
      throw new ApiError({
        code: 'PR_NOT_FOUND',
        message: 'Pull Request not found in Bitbucket'
      });
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.NETWORK_ERROR,
        message: `Bitbucket network error during PR complexity analysis: ${error.message}`
      }, LOG_LEVELS.ERROR);
      
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: 'Unable to connect to Bitbucket. Please check your network connection.'
      });
    }
    
    // Generic error handling
    logError({
      ...errorContext,
      errorType: ERROR_TYPES.UNKNOWN_ERROR,
      message: `Unexpected error during Bitbucket PR complexity analysis: ${error.message}`
    }, LOG_LEVELS.ERROR);
    
    throw new ApiError({
      code: 'BITBUCKET_API_ERROR',
      message: `Failed to analyze PR complexity: ${error.message}`
    });
  }
}

/**
 * Calculate complexity score for a pull request
 * @param {Object} pr - Pull request data
 * @returns {Promise<number>} Complexity score (0-10 scale)
 */
async function calculatePRComplexity(pr) {
  const context = 'Bitbucket calculatePRComplexity';
  const prId = pr?.id || 'unknown';
  
  try {
    // Validate PR data
    if (!pr) {
      logError({
        context,
        errorType: ERROR_TYPES.VALIDATION_ERROR,
        message: 'Missing PR data for complexity calculation',
        artifactId: prId,
        artifactType: 'PR',
        apiService: 'bitbucket'
      }, LOG_LEVELS.WARN);
      
      return 0;
    }
    
    // Complexity factors with safe defaults
    const linesAdded = pr.diff_stats?.lines_added || 0;
    const linesDeleted = pr.diff_stats?.lines_removed || 0;
    const filesChanged = pr.diff_stats?.files_changed || 0;
    const reviewComments = pr.comment_count || 0;
    
    // Calculate total lines changed
    const totalLinesChanged = linesAdded + linesDeleted;
    
    logError({
      context,
      message: `Calculating complexity for PR ${prId}`,
      artifactId: prId,
      artifactType: 'PR',
      apiService: 'bitbucket',
      linesAdded,
      linesDeleted,
      filesChanged,
      reviewComments
    }, LOG_LEVELS.DEBUG);
    
    // Complexity scoring algorithm
    let complexityScore = 0;
    
    // Lines changed factor (0-4 points)
    if (totalLinesChanged > 1000) complexityScore += 4;
    else if (totalLinesChanged > 500) complexityScore += 3;
    else if (totalLinesChanged > 200) complexityScore += 2;
    else if (totalLinesChanged > 50) complexityScore += 1;
    
    // Files changed factor (0-3 points)
    if (filesChanged > 20) complexityScore += 3;
    else if (filesChanged > 10) complexityScore += 2;
    else if (filesChanged > 5) complexityScore += 1;
    
    // Review comments factor (0-2 points) - more comments indicate complexity
    if (reviewComments > 20) complexityScore += 2;
    else if (reviewComments > 10) complexityScore += 1;
    
    // Title/description complexity indicators (0-1 point)
    try {
      const title = pr.title?.toLowerCase() || '';
      const complexityKeywords = ['refactor', 'architecture', 'migration', 'breaking', 'major'];
      if (complexityKeywords.some(keyword => title.includes(keyword))) {
        complexityScore += 1;
      }
    } catch (titleError) {
      logError({
        context: `${context} - Title Analysis`,
        errorType: ERROR_TYPES.API_ERROR,
        message: `Failed to analyze PR title for complexity keywords: ${titleError.message}`,
        artifactId: prId,
        artifactType: 'PR',
        apiService: 'bitbucket'
      }, LOG_LEVELS.WARN);
    }
    
    // Normalize to 0-10 scale
    const normalizedScore = Math.min(complexityScore, 10);
    
    logError({
      context,
      message: `PR ${prId} complexity: ${normalizedScore}/10 (lines: ${totalLinesChanged}, files: ${filesChanged}, comments: ${reviewComments})`,
      artifactId: prId,
      artifactType: 'PR',
      apiService: 'bitbucket',
      complexityScore: normalizedScore,
      totalLinesChanged,
      filesChanged,
      reviewComments
    }, LOG_LEVELS.INFO);
    
    return normalizedScore;

  } catch (error) {
    // Enhanced error logging with artifact context
    logError({
      context,
      errorType: ERROR_TYPES.API_ERROR,
      message: `Error calculating PR complexity, defaulting to 0: ${error.message}`,
      artifactId: prId,
      artifactType: 'PR',
      apiService: 'bitbucket',
      originalError: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    }, LOG_LEVELS.WARN);
    
    return 0;
  }
}

/**
 * Get diff context for a pull request
 * @param {string} prId - Pull request ID
 * @returns {Promise<DiffContext>} Diff context with changed files and key changes
 */
async function getDiffContext(prId) {
  const context = 'Bitbucket getDiffContext';
  
  try {
    if (!prId) {
      const validationError = new ApiError({
        code: 'INVALID_INPUT',
        message: 'Pull Request ID is required'
      });
      
      logError({
        context,
        errorType: ERROR_TYPES.VALIDATION_ERROR,
        message: 'Missing required prId parameter for diff context',
        artifactType: 'PR',
        apiService: 'bitbucket'
      }, LOG_LEVELS.WARN);
      
      throw validationError;
    }

    logError({
      context,
      message: `Fetching diff context for PR: ${prId}`,
      artifactId: prId,
      artifactType: 'PR',
      apiService: 'bitbucket'
    }, LOG_LEVELS.INFO);
    
    let response, prResponse;
    let retryCount = 0;
    const maxRetries = 3;
    
    // Get PR diff information with retry logic
    while (retryCount < maxRetries) {
      try {
        response = await api.asApp().requestBitbucket(`/2.0/pullrequests/${prId}/diff`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
        break; // Success, exit retry loop
        
      } catch (apiError) {
        retryCount++;
        
        logError({
          context: `${context} - Diff API Call Attempt ${retryCount}`,
          errorType: ERROR_TYPES.API_ERROR,
          message: `Bitbucket diff API error: ${apiError.message}`,
          artifactId: prId,
          artifactType: 'PR',
          apiService: 'bitbucket',
          retryAttempt: retryCount
        }, LOG_LEVELS.ERROR);
        
        if (retryCount >= maxRetries || !isRetryableError(apiError)) {
          throw apiError;
        }
        
        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Handle diff response errors
    if (!response || response.status !== 200) {
      const errorContext = {
        context: `${context} - Diff Response`,
        artifactId: prId,
        artifactType: 'PR',
        apiService: 'bitbucket',
        responseStatus: response?.status
      };
      
      if (response?.status === 403) {
        logError({
          ...errorContext,
          errorType: ERROR_TYPES.PERMISSION_DENIED,
          message: 'Bitbucket permission denied - insufficient access to PR diff'
        }, LOG_LEVELS.WARN);
        
        throw new ApiError({
          code: 'PERMISSION_DENIED',
          message: 'Insufficient permissions to access Bitbucket PR diff'
        });
      }
      
      if (response?.status === 404) {
        logError({
          ...errorContext,
          errorType: ERROR_TYPES.API_ERROR,
          message: 'Bitbucket PR diff not found'
        }, LOG_LEVELS.WARN);
        
        throw new ApiError({
          code: 'PR_NOT_FOUND',
          message: 'Pull Request diff not found in Bitbucket'
        });
      }
      
      if (response?.status === 429) {
        logError({
          ...errorContext,
          errorType: ERROR_TYPES.API_ERROR,
          message: 'Bitbucket rate limit exceeded for PR diff'
        }, LOG_LEVELS.WARN);
        
        throw new ApiError({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Bitbucket API rate limit exceeded. Please try again later.'
        });
      }
      
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: `Bitbucket diff API error: ${response?.status || 'Unknown error'}`
      }, LOG_LEVELS.ERROR);
      
      throw new ApiError({
        code: 'BITBUCKET_API_ERROR',
        message: `Failed to fetch PR diff: ${response?.status || 'Unknown error'}`
      });
    }

    // Get PR details for additional context with retry logic
    retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        prResponse = await api.asApp().requestBitbucket(`/2.0/pullrequests/${prId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
        break; // Success, exit retry loop
        
      } catch (apiError) {
        retryCount++;
        
        logError({
          context: `${context} - PR Details API Call Attempt ${retryCount}`,
          errorType: ERROR_TYPES.API_ERROR,
          message: `Bitbucket PR details API error: ${apiError.message}`,
          artifactId: prId,
          artifactType: 'PR',
          apiService: 'bitbucket',
          retryAttempt: retryCount
        }, LOG_LEVELS.ERROR);
        
        if (retryCount >= maxRetries || !isRetryableError(apiError)) {
          // If PR details fail, continue with diff data only
          logError({
            context: `${context} - PR Details Fallback`,
            errorType: ERROR_TYPES.API_ERROR,
            message: `Failed to get PR details, using diff data only: ${apiError.message}`,
            artifactId: prId,
            artifactType: 'PR',
            apiService: 'bitbucket'
          }, LOG_LEVELS.WARN);
          
          prResponse = null;
          break;
        }
        
        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    const pr = prResponse?.data;
    const diffData = response.data;
    
    try {
      // Parse diff to extract changed files information with error handling
      const changedFiles = await parseDiffForChangedFiles(diffData, pr);
      
      // Extract key changes summary with error handling
      const keyChanges = extractKeyChanges(pr, changedFiles);
      
      const diffContext = {
        prId: prId,
        changedFiles: changedFiles,
        keyChanges: keyChanges,
        totalLinesAdded: pr?.diff_stats?.lines_added || 0,
        totalLinesDeleted: pr?.diff_stats?.lines_removed || 0,
        totalFilesChanged: pr?.diff_stats?.files_changed || changedFiles.length
      };

      logError({
        context,
        message: `Successfully generated diff context for PR ${prId}: ${changedFiles.length} files changed`,
        artifactId: prId,
        artifactType: 'PR',
        apiService: 'bitbucket',
        filesChanged: changedFiles.length,
        keyChangesCount: keyChanges.length
      }, LOG_LEVELS.INFO);
      
      return diffContext;
      
    } catch (processingError) {
      // Log processing error but provide fallback diff context
      logError({
        context: `${context} - Diff Processing`,
        errorType: ERROR_TYPES.API_ERROR,
        message: `Failed to process diff context for PR ${prId}: ${processingError.message}`,
        artifactId: prId,
        artifactType: 'PR',
        apiService: 'bitbucket'
      }, LOG_LEVELS.WARN);
      
      // Return minimal diff context as fallback
      return {
        prId: prId,
        changedFiles: [],
        keyChanges: ['Unable to parse diff details'],
        totalLinesAdded: 0,
        totalLinesDeleted: 0,
        totalFilesChanged: 0
      };
    }

  } catch (error) {
    // Enhanced error handling with artifact-specific context
    const errorContext = {
      context,
      artifactId: prId,
      artifactType: 'PR',
      apiService: 'bitbucket',
      originalError: {
        name: error.name,
        message: error.message,
        code: error.code
      }
    };
    
    if (error instanceof ApiError) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: `Bitbucket diff context service error: ${error.message}`
      }, LOG_LEVELS.ERROR);
      
      throw error;
    }
    
    // Handle specific errors with enhanced logging
    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.PERMISSION_DENIED,
        message: 'Bitbucket permission denied during diff context fetch'
      }, LOG_LEVELS.WARN);
      
      throw new ApiError({
        code: 'PERMISSION_DENIED',
        message: 'Insufficient permissions to access Bitbucket PR diff'
      });
    }
    
    if (error.message.includes('404')) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: 'Bitbucket PR not found during diff context fetch'
      }, LOG_LEVELS.WARN);
      
      throw new ApiError({
        code: 'PR_NOT_FOUND',
        message: 'Pull Request not found in Bitbucket'
      });
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.NETWORK_ERROR,
        message: `Bitbucket network error during diff context fetch: ${error.message}`
      }, LOG_LEVELS.ERROR);
      
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: 'Unable to connect to Bitbucket. Please check your network connection.'
      });
    }
    
    // Generic error handling
    logError({
      ...errorContext,
      errorType: ERROR_TYPES.UNKNOWN_ERROR,
      message: `Unexpected error during Bitbucket diff context fetch: ${error.message}`
    }, LOG_LEVELS.ERROR);
    
    throw new ApiError({
      code: 'BITBUCKET_API_ERROR',
      message: `Failed to get diff context: ${error.message}`
    });
  }
}

/**
 * Parse diff data to extract changed files information
 * @param {Object} diffData - Raw diff data from Bitbucket API
 * @param {Object} pr - Pull request data
 * @returns {Promise<ChangedFile[]>} Array of changed files
 */
async function parseDiffForChangedFiles(diffData, pr) {
  try {
    // If we have detailed diff stats, use them
    if (pr.diff_stats && pr.diff_stats.files) {
      return pr.diff_stats.files.map(file => ({
        path: file.name,
        linesAdded: file.lines_added || 0,
        linesDeleted: file.lines_removed || 0,
        changeType: determineChangeType(file)
      }));
    }
    
    // Fallback: parse from diff text if available
    if (typeof diffData === 'string') {
      return parseDiffText(diffData);
    }
    
    // If no detailed information available, return basic info
    return [{
      path: 'unknown',
      linesAdded: pr.diff_stats?.lines_added || 0,
      linesDeleted: pr.diff_stats?.lines_removed || 0,
      changeType: 'MODIFIED'
    }];

  } catch (error) {
    console.warn('Error parsing diff for changed files:', error.message);
    return [];
  }
}

/**
 * Determine change type for a file
 * @param {Object} file - File diff stats
 * @returns {string} Change type: 'ADDED', 'MODIFIED', or 'DELETED'
 */
function determineChangeType(file) {
  if (file.lines_added > 0 && file.lines_removed === 0) {
    return 'ADDED';
  } else if (file.lines_added === 0 && file.lines_removed > 0) {
    return 'DELETED';
  } else {
    return 'MODIFIED';
  }
}

/**
 * Parse diff text to extract file changes
 * @param {string} diffText - Raw diff text
 * @returns {ChangedFile[]} Array of changed files
 */
function parseDiffText(diffText) {
  const files = [];
  const fileHeaders = diffText.match(/^diff --git a\/.+ b\/.+$/gm) || [];
  
  fileHeaders.forEach(header => {
    const match = header.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (match) {
      const filePath = match[2];
      files.push({
        path: filePath,
        linesAdded: 0, // Would need more complex parsing
        linesDeleted: 0,
        changeType: 'MODIFIED'
      });
    }
  });
  
  return files;
}

/**
 * Extract key changes summary from PR and changed files
 * @param {Object} pr - Pull request data
 * @param {ChangedFile[]} changedFiles - Array of changed files
 * @returns {string[]} Array of key changes descriptions
 */
function extractKeyChanges(pr, changedFiles) {
  const keyChanges = [];
  
  // Add PR title as primary change
  if (pr.title) {
    keyChanges.push(`Primary change: ${pr.title}`);
  }
  
  // Analyze file patterns for key changes
  const fileExtensions = changedFiles.map(f => {
    const ext = f.path.split('.').pop();
    return ext;
  });
  
  const uniqueExtensions = [...new Set(fileExtensions)];
  if (uniqueExtensions.length > 0) {
    keyChanges.push(`File types modified: ${uniqueExtensions.join(', ')}`);
  }
  
  // Identify critical files
  const criticalFiles = changedFiles.filter(f => 
    f.path.includes('config') || 
    f.path.includes('package.json') || 
    f.path.includes('manifest') ||
    f.path.includes('index')
  );
  
  if (criticalFiles.length > 0) {
    keyChanges.push(`Critical files changed: ${criticalFiles.map(f => f.path).join(', ')}`);
  }
  
  // Add complexity indicator
  const totalLines = changedFiles.reduce((sum, f) => sum + f.linesAdded + f.linesDeleted, 0);
  if (totalLines > 500) {
    keyChanges.push(`Large change: ${totalLines} total lines modified`);
  }
  
  return keyChanges;
}

/**
 * Validate Bitbucket API permissions
 * @returns {Promise<boolean>} True if permissions are valid
 */
async function validateBitbucketPermissions() {
  const context = 'Bitbucket validateBitbucketPermissions';
  
  try {
    logError({
      context,
      message: 'Validating Bitbucket API permissions',
      apiService: 'bitbucket'
    }, LOG_LEVELS.INFO);
    
    // Test API access with a simple request
    const response = await api.asApp().requestBitbucket('/2.0/user', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    const isValid = response && response.status === 200;
    
    logError({
      context,
      message: `Bitbucket permission validation ${isValid ? 'successful' : 'failed'}`,
      apiService: 'bitbucket',
      responseStatus: response?.status,
      isValid
    }, isValid ? LOG_LEVELS.INFO : LOG_LEVELS.WARN);
    
    return isValid;
    
  } catch (error) {
    // Enhanced error logging for permission validation
    const errorContext = {
      context,
      apiService: 'bitbucket',
      originalError: {
        name: error.name,
        message: error.message,
        code: error.code
      }
    };
    
    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.PERMISSION_DENIED,
        message: 'Bitbucket permission validation failed - access denied'
      }, LOG_LEVELS.WARN);
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.NETWORK_ERROR,
        message: `Bitbucket permission validation failed - network error: ${error.message}`
      }, LOG_LEVELS.ERROR);
    } else {
      logError({
        ...errorContext,
        errorType: ERROR_TYPES.API_ERROR,
        message: `Bitbucket permission validation failed: ${error.message}`
      }, LOG_LEVELS.WARN);
    }
    
    return false;
  }
}

module.exports = {
  getPullRequestsLastSixMonths,
  getCommitHistory,
  analyzePRComplexity,
  getDiffContext,
  calculatePRComplexity,
  parseDiffForChangedFiles,
  extractKeyChanges,
  validateBitbucketPermissions
};