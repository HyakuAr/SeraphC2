/**
 * End-to-end performance validation tests
 * Tests basic performance benchmarks and load handling
 */

import request from 'supertest';
import { Application } from 'express';
import { getTestContainers, resetTestData } from '../helpers/testContainers';
import { SeraphC2Server } from '../../src/web/server';
import { PostgresOperatorRepository } from '../../src/core/repositories/operator.repository';

describe('End-to-End Performance Tests', () => {
  let app: Application;
  let server: SeraphC2Server;
  let operatorRepository: PostgresOperatorRepository;
  let adminToken: string;

  beforeAll(async () => {
    // Setup test containers
    const testContainers = getTestContainers();
    await testContainers.setup();
    await testContainers.runMigrations();

    // Get pool for potential future use
    testContainers.getPostgresPool();
    operatorRepository = new PostgresOperatorRepository();

    // Create server instance
    server = new SeraphC2Server(
      {
        port: 0,
        host: 'localhost',
        corsOrigins: ['http://localhost:3000'],
        enableRequestLogging: false, // Disable logging for performance tests
      },
      operatorRepository
    );

    app = server.getApp();

    // Setup test data and authentication
    await setupTestEnvironment();
  });

  beforeEach(async () => {
    await resetTestData();
    await setupTestEnvironment();
  });

  afterAll(async () => {
    const testContainers = getTestContainers();
    await testContainers.cleanup();
  });

  async function setupTestEnvironment() {
    const testContainers = getTestContainers();
    const seedData = await testContainers.seedData();

    // Get authentication tokens by logging in
    const authService = server.getAuthService();
    const adminOperator = seedData.operators.find(op => op.role === 'administrator');

    if (adminOperator) {
      const adminLoginResult = await authService.login({
        username: adminOperator.username,
        password: 'admin123', // Use test password
      });
      if (adminLoginResult.success && adminLoginResult.tokens) {
        adminToken = adminLoginResult.tokens.accessToken;
      }
    }
  }

  describe('API Response Time Benchmarks', () => {
    it('should respond to health checks within acceptable time', async () => {
      const iterations = 10;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        await request(app).get('/api/health').expect(200);

        const endTime = Date.now();
        responseTimes.push(endTime - startTime);
      }

      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      console.log(`Health check - Average: ${averageResponseTime}ms, Max: ${maxResponseTime}ms`);

      // Health checks should be very fast
      expect(averageResponseTime).toBeLessThan(100); // 100ms average
      expect(maxResponseTime).toBeLessThan(500); // 500ms max
    });

    it('should handle authentication requests efficiently', async () => {
      const iterations = 5;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        await request(app)
          .post('/api/auth/login')
          .send({
            username: 'admin',
            password: 'admin123',
          })
          .expect(200);

        const endTime = Date.now();
        responseTimes.push(endTime - startTime);
      }

      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      console.log(`Authentication - Average: ${averageResponseTime}ms, Max: ${maxResponseTime}ms`);

      // Authentication should be reasonably fast
      expect(averageResponseTime).toBeLessThan(500); // 500ms average
      expect(maxResponseTime).toBeLessThan(2000); // 2s max
    });

    it('should handle implant listing requests efficiently', async () => {
      const iterations = 10;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        await request(app)
          .get('/api/implants')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        const endTime = Date.now();
        responseTimes.push(endTime - startTime);
      }

      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      console.log(`Implant listing - Average: ${averageResponseTime}ms, Max: ${maxResponseTime}ms`);

      // Database queries should be reasonably fast
      expect(averageResponseTime).toBeLessThan(200); // 200ms average
      expect(maxResponseTime).toBeLessThan(1000); // 1s max
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent health checks', async () => {
      const concurrentRequests = 50;
      const startTime = Date.now();

      const requests = Array(concurrentRequests)
        .fill(null)
        .map(() => request(app).get('/api/health').expect(200));

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(`${concurrentRequests} concurrent health checks completed in ${totalTime}ms`);

      // All requests should succeed
      expect(responses.length).toBe(concurrentRequests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('healthy');
      });

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 50 requests
    });

    it('should handle concurrent authenticated requests', async () => {
      const concurrentRequests = 20;
      const startTime = Date.now();

      const requests = Array(concurrentRequests)
        .fill(null)
        .map(() =>
          request(app).get('/api/implants').set('Authorization', `Bearer ${adminToken}`).expect(200)
        );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(
        `${concurrentRequests} concurrent authenticated requests completed in ${totalTime}ms`
      );

      // All requests should succeed
      expect(responses.length).toBe(concurrentRequests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(10000); // 10 seconds for 20 requests
    });

    it('should handle concurrent command executions', async () => {
      // Get available implants first
      const implantsResponse = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(implantsResponse.body.data.length).toBeGreaterThan(0);
      const implantId = implantsResponse.body.data[0].id;

      const concurrentRequests = 10;
      const startTime = Date.now();

      const requests = Array(concurrentRequests)
        .fill(null)
        .map((_, index) =>
          request(app)
            .post('/api/commands')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              implant_id: implantId,
              command: `performance-test-command-${index}`,
            })
            .expect(201)
        );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(
        `${concurrentRequests} concurrent command executions completed in ${totalTime}ms`
      );

      // All requests should succeed
      expect(responses.length).toBe(concurrentRequests);
      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.command).toBe(`performance-test-command-${index}`);
      });

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(15000); // 15 seconds for 10 command executions
    });
  });

  describe('Database Performance', () => {
    it('should handle large result sets efficiently', async () => {
      // Create multiple implants for testing
      const implantCount = 50;
      const createPromises = [];

      for (let i = 0; i < implantCount; i++) {
        createPromises.push(
          request(app)
            .post('/api/implants')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              name: `perf-test-implant-${i}`,
              hostname: `host${i}.perf.test`,
              ip_address: `192.168.1.${100 + i}`,
              operating_system: 'Ubuntu 22.04',
              architecture: 'x64',
            })
            .expect(201)
        );
      }

      await Promise.all(createPromises);

      // Now test retrieval performance
      const startTime = Date.now();

      const response = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const endTime = Date.now();
      const queryTime = endTime - startTime;

      console.log(`Retrieved ${response.body.data.length} implants in ${queryTime}ms`);

      expect(response.body.data.length).toBeGreaterThanOrEqual(implantCount);
      expect(queryTime).toBeLessThan(2000); // Should retrieve 50+ records in under 2 seconds
    });

    it('should handle complex queries efficiently', async () => {
      // Create test data
      const implantResponse = await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'complex-query-test-implant',
          hostname: 'complex.test.com',
          ip_address: '192.168.1.200',
          operating_system: 'Windows 10',
          architecture: 'x64',
        })
        .expect(201);

      const implantId = implantResponse.body.data.id;

      // Create multiple commands
      const commandCount = 20;
      const commandPromises = [];

      for (let i = 0; i < commandCount; i++) {
        commandPromises.push(
          request(app)
            .post('/api/commands')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              implant_id: implantId,
              command: `complex-test-command-${i}`,
            })
            .expect(201)
        );
      }

      await Promise.all(commandPromises);

      // Test complex query performance
      const startTime = Date.now();

      const response = await request(app)
        .get(`/api/commands?implant_id=${implantId}&limit=50&sort=timestamp&order=desc`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const endTime = Date.now();
      const queryTime = endTime - startTime;

      console.log(
        `Complex query with filtering returned ${response.body.data.length} results in ${queryTime}ms`
      );

      expect(response.body.data.length).toBe(commandCount);
      expect(queryTime).toBeLessThan(1000); // Complex queries should complete in under 1 second
    });

    it('should handle database connection pooling efficiently', async () => {
      // Test multiple concurrent database operations
      const operations = 30;
      const startTime = Date.now();

      const requests = Array(operations)
        .fill(null)
        .map((_, index) => {
          if (index % 3 === 0) {
            // Read operation
            return request(app)
              .get('/api/implants')
              .set('Authorization', `Bearer ${adminToken}`)
              .expect(200);
          } else if (index % 3 === 1) {
            // Write operation
            return request(app)
              .post('/api/implants')
              .set('Authorization', `Bearer ${adminToken}`)
              .send({
                name: `pool-test-implant-${index}`,
                hostname: `pool${index}.test.com`,
                ip_address: `10.0.0.${index + 1}`,
                operating_system: 'CentOS 8',
                architecture: 'x64',
              })
              .expect(201);
          } else {
            // Health check (lightweight operation)
            return request(app).get('/api/health').expect(200);
          }
        });

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(`${operations} mixed database operations completed in ${totalTime}ms`);

      // All operations should succeed
      responses.forEach(response => {
        expect([200, 201]).toContain(response.status);
      });

      // Should handle connection pooling efficiently
      expect(totalTime).toBeLessThan(20000); // 20 seconds for 30 mixed operations
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should handle memory-intensive operations without leaks', async () => {
      const iterations = 100;
      const startMemory = process.memoryUsage();

      // Perform memory-intensive operations
      for (let i = 0; i < iterations; i++) {
        await request(app)
          .get('/api/implants')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        // Occasionally create and delete data
        if (i % 10 === 0) {
          const createResponse = await request(app)
            .post('/api/implants')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              name: `memory-test-implant-${i}`,
              hostname: `memory${i}.test.com`,
              ip_address: `172.16.0.${i + 1}`,
              operating_system: 'Debian 11',
              architecture: 'x64',
            })
            .expect(201);

          await request(app)
            .delete(`/api/implants/${createResponse.body.data.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        }
      }

      const endMemory = process.memoryUsage();
      const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / startMemory.heapUsed) * 100;

      console.log(`Memory usage after ${iterations} operations:`);
      console.log(`  Start: ${Math.round(startMemory.heapUsed / 1024 / 1024)}MB`);
      console.log(`  End: ${Math.round(endMemory.heapUsed / 1024 / 1024)}MB`);
      console.log(
        `  Increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB (${memoryIncreasePercent.toFixed(2)}%)`
      );

      // Memory increase should be reasonable (less than 50% increase)
      expect(memoryIncreasePercent).toBeLessThan(50);
    });

    it('should handle large payload processing efficiently', async () => {
      // Test with large command payloads
      const largePayloadSizes = [1024, 5120, 10240]; // 1KB, 5KB, 10KB

      for (const size of largePayloadSizes) {
        const largeCommand = 'echo "' + 'A'.repeat(size) + '"';
        const startTime = Date.now();

        const response = await request(app)
          .post('/api/commands')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            implant_id: '660e8400-e29b-41d4-a716-446655440001',
            command: largeCommand,
          })
          .expect(201);

        const endTime = Date.now();
        const processingTime = endTime - startTime;

        console.log(`${size} byte payload processed in ${processingTime}ms`);

        expect(response.body.success).toBe(true);
        expect(response.body.data.command).toBe(largeCommand);
        expect(processingTime).toBeLessThan(5000); // Should process large payloads in under 5 seconds
      }
    });
  });

  describe('Stress Testing', () => {
    it('should handle sustained load without degradation', async () => {
      const duration = 30000; // 30 seconds
      const requestInterval = 100; // Request every 100ms
      const startTime = Date.now();
      const responseTimes: number[] = [];
      const errors: any[] = [];

      console.log(`Starting ${duration / 1000}s sustained load test...`);

      while (Date.now() - startTime < duration) {
        const requestStart = Date.now();

        try {
          await request(app).get('/api/health').expect(200);

          const requestEnd = Date.now();
          responseTimes.push(requestEnd - requestStart);
        } catch (error) {
          errors.push(error);
        }

        // Wait for next interval
        const elapsed = Date.now() - requestStart;
        if (elapsed < requestInterval) {
          await new Promise(resolve => setTimeout(resolve, requestInterval - elapsed));
        }
      }

      const totalRequests = responseTimes.length + errors.length;
      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const errorRate = (errors.length / totalRequests) * 100;

      console.log(`Sustained load test results:`);
      console.log(`  Total requests: ${totalRequests}`);
      console.log(`  Successful requests: ${responseTimes.length}`);
      console.log(`  Failed requests: ${errors.length}`);
      console.log(`  Error rate: ${errorRate.toFixed(2)}%`);
      console.log(`  Average response time: ${averageResponseTime.toFixed(2)}ms`);

      // Performance should not degrade significantly under sustained load
      expect(errorRate).toBeLessThan(5); // Less than 5% error rate
      expect(averageResponseTime).toBeLessThan(200); // Average response time under 200ms
      expect(totalRequests).toBeGreaterThan(200); // Should handle at least 200 requests in 30 seconds
    });

    it('should recover gracefully from high load spikes', async () => {
      // Create a load spike
      const spikeRequests = 100;
      const spikeStartTime = Date.now();

      const spikePromises = Array(spikeRequests)
        .fill(null)
        .map(() => request(app).get('/api/implants').set('Authorization', `Bearer ${adminToken}`));

      const spikeResponses = await Promise.allSettled(spikePromises);
      const spikeEndTime = Date.now();
      const spikeDuration = spikeEndTime - spikeStartTime;

      const successfulSpikeRequests = spikeResponses.filter(
        result => result.status === 'fulfilled' && (result.value as any).status === 200
      ).length;

      console.log(
        `Load spike: ${successfulSpikeRequests}/${spikeRequests} requests succeeded in ${spikeDuration}ms`
      );

      // After spike, test normal operation recovery
      const recoveryStartTime = Date.now();

      const recoveryResponse = await request(app).get('/api/health').expect(200);

      const recoveryTime = Date.now() - recoveryStartTime;

      console.log(`Recovery time after load spike: ${recoveryTime}ms`);

      // Should handle most requests during spike and recover quickly
      expect(successfulSpikeRequests / spikeRequests).toBeGreaterThan(0.8); // At least 80% success rate
      expect(recoveryTime).toBeLessThan(1000); // Should recover within 1 second
      expect(recoveryResponse.body.status).toBe('healthy');
    });
  });
});
