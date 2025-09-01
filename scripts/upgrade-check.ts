#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

interface VersionInfo {
  current: string;
  target: string;
  compatible: boolean;
  requiresMigration: boolean;
  hasBreakingChanges: boolean;
}

interface SystemRequirement {
  name: string;
  required: string;
  current?: string;
  satisfied: boolean;
  critical: boolean;
}

interface CompatibilityCheck {
  version: VersionInfo;
  requirements: SystemRequirement[];
  database: DatabaseCheck;
  configuration: ConfigurationCheck;
  warnings: string[];
  errors: string[];
  canUpgrade: boolean;
}

interface DatabaseCheck {
  connected: boolean;
  version?: string;
  compatible: boolean;
  pendingMigrations: number;
  backupRecommended: boolean;
}

interface ConfigurationCheck {
  envFileExists: boolean;
  requiredVarsPresent: boolean;
  missingVars: string[];
  deprecatedVars: string[];
  newVarsRequired: string[];
}

class UpgradeCompatibilityChecker {
  private projectRoot: string;
  private packageJson: any;
  private targetVersion: string;

  constructor(targetVersion?: string) {
    this.projectRoot = process.cwd();
    this.packageJson = this.loadPackageJson();
    this.targetVersion = targetVersion || this.getLatestVersion();
  }

  /**
   * Run comprehensive upgrade compatibility check
   */
  async checkCompatibility(): Promise<CompatibilityCheck> {
    console.log(
      `🔍 Checking upgrade compatibility from ${this.packageJson.version} to ${this.targetVersion}...`
    );

    const version = this.checkVersionCompatibility();
    const requirements = await this.checkSystemRequirements();
    const database = await this.checkDatabase();
    const configuration = this.checkConfiguration();

    const warnings: string[] = [];
    const errors: string[] = [];

    // Collect warnings and errors
    if (version.hasBreakingChanges) {
      warnings.push(
        'This upgrade contains breaking changes. Review the migration guide carefully.'
      );
    }

    if (database.pendingMigrations > 0) {
      warnings.push(
        `${database.pendingMigrations} pending migrations will be applied during upgrade.`
      );
    }

    if (configuration.deprecatedVars.length > 0) {
      warnings.push(
        `Deprecated configuration variables found: ${configuration.deprecatedVars.join(', ')}`
      );
    }

    if (!database.connected) {
      errors.push('Cannot connect to database. Check database configuration.');
    }

    if (!configuration.requiredVarsPresent) {
      errors.push(
        `Missing required configuration variables: ${configuration.missingVars.join(', ')}`
      );
    }

    const failedRequirements = requirements.filter(req => !req.satisfied && req.critical);
    if (failedRequirements.length > 0) {
      errors.push(
        `Critical system requirements not met: ${failedRequirements.map(r => r.name).join(', ')}`
      );
    }

    const canUpgrade = errors.length === 0 && version.compatible;

    return {
      version,
      requirements,
      database,
      configuration,
      warnings,
      errors,
      canUpgrade,
    };
  }

  /**
   * Check version compatibility
   */
  private checkVersionCompatibility(): VersionInfo {
    const current = this.packageJson.version;
    const target = this.targetVersion;

    // Parse semantic versions
    const currentParts = current.split('.').map(Number);
    const targetParts = target.split('.').map(Number);

    const compatible = this.isVersionCompatible(currentParts, targetParts);
    const requiresMigration = this.requiresDatabaseMigration(current, target);
    const hasBreakingChanges = this.hasBreakingChanges(currentParts, targetParts);

    return {
      current,
      target,
      compatible,
      requiresMigration,
      hasBreakingChanges,
    };
  }

  /**
   * Check if version upgrade is compatible
   */
  private isVersionCompatible(current: number[], target: number[]): boolean {
    // Can't downgrade
    if (
      target[0] < current[0] ||
      (target[0] === current[0] && target[1] < current[1]) ||
      (target[0] === current[0] && target[1] === current[1] && target[2] < current[2])
    ) {
      return false;
    }

    // Major version jumps require special handling
    if (target[0] > current[0] + 1) {
      return false; // Skip major versions not supported
    }

    return true;
  }

  /**
   * Check if upgrade requires database migration
   */
  private requiresDatabaseMigration(current: string, target: string): boolean {
    // This would typically check a migration manifest or database
    // For now, assume any version change requires migration
    return current !== target;
  }

