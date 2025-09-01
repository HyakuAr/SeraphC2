/**
 * Unit tests for Session Cache service
 */

import {
  SessionCacheService,
  SessionData,
  SessionConfig,
} from '../../../src/core/cache/session-cache.service';
import { RedisService } from '../../../src/core/cache/redis.service';

// Mock RedisService
const mockRedisService = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  expire: jest.fn(),
  sadd: jest.fn(),
  srem: jest.fn(),
  smembers: jest.fn(),
  keys: jest.fn(),
} as any;

describe('SessionCacheService', () => {
  let sessionCacheService: SessionCacheService;

  const config: SessionConfig = {
    defaultTtlSeconds: 3600,
    maxIdleTimeSeconds: 1800,
    enableSlidingExpiration: true,
    maxConcurrentSessions: 5,
    sessionKeyPrefix: 'session:',
  };

  const mockSessionData: SessionData = {
    operatorId: 'operator-123',
    username: 'testuser',
    role: 'operator',
    permissions: ['read', 'write'],
    loginTime: new Date('2024-01-01T10:00:00Z'),
    lastActivity: new Date('2024-01-01T11:00:00Z'),
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0',
    mfaVerified: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionCacheService = SessionCacheService.getInstance(mockRedisService as RedisService, config);
  });

  afterEach(() => {
    // Reset singleton instance
    (SessionCacheService as any).instance = null;
  });

  describe('session creation', () => {
    it('should create a new session', async () => {
      mockRedisService.set!.mockResolvedValue(undefined);
      mockRedisService.sadd!.mockResolvedValue(1);
      mockRedisService.smembers!.mockResolvedValue(['session-123']);

      await sessionCacheService.createSession('session-123', mockSessionData);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'session:session-123',
        expect.objectContaining({
          operatorId: 'operator-123',
          username: 'testuser',
          loginTime: '2024-01-01T10:00:00.000Z',
          lastActivity: '2024-01-01T11:00:00.000Z',
        }),
        3600
      );
      expect(mockRedisService.sadd).toHaveBeenCalledWith(
        'active_sessions:operator-123',
        'session-123'
      );
    });

    it('should enforce concurrent session limits', async () => {
      const existingSessions = ['session-1', 'session-2', 'session-3', 'session-4', 'session-5'];
      mockRedisService.smembers!.mockResolvedValue(existingSessions);
      mockRedisService.get!.mockImplementation((key: string) => {
        if (key.includes('session:session-')) {
          return Promise.resolve({
            ...mockSessionData,
            lastActivity: new Date('2024-01-01T09:00:00Z'), // Older activity
          });
        }
        return Promise.resolve(null);
      });
      mockRedisService.del!.mockResolvedValue(1);
      mockRedisService.srem!.mockResolvedValue(1);

      await sessionCacheService.createSession('session-new', mockSessionData);

      // Should delete oldest session
      expect(mockRedisService.del).toHaveBeenCalled();
      expect(mockRedisService.srem).toHaveBeenCalled();
    });
  });

  describe('session retrieval', () => {
    it('should get existing session', async () => {
      const storedData = {
        ...mockSessionData,
        loginTime: '2024-01-01T10:00:00.000Z',
        lastActivity: '2024-01-01T11:00:00.000Z',
      };
      mockRedisService.get!.mockResolvedValue(storedData);

      const result = await sessionCacheService.getSession('session-123');

      expect(mockRedisService.get).toHaveBeenCalledWith('session:session-123');
      expect(result).toEqual(
        expect.objectContaining({
          operatorId: 'operator-123',
          username: 'testuser',
          loginTime: new Date('2024-01-01T10:00:00.000Z'),
          lastActivity: new Date('2024-01-01T11:00:00.000Z'),
        })
      );
    });

    it('should return null for non-existent session', async () => {
      mockRedisService.get!.mockResolvedValue(null);

      const result = await sessionCacheService.getSession('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('session updates', () => {
    it('should update existing session', async () => {
      mockRedisService.get!.mockResolvedValue({
        ...mockSessionData,
        loginTime: '2024-01-01T10:00:00.000Z',
        lastActivity: '2024-01-01T11:00:00.000Z',
      });
      mockRedisService.set!.mockResolvedValue(undefined);
      mockRedisService.expire!.mockResolvedValue(true);

      const updates = { mfaVerified: false };
      await sessionCacheService.updateSession('session-123', updates);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'session:session-123',
        expect.objectContaining({
          mfaVerified: false,
          lastActivity: expect.any(String),
        }),
        3600
      );
      expect(mockRedisService.expire).toHaveBeenCalledWith('session:session-123', 3600);
    });

    it('should throw error for non-existent session', async () => {
      mockRedisService.get!.mockResolvedValue(null);

      await expect(
        sessionCacheService.updateSession('non-existent', { mfaVerified: false })
      ).rejects.toThrow('Session not found');
    });
  });

  describe('session touch', () => {
    it('should update last activity time', async () => {
      mockRedisService.get!.mockResolvedValue({
        ...mockSessionData,
        loginTime: '2024-01-01T10:00:00.000Z',
        lastActivity: '2024-01-01T11:00:00.000Z',
      });
      mockRedisService.set!.mockResolvedValue(undefined);
      mockRedisService.expire!.mockResolvedValue(true);

      await sessionCacheService.touchSession('session-123');

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'session:session-123',
        expect.objectContaining({
          lastActivity: expect.any(String),
        }),
        3600
      );
    });

    it('should handle non-existent session gracefully', async () => {
      mockRedisService.get!.mockResolvedValue(null);

      await expect(sessionCacheService.touchSession('non-existent')).resolves.not.toThrow();
    });
  });

  describe('session deletion', () => {
    it('should delete session and remove from active sessions', async () => {
      mockRedisService.get!.mockResolvedValue({
        ...mockSessionData,
        loginTime: '2024-01-01T10:00:00.000Z',
        lastActivity: '2024-01-01T11:00:00.000Z',
      });
      mockRedisService.srem!.mockResolvedValue(1);
      mockRedisService.del!.mockResolvedValue(1);

      await sessionCacheService.deleteSession('session-123');

      expect(mockRedisService.srem).toHaveBeenCalledWith(
        'active_sessions:operator-123',
        'session-123'
      );
      expect(mockRedisService.del).toHaveBeenCalledWith('session:session-123');
    });
  });

  describe('operator session management', () => {
    it('should delete all sessions for an operator', async () => {
      const sessionIds = ['session-1', 'session-2', 'session-3'];
      mockRedisService.smembers!.mockResolvedValue(sessionIds);
      mockRedisService.del!.mockResolvedValue(1);

      await sessionCacheService.deleteOperatorSessions('operator-123');

      expect(mockRedisService.del).toHaveBeenCalledTimes(4); // 3 sessions + active sessions set
      expect(mockRedisService.del).toHaveBeenCalledWith('session:session-1');
      expect(mockRedisService.del).toHaveBeenCalledWith('session:session-2');
      expect(mockRedisService.del).toHaveBeenCalledWith('session:session-3');
      expect(mockRedisService.del).toHaveBeenCalledWith('active_sessions:operator-123');
    });

    it('should get all sessions for an operator', async () => {
      const sessionIds = ['session-1', 'session-2'];
      mockRedisService.smembers!.mockResolvedValue(sessionIds);
      mockRedisService.get!.mockImplementation((key: string) => {
        if (key === 'session:session-1' || key === 'session:session-2') {
          return Promise.resolve({
            ...mockSessionData,
            loginTime: '2024-01-01T10:00:00.000Z',
            lastActivity: '2024-01-01T11:00:00.000Z',
          });
        }
        return Promise.resolve(null);
      });

      const sessions = await sessionCacheService.getOperatorSessions('operator-123');

      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toEqual(
        expect.objectContaining({
          operatorId: 'operator-123',
        })
      );
    });
  });

  describe('session validation', () => {
    it('should validate active session', async () => {
      const recentActivity = new Date(Date.now() - 300000); // 5 minutes ago
      mockRedisService.get!.mockResolvedValue({
        ...mockSessionData,
        loginTime: '2024-01-01T10:00:00.000Z',
        lastActivity: recentActivity.toISOString(),
      });

      const isValid = await sessionCacheService.isValidSession('session-123');

      expect(isValid).toBe(true);
    });

    it('should invalidate expired session', async () => {
      const oldActivity = new Date(Date.now() - 3600000); // 1 hour ago
      mockRedisService.get!.mockResolvedValue({
        ...mockSessionData,
        loginTime: '2024-01-01T10:00:00.000Z',
        lastActivity: oldActivity.toISOString(),
      });
      mockRedisService.srem!.mockResolvedValue(1);
      mockRedisService.del!.mockResolvedValue(1);

      const isValid = await sessionCacheService.isValidSession('session-123');

      expect(isValid).toBe(false);
      expect(mockRedisService.del).toHaveBeenCalledWith('session:session-123');
    });

    it('should return false for non-existent session', async () => {
      mockRedisService.get!.mockResolvedValue(null);

      const isValid = await sessionCacheService.isValidSession('non-existent');

      expect(isValid).toBe(false);
    });
  });

  describe('session statistics', () => {
    it('should return session statistics', async () => {
      const sessionKeys = ['session:session-1', 'session:session-2'];
      mockRedisService.keys!.mockResolvedValue(sessionKeys);
      mockRedisService.get!.mockImplementation((key: string) => {
        if (key === 'session:session-1') {
          return Promise.resolve({
            ...mockSessionData,
            operatorId: 'operator-1',
            loginTime: '2024-01-01T10:00:00.000Z',
            lastActivity: '2024-01-01T11:00:00.000Z',
          });
        }
        if (key === 'session:session-2') {
          return Promise.resolve({
            ...mockSessionData,
            operatorId: 'operator-2',
            loginTime: '2024-01-01T09:00:00.000Z',
            lastActivity: '2024-01-01T10:30:00.000Z',
          });
        }
        return Promise.resolve(null);
      });

      const stats = await sessionCacheService.getSessionStats();

      expect(stats.totalActiveSessions).toBe(2);
      expect(stats.sessionsByOperator).toEqual({
        'operator-1': 1,
        'operator-2': 1,
      });
      expect(stats.averageSessionDuration).toBeGreaterThan(0);
      expect(stats.oldestSession).toEqual(new Date('2024-01-01T09:00:00.000Z'));
    });
  });

  describe('session cleanup', () => {
    it('should cleanup expired sessions', async () => {
      const sessionKeys = ['session:session-1', 'session:session-2'];
      mockRedisService.keys!.mockResolvedValue(sessionKeys);

      // Mock first session as expired, second as valid
      mockRedisService.get!.mockImplementation((key: string) => {
        if (key === 'session:session-1') {
          return Promise.resolve({
            ...mockSessionData,
            loginTime: '2024-01-01T08:00:00.000Z',
            lastActivity: '2024-01-01T08:30:00.000Z', // Very old
          });
        }
        if (key === 'session:session-2') {
          return Promise.resolve({
            ...mockSessionData,
            loginTime: '2024-01-01T10:00:00.000Z',
            lastActivity: new Date(Date.now() - 300000).toISOString(), // Recent
          });
        }
        return Promise.resolve(null);
      });

      mockRedisService.srem!.mockResolvedValue(1);
      mockRedisService.del!.mockResolvedValue(1);

      const cleanedCount = await sessionCacheService.cleanupExpiredSessions();

      expect(cleanedCount).toBe(1);
    });
  });
});
