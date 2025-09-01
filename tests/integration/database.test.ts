/**
 * Database integration tests
 * Tests database connections, queries, and data integrity
 */

import { Pool } from 'pg';
import { getTestContainers, resetTestData } from '../helpers/testContainers';
import { DatabaseService } from '../../src/core/database/database.service';
import { OperatorRepository } from '../../src/core/repositories/operator.repository';
import { ImplantRepository } from '../../src/core/repositories/implant.repository';
import { CommandRepository } from '../../src/core/repositories/command.repository';
import { AuditLogRepository } from '../../src/core/repositories/audit-log.repository';

describe('Database Integration Tests', () => {
  let pool: Pool;
  let databaseService: DatabaseService;
  let operatorRepository: OperatorRepository;
  let implantRepository: ImplantRepository;
  let commandRepository: CommandRepository;
  let auditLogRepository: AuditLogRepository;

  beforeAll(async () => {
    const testContainers = getTestContainers();
    await testContainers.setup();
    await testContainers.runMigrations();

    pool = testContainers.getPostgresPool();
    databaseService = new DatabaseService(pool);
    operatorRepository = new OperatorRepository(pool);
    implantRepository = new ImplantRepository(pool);
    commandRepository = new CommandRepository(pool);
    auditLogRepository = new AuditLogRepository(pool);
  });

  beforeEach(async () => {
    await resetTestData();
  });

  afterAll(async () => {
    const testContainers = getTestContainers();
    await testContainers.cleanup();
  });

  describe('Database Connection', () => {
    it('should connect to database successfully', async () => {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].now).toBeInstanceOf(Date);
    });

    it('should handle connection errors gracefully', async () => {
      // Create a pool with invalid configuration
      const invalidPool = new Pool({
        host: 'invalid-host',
        port: 9999,
        database: 'invalid-db',
        user: 'invalid-user',
        password: 'invalid-password',
        connectionTimeoutMillis: 1000,
      });

      await expect(invalidPool.connect()).rejects.toThrow();
      await invalidPool.end();
    });

    it('should maintain connection pool correctly', async () => {
      const connections = [];

      // Create multiple connections
      for (let i = 0; i < 5; i++) {
        const client = await pool.connect();
        connections.push(client);
      }

      // All connections should be valid
      for (const client of connections) {
        const result = await client.query('SELECT 1 as test');
        expect(result.rows[0].test).toBe(1);
      }

      // Release all connections
      for (const client of connections) {
        client.release();
      }
    });
  });

  describe('Database Service', () => {
    it('should execute queries successfully', async () => {
      const result = await databaseService.query('SELECT COUNT(*) as count FROM operators');
      expect(result.rows).toHaveLength(1);
      expect(typeof result.rows[0].count).toBe('string');
    });

    it('should handle parameterized queries', async () => {
      const result = await databaseService.query('SELECT * FROM operators WHERE role = $1', [
        'administrator',
      ]);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].role).toBe('administrator');
    });

    it('should handle query errors', async () => {
      await expect(databaseService.query('SELECT * FROM non_existent_table')).rejects.toThrow();
    });

    it('should support transactions', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Insert test operator
        const insertResult = await client.query(
          'INSERT INTO operators (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
          ['test_transaction', 'test@transaction.com', 'hash', 'operator']
        );

        const operatorId = insertResult.rows[0].id;

        // Verify insert within transaction
        const selectResult = await client.query('SELECT * FROM operators WHERE id = $1', [
          operatorId,
        ]);
        expect(selectResult.rows).toHaveLength(1);

        await client.query('ROLLBACK');

        // Verify rollback
        const rollbackResult = await client.query('SELECT * FROM operators WHERE id = $1', [
          operatorId,
        ]);
        expect(rollbackResult.rows).toHaveLength(0);
      } finally {
        client.release();
      }
    });
  });

  describe('Operator Repository', () => {
    it('should create operator successfully', async () => {
      const operatorData = {
        username: 'new_operator',
        email: 'new@operator.com',
        passwordHash: '$2b$10$hashedpassword',
        role: 'operator' as const,
      };

      const operator = await operatorRepository.create(operatorData);

      expect(operator.id).toBeDefined();
      expect(operator.username).toBe(operatorData.username);
      expect(operator.email).toBe(operatorData.email);
      expect(operator.role).toBe(operatorData.role);
      expect(operator.isActive).toBe(true);
      expect(operator.createdAt).toBeInstanceOf(Date);
    });

    it('should find operator by ID', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testOperator = seedData.operators[0];

      const operator = await operatorRepository.findById(testOperator.id);

      expect(operator).toBeDefined();
      expect(operator!.id).toBe(testOperator.id);
      expect(operator!.username).toBe(testOperator.username);
    });

    it('should find operator by username', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testOperator = seedData.operators[0];

      const operator = await operatorRepository.findByUsername(testOperator.username);

      expect(operator).toBeDefined();
      expect(operator!.id).toBe(testOperator.id);
      expect(operator!.username).toBe(testOperator.username);
    });

    it('should update operator successfully', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testOperator = seedData.operators[0];

      const updates = {
        email: 'updated@email.com',
        role: 'administrator' as const,
      };

      const updatedOperator = await operatorRepository.update(testOperator.id, updates);

      expect(updatedOperator.email).toBe(updates.email);
      expect(updatedOperator.role).toBe(updates.role);
      expect(updatedOperator.updatedAt).toBeInstanceOf(Date);
    });

    it('should delete operator successfully', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testOperator = seedData.operators[2]; // Use read-only user

      const deleted = await operatorRepository.delete(testOperator.id);
      expect(deleted).toBe(true);

      const operator = await operatorRepository.findById(testOperator.id);
      expect(operator).toBeNull();
    });

    it('should list operators with pagination', async () => {
      const result = await operatorRepository.list({ page: 1, pageSize: 2 });

      expect(result.operators).toHaveLength(2);
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
      expect(result.totalPages).toBeGreaterThanOrEqual(1);
    });

    it('should handle unique constraint violations', async () => {
      const operatorData = {
        username: 'admin', // Duplicate username
        email: 'duplicate@test.com',
        passwordHash: '$2b$10$hashedpassword',
        role: 'operator' as const,
      };

      await expect(operatorRepository.create(operatorData)).rejects.toThrow();
    });
  });

  describe('Implant Repository', () => {
    it('should create implant successfully', async () => {
      const implantData = {
        name: 'new-implant',
        hostname: 'new-host.test.com',
        ipAddress: '192.168.1.200',
        operatingSystem: 'Windows 11',
        architecture: 'x64',
        status: 'active' as const,
      };

      const implant = await implantRepository.create(implantData);

      expect(implant.id).toBeDefined();
      expect(implant.name).toBe(implantData.name);
      expect(implant.hostname).toBe(implantData.hostname);
      expect(implant.ipAddress).toBe(implantData.ipAddress);
      expect(implant.status).toBe(implantData.status);
      expect(implant.createdAt).toBeInstanceOf(Date);
    });

    it('should find implant by ID', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testImplant = seedData.implants[0];

      const implant = await implantRepository.findById(testImplant.id);

      expect(implant).toBeDefined();
      expect(implant!.id).toBe(testImplant.id);
      expect(implant!.name).toBe(testImplant.name);
    });

    it('should update implant status', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testImplant = seedData.implants[1]; // Inactive implant

      const updatedImplant = await implantRepository.updateStatus(testImplant.id, 'active');

      expect(updatedImplant.status).toBe('active');
      expect(updatedImplant.updatedAt).toBeInstanceOf(Date);
    });

    it('should list implants with filters', async () => {
      const result = await implantRepository.list({
        status: 'active',
        page: 1,
        pageSize: 10,
      });

      expect(result.implants.length).toBeGreaterThan(0);
      result.implants.forEach(implant => {
        expect(implant.status).toBe('active');
      });
    });

    it('should get implant statistics', async () => {
      const stats = await implantRepository.getStatistics();

      expect(stats).toMatchObject({
        total: expect.any(Number),
        active: expect.any(Number),
        inactive: expect.any(Number),
        byOperatingSystem: expect.any(Object),
        byArchitecture: expect.any(Object),
      });
    });
  });

  describe('Command Repository', () => {
    it('should create command successfully', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testImplant = seedData.implants[0];
      const testOperator = seedData.operators[1];

      const commandData = {
        implantId: testImplant.id,
        operatorId: testOperator.id,
        command: 'dir',
        status: 'pending' as const,
      };

      const command = await commandRepository.create(commandData);

      expect(command.id).toBeDefined();
      expect(command.implantId).toBe(commandData.implantId);
      expect(command.operatorId).toBe(commandData.operatorId);
      expect(command.command).toBe(commandData.command);
      expect(command.status).toBe(commandData.status);
      expect(command.timestamp).toBeInstanceOf(Date);
    });

    it('should update command result', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testCommand = seedData.commands[1]; // Pending command

      const result = 'C:\\Users\\test';
      const updatedCommand = await commandRepository.updateResult(
        testCommand.id,
        'completed',
        result
      );

      expect(updatedCommand.status).toBe('completed');
      expect(updatedCommand.result).toBe(result);
      expect(updatedCommand.completedAt).toBeInstanceOf(Date);
    });

    it('should list commands with filters', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testImplant = seedData.implants[0];

      const result = await commandRepository.list({
        implantId: testImplant.id,
        page: 1,
        pageSize: 10,
      });

      expect(result.commands.length).toBeGreaterThan(0);
      result.commands.forEach(command => {
        expect(command.implantId).toBe(testImplant.id);
      });
    });

    it('should get command statistics', async () => {
      const stats = await commandRepository.getStatistics();

      expect(stats).toMatchObject({
        total: expect.any(Number),
        pending: expect.any(Number),
        completed: expect.any(Number),
        failed: expect.any(Number),
        byImplant: expect.any(Object),
        byOperator: expect.any(Object),
      });
    });
  });

  describe('Audit Log Repository', () => {
    it('should create audit log successfully', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testOperator = seedData.operators[0];

      const auditData = {
        operatorId: testOperator.id,
        action: 'LOGIN',
        resourceType: 'OPERATOR',
        resourceId: testOperator.id,
        details: { method: 'password' },
        ipAddress: '192.168.1.100',
        userAgent: 'Test Agent',
        success: true,
      };

      const auditLog = await auditLogRepository.create(auditData);

      expect(auditLog.id).toBeDefined();
      expect(auditLog.operatorId).toBe(auditData.operatorId);
      expect(auditLog.action).toBe(auditData.action);
      expect(auditLog.resourceType).toBe(auditData.resourceType);
      expect(auditLog.success).toBe(auditData.success);
      expect(auditLog.timestamp).toBeInstanceOf(Date);
    });

    it('should list audit logs with filters', async () => {
      // Create some test audit logs first
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testOperator = seedData.operators[0];

      await auditLogRepository.create({
        operatorId: testOperator.id,
        action: 'CREATE_IMPLANT',
        resourceType: 'IMPLANT',
        resourceId: 'test-implant-id',
        details: {},
        ipAddress: '192.168.1.100',
        userAgent: 'Test Agent',
        success: true,
      });

      const result = await auditLogRepository.list({
        operatorId: testOperator.id,
        page: 1,
        pageSize: 10,
      });

      expect(result.logs.length).toBeGreaterThan(0);
      result.logs.forEach(log => {
        expect(log.operatorId).toBe(testOperator.id);
      });
    });

    it('should get audit statistics', async () => {
      const stats = await auditLogRepository.getStatistics();

      expect(stats).toMatchObject({
        total: expect.any(Number),
        successful: expect.any(Number),
        failed: expect.any(Number),
        byAction: expect.any(Object),
        byOperator: expect.any(Object),
      });
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity on cascade delete', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testImplant = seedData.implants[0];

      // Verify commands exist for the implant
      const commandsBefore = await commandRepository.list({
        implantId: testImplant.id,
        page: 1,
        pageSize: 100,
      });
      expect(commandsBefore.commands.length).toBeGreaterThan(0);

      // Delete the implant
      await implantRepository.delete(testImplant.id);

      // Verify commands are also deleted (cascade)
      const commandsAfter = await commandRepository.list({
        implantId: testImplant.id,
        page: 1,
        pageSize: 100,
      });
      expect(commandsAfter.commands.length).toBe(0);
    });

    it('should handle foreign key constraints', async () => {
      // Try to create command with non-existent implant
      const commandData = {
        implantId: '00000000-0000-0000-0000-000000000000',
        operatorId: '00000000-0000-0000-0000-000000000000',
        command: 'test',
        status: 'pending' as const,
      };

      await expect(commandRepository.create(commandData)).rejects.toThrow();
    });

    it('should handle concurrent updates correctly', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();
      const testImplant = seedData.implants[0];

      // Simulate concurrent status updates
      const updates = [
        implantRepository.updateStatus(testImplant.id, 'active'),
        implantRepository.updateStatus(testImplant.id, 'inactive'),
        implantRepository.updateStatus(testImplant.id, 'active'),
      ];

      const results = await Promise.allSettled(updates);

      // All updates should complete (last one wins)
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
      });

      // Verify final state
      const finalImplant = await implantRepository.findById(testImplant.id);
      expect(finalImplant).toBeDefined();
      expect(['active', 'inactive']).toContain(finalImplant!.status);
    });
  });

  describe('Performance', () => {
    it('should handle large result sets efficiently', async () => {
      // Create many test records
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          implantRepository.create({
            name: `perf-test-${i}`,
            hostname: `host-${i}.test.com`,
            ipAddress: `192.168.1.${i + 50}`,
            operatingSystem: 'Test OS',
            architecture: 'x64',
            status: 'active',
          })
        );
      }

      await Promise.all(promises);

      // Query with pagination
      const startTime = Date.now();
      const result = await implantRepository.list({
        page: 1,
        pageSize: 50,
      });
      const queryTime = Date.now() - startTime;

      expect(result.implants).toHaveLength(50);
      expect(queryTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should use database indexes effectively', async () => {
      const testContainers = getTestContainers();
      const seedData = await testContainers.seedData();

      // Query by indexed field (should be fast)
      const startTime = Date.now();
      const operator = await operatorRepository.findByUsername('admin');
      const queryTime = Date.now() - startTime;

      expect(operator).toBeDefined();
      expect(queryTime).toBeLessThan(100); // Should be very fast with index
    });
  });
});
