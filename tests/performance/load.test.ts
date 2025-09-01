/**
 * Load Testing Suite for SeraphC2
 * Tests system performance under normal and high load conditions
 */

import { performance } from 'perf_hooks';
import axios, { AxiosResponse } from 'axios';
import { SeraphC2Server, ServerConfig } from '../../src/web/server';
import { PostgresOperatorRepository } from '../../src/core/repositories/operator.repository';
import { initializeDatabase } from '../../src/core/database';

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  duration: number;
}

interface LoadTestConfig {
  concurrentUsers: number;
  requestsPerUser: number;
  rampUpTime: number; // seconds
  testDuration: number; // seconds
}

describe('Load Testing Suite', () => {
  let server: SeraphC2Server;
  let baseUrl: string;
  const testPort = 3001;

  beforeAll(async () => {
    // Initialize test database
    await initializeDatabase();

    // Setup test server
    const operatorRepository = new PostgresOperatorRepository();
    const serverConfig: ServerConfig = {
      port: testPort,
      host: 'localhost',
      corsOrigins: ['http://localhost:3001'],
      enableRequestLogging: false, // Disable logging for performance tests
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

  describe('API Endpoint Load Tests', () => {
    test('Health endpoint load test - 100 concurrent users', async () => {
      const config: LoadTestConfig = {
        concurrentUsers: 100,
        requestsPerUser: 10,
        rampUpTime: 5,
        testDuration: 30,
      };

      const result = await runLoadTest(`${baseUrl}/api/health`, config);

      expect(result.successfulRequests).toBeGreaterThan(0);
      expect(result.averageResponseTime).toBeLessThan(1000); // Less than 1 second
      expect(result.requestsPerSecond).toBeGreaterThan(10);
      expect(result.failedRequests / result.totalRequests).toBeLessThan(0.01); // Less than 1% failure rate

      console.log('Health Endpoint Load Test Results:', result);
    }, 60000);

    test('Authentication endpoint load test - 50 concurrent users', async () => {
      const config: LoadTestConfig = {
        concurrentUsers: 50,
        requestsPerUser: 5,
        rampUpTime: 3,
        testDuration: 20,
      };

      const authData = {
        username: 'testuser',
        password: 'testpassword',
      };

      const result = await runLoadTestWithPayload(
        `${baseUrl}/api/auth/login`,
        'POST',
        authData,
        config
      );

      expect(result.averageResponseTime).toBeLessThan(2000); // Less than 2 seconds for auth
      expect(result.failedRequests / result.totalRequests).toBeLessThan(0.05); // Less than 5% failure rate

      console.log('Authentication Load Test Results:', result);
    }, 45000);

    test('Mixed endpoint load test - realistic usage pattern', async () => {
      const config: LoadTestConfig = {
        concurrentUsers: 25,
        requestsPerUser: 20,
        rampUpTime: 5,
        testDuration: 30,
      };

      const endpoints = [
        { url: `${baseUrl}/api/health`, method: 'GET', weight: 0.4 },
        { url: `${baseUrl}/api/operators`, method: 'GET', weight: 0.3 },
        { url: `${baseUrl}/api/implants`, method: 'GET', weight: 0.2 },
        { url: `${baseUrl}/api/tasks`, method: 'GET', weight: 0.1 },
      ];

      const result = await runMixedLoadTest(endpoints, config);

      expect(result.averageResponseTime).toBeLessThan(1500);
      expect(result.requestsPerSecond).toBeGreaterThan(5);
      expect(result.failedRequests / result.totalRequests).toBeLessThan(0.1); // Less than 10% failure rate

      console.log('Mixed Endpoint Load Test Results:', result);
    }, 60000);
  });

  describe('Database Load Tests', () => {
    test('Database connection pool under load', async () => {
      const config: LoadTestConfig = {
        concurrentUsers: 20,
        requestsPerUser: 15,
        rampUpTime: 2,
        testDuration: 15,
      };

      // Test endpoints that heavily use database
      const result = await runLoadTest(`${baseUrl}/api/operators`, config);

      expect(result.averageResponseTime).toBeLessThan(3000); // Database queries should be reasonable
      expect(result.failedRequests / result.totalRequests).toBeLessThan(0.05);

      console.log('Database Load Test Results:', result);
    }, 30000);
  });

  describe('Memory and Resource Tests', () => {
    test('Memory usage under sustained load', async () => {
      const initialMemory = process.memoryUsage();

      const config: LoadTestConfig = {
        concurrentUsers: 50,
        requestsPerUser: 30,
        rampUpTime: 5,
        testDuration: 60,
      };

      await runLoadTest(`${baseUrl}/api/health`, config);

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

      // Memory increase should be reasonable (less than 50% increase)
      expect(memoryIncreasePercent).toBeLessThan(50);

      console.log('Memory Usage Test Results:', {
        initialMemory: Math.round(initialMemory.heapUsed / 1024 / 1024),
        finalMemory: Math.round(finalMemory.heapUsed / 1024 / 1024),
        increase: Math.round(memoryIncrease / 1024 / 1024),
        increasePercent: Math.round(memoryIncreasePercent),
      });
    }, 90000);
  });
});

/**
 * Run a load test against a single endpoint
 */
async function runLoadTest(url: string, config: LoadTestConfig): Promise<LoadTestResult> {
  const results: number[] = [];
  const errors: Error[] = [];
  const startTime = performance.now();

  const promises: Promise<void>[] = [];

  for (let user = 0; user < config.concurrentUsers; user++) {
    const userPromise = (async () => {
      // Ramp up delay
      const rampUpDelay = (user / config.concurrentUsers) * config.rampUpTime * 1000;
      await new Promise(resolve => setTimeout(resolve, rampUpDelay));

      for (let request = 0; request < config.requestsPerUser; request++) {
        try {
          const requestStart = performance.now();
          await axios.get(url, { timeout: 10000 });
          const requestEnd = performance.now();
          results.push(requestEnd - requestStart);
        } catch (error) {
          errors.push(error as Error);
        }

        // Small delay between requests from same user
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    })();

    promises.push(userPromise);
  }

  await Promise.all(promises);

  const endTime = performance.now();
  const duration = (endTime - startTime) / 1000;

  return calculateResults(results, errors, duration);
}

/**
 * Run a load test with POST payload
 */
async function runLoadTestWithPayload(
  url: string,
  method: string,
  payload: any,
  config: LoadTestConfig
): Promise<LoadTestResult> {
  const results: number[] = [];
  const errors: Error[] = [];
  const startTime = performance.now();

  const promises: Promise<void>[] = [];

  for (let user = 0; user < config.concurrentUsers; user++) {
    const userPromise = (async () => {
      const rampUpDelay = (user / config.concurrentUsers) * config.rampUpTime * 1000;
      await new Promise(resolve => setTimeout(resolve, rampUpDelay));

      for (let request = 0; request < config.requestsPerUser; request++) {
        try {
          const requestStart = performance.now();

          if (method === 'POST') {
            await axios.post(url, payload, { timeout: 10000 });
          } else {
            await axios.get(url, { timeout: 10000 });
          }

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

  const endTime = performance.now();
  const duration = (endTime - startTime) / 1000;

  return calculateResults(results, errors, duration);
}

/**
 * Run a mixed load test with multiple endpoints
 */
async function runMixedLoadTest(
  endpoints: Array<{ url: string; method: string; weight: number }>,
  config: LoadTestConfig
): Promise<LoadTestResult> {
  const results: number[] = [];
  const errors: Error[] = [];
  const startTime = performance.now();

  const promises: Promise<void>[] = [];

  for (let user = 0; user < config.concurrentUsers; user++) {
    const userPromise = (async () => {
      const rampUpDelay = (user / config.concurrentUsers) * config.rampUpTime * 1000;
      await new Promise(resolve => setTimeout(resolve, rampUpDelay));

      for (let request = 0; request < config.requestsPerUser; request++) {
        try {
          // Select endpoint based on weight
          const random = Math.random();
          let cumulativeWeight = 0;
          let selectedEndpoint = endpoints[0];

          for (const endpoint of endpoints) {
            cumulativeWeight += endpoint.weight;
            if (random <= cumulativeWeight) {
              selectedEndpoint = endpoint;
              break;
            }
          }

          const requestStart = performance.now();
          await axios.get(selectedEndpoint.url, { timeout: 10000 });
          const requestEnd = performance.now();
          results.push(requestEnd - requestStart);
        } catch (error) {
          errors.push(error as Error);
        }

        await new Promise(resolve => setTimeout(resolve, 150));
      }
    })();

    promises.push(userPromise);
  }

  await Promise.all(promises);

  const endTime = performance.now();
  const duration = (endTime - startTime) / 1000;

  return calculateResults(results, errors, duration);
}

/**
 * Calculate test results from collected data
 */
function calculateResults(results: number[], errors: Error[], duration: number): LoadTestResult {
  const totalRequests = results.length + errors.length;
  const successfulRequests = results.length;
  const failedRequests = errors.length;

  if (results.length === 0) {
    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      requestsPerSecond: 0,
      duration,
    };
  }

  const averageResponseTime = results.reduce((sum, time) => sum + time, 0) / results.length;
  const minResponseTime = Math.min(...results);
  const maxResponseTime = Math.max(...results);
  const requestsPerSecond = totalRequests / duration;

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    averageResponseTime,
    minResponseTime,
    maxResponseTime,
    requestsPerSecond,
    duration,
  };
}
