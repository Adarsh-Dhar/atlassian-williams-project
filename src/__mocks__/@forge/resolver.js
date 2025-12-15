/**
 * Mock implementation for @forge/resolver
 */

class MockResolver {
  constructor() {
    this.definitions = {};
  }

  define(name, handler) {
    this.definitions[name] = handler;
  }

  getDefinitions() {
    return this.definitions;
  }
}

module.exports = MockResolver;