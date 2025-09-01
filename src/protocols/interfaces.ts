/**
 * Protocol interfaces for multi-protocol communication
 * Implements requirements 1.3, 1.4, and 7.9 from the SeraphC2 specification
 */

import { EventEmitter } from 'events';
import { Protocol } from '../types/entities';

export interface ProtocolMessage {
  id: string;
  type: 'command' | 'response' | 'heartbeat' | 'registration' | string;
  implantId: string;
  timestamp: Date;
  payload: any;
  encrypted: boolean;
  checksum?: string;
}

export interface ProtocolConfig {
  enabled: boolean;
  port?: number;
  host?: string;
  ssl?: boolean;
  obfuscation?: ObfuscationConfig;
  jitter?: JitterConfig;
  timeout?: number;
  retryAttempts?: number;
}

export interface ObfuscationConfig {
  enabled: boolean;
  userAgent?: string;
  headers?: { [key: string]: string };
  domainFronting?: {
    enabled: boolean;
    frontDomain: string;
    realDomain: string;
  };
  trafficPadding?: {
    enabled: boolean;
    minSize: number;
    maxSize: number;
  };
}

export interface JitterConfig {
  enabled: boolean;
  minDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  variance: number; // percentage (0-100)
}

export interface ConnectionInfo {
  protocol: Protocol;
  remoteAddress: string;
  userAgent?: string;
  connectedAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

export interface ProtocolStats {
  protocol: Protocol;
  connectionsTotal: number;
  connectionsActive: number;
  messagesReceived: number;
  messagesSent: number;
  bytesReceived: number;
  bytesSent: number;
  errors: number;
  lastActivity?: Date;
}

export interface ProtocolFailoverConfig {
  enabled: boolean;
  primaryProtocol: Protocol;
  fallbackProtocols: Protocol[];
  healthCheckInterval: number; // milliseconds
  failureThreshold: number; // number of consecutive failures
  recoveryThreshold: number; // number of consecutive successes
}

export abstract class BaseProtocolHandler extends EventEmitter {
  protected config: ProtocolConfig;
  protected stats: ProtocolStats;
  protected isRunning: boolean = false;

  constructor(protocol: Protocol, config: ProtocolConfig) {
    super();
    this.config = config;
    this.stats = {
      protocol,
      connectionsTotal: 0,
      connectionsActive: 0,
      messagesReceived: 0,
      messagesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      errors: 0,
    };
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract sendMessage(implantId: string, message: ProtocolMessage): Promise<boolean>;
  abstract getConnectionInfo(implantId: string): ConnectionInfo | null;
  abstract isImplantConnected(implantId: string): boolean;

  getStats(): ProtocolStats {
    return { ...this.stats };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getProtocol(): Protocol {
    return this.stats.protocol;
  }

  protected updateStats(update: Partial<ProtocolStats>): void {
    Object.assign(this.stats, update);
    this.stats.lastActivity = new Date();
  }

  protected applyJitter(): Promise<void> {
    if (!this.config.jitter?.enabled) {
      return Promise.resolve();
    }

    const { minDelay, maxDelay, variance } = this.config.jitter;
    const baseDelay = minDelay + Math.random() * (maxDelay - minDelay);
    const varianceAmount = baseDelay * (variance / 100);
    const actualDelay = baseDelay + (Math.random() - 0.5) * 2 * varianceAmount;

    return new Promise(resolve => setTimeout(resolve, Math.max(0, actualDelay)));
  }

  protected obfuscateTraffic(data: Buffer): Buffer {
    if (!this.config.obfuscation?.trafficPadding?.enabled) {
      return data;
    }

    const { minSize, maxSize } = this.config.obfuscation.trafficPadding;
    const targetSize = minSize + Math.random() * (maxSize - minSize);

    if (data.length >= targetSize) {
      return data;
    }

    const paddingSize = Math.floor(targetSize - data.length);
    const padding = Buffer.alloc(paddingSize, 0);

    // Add random padding
    for (let i = 0; i < paddingSize; i++) {
      padding[i] = Math.floor(Math.random() * 256);
    }

    return Buffer.concat([data, padding]);
  }
}

export interface IProtocolManager {
  registerHandler(protocol: Protocol, handler: BaseProtocolHandler): void;
  unregisterHandler(protocol: Protocol): void;
  sendMessage(
    implantId: string,
    message: ProtocolMessage,
    preferredProtocol?: Protocol
  ): Promise<boolean>;
  getAvailableProtocols(): Protocol[];
  getProtocolStats(): ProtocolStats[];
  isImplantConnected(implantId: string): boolean;
  getImplantConnection(implantId: string): ConnectionInfo | null;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type MessageHandler = (
  message: ProtocolMessage,
  connectionInfo: ConnectionInfo
) => Promise<void>;

export interface IMessageRouter {
  routeMessage(message: ProtocolMessage, connectionInfo: ConnectionInfo): Promise<void>;
  registerHandler(messageType: string, handler: MessageHandler): void;
  unregisterHandler(messageType: string): void;
}
