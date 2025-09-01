/**
 * Tests for CollaborationService
 * Implements requirements 16.2, 16.3, 16.6, 16.7
 */

import { CollaborationService } from '../collaboration.service';
import { OperatorRole } from '../../../types/entities';
import { OperatorSession } from '../../../types/collaboration';

describe('CollaborationService', () => {
  let collaborationService: CollaborationService;
  const mockConfig = {
    presenceUpdateInterval: 1000,
    messageRetentionDays: 7,
    activityLogRetentionDays: 30,
    sessionTimeoutMinutes: 30,
    lockTimeoutMinutes: 5,
    conflictResolutionTimeoutMinutes: 2,
  };

  beforeEach(() => {
    collaborationService = new CollaborationService(mockConfig);
  });

  afterEach(() => {
    collaborationService.stop();
  });

  describe('Operator Session Management', () => {
    const mockSession: OperatorSession = {
      operatorId: 'op1',
      username: 'testuser',
      role: OperatorRole.OPERATOR,
      socketId: 'socket1',
      connectedAt: new Date(),
      lastActivity: new Date(),
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
    };

    test('should register operator session', () => {
      const eventSpy = jest.fn();
      collaborationService.on('collaborationEvent', eventSpy);

      collaborationService.registerOperatorSession(mockSession);

      const presence = collaborationService.getOperatorPresence('op1');
      expect(presence).toBeDefined();
      expect(presence?.operatorId).toBe('op1');
      expect(presence?.username).toBe('testuser');
      expect(presence?.status).toBe('online');
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'presence_update',
          operatorId: 'op1',
        })
      );
    });

    test('should unregister operator session', () => {
      const eventSpy = jest.fn();
      collaborationService.on('collaborationEvent', eventSpy);

      collaborationService.registerOperatorSession(mockSession);
      collaborationService.unregisterOperatorSession('op1');

      const presence = collaborationService.getOperatorPresence('op1');
      expect(presence?.status).toBe('offline');
      expect(presence?.currentImplant).toBeUndefined();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'presence_update',
          operatorId: 'op1',
        })
      );
    });

    test('should update operator presence', () => {
      const eventSpy = jest.fn();
      collaborationService.on('collaborationEvent', eventSpy);

      collaborationService.registerOperatorSession(mockSession);
      collaborationService.updateOperatorPresence('op1', {
        status: 'busy',
        currentImplant: 'implant1',
        currentAction: 'executing_command',
      });

      const presence = collaborationService.getOperatorPresence('op1');
      expect(presence?.status).toBe('busy');
      expect(presence?.currentImplant).toBe('implant1');
      expect(presence?.currentAction).toBe('executing_command');
    });

    test('should get all operator presence', () => {
      const session2: OperatorSession = {
        ...mockSession,
        operatorId: 'op2',
        username: 'testuser2',
        socketId: 'socket2',
      };

      collaborationService.registerOperatorSession(mockSession);
      collaborationService.registerOperatorSession(session2);

      const allPresence = collaborationService.getAllOperatorPresence();
      expect(allPresence).toHaveLength(2);
      expect(allPresence.find(p => p.operatorId === 'op1')).toBeDefined();
      expect(allPresence.find(p => p.operatorId === 'op2')).toBeDefined();
    });
  });

  describe('Operator Messaging', () => {
    beforeEach(() => {
      const mockSession: OperatorSession = {
        operatorId: 'op1',
        username: 'testuser',
        role: OperatorRole.OPERATOR,
        socketId: 'socket1',
        connectedAt: new Date(),
        lastActivity: new Date(),
      };
      collaborationService.registerOperatorSession(mockSession);
    });

    test('should send direct message', () => {
      const eventSpy = jest.fn();
      collaborationService.on('collaborationEvent', eventSpy);

      const message = collaborationService.sendMessage({
        fromOperatorId: 'op1',
        toOperatorId: 'op2',
        message: 'Hello there',
        type: 'direct',
        priority: 'normal',
      });

      expect(message.id).toBeDefined();
      expect(message.fromOperatorId).toBe('op1');
      expect(message.toOperatorId).toBe('op2');
      expect(message.message).toBe('Hello there');
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message',
          data: message,
        })
      );
    });

    test('should send broadcast message', () => {
      const eventSpy = jest.fn();
      collaborationService.on('collaborationEvent', eventSpy);

      const message = collaborationService.sendMessage({
        fromOperatorId: 'op1',
        message: 'System maintenance in 5 minutes',
        type: 'broadcast',
        priority: 'high',
      });

      expect(message.toOperatorId).toBeUndefined();
      expect(message.type).toBe('broadcast');
      expect(message.priority).toBe('high');
    });

    test('should get messages for operator', () => {
      // Send some messages
      collaborationService.sendMessage({
        fromOperatorId: 'op1',
        toOperatorId: 'op2',
        message: 'Direct message',
        type: 'direct',
        priority: 'normal',
      });

      collaborationService.sendMessage({
        fromOperatorId: 'op2',
        toOperatorId: 'op1',
        message: 'Reply message',
        type: 'direct',
        priority: 'normal',
      });

      collaborationService.sendMessage({
        fromOperatorId: 'op1',
        message: 'Broadcast message',
        type: 'broadcast',
        priority: 'normal',
      });

      const messages = collaborationService.getMessagesForOperator('op1', 10);
      expect(messages).toHaveLength(3); // 2 direct + 1 broadcast
    });
  });

  describe('Session Conflict Management', () => {
    beforeEach(() => {
      const session1: OperatorSession = {
        operatorId: 'op1',
        username: 'user1',
        role: OperatorRole.OPERATOR,
        socketId: 'socket1',
        connectedAt: new Date(),
        lastActivity: new Date(),
        currentImplant: 'implant1',
      };

      const session2: OperatorSession = {
        operatorId: 'op2',
        username: 'user2',
        role: OperatorRole.OPERATOR,
        socketId: 'socket2',
        connectedAt: new Date(),
        lastActivity: new Date(),
      };

      collaborationService.registerOperatorSession(session1);
      collaborationService.registerOperatorSession(session2);
    });

    test('should detect session conflict', () => {
      const eventSpy = jest.fn();
      collaborationService.on('collaborationEvent', eventSpy);

      const conflict = collaborationService.checkSessionConflict(
        'op2',
        'implant1',
        'execute_command'
      );

      expect(conflict).toBeDefined();
      expect(conflict?.implantId).toBe('implant1');
      expect(conflict?.primaryOperatorId).toBe('op1');
      expect(conflict?.conflictingOperatorId).toBe('op2');
      expect(conflict?.conflictType).toBe('command_execution');
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'conflict',
          data: conflict,
        })
      );
    });

    test('should not detect conflict when no other operator is active', () => {
      const conflict = collaborationService.checkSessionConflict(
        'op2',
        'implant2',
        'execute_command'
      );
      expect(conflict).toBeNull();
    });

    test('should resolve session conflict', () => {
      const conflict = collaborationService.checkSessionConflict(
        'op2',
        'implant1',
        'execute_command'
      );
      expect(conflict).toBeDefined();

      const resolved = collaborationService.resolveSessionConflict(conflict!.id, 'queue', 'op2');

      expect(resolved).toBe(true);
    });

    test('should not resolve non-existent conflict', () => {
      const resolved = collaborationService.resolveSessionConflict(
        'non-existent-id',
        'queue',
        'op1'
      );

      expect(resolved).toBe(false);
    });
  });

  describe('Session Takeover', () => {
    beforeEach(() => {
      const adminSession: OperatorSession = {
        operatorId: 'admin1',
        username: 'admin',
        role: OperatorRole.ADMINISTRATOR,
        socketId: 'socket1',
        connectedAt: new Date(),
        lastActivity: new Date(),
      };

      const userSession: OperatorSession = {
        operatorId: 'op1',
        username: 'user1',
        role: OperatorRole.OPERATOR,
        socketId: 'socket2',
        connectedAt: new Date(),
        lastActivity: new Date(),
        currentImplant: 'implant1',
      };

      collaborationService.registerOperatorSession(adminSession);
      collaborationService.registerOperatorSession(userSession);
    });

    test('should initiate session takeover by admin', () => {
      const eventSpy = jest.fn();
      collaborationService.on('collaborationEvent', eventSpy);

      const takeover = collaborationService.initiateSessionTakeover(
        'admin1',
        'op1',
        'Emergency security response',
        'implant1'
      );

      expect(takeover).toBeDefined();
      expect(takeover?.adminOperatorId).toBe('admin1');
      expect(takeover?.targetOperatorId).toBe('op1');
      expect(takeover?.reason).toBe('Emergency security response');
      expect(takeover?.status).toBe('pending');
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'takeover',
          data: takeover,
        })
      );
    });

    test('should not allow non-admin to initiate takeover', () => {
      const takeover = collaborationService.initiateSessionTakeover(
        'op1',
        'admin1',
        'Trying to take over admin',
        'implant1'
      );

      expect(takeover).toBeNull();
    });

    test('should complete session takeover', () => {
      const takeover = collaborationService.initiateSessionTakeover(
        'admin1',
        'op1',
        'Emergency response',
        'implant1'
      );

      expect(takeover).toBeDefined();

      const completed = collaborationService.completeSessionTakeover(takeover!.id);
      expect(completed).toBe(true);

      // Check that target operator's presence is updated
      const presence = collaborationService.getOperatorPresence('op1');
      expect(presence?.currentImplant).toBeUndefined();
    });
  });

  describe('Activity Logging', () => {
    test('should log activity', () => {
      const eventSpy = jest.fn();
      collaborationService.on('collaborationEvent', eventSpy);

      collaborationService.logActivity({
        operatorId: 'op1',
        username: 'testuser',
        action: 'command_executed',
        resource: 'implant',
        resourceId: 'implant1',
        timestamp: new Date(),
        success: true,
      });

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'activity',
          operatorId: 'op1',
        })
      );
    });

    test('should get activity logs with filters', () => {
      // Log some activities
      collaborationService.logActivity({
        operatorId: 'op1',
        username: 'user1',
        action: 'command_executed',
        resource: 'implant',
        resourceId: 'implant1',
        timestamp: new Date(),
        success: true,
      });

      collaborationService.logActivity({
        operatorId: 'op2',
        username: 'user2',
        action: 'file_uploaded',
        resource: 'file',
        resourceId: 'file1',
        timestamp: new Date(),
        success: false,
        error: 'Permission denied',
      });

      // Get all logs
      const allLogs = collaborationService.getActivityLogs();
      expect(allLogs).toHaveLength(2);

      // Filter by operator
      const op1Logs = collaborationService.getActivityLogs({ operatorId: 'op1' });
      expect(op1Logs).toHaveLength(1);
      expect(op1Logs[0]?.operatorId).toBe('op1');

      // Filter by action
      const commandLogs = collaborationService.getActivityLogs({ action: 'command' });
      expect(commandLogs).toHaveLength(1);
      expect(commandLogs[0]?.action).toBe('command_executed');

      // Filter by resource
      const implantLogs = collaborationService.getActivityLogs({ resource: 'implant' });
      expect(implantLogs).toHaveLength(1);
      expect(implantLogs[0]?.resource).toBe('implant');
    });
  });

  describe('Implant Locking', () => {
    test('should acquire exclusive implant lock', () => {
      const acquired = collaborationService.acquireImplantLock(
        'implant1',
        'op1',
        'user1',
        'execute_command',
        'exclusive'
      );

      expect(acquired).toBe(true);

      const lock = collaborationService.getImplantLock('implant1');
      expect(lock).toBeDefined();
      expect(lock?.operatorId).toBe('op1');
      expect(lock?.lockType).toBe('exclusive');
    });

    test('should not acquire lock when exclusive lock exists', () => {
      // First operator acquires exclusive lock
      collaborationService.acquireImplantLock(
        'implant1',
        'op1',
        'user1',
        'execute_command',
        'exclusive'
      );

      // Second operator tries to acquire lock
      const acquired = collaborationService.acquireImplantLock(
        'implant1',
        'op2',
        'user2',
        'file_upload',
        'exclusive'
      );

      expect(acquired).toBe(false);
    });

    test('should release implant lock', () => {
      collaborationService.acquireImplantLock('implant1', 'op1', 'user1', 'execute_command');

      const released = collaborationService.releaseImplantLock('implant1', 'op1');
      expect(released).toBe(true);

      const lock = collaborationService.getImplantLock('implant1');
      expect(lock).toBeUndefined();
    });

    test('should not release lock owned by different operator', () => {
      collaborationService.acquireImplantLock('implant1', 'op1', 'user1', 'execute_command');

      const released = collaborationService.releaseImplantLock('implant1', 'op2');
      expect(released).toBe(false);

      const lock = collaborationService.getImplantLock('implant1');
      expect(lock).toBeDefined();
    });

    test('should handle expired locks', () => {
      // Mock expired lock by setting past expiration time
      collaborationService.acquireImplantLock('implant1', 'op1', 'user1', 'execute_command');

      // Manually expire the lock by accessing private property (for testing)
      const service = collaborationService as any;
      const lock = service.implantLocks.get('implant1');
      if (lock) {
        lock.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      }

      // Try to get expired lock
      const retrievedLock = collaborationService.getImplantLock('implant1');
      expect(retrievedLock).toBeUndefined();
    });
  });

  describe('Conflict Type Detection', () => {
    test('should detect command execution conflict', () => {
      const session: OperatorSession = {
        operatorId: 'op1',
        username: 'user1',
        role: OperatorRole.OPERATOR,
        socketId: 'socket1',
        connectedAt: new Date(),
        lastActivity: new Date(),
        currentImplant: 'implant1',
      };

      collaborationService.registerOperatorSession(session);

      const conflict = collaborationService.checkSessionConflict(
        'op2',
        'implant1',
        'execute_command'
      );
      expect(conflict?.conflictType).toBe('command_execution');
    });

    test('should detect file operation conflict', () => {
      const session: OperatorSession = {
        operatorId: 'op1',
        username: 'user1',
        role: OperatorRole.OPERATOR,
        socketId: 'socket1',
        connectedAt: new Date(),
        lastActivity: new Date(),
        currentImplant: 'implant1',
      };

      collaborationService.registerOperatorSession(session);

      const conflict = collaborationService.checkSessionConflict('op2', 'implant1', 'file_upload');
      expect(conflict?.conflictType).toBe('file_operation');
    });

    test('should detect screen control conflict', () => {
      const session: OperatorSession = {
        operatorId: 'op1',
        username: 'user1',
        role: OperatorRole.OPERATOR,
        socketId: 'socket1',
        connectedAt: new Date(),
        lastActivity: new Date(),
        currentImplant: 'implant1',
      };

      collaborationService.registerOperatorSession(session);

      const conflict = collaborationService.checkSessionConflict(
        'op2',
        'implant1',
        'screen_control'
      );
      expect(conflict?.conflictType).toBe('screen_control');
    });

    test('should detect concurrent access conflict for unknown actions', () => {
      const session: OperatorSession = {
        operatorId: 'op1',
        username: 'user1',
        role: OperatorRole.OPERATOR,
        socketId: 'socket1',
        connectedAt: new Date(),
        lastActivity: new Date(),
        currentImplant: 'implant1',
      };

      collaborationService.registerOperatorSession(session);

      const conflict = collaborationService.checkSessionConflict(
        'op2',
        'implant1',
        'unknown_action'
      );
      expect(conflict?.conflictType).toBe('concurrent_access');
    });
  });
});
