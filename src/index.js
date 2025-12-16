const Resolver = require('@forge/resolver');
const { scanLastSixMonths } = require('./scanners/legacyDetector');
const { saveToConfluence } = require('./services/confluenceService');
const { 
  getPullRequestsLastSixMonths, 
  getCommitHistory, 
  analyzePRComplexity 
} = require('./services/bitbucketService');
const {
  triggerCognitiveOffboarding,
  executeScanPhase,
  executeInterviewPhase,
  executeArchivePhase,
  executeCompleteWorkflow,
  getWorkflowSession,
  getAllActiveSessions,
  validateWorkflowCompletion
} = require('./workflows/cognitiveOffboardingWorkflow');

const resolver = new Resolver();

// Register resolver functions
resolver.define('scanLastSixMonths', scanLastSixMonths);
resolver.define('saveToConfluence', saveToConfluence);
resolver.define('getBitbucketPRs', getPullRequestsLastSixMonths);
resolver.define('getBitbucketCommits', getCommitHistory);
resolver.define('analyzePRComplexity', analyzePRComplexity);

// Register cognitive offboarding workflow functions
resolver.define('triggerCognitiveOffboarding', triggerCognitiveOffboarding);
resolver.define('executeScanPhase', executeScanPhase);
resolver.define('executeInterviewPhase', executeInterviewPhase);
resolver.define('executeArchivePhase', executeArchivePhase);
resolver.define('executeCompleteWorkflow', executeCompleteWorkflow);
resolver.define('getWorkflowSession', getWorkflowSession);
resolver.define('getAllActiveSessions', getAllActiveSessions);
resolver.define('validateWorkflowCompletion', validateWorkflowCompletion);

// Export individual functions for manifest handlers
exports.scanLastSixMonths = scanLastSixMonths;
exports.saveToConfluence = saveToConfluence;
exports.getBitbucketPRs = getPullRequestsLastSixMonths;
exports.getBitbucketCommits = getCommitHistory;
exports.analyzePRComplexity = analyzePRComplexity;

// Export cognitive offboarding workflow functions
exports.triggerCognitiveOffboarding = triggerCognitiveOffboarding;
exports.executeScanPhase = executeScanPhase;
exports.executeInterviewPhase = executeInterviewPhase;
exports.executeArchivePhase = executeArchivePhase;
exports.executeCompleteWorkflow = executeCompleteWorkflow;
exports.getWorkflowSession = getWorkflowSession;
exports.getAllActiveSessions = getAllActiveSessions;
exports.validateWorkflowCompletion = validateWorkflowCompletion;

exports.handler = resolver.getDefinitions();