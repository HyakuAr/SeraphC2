/**
 * Unit tests for WebSocketHandler
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { WebSocketHandler, WebSocketConfig } from '../../../src/protocols/websocket-handler';
import { Protocol } from '../../../src/types/entities';
import { Logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('socket.io');
jest.mock('../../../src/utils/logger');

const MockedSocketIOServer = SocketIOServer as jest.MockedClass<typeof SocketIOServer>;
const MockedLogger = Logger as jest.MockedClass<typeof Logger>;

describe('WebSocketHandler', () => {
  let webSocketHandler: WebSocketHandler;
  let mockHttpServer: HTTPServer;
  let mockSocketIOServer: jest.Mocked<SocketIOServer>;
  let mockLogger: jest.Mocked<Logger>;
  let config: WebSocketConfig;

  beforeEach(() => {
    mockHttpServer = {} as HTTPServer;

    mockSocketIOServer = {
      use: jest.fn(),
      on: jest.fn(),
      close: jest.fn(),
      emit: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      getInstance: jest.fn(),
    } as any;

    MockedSocketIOServer.mockImplementation(() => mockSocketIOServer);
    MockedLogger.getInstance.mockReturnValue(mockLogger);

    config = {
      protocol: Protocol.WEBSOCKET,
      host: '0.0.0.0',
      port: 8080,
      timeout: 300000,
      jitter: { min: 1000, max: 5000 },
      obfuscation: { enabled: false },
      corsOrigins: ['http://localhost:3000'],
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    };

    webSocketHandler = new WebSocketHandler(mockHttpServer, config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct protocol and config', () => {
      expect(webSocketHandler.protocol).toBe(Protocol.WEBSOCKET);
      expect(webSocketHandler.isRunning).toBe(false);
    });
  });

  describe('start', () => {
    it('should start WebSocket server successfully', async () => {
      await webSocketHandler.start();

      expect(MockedSocketIOServer).toHaveBeenCalledWith(mockHttpServer, {
        cors: {
          origin: ['http://localhost:3000'],
          credentials: true,
        },
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000,
      });

      expect(mockSocketIOServer.use).toHaveBeenCalled(); // Authentication middleware
      expect(mockSocketIOServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
      expect(webSocketHandler.isRunning).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'WebSocket protocol handler started successfully'
      );
    });

    it('should throw error if already running', async () => {
      (webSocketHandler as any).isRunning = true;

      await expect(webSocketHandler.start()).rejects.toThrow(
        'WebSocket handler is already running'
      );
    });

    it('should setup authentication middleware', async () => {
      await webSocketHandler.start();

      expect(mockSocketIOServer.use).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      await webSocketHandler.start();
    });

    it('should stop WebSocket server successfully', async () => {
      // Mock connected sockets
      const mockSocket = {
        disconnect: jest.fn(),
        implantId: 'test-implant-1',
      };
      (webSocketHandler as any).implantSockets.set('test-implant-1', mockSocket);

      await webSocketHandler.stop();

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockSocketIOServer.close).toHaveBeenCalled();
      expect(webSocketHandler.isRunning).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket protocol handler stopped');
    });

    it('should do nothing if not running', async () => {
      await webSocketHandler.stop();
      await webSocketHandler.stop(); // Second call should do nothing

      expect(mockSocketIOServer.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      await webSocketHandler.start();
    });

    it('should send message to connected implant', async () => {
      const implantId = 'test-implant-1';
      const mockSocket = {
        connected: true,
        emit: jest.fn(),
        implantId,
      };

      (webSocketHandler as any).implantSockets.set(implantId, mockSocket);

      const message = {
        id: 'msg-1',
        type: 'command' as const,
        implantId,
        timestamp: new Date(),
        payload: { command: 'whoami' },
        encrypted: false,
      };

      const result = await webSocketHandler.sendMessage(implantId, message);

      expect(result).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('message', message);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Message sent via WebSocket',
        expect.objectContaining({
          implantId,
          messageId: 'msg-1',
          type: 'command',
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

      const result = await webSocketHandler.sendMessage('non-existent', message);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Implant not connected via WebSocket', {
        implantId: 'non-existent',
      });
    });

    it('should return false for disconnected implant', async () => {
      const implantId = 'test-implant-1';
      const mockSocket = {
        connected: false,
        emit: jest.fn(),
        implantId,
      };

      (webSocketHandler as any).implantSockets.set(implantId, mockSocket);

      const message = {
        id: 'msg-1',
        type: 'command' as const,
        implantId,
        timestamp: new Date(),
        payload: { command: 'whoami' },
        encrypted: false,
      };

      const result = await webSocketHandler.sendMessage(implantId, message);

      expect(result).toBe(false);
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('getConnectionInfo', () => {
    it('should return connection info for existing implant', () => {
      const implantId = 'test-implant-1';
      const connectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '192.168.1.100',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      const mockSocket = {
        implantId,
        connectionInfo,
      };

      (webSocketHandler as any).implantSockets.set(implantId, mockSocket);

      const result = webSocketHandler.getConnectionInfo(implantId);

      expect(result).toBe(connectionInfo);
    });

    it('should return null for non-existent implant', () => {
      const result = webSocketHandler.getConnectionInfo('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('isImplantConnected', () => {
    it('should return true for connected and authenticated implant', () => {
      const implantId = 'test-implant-1';
      const mockSocket = {
        connected: true,
        authenticated: true,
        implantId,
      };

      (webSocketHandler as any).implantSockets.set(implantId, mockSocket);

      const result = webSocketHandler.isImplantConnected(implantId);

      expect(result).toBe(true);
    });

    it('should return false for disconnected implant', () => {
      const implantId = 'test-implant-1';
      const mockSocket = {
        connected: false,
        authenticated: true,
        implantId,
      };

      (webSocketHandler as any).implantSockets.set(implantId, mockSocket);

      const result = webSocketHandler.isImplantConnected(implantId);

      expect(result).toBe(false);
    });

    it('should return false for unauthenticated implant', () => {
      const implantId = 'test-implant-1';
      const mockSocket = {
        connected: true,
        authenticated: false,
        implantId,
      };

      (webSocketHandler as any).implantSockets.set(implantId, mockSocket);

      const result = webSocketHandler.isImplantConnected(implantId);

      expect(result).toBe(false);
    });

    it('should return false for non-existent implant', () => {
      const result = webSocketHandler.isImplantConnected('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('getConnectedImplants', () => {
    it('should return list of connected implants', () => {
      const implant1 = 'implant-1';
      const implant2 = 'implant-2';
      const implant3 = 'implant-3';

      // Connected and authenticated
      (webSocketHandler as any).implantSockets.set(implant1, {
        connected: true,
        authenticated: true,
        implantId: implant1,
      });

      // Connected and authenticated
      (webSocketHandler as any).implantSockets.set(implant2, {
        connected: true,
        authenticated: true,
        implantId: implant2,
      });

      // Connected but not authenticated
      (webSocketHandler as any).implantSockets.set(implant3, {
        connected: true,
        authenticated: false,
        implantId: implant3,
      });

      const result = webSocketHandler.getConnectedImplants();

      expect(result).toHaveLength(2);
      expect(result).toContain(implant1);
      expect(result).toContain(implant2);
      expect(result).not.toContain(implant3);
    });

    it('should return empty array when no implants connected', () => {
      const result = webSocketHandler.getConnectedImplants();

      expect(result).toEqual([]);
    });
  });

  describe('broadcastMessage', () => {
    beforeEach(async () => {
      await webSocketHandler.start();
    });

    it('should broadcast message to all connected implants', async () => {
      const implant1 = 'implant-1';
      const implant2 = 'implant-2';

      const mockSocket1 = {
        connected: true,
        authenticated: true,
        emit: jest.fn(),
        implantId: implant1,
      };

      const mockSocket2 = {
        connected: true,
        authenticated: true,
        emit: jest.fn(),
        implantId: implant2,
      };

      (webSocketHandler as any).implantSockets.set(implant1, mockSocket1);
      (webSocketHandler as any).implantSockets.set(implant2, mockSocket2);

      const message = {
        id: 'msg-1',
        type: 'command' as const,
        implantId: 'broadcast',
        timestamp: new Date(),
        payload: { command: 'shutdown' },
        encrypted: false,
      };

      const result = await webSocketHandler.broadcastMessage(message);

      expect(result).toBe(2);
      expect(mockSocket1.emit).toHaveBeenCalledWith('message', message);
      expect(mockSocket2.emit).toHaveBeenCalledWith('message', message);
    });

    it('should return 0 when no implants connected', async () => {
      const message = {
        id: 'msg-1',
        type: 'command' as const,
        implantId: 'broadcast',
        timestamp: new Date(),
        payload: { command: 'shutdown' },
        encrypted: false,
      };

      const result = await webSocketHandler.broadcastMessage(message);

      expect(result).toBe(0);
    });
  });

  describe('disconnectImplant', () => {
    it('should disconnect specific implant', () => {
      const implantId = 'test-implant-1';
      const mockSocket = {
        disconnect: jest.fn(),
        implantId,
      };

      (webSocketHandler as any).implantSockets.set(implantId, mockSocket);

      webSocketHandler.disconnectImplant(implantId, 'Test disconnect');

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Implant disconnected by server', {
        implantId,
        reason: 'Test disconnect',
      });
    });

    it('should do nothing for non-existent implant', () => {
      webSocketHandler.disconnectImplant('non-existent');

      // Should not throw or log errors
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('authentication middleware', () => {
    let authMiddleware: Function;

    beforeEach(async () => {
      await webSocketHandler.start();
      authMiddleware = mockSocketIOServer.use.mock.calls[0][0];
    });

    it('should authenticate valid implant', async () => {
      const mockSocket = {
        handshake: {
          auth: {
            implantId: 'test-implant-1',
            encryptionKey: 'valid-key',
          },
          address: '192.168.1.100',
          headers: {
            'user-agent': 'Test Agent',
          },
        },
      };

      const next = jest.fn();

      await authMiddleware(mockSocket, next);

      expect(mockSocket.implantId).toBe('test-implant-1');
      expect(mockSocket.authenticated).toBe(true);
      expect(mockSocket.connectionInfo).toMatchObject({
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '192.168.1.100',
        userAgent: 'Test Agent',
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject implant without authentication data', async () => {
      const mockSocket = {
        handshake: {
          auth: {},
          address: '192.168.1.100',
          headers: {},
        },
      };

      const next = jest.fn();

      await authMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(new Error('Authentication data required'));
    });

    it('should reject implant with missing implantId', async () => {
      const mockSocket = {
        handshake: {
          auth: {
            encryptionKey: 'valid-key',
          },
          address: '192.168.1.100',
          headers: {},
        },
      };

      const next = jest.fn();

      await authMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(new Error('Authentication data required'));
    });

    it('should reject implant with missing encryption key', async () => {
      const mockSocket = {
        handshake: {
          auth: {
            implantId: 'test-implant-1',
          },
          address: '192.168.1.100',
          headers: {},
        },
      };

      const next = jest.fn();

      await authMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(new Error('Authentication data required'));
    });
  });

  describe('connection event handling', () => {
    let connectionHandler: Function;
    let mockSocket: any;

    beforeEach(async () => {
      await webSocketHandler.start();
      connectionHandler = mockSocketIOServer.on.mock.calls.find(
        call => call[0] === 'connection'
      )[1];

      mockSocket = {
        id: 'socket-123',
        implantId: 'test-implant-1',
        authenticated: true,
        handshake: {
          address: '192.168.1.100',
        },
        connectionInfo: {
          protocol: Protocol.WEBSOCKET,
          remoteAddress: '192.168.1.100',
          connectedAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
        },
        on: jest.fn(),
        disconnect: jest.fn(),
      };
    });

    it('should handle successful connection', () => {
      connectionHandler(mockSocket);

      expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('heartbeat', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));

      expect(mockLogger.info).toHaveBeenCalledWith(
        'WebSocket implant connected',
        expect.objectContaining({
          implantId: 'test-implant-1',
          socketId: 'socket-123',
        })
      );
    });

    it('should disconnect unauthenticated socket', () => {
      mockSocket.authenticated = false;

      connectionHandler(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should disconnect socket without implantId', () => {
      mockSocket.implantId = undefined;

      connectionHandler(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle message events', () => {
      connectionHandler(mockSocket);

      const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
      const testMessage = {
        id: 'msg-1',
        type: 'response',
        implantId: 'test-implant-1',
        timestamp: new Date(),
        payload: { result: 'success' },
        encrypted: false,
      };

      messageHandler(testMessage);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Message received via WebSocket',
        expect.objectContaining({
          implantId: 'test-implant-1',
          messageId: 'msg-1',
          type: 'response',
        })
      );
    });

    it('should handle heartbeat events', () => {
      connectionHandler(mockSocket);

      const heartbeatHandler = mockSocket.on.mock.calls.find(call => call[0] === 'heartbeat')[1];
      const heartbeatData = { status: 'alive', timestamp: new Date() };

      heartbeatHandler(heartbeatData);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Heartbeat received via WebSocket',
        expect.objectContaining({
          implantId: 'test-implant-1',
        })
      );
    });

    it('should handle disconnect events', () => {
      connectionHandler(mockSocket);

      const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')[1];

      disconnectHandler('client disconnect');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'WebSocket implant disconnected',
        expect.objectContaining({
          implantId: 'test-implant-1',
          socketId: 'socket-123',
          reason: 'client disconnect',
        })
      );
    });

    it('should handle socket errors', () => {
      connectionHandler(mockSocket);

      const errorHandler = mockSocket.on.mock.calls.find(call => call[0] === 'error')[1];
      const error = new Error('Socket error');

      errorHandler(error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'WebSocket socket error',
        expect.objectContaining({
          error: 'Socket error',
          implantId: 'test-implant-1',
          socketId: 'socket-123',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle start errors gracefully', async () => {
      const error = new Error('Server start failed');
      MockedSocketIOServer.mockImplementation(() => {
        throw error;
      });

      await expect(webSocketHandler.start()).rejects.toThrow('Server start failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle message sending errors', async () => {
      await webSocketHandler.start();

      const implantId = 'test-implant-1';
      const mockSocket = {
        connected: true,
        authenticated: true,
        emit: jest.fn().mockImplementation(() => {
          throw new Error('Emit failed');
        }),
        implantId,
      };

      (webSocketHandler as any).implantSockets.set(implantId, mockSocket);

      const message = {
        id: 'msg-1',
        type: 'command' as const,
        implantId,
        timestamp: new Date(),
        payload: { command: 'whoami' },
        encrypted: false,
      };

      const result = await webSocketHandler.sendMessage(implantId, message);

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send WebSocket message',
        expect.objectContaining({
          error: 'Emit failed',
          implantId,
          messageId: 'msg-1',
        })
      );
    });
  });
});
