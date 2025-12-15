const fs = require('fs');
const yaml = require('js-yaml');

/**
 * Unit tests for manifest configuration validation
 * Validates: Requirements 4.1, 4.2, 4.3, 3.5
 */
describe('Manifest Configuration Validation', () => {
  let manifestContent;
  let manifest;

  beforeAll(() => {
    manifestContent = fs.readFileSync('manifest.yml', 'utf8');
    manifest = yaml.load(manifestContent);
  });

  describe('Required Permissions', () => {
    test('should contain read:jira-work permission', () => {
      expect(manifest.permissions.scopes).toContain('read:jira-work');
    });

    test('should contain read:confluence-content.all permission', () => {
      expect(manifest.permissions.scopes).toContain('read:confluence-content.all');
    });

    test('should contain write:confluence-content permission', () => {
      expect(manifest.permissions.scopes).toContain('write:confluence-content');
    });

    test('should contain read:user:jira permission', () => {
      expect(manifest.permissions.scopes).toContain('read:user:jira');
    });

    test('should have all required permissions', () => {
      const requiredPermissions = [
        'read:jira-work',
        'read:confluence-content.all', 
        'write:confluence-content',
        'read:user:jira'
      ];
      
      requiredPermissions.forEach(permission => {
        expect(manifest.permissions.scopes).toContain(permission);
      });
    });
  });

  describe('Rovo Agent Configuration', () => {
    test('should have Memory Archaeologist agent configured', () => {
      const agent = manifest.modules['rovo:agent'].find(a => a.key === 'memory-archaeologist');
      expect(agent).toBeDefined();
      expect(agent.name).toBe('Memory Archaeologist');
    });

    test('should have correct forensic interviewer prompt', () => {
      const agent = manifest.modules['rovo:agent'].find(a => a.key === 'memory-archaeologist');
      expect(agent.prompt).toContain('forensic technical interviewer');
      expect(agent.prompt).toContain('extract tacit knowledge');
      expect(agent.prompt).toContain('undocumented projects');
    });

    test('should have agent configured without explicit actions', () => {
      const agent = manifest.modules['rovo:agent'].find(a => a.key === 'memory-archaeologist');
      // Actions are not explicitly defined in the simplified manifest structure
      expect(agent.actions).toBeUndefined();
    });
  });

  describe('Action Verb Configuration', () => {
    test('should have saveToConfluence function available', () => {
      const saveFunction = manifest.modules.function.find(f => f.key === 'saveToConfluence');
      expect(saveFunction).toBeDefined();
      expect(saveFunction.handler).toBe('index.saveToConfluence');
    });
  });

  describe('Runtime Configuration', () => {
    test('should use nodejs22.x runtime', () => {
      expect(manifest.app.runtime.name).toBe('nodejs22.x');
    });

    test('should have proper app id format', () => {
      expect(manifest.app.id).toMatch(/^ari:cloud:ecosystem::app\/[0-9a-f-]{36}$/);
    });
  });

  describe('Function Modules', () => {
    test('should have scanForGaps function defined', () => {
      const scanFunction = manifest.modules.function.find(f => f.key === 'scanForGaps');
      expect(scanFunction).toBeDefined();
      expect(scanFunction.handler).toBe('index.scanForGaps');
    });

    test('should have saveToConfluence function defined', () => {
      const saveFunction = manifest.modules.function.find(f => f.key === 'saveToConfluence');
      expect(saveFunction).toBeDefined();
      expect(saveFunction.handler).toBe('index.saveToConfluence');
    });
  });

  describe('Permissions Configuration', () => {
    test('should have read:confluence-user permission', () => {
      expect(manifest.permissions.scopes).toContain('read:confluence-user');
    });
  });
});