/**
 * Module System exports for SeraphC2
 * Implements requirements 13.1, 13.2, 13.3, 13.4
 */

// Core module system
export { ModuleLoader, ModuleLoaderConfig, LoadedModuleInstance } from './module-loader';
export { ModuleManager, ModuleManagerConfig, ModuleInfo } from './module-manager';

// Built-in modules
export { CredentialDumpingModule } from './credential-dumping.module';
export { NetworkDiscoveryModule } from './network-discovery.module';
export { LateralMovementModule } from './lateral-movement.module';

// Re-export types for convenience
export * from '../../types/modules';
