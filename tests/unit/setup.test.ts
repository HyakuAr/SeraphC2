/**
 * Basic setup verification test
 */

describe('Project Setup', () => {
  it('should have correct Node.js environment', () => {
    expect(process.env['NODE_ENV']).toBe('test');
  });

  it('should be able to import main module', async () => {
    // This test verifies that our TypeScript setup is working
    const indexModule = await import('../../src/index');
    expect(indexModule).toBeDefined();
  });

  it('should have proper test configuration', () => {
    expect(jest).toBeDefined();
    expect(describe).toBeDefined();
    expect(it).toBeDefined();
    expect(expect).toBeDefined();
  });
});
