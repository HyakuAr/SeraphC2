/**
 * Tests for backup codes repository
 */

import { PostgresBackupCodesRepository } from '../backup-codes.repository';
import * as bcrypt from 'bcrypt';

// Mock pg Pool
const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
} as any;

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

describe('PostgresBackupCodesRepository', () => {
  let repository: PostgresBackupCodesRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PostgresBackupCodesRepository(mockPool);
    mockPool.connect.mockResolvedValue(mockClient as any);
  });

  describe('create', () => {
    it('should create a backup code successfully', async () => {
      const mockRow = {
        id: 'backup-1',
        operator_id: 'operator-1',
        code_hash: 'hashed-code',
        is_used: false,
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockRow] });

      const result = await repository.create({
        operatorId: 'operator-1',
        code: 'ABCD1234',
      });

      expect(result.id).toBe('backup-1');
      expect(result.operatorId).toBe('operator-1');
      expect(result.isUsed).toBe(false);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO backup_codes'),
        expect.arrayContaining(['operator-1'])
      );
    });
  });

  describe('findByOperatorId', () => {
    it('should find backup codes for operator', async () => {
      const mockRows = [
        {
          id: 'backup-1',
          operator_id: 'operator-1',
          code_hash: 'hash1',
          is_used: false,
          created_at: new Date(),
        },
        {
          id: 'backup-2',
          operator_id: 'operator-1',
          code_hash: 'hash2',
          is_used: true,
          used_at: new Date(),
          created_at: new Date(),
        },
      ];

      mockPool.query.mockResolvedValue({ rows: mockRows });

      const result = await repository.findByOperatorId('operator-1');

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('backup-1');
      expect(result[0]!.isUsed).toBe(false);
      expect(result[1]!.id).toBe('backup-2');
      expect(result[1]!.isUsed).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM backup_codes'),
        ['operator-1']
      );
    });

    it('should return empty array if no codes found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await repository.findByOperatorId('operator-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('validateAndConsume', () => {
    it('should validate and consume a valid backup code', async () => {
      const code = 'ABCD1234';
      const hashedCode = await bcrypt.hash(code, 12);

      const mockRows = [
        {
          id: 'backup-1',
          operator_id: 'operator-1',
          code_hash: hashedCode,
          is_used: false,
          created_at: new Date(),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockRows }) // SELECT
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await repository.validateAndConsume('operator-1', code);

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE backup_codes'),
        expect.arrayContaining([expect.any(Date), 'backup-1'])
      );
    });

    it('should reject invalid backup code', async () => {
      const hashedCode = await bcrypt.hash('DIFFERENT', 12);

      const mockRows = [
        {
          id: 'backup-1',
          operator_id: 'operator-1',
          code_hash: hashedCode,
          is_used: false,
          created_at: new Date(),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockRows }) // SELECT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await repository.validateAndConsume('operator-1', 'ABCD1234');

      expect(result).toBe(false);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      // Should not call UPDATE since code doesn't match
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE backup_codes'),
        expect.anything()
      );
    });

    it('should return false if no unused codes found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT (no unused codes)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await repository.validateAndConsume('operator-1', 'ABCD1234');

      expect(result).toBe(false);
    });

    it('should handle database errors and rollback', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // SELECT fails

      await expect(repository.validateAndConsume('operator-1', 'ABCD1234')).rejects.toThrow(
        'Database error'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('deleteByOperatorId', () => {
    it('should delete all backup codes for operator', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await repository.deleteByOperatorId('operator-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM backup_codes WHERE operator_id = $1',
        ['operator-1']
      );
    });
  });

  describe('createMultiple', () => {
    it('should create multiple backup codes', async () => {
      const codes = ['ABCD1234', 'EFGH5678', 'IJKL9012'];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // DELETE existing
        .mockResolvedValueOnce({
          // INSERT 1
          rows: [
            {
              id: 'backup-1',
              operator_id: 'operator-1',
              code_hash: 'hash1',
              is_used: false,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          // INSERT 2
          rows: [
            {
              id: 'backup-2',
              operator_id: 'operator-1',
              code_hash: 'hash2',
              is_used: false,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          // INSERT 3
          rows: [
            {
              id: 'backup-3',
              operator_id: 'operator-1',
              code_hash: 'hash3',
              is_used: false,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await repository.createMultiple('operator-1', codes);

      expect(result).toHaveLength(3);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM backup_codes WHERE operator_id = $1',
        ['operator-1']
      );
      // Should have 3 INSERT calls
      expect(mockClient.query).toHaveBeenCalledTimes(6); // BEGIN + DELETE + 3 INSERTs + COMMIT
    });

    it('should handle errors and rollback transaction', async () => {
      const codes = ['ABCD1234'];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // DELETE
        .mockRejectedValueOnce(new Error('Insert failed')); // INSERT fails

      await expect(repository.createMultiple('operator-1', codes)).rejects.toThrow('Insert failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should delete existing codes before creating new ones', async () => {
      const codes = ['ABCD1234'];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // DELETE
        .mockResolvedValueOnce({
          // INSERT
          rows: [
            {
              id: 'backup-1',
              operator_id: 'operator-1',
              code_hash: 'hash1',
              is_used: false,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await repository.createMultiple('operator-1', codes);

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM backup_codes WHERE operator_id = $1',
        ['operator-1']
      );
    });
  });
});
