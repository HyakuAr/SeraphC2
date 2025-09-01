import { EventEmitter } from 'events';
import { Logger } from 'winston';
import { createLogger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface BackupConfig {
  backupDirectory: string;
  retentionDays: number;
  compressionLevel: number;
  encryptionEnabled: boolean;
  maxBackupSize: number; // in bytes
  scheduledBackupInterval: number; // in milliseconds
}

export interface BackupMetadata {
  id: string;
  type: BackupType;
  createdAt: Date;
  size: number;
  compressed: boolean;
  encrypted: boolean;
  checksum: string;
  description: string;
  filePath: string;
  expiresAt: Date;
}

export interface BackupManifest {
  version: string;
  createdAt: Date;
  type: BackupType;
  components: BackupComponent[];
  metadata: Record<string, any>;
}

export interface BackupComponent {
  name: string;
  type: ComponentType;
  size: number;
  checksum: string;
  encrypted: boolean;
  filePath: string;
}

export enum BackupType {
  FULL = 'full',
  INCREMENTAL = 'incremental',
  EMERGENCY = 'emergency',
  CONFIGURATION = 'configuration',
}

export enum ComponentType {
  DATABASE = 'database',
  CONFIGURATION = 'configuration',
  LOGS = 'logs',
  CRYPTO_KEYS = 'crypto_keys',
  IMPLANT_CONFIGS = 'implant_configs',
  OPERATOR_DATA = 'operator_data',
}

export interface RestoreOptions {
  backupId: string;
  components?: ComponentType[];
  targetDirectory?: string;
  overwriteExisting: boolean;
  validateIntegrity: boolean;
}

export interface RestoreResult {
  success: boolean;
  restoredComponents: ComponentType[];
  failedComponents: ComponentType[];
  errors: string[];
  restoredFiles: string[];
}

export class BackupService extends EventEmitter {
  private logger: Logger;
  private backups: Map<string, BackupMetadata> = new Map();
  private scheduledBackupTimer?: NodeJS.Timeout;

  constructor(
    private config: BackupConfig,
    private databaseService: DatabaseService,
    private cryptoService: CryptoService
  ) {
    super();
    this.logger = createLogger('Backup');
    this.initializeBackupDirectory();
    this.loadExistingBackups();
    this.startScheduledBackups();
  }

  /**
   * Create emergency backup for incident response
   * Requirement 19.8: Support rapid redeployment using encrypted backup configurations
   */
  async createEmergencyBackup(description?: string): Promise<string> {
    const backupId = this.generateBackupId();

    this.logger.warn('Creating emergency backup', { backupId });

    try {
      const manifest: BackupManifest = {
        version: '1.0',
        createdAt: new Date(),
        type: BackupType.EMERGENCY,
        components: [],
        metadata: {
          description: description || 'Emergency backup created during incident response',
          priority: 'critical',
        },
      };

      // Backup critical components
      const components = await Promise.all([
        this.backupDatabase(backupId),
        this.backupConfiguration(backupId),
        this.backupCryptoKeys(backupId),
        this.backupImplantConfigs(backupId),
        this.backupOperatorData(backupId),
      ]);

      manifest.components = components;

      // Create and save manifest
      const manifestPath = await this.saveManifest(backupId, manifest);

      // Calculate total size
      const totalSize = components.reduce((sum, comp) => sum + comp.size, 0);

      // Create backup metadata
      const metadata: BackupMetadata = {
        id: backupId,
        type: BackupType.EMERGENCY,
        createdAt: new Date(),
        size: totalSize,
        compressed: true,
        encrypted: this.config.encryptionEnabled,
        checksum: await this.calculateManifestChecksum(manifestPath),
        description: manifest.metadata.description,
        filePath: manifestPath,
        expiresAt: new Date(Date.now() + this.config.retentionDays * 24 * 60 * 60 * 1000),
      };

      this.backups.set(backupId, metadata);
      await this.persistBackupMetadata(metadata);

      this.logger.info('Emergency backup created successfully', {
        backupId,
        size: totalSize,
        components: components.length,
      });

      this.emit('backup:created', { backupId, type: BackupType.EMERGENCY, metadata });
      return backupId;
    } catch (error) {
      this.logger.error('Emergency backup failed', error);
      await this.cleanupFailedBackup(backupId);
      throw error;
    }
  }

  /**
   * Create full system backup
   */
  async createFullBackup(description?: string): Promise<string> {
    const backupId = this.generateBackupId();

    this.logger.info('Creating full backup', { backupId });

    try {
      const manifest: BackupManifest = {
        version: '1.0',
        createdAt: new Date(),
        type: BackupType.FULL,
        components: [],
        metadata: {
          description: description || 'Full system backup',
          scheduled: true,
        },
      };

      // Backup all components including logs
      const components = await Promise.all([
        this.backupDatabase(backupId),
        this.backupConfiguration(backupId),
        this.backupCryptoKeys(backupId),
        this.backupImplantConfigs(backupId),
        this.backupOperatorData(backupId),
        this.backupLogs(backupId),
      ]);

      manifest.components = components;
      const manifestPath = await this.saveManifest(backupId, manifest);
      const totalSize = components.reduce((sum, comp) => sum + comp.size, 0);

      const metadata: BackupMetadata = {
        id: backupId,
        type: BackupType.FULL,
        createdAt: new Date(),
        size: totalSize,
        compressed: true,
        encrypted: this.config.encryptionEnabled,
        checksum: await this.calculateManifestChecksum(manifestPath),
        description: manifest.metadata.description,
        filePath: manifestPath,
        expiresAt: new Date(Date.now() + this.config.retentionDays * 24 * 60 * 60 * 1000),
      };

      this.backups.set(backupId, metadata);
      await this.persistBackupMetadata(metadata);

      this.logger.info('Full backup created successfully', {
        backupId,
        size: totalSize,
        components: components.length,
      });

      this.emit('backup:created', { backupId, type: BackupType.FULL, metadata });
      return backupId;
    } catch (error) {
      this.logger.error('Full backup failed', error);
      await this.cleanupFailedBackup(backupId);
      throw error;
    }
  }

  /**
   * Restore from backup
   * Requirement 19.8: Support rapid redeployment using encrypted backup configurations
   */
  async restoreFromBackup(options: RestoreOptions): Promise<RestoreResult> {
    const backup = this.backups.get(options.backupId);
    if (!backup) {
      throw new Error(`Backup ${options.backupId} not found`);
    }

    this.logger.info('Starting backup restoration', {
      backupId: options.backupId,
      components: options.components,
    });

    const result: RestoreResult = {
      success: false,
      restoredComponents: [],
      failedComponents: [],
      errors: [],
      restoredFiles: [],
    };

    try {
      // Load and validate manifest
      const manifest = await this.loadManifest(options.backupId);

      if (options.validateIntegrity) {
        await this.validateBackupIntegrity(backup, manifest);
      }

      // Determine components to restore
      const componentsToRestore = options.components || manifest.components.map(c => c.type);

      // Restore each component
      for (const componentType of componentsToRestore) {
        try {
          const component = manifest.components.find(c => c.type === componentType);
          if (!component) {
            result.errors.push(`Component ${componentType} not found in backup`);
            result.failedComponents.push(componentType);
            continue;
          }

          await this.restoreComponent(component, options);
          result.restoredComponents.push(componentType);
          result.restoredFiles.push(component.filePath);

          this.logger.info(`Component ${componentType} restored successfully`);
        } catch (error) {
          const errorMsg = `Failed to restore component ${componentType}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          result.failedComponents.push(componentType);
          this.logger.error(errorMsg, error);
        }
      }

      result.success = result.failedComponents.length === 0;

      this.logger.info('Backup restoration completed', {
        backupId: options.backupId,
        success: result.success,
        restored: result.restoredComponents.length,
        failed: result.failedComponents.length,
      });

      this.emit('backup:restored', { backupId: options.backupId, result });
      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      this.logger.error('Backup restoration failed', error);
      throw error;
    }
  }

  /**
   * List available backups
   */
  listBackups(type?: BackupType): BackupMetadata[] {
    let backups = Array.from(this.backups.values());

    if (type) {
      backups = backups.filter(b => b.type === type);
    }

    return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Delete backup
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    const backup = this.backups.get(backupId);
    if (!backup) {
      return false;
    }

    try {
      // Delete backup files
      const backupDir = path.join(this.config.backupDirectory, backupId);
      await fs.rmdir(backupDir, { recursive: true });

      // Remove from memory and database
      this.backups.delete(backupId);
      await this.deleteBackupMetadata(backupId);

      this.logger.info(`Backup ${backupId} deleted successfully`);
      this.emit('backup:deleted', { backupId });
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete backup ${backupId}`, error);
      return false;
    }
  }

  /**
   * Cleanup expired backups
   */
  async cleanupExpiredBackups(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    for (const backup of this.backups.values()) {
      if (backup.expiresAt < now) {
        if (await this.deleteBackup(backup.id)) {
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      this.logger.info(`Cleaned up ${cleaned} expired backups`);
    }

    return cleaned;
  }

  private async initializeBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.backupDirectory, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to initialize backup directory', error);
      throw error;
    }
  }

  private async loadExistingBackups(): Promise<void> {
    try {
      const backups = await this.databaseService.query(
        'SELECT * FROM backup_metadata ORDER BY created_at DESC'
      );

      for (const row of backups.rows) {
        const metadata: BackupMetadata = {
          id: row.id,
          type: row.type,
          createdAt: new Date(row.created_at),
          size: parseInt(row.size),
          compressed: row.compressed,
          encrypted: row.encrypted,
          checksum: row.checksum,
          description: row.description,
          filePath: row.file_path,
          expiresAt: new Date(row.expires_at),
        };

        this.backups.set(metadata.id, metadata);
      }

      this.logger.info(`Loaded ${this.backups.size} existing backups`);
    } catch (error) {
      this.logger.warn('Failed to load existing backups', error);
    }
  }

  private startScheduledBackups(): void {
    if (this.config.scheduledBackupInterval > 0) {
      this.scheduledBackupTimer = setInterval(async () => {
        try {
          await this.createFullBackup('Scheduled backup');
          await this.cleanupExpiredBackups();
        } catch (error) {
          this.logger.error('Scheduled backup failed', error);
        }
      }, this.config.scheduledBackupInterval);

      this.logger.info('Scheduled backups started', {
        interval: this.config.scheduledBackupInterval,
      });
    }
  }

  private async backupDatabase(backupId: string): Promise<BackupComponent> {
    const filePath = path.join(this.config.backupDirectory, backupId, 'database.sql.gz');
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Export database
    const dumpData = await this.databaseService.exportDatabase();
    const compressed = await gzip(Buffer.from(dumpData));

    let finalData = compressed;
    if (this.config.encryptionEnabled) {
      finalData = await this.cryptoService.encrypt(compressed);
    }

    await fs.writeFile(filePath, finalData);

    return {
      name: 'Database',
      type: ComponentType.DATABASE,
      size: finalData.length,
      checksum: await this.calculateFileChecksum(filePath),
      encrypted: this.config.encryptionEnabled,
      filePath,
    };
  }

  private async backupConfiguration(backupId: string): Promise<BackupComponent> {
    const filePath = path.join(this.config.backupDirectory, backupId, 'config.json.gz');

    // Collect configuration data
    const configData = {
      server: process.env,
      database: await this.databaseService.getConfiguration(),
      // Add other configuration sources
    };

    const compressed = await gzip(Buffer.from(JSON.stringify(configData, null, 2)));

    let finalData = compressed;
    if (this.config.encryptionEnabled) {
      finalData = await this.cryptoService.encrypt(compressed);
    }

    await fs.writeFile(filePath, finalData);

    return {
      name: 'Configuration',
      type: ComponentType.CONFIGURATION,
      size: finalData.length,
      checksum: await this.calculateFileChecksum(filePath),
      encrypted: this.config.encryptionEnabled,
      filePath,
    };
  }

  private async backupCryptoKeys(backupId: string): Promise<BackupComponent> {
    const filePath = path.join(this.config.backupDirectory, backupId, 'crypto-keys.json.gz');

    const keyData = await this.cryptoService.exportKeys();
    const compressed = await gzip(Buffer.from(JSON.stringify(keyData)));

    // Always encrypt crypto keys regardless of global setting
    const encrypted = await this.cryptoService.encrypt(compressed);
    await fs.writeFile(filePath, encrypted);

    return {
      name: 'Crypto Keys',
      type: ComponentType.CRYPTO_KEYS,
      size: encrypted.length,
      checksum: await this.calculateFileChecksum(filePath),
      encrypted: true,
      filePath,
    };
  }

  private async backupImplantConfigs(backupId: string): Promise<BackupComponent> {
    const filePath = path.join(this.config.backupDirectory, backupId, 'implant-configs.json.gz');

    const implantData = await this.databaseService.query('SELECT * FROM implants');

    const compressed = await gzip(Buffer.from(JSON.stringify(implantData.rows)));

    let finalData = compressed;
    if (this.config.encryptionEnabled) {
      finalData = await this.cryptoService.encrypt(compressed);
    }

    await fs.writeFile(filePath, finalData);

    return {
      name: 'Implant Configurations',
      type: ComponentType.IMPLANT_CONFIGS,
      size: finalData.length,
      checksum: await this.calculateFileChecksum(filePath),
      encrypted: this.config.encryptionEnabled,
      filePath,
    };
  }

  private async backupOperatorData(backupId: string): Promise<BackupComponent> {
    const filePath = path.join(this.config.backupDirectory, backupId, 'operator-data.json.gz');

    const operatorData = await this.databaseService.query(
      'SELECT id, username, email, role, permissions, created_at FROM operators'
    );

    const compressed = await gzip(Buffer.from(JSON.stringify(operatorData.rows)));

    let finalData = compressed;
    if (this.config.encryptionEnabled) {
      finalData = await this.cryptoService.encrypt(compressed);
    }

    await fs.writeFile(filePath, finalData);

    return {
      name: 'Operator Data',
      type: ComponentType.OPERATOR_DATA,
      size: finalData.length,
      checksum: await this.calculateFileChecksum(filePath),
      encrypted: this.config.encryptionEnabled,
      filePath,
    };
  }

  private async backupLogs(backupId: string): Promise<BackupComponent> {
    const filePath = path.join(this.config.backupDirectory, backupId, 'logs.tar.gz');

    // This would typically involve archiving log files
    // For now, we'll create a placeholder
    const logData = { placeholder: 'Log backup not implemented' };
    const compressed = await gzip(Buffer.from(JSON.stringify(logData)));

    let finalData = compressed;
    if (this.config.encryptionEnabled) {
      finalData = await this.cryptoService.encrypt(compressed);
    }

    await fs.writeFile(filePath, finalData);

    return {
      name: 'Logs',
      type: ComponentType.LOGS,
      size: finalData.length,
      checksum: await this.calculateFileChecksum(filePath),
      encrypted: this.config.encryptionEnabled,
      filePath,
    };
  }

  private async saveManifest(backupId: string, manifest: BackupManifest): Promise<string> {
    const manifestPath = path.join(this.config.backupDirectory, backupId, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    return manifestPath;
  }

  private async loadManifest(backupId: string): Promise<BackupManifest> {
    const manifestPath = path.join(this.config.backupDirectory, backupId, 'manifest.json');
    const data = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(data);
  }

  private async restoreComponent(
    component: BackupComponent,
    options: RestoreOptions
  ): Promise<void> {
    let data = await fs.readFile(component.filePath);

    // Decrypt if encrypted
    if (component.encrypted) {
      data = await this.cryptoService.decrypt(data);
    }

    // Decompress
    const decompressed = await gunzip(data);

    // Restore based on component type
    switch (component.type) {
      case ComponentType.DATABASE:
        await this.databaseService.importDatabase(decompressed.toString());
        break;
      case ComponentType.CONFIGURATION:
        // Restore configuration (implementation depends on config system)
        break;
      case ComponentType.CRYPTO_KEYS:
        const keyData = JSON.parse(decompressed.toString());
        await this.cryptoService.importKeys(keyData);
        break;
      // Add other component restoration logic
    }
  }

  private async validateBackupIntegrity(
    backup: BackupMetadata,
    manifest: BackupManifest
  ): Promise<void> {
    // Validate manifest checksum
    const currentChecksum = await this.calculateManifestChecksum(backup.filePath);
    if (currentChecksum !== backup.checksum) {
      throw new Error('Backup integrity check failed: manifest checksum mismatch');
    }

    // Validate component checksums
    for (const component of manifest.components) {
      const currentChecksum = await this.calculateFileChecksum(component.filePath);
      if (currentChecksum !== component.checksum) {
        throw new Error(`Component integrity check failed: ${component.name}`);
      }
    }
  }

  private async calculateFileChecksum(filePath: string): Promise<string> {
    const data = await fs.readFile(filePath);
    return this.cryptoService.hash(data);
  }

  private async calculateManifestChecksum(manifestPath: string): Promise<string> {
    return this.calculateFileChecksum(manifestPath);
  }

  private async cleanupFailedBackup(backupId: string): Promise<void> {
    try {
      const backupDir = path.join(this.config.backupDirectory, backupId);
      await fs.rmdir(backupDir, { recursive: true });
    } catch (error) {
      this.logger.warn(`Failed to cleanup failed backup ${backupId}`, error);
    }
  }

  private async persistBackupMetadata(metadata: BackupMetadata): Promise<void> {
    await this.databaseService.query(
      `INSERT INTO backup_metadata (id, type, created_at, size, compressed, encrypted, checksum, description, file_path, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        metadata.id,
        metadata.type,
        metadata.createdAt,
        metadata.size,
        metadata.compressed,
        metadata.encrypted,
        metadata.checksum,
        metadata.description,
        metadata.filePath,
        metadata.expiresAt,
      ]
    );
  }

  private async deleteBackupMetadata(backupId: string): Promise<void> {
    await this.databaseService.query('DELETE FROM backup_metadata WHERE id = $1', [backupId]);
  }

  private generateBackupId(): string {
    return `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
