#!/usr/bin/env ts-node

/**
 * Smoke Test Script for SeraphC2
 * Post-deployment smoke testing to verify basic functionality
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

interface SmokeTestConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  credentials?: {
    username: string;
    password: string;
  };
  skipAuth?: boolean;
}

interface SmokeTestResult {
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  responseTime?: number;
  statusCode?: number;
  error?: string;
}

interface SmokeTestReport {
  timestamp: string;
  baseUrl: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  overallStatus: 'healthy' | 'unhealthy';
  results: SmokeTestResult[];
  summary: string;
}

class SmokeTestRunner {
  private config: SmokeTestConfig;
  private results: SmokeTestResult[] = [];
  private authToken?: string;

  constructor(config: SmokeTestConfig) {
    this.config = config;
  }

  /**
   * Run all smoke tests
   */
  async runSmokeTests(): Promise<SmokeTestReport> {
    console.log('🔥 Starting SeraphC2 Smoke Tests');
    console.log('='.repeat(50));
    console.log(`Target URL: ${this.config.baseUrl}`);
    console.log(`Timeout: ${this.config.timeout}ms`);
    console.log('='.repeat(50));

    try {
      // Basic connectivity tests
      await this.testBasicConnectivity();
      await this.testHealthEndpoint();

      // Authentication tests (if not skipped)
      if (!this.config.skipAuth && this.config.credentials) {
        await this.testAuthentication();
      }

      // Core functionality tests
      await this.testCoreEndpoints();
      await this.testApiDocumentation();
      await this.testSecurityHeaders();

      // Performance tests
      await this.testResponseTimes();

      // Generate and return report
      const report = this.generateReport();
      this.displayResults(report);

      return report;
    } catch (error) {
      console.error('❌ Smoke tests failed:', error);
      throw error;
    }
  }

  /**
   * Test basic connectivity to the service
   */
  private async testBasicConnectivity(): Promise<void> {
    console.log('\n🌐 Testing Basic Connectivity...');

    await this.runTest('Basic Connectivity', async () => {
      const response = await this.makeRequest('GET', '/');

      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) {
        return {
          message: `Service is reachable (HTTP ${response.statusCode})`,
          statusCode: response.statusCode,
          responseTime: response.responseTime,
        };
      } else {
        throw new Error(`Unexpected status code: ${response.statusCode}`);
      }
    });

    await this.runTest('DNS Resolution', async () => {
      const url = new URL(this.config.baseUrl);
      const dns = require('dns').promises;

      try {
        const addresses = await dns.resolve4(url.hostname);
        return {
          message: `DNS resolution successful (${addresses[0]})`,
          details: { hostname: url.hostname, addresses: addresses.slice(0, 3) },
        };
      } catch (error) {
        throw new Error(`DNS resolution failed: ${error}`);
      }
    });
  }

  /**
   * Test health endpoint
   */
  private async testHealthEndpoint(): Promise<void> {
    console.log('\n💊 Testing Health Endpoint...');

    await this.runTest('Health Check', async () => {
      const response = await this.makeRequest('GET', '/api/health');

      if (response.statusCode !== 200) {
        throw new Error(`Health check failed with status ${response.statusCode}`);
      }

      let healthData;
      try {
        healthData = JSON.parse(response.body || '{}');
      } catch (error) {
        throw new Error('Health check returned invalid JSON');
      }

      if (healthData.status !== 'healthy') {
        throw new Error(`Health status is ${healthData.status}, expected 'healthy'`);
      }

      return {
        message: 'Health check passed',
        statusCode: response.statusCode,
        responseTime: response.responseTime,
        details: healthData,
      };
    });

    await this.runTest('Health Check Response Time', async () => {
      const response = await this.makeRequest('GET', '/api/health');

      if (!response.responseTime || response.responseTime > 2000) {
        throw new Error(`Health check too slow: ${response.responseTime}ms`);
      }

      return {
        message: `Health check response time: ${response.responseTime}ms`,
        responseTime: response.responseTime,
        status: response.responseTime > 1000 ? 'warning' : 'passed',
      };
    });
  }

  /**
   * Test authentication
   */
  private async testAuthentication(): Promise<void> {
    console.log('\n🔐 Testing Authentication...');

    await this.runTest('Login Endpoint', async () => {
      const loginData = {
        username: this.config.credentials!.username,
        password: this.config.credentials!.password,
      };

      const response = await this.makeRequest('POST', '/api/auth/login', loginData);

      if (response.statusCode !== 200) {
        throw new Error(`Login failed with status ${response.statusCode}: ${response.body}`);
      }

      let loginResult;
      try {
        loginResult = JSON.parse(response.body || '{}');
      } catch (error) {
        throw new Error('Login returned invalid JSON');
      }

      if (!loginResult.token && !loginResult.accessToken) {
        throw new Error('Login response missing authentication token');
      }

      // Store token for subsequent tests
      this.authToken = loginResult.token || loginResult.accessToken;

      return {
        message: 'Authentication successful',
        statusCode: response.statusCode,
        responseTime: response.responseTime,
      };
    });

    await this.runTest('Token Validation', async () => {
      if (!this.authToken) {
        throw new Error('No authentication token available');
      }

      const response = await this.makeRequest('GET', '/api/auth/profile', undefined, {
        Authorization: `Bearer ${this.authToken}`,
      });

      if (response.statusCode !== 200) {
        throw new Error(`Token validation failed with status ${response.statusCode}`);
      }

      return {
        message: 'Token validation successful',
        statusCode: response.statusCode,
        responseTime: response.responseTime,
      };
    });
  }

  /**
   * Test core endpoints
   */
  private async testCoreEndpoints(): Promise<void> {
    console.log('\n🎯 Testing Core Endpoints...');

    const endpoints = [
      { path: '/api', method: 'GET', auth: false, description: 'API Root' },
      { path: '/api/implants', method: 'GET', auth: true, description: 'Implants List' },
      { path: '/api/commands', method: 'GET', auth: true, description: 'Commands List' },
      { path: '/api/tasks', method: 'GET', auth: true, description: 'Tasks List' },
      { path: '/api/audit/logs', method: 'GET', auth: true, description: 'Audit Logs' },
    ];

    for (const endpoint of endpoints) {
      await this.runTest(
        `${endpoint.description} (${endpoint.method} ${endpoint.path})`,
        async () => {
          const headers: Record<string, string> = {};

          if (endpoint.auth && this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
          }

          const response = await this.makeRequest(
            endpoint.method as 'GET' | 'POST',
            endpoint.path,
            undefined,
            headers
          );

          // For authenticated endpoints without token, expect 401
          if (endpoint.auth && !this.authToken) {
            if (response.statusCode === 401) {
              return {
                message: 'Correctly requires authentication',
                statusCode: response.statusCode,
                responseTime: response.responseTime,
              };
            } else {
              throw new Error(
                `Expected 401 for unauthenticated request, got ${response.statusCode}`
              );
            }
          }

          // For valid requests, expect success or reasonable error
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) {
            return {
              message: `Endpoint accessible (HTTP ${response.statusCode})`,
              statusCode: response.statusCode,
              responseTime: response.responseTime,
            };
          } else {
            throw new Error(`Unexpected status code: ${response.statusCode}`);
          }
        }
      );
    }
  }

  /**
   * Test API documentation
   */
  private async testApiDocumentation(): Promise<void> {
    console.log('\n📚 Testing API Documentation...');

    await this.runTest('API Documentation', async () => {
      const response = await this.makeRequest('GET', '/api/docs');

      if (response.statusCode === 200) {
        return {
          message: 'API documentation is accessible',
          statusCode: response.statusCode,
          responseTime: response.responseTime,
        };
      } else if (response.statusCode === 404) {
        return {
          message: 'API documentation not found (may be disabled)',
          statusCode: response.statusCode,
          status: 'skipped',
        };
      } else {
        throw new Error(`Unexpected status code: ${response.statusCode}`);
      }
    });

    await this.runTest('OpenAPI Specification', async () => {
      const response = await this.makeRequest('GET', '/api/docs/swagger.json');

      if (response.statusCode === 200) {
        try {
          const spec = JSON.parse(response.body || '{}');
          if (spec.openapi || spec.swagger) {
            return {
              message: 'OpenAPI specification is available',
              statusCode: response.statusCode,
              responseTime: response.responseTime,
            };
          } else {
            throw new Error('Invalid OpenAPI specification format');
          }
        } catch (error) {
          throw new Error(`Invalid OpenAPI JSON: ${error}`);
        }
      } else if (response.statusCode === 404) {
        return {
          message: 'OpenAPI specification not found',
          statusCode: response.statusCode,
          status: 'skipped',
        };
      } else {
        throw new Error(`Unexpected status code: ${response.statusCode}`);
      }
    });
  }

  /**
   * Test security headers
   */
  private async testSecurityHeaders(): Promise<void> {
    console.log('\n🔒 Testing Security Headers...');

    await this.runTest('Security Headers', async () => {
      const response = await this.makeRequest('GET', '/api/health');

      const requiredHeaders = ['x-content-type-options', 'x-frame-options', 'x-xss-protection'];

      const missingHeaders = requiredHeaders.filter(header => !response.headers[header]);
      const presentHeaders = requiredHeaders.filter(header => response.headers[header]);

      if (missingHeaders.length > 0) {
        return {
          message: `Some security headers missing: ${missingHeaders.join(', ')}`,
          details: { present: presentHeaders, missing: missingHeaders },
          status: 'warning',
        };
      }

      return {
        message: 'All required security headers present',
        details: { headers: presentHeaders },
        responseTime: response.responseTime,
      };
    });

    await this.runTest('HTTPS Redirect', async () => {
      const url = new URL(this.config.baseUrl);

      if (url.protocol === 'https:') {
        // Test HTTP version to see if it redirects
        const httpUrl = this.config.baseUrl.replace('https://', 'http://');

        try {
          const response = await this.makeRequest('GET', '/', undefined, {}, httpUrl);

          if (response.statusCode === 301 || response.statusCode === 302) {
            return {
              message: 'HTTP properly redirects to HTTPS',
              statusCode: response.statusCode,
              responseTime: response.responseTime,
            };
          } else {
            return {
              message: 'HTTP does not redirect to HTTPS',
              statusCode: response.statusCode,
              status: 'warning',
            };
          }
        } catch (error) {
          return {
            message: 'HTTP endpoint not accessible (HTTPS only)',
            status: 'passed',
          };
        }
      } else {
        return {
          message: 'Service is running on HTTP (consider HTTPS for production)',
          status: 'warning',
        };
      }
    });
  }

  /**
   * Test response times
   */
  private async testResponseTimes(): Promise<void> {
    console.log('\n⚡ Testing Response Times...');

    await this.runTest('Average Response Time', async () => {
      const iterations = 5;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const response = await this.makeRequest('GET', '/api/health');
        if (response.responseTime) {
          responseTimes.push(response.responseTime);
        }
      }

      if (responseTimes.length === 0) {
        throw new Error('No response times recorded');
      }

      const avgResponseTime =
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);

      let status: 'passed' | 'warning' = 'passed';
      if (avgResponseTime > 1000) {
        status = 'warning';
      }

      return {
        message: `Average response time: ${avgResponseTime.toFixed(2)}ms`,
        responseTime: avgResponseTime,
        details: {
          average: avgResponseTime.toFixed(2) + 'ms',
          min: minResponseTime.toFixed(2) + 'ms',
          max: maxResponseTime.toFixed(2) + 'ms',
          samples: iterations,
        },
        status,
      };
    });

    await this.runTest('Concurrent Request Handling', async () => {
      const concurrentRequests = 10;
      const startTime = performance.now();

      const requests = Array(concurrentRequests)
        .fill(null)
        .map(() => this.makeRequest('GET', '/api/health'));

      const responses = await Promise.all(requests);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      const successfulResponses = responses.filter(r => r.statusCode === 200);
      const avgResponseTime = totalTime / concurrentRequests;

      if (successfulResponses.length < concurrentRequests) {
        throw new Error(
          `Only ${successfulResponses.length}/${concurrentRequests} requests succeeded`
        );
      }

      return {
        message: `Handled ${concurrentRequests} concurrent requests in ${totalTime.toFixed(2)}ms`,
        responseTime: avgResponseTime,
        details: {
          totalTime: totalTime.toFixed(2) + 'ms',
          avgPerRequest: avgResponseTime.toFixed(2) + 'ms',
          successRate: '100%',
        },
      };
    });
  }

  /**
   * Make HTTP request
   */
  private async makeRequest(
    method: 'GET' | 'POST',
    path: string,
    data?: any,
    headers: Record<string, string> = {},
    baseUrl?: string
  ): Promise<{
    statusCode?: number;
    body?: string;
    headers: Record<string, string>;
    responseTime?: number;
  }> {
    const url = new URL(path, baseUrl || this.config.baseUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'SeraphC2-SmokeTest/1.0',
      ...headers,
    };

    const requestData = data ? JSON.stringify(data) : undefined;
    if (requestData) {
      requestHeaders['Content-Length'] = Buffer.byteLength(requestData).toString();
    }

    return new Promise((resolve, reject) => {
      const startTime = performance.now();

      const request = client.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers: requestHeaders,
          timeout: this.config.timeout,
          rejectUnauthorized: false, // For self-signed certificates in testing
        },
        response => {
          let body = '';

          response.on('data', chunk => {
            body += chunk;
          });

          response.on('end', () => {
            const endTime = performance.now();
            const responseTime = endTime - startTime;

            resolve({
              statusCode: response.statusCode,
              body,
              headers: response.headers as Record<string, string>,
              responseTime,
            });
          });
        }
      );

      request.on('error', error => {
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        // Don't reject immediately, return error info
        resolve({
          statusCode: 0,
          body: error.message,
          headers: {},
          responseTime,
        });
      });

      request.on('timeout', () => {
        request.destroy();
        resolve({
          statusCode: 0,
          body: 'Request timeout',
          headers: {},
          responseTime: this.config.timeout,
        });
      });

      if (requestData) {
        request.write(requestData);
      }

      request.end();
    });
  }

  /**
   * Run a single test
   */
  private async runTest(testName: string, testFunction: () => Promise<any>): Promise<void> {
    const startTime = performance.now();

    try {
      const result = await testFunction();
      const endTime = performance.now();

      this.results.push({
        testName,
        status: result.status || 'passed',
        message: result.message,
        responseTime: result.responseTime || endTime - startTime,
        statusCode: result.statusCode,
      });

      const statusIcon =
        result.status === 'warning' ? '⚠️' : result.status === 'skipped' ? '⏭️' : '✅';
      console.log(`  ${statusIcon} ${testName}: ${result.message}`);
    } catch (error: any) {
      const endTime = performance.now();

      this.results.push({
        testName,
        status: 'failed',
        message: error.message,
        responseTime: endTime - startTime,
        error: error.message,
      });

      console.log(`  ❌ ${testName}: ${error.message}`);
    }
  }

  /**
   * Generate test report
   */
  private generateReport(): SmokeTestReport {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.status === 'passed').length;
    const failedTests = this.results.filter(r => r.status === 'failed').length;
    const skippedTests = this.results.filter(r => r.status === 'skipped').length;

    const overallStatus = failedTests > 0 ? 'unhealthy' : 'healthy';

    let summary = `${passedTests}/${totalTests} tests passed`;
    if (failedTests > 0) {
      summary += `, ${failedTests} failed`;
    }
    if (skippedTests > 0) {
      summary += `, ${skippedTests} skipped`;
    }

    return {
      timestamp: new Date().toISOString(),
      baseUrl: this.config.baseUrl,
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      overallStatus,
      results: this.results,
      summary,
    };
  }

  /**
   * Display test results
   */
  private displayResults(report: SmokeTestReport): void {
    console.log('\n' + '='.repeat(50));
    console.log('🔥 SMOKE TEST RESULTS');
    console.log('='.repeat(50));

    const statusIcon = report.overallStatus === 'healthy' ? '✅' : '❌';
    console.log(`${statusIcon} Overall Status: ${report.overallStatus.toUpperCase()}`);
    console.log(`📊 Summary: ${report.summary}`);

    if (report.failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      const failedTests = report.results.filter(r => r.status === 'failed');
      failedTests.forEach(test => {
        console.log(`   • ${test.testName}: ${test.message}`);
      });
    }

    const warningTests = report.results.filter(r => r.status === 'warning');
    if (warningTests.length > 0) {
      console.log('\n⚠️  Warnings:');
      warningTests.forEach(test => {
        console.log(`   • ${test.testName}: ${test.message}`);
      });
    }

    // Performance summary
    const responseTimes = report.results
      .map(r => r.responseTime)
      .filter(t => t !== undefined) as number[];

    if (responseTimes.length > 0) {
      const avgResponseTime =
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      console.log(`\n⚡ Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    }

    console.log(`\n🌐 Target URL: ${report.baseUrl}`);
    console.log(`⏰ Test Time: ${new Date(report.timestamp).toLocaleString()}`);
  }

  /**
   * Save report to file
   */
  async saveReport(report: SmokeTestReport, outputPath?: string): Promise<void> {
    const reportDir = path.join(process.cwd(), 'smoke-test-reports');

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = outputPath || `smoke-test-${timestamp}.json`;
    const filepath = path.join(reportDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Smoke test report saved: ${filepath}`);
  }
}

// CLI Interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const baseUrl =
    args.find(arg => arg.startsWith('--url='))?.split('=')[1] || 'http://localhost:3000';
  const timeout = parseInt(
    args.find(arg => arg.startsWith('--timeout='))?.split('=')[1] || '10000'
  );
  const retries = parseInt(args.find(arg => arg.startsWith('--retries='))?.split('=')[1] || '3');
  const username = args.find(arg => arg.startsWith('--username='))?.split('=')[1];
  const password = args.find(arg => arg.startsWith('--password='))?.split('=')[1];
  const skipAuth = args.includes('--skip-auth');
  const saveReport = args.includes('--save-report');

  const config: SmokeTestConfig = {
    baseUrl,
    timeout,
    retries,
    skipAuth,
    credentials: username && password ? { username, password } : undefined,
  };

  const runner = new SmokeTestRunner(config);

  try {
    const report = await runner.runSmokeTests();

    if (saveReport) {
      await runner.saveReport(report);
    }

    // Exit with appropriate code
    if (report.overallStatus === 'unhealthy') {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('Smoke tests failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { SmokeTestRunner, SmokeTestConfig, SmokeTestReport };
