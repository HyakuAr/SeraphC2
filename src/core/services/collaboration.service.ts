/**
 * Collaboration service for multi-operator features
 * Implements requirements 16.2, 16.3, 16.6, 16.7
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  OperatorPresence,
  OperatorMessage,
  SessionConflict,
  ActivityLog,
  SessionTakeover,
  CollaborationEvent,
  ImplantLock,
  OperatorSession,
} from '../../types/collaboration';
import { OperatorRole } from '../../types/entities';
import { Logger } from '../../utils/logger';

export interface CollaborationConfig {
  presenceUpdateInterval: number; // milliseconds
  messageRetentionDays: number;
  activityLogRetentionDays: number;
  sessionTimeoutMinutes: number;
  lockTimeoutMinutes: number;
  conflictResolutionTimeoutMinutes: number;
}

export class CollaborationService extends EventEmitter {
  private logger: Logger;
  private operatorSessions: Map<string, OperatorSession> = new Map();
  private operatorPresence: Map<string, OperatorPresence> = new Map();
  private messages: Map<string, OperatorMessage> = new Map();
  private conflicts: Map<string, SessionConflict> = new Map();
  private activityLogs: Map<string, ActivityLog> = new Map();
  private takeovers: Map<string, SessionTakeover> = new Map();
  private implantLocks: Map<string, ImplantLock> = new Map();
  private presenceTimer?: NodeJS.Timeout;

  constructor(private config: CollaborationConfig) {
    super();
    this.logger = Logger.getInstance();
    this.startPresenceUpdates();
    this.startCleanupTasks();
  }

  /**
   * Register operator session
   */
  registerOperatorSession(session: OperatorSession): void {
    this.operatorSessions.set(session.operatorId, session);

    // Update presence
    const presence: OperatorPresence = {
      operatorId: session.operatorId,
      username: session.username,
      role: session.role,
      status: 'online',
      lastActivity: new Date(),
      socketId: session.socketId,
    };

    this.operatorPresence.set(session.operatorId, presence);

    this.logger.info('Operator session registered', {
      operatorId: session.operatorId,
      username: session.username,
    });

    // Log activity
    this.logActivity({
      operatorId: session.operatorId,
      username: session.username,
      action: 'session_start',
      resource: 'system',
      timestamp: new Date(),
      ipAddress: session.ipAddress || undefined,
      userAgent: session.userAgent || undefined,
      sessionId: session.socketId,
      success: true,
    });

    // Emit presence update
    this.emitCollaborationEvent({
      type: 'presence_update',
      data: presence,
      timestamp: new Date(),
      operatorId: session.operatorId,
    });
  }

  /**
   * Unregister operator session
   */
  unregisterOperatorSession(operatorId: string): void {
    const session = this.operatorSessions.get(operatorId);
    if (!session) return;

    // Update presence to offline
    const presence = this.operatorPresence.get(operatorId);
    if (presence) {
      presence.status = 'offline';
      presence.lastActivity = new Date();
      (presence as any).currentImplant = undefined;
      (presence as any).currentAction = undefined;
      (presence as any).socketId = undefined;
    }

    // Release any locks held by this operator
    this.releaseOperatorLocks(operatorId);

    // Remove session
    this.operatorSessions.delete(operatorId);

    this.logger.info('Operator session unregistered', {
      operatorId,
      username: session.username,
    });

    // Log activity
    this.logActivity({
      operatorId,
      username: session.username,
      action: 'session_end',
      resource: 'system',
      timestamp: new Date(),
      sessionId: session.socketId,
      success: true,
    });

    // Emit presence update
    if (presence) {
      this.emitCollaborationEvent({
        type: 'presence_update',
        data: presence,
        timestamp: new Date(),
        operatorId,
      });
    }
  }

  /**
   * Update operator presence
   */
  updateOperatorPresence(
    operatorId: string,
    updates: Partial<Pick<OperatorPresence, 'status' | 'currentImplant' | 'currentAction'>>
  ): void {
    const presence = this.operatorPresence.get(operatorId);
    if (!presence) return;

    Object.assign(presence, updates, { lastActivity: new Date() });

    // Update session
    const session = this.operatorSessions.get(operatorId);
    if (session) {
      session.lastActivity = new Date();
      if (updates.currentImplant !== undefined) {
        session.currentImplant = updates.currentImplant;
      }
      if (updates.currentAction !== undefined) {
        session.currentAction = updates.currentAction;
      }
    }

    this.emitCollaborationEvent({
      type: 'presence_update',
      data: presence,
      timestamp: new Date(),
      operatorId,
    });
  }

  /**
   * Get all operator presence information
   */
  getAllOperatorPresence(): OperatorPresence[] {
    return Array.from(this.operatorPresence.values());
  }

  /**
   * Get operator presence by ID
   */
  getOperatorPresence(operatorId: string): OperatorPresence | undefined {
    return this.operatorPresence.get(operatorId);
  }

  /**
   * Send message between operators
   */
  sendMessage(message: Omit<OperatorMessage, 'id' | 'timestamp'>): OperatorMessage {
    const fullMessage: OperatorMessage = {
      ...message,
      id: uuidv4(),
      timestamp: new Date(),
    };

    this.messages.set(fullMessage.id, fullMessage);

    this.logger.info('Operator message sent', {
      messageId: fullMessage.id,
      fromOperatorId: fullMessage.fromOperatorId,
      toOperatorId: fullMessage.toOperatorId,
      type: fullMessage.type,
    });

    this.emitCollaborationEvent({
      type: 'message',
      data: fullMessage,
      timestamp: new Date(),
      operatorId: fullMessage.fromOperatorId,
    });

    return fullMessage;
  }

  /**
   * Get messages for an operator
   */
  getMessagesForOperator(operatorId: string, limit: number = 50): OperatorMessage[] {
    return Array.from(this.messages.values())
      .filter(
        msg =>
          msg.toOperatorId === operatorId ||
          msg.fromOperatorId === operatorId ||
          msg.type === 'broadcast'
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Check for session conflicts
   */
  checkSessionConflict(
    operatorId: string,
    implantId: string,
    action: string
  ): SessionConflict | null {
    // Check if another operator is already working on this implant
    const conflictingSession = Array.from(this.operatorSessions.values()).find(
      session => session.operatorId !== operatorId && session.currentImplant === implantId
    );

    if (!conflictingSession) return null;

    // Check for existing unresolved conflict
    const existingConflict = Array.from(this.conflicts.values()).find(
      conflict =>
        conflict.implantId === implantId &&
        conflict.status === 'active' &&
        (conflict.primaryOperatorId === operatorId || conflict.conflictingOperatorId === operatorId)
    );

    if (existingConflict) return existingConflict;

    // Create new conflict
    const conflict: SessionConflict = {
      id: uuidv4(),
      implantId,
      conflictType: this.determineConflictType(action),
      primaryOperatorId: conflictingSession.operatorId,
      conflictingOperatorId: operatorId,
      timestamp: new Date(),
      status: 'active',
    };

    this.conflicts.set(conflict.id, conflict);

    this.logger.warn('Session conflict detected', {
      conflictId: conflict.id,
      implantId,
      primaryOperator: conflictingSession.username,
      conflictingOperator: operatorId,
      action,
    });

    this.emitCollaborationEvent({
      type: 'conflict',
      data: conflict,
      timestamp: new Date(),
    });

    return conflict;
  }

  /**
   * Resolve session conflict
   */
  resolveSessionConflict(
    conflictId: string,
    resolution: 'takeover' | 'queue' | 'abort' | 'share',
    resolvedBy: string
  ): boolean {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict || conflict.status !== 'active') return false;

    conflict.status = 'resolved';
    conflict.resolution = resolution;
    conflict.resolvedBy = resolvedBy;
    conflict.resolvedAt = new Date();

    this.logger.info('Session conflict resolved', {
      conflictId,
      resolution,
      resolvedBy,
    });

    this.emitCollaborationEvent({
      type: 'conflict',
      data: conflict,
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * Initiate session takeover (admin only)
   */
  initiateSessionTakeover(
    adminOperatorId: string,
    targetOperatorId: string,
    reason: string,
    implantId?: string
  ): SessionTakeover | null {
    // Verify admin has permission (this should be checked by caller)
    const adminSession = this.operatorSessions.get(adminOperatorId);
    if (!adminSession || adminSession.role !== OperatorRole.ADMINISTRATOR) {
      return null;
    }

    const targetSession = this.operatorSessions.get(targetOperatorId);
    if (!targetSession) return null;

    const takeover: SessionTakeover = {
      id: uuidv4(),
      targetOperatorId,
      adminOperatorId,
      implantId,
      reason,
      timestamp: new Date(),
      status: 'pending',
      notificationSent: false,
      originalSessionData: {
        currentImplant: targetSession.currentImplant,
        currentAction: targetSession.currentAction,
      },
    };

    this.takeovers.set(takeover.id, takeover);

    this.logger.warn('Session takeover initiated', {
      takeoverId: takeover.id,
      adminOperatorId,
      targetOperatorId,
      implantId,
      reason,
    });

    // Log activity
    this.logActivity({
      operatorId: adminOperatorId,
      username: adminSession.username,
      action: 'session_takeover_initiated',
      resource: 'operator_session',
      resourceId: targetOperatorId,
      details: { reason, implantId },
      timestamp: new Date(),
      success: true,
    });

    this.emitCollaborationEvent({
      type: 'takeover',
      data: takeover,
      timestamp: new Date(),
      operatorId: adminOperatorId,
    });

    return takeover;
  }

  /**
   * Complete session takeover
   */
  completeSessionTakeover(takeoverId: string): boolean {
    const takeover = this.takeovers.get(takeoverId);
    if (!takeover || takeover.status !== 'pending') return false;

    takeover.status = 'active';

    // Force disconnect target operator if specified implant
    if (takeover.implantId) {
      this.updateOperatorPresence(takeover.targetOperatorId, {
        currentImplant: undefined as any,
        currentAction: undefined as any,
      });
    }

    this.logger.info('Session takeover completed', {
      takeoverId,
      adminOperatorId: takeover.adminOperatorId,
      targetOperatorId: takeover.targetOperatorId,
    });

    this.emitCollaborationEvent({
      type: 'takeover',
      data: takeover,
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * Log operator activity
   */
  logActivity(activity: Omit<ActivityLog, 'id'>): void {
    const log: ActivityLog = {
      ...activity,
      id: uuidv4(),
    };

    this.activityLogs.set(log.id, log);

    this.emitCollaborationEvent({
      type: 'activity',
      data: log,
      timestamp: new Date(),
      operatorId: activity.operatorId,
    });
  }

  /**
   * Get activity logs with filtering
   */
  getActivityLogs(filters?: {
    operatorId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): ActivityLog[] {
    let logs = Array.from(this.activityLogs.values());

    if (filters) {
      if (filters.operatorId) {
        logs = logs.filter(log => log.operatorId === filters.operatorId);
      }
      if (filters.action) {
        logs = logs.filter(log => log.action.includes(filters.action!));
      }
      if (filters.resource) {
        logs = logs.filter(log => log.resource === filters.resource);
      }
      if (filters.startDate) {
        logs = logs.filter(log => log.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        logs = logs.filter(log => log.timestamp <= filters.endDate!);
      }
    }

    return logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, filters?.limit || 100);
  }

  /**
   * Acquire implant lock
   */
  acquireImplantLock(
    implantId: string,
    operatorId: string,
    username: string,
    action: string,
    lockType: 'exclusive' | 'shared' = 'exclusive'
  ): boolean {
    const existingLock = this.implantLocks.get(implantId);

    if (existingLock) {
      // Check if lock is expired
      if (existingLock.expiresAt <= new Date()) {
        this.implantLocks.delete(implantId);
      } else if (existingLock.lockType === 'exclusive' || lockType === 'exclusive') {
        return false; // Cannot acquire lock
      }
    }

    const lock: ImplantLock = {
      implantId,
      operatorId,
      username,
      lockType,
      action,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + this.config.lockTimeoutMinutes * 60 * 1000),
    };

    this.implantLocks.set(implantId, lock);

    this.logger.debug('Implant lock acquired', {
      implantId,
      operatorId,
      action,
      lockType,
    });

    return true;
  }

  /**
   * Release implant lock
   */
  releaseImplantLock(implantId: string, operatorId: string): boolean {
    const lock = this.implantLocks.get(implantId);
    if (!lock || lock.operatorId !== operatorId) return false;

    this.implantLocks.delete(implantId);

    this.logger.debug('Implant lock released', {
      implantId,
      operatorId,
    });

    return true;
  }

  /**
   * Release all locks held by an operator
   */
  private releaseOperatorLocks(operatorId: string): void {
    for (const [implantId, lock] of this.implantLocks.entries()) {
      if (lock.operatorId === operatorId) {
        this.implantLocks.delete(implantId);
      }
    }
  }

  /**
   * Get implant lock status
   */
  getImplantLock(implantId: string): ImplantLock | undefined {
    const lock = this.implantLocks.get(implantId);
    if (lock && lock.expiresAt <= new Date()) {
      this.implantLocks.delete(implantId);
      return undefined;
    }
    return lock;
  }

  /**
   * Start presence update timer
   */
  private startPresenceUpdates(): void {
    this.presenceTimer = setInterval(() => {
      this.cleanupInactiveSessions();
    }, this.config.presenceUpdateInterval);
  }

  /**
   * Clean up inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const now = new Date();
    const timeoutMs = this.config.sessionTimeoutMinutes * 60 * 1000;

    for (const [operatorId, session] of this.operatorSessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > timeoutMs) {
        this.unregisterOperatorSession(operatorId);
      }
    }

    // Clean up expired locks
    for (const [implantId, lock] of this.implantLocks.entries()) {
      if (lock.expiresAt <= now) {
        this.implantLocks.delete(implantId);
      }
    }
  }

  /**
   * Start cleanup tasks
   */
  private startCleanupTasks(): void {
    // Clean up old messages and logs daily
    setInterval(
      () => {
        this.cleanupOldData();
      },
      24 * 60 * 60 * 1000
    ); // 24 hours
  }

  /**
   * Clean up old data
   */
  private cleanupOldData(): void {
    const now = new Date();
    const messageRetentionMs = this.config.messageRetentionDays * 24 * 60 * 60 * 1000;
    const activityRetentionMs = this.config.activityLogRetentionDays * 24 * 60 * 60 * 1000;

    // Clean up old messages
    for (const [id, message] of this.messages.entries()) {
      if (now.getTime() - message.timestamp.getTime() > messageRetentionMs) {
        this.messages.delete(id);
      }
    }

    // Clean up old activity logs
    for (const [id, log] of this.activityLogs.entries()) {
      if (now.getTime() - log.timestamp.getTime() > activityRetentionMs) {
        this.activityLogs.delete(id);
      }
    }

    this.logger.info('Cleaned up old collaboration data');
  }

  /**
   * Determine conflict type based on action
   */
  private determineConflictType(action: string): SessionConflict['conflictType'] {
    if (action.includes('command') || action.includes('execute')) {
      return 'command_execution';
    }
    if (action.includes('file') || action.includes('upload') || action.includes('download')) {
      return 'file_operation';
    }
    if (action.includes('screen') || action.includes('desktop') || action.includes('remote')) {
      return 'screen_control';
    }
    return 'concurrent_access';
  }

  /**
   * Emit collaboration event
   */
  private emitCollaborationEvent(event: CollaborationEvent): void {
    this.emit('collaborationEvent', event);
  }

  /**
   * Stop the collaboration service
   */
  stop(): void {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
    }
    this.removeAllListeners();
    this.operatorSessions.clear();
    this.operatorPresence.clear();
    this.messages.clear();
    this.conflicts.clear();
    this.activityLogs.clear();
    this.takeovers.clear();
    this.implantLocks.clear();
  }
}
