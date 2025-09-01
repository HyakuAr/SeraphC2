/**
 * Session caching service using Redis
 * Provides distributed session management for scalability
 */

import { RedisService } from './redis.service';

export interface SessionData {
  operatorId: string;
  username: string;
  role: string;
  permissions: string[];
  loginTime: Date;
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
  mfaVerified: boolean;
  sessionMetadata?: Record<string, any>;
}

export interface SessionConfig {
  defaultTtlSeconds: number;
  maxIdleTimeSeconds: number;
  enableSlidingExpiration: boolean;
  maxConcurrentSessions: number;
  sessionKeyPrefix: string;
}

export class SessionCacheService {
  private static instance: SessionCacheService;
  private redis: RedisService;
  private config: SessionConfig;

  private constructor(redis: RedisService, config: SessionConfig) {
    this.redis = redis;
    this.config = config;
  }

  public static getInstance(redis?: RedisService, config?: SessionConfig): SessionCacheService {
    if (!SessionCacheService.instance) {
      if (!redis || !config) {
        throw new Error('Redis service and configuration required for first initialization');
      }
      SessionCacheService.instance = new SessionCacheService(redis, config);
    }
    return SessionCacheService.instance;
  }

  /**
   * Create a new session
   */
  public async createSession(sessionId: string, sessionData: SessionData): Promise<void> {
    const key = this.getSessionKey(sessionId);
    const data = {
      ...sessionData,
      loginTime: sessionData.loginTime.toISOString(),
      lastActivity: sessionData.lastActivity.toISOString(),
    };

    await this.redis.set(key, data, this.config.defaultTtlSeconds);

    // Track active sessions for the operator
    await this.addToActiveSessions(sessionData.operatorId, sessionId);

    // Enforce concurrent session limits
    await this.enforceConcurrentSessionLimit(sessionData.operatorId);
  }

  /**
   * Get session data
   */
  public async getSession(sessionId: string): Promise<SessionData | null> {
    const key = this.getSessionKey(sessionId);
    const data = await this.redis.get<any>(key);

    if (!data) {
      return null;
    }

    // Convert date strings back to Date objects
    return {
      ...data,
      loginTime: new Date(data.loginTime),
      lastActivity: new Date(data.lastActivity),
    };
  }

  /**
   * Update session data
   */
  public async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<void> {
    const existingSession = await this.getSession(sessionId);
    if (!existingSession) {
      throw new Error('Session not found');
    }

    const updatedData = {
      ...existingSession,
      ...updates,
      lastActivity: new Date(),
    };

    const key = this.getSessionKey(sessionId);
    await this.redis.set(
      key,
      {
        ...updatedData,
        loginTime: updatedData.loginTime.toISOString(),
        lastActivity: updatedData.lastActivity.toISOString(),
      },
      this.config.defaultTtlSeconds
    );

    // Extend session TTL if sliding expiration is enabled
    if (this.config.enableSlidingExpiration) {
      await this.redis.expire(key, this.config.defaultTtlSeconds);
    }
  }

  /**
   * Touch session to update last activity
   */
  public async touchSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      await this.updateSession(sessionId, { lastActivity: new Date() });
    }
  }

  /**
   * Delete a session
   */
  public async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      await this.removeFromActiveSessions(session.operatorId, sessionId);
    }

    const key = this.getSessionKey(sessionId);
    await this.redis.del(key);
  }

  /**
   * Delete all sessions for an operator
   */
  public async deleteOperatorSessions(operatorId: string): Promise<void> {
    const sessionIds = await this.getActiveSessionIds(operatorId);

    for (const sessionId of sessionIds) {
      const key = this.getSessionKey(sessionId);
      await this.redis.del(key);
    }

    // Clear the active sessions set
    const activeSessionsKey = this.getActiveSessionsKey(operatorId);
    await this.redis.del(activeSessionsKey);
  }

  /**
   * Get all active sessions for an operator
   */
  public async getOperatorSessions(operatorId: string): Promise<SessionData[]> {
    const sessionIds = await this.getActiveSessionIds(operatorId);
    const sessions: SessionData[] = [];

    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Check if session exists and is valid
   */
  public async isValidSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    // Check if session has expired due to inactivity
    const now = new Date();
    const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();

    if (timeSinceLastActivity > this.config.maxIdleTimeSeconds * 1000) {
      await this.deleteSession(sessionId);
      return false;
    }

    return true;
  }

  /**
   * Get session statistics
   */
  public async getSessionStats(): Promise<{
    totalActiveSessions: number;
    sessionsByOperator: Record<string, number>;
    averageSessionDuration: number;
    oldestSession: Date | null;
  }> {
    const pattern = `${this.config.sessionKeyPrefix}*`;
    const sessionKeys = await this.redis.keys(pattern);

    const sessionsByOperator: Record<string, number> = {};
    let totalDuration = 0;
    let oldestSession: Date | null = null;

    for (const key of sessionKeys) {
      const sessionId = key.replace(this.config.sessionKeyPrefix, '');
      const session = await this.getSession(sessionId);

      if (session) {
        // Count sessions by operator
        sessionsByOperator[session.operatorId] = (sessionsByOperator[session.operatorId] || 0) + 1;

        // Calculate session duration
        const duration = Date.now() - session.loginTime.getTime();
        totalDuration += duration;

        // Track oldest session
        if (!oldestSession || session.loginTime < oldestSession) {
          oldestSession = session.loginTime;
        }
      }
    }

    return {
      totalActiveSessions: sessionKeys.length,
      sessionsByOperator,
      averageSessionDuration: sessionKeys.length > 0 ? totalDuration / sessionKeys.length : 0,
      oldestSession,
    };
  }

  /**
   * Cleanup expired sessions
   */
  public async cleanupExpiredSessions(): Promise<number> {
    const pattern = `${this.config.sessionKeyPrefix}*`;
    const sessionKeys = await this.redis.keys(pattern);
    let cleanedCount = 0;

    for (const key of sessionKeys) {
      const sessionId = key.replace(this.config.sessionKeyPrefix, '');
      const isValid = await this.isValidSession(sessionId);

      if (!isValid) {
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get active session IDs for an operator
   */
  private async getActiveSessionIds(operatorId: string): Promise<string[]> {
    const key = this.getActiveSessionsKey(operatorId);
    return await this.redis.smembers(key);
  }

  /**
   * Add session to active sessions set
   */
  private async addToActiveSessions(operatorId: string, sessionId: string): Promise<void> {
    const key = this.getActiveSessionsKey(operatorId);
    await this.redis.sadd(key, sessionId);

    // Set TTL on the active sessions set
    await this.redis.expire(key, this.config.defaultTtlSeconds);
  }

  /**
   * Remove session from active sessions set
   */
  private async removeFromActiveSessions(operatorId: string, sessionId: string): Promise<void> {
    const key = this.getActiveSessionsKey(operatorId);
    await this.redis.srem(key, sessionId);
  }

  /**
   * Enforce concurrent session limits
   */
  private async enforceConcurrentSessionLimit(operatorId: string): Promise<void> {
    const sessionIds = await this.getActiveSessionIds(operatorId);

    if (sessionIds.length > this.config.maxConcurrentSessions) {
      // Sort sessions by last activity and remove oldest ones
      const sessions: Array<{ id: string; lastActivity: Date }> = [];

      for (const sessionId of sessionIds) {
        const session = await this.getSession(sessionId);
        if (session) {
          sessions.push({ id: sessionId, lastActivity: session.lastActivity });
        }
      }

      // Sort by last activity (oldest first)
      sessions.sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime());

      // Remove excess sessions
      const sessionsToRemove = sessions.slice(
        0,
        sessions.length - this.config.maxConcurrentSessions
      );

      for (const session of sessionsToRemove) {
        await this.deleteSession(session.id);
      }
    }
  }

  /**
   * Generate session key
   */
  private getSessionKey(sessionId: string): string {
    return `${this.config.sessionKeyPrefix}${sessionId}`;
  }

  /**
   * Generate active sessions key for an operator
   */
  private getActiveSessionsKey(operatorId: string): string {
    return `active_sessions:${operatorId}`;
  }
}
