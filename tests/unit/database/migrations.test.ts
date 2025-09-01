/**
 * Migration manager tests
 */

import { MigrationManager, Migration } from '../../../src/core/database/migrations';
import { DatabaseConnection } from '../../../src/core/database/connection';

// Mock DatabaseConnection
jest.mock('../../../src/core/database/connection');

describe('MigrationManager', () => {
  let migrationManager: MigrationManager;
  let mockDb: jest.Mocked<DatabaseConnection>;
  let mockClient: any;

  const testMigration: Migration = {
    id: '001',
    name: 'Test Migration',
    up: jest.fn().mockResolvedValue(undefined),
    down: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      transaction: jest.fn().mockImplementation(async callback => {
        return callback(mockClient);
      }),
    } as any;

    (DatabaseConnection.getInstance as jest.Mock).mockReturnValue(mockDb);

    migrationManager = new MigrationManager();
    migrationManager.addMigration(testMigration);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeMigrationTable', () => {
    it('should create migrations table', async () => {
      await migrationManager.initializeMigrationTable();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS migrations')
      );
    });
  });

  describe('getExecutedMigrations', () => {
    it('should return list of executed migration IDs', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ id: '001' }, { id: '002' }],
      });

      const executed = await migrationManager.getExecutedMigrations();

      expect(executed).toEqual(['001', '002']);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT id FROM migrations ORDER BY executed_at ASC'
      );
    });
  });

  describe('executeMigration', () => {
    it('should execute migration and record it', async () => {
      await migrationManager.executeMigration(testMigration);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(testMigration.up).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO migrations (id, name) VALUES ($1, $2)',
        ['001', 'Test Migration']
      );
    });
  });

  describe('rollbackMigration', () => {
    it('should rollback migration and remove record', async () => {
      await migrationManager.rollbackMigration(testMigration);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(testMigration.down).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM migrations WHERE id = $1', [
        '001',
      ]);
    });
  });

  describe('runMigrations', () => {
    it('should run pending migrations', async () => {
      // Mock no executed migrations
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // initializeMigrationTable
        .mockResolvedValueOnce({ rows: [] }); // getExecutedMigrations

      const executeSpy = jest
        .spyOn(migrationManager, 'executeMigration')
        .mockResolvedValue(undefined);

      await migrationManager.runMigrations();

      expect(executeSpy).toHaveBeenCalledWith(testMigration);
    });

    it('should skip already executed migrations', async () => {
      // Mock migration already executed
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // initializeMigrationTable
        .mockResolvedValueOnce({ rows: [{ id: '001' }] }); // getExecutedMigrations

      const executeSpy = jest
        .spyOn(migrationManager, 'executeMigration')
        .mockResolvedValue(undefined);

      await migrationManager.runMigrations();

      expect(executeSpy).not.toHaveBeenCalled();
    });

    it('should handle migration errors', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // initializeMigrationTable
        .mockResolvedValueOnce({ rows: [] }); // getExecutedMigrations

      const error = new Error('Migration failed');
      jest.spyOn(migrationManager, 'executeMigration').mockRejectedValue(error);

      await expect(migrationManager.runMigrations()).rejects.toThrow('Migration failed');
    });
  });

  describe('rollbackLastMigration', () => {
    it('should rollback the last executed migration', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ id: '001' }] });

      const rollbackSpy = jest
        .spyOn(migrationManager, 'rollbackMigration')
        .mockResolvedValue(undefined);

      await migrationManager.rollbackLastMigration();

      expect(rollbackSpy).toHaveBeenCalledWith(testMigration);
    });

    it('should handle no migrations to rollback', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const rollbackSpy = jest.spyOn(migrationManager, 'rollbackMigration');

      await migrationManager.rollbackLastMigration();

      expect(rollbackSpy).not.toHaveBeenCalled();
    });

    it('should throw error if migration not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ id: '999' }] });

      await expect(migrationManager.rollbackLastMigration()).rejects.toThrow(
        'Migration not found: 999'
      );
    });
  });
});
