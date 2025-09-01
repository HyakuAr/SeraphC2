/**
 * Database connection tests
 */

import { DatabaseConnection } from '../../../src/core/database/connection';

// Mock pg module
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [{ now: new Date() }] }),
      release: jest.fn(),
    }),
    end: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({ rows: [] }),
    on: jest.fn(),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
  })),
}));

describe('DatabaseConnection', () => {
  let dbConnection: DatabaseConnection;

  beforeEach(() => {
    // Reset singleton instance
    (DatabaseConnection as any).instance = undefined;
    dbConnection = DatabaseConnection.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = DatabaseConnection.getInstance();
      const instance2 = DatabaseConnection.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('connect', () => {
    it('should establish database connection successfully', async () => {
      await expect(dbConnection.connect()).resolves.not.toThrow();
      expect(dbConnection.isHealthy()).toBe(true);
    });

    it('should handle connection errors', async () => {
      const mockPool = {
        connect: jest.fn().mockRejectedValue(new Error('Connection failed')),
        on: jest.fn(),
      };

      (dbConnection as any).pool = mockPool;

      await expect(dbConnection.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnect', () => {
    it('should close database connection successfully', async () => {
      await dbConnection.connect();
      await expect(dbConnection.disconnect()).resolves.not.toThrow();
    });
  });

  describe('query', () => {
    it('should execute query successfully', async () => {
      await dbConnection.connect();

      const result = await dbConnection.query('SELECT NOW()');
      expect(result).toBeDefined();
    });

    it('should throw error when not connected', async () => {
      await expect(dbConnection.query('SELECT NOW()')).rejects.toThrow(
        'Database not connected. Call connect() first.'
      );
    });
  });

  describe('transaction', () => {
    it('should execute transaction successfully', async () => {
      await dbConnection.connect();

      const result = await dbConnection.transaction(async _client => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should rollback on error', async () => {
      await dbConnection.connect();

      const mockClient = {
        query: jest
          .fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockRejectedValueOnce(new Error('Query failed')) // User query
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn(),
      };

      (dbConnection as any).pool.connect = jest.fn().mockResolvedValue(mockClient);

      await expect(
        dbConnection.transaction(async _client => {
          throw new Error('Query failed');
        })
      ).rejects.toThrow('Query failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getPoolStats', () => {
    it('should return pool statistics', () => {
      const stats = dbConnection.getPoolStats();

      expect(stats).toEqual({
        totalCount: 5,
        idleCount: 3,
        waitingCount: 0,
      });
    });
  });
});
