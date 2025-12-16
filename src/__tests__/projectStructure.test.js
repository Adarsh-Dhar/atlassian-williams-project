const fc = require('fast-check');
const fs = require('fs');
const path = require('path');

/**
 * Feature: legacy-keeper, Property 1: Project structure validation
 * Validates: Requirements 6.1, 6.4
 */
describe('Project Structure Validation', () => {
  
  test('should have all required project files', () => {
    const requiredFiles = [
      'package.json',
      'manifest.yml', 
      'jest.config.js',
      'src/index.js',
      'src/__mocks__/@forge/api.js'
    ];
    
    requiredFiles.forEach(filePath => {
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  test('package.json should contain required dependencies', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    // Required dependencies
    expect(packageJson.dependencies).toHaveProperty('@forge/api');
    expect(packageJson.dependencies).toHaveProperty('@forge/resolver');
    
    // Required dev dependencies  
    expect(packageJson.devDependencies).toHaveProperty('jest');
    expect(packageJson.devDependencies).toHaveProperty('jest-when');
    expect(packageJson.devDependencies).toHaveProperty('fast-check');
  });

  test('manifest.yml should contain required runtime configuration', () => {
    const manifestContent = fs.readFileSync('manifest.yml', 'utf8');
    
    // Check for nodejs22.x runtime
    expect(manifestContent).toMatch(/nodejs22\.x/);
    
    // Check for required permissions
    expect(manifestContent).toMatch(/read:jira-work/);
    expect(manifestContent).toMatch(/read:confluence-content\.all/);
    expect(manifestContent).toMatch(/write:confluence-content/);
    expect(manifestContent).toMatch(/read:user:jira/);
  });

  /**
   * Property-based test: For any valid project structure, 
   * all essential files should exist and be readable
   */
  test('property: project structure integrity', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...[
          'package.json',
          'manifest.yml',
          'jest.config.js', 
          'src/index.js'
        ]),
        (fileName) => {
          // Property: All essential files should exist and be readable
          expect(fs.existsSync(fileName)).toBe(true);
          expect(() => fs.readFileSync(fileName, 'utf8')).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property-based test: For any configuration file,
   * it should contain valid syntax and required content
   */
  test('property: configuration files validity', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...[
          { file: 'package.json', parser: JSON.parse, requiredKeys: ['name', 'dependencies', 'devDependencies'] },
          { file: 'jest.config.js', parser: null, requiredContent: ['testEnvironment', 'collectCoverageFrom'] }
        ]),
        (config) => {
          const content = fs.readFileSync(config.file, 'utf8');
          
          if (config.parser) {
            // Should parse without error
            const parsed = config.parser(content);
            
            // Should contain required keys
            config.requiredKeys.forEach(key => {
              expect(parsed).toHaveProperty(key);
            });
          } else {
            // Should contain required content
            config.requiredContent.forEach(requiredText => {
              expect(content).toContain(requiredText);
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});