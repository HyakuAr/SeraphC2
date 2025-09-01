/**
 * Multi-protocol communication system exports
 * Implements requirements 1.3, 1.4, and 7.9 from the SeraphC2 specification
 */

export * from './interfaces';
export { MessageRouter } from './message-router';
export * from './protocol-manager';
export * from './websocket-handler';
export * from './dns-handler';
