#!/usr/bin/env ts-node

/**
 * SeraphC2 Log Rotation Script
 * Handles log rotation, compression, and cleanup for production environments
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { log } from '../src/utils/logger';

interface LogRotationConfig {
  logsDir: string;
  maxAge: number; // days
  maxSize: number; // MB
  compress: boolean;
  keepCount: number;
}

class LogRotationManager {
  private config: LogRotationConfig;

  constructor(config: Partial<LogRotationConfig> = {}) {
    this.config = {
      logsDir: config.logsDir || path.join(process.cwd(), 'logs'),
      maxAge: config.maxAge || 30,
      maxSize: config.maxSize || 100,
      compress: config.compress !== false,
      keepCount: config.keepCount || 10,
    };
  }

  /**
   * Perform log rotation
   */
  public async rotateAllLogs(): Promise<void> {
    try {
      log.info('Starting log rotation process', {
        config: this.config,
        category: 'system',
      });

      if (!fs.existsSync(this.config.logsDir)) {
        log.warn('Logs directory does not exist', {
          directory: this.config.logsDir,
        });
        return;
      }

      const logFiles = this.getLogFiles();

      for (const logFile of logFiles) {
        await this.rotateLogFile(logFile);
      }

      await this.cleanupOldLogs();

      log.info('Log rotation completed successfully', {
        processedFiles: logFiles.length,
        category: 'system',
      });
    } catch (error) {
      log.error(
        'Log rotation failed',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          category: 'system',
        }
      );
      throw error;
    }
  }

  /**
   * Rotate a specific log file
   */
  private async rotateLogFile(logFile: string): Promise<void> {
    const filePath = path.join(this.config.logsDir, logFile);
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);

    // Check if rotation is needed
    if (fileSizeMB < this.config.maxSize) {
      return;
    }

    log.info(`Rotating log file: ${logFile}`, {
      size: `${fileSizeMB.toFixed(2)}MB`,
      threshold: `${this.config.maxSize}MB`,
      category: 'system',
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedFileName = `${logFile}.${timestamp}`;
    const rotatedFilePath = path.join(this.config.logsDir, rotatedFileName);

    // Move current log file to rotated name
    fs.renameSync(filePath, rotatedFilePath);

    // Create new empty log file
    fs.writeFileSync(filePath, '');

    // Compress rotated file if enabled
    if (this.config.compress) {
      await this.compressFile(rotatedFilePath);
    }

    log.info(`Log file rotated successfully: ${logFile}`, {
      rotatedTo: rotatedFileName,
      compressed: this.config.compress,
      category: 'system',
    });
  }

  /**
   * Compress a log file
   */
  private async compressFile(filePath: string): Promise<void> {
    try {
      const compressedPath = `${filePath}.gz`;
      execSync(`gzip "${filePath}"`, { stdio: 'pipe' });

      log.debug(`Compressed log file: ${path.basename(filePath)}`, {
        originalPath: filePath,
        compressedPath,
        category: 'system',
      });
    } catch (error) {
      log.error(
        `Failed to compress log file: ${filePath}`,
        error instanceof Error ? error : new Error('Unknown error'),
        {
          category: 'system',
        }
      );
    }
  }

  /**
   * Clean up old log files
   */
  private async cleanupOldLogs(): Promise<void> {
    const files = fs.readdirSync(this.config.logsDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxAge);

    let cleanedCount = 0;

    for (const file of files) {
      const filePath = path.join(this.config.logsDir, file);
      const stats = fs.statSync(filePath);

      // Skip current log files
      if (!file.includes('.') || file.endsWith('.log')) {
        continue;
      }

      // Check if file is older than max age
      if (stats.mtime < cutoffDate) {
        try {
          fs.unlinkSync(filePath);
          cleanedCount++;

          log.debug(`Cleaned up old log file: ${file}`, {
            age: Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24)),
            category: 'system',
          });
        } catch (error) {
          log.error(
            `Failed to delete old log file: ${file}`,
            error instanceof Error ? error : new Error('Unknown error'),
            {
              category: 'system',
            }
          );
        }
      }
    }

    // Also clean up by count (keep only the most recent files)
    await this.cleanupByCount();

    log.info(`Cleaned up ${cleanedCount} old log files`, {
      maxAge: this.config.maxAge,
      category: 'system',
    });
  }

  /**
   * Clean up logs by keeping only the most recent files
   */
  private async cleanupByCount(): Promise<void> {
    const files = fs.readdirSync(this.config.logsDir);
    const logGroups = new Map<string, Array<{ name: string; mtime: Date }>>();

    // Group files by base name
    for (const file of files) {
      if (file.includes('.') && !file.endsWith('.log')) {
        const baseName = file.split('.')[0];
        const filePath = path.join(this.config.logsDir, file);
        const stats = fs.statSync(filePath);

        if (!logGroups.has(baseName)) {
          logGroups.set(baseName, []);
        }

        logGroups.get(baseName)!.push({
          name: file,
          mtime: stats.mtime,
        });
      }
    }

    // Clean up each group
    for (const [baseName, fileList] of logGroups.entries()) {
      if (fileList.length > this.config.keepCount) {
        // Sort by modification time (newest first)
        fileList.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

        // Remove files beyond keep count
        const filesToDelete = fileList.slice(this.config.keepCount);

        for (const fileInfo of filesToDelete) {
          try {
            const filePath = path.join(this.config.logsDir, fileInfo.name);
            fs.unlinkSync(filePath);

            log.debug(`Removed excess log file: ${fileInfo.name}`, {
              baseName,
              keepCount: this.config.keepCount,
              category: 'system',
            });
          } catch (error) {
            log.error(
              `Failed to delete excess log file: ${fileInfo.name}`,
              error instanceof Error ? error : new Error('Unknown error'),
              {
                category: 'system',
              }
            );
          }
        }
      }
    }
  }

  /**
   * Get list of log files to rotate
   */
  private getLogFiles(): string[] {
    const files = fs.readdirSync(this.config.logsDir);
    return files.filter(
      file => file.endsWith('.log') && !file.includes('.') && file !== 'audit.log' // Skip audit logs for compliance
    );
  }

  /**
   * Get disk usage statistics
   */
  public getDiskUsage(): { totalSize: number; fileCount: number; oldestFile: Date | null } {
    const files = fs.readdirSync(this.config.logsDir);
    let totalSize = 0;
    let fileCount = 0;
    let oldestFile: Date | null = null;

    for (const file of files) {
      const filePath = path.join(this.config.logsDir, file);
      const stats = fs.statSync(filePath);

      totalSize += stats.size;
      fileCount++;

      if (!oldestFile || stats.mtime < oldestFile) {
        oldestFile = stats.mtime;
      }
    }

    return {
      totalSize: Math.round(totalSize / (1024 * 1024)), // MB
      fileCount,
      oldestFile,
    };
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'rotate';

  const rotationManager = new LogRotationManager({
    logsDir: process.env['LOGS_DIR'] || path.join(process.cwd(), 'logs'),
    maxAge: parseInt(process.env['LOG_MAX_AGE_DAYS'] || '30'),
    maxSize: parseInt(process.env['LOG_MAX_SIZE_MB'] || '100'),
    compress: process.env['LOG_COMPRESS'] !== 'false',
    keepCount: parseInt(process.env['LOG_KEEP_COUNT'] || '10'),
  });

  try {
    switch (command) {
      case 'rotate':
        await rotationManager.rotateAllLogs();
        break;

      case 'status':
        const usage = rotationManager.getDiskUsage();
        console.log('Log Directory Status:');
        console.log(`  Total Size: ${usage.totalSize} MB`);
        console.log(`  File Count: ${usage.fileCount}`);
        console.log(`  Oldest File: ${usage.oldestFile?.toISOString() || 'N/A'}`);
        break;

      case 'help':
        console.log('SeraphC2 Log Rotation Script');
        console.log('');
        console.log('Usage: ts-node scripts/log-rotation.ts [command]');
        console.log('');
        console.log('Commands:');
        console.log('  rotate  - Rotate logs based on size and age (default)');
        console.log('  status  - Show log directory status');
        console.log('  help    - Show this help message');
        console.log('');
        console.log('Environment Variables:');
        console.log('  LOGS_DIR          - Log directory path (default: ./logs)');
        console.log('  LOG_MAX_AGE_DAYS  - Maximum age in days (default: 30)');
        console.log('  LOG_MAX_SIZE_MB   - Maximum size in MB (default: 100)');
        console.log('  LOG_COMPRESS      - Compress rotated logs (default: true)');
        console.log('  LOG_KEEP_COUNT    - Number of rotated files to keep (default: 10)');
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Use "help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error('Log rotation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { LogRotationManager };
