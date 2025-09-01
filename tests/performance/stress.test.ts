/**
 * Stress Testing Suite for SeraphC2
 * Tests system behavior under extreme load conditions and resource constraints
 */

import { performance } from 'perf_hooks';
import axios from 'axios';
import { SeraphC2Server, ServerConfig } from '../../src/web/server';
import { PostgresOperatorRepository } from '../../src/core/repositories/operator.repository';
import { initializeDatabase } from '../../src/core/database';

interface StressTestResult {
  phase: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  memoryUsage: NodeJS.MemoryUsage;
  duration: number;
}

interface StressTestConfig {
  initialUsers: number;
  maxUsers: number;
  userIncrement: number;
  phaseTime: number; // seconds per phase
  requestsPerUser: number;
}

describe('Stress Testing Suite', () => {
  let server: SeraphC2Server;
  let baseUrl: string;
  const testPort = 3002;

  beforeAll(async () => {
    // Initialize test database
    await initializeDatabase();

    // Setup test server with stress test configuration
    const operatorRepository = new PostgresOperatorRepository();
    const serverConfig: ServerConfig = {
      port: testPort,
      host: 'localhost',
      corsOrigins: ['http://localhost:3002'],
      enableRequestLogging: false, // Disable logging for stress tests
    };

    server = new SeraphC2Server(serverConfig, operatorRepository);
    await server.start();
    baseUrl = `http://localhost:${testPort}`;

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  }, 10000);

  describe('Progressive Load Stress Tests', () => {
    test('Progressive load increase until breaking point', async () => {
      const config: StressTestConfig = {
        initialUsers: 10,
        maxUsers: 200,
        userIncrement: 20,
        phaseTime: 15,
        requestsPerUser: 10,
      };

      const results = await runProgressiveStressTest(`${baseUrl}/api/health`, config);

      // Analyze results to find breaking point
      const breakingPoint = findBreakingPoint(results);

      expect(breakingPoint).toBeGreaterThan(config.initialUsers);
      expect(results.length).toBeGreaterThan(0);

      console.log('Progressive Stress Test Results:');
      results.forEach((result, index) => {
        console.log(
          `Phase ${index + 1}: ${result.phase} - RPS: ${result.requestsPerSecond.toFixed(2)}, Error Rate: ${(result.errorRate * 100).toFixed(2)}%`
        );
      });
      console.log(`Breaking point detected at: ${breakingPoint} concurrent users`);
    }, 300000); // 5 minutes timeout

    test('Spike load test - sudden traffic increase', async () => {
      const normalLoad = 20;
      const spikeLoad = 150;
      const spikeDuration = 30; // seconds

      // Run normal load
      console.log('Running normal load phase...');
      const normalResult = await runSpikePhase(`${baseUrl}/api/health`, normalLoad, 20);

      // Run spike load
      console.log('Running spike load phase...');
      const spikeResult = await runSpikePhase(`${baseUrl}/api/health`, spikeLoad, spikeDuration);

      // Run recovery phase
      console.log('Running recovery phase...');
      const recoveryResult = await runSpikePhase(`${baseUrl}/api/health`, normalLoad, 20);

      // Validate system recovery
      expect(spikeResult.errorRate).toBeLessThan(0.5); // Less than 50% error rate during spike
      expect(recoveryResult.errorRate).toBeLessThan(normalResult.errorRate * 2); // Recovery should be reasonable

      console.log('Spike Test Results:', {
        normal: {
          rps: normalResult.requestsPerSecond.toFixed(2),
          errorRate: (normalResult.errorRate * 100).toFixed(2) + '%',
        },
        spike: {
          rps: spikeResult.requestsPerSecond.toFixed(2),
          errorRate: (spikeResult.errorRate * 100).toFixed(2) + '%',
        },
        recovery: {
          rps: recoveryResult.requestsPerSecond.toFixed(2),
          errorRate: (recoveryResult.errorRate * 100).toFixed(2) + '%',
        },
      });
    }, 120000);
  });

  describe('Resource Exhaustion Tests', () => {
    test('Memory stress test - high concurrent connections', async () => {
      const initialMemory = process.memoryUsage();

      const config: StressTestConfig = {
        initialUsers: 50,
        maxUsers: 300,
        userIncrement: 50,
        phaseTime: 20,
        requestsPerUser: 5,
      };

      const results = await runMemoryStressTest(`${baseUrl}/api/health`, config);

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // System should handle memory pressure gracefully
      expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024); // Less than 500MB increase

      console.log('Memory Stress Test Results:', {
        initialMemoryMB: Math.round(initialMemory.heapUsed / 1024 / 1024),
        finalMemoryMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
        increaseMB: Math.round(memoryIncrease / 1024 / 1024),
        phases: results.length,
      });
    }, 180000);

    test('Connection pool exhaustion test', async () => {
      const concurrentUsers = 100;
      const requestsPerUser = 20;
      const testDuration = 60; // seconds

      const result = await runConnectionStressTest(
        `${baseUrl}/api/operators`, // Database-heavy endpoint
        concurrentUsers,
        requestsPerUser,
        testDuration
      );

      // System should handle connection pool pressure
      expect(result.errorRate).toBeLessThan(0.3); // Less than 30% error rate
      expect(result.averageResponseTime).toBeLessThan(10000); // Less than 10 seconds

      console.log('Connection Pool Stress Test Results:', {
        totalRequests: result.totalRequests,
        errorRate: (result.errorRate * 100).toFixed(2) + '%',
        avgResponseTime: result.averageResponseTime.toFixed(2) + 'ms',
        requestsPerSecond: result.requestsPerSecond.toFixed(2),
      });
    }, 90000);
  });

  describe('Endurance Tests', () => {
    test('Long-running stability test', async () => {
      const testDuration = 120; // 2 minutes
      const concurrentUsers = 30;
      const requestInterval = 2000; // 2 seconds between requests

      const result = await runEnduranceTest(
        `${baseUrl}/api/health`,
        concurrentUsers,
        testDuration,
        requestInterval
      );

      // System should maintain stability over time
      expect(result.errorRate).toBeLessThan(0.05); // Less than 5% error rate
      expect(result.averageResponseTime).toBeLessThan(2000); // Less than 2 seconds

      console.log('Endurance Test Results:', {
        duration: result.duration.toFixed(2) + 's',
        totalRequests: result.totalRequests,
        errorRate: (result.errorRate * 100).toFixed(2) + '%',
        avgResponseTime: result.averageResponseTime.toFixed(2) + 'ms',
        finalMemoryMB: Math.round(result.memoryUsage.heapUsed / 1024 / 1024),
      });
    }, 150000);
  });
});

