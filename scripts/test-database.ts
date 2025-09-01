#!/usr/bin/env ts-node

/**
 * Database test script
 * Tests database connection and basic operations
 */

import dotenv from 'dotenv';
import { initializeDatabase, DatabaseConnection } from '../src/core/database';
import { repositoryFactory } from '../src/core/repositories/factory';
import {
  ImplantStatus,
  PrivilegeLevel,
  Protocol,
  OperatorRole,
  CommandType,
} from '../src/types/entities';

// Load environment variables
dotenv.config();

async function testDatabase(): Promise<void> {
  console.log('🧪 Testing SeraphC2 Database Setup...');

  try {
    // Initialize database
    console.log('📊 Initializing database...');
    await initializeDatabase();

    const db = DatabaseConnection.getInstance();
    const implantRepo = repositoryFactory.getImplantRepository();
    const operatorRepo = repositoryFactory.getOperatorRepository();
    const commandRepo = repositoryFactory.getCommandRepository();

    // Test basic database query
    console.log('🔍 Testing basic database connectivity...');
    const result = await db.query('SELECT NOW() as current_time, version() as pg_version');
    console.log(`✅ Connected to PostgreSQL: ${result.rows[0].pg_version}`);
    console.log(`⏰ Current time: ${result.rows[0].current_time}`);

    // Test creating an operator
    console.log('👤 Testing operator creation...');
    const operator = await operatorRepo.create({
      username: 'test_admin',
      email: 'admin@seraphc2.local',
      passwordHash: 'test_hash_123',
      role: OperatorRole.ADMINISTRATOR,
      permissions: [
        { resource: 'implants', actions: ['read', 'write', 'delete'] },
        { resource: 'operators', actions: ['read', 'write'] },
      ],
    });
    console.log(`✅ Created operator: ${operator.username} (${operator.id})`);

    // Test creating an implant
    console.log('💻 Testing implant creation...');
    const implant = await implantRepo.create({
      hostname: 'TEST-WORKSTATION',
      username: 'testuser',
      operatingSystem: 'Windows 10 Pro',
      architecture: 'x64',
      privileges: PrivilegeLevel.USER,
      communicationProtocol: Protocol.HTTPS,
      encryptionKey: 'test_encryption_key_abc123',
      configuration: {
        callbackInterval: 5000,
        jitter: 15,
        maxRetries: 3,
        workingHours: {
          start: '09:00',
          end: '17:00',
        },
      },
      systemInfo: {
        hostname: 'TEST-WORKSTATION',
        operatingSystem: 'Windows 10 Pro',
        architecture: 'x64',
        processorInfo: 'Intel(R) Core(TM) i7-10700K CPU @ 3.80GHz',
        memoryTotal: 32768,
        diskSpace: 1000000,
        networkInterfaces: ['Ethernet', 'Wi-Fi 6 AX200'],
        installedSoftware: ['Google Chrome', 'Microsoft Office', 'Visual Studio Code'],
        runningProcesses: 187,
      },
    });
    console.log(`✅ Created implant: ${implant.hostname} (${implant.id})`);

    // Test creating a command
    console.log('⚡ Testing command creation...');
    const command = await commandRepo.create({
      implantId: implant.id,
      operatorId: operator.id,
      type: CommandType.SYSTEM_INFO,
      payload: 'systeminfo',
    });
    console.log(`✅ Created command: ${command.type} (${command.id})`);

    // Test querying data
    console.log('📋 Testing data retrieval...');
    const allImplants = await implantRepo.findAll();
    const activeImplants = await implantRepo.findActiveImplants();
    const implantCommands = await commandRepo.findByImplantId(implant.id);

    console.log(`✅ Found ${allImplants.length} total implants`);
    console.log(`✅ Found ${activeImplants.length} active implants`);
    console.log(`✅ Found ${implantCommands.length} commands for implant`);

    // Test updating data
    console.log('🔄 Testing data updates...');
    await implantRepo.updateLastSeen(implant.id);
    await implantRepo.updateStatus(implant.id, ImplantStatus.ACTIVE);

    const updatedImplant = await implantRepo.findById(implant.id);
    console.log(`✅ Updated implant status: ${updatedImplant?.status}`);

    // Test repository statistics
    console.log('📊 Testing repository statistics...');
    const implantCount = await implantRepo.getImplantCount();
    const commandCount = await commandRepo.getCommandCount();

    console.log(`✅ Total implants: ${implantCount}`);
    console.log(`✅ Total commands: ${commandCount}`);

    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await commandRepo.delete(command.id);
    await implantRepo.delete(implant.id);
    await operatorRepo.delete(operator.id);
    console.log('✅ Test data cleaned up');

    // Test database health
    const poolStats = db.getPoolStats();
    console.log('💊 Database pool health:');
    console.log(`   - Total connections: ${poolStats.totalCount}`);
    console.log(`   - Idle connections: ${poolStats.idleCount}`);
    console.log(`   - Waiting connections: ${poolStats.waitingCount}`);

    console.log('\n🎉 All database tests passed successfully!');
    console.log('✅ SeraphC2 database setup is working correctly');
  } catch (error) {
    console.error('❌ Database test failed:', error);
    throw error;
  } finally {
    // Close database connection
    const db = DatabaseConnection.getInstance();
    if (db.isHealthy()) {
      await db.disconnect();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the test
if (require.main === module) {
  testDatabase()
    .then(() => {
      console.log('✅ Database test completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Database test failed:', error);
      process.exit(1);
    });
}

export { testDatabase };
