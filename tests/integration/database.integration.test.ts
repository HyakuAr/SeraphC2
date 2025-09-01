/**
 * Database integration tests
 * These tests require a running PostgreSQL instance
 */

import { DatabaseConnection } from '../../src/core/database/connection';
import { MigrationManager } from '../../src/core/database/migrations';
import { initialSchemaMigration } from '../../src/core/database/schema/001_initial_schema';
import { PostgresImplantRepository } from '../../src/core/repositories/implant.repository';
import { PostgresOperatorRepository } from '../../src/core/repositories/operator.repository';
import { PostgresCommandRepository } from '../../src/core/repositories/command.repository';
import {
  ImplantStatus,
  PrivilegeLevel,
  Protocol,
  OperatorRole,
  CommandType,
  CreateImplantData,
  CreateOperatorData,
  CreateCommandData,
} from '../../src/types/entities';

// Skip these tests if not in integration test environment
const isIntegrationTest =
  process.env['NODE_ENV'] === 'test' && process.env['RUN_INTEGRATION_TESTS'] === 'true';

describe('Database Integration Tests', () => {
  let db: DatabaseConnection;
  let migrationManager: MigrationManager;
  let implantRepo: PostgresImplantRepository;
  let operatorRepo: PostgresOperatorRepository;
  let commandRepo: PostgresCommandRepository;

  beforeAll(async () => {
    if (!isIntegrationTest) {
      console.log('Skipping integration tests - set RUN_INTEGRATION_TESTS=true to run');
      return;
    }

    db = DatabaseConnection.getInstance();
    migrationManager = new MigrationManager();
    migrationManager.addMigration(initialSchemaMigration);

    implantRepo = new PostgresImplantRepository();
    operatorRepo = new PostgresOperatorRepository();
    commandRepo = new PostgresCommandRepository();

    // Connect and setup database
    await db.connect();
    await migrationManager.runMigrations();
  }, 30000);

  afterAll(async () => {
    if (!isIntegrationTest) return;

    // Clean up test data
    await db.query('TRUNCATE TABLE commands, implants, operators CASCADE');
    await db.disconnect();
  });

  beforeEach(async () => {
    if (!isIntegrationTest) return;

    // Clean up between tests
    await db.query('TRUNCATE TABLE commands, implants, operators CASCADE');
  });

  describe('Database Connection', () => {
    it('should connect to database successfully', async () => {
      if (!isIntegrationTest) return;

      expect(db.isHealthy()).toBe(true);

      const result = await db.query('SELECT NOW() as current_time');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_time).toBeInstanceOf(Date);
    });

    it('should execute transactions correctly', async () => {
      if (!isIntegrationTest) return;

      const result = await db.transaction(async client => {
        await client.query('CREATE TEMP TABLE test_transaction (id SERIAL PRIMARY KEY, name TEXT)');
        await client.query('INSERT INTO test_transaction (name) VALUES ($1)', ['test']);
        const selectResult = await client.query('SELECT * FROM test_transaction');
        return selectResult.rows[0];
      });

      expect(result.name).toBe('test');
    });
  });

  describe('Implant Repository Integration', () => {
    it('should create and retrieve implant', async () => {
      if (!isIntegrationTest) return;

      const implantData: CreateImplantData = {
        hostname: 'test-host',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: 'test-encryption-key',
        configuration: {
          callbackInterval: 5000,
          jitter: 10,
          maxRetries: 3,
        },
        systemInfo: {
          hostname: 'test-host',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel i7-8700K',
          memoryTotal: 16384,
          diskSpace: 500000,
          networkInterfaces: ['Ethernet', 'Wi-Fi'],
          installedSoftware: ['Chrome', 'Firefox'],
          runningProcesses: 150,
        },
      };

      const createdImplant = await implantRepo.create(implantData);

      expect(createdImplant.id).toBeDefined();
      expect(createdImplant.hostname).toBe(implantData.hostname);
      expect(createdImplant.status).toBe(ImplantStatus.ACTIVE);

      const retrievedImplant = await implantRepo.findById(createdImplant.id);
      expect(retrievedImplant).not.toBeNull();
      expect(retrievedImplant?.hostname).toBe(implantData.hostname);
    });

    it('should update implant status', async () => {
      if (!isIntegrationTest) return;

      const implantData: CreateImplantData = {
        hostname: 'test-host-2',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTP,
        encryptionKey: 'test-key',
        configuration: { callbackInterval: 5000, jitter: 10, maxRetries: 3 },
        systemInfo: {
          hostname: 'test-host-2',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel i5',
          memoryTotal: 8192,
          diskSpace: 250000,
          networkInterfaces: ['Ethernet'],
          installedSoftware: ['Chrome'],
          runningProcesses: 100,
        },
      };

      const implant = await implantRepo.create(implantData);

      await implantRepo.updateStatus(implant.id, ImplantStatus.INACTIVE);

      const updatedImplant = await implantRepo.findById(implant.id);
      expect(updatedImplant?.status).toBe(ImplantStatus.INACTIVE);
    });
  });

  describe('Operator Repository Integration', () => {
    it('should create and authenticate operator', async () => {
      if (!isIntegrationTest) return;

      const operatorData: CreateOperatorData = {
        username: 'testoperator',
        email: 'test@seraphc2.com',
        passwordHash: 'hashed_password_123',
        role: OperatorRole.OPERATOR,
        permissions: [
          { resource: 'implants', actions: ['read', 'write'] },
          { resource: 'commands', actions: ['read', 'write'] },
        ],
      };

      const createdOperator = await operatorRepo.create(operatorData);

      expect(createdOperator.id).toBeDefined();
      expect(createdOperator.username).toBe(operatorData.username);
      expect(createdOperator.isActive).toBe(true);

      const foundOperator = await operatorRepo.findByUsername(operatorData.username);
      expect(foundOperator).not.toBeNull();
      expect(foundOperator?.email).toBe(operatorData.email);
    });
  });

  describe('Command Repository Integration', () => {
    it('should create command with implant and operator relationship', async () => {
      if (!isIntegrationTest) return;

      // Create operator first
      const operatorData: CreateOperatorData = {
        username: 'cmdoperator',
        email: 'cmd@seraphc2.com',
        passwordHash: 'hashed_password',
        role: OperatorRole.OPERATOR,
      };
      const operator = await operatorRepo.create(operatorData);

      // Create implant
      const implantData: CreateImplantData = {
        hostname: 'cmd-test-host',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: 'test-key',
        configuration: { callbackInterval: 5000, jitter: 10, maxRetries: 3 },
        systemInfo: {
          hostname: 'cmd-test-host',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel i7',
          memoryTotal: 16384,
          diskSpace: 500000,
          networkInterfaces: ['Ethernet'],
          installedSoftware: ['Chrome'],
          runningProcesses: 120,
        },
      };
      const implant = await implantRepo.create(implantData);

      // Create command
      const commandData: CreateCommandData = {
        implantId: implant.id,
        operatorId: operator.id,
        type: CommandType.SHELL,
        payload: 'whoami',
      };

      const command = await commandRepo.create(commandData);

      expect(command.id).toBeDefined();
      expect(command.implantId).toBe(implant.id);
      expect(command.operatorId).toBe(operator.id);
      expect(command.payload).toBe('whoami');

      // Test finding commands by implant
      const implantCommands = await commandRepo.findByImplantId(implant.id);
      expect(implantCommands).toHaveLength(1);
      expect(implantCommands[0]?.id).toBe(command.id);
    });
  });
});

// Export test configuration for CI/CD
export const integrationTestConfig = {
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testEnvironment: 'node',
};
