/**
 * Tests for WebSocket service
 */

import { WebSocketService } from '../websocketService';
import { io } from 'socket.io-client';

// Mock socket.io-client
jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}));

describe('WebSocketService', () => {
  let webSocketService: WebSocketService;
  let mockSocket: any;

  beforeEach(() => {
    mockSocket = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      removeAllListeners: jest.fn(),
      connected: false,
    };

    (io as jest.Mock).mockReturnValue(mockSocket);
    webSocketService = new WebSocketService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should connect with token', async () => {
      const token = 'test-token';

      // Mock successful connection
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      const connectPromise = webSocketService.connect(token);

      expect(io).toHaveBeenCalledWith({
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      await connectPromise;
    });

    it('should handle connection error', async () => {
      const token = 'test-token';
      const error = new Error('Connection failed');

      // Mock connection error
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect_error') {
          setTimeout(() => callback(error), 0);
        }
      });

      await expect(webSocketService.connect(token)).rejects.toThrow('Connection failed');
    });

    it('should attempt reconnection on connection error', async () => {
      const token = 'test-token';
      const error = new Error('Connection failed');

      jest.useFakeTimers();

      // Mock connection error followed by successful reconnection
      let connectErrorCount = 0;
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect_error') {
          connectErrorCount++;
          setTimeout(() => callback(error), 0);
        }
      });

      const connectPromise = webSocketService.connect(token);

      // Fast-forward timers to trigger reconnection
      jest.advanceTimersByTime(1000);

      expect(mockSocket.connect).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('disconnect', () => {
    it('should disconnect and clean up', () => {
      webSocketService['socket'] = mockSocket;

      webSocketService.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(webSocketService['socket']).toBeNull();
      expect(webSocketService['token']).toBeNull();
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(webSocketService.isConnected()).toBe(false);
    });

    it('should return true when connected', () => {
      mockSocket.connected = true;
      webSocketService['socket'] = mockSocket;

      expect(webSocketService.isConnected()).toBe(true);
    });
  });

  describe('event listeners', () => {
    beforeEach(() => {
      webSocketService['socket'] = mockSocket;
    });

    it('should register implant stats listener', () => {
      const callback = jest.fn();

      webSocketService.onImplantStats(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('implantStats', callback);
    });

    it('should register implant list listener', () => {
      const callback = jest.fn();

      webSocketService.onImplantList(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('implantList', callback);
    });

    it('should register implant details listener', () => {
      const callback = jest.fn();

      webSocketService.onImplantDetails(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('implantDetails', callback);
    });

    it('should register implant registered listener', () => {
      const callback = jest.fn();

      webSocketService.onImplantRegistered(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('implantRegistered', callback);
    });

    it('should register implant disconnected listener', () => {
      const callback = jest.fn();

      webSocketService.onImplantDisconnected(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('implantDisconnected', callback);
    });

    it('should register implant heartbeat listener', () => {
      const callback = jest.fn();

      webSocketService.onImplantHeartbeat(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('implantHeartbeat', callback);
    });

    it('should register implant status changed listener', () => {
      const callback = jest.fn();

      webSocketService.onImplantStatusChanged(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('implantStatusChanged', callback);
    });

    it('should register error listener', () => {
      const callback = jest.fn();

      webSocketService.onError(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('error', callback);
    });
  });

  describe('event emitters', () => {
    beforeEach(() => {
      webSocketService['socket'] = mockSocket;
    });

    it('should request implant stats', () => {
      webSocketService.requestImplantStats();

      expect(mockSocket.emit).toHaveBeenCalledWith('requestImplantStats');
    });

    it('should request implant list', () => {
      webSocketService.requestImplantList();

      expect(mockSocket.emit).toHaveBeenCalledWith('requestImplantList');
    });

    it('should request implant details', () => {
      const implantId = 'test-implant-id';

      webSocketService.requestImplantDetails(implantId);

      expect(mockSocket.emit).toHaveBeenCalledWith('requestImplantDetails', implantId);
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      webSocketService['socket'] = mockSocket;
    });

    it('should remove all listeners', () => {
      webSocketService.removeAllListeners();

      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
    });

    it('should remove specific event listener', () => {
      webSocketService.off('implantStats');

      expect(mockSocket.off).toHaveBeenCalledWith('implantStats');
    });
  });

  describe('edge cases', () => {
    it('should handle methods when socket is null', () => {
      webSocketService['socket'] = null;

      // These should not throw errors
      expect(() => webSocketService.requestImplantStats()).not.toThrow();
      expect(() => webSocketService.requestImplantList()).not.toThrow();
      expect(() => webSocketService.requestImplantDetails('test')).not.toThrow();
      expect(() => webSocketService.removeAllListeners()).not.toThrow();
      expect(() => webSocketService.off('implantStats')).not.toThrow();
    });

    it('should handle disconnect when socket is null', () => {
      webSocketService['socket'] = null;

      expect(() => webSocketService.disconnect()).not.toThrow();
    });
  });
});
