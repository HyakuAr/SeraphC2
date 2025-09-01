import {
  BackupService,
  BackupType,
  ComponentType,
  RestoreOptions,
} from '../../../src/core/incident/backup.service';
import { DatabaseService } from '../../../src/core/database/database.service';
import { CryptoService } from '../../../src/core/crypto/crypto.service';
import { promises as fs } from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('../../../src/core/database/database.service');
jest.mock('../../../src/core/crypto/crypto.service');
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    rmdir: jest.fn(),
  },
}));

describe('BackupService', () => {
  let backupService: BackupService;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockCryptoService: jest.Mocked<CryptoService>;
  let mockFs: jest.Mocked<typeof fs>;

  const mockConfig = {
    backupDirectory: '/test/backups',
    retentionDays: 30,
    compressionLevel: 6,
    encryptionEnabled: true,
    maxBackupSize: 1024 * 1024 * 1024, // 1GB
    scheduledBackupInterval: 24 * 60 * 60 * 1000, // 24 hours
  };

  beforeEach(() => {
    jest.useFakeTimers();

    mockDatabaseService = new DatabaseService({} as any) as jest.Mocked<DatabaseService>;
    mockCryptoService = new CryptoService() as jest.Mocked<CryptoService>;
    mockFs = fs as jest.Mocked<typeof fs>;

    // Setup default mock implementations
    mockDatabaseService.query = jest.fn().mockResolvedValue({ rows: [] });
    mockDatabaseService.exportDatabase = jest.fn().mockResolvedValue('-- Database dump');
    mockDatabaseService.importDatabase = jest.fn().mockResolvedValue(undefined);
    mockDatabaseService.getConfiguration = jest.fn().mockResolvedValue({ setting: 'value' });

    mockCryptoService.encrypt = jest
      .fn()
      .mockImplementation(async data => Buffer.concat([Buffer.from('encrypted:'), data]));
    mockCryptoService.decrypt = jest.fn().mockImplementation(async data => data.slice(10)); // Remove 'encrypted:' prefix
    mockCryptoService.hash = jest.fn().mockResolvedValue('test-hash');
    mockCryptoService.exportKeys = jest.fn().mockResolvedValue({ key1: 'value1' });
    mockCryptoService.importKeys = jest.fn().mockResolvedValue(undefined);

    mockFs.mkdir = jest.fn().mockResolvedValue(undefined);
    mockFs.writeFile = jest.fn().mockResolvedValue(undefined);
    mockFs.readFile = jest.fn().mockResolvedValue(Buffer.from('test data'));
    mockFs.rmdir = jest.fn().mockResolvedValue(undefined);

    backupService = new BackupService(mockConfig, mockDatabaseService, mockCryptoService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize backup directory', () => {
      expect(mockFs.mkdir).toHaveBeenCalledWith(mockConfig.backupDirectory, { recursive: true });
    });

    it('should load existing backups from database', () => {
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'SELECT * FROM backup_metadata ORDER BY created_at DESC'
      );
    });

    it('should start scheduled backups if interval is configured', () => {
      expect(backupService['scheduledBackupTimer']).toBeDefined();
    });
  });

  describe('emergency backup creation', () => {
    it('should create emergency backup with all critical components', async () => {
      const description = 'Test emergency backup';
      const backupId = await backupService.createEmergencyBackup(description);

      expect(backupId).toBeDefined();
      expect(backupId).toMatch(/^backup_/);

      // Verify all critical components were backed up
      expect(mockDatabaseService.exportDatabase).toHaveBeenCalled();
      expect(mockDatabaseService.getConfiguration).toHaveBeenCalled();
      expect(mockCryptoService.exportKeys).toHaveBeenCalled();

      // Verify database queries for implant and operator data
      expect(mockDatabaseService.query).toHaveBeenCalledWith('SELECT * FROM implants');
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'SELECT id, username, email, role, permissions, created_at FROM operators'
      );

      // Verify files were written
      expect(mockFs.writeFile).toHaveBeenCalledTimes(6); // 5 components + manifest

      // Verify backup metadata was persisted
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO backup_metadata'),
        expect.arrayContaining([backupId, BackupType.EMERGENCY])
      );
    });

    it('should encrypt backup components when encryption is enabled', async () => {
      const backupId = await backupService.createEmergencyBackup();

      // Verify encryption was called for each component (except crypto keys which are always encrypted)
      expect(mockCryptoService.encrypt).toHaveBeenCalledTimes(5); // 4 regular components + crypto keys
    });

    it('should handle backup creation failure and cleanup', async () => {
      mockDatabaseService.exportDatabase.mockRejectedValueOnce(new Error('Database export failed'));

      await expect(backupService.createEmergencyBackup()).rejects.toThrow('Database export failed');

      // Verify cleanup was attempted
      expect(mockFs.rmdir).toHaveBeenCalledWith(expect.stringContaining('/test/backups/backup_'), {
        recursive: true,
      });
    });

    it('should emit backup created event', async () => {
      const eventSpy = jest.fn();
      backupService.on('backup:created', eventSpy);

      const backupId = await backupService.createEmergencyBackup();

      expect(eventSpy).toHaveBeenCalledWith({
        backupId,
        type: BackupType.EMERGENCY,
        metadata: expect.objectContaining({
          id: backupId,
          type: BackupType.EMERGENCY,
        }),
      });
    });
  });

  describe('full backup creation', () => {
    it('should create full backup including logs', async () => {
      const description = 'Test full backup';
      const backupId = await backupService.createFullBackup(description);

      expect(backupId).toBeDefined();

      // Verify all components including logs were backed up
      expect(mockFs.writeFile).toHaveBeenCalledTimes(7); // 6 components + manifest

      // Verify backup type is FULL
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO backup_metadata'),
        expect.arrayContaining([backupId, BackupType.FULL])
      );
    });
  });

  describe('backup restoration', () => {
    beforeEach(() => {
      // Mock manifest file content
      const mockManifest = {
        version: '1.0',
        createdAt: new Date(),
        type: BackupType.EMERGENCY,
        components: [
          {
            name: 'Database',
            type: ComponentType.DATABASE,
            size: 1000,
            checksum: 'test-hash',
            encrypted: true,
            filePath: '/test/backups/backup_123/database.sql.gz',
          },
          {
            name: 'Configuration',
            type: ComponentType.CONFIGURATION,
            size: 500,
            checksum: 'test-hash',
            encrypted: true,
            filePath: '/test/backups/backup_123/config.json.gz',
          },
        ],
        metadata: {},
      };

      mockFs.readFile = jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify(mockManifest)) // manifest.json
        .mockResolvedValue(Buffer.from('test data')); // component files
    });

    it('should restore from backup successfully', async () => {
      // Create a backup first to have metadata
      const backupId = await backupService.createEmergencyBackup();

      const options: RestoreOptions = {
        backupId,
        overwriteExisting: true,
        validateIntegrity: false,
      };

      const result = await backupService.restoreFromBackup(options);

      expect(result.success).toBe(true);
      expect(result.restoredComponents).toContain(ComponentType.DATABASE);
      expect(result.failedComponents).toHaveLength(0);
      expect(result.errors).toHaveLength(0);

      // Verify database import was called
      expect(mockDatabaseService.importDatabase).toHaveBeenCalled();
      expect(mockCryptoService.importKeys).toHaveBeenCalled();
    });

    it('should validate backup integrity when requested', async () => {
      const backupId = await backupService.createEmergencyBackup();

      const options: RestoreOptions = {
        backupId,
        overwriteExisting: true,
        validateIntegrity: true,
      };

      await backupService.restoreFromBackup(options);

      // Verify checksums were calculated for validation
      expect(mockCryptoService.hash).toHaveBeenCalled();
    });

    it('should handle partial restoration failures', async () => {
      const backupId = await backupService.createEmergencyBackup();

      // Mock database import failure
      mockDatabaseService.importDatabase.mockRejectedValueOnce(new Error('Import failed'));

      const options: RestoreOptions = {
        backupId,
        overwriteExisting: true,
        validateIntegrity: false,
      };

      const result = await backupService.restoreFromBackup(options);

      expect(result.success).toBe(false);
      expect(result.failedComponents).toContain(ComponentType.DATABASE);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to restore component database');
    });

    it('should restore only specified components', async () => {
      const backupId = await backupService.createEmergencyBackup();

      const options: RestoreOptions = {
        backupId,
        components: [ComponentType.CONFIGURATION],
        overwriteExisting: true,
        validateIntegrity: false,
      };

      const result = await backupService.restoreFromBackup(options);

      expect(result.success).toBe(true);
      expect(result.restoredComponents).toEqual([ComponentType.CONFIGURATION]);
      expect(mockDatabaseService.importDatabase).not.toHaveBeenCalled();
    });

    it('should throw error for non-existent backup', async () => {
      const options: RestoreOptions = {
        backupId: 'non-existent',
        overwriteExisting: true,
        validateIntegrity: false,
      };

      await expect(backupService.restoreFromBackup(options)).rejects.toThrow(
        'Backup non-existent not found'
      );
    });

    it('should emit backup restored event', async () => {
      const backupId = await backupService.createEmergencyBackup();
      const eventSpy = jest.fn();
      backupService.on('backup:restored', eventSpy);

      const options: RestoreOptions = {
        backupId,
        overwriteExisting: true,
        validateIntegrity: false,
      };

      await backupService.restoreFromBackup(options);

      expect(eventSpy).toHaveBeenCalledWith({
        backupId,
        result: expect.objectContaining({
          success: true,
        }),
      });
    });
  });

  describe('backup management', () => {
    it('should list backups with optional filtering', async () => {
      // Create different types of backups
      await backupService.createEmergencyBackup();
      await backupService.createFullBackup();

      const allBackups = backupService.listBackups();
      expect(allBackups).toHaveLength(2);

      const emergencyBackups = backupService.listBackups(BackupType.EMERGENCY);
      expect(emergencyBackups).toHaveLength(1);
      expect(emergencyBackups[0].type).toBe(BackupType.EMERGENCY);
    });

    it('should delete backup and cleanup files', async () => {
      const backupId = await backupService.createEmergencyBackup();

      const deleted = await backupService.deleteBackup(backupId);

      expect(deleted).toBe(true);

      // Verify files were deleted
      expect(mockFs.rmdir).toHaveBeenCalledWith(path.join(mockConfig.backupDirectory, backupId), {
        recursive: true,
      });

      // Verify database record was deleted
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'DELETE FROM backup_metadata WHERE id = $1',
        [backupId]
      );

      // Verify backup is no longer in memory
      const backups = backupService.listBackups();
      expect(backups.find(b => b.id === backupId)).toBeUndefined();
    });

    it('should return false when deleting non-existent backup', async () => {
      const deleted = await backupService.deleteBackup('non-existent');
      expect(deleted).toBe(false);
    });

    it('should handle file deletion errors gracefully', async () => {
      const backupId = await backupService.createEmergencyBackup();

      mockFs.rmdir.mockRejectedValueOnce(new Error('File deletion failed'));

      const deleted = await backupService.deleteBackup(backupId);
      expect(deleted).toBe(false);
    });
  });

  describe('backup cleanup', () => {
    it('should cleanup expired backups', async () => {
      // Create backup and manually set expiration date in the past
      const backupId = await backupService.createEmergencyBackup();
      const backup = backupService.listBackups().find(b => b.id === backupId)!;
      backup.expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

      const cleaned = await backupService.cleanupExpiredBackups();

      expect(cleaned).toBe(1);
      expect(mockFs.rmdir).toHaveBeenCalled();
    });

    it('should not cleanup non-expired backups', async () => {
      await backupService.createEmergencyBackup();

      const cleaned = await backupService.cleanupExpiredBackups();

      expect(cleaned).toBe(0);
    });
  });

  describe('scheduled backups', () => {
    it('should create scheduled backups at configured interval', async () => {
      // Fast-forward time to trigger scheduled backup
      jest.advanceTimersByTime(mockConfig.scheduledBackupInterval);

      // Wait for async operations
      await jest.runAllTimersAsync();

      // Verify full backup was created
      expect(mockDatabaseService.exportDatabase).toHaveBeenCalled();
    });

    it('should cleanup expired backups during scheduled run', async () => {
      // Create expired backup
      const backupId = await backupService.createEmergencyBackup();
      const backup = backupService.listBackups().find(b => b.id === backupId)!;
      backup.expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Trigger scheduled backup
      jest.advanceTimersByTime(mockConfig.scheduledBackupInterval);
      await jest.runAllTimersAsync();

      // Verify cleanup was performed
      expect(mockFs.rmdir).toHaveBeenCalled();
    });

    it('should handle scheduled backup failures gracefully', async () => {
      mockDatabaseService.exportDatabase.mockRejectedValueOnce(
        new Error('Scheduled backup failed')
      );

      // Should not throw even if scheduled backup fails
      jest.advanceTimersByTime(mockConfig.scheduledBackupInterval);
      await jest.runAllTimersAsync();

      // Verify error was handled gracefully (no unhandled promise rejection)
    });
  });

  describe('component backup methods', () => {
    it('should backup database with compression and encryption', async () => {
      const backupId = 'test-backup';
      const component = await backupService['backupDatabase'](backupId);

      expect(component.name).toBe('Database');
      expect(component.type).toBe(ComponentType.DATABASE);
      expect(component.encrypted).toBe(mockConfig.encryptionEnabled);
      expect(mockDatabaseService.exportDatabase).toHaveBeenCalled();
      expect(mockCryptoService.encrypt).toHaveBeenCalled();
    });

    it('should always encrypt crypto keys regardless of global setting', async () => {
      // Temporarily disable global encryption
      const originalConfig = { ...mockConfig, encryptionEnabled: false };
      const service = new BackupService(originalConfig, mockDatabaseService, mockCryptoService);

      const backupId = 'test-backup';
      const component = await service['backupCryptoKeys'](backupId);

      expect(component.encrypted).toBe(true); // Should always be true for crypto keys
      expect(mockCryptoService.encrypt).toHaveBeenCalled();
    });

    it('should backup configuration data', async () => {
      const backupId = 'test-backup';
      const component = await backupService['backupConfiguration'](backupId);

      expect(component.name).toBe('Configuration');
      expect(component.type).toBe(ComponentType.CONFIGURATION);
      expect(mockDatabaseService.getConfiguration).toHaveBeenCalled();
    });

    it('should backup implant configurations', async () => {
      const backupId = 'test-backup';
      const component = await backupService['backupImplantConfigs'](backupId);

      expect(component.name).toBe('Implant Configurations');
      expect(component.type).toBe(ComponentType.IMPLANT_CONFIGS);
      expect(mockDatabaseService.query).toHaveBeenCalledWith('SELECT * FROM implants');
    });

    it('should backup operator data without sensitive information', async () => {
      const backupId = 'test-backup';
      const component = await backupService['backupOperatorData'](backupId);

      expect(component.name).toBe('Operator Data');
      expect(component.type).toBe(ComponentType.OPERATOR_DATA);
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'SELECT id, username, email, role, permissions, created_at FROM operators'
      );
    });
  });

  describe('error handling', () => {
    it('should handle backup directory creation failure', async () => {
      mockFs.mkdir.mockRejectedValueOnce(new Error('Directory creation failed'));

      await expect(
        () => new BackupService(mockConfig, mockDatabaseService, mockCryptoService)
      ).toThrow('Directory creation failed');
    });

    it('should handle database persistence failures gracefully', async () => {
      mockDatabaseService.query.mockRejectedValueOnce(new Error('Database error'));

      // Should still create backup even if persistence fails
      const backupId = await backupService.createEmergencyBackup();
      expect(backupId).toBeDefined();
    });

    it('should handle file write failures', async () => {
      mockFs.writeFile.mockRejectedValueOnce(new Error('File write failed'));

      await expect(backupService.createEmergencyBackup()).rejects.toThrow('File write failed');
    });
  });
});