  /**
   * Check if upgrade has breaking changes
   */
  private hasBreakingChanges(current: number[], target: number[]): boolean {
    // Major version changes typically have breaking changes
    return target[0] > current[0];
  }

  /**
   * Check system requirements
   */
  private async checkSystemRequirements(): Promise<SystemRequirement[]> {
    const requirements: SystemRequirement[] = [];

    // Node.js version
    const nodeVersion = process.version.substring(1); // Remove 'v' prefix
    requirements.push({
      name: 'Node.js',
      required: '18.0.0',
      current: nodeVersion,
      satisfied: this.compareVersions(nodeVersion, '18.0.0') >= 0,
      critical: true,
    });

    // npm version
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
      requirements.push({
        name: 'npm',
        required: '8.0.0',
        current: npmVersion,
        satisfied: this.compareVersions(npmVersion, '8.0.0') >= 0,
        critical: true,
      });
    } catch {
      requirements.push({
        name: 'npm',
        required: '8.0.0',
        satisfied: false,
        critical: true,
      });
    }

    // PostgreSQL version (if accessible)
    try {
      const dbConfig = this.loadDatabaseConfig();
      const client = new Client(dbConfig);
      await client.connect();

      const result = await client.query('SELECT version()');
      const pgVersionMatch = result.rows[0].version.match(/PostgreSQL (\d+\.\d+)/);
      const pgVersion = pgVersionMatch ? pgVersionMatch[1] : 'unknown';

      requirements.push({
        name: 'PostgreSQL',
        required: '12.0',
        current: pgVersion,
        satisfied: pgVersion !== 'unknown' && this.compareVersions(pgVersion, '12.0') >= 0,
        critical: true,
      });

      await client.end();
    } catch {
      requirements.push({
        name: 'PostgreSQL',
        required: '12.0',
        satisfied: false,
        critical: true,
      });
    }