/**
 * Run progressive stress test with increasing load
 */
async function runProgressiveStressTest(
  url: string,
  config: StressTestConfig
): Promise<StressTestResult[]> {
  const results: StressTestResult[] = [];

  for (let users = config.initialUsers; users <= config.maxUsers; users += config.userIncrement) {
    console.log(`Running stress test phase with ${users} users...`);

    const phaseResult = await runStressPhase(url, users, config.requestsPerUser, config.phaseTime);
    phaseResult.phase = `${users} users`;
    results.push(phaseResult);

    // Stop if error rate becomes too high (system is breaking)
    if (phaseResult.errorRate > 0.8) {
      console.log(
        `Stopping test due to high error rate: ${(phaseResult.errorRate * 100).toFixed(2)}%`
      );
      break;
    }

    // Brief pause between phases
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return results;
}

/**
 * Run a single stress test phase
 */
async function runStressPhase(
  url: string,
  concurrentUsers: number,
  requestsPerUser: number,
  duration: number
): Promise<StressTestResult> {
  const results: number[] = [];
  const errors: Error[] = [];
  const startTime = performance.now();
  const startMemory = process.memoryUsage();

  const promises: Promise<void>[] = [];

  for (let user = 0; user < concurrentUsers; user++) {
    const userPromise = (async () => {
      const userStartDelay = (user / concurrentUsers) * 1000; // Spread start over 1 second
      await new Promise(resolve => setTimeout(resolve, userStartDelay));

      for (let request = 0; request < requestsPerUser; request++) {
        try {
          const requestStart = performance.now();
          await axios.get(url, { timeout: 15000 });
          const requestEnd = performance.now();
          results.push(requestEnd - requestStart);
        } catch (error) {
          errors.push(error as Error);
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    })();

    promises.push(userPromise);
  }

  await Promise.all(promises);

  const endTime = performance.now();
  const testDuration = (endTime - startTime) / 1000;
  const endMemory = process.memoryUsage();

  const totalRequests = results.length + errors.length;
  const successfulRequests = results.length;
  const failedRequests = errors.length;
  const errorRate = totalRequests > 0 ? failedRequests / totalRequests : 0;

  const averageResponseTime =
    results.length > 0 ? results.reduce((sum, time) => sum + time, 0) / results.length : 0;
  const maxResponseTime = results.length > 0 ? Math.max(...results) : 0;
  const requestsPerSecond = totalRequests / testDuration;

  return {
    phase: `${concurrentUsers} users`,
    totalRequests,
    successfulRequests,
    failedRequests,
    averageResponseTime,
    maxResponseTime,
    requestsPerSecond,
    errorRate,
    memoryUsage: endMemory,
    duration: testDuration,
  };
}

/**
 * Run spike test phase
 */
async function runSpikePhase(
  url: string,
  concurrentUsers: number,
  duration: number
): Promise<StressTestResult> {
  const results: number[] = [];
  const errors: Error[] = [];
  const startTime = performance.now();
  const endTime = startTime + duration * 1000;

  const promises: Promise<void>[] = [];

  for (let user = 0; user < concurrentUsers; user++) {
    const userPromise = (async () => {
      while (performance.now() < endTime) {
        try {
          const requestStart = performance.now();
          await axios.get(url, { timeout: 10000 });
          const requestEnd = performance.now();
          results.push(requestEnd - requestStart);
        } catch (error) {
          errors.push(error as Error);
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }
    })();

    promises.push(userPromise);
  }

  await Promise.all(promises);

  const actualDuration = (performance.now() - startTime) / 1000;
  const totalRequests = results.length + errors.length;

  return {
    phase: `spike-${concurrentUsers}`,
    totalRequests,
    successfulRequests: results.length,
    failedRequests: errors.length,
    averageResponseTime:
      results.length > 0 ? results.reduce((sum, time) => sum + time, 0) / results.length : 0,
    maxResponseTime: results.length > 0 ? Math.max(...results) : 0,
    requestsPerSecond: totalRequests / actualDuration,
    errorRate: totalRequests > 0 ? errors.length / totalRequests : 0,
    memoryUsage: process.memoryUsage(),
    duration: actualDuration,
  };
}

/**
 * Run memory stress test
 */
async function runMemoryStressTest(
  url: string,
  config: StressTestConfig
): Promise<StressTestResult[]> {
  const results: StressTestResult[] = [];

  for (let users = config.initialUsers; users <= config.maxUsers; users += config.userIncrement) {
    const result = await runStressPhase(url, users, config.requestsPerUser, config.phaseTime);
    results.push(result);

    // Monitor memory usage
    const memoryMB = Math.round(result.memoryUsage.heapUsed / 1024 / 1024);
    console.log(
      `Phase ${users} users: Memory usage: ${memoryMB}MB, Error rate: ${(result.errorRate * 100).toFixed(2)}%`
    );

    // Stop if memory usage becomes excessive
    if (result.memoryUsage.heapUsed > 1024 * 1024 * 1024) {
      // 1GB
      console.log('Stopping test due to high memory usage');
      break;
    }
  }

  return results;
}

/**
 * Run connection stress test
 */
async function runConnectionStressTest(
  url: string,
  concurrentUsers: number,
  requestsPerUser: number,
  duration: number
): Promise<StressTestResult> {
  return runStressPhase(url, concurrentUsers, requestsPerUser, duration);
}

/**
 * Run endurance test
 */
async function runEnduranceTest(
  url: string,
  concurrentUsers: number,
  duration: number,
  requestInterval: number
): Promise<StressTestResult> {
  const results: number[] = [];
  const errors: Error[] = [];
  const startTime = performance.now();
  const endTime = startTime + duration * 1000;

  const promises: Promise<void>[] = [];

  for (let user = 0; user < concurrentUsers; user++) {
    const userPromise = (async () => {
      while (performance.now() < endTime) {
        try {
          const requestStart = performance.now();
          await axios.get(url, { timeout: 10000 });
          const requestEnd = performance.now();
          results.push(requestEnd - requestStart);
        } catch (error) {
          errors.push(error as Error);
        }

        await new Promise(resolve => setTimeout(resolve, requestInterval));
      }
    })();

    promises.push(userPromise);
  }

  await Promise.all(promises);

  const actualDuration = (performance.now() - startTime) / 1000;
  const totalRequests = results.length + errors.length;

  return {
    phase: 'endurance',
    totalRequests,
    successfulRequests: results.length,
    failedRequests: errors.length,
    averageResponseTime:
      results.length > 0 ? results.reduce((sum, time) => sum + time, 0) / results.length : 0,
    maxResponseTime: results.length > 0 ? Math.max(...results) : 0,
    requestsPerSecond: totalRequests / actualDuration,
    errorRate: totalRequests > 0 ? errors.length / totalRequests : 0,
    memoryUsage: process.memoryUsage(),
    duration: actualDuration,
  };
}

/**
 * Find breaking point from stress test results
 */
function findBreakingPoint(results: StressTestResult[]): number {
  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    // Consider breaking point when error rate exceeds 50% or response time exceeds 10 seconds
    if (result.errorRate > 0.5 || result.averageResponseTime > 10000) {
      const users = parseInt(result.phase.split(' ')[0]);
      return users;
    }
  }

  // If no breaking point found, return the maximum tested
  if (results.length > 0) {
    const lastResult = results[results.length - 1];
    return parseInt(lastResult.phase.split(' ')[0]);
  }

  return 0;
}
