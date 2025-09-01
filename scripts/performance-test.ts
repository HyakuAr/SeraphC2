#!/usr/bin/env ts-node

/**
 * Performance Testing Script for SeraphC2
 * Automated performance benchmarking and reporting
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

interface PerformanceReport {
  timestamp: string;
  testSuite: string;
  results: TestResult[];
  summary: PerformanceSummary;
  environment: EnvironmentInfo;
}

interface TestResult {
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  metrics: PerformanceMetrics;
  errors?: string[];
}

interface PerformanceMetrics {
  averageResponseTime?: number;
  requestsPerSecond?: number;
  errorRate?: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

interface PerformanceSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDuration: number;
  overallScore: number;
  recommendations: string[];
}

interface EnvironmentInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  cpuCount: number;
  totalMemory: number;
  freeMemory: number;
}

class PerformanceTester {
  private reportDir: string;
  private serverProcess: ChildProcess | null = null;

  constructor() {
    this.reportDir = path.join(process.cwd(), 'performance-reports');
    this.ensureReportDirectory();
  }

  /**
   * Run all performance tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting SeraphC2 Performance Testing Suite');
    console.log('='.repeat(60));

    const startTime = performance.now();

    try {
      // Setup test environment
      await this.setupTestEnvironment();

      // Run performance tests
      const loadTestResults = await this.runLoadTests();
      const stressTestResults = await this.runStressTests();

      // Generate comprehensive report
      const report = this.generateReport([...loadTestResults, ...stressTestResults]);
      await this.saveReport(report);
      this.displaySummary(report);
    } catch (error) {
      console.error('❌ Performance testing failed:', error);
      throw error;
    } finally {
      await this.cleanup();
      const endTime = performance.now();
      console.log(`\n⏱️  Total testing time: ${((endTime - startTime) / 1000).toFixed(2)}s`);
    }
  }

  /**
   * Run only load tests
   */
  async runLoadTestsOnly(): Promise<void> {
    console.log('🔄 Running Load Tests Only');

    try {
      await this.setupTestEnvironment();
      const results = await this.runLoadTests();
      const report = this.generateReport(results);
      await this.saveReport(report);
      this.displaySummary(report);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Run only stress tests
   */
  async runStressTestsOnly(): Promise<void> {
    console.log('💥 Running Stress Tests Only');

    try {
      await this.setupTestEnvironment();
      const results = await this.runStressTests();
      const report = this.generateReport(results);
      await this.saveReport(report);
      this.displaySummary(report);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Setup test environment
   */
  private async setupTestEnvironment(): Promise<void> {
    console.log('🔧 Setting up test environment...');

    // Build the project
    console.log('  📦 Building project...');
    execSync('npm run build', { stdio: 'inherit' });

    // Setup test database
    console.log('  🗄️  Setting up test database...');
    process.env.NODE_ENV = 'test';
    process.env.DB_NAME = 'seraphc2_perf_test';

    // Wait for environment to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ Test environment ready');
  }

  /**
   * Run load tests
   */
  private async runLoadTests(): Promise<TestResult[]> {
    console.log('\n📊 Running Load Tests...');

    const testCommand = 'npm test -- --testPathPattern=performance/load.test.ts --verbose';
    return this.executeTestSuite('Load Tests', testCommand);
  }

  /**
   * Run stress tests
   */
  private async runStressTests(): Promise<TestResult[]> {
    console.log('\n💪 Running Stress Tests...');

    const testCommand = 'npm test -- --testPathPattern=performance/stress.test.ts --verbose';
    return this.executeTestSuite('Stress Tests', testCommand);
  }

  /**
   * Execute a test suite and parse results
   */
  private async executeTestSuite(suiteName: string, command: string): Promise<TestResult[]> {
    const startTime = performance.now();
    const results: TestResult[] = [];

    try {
      const output = execSync(command, {
        encoding: 'utf8',
        stdio: 'pipe',
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      // Parse Jest output to extract test results
      const testResults = this.parseJestOutput(output);
      results.push(...testResults);

      console.log(`✅ ${suiteName} completed successfully`);
    } catch (error: any) {
      console.log(`❌ ${suiteName} failed`);

      // Even if tests fail, try to parse partial results
      if (error.stdout) {
        const partialResults = this.parseJestOutput(error.stdout);
        results.push(...partialResults);
      }

      // Add error result
      results.push({
        testName: `${suiteName} - Error`,
        status: 'failed',
        duration: performance.now() - startTime,
        metrics: {},
        errors: [error.message],
      });
    }

    return results;
  }

  /**
   * Parse Jest test output to extract performance metrics
   */
  private parseJestOutput(output: string): TestResult[] {
    const results: TestResult[] = [];
    const lines = output.split('\n');

    let currentTest: Partial<TestResult> = {};
    let inTestResult = false;

    for (const line of lines) {
      // Detect test start
      if (line.includes('✓') || line.includes('✗')) {
        if (currentTest.testName) {
          results.push(currentTest as TestResult);
        }

        currentTest = {
          testName: line.trim(),
          status: line.includes('✓') ? 'passed' : 'failed',
          duration: this.extractDuration(line),
          metrics: {},
        };
        inTestResult = true;
      }

      // Extract performance metrics from console.log output
      if (inTestResult && line.includes('Results:')) {
        currentTest.metrics = this.extractMetrics(line);
      }
    }

    // Add the last test if exists
    if (currentTest.testName) {
      results.push(currentTest as TestResult);
    }

    return results;
  }

  /**
   * Extract test duration from Jest output
   */
  private extractDuration(line: string): number {
    const match = line.match(/\((\d+)\s*ms\)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Extract performance metrics from test output
   */
  private extractMetrics(line: string): PerformanceMetrics {
    const metrics: PerformanceMetrics = {};

    // Extract various metrics using regex patterns
    const rpsMatch = line.match(/RPS:\s*([\d.]+)/);
    if (rpsMatch) {
      metrics.requestsPerSecond = parseFloat(rpsMatch[1]);
    }

    const responseTimeMatch = line.match(/avgResponseTime:\s*([\d.]+)/);
    if (responseTimeMatch) {
      metrics.averageResponseTime = parseFloat(responseTimeMatch[1]);
    }

    const errorRateMatch = line.match(/errorRate:\s*([\d.]+)%/);
    if (errorRateMatch) {
      metrics.errorRate = parseFloat(errorRateMatch[1]) / 100;
    }

    const memoryMatch = line.match(/Memory:\s*(\d+)MB/);
    if (memoryMatch) {
      metrics.memoryUsage = parseInt(memoryMatch[1]);
    }

    return metrics;
  }

  /**
   * Generate comprehensive performance report
   */
  private generateReport(results: TestResult[]): PerformanceReport {
    const passedTests = results.filter(r => r.status === 'passed').length;
    const failedTests = results.filter(r => r.status === 'failed').length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    // Calculate overall performance score (0-100)
    const overallScore = this.calculatePerformanceScore(results);
    const recommendations = this.generateRecommendations(results);

    return {
      timestamp: new Date().toISOString(),
      testSuite: 'SeraphC2 Performance Tests',
      results,
      summary: {
        totalTests: results.length,
        passedTests,
        failedTests,
        totalDuration,
        overallScore,
        recommendations,
      },
      environment: this.getEnvironmentInfo(),
    };
  }

  /**
   * Calculate overall performance score
   */
  private calculatePerformanceScore(results: TestResult[]): number {
    if (results.length === 0) return 0;

    let score = 0;
    let totalWeight = 0;

    for (const result of results) {
      let testScore = result.status === 'passed' ? 100 : 0;

      // Adjust score based on performance metrics
      if (result.metrics.averageResponseTime) {
        if (result.metrics.averageResponseTime < 500) testScore *= 1.0;
        else if (result.metrics.averageResponseTime < 1000) testScore *= 0.9;
        else if (result.metrics.averageResponseTime < 2000) testScore *= 0.7;
        else testScore *= 0.5;
      }

      if (result.metrics.errorRate) {
        if (result.metrics.errorRate < 0.01) testScore *= 1.0;
        else if (result.metrics.errorRate < 0.05) testScore *= 0.8;
        else if (result.metrics.errorRate < 0.1) testScore *= 0.6;
        else testScore *= 0.3;
      }

      score += testScore;
      totalWeight += 100;
    }

    return totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 0;
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(results: TestResult[]): string[] {
    const recommendations: string[] = [];

    // Analyze response times
    const avgResponseTimes = results
      .map(r => r.metrics.averageResponseTime)
      .filter(t => t !== undefined) as number[];

    if (avgResponseTimes.length > 0) {
      const maxResponseTime = Math.max(...avgResponseTimes);
      if (maxResponseTime > 2000) {
        recommendations.push('Consider optimizing slow endpoints (response time > 2s)');
      }
    }

    // Analyze error rates
    const errorRates = results
      .map(r => r.metrics.errorRate)
      .filter(r => r !== undefined) as number[];

    if (errorRates.length > 0) {
      const maxErrorRate = Math.max(...errorRates);
      if (maxErrorRate > 0.1) {
        recommendations.push('High error rates detected - investigate error handling and capacity');
      }
    }

    // Analyze memory usage
    const memoryUsages = results
      .map(r => r.metrics.memoryUsage)
      .filter(m => m !== undefined) as number[];

    if (memoryUsages.length > 0) {
      const maxMemory = Math.max(...memoryUsages);
      if (maxMemory > 512) {
        recommendations.push('High memory usage detected - consider memory optimization');
      }
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push(
        'Performance looks good! Consider running tests regularly to maintain quality'
      );
    }

    return recommendations;
  }

  /**
   * Get environment information
   */
  private getEnvironmentInfo(): EnvironmentInfo {
    const os = require('os');

    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024), // MB
      freeMemory: Math.round(os.freemem() / 1024 / 1024), // MB
    };
  }

  /**
   * Save performance report to file
   */
  private async saveReport(report: PerformanceReport): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `performance-report-${timestamp}.json`;
    const filepath = path.join(this.reportDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Performance report saved: ${filepath}`);

    // Also save a summary report
    const summaryPath = path.join(this.reportDir, 'latest-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(report.summary, null, 2));
  }

  /**
   * Display performance summary
   */
  private displaySummary(report: PerformanceReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 PERFORMANCE TEST SUMMARY');
    console.log('='.repeat(60));

    console.log(`📈 Overall Score: ${report.summary.overallScore}/100`);
    console.log(`✅ Passed Tests: ${report.summary.passedTests}/${report.summary.totalTests}`);
    console.log(`❌ Failed Tests: ${report.summary.failedTests}/${report.summary.totalTests}`);
    console.log(`⏱️  Total Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);

    if (report.summary.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.summary.recommendations.forEach(rec => {
        console.log(`   • ${rec}`);
      });
    }

    console.log('\n🖥️  Environment:');
    console.log(`   • Node.js: ${report.environment.nodeVersion}`);
    console.log(`   • Platform: ${report.environment.platform} (${report.environment.arch})`);
    console.log(`   • CPUs: ${report.environment.cpuCount}`);
    console.log(
      `   • Memory: ${report.environment.freeMemory}MB free / ${report.environment.totalMemory}MB total`
    );
  }

  /**
   * Ensure report directory exists
   */
  private ensureReportDirectory(): void {
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  /**
   * Cleanup test environment
   */
  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up test environment...');

    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }

    // Reset environment
    delete process.env.NODE_ENV;
    delete process.env.DB_NAME;
  }
}

// CLI Interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const tester = new PerformanceTester();

  try {
    switch (args[0]) {
      case 'load':
        await tester.runLoadTestsOnly();
        break;
      case 'stress':
        await tester.runStressTestsOnly();
        break;
      case 'all':
      default:
        await tester.runAllTests();
        break;
    }
  } catch (error) {
    console.error('Performance testing failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { PerformanceTester };