    // Redis (if configured)
    try {
      const redisVersion = execSync('redis-cli --version', { encoding: 'utf-8' }).trim();
      const versionMatch = redisVersion.match(/redis-cli (\d+\.\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      requirements.push({
        name: 'Redis',
        required: '6.0.0',
        current: version,
        satisfied: version !== 'unknown' && this.compareVersions(version, '6.0.0') >= 0,
        critical: false,
      });
    } catch {
      // Redis might not be installed or accessible
      requirements.push({
        name: 'Redis',
        required: '6.0.0',
        satisfied: false,
        critical: false,
      });
    }

    // Disk space
    try {
      const diskUsage = execSync('df -h .', { encoding: 'utf-8' });
      const lines = diskUsage.split('\n');
      const dataLine = lines[1];
      const parts = dataLine.split(/\s+/);
      const available = parts[3];

      // Parse available space (assuming format like "10G" or "1024M")
      const availableBytes = this.parseSize(available);
      const requiredBytes = 1024 * 1024 * 1024; // 1GB

      requirements.push({
        name: 'Disk Space',
        required: '1GB',
        current: available,
        satisfied: availableBytes >= requiredBytes,
        critical: true,
      });
    } catch {
      requirements.push({
        name: 'Disk Space',
        required: '1GB',
        satisfied: false,
        critical: true,
      });
    }

    return requirements;
  }

  /**
   * Check database connectivity and status
   */
  private async checkDatabase(): Promise<DatabaseCheck> {
    try {
      const dbConfig = this.loadDatabaseConfig();
      const client = new Client(dbConfig);

      await client.connect();

      // Get PostgreSQL version
      const versionResult = await client.query('SELECT version()');
      const versionMatch = versionResult.rows[0].version.match(/PostgreSQL (\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      // Check for pending migrations
      let pendingMigrations = 0;
      try {
        // This would integrate with your migration system
        // For now, we'll simulate checking pending migrations
        const migrationFiles = this.getMigrationFiles();
        const appliedMigrations = await this.getAppliedMigrations(client);
        pendingMigrations = migrationFiles.length - appliedMigrations.length;
      } catch {
        // Migration table might not exist yet
        pendingMigrations = 0;
      }

      await client.end();

      return {
        connected: true,
        version,
        compatible: this.compareVersions(version, '12.0') >= 0,
        pendingMigrations: Math.max(0, pendingMigrations),
        backupRecommended: pendingMigrations > 0,
      };
    } catch (error) {
      return {
        connected: false,
        compatible: false,
        pendingMigrations: 0,
        backupRecommended: true,
      };
    }
  }

  /**
   * Check configuration requirements
   */
  private checkConfiguration(): ConfigurationCheck {
    const envPath = join(this.projectRoot, '.env');
    const envFileExists = existsSync(envPath);

    let envVars: Record<string, string> = {};
    if (envFileExists) {
      try {
        const envContent = readFileSync(envPath, 'utf-8');
        envVars = this.parseEnvFile(envContent);
      } catch {
        // Ignore parsing errors
      }
    }

    // Required variables for the target version
    const requiredVars = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY'];

    // New variables in target version
    const newVarsRequired = this.getNewRequiredVars(this.targetVersion);

    // Deprecated variables
    const deprecatedVars = this.getDeprecatedVars(this.targetVersion);

    const missingVars = requiredVars.filter(varName => !envVars[varName]);
    const requiredVarsPresent = missingVars.length === 0;

    return {
      envFileExists,
      requiredVarsPresent,
      missingVars,
      deprecatedVars: deprecatedVars.filter(varName => envVars[varName]),
      newVarsRequired,
    };
  }

  /**
   * Get new required variables for target version
   */
  private getNewRequiredVars(version: string): string[] {
    // This would typically be loaded from a configuration manifest
    const versionRequirements: Record<string, string[]> = {
      '1.1.0': ['API_KEY_EXPIRY_DAYS', 'WEBHOOK_TIMEOUT_MS'],
      '1.2.0': ['EXPORT_MAX_RECORDS', 'AUDIT_LOG_RETENTION_DAYS'],
      '2.0.0': ['NEW_FEATURE_CONFIG', 'SECURITY_ENHANCEMENT_KEY'],
    };

    return versionRequirements[version] || [];
  }

  /**
   * Get deprecated variables for target version
   */
  private getDeprecatedVars(version: string): string[] {
    // This would typically be loaded from a configuration manifest
    const deprecatedVars: Record<string, string[]> = {
      '1.1.0': ['OLD_API_CONFIG'],
      '2.0.0': ['LEGACY_FEATURE_FLAG', 'OLD_ENCRYPTION_METHOD'],
    };

    return deprecatedVars[version] || [];
  }

  /**
   * Load package.json
   */
  private loadPackageJson(): any {
    const packagePath = join(this.projectRoot, 'package.json');
    if (!existsSync(packagePath)) {
      throw new Error('package.json not found');
    }
    return JSON.parse(readFileSync(packagePath, 'utf-8'));
  }

  /**
   * Load database configuration
   */
  private loadDatabaseConfig(): any {
    require('dotenv').config();

    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl) {
      const url = new URL(databaseUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.slice(1),
        user: url.username,
        password: url.password,
        ssl: url.searchParams.get('ssl') === 'true' || process.env.NODE_ENV === 'production',
      };
    } else {
      return {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'seraphc2',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production',
      };
    }
  }

  /**
   * Get latest version from git tags
   */
  private getLatestVersion(): string {
    try {
      const output = execSync('git describe --tags --abbrev=0', {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return output.trim().replace(/^v/, '');
    } catch {
      return this.packageJson.version;
    }
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  }

  /**
   * Parse size string to bytes
   */
  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)([KMGT]?)$/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers: Record<string, number> = {
      '': 1,
      K: 1024,
      M: 1024 * 1024,
      G: 1024 * 1024 * 1024,
      T: 1024 * 1024 * 1024 * 1024,
    };

    return value * (multipliers[unit] || 1);
  }

  /**
   * Parse .env file content
   */
  private parseEnvFile(content: string): Record<string, string> {
    const vars: Record<string, string> = {};

    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          vars[key.trim()] = valueParts.join('=').trim();
        }
      }
    });

    return vars;
  }

  /**
   * Get migration files
   */
  private getMigrationFiles(): string[] {
    const migrationsDir = join(this.projectRoot, 'migrations');
    if (!existsSync(migrationsDir)) return [];

    const fs = require('fs');
    return fs
      .readdirSync(migrationsDir)
      .filter((file: string) => file.endsWith('.sql'))
      .sort();
  }

  /**
   * Get applied migrations from database
   */
  private async getAppliedMigrations(client: Client): Promise<string[]> {
    try {
      const result = await client.query(
        'SELECT migration_id FROM schema_migrations ORDER BY applied_at'
      );
      return result.rows.map(row => row.migration_id);
    } catch {
      return [];
    }
  }

  /**
   * Print compatibility report
   */
  printReport(check: CompatibilityCheck): void {
    console.log('\n📋 Upgrade Compatibility Report');
    console.log('================================\n');

    // Version info
    console.log(`📦 Version: ${check.version.current} → ${check.version.target}`);
    console.log(`🔄 Compatible: ${check.version.compatible ? '✅' : '❌'}`);
    console.log(`🗄️  Requires Migration: ${check.version.requiresMigration ? '✅' : '❌'}`);
    console.log(
      `⚠️  Breaking Changes: ${check.version.hasBreakingChanges ? '⚠️  Yes' : '✅ No'}\n`
    );

    // System requirements
    console.log('🖥️  System Requirements:');
    check.requirements.forEach(req => {
      const status = req.satisfied ? '✅' : req.critical ? '❌' : '⚠️ ';
      const current = req.current ? ` (current: ${req.current})` : '';
      console.log(`   ${status} ${req.name}: ${req.required}${current}`);
    });
    console.log('');

    // Database status
    console.log('🗄️  Database:');
    console.log(
      `   ${check.database.connected ? '✅' : '❌'} Connection: ${check.database.connected ? 'OK' : 'Failed'}`
    );
    if (check.database.version) {
      console.log(
        `   ${check.database.compatible ? '✅' : '❌'} Version: ${check.database.version}`
      );
    }
    console.log(`   📊 Pending Migrations: ${check.database.pendingMigrations}`);
    console.log(
      `   💾 Backup Recommended: ${check.database.backupRecommended ? '⚠️  Yes' : '✅ No'}\n`
    );

    // Configuration
    console.log('⚙️  Configuration:');
    console.log(`   ${check.configuration.envFileExists ? '✅' : '❌'} .env file exists`);
    console.log(
      `   ${check.configuration.requiredVarsPresent ? '✅' : '❌'} Required variables present`
    );

    if (check.configuration.missingVars.length > 0) {
      console.log(`   ❌ Missing: ${check.configuration.missingVars.join(', ')}`);
    }

    if (check.configuration.deprecatedVars.length > 0) {
      console.log(`   ⚠️  Deprecated: ${check.configuration.deprecatedVars.join(', ')}`);
    }

    if (check.configuration.newVarsRequired.length > 0) {
      console.log(`   ℹ️  New variables needed: ${check.configuration.newVarsRequired.join(', ')}`);
    }
    console.log('');

    // Warnings
    if (check.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      check.warnings.forEach(warning => {
        console.log(`   - ${warning}`);
      });
      console.log('');
    }

    // Errors
    if (check.errors.length > 0) {
      console.log('❌ Errors:');
      check.errors.forEach(error => {
        console.log(`   - ${error}`);
      });
      console.log('');
    }

    // Final verdict
    console.log('🎯 Upgrade Status:');
    if (check.canUpgrade) {
      console.log('   ✅ Ready to upgrade!');
      if (check.warnings.length > 0) {
        console.log('   ⚠️  Please review warnings before proceeding');
      }
    } else {
      console.log('   ❌ Cannot upgrade - resolve errors first');
    }
    console.log('');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const targetVersion = args[0];

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
SeraphC2 Upgrade Compatibility Checker

Usage: ts-node scripts/upgrade-check.ts [target-version]

Examples:
  ts-node scripts/upgrade-check.ts           # Check compatibility with latest version
  ts-node scripts/upgrade-check.ts 1.2.0     # Check compatibility with specific version

Options:
  --help, -h    Show this help message

The checker will verify:
- System requirements (Node.js, PostgreSQL, etc.)
- Database connectivity and migration status
- Configuration file completeness
- Version compatibility
- Breaking changes and migration requirements
`);
    process.exit(0);
  }

  try {
    const checker = new UpgradeCompatibilityChecker(targetVersion);
    const result = await checker.checkCompatibility();

    checker.printReport(result);

    // Exit with appropriate code
    process.exit(result.canUpgrade ? 0 : 1);
  } catch (error) {
    console.error('❌ Compatibility check failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

export { UpgradeCompatibilityChecker, CompatibilityCheck };
