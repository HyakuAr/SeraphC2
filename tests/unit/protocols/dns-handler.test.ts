/**
 * Unit tests for DNSHandler
 */

import { createSocket } from 'dgram';
import { DNSHandler, DNSConfig } from '../../../src/protocols/dns-handler.ts';
import { Protocol } from '../../../src/types/entities';
import { Logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('dgram');
jest.mock('../../../src/utils/logger');

const mockCreateSocket = createSocket as jest.MockedFunction<typeof createSocket>;
const MockedLogger = Logger as jest.MockedClass<typeof Logger>;

describe('DNSHandler', () => {
  let dnsHandler: DNSHandler;
  let mockSocket: any;
  let mockLogger: jest.Mocked<Logger>;
  let config: DNSConfig;

  beforeEach(() => {
    mockSocket = {
      bind: jest.fn(),
      close: jest.fn(),
      send: jest.fn(),
      on: jest.fn(),
      address: jest.fn().mockReturnValue({ address: '0.0.0.0', port: 53 }),
    };

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      getInstance: jest.fn(),
    } as any;

    mockCreateSocket.mockReturnValue(mockSocket);
    MockedLogger.getInstance.mockReturnValue(mockLogger);

    config = {
      protocol: Protocol.DNS,
      host: '0.0.0.0',
      port: 53,
      timeout: 300000,
      jitter: { min: 1000, max: 5000 },
      obfuscation: { enabled: false },
      domain: 'example.com',
      subdomains: {
        command: 'cmd',
        response: 'res',
        heartbeat: 'hb',
        registration: 'reg',
      },
      maxTxtRecordLength: 255,
      chunkSize: 200,
      compressionEnabled: false,
    };

    dnsHandler = new DNSHandler(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct protocol and config', () => {
      expect(dnsHandler.protocol).toBe(Protocol.DNS);
      expect(dnsHandler.isRunning).toBe(false);
    });
  });

  describe('start', () => {
    it('should start DNS server successfully', async () => {
      mockSocket.bind.mockImplementation((port, host, callback) => {
        callback();
      });

      await dnsHandler.start();

      expect(mockCreateSocket).toHaveBeenCalledWith('udp4');
      expect(mockSocket.bind).toHaveBeenCalledWith(53, '0.0.0.0', expect.any(Function));
      expect(dnsHandler.isRunning).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('DNS protocol handler started successfully');
    });

    it('should throw error if already running', async () => {
      (dnsHandler as any).isRunning = true;

      await expect(dnsHandler.start()).rejects.toThrow('DNS handler is already running');
    });

    it('should handle bind errors', async () => {
      const error = new Error('Port already in use');
      mockSocket.bind.mockImplementation((port, host, callback) => {
        callback(error);
      });

      await expect(dnsHandler.start()).rejects.toThrow('Port already in use');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should setup event handlers', async () => {
      mockSocket.bind.mockImplementation((port, host, callback) => {
        callback();
      });

      await dnsHandler.start();

      expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('listening', expect.any(Function));
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      mockSocket.bind.mockImplementation((port, host, callback) => {
        callback();
      });
      await dnsHandler.start();
    });

    it('should stop DNS server successfully', async () => {
      mockSocket.close.mockImplementation(callback => {
        callback();
      });

      await dnsHandler.stop();

      expect(mockSocket.close).toHaveBeenCalled();
      expect(dnsHandler.isRunning).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('DNS protocol handler stopped');
    });

    it('should do nothing if not running', async () => {
      await dnsHandler.stop();
      await dnsHandler.stop(); // Second call should do nothing

      expect(mockSocket.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      mockSocket.bind.mockImplementation((port, host, callback) => {
        callback();
      });
      await dnsHandler.start();
    });

    it('should queue message for implant', async () => {
      const implantId = 'test-implant-1';
      const message = {
        id: 'msg-1',
        type: 'command' as const,
        implantId,
        timestamp: new Date(),
        payload: { command: 'whoami' },
        encrypted: false,
      };

      // Create implant session
      const session = {
        implantId,
        lastQuery: new Date(),
        queryCount: 1,
        connectionInfo: {
          protocol: Protocol.DNS,
          remoteAddress: '192.168.1.100:12345',
          connectedAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
        },
        pendingMessages: [],
      };
      (dnsHandler as any).implantSessions.set(implantId, session);

      const result = await dnsHandler.sendMessage(implantId, message);

      expect(result).toBe(true);
      expect(session.pendingMessages).toHaveLength(1);
      expect(session.pendingMessages[0]).toBe(message);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Message queued for DNS delivery',
        expect.objectContaining({
          implantId,
          messageId: 'msg-1',
          type: 'command',
          queueSize: 1,
        })
      );
    });

    it('should return false for non-existent implant', async () => {
      const message = {
        id: 'msg-1',
        type: 'command' as const,
        implantId: 'non-existent',
        timestamp: new Date(),
        payload: { command: 'whoami' },
        encrypted: false,
      };

      const result = await dnsHandler.sendMessage('non-existent', message);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Implant session not found for DNS message', {
        implantId: 'non-existent',
      });
    });
  });

  describe('getConnectionInfo', () => {
    it('should return connection info for existing implant', () => {
      const implantId = 'test-implant-1';
      const connectionInfo = {
        protocol: Protocol.DNS,
        remoteAddress: '192.168.1.100:12345',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      const session = {
        implantId,
        lastQuery: new Date(),
        queryCount: 1,
        connectionInfo,
        pendingMessages: [],
      };

      (dnsHandler as any).implantSessions.set(implantId, session);

      const result = dnsHandler.getConnectionInfo(implantId);

      expect(result).toBe(connectionInfo);
    });

    it('should return null for non-existent implant', () => {
      const result = dnsHandler.getConnectionInfo('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('isImplantConnected', () => {
    it('should return true for recently active implant', () => {
      const implantId = 'test-implant-1';
      const session = {
        implantId,
        lastQuery: new Date(Date.now() - 60000), // 1 minute ago
        queryCount: 1,
        connectionInfo: {
          protocol: Protocol.DNS,
          remoteAddress: '192.168.1.100:12345',
          connectedAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
        },
        pendingMessages: [],
      };

      (dnsHandler as any).implantSessions.set(implantId, session);

      const result = dnsHandler.isImplantConnected(implantId);

      expect(result).toBe(true);
    });

    it('should return false for inactive implant', () => {
      const implantId = 'test-implant-1';
      const session = {
        implantId,
        lastQuery: new Date(Date.now() - 400000), // 6+ minutes ago (past timeout)
        queryCount: 1,
        connectionInfo: {
          protocol: Protocol.DNS,
          remoteAddress: '192.168.1.100:12345',
          connectedAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
        },
        pendingMessages: [],
      };

      (dnsHandler as any).implantSessions.set(implantId, session);

      const result = dnsHandler.isImplantConnected(implantId);

      expect(result).toBe(false);
    });

    it('should return false for non-existent implant', () => {
      const result = dnsHandler.isImplantConnected('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('getConnectedImplants', () => {
    it('should return list of connected implants', () => {
      const implant1 = 'implant-1';
      const implant2 = 'implant-2';
      const implant3 = 'implant-3';

      // Active implant
      (dnsHandler as any).implantSessions.set(implant1, {
        implantId: implant1,
        lastQuery: new Date(Date.now() - 60000), // 1 minute ago
        queryCount: 1,
        connectionInfo: { protocol: Protocol.DNS },
        pendingMessages: [],
      });

      // Active implant
      (dnsHandler as any).implantSessions.set(implant2, {
        implantId: implant2,
        lastQuery: new Date(Date.now() - 120000), // 2 minutes ago
        queryCount: 1,
        connectionInfo: { protocol: Protocol.DNS },
        pendingMessages: [],
      });

      // Inactive implant
      (dnsHandler as any).implantSessions.set(implant3, {
        implantId: implant3,
        lastQuery: new Date(Date.now() - 400000), // 6+ minutes ago
        queryCount: 1,
        connectionInfo: { protocol: Protocol.DNS },
        pendingMessages: [],
      });

      const result = dnsHandler.getConnectedImplants();

      expect(result).toHaveLength(2);
      expect(result).toContain(implant1);
      expect(result).toContain(implant2);
      expect(result).not.toContain(implant3);
    });

    it('should return empty array when no implants connected', () => {
      const result = dnsHandler.getConnectedImplants();

      expect(result).toEqual([]);
    });
  });

  describe('DNS query parsing', () => {
    it('should parse DNS query correctly', () => {
      // Create a simple DNS query buffer
      const queryBuffer = Buffer.alloc(100);
      queryBuffer.writeUInt16BE(0x1234, 0); // ID
      queryBuffer.writeUInt16BE(0x0100, 2); // Flags
      queryBuffer.writeUInt16BE(1, 4); // Questions count

      // Write query name: test.example.com
      let offset = 12;
      queryBuffer.writeUInt8(4, offset++); // Length of "test"
      queryBuffer.write('test', offset);
      offset += 4;
      queryBuffer.writeUInt8(7, offset++); // Length of "example"
      queryBuffer.write('example', offset);
      offset += 7;
      queryBuffer.writeUInt8(3, offset++); // Length of "com"
      queryBuffer.write('com', offset);
      offset += 3;
      queryBuffer.writeUInt8(0, offset++); // Null terminator

      queryBuffer.writeUInt16BE(1, offset); // Type A
      queryBuffer.writeUInt16BE(1, offset + 2); // Class IN

      const result = (dnsHandler as any).parseDNSQuery(queryBuffer);

      expect(result).toEqual({
        id: 0x1234,
        name: 'test.example.com',
        type: 1,
        class: 1,
      });
    });
  });

  describe('domain validation', () => {
    it('should identify C2 domains correctly', () => {
      const isC2Domain = (dnsHandler as any).isC2Domain.bind(dnsHandler);

      expect(isC2Domain('test.example.com')).toBe(true);
      expect(isC2Domain('cmd.implant1.example.com')).toBe(true);
      expect(isC2Domain('google.com')).toBe(false);
      expect(isC2Domain('test.other.com')).toBe(false);
    });
  });

  describe('implant info extraction', () => {
    it('should extract implant info from valid DNS query', () => {
      const extractImplantInfo = (dnsHandler as any).extractImplantInfo.bind(dnsHandler);

      const result = extractImplantInfo('data123.implant1.cmd.example.com');

      expect(result).toEqual({
        implantId: 'implant1',
        queryType: 'cmd',
        data: expect.any(String), // Base32 decoded data
      });
    });

    it('should handle chunked data format', () => {
      const extractImplantInfo = (dnsHandler as any).extractImplantInfo.bind(dnsHandler);

      const result = extractImplantInfo('data123.chunk1of3.implant1.cmd.example.com');

      expect(result).toEqual({
        implantId: 'implant1',
        queryType: 'cmd',
        data: expect.any(String),
        chunkIndex: 1,
        totalChunks: 3,
      });
    });

    it('should return null for invalid query format', () => {
      const extractImplantInfo = (dnsHandler as any).extractImplantInfo.bind(dnsHandler);

      expect(extractImplantInfo('invalid.example.com')).toBeNull();
      expect(extractImplantInfo('example.com')).toBeNull();
      expect(extractImplantInfo('test.invalid-type.example.com')).toBeNull();
    });
  });

  describe('base32 encoding/decoding', () => {
    it('should encode and decode base32 correctly', () => {
      const encodeBase32 = (dnsHandler as any).encodeBase32.bind(dnsHandler);
      const decodeBase32 = (dnsHandler as any).decodeBase32.bind(dnsHandler);

      const originalData = 'Hello, World!';
      const encoded = encodeBase32(originalData);
      const decoded = decodeBase32(encoded);

      expect(decoded).toBe(originalData);
      expect(encoded).toMatch(/^[a-z2-7]+$/); // Base32 alphabet
    });

    it('should handle empty strings', () => {
      const encodeBase32 = (dnsHandler as any).encodeBase32.bind(dnsHandler);
      const decodeBase32 = (dnsHandler as any).decodeBase32.bind(dnsHandler);

      const encoded = encodeBase32('');
      const decoded = decodeBase32(encoded);

      expect(decoded).toBe('');
    });
  });

  describe('DNS response creation', () => {
    it('should create DNS response with TXT records', () => {
      const query = {
        id: 0x1234,
        name: 'test.example.com',
        type: 16, // TXT
        class: 1, // IN
      };

      const txtRecords = ['record1', 'record2'];
      const createDNSResponse = (dnsHandler as any).createDNSResponse.bind(dnsHandler);

      const response = createDNSResponse(query, txtRecords);

      expect(response).toEqual({
        id: 0x1234,
        flags: 0x8180, // Response, authoritative
        questions: [query],
        answers: [
          {
            name: 'test.example.com',
            type: 16,
            class: 1,
            ttl: 60,
            data: 'record1',
          },
          {
            name: 'test.example.com',
            type: 16,
            class: 1,
            ttl: 60,
            data: 'record2',
          },
        ],
        authorities: [],
        additionals: [],
      });
    });
  });

  describe('message encoding for TXT records', () => {
    it('should encode small messages in single TXT record', () => {
      const message = {
        id: 'msg-1',
        type: 'command' as const,
        implantId: 'test',
        timestamp: new Date(),
        payload: { cmd: 'whoami' },
        encrypted: false,
      };

      const encodeMessageForTXT = (dnsHandler as any).encodeMessageForTXT.bind(dnsHandler);
      const result = encodeMessageForTXT(message);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1);
      expect(typeof result[0]).toBe('string');
    });

    it('should split large messages into chunks', () => {
      const largePayload = 'x'.repeat(1000); // Large payload
      const message = {
        id: 'msg-1',
        type: 'command' as const,
        implantId: 'test',
        timestamp: new Date(),
        payload: { data: largePayload },
        encrypted: false,
      };

      const encodeMessageForTXT = (dnsHandler as any).encodeMessageForTXT.bind(dnsHandler);
      const result = encodeMessageForTXT(message);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(1);

      // Check chunk format
      for (const chunk of result) {
        expect(chunk).toMatch(/^\d+:\d+:.+$/); // chunkIndex:totalChunks:data
      }
    });
  });

  describe('error handling', () => {
    it('should handle socket errors gracefully', async () => {
      mockSocket.bind.mockImplementation((port, host, callback) => {
        callback();
      });

      await dnsHandler.start();

      // Simulate socket error
      const errorHandler = mockSocket.on.mock.calls.find(call => call[0] === 'error')[1];
      const error = new Error('Socket error');

      errorHandler(error);

      expect(mockLogger.error).toHaveBeenCalledWith('DNS server error', { error: 'Socket error' });
    });

    it('should handle message processing errors', async () => {
      mockSocket.bind.mockImplementation((port, host, callback) => {
        callback();
      });

      await dnsHandler.start();

      // Simulate message handler
      const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
      const invalidBuffer = Buffer.from('invalid dns query');
      const rinfo = { address: '192.168.1.100', port: 12345 };

      // This should not throw, but should log error
      await messageHandler(invalidBuffer, rinfo);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
