/**
 * SeraphC2 - Advanced Command and Control Framework
 * Main entry point for the C2 server
 */

import dotenv from 'dotenv';
import { initializeDatabase } from './core/database';
import { SeraphC2Server, ServerConfig } from './web/server';
import { PostgresOperatorRepository } from './core/repositories/operator.repository';
import { getServerPort } from './utils/portUtils';

// Load environment variables
dotenv.config();

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  console.log('🔥 SeraphC2 Server Starting...');
  console.log('📡 Initializing C2 infrastructure...');

  try {
    // Initialize database connection and run migrations
    await initializeDatabase();
    console.log('✅ Database initialized successfully');

    // Initialize repositories
    const operatorRepository = new PostgresOperatorRepository();

    // Get available port with automatic fallback
    const port = await getServerPort();

    // Configure HTTP server
    const serverConfig: ServerConfig = {
      port,
      host: process.env['HTTP_HOST'] || '0.0.0.0',
      corsOrigins: process.env['CORS_ORIGINS']?.split(',') || [
        'http://localhost:3000',
        'http://localhost:3001',
      ],
      enableRequestLogging: process.env['ENABLE_REQUEST_LOGGING'] !== 'false',
    };

    // Initialize and start HTTP server
    const server = new SeraphC2Server(serverConfig, operatorRepository);
    await server.start();

    console.log('✅ SeraphC2 Server initialized successfully');
    console.log('🚀 All systems operational');
  } catch (error) {
    console.error('❌ Failed to initialize SeraphC2 Server:', error);
    throw error;
  }
}

// Start the application
main().catch((error: unknown) => {
  console.error('❌ Failed to start SeraphC2 Server:', error);
  process.exit(1);
});
