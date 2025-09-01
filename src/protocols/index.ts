/**
 * Multi-protocol communication system exports
 * Implements requirements 1.3, 1.4, and 7.9 from the SeraphC2 specification
 */

export * from './interfaces';
export * from './message-router';
export * from './protocol-manager';
export * from './websocket-handler';
export * from './dns-handler';

// Re-export commonly used types
export type {
  ProtocolMessage,
  ProtocolConfig,
  ConnectionInfo,
  ProtocolStats,
  ObfuscationConfig,
  JitterConfig,
  ProtocolFailoverConfig,
} from './interfaces';

export type { WebSocketConfig, ImplantSocket } from './websocket-handler';

export type { DNSConfig, DNSQuery, DNSResponse, ImplantDNSSession } from './dns-handler';

export type { ProtocolHealth, ImplantProtocolState } from './protocol-manager';
