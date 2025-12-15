const Resolver = require('@forge/resolver');
const { scanForGaps } = require('./scanners/backgroundScanner');
const { saveToConfluence } = require('./services/confluenceService');

const resolver = new Resolver();

// Register resolver functions
resolver.define('scanForGaps', scanForGaps);
resolver.define('saveToConfluence', saveToConfluence);

// Export individual functions for manifest handlers
exports.scanForGaps = scanForGaps;
exports.saveToConfluence = saveToConfluence;

exports.handler = resolver.getDefinitions();