/**
 * Distributed session management service
 * Provides session synchronization across multiple server instances
 */

import { EventEmitter } from 'events';
import { RedisService } from '../cache/redis.service';
import { SessionCacheService, SessionData } from '../cache/session-cache.service';

export interface DistributedSessionConfig {
  sessionSyncInterval: number;
  sessionReplicationFactor: number;
  enableSessionMigration: boolean;
  enableSessionFailover: boolean;
  sessionConsistencyLevel: 'eventual' | 'strong';
  conflictResolutionStrategy: 'last-write-wins' | 'merge' | 'manual';
  enableSessionBroadcast: boolean;
  broadcastChannel: string;
}

export interface SessionEvent {
  type: 'created' | 'updated' | 'deleted' | 'expired';
  sessionId: string;
  nodeId: string;
  timestamp: Date;
  data?: Partial<SessionData>;
  version: number;
}

export interface SessionConflict {
  sessionId: string;
  localVersion: SessionData;
  remoteVersion: SessionData;
  conflictType: 'concurrent-update' | 'version-mismatch' | 'data-inconsistency';
  timestamp: Date;
}

export interface DistributedSessionStats {
  totalSessions: number;
  localSessions: number;
  replicatedSessions: number;
  sessionConflicts: number;
  sessionMigrations: number;
  syncOperations: number;
  lastSyncTime: Date | null;
  averageSyncLatency: number;
}

export class DistributedSessionService extends EventEmitter {
  private static instance: DistributedSessionService;
  private redis: RedisService;
  private sessionCache: SessionCacheService;
  private config: DistributedSessionConfig;
  private nodeId: string;
  private sessionVersions: Map<string, number> = new Map();
  private pendingConflicts: Map<string, SessionConflict> = new Map();
  private stats: DistributedSessionStats;
  private syncInterval?: NodeJS.Timeout;
  private subscriber?: any;

  private constructor(
    redis: RedisService,
    sessionCache: SessionCacheService,
    config: DistributedSessionConfig,
    nodeId: string
  ) {
    super();
    this.redis = redis;
    this.sessionCache = sessionCache;
    this.config = config;
    this.nodeId = nodeId;

    this.stats = {
      totalSessions: 0,
      localSessions: 0,
      replicatedSessions: 0,
      sessionConflicts: 0,
      sessionMigrations: 0,
      syncOperations: 0,
      lastSyncTime: null,
      averageSyncLatency: 0,
    };

    this.initializeDistributedSessions();
  }

  public static getInstance(
    redis?: RedisService,
    sessionCache?: SessionCacheService,
    config?: DistributedSessionConfig,
    nodeId?: string
  ): DistributedSessionService {
    if (!DistributedSessionService.instance) {
      if (!redis || !sessionCache || !config || !nodeId) {
        throw new Error('All parameters required for first initialization');
      }
      DistributedSessionService.instance = new DistributedSessionService(
        redis,
        sessionCache,
        config,
        nodeId
      );
    }
    return DistributedSessionService.instance;
  }

  private async initializeDistributedSessions(): Promise<void> {
    try {
      // Start session synchronization
      this.startSessionSync();

      // Setup session event broadcasting
      if (this.config.enableSessionBroadcast) {
        await this.setupSessionBroadcast();
      }

      // Load existing session metadata
      await this.loadSessionMetadata();

      console.log(`🌐 Distributed session service initialized for node ${this.nodeId}`);
      this.emit('initialized');
    } catch (error) {
      console.error('❌ Failed to initialize distributed sessions:', error);
      throw error;
    }
  }

  public async createSession(sessionId: string, sessionData: SessionData): Promise<void> {
    try {
      // Create session locally
      await this.sessionCache.createSession(sessionId, sessionData);

      // Set initial version
      const version = 1;
      this.sessionVersions.set(sessionId, version);

      // Store session metadata for distribution
      await this.storeSessionMetadata(sessionId, {
        nodeId: this.nodeId,
        version,
        createdAt: new Date(),
        lastModified: new Date(),
        replicationNodes: [],
      });

      // Replicate session if needed
      if (this.config.sessionReplicationFactor > 1) {
        await this.replicateSession(sessionId, sessionData, version);
      }

      // Broadcast session creation
      if (this.config.enableSessionBroadcast) {
        await this.broadcastSessionEvent({
          type: 'created',
          sessionId,
          nodeId: this.nodeId,
          timestamp: new Date(),
          data: sessionData,
          version,
        });
      }

      this.stats.localSessions++;
      this.emit('sessionCreated', sessionId, sessionData);
    } catch (error) {
      console.error(`❌ Failed to create distributed session ${sessionId}:`, error);
      throw error;
    }
  }

  public async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<void> {
    try {
      // Get current version
      const currentVersion = this.sessionVersions.get(sessionId) || 1;
      const newVersion = currentVersion + 1;

      // Check for conflicts if strong consistency is required
      if (this.config.sessionConsistencyLevel === 'strong') {
        await this.checkSessionConflicts(sessionId, currentVersion);
      }

      // Update session locally
      await this.sessionCache.updateSession(sessionId, updates);

      // Update version
      this.sessionVersions.set(sessionId, newVersion);

      // Update session metadata
      await this.updateSessionMetadata(sessionId, {
        version: newVersion,
        lastModified: new Date(),
        lastModifiedBy: this.nodeId,
      });

      // Replicate updates
      if (this.config.sessionReplicationFactor > 1) {
        await this.replicateSessionUpdate(sessionId, updates, newVersion);
      }

      // Broadcast session update
      if (this.config.enableSessionBroadcast) {
        await this.broadcastSessionEvent({
          type: 'updated',
          sessionId,
          nodeId: this.nodeId,
          timestamp: new Date(),
          data: updates,
          version: newVersion,
        });
      }

      this.emit('sessionUpdated', sessionId, updates);
    } catch (error) {
      console.error(`❌ Failed to update distributed session ${sessionId}:`, error);
      throw error;
    }
  }

  public async deleteSession(sessionId: string): Promise<void> {
    try {
      // Delete session locally
      await this.sessionCache.deleteSession(sessionId);

      // Remove version tracking
      this.sessionVersions.delete(sessionId);

      // Delete session metadata
      await this.deleteSessionMetadata(sessionId);

      // Delete from replicas
      await this.deleteFromReplicas(sessionId);

      // Broadcast session deletion
      if (this.config.enableSessionBroadcast) {
        await this.broadcastSessionEvent({
          type: 'deleted',
          sessionId,
          nodeId: this.nodeId,
          timestamp: new Date(),
          version: 0,
        });
      }

      this.stats.localSessions--;
      this.emit('sessionDeleted', sessionId);
    } catch (error) {
      console.error(`❌ Failed to delete distributed session ${sessionId}:`, error);
      throw error;
    }
  }

  public async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      // Try to get session locally first
      let session = await this.sessionCache.getSession(sessionId);

      if (!session && this.config.enableSessionMigration) {
        // Try to migrate session from other nodes
        session = await this.migrateSession(sessionId);
      }

      return session;
    } catch (error) {
      console.error(`❌ Failed to get distributed session ${sessionId}:`, error);
      throw error;
    }
  }

  public async migrateSession(sessionId: string): Promise<SessionData | null> {
    try {
      // Get session metadata to find which nodes have this session
      const metadata = await this.getSessionMetadata(sessionId);
      if (!metadata) {
        return null;
      }

      // Try to get session from the primary node
      if (metadata.nodeId !== this.nodeId) {
        const session = await this.getSessionFromNode(sessionId, metadata.nodeId);
        if (session) {
          // Migrate session to this node
          await this.sessionCache.createSession(sessionId, session);
          this.sessionVersions.set(sessionId, metadata.version);

          // Update metadata to reflect migration
          await this.updateSessionMetadata(sessionId, {
            nodeId: this.nodeId,
            lastModified: new Date(),
          });

          this.stats.sessionMigrations++;
          this.emit('sessionMigrated', sessionId, metadata.nodeId, this.nodeId);

          return session;
        }
      }

      // Try replica nodes
      for (const replicaNodeId of metadata.replicationNodes || []) {
        if (replicaNodeId !== this.nodeId) {
          const session = await this.getSessionFromNode(sessionId, replicaNodeId);
          if (session) {
            await this.sessionCache.createSession(sessionId, session);
            this.sessionVersions.set(sessionId, metadata.version);

            this.stats.sessionMigrations++;
            this.emit('sessionMigrated', sessionId, replicaNodeId, this.nodeId);

            return session;
          }
        }
      }

      return null;
    } catch (error) {
      console.error(`❌ Failed to migrate session ${sessionId}:`, error);
      return null;
    }
  }

  public async resolveSessionConflict(
    sessionId: string,
    resolution: 'local' | 'remote' | 'merge'
  ): Promise<void> {
    const conflict = this.pendingConflicts.get(sessionId);
    if (!conflict) {
      throw new Error(`No pending conflict found for session ${sessionId}`);
    }

    try {
      let resolvedSession: SessionData;

      switch (resolution) {
        case 'local':
          resolvedSession = conflict.localVersion;
          break;
        case 'remote':
          resolvedSession = conflict.remoteVersion;
          break;
        case 'merge':
          resolvedSession = this.mergeSessionData(conflict.localVersion, conflict.remoteVersion);
          break;
        default:
          throw new Error(`Invalid resolution strategy: ${resolution}`);
      }

      // Update session with resolved data
      await this.sessionCache.updateSession(sessionId, resolvedSession);

      // Update version
      const newVersion =
        Math.max(
          this.sessionVersions.get(sessionId) || 0,
          conflict.remoteVersion.lastActivity.getTime()
        ) + 1;
      this.sessionVersions.set(sessionId, newVersion);

      // Remove conflict
      this.pendingConflicts.delete(sessionId);

      console.log(`✅ Resolved session conflict for ${sessionId} using ${resolution} strategy`);
      this.emit('conflictResolved', sessionId, resolution);
    } catch (error) {
      console.error(`❌ Failed to resolve session conflict for ${sessionId}:`, error);
      throw error;
    }
  }

  public getStats(): DistributedSessionStats {
    return { ...this.stats };
  }

  public getPendingConflicts(): SessionConflict[] {
    return Array.from(this.pendingConflicts.values());
  }

  public async stop(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    if (this.subscriber) {
      await this.subscriber.unsubscribe();
      await this.subscriber.quit();
    }

    console.log('🛑 Distributed session service stopped');
    this.emit('stopped');
  }

  // Private methods
  private startSessionSync(): void {
    this.syncInterval = setInterval(async () => {
      try {
        await this.synchronizeSessions();
      } catch (error) {
        console.error('❌ Session synchronization failed:', error);
      }
    }, this.config.sessionSyncInterval);
  }

  private async synchronizeSessions(): Promise<void> {
    const startTime = Date.now();

    try {
      // Get all session metadata
      const sessionKeys = await this.redis.keys('session_metadata:*');

      for (const key of sessionKeys) {
        const sessionId = key.replace('session_metadata:', '');
        const metadata = await this.getSessionMetadata(sessionId);

        if (metadata && metadata.nodeId !== this.nodeId) {
          // Check if we need to sync this session
          const localVersion = this.sessionVersions.get(sessionId) || 0;

          if (metadata.version > localVersion) {
            // Remote version is newer, sync it
            await this.syncSessionFromRemote(sessionId, metadata);
          }
        }
      }

      const syncLatency = Date.now() - startTime;
      this.stats.syncOperations++;
      this.stats.lastSyncTime = new Date();
      this.stats.averageSyncLatency =
        (this.stats.averageSyncLatency * (this.stats.syncOperations - 1) + syncLatency) /
        this.stats.syncOperations;
    } catch (error) {
      console.error('❌ Session synchronization error:', error);
    }
  }

  private async setupSessionBroadcast(): Promise<void> {
    this.subscriber = this.redis.getClient().duplicate();

    await this.subscriber.subscribe(this.config.broadcastChannel, (message: string) => {
      try {
        const event: SessionEvent = JSON.parse(message);

        // Ignore events from this node
        if (event.nodeId === this.nodeId) {
          return;
        }

        this.handleSessionEvent(event);
      } catch (error) {
        console.error('❌ Failed to handle session broadcast:', error);
      }
    });
  }

  private async handleSessionEvent(event: SessionEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'created':
          if (event.data && event.data.operatorId) {
            await this.handleRemoteSessionCreation(
              event.sessionId,
              event.data as SessionData,
              event.version
            );
          }
          break;
        case 'updated':
          if (event.data) {
            await this.handleRemoteSessionUpdate(event.sessionId, event.data, event.version);
          }
          break;
        case 'deleted':
          await this.handleRemoteSessionDeletion(event.sessionId);
          break;
      }
    } catch (error) {
      console.error(`❌ Failed to handle session event ${event.type}:`, error);
    }
  }

  private async handleRemoteSessionCreation(
    sessionId: string,
    sessionData: SessionData,
    version: number
  ): Promise<void> {
    // Check if we should replicate this session
    if (this.shouldReplicateSession(sessionId)) {
      await this.sessionCache.createSession(sessionId, sessionData);
      this.sessionVersions.set(sessionId, version);
      this.stats.replicatedSessions++;
    }
  }

  private async handleRemoteSessionUpdate(
    sessionId: string,
    updates: Partial<SessionData>,
    version: number
  ): Promise<void> {
    const localVersion = this.sessionVersions.get(sessionId) || 0;

    if (version > localVersion) {
      // Remote version is newer
      const existingSession = await this.sessionCache.getSession(sessionId);
      if (existingSession) {
        await this.sessionCache.updateSession(sessionId, updates);
        this.sessionVersions.set(sessionId, version);
      }
    } else if (version < localVersion) {
      // Local version is newer - potential conflict
      await this.handleVersionConflict(sessionId, updates, version);
    }
  }

  private async handleRemoteSessionDeletion(sessionId: string): Promise<void> {
    const existingSession = await this.sessionCache.getSession(sessionId);
    if (existingSession) {
      await this.sessionCache.deleteSession(sessionId);
      this.sessionVersions.delete(sessionId);
      this.stats.replicatedSessions--;
    }
  }

  private async handleVersionConflict(
    sessionId: string,
    remoteUpdates: Partial<SessionData>,
    remoteVersion: number
  ): Promise<void> {
    const localSession = await this.sessionCache.getSession(sessionId);
    if (!localSession) {
      return;
    }

    const conflict: SessionConflict = {
      sessionId,
      localVersion: localSession,
      remoteVersion: { ...localSession, ...remoteUpdates },
      conflictType: 'version-mismatch',
      timestamp: new Date(),
    };

    this.pendingConflicts.set(sessionId, conflict);
    this.stats.sessionConflicts++;

    // Auto-resolve based on strategy
    if (this.config.conflictResolutionStrategy === 'last-write-wins') {
      await this.resolveSessionConflict(sessionId, 'remote');
    } else if (this.config.conflictResolutionStrategy === 'merge') {
      await this.resolveSessionConflict(sessionId, 'merge');
    }

    this.emit('sessionConflict', conflict);
  }

  private mergeSessionData(local: SessionData, remote: SessionData): SessionData {
    // Simple merge strategy - use latest timestamp for each field
    return {
      ...local,
      ...remote,
      lastActivity:
        local.lastActivity > remote.lastActivity ? local.lastActivity : remote.lastActivity,
      sessionMetadata: {
        ...local.sessionMetadata,
        ...remote.sessionMetadata,
      },
    };
  }

  private shouldReplicateSession(sessionId: string): boolean {
    // Simple hash-based replication decision
    const hash = this.hashString(sessionId);
    const nodeIndex = hash % this.config.sessionReplicationFactor;

    // In a real implementation, this would consider actual node topology
    return nodeIndex === 0; // Simplified for demo
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // Session metadata operations
  private async storeSessionMetadata(sessionId: string, metadata: any): Promise<void> {
    const key = `session_metadata:${sessionId}`;
    await this.redis.set(key, metadata, 86400); // 24 hours TTL
  }

  private async getSessionMetadata(sessionId: string): Promise<any> {
    const key = `session_metadata:${sessionId}`;
    return await this.redis.get(key);
  }

  private async updateSessionMetadata(sessionId: string, updates: any): Promise<void> {
    const existing = await this.getSessionMetadata(sessionId);
    if (existing) {
      await this.storeSessionMetadata(sessionId, { ...existing, ...updates });
    }
  }

  private async deleteSessionMetadata(sessionId: string): Promise<void> {
    const key = `session_metadata:${sessionId}`;
    await this.redis.del(key);
  }

  private async loadSessionMetadata(): Promise<void> {
    const keys = await this.redis.keys('session_metadata:*');

    for (const key of keys) {
      const sessionId = key.replace('session_metadata:', '');
      const metadata = await this.redis.get(key);

      if (metadata && metadata.nodeId === this.nodeId) {
        this.sessionVersions.set(sessionId, metadata.version);
      }
    }
  }

  // Placeholder methods for cross-node communication
  private async replicateSession(
    sessionId: string,
    sessionData: SessionData,
    version: number
  ): Promise<void> {
    // In a real implementation, this would replicate to other nodes
    console.log(`🔄 Replicating session ${sessionId} version ${version}`);
  }

  private async replicateSessionUpdate(
    sessionId: string,
    updates: Partial<SessionData>,
    version: number
  ): Promise<void> {
    // In a real implementation, this would update replicas
    console.log(`🔄 Replicating session update ${sessionId} version ${version}`);
  }

  private async deleteFromReplicas(sessionId: string): Promise<void> {
    // In a real implementation, this would delete from replica nodes
    console.log(`🗑️ Deleting session ${sessionId} from replicas`);
  }

  private async getSessionFromNode(sessionId: string, nodeId: string): Promise<SessionData | null> {
    // In a real implementation, this would make HTTP request to other node
    console.log(`🔍 Getting session ${sessionId} from node ${nodeId}`);
    return null;
  }

  private async syncSessionFromRemote(sessionId: string, metadata: any): Promise<void> {
    // In a real implementation, this would sync from remote node
    console.log(`🔄 Syncing session ${sessionId} from remote node ${metadata.nodeId}`);
  }

  private async checkSessionConflicts(sessionId: string, currentVersion: number): Promise<void> {
    const metadata = await this.getSessionMetadata(sessionId);
    if (metadata && metadata.version > currentVersion) {
      throw new Error(`Session conflict detected for ${sessionId}`);
    }
  }

  private async broadcastSessionEvent(event: SessionEvent): Promise<void> {
    await this.redis.publish(this.config.broadcastChannel, JSON.stringify(event));
  }
}
