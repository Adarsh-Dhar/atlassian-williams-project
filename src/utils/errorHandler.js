const { ApiError } = require('../models');

/**
 * Comprehensive Error Handling Utilities
 * Provides centralized error handling for the Legacy Keeper
 */

/**
 * Log levels for structured logging
 */
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

/**
 * Error types for categorization
 */
const ERROR_TYPES = {
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  API_ERROR: 'API_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Handle API errors gracefully with proper logging and user-friendly messages
 * @param {Error} error - The error to handle
 * @param {string} context - Context where the error occurred
 * @returns {Object} Formatted error response
 */
function handleApiError(error, context = 'Unknown') {
  const timestamp = new Date().toISOString();
  const errorId = generateErrorId();
  
  // Determine error type and appropriate response
  let errorType = ERROR_TYPES.UNKNOWN_ERROR;
  let userMessage = 'An unexpected error occurred. Please try again later.';
  let logLevel = LOG_LEVELS.ERROR;
  
  // Check for network errors first (by error code)
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    errorType = ERROR_TYPES.NETWORK_ERROR;
    userMessage = 'Network connection error. Please check your connection and try again.';
    logLevel = LOG_LEVELS.ERROR;
  } else if (error.name === 'ValidationError' || error.code === 'INVALID_INPUT') {
    errorType = ERROR_TYPES.VALIDATION_ERROR;
    userMessage = error.message || 'Invalid input provided.';
    logLevel = LOG_LEVELS.WARN;
  } else if (error.message) {
    // Check HTTP status codes and specific error messages
    if (error.message.includes('403')) {
      errorType = ERROR_TYPES.PERMISSION_DENIED;
      userMessage = 'Permission denied. Please check your access permissions.';
      logLevel = LOG_LEVELS.WARN;
    } else if (error.message.includes('404') || error.message.includes('Not Found')) {
      errorType = ERROR_TYPES.API_ERROR;
      userMessage = 'The requested resource was not found.';
      logLevel = LOG_LEVELS.WARN;
    } else if (error.message.includes('429') || error.message.includes('Too Many Requests') || error.message.includes('Rate limit')) {
      errorType = ERROR_TYPES.API_ERROR;
      userMessage = 'A server error occurred. Please try again later.';
      logLevel = LOG_LEVELS.ERROR;
    } else if (error.message.includes('500') || error.message.includes('Internal Server')) {
      errorType = ERROR_TYPES.API_ERROR;
      userMessage = 'A server error occurred. Please try again later.';
      logLevel = LOG_LEVELS.ERROR;
    }
  }
  
  // Log the error with appropriate level
  logError({
    errorId,
    timestamp,
    context,
    errorType,
    originalError: {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    }
  }, logLevel);
  
  return {
    success: false,
    error: userMessage,
    errorId,
    errorType,
    timestamp
  };
}

/**
 * Handle 403 Forbidden errors specifically without exposing sensitive information
 * @param {Error} error - The 403 error
 * @param {string} context - Context where the error occurred
 * @returns {Object} Safe error response
 */
function handle403Error(error, context = 'API Call') {
  const errorId = generateErrorId();
  const timestamp = new Date().toISOString();
  
  // Log the error for debugging but don't expose details
  logError({
    errorId,
    timestamp,
    context,
    errorType: ERROR_TYPES.PERMISSION_DENIED,
    message: 'Access denied - insufficient permissions',
    // Don't log sensitive details from the original error
    originalErrorType: error.name
  }, LOG_LEVELS.WARN);
  
  return {
    success: false,
    error: 'Access denied. You do not have sufficient permissions to perform this action.',
    errorId,
    errorType: ERROR_TYPES.PERMISSION_DENIED,
    timestamp
  };
}

/**
 * Structured logging with appropriate log levels
 * @param {Object} logData - Data to log
 * @param {string} level - Log level
 */
function logError(logData, level = LOG_LEVELS.ERROR) {
  const logEntry = {
    level,
    timestamp: logData.timestamp || new Date().toISOString(),
    service: 'legacy-keeper',
    ...logData
  };
  
  switch (level) {
    case LOG_LEVELS.ERROR:
      console.error('🚨 ERROR:', JSON.stringify(logEntry, null, 2));
      break;
    case LOG_LEVELS.WARN:
      console.warn('⚠️  WARN:', JSON.stringify(logEntry, null, 2));
      break;
    case LOG_LEVELS.INFO:
      console.info('ℹ️  INFO:', JSON.stringify(logEntry, null, 2));
      break;
    case LOG_LEVELS.DEBUG:
      console.log('🐛 DEBUG:', JSON.stringify(logEntry, null, 2));
      break;
    default:
      console.log('📝 LOG:', JSON.stringify(logEntry, null, 2));
  }
}

/**
 * Generate a unique error ID for tracking
 * @returns {string} Unique error identifier
 */
function generateErrorId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `err_${timestamp}_${random}`;
}

/**
 * Validate input and throw appropriate errors
 * @param {Object} input - Input to validate
 * @param {Object} schema - Validation schema
 * @throws {ApiError} If validation fails
 */
function validateInput(input, schema) {
  const errors = [];
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = input[field];
    
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }
    
    if (value !== undefined && value !== null) {
      if (rules.type && typeof value !== rules.type) {
        errors.push(`${field} must be of type ${rules.type}`);
      }
      
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters long`);
      }
      
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${field} must be no more than ${rules.maxLength} characters long`);
      }
      
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${field} format is invalid`);
      }
    }
  }
  
  if (errors.length > 0) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: `Validation failed: ${errors.join(', ')}`
    });
  }
}

/**
 * Wrap async functions with error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Context for error logging
 * @returns {Function} Wrapped function
 */
function withErrorHandling(fn, context) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return handleApiError(error, context);
    }
  };
}

/**
 * Format error messages for user display
 * @param {Error|string} error - Error to format
 * @returns {string} User-friendly error message
 */
function formatErrorMessage(error) {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error.code === 'PERMISSION_DENIED') {
    return 'You do not have permission to perform this action.';
  }
  
  if (error.code === 'VALIDATION_ERROR') {
    return error.message || 'The provided information is invalid.';
  }
  
  if (error.code === 'NETWORK_ERROR') {
    return 'Unable to connect to the service. Please check your network connection.';
  }
  
  return 'An unexpected error occurred. Please try again later.';
}

/**
 * Check if an error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} True if the error is retryable
 */
function isRetryableError(error) {
  const retryableCodes = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'];
  const retryableStatuses = [408, 429, 500, 502, 503, 504];
  
  if (retryableCodes.includes(error.code)) {
    return true;
  }
  
  if (error.status && retryableStatuses.includes(error.status)) {
    return true;
  }
  
  return false;
}

module.exports = {
  handleApiError,
  handle403Error,
  logError,
  validateInput,
  withErrorHandling,
  formatErrorMessage,
  isRetryableError,
  generateErrorId,
  LOG_LEVELS,
  ERROR_TYPES
};