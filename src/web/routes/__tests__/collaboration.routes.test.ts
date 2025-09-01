/**
 * Tests for collaboration routes
 * Implements requirements 16.2, 16.3, 16.6, 16.7
 */

import request from 'supertest';
import express from 'express';
import { createCollaborationRoutes } from '../collaboration.routes';
import { CollaborationService } from '../../../core/services/collaboration.service';
import { AuthMiddleware } from '../../../core/auth/auth.middleware';
import { OperatorRole } from '../../../types/entities';

// Mock the collaboration service
const mockCollaborationService = {
  getAllOperatorPresence: jest.fn(),
  updateOperatorPresence: jest.fn(),
  sendMessage: jest.fn(),
  getMessagesForOperator: jest.fn(),
  checkSessionConflict: jest.fn(),
  acquireImplantLock: jest.fn(),
  resolveSessionConflict: jest.fn(),
  releaseImplantLock: jest.fn(),
  getImplantLock: jest.fn(),
  initiateSessionTakeover: jest.fn(),
  completeSessionTakeover: jest.fn(),
  getActivityLogs: jest.fn(),
  logActivity: jest.fn(),
} as unknown as CollaborationService;

// Mock the auth middleware
const mockAuthMiddleware = {
  authenticate: jest.fn(() => (req: any, _res: any, next: any) => {
    req.operator = {
      id: 'test-operator-id',
      username: 'testuser',
      role: OperatorRole.OPERATOR,
    };
    next();
  }),
  requireRole: jest.fn((role: OperatorRole) => (req: any, _res: any, next: any) => {
    if (req.operator?.role === role) {
      next();
    } else {
      _res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
  }),
} as unknown as AuthMiddleware;

describe('Collaboration Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    const routes = createCollaborationRoutes({
      collaborationService: mockCollaborationService,
      authMiddleware: mockAuthMiddleware,
    });

    app.use('/api/collaboration', routes);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('GET /presence', () => {
    test('should get operator presence information', async () => {
      const mockPresence = [
        {
          operatorId: 'op1',
          username: 'user1',
          role: 'operator',
          status: 'online',
          lastActivity: new Date().toISOString(),
        },
      ];

      (mockCollaborationService.getAllOperatorPresence as jest.Mock).mockReturnValue(mockPresence);

      const response = await request(app).get('/api/collaboration/presence').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.presence).toEqual(mockPresence);
      expect(mockCollaborationService.getAllOperatorPresence).toHaveBeenCalled();
    });
  });

  describe('PUT /presence', () => {
    test('should update operator presence', async () => {
      const updateData = {
        status: 'busy',
        currentImplant: 'implant1',
        currentAction: 'executing_command',
      };

      const response = await request(app)
        .put('/api/collaboration/presence')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockCollaborationService.updateOperatorPresence).toHaveBeenCalledWith(
        'test-operator-id',
        updateData
      );
      expect(mockCollaborationService.logActivity).toHaveBeenCalled();
    });
  });

  describe('POST /messages', () => {
    test('should send direct message', async () => {
      const messageData = {
        toOperatorId: 'op2',
        message: 'Hello there',
        type: 'direct',
        priority: 'normal',
      };

      const mockSentMessage = {
        id: 'msg1',
        fromOperatorId: 'test-operator-id',
        ...messageData,
        timestamp: new Date().toISOString(),
      };

      (mockCollaborationService.sendMessage as jest.Mock).mockReturnValue(mockSentMessage);

      const response = await request(app)
        .post('/api/collaboration/messages')
        .send(messageData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSentMessage);
      expect(mockCollaborationService.sendMessage).toHaveBeenCalledWith({
        fromOperatorId: 'test-operator-id',
        toOperatorId: 'op2',
        message: 'Hello there',
        type: 'direct',
        priority: 'normal',
        metadata: undefined,
      });
    });

    test('should send broadcast message', async () => {
      const messageData = {
        message: 'System maintenance in 5 minutes',
        type: 'broadcast',
        priority: 'high',
      };

      const mockSentMessage = {
        id: 'msg2',
        fromOperatorId: 'test-operator-id',
        ...messageData,
        timestamp: new Date().toISOString(),
      };

      (mockCollaborationService.sendMessage as jest.Mock).mockReturnValue(mockSentMessage);

      const response = await request(app)
        .post('/api/collaboration/messages')
        .send(messageData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockCollaborationService.sendMessage).toHaveBeenCalledWith({
        fromOperatorId: 'test-operator-id',
        toOperatorId: undefined,
        message: 'System maintenance in 5 minutes',
        type: 'broadcast',
        priority: 'high',
        metadata: undefined,
      });
    });

    test('should reject empty message', async () => {
      const response = await request(app)
        .post('/api/collaboration/messages')
        .send({ message: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Message content is required');
    });
  });

  describe('GET /messages', () => {
    test('should get messages for operator', async () => {
      const mockMessages = [
        {
          id: 'msg1',
          fromOperatorId: 'op2',
          toOperatorId: 'test-operator-id',
          message: 'Hello',
          timestamp: new Date().toISOString(),
          type: 'direct',
          priority: 'normal',
        },
      ];

      (mockCollaborationService.getMessagesForOperator as jest.Mock).mockReturnValue(mockMessages);

      const response = await request(app).get('/api/collaboration/messages?limit=25').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toEqual(mockMessages);
      expect(mockCollaborationService.getMessagesForOperator).toHaveBeenCalledWith(
        'test-operator-id',
        25
      );
    });
  });

  describe('POST /conflicts/check', () => {
    test('should check for session conflicts and grant access', async () => {
      const requestData = {
        implantId: 'implant1',
        action: 'execute_command',
      };

      (mockCollaborationService.checkSessionConflict as jest.Mock).mockReturnValue(null);
      (mockCollaborationService.acquireImplantLock as jest.Mock).mockReturnValue(true);

      const response = await request(app)
        .post('/api/collaboration/conflicts/check')
        .send(requestData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Access granted');
      expect(mockCollaborationService.checkSessionConflict).toHaveBeenCalledWith(
        'test-operator-id',
        'implant1',
        'execute_command'
      );
      expect(mockCollaborationService.acquireImplantLock).toHaveBeenCalledWith(
        'implant1',
        'test-operator-id',
        'testuser',
        'execute_command'
      );
    });

    test('should detect session conflict', async () => {
      const requestData = {
        implantId: 'implant1',
        action: 'execute_command',
      };

      const mockConflict = {
        id: 'conflict1',
        implantId: 'implant1',
        conflictType: 'command_execution',
        primaryOperatorId: 'op1',
        conflictingOperatorId: 'test-operator-id',
        timestamp: new Date().toISOString(),
        status: 'active',
      };

      (mockCollaborationService.checkSessionConflict as jest.Mock).mockReturnValue(mockConflict);

      const response = await request(app)
        .post('/api/collaboration/conflicts/check')
        .send(requestData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.conflict).toEqual(mockConflict);
      expect(response.body.error).toBe('Session conflict detected');
    });

    test('should reject request without required fields', async () => {
      const response = await request(app)
        .post('/api/collaboration/conflicts/check')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Implant ID and action are required');
    });
  });

  describe('POST /conflicts/:conflictId/resolve', () => {
    test('should resolve session conflict', async () => {
      (mockCollaborationService.resolveSessionConflict as jest.Mock).mockReturnValue(true);

      const response = await request(app)
        .post('/api/collaboration/conflicts/conflict1/resolve')
        .send({ resolution: 'queue' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Conflict resolved successfully');
      expect(mockCollaborationService.resolveSessionConflict).toHaveBeenCalledWith(
        'conflict1',
        'queue',
        'test-operator-id'
      );
    });

    test('should reject invalid resolution', async () => {
      const response = await request(app)
        .post('/api/collaboration/conflicts/conflict1/resolve')
        .send({ resolution: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Valid resolution is required (takeover, queue, abort, share)'
      );
    });

    test('should handle non-existent conflict', async () => {
      (mockCollaborationService.resolveSessionConflict as jest.Mock).mockReturnValue(false);

      const response = await request(app)
        .post('/api/collaboration/conflicts/nonexistent/resolve')
        .send({ resolution: 'abort' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Conflict not found or already resolved');
    });
  });

  describe('DELETE /locks/:implantId', () => {
    test('should release implant lock', async () => {
      (mockCollaborationService.releaseImplantLock as jest.Mock).mockReturnValue(true);

      const response = await request(app).delete('/api/collaboration/locks/implant1').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Lock released successfully');
      expect(mockCollaborationService.releaseImplantLock).toHaveBeenCalledWith(
        'implant1',
        'test-operator-id'
      );
    });

    test('should handle no lock to release', async () => {
      (mockCollaborationService.releaseImplantLock as jest.Mock).mockReturnValue(false);

      const response = await request(app).delete('/api/collaboration/locks/implant1').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('No lock found to release');
    });
  });

  describe('GET /locks/:implantId', () => {
    test('should get implant lock status', async () => {
      const mockLock = {
        implantId: 'implant1',
        operatorId: 'op1',
        username: 'user1',
        lockType: 'exclusive',
        action: 'execute_command',
        timestamp: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      };

      (mockCollaborationService.getImplantLock as jest.Mock).mockReturnValue(mockLock);

      const response = await request(app).get('/api/collaboration/locks/implant1').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.lock).toEqual(mockLock);
      expect(response.body.data.isLocked).toBe(true);
    });

    test('should handle no lock found', async () => {
      (mockCollaborationService.getImplantLock as jest.Mock).mockReturnValue(undefined);

      const response = await request(app).get('/api/collaboration/locks/implant1').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.lock).toBeUndefined();
      expect(response.body.data.isLocked).toBe(false);
    });
  });

  describe('Admin-only routes', () => {
    let adminApp: express.Application;

    beforeEach(() => {
      // Create new app with admin auth middleware
      adminApp = express();
      adminApp.use(express.json());

      const adminAuthMiddleware = {
        authenticate: jest.fn(() => (req: any, _res: any, next: any) => {
          req.operator = {
            id: 'admin-id',
            username: 'admin',
            role: OperatorRole.ADMINISTRATOR,
          };
          next();
        }),
      } as unknown as AuthMiddleware;

      const routes = createCollaborationRoutes({
        collaborationService: mockCollaborationService,
        authMiddleware: adminAuthMiddleware,
      });

      adminApp.use('/api/collaboration', routes);
    });

    describe('POST /takeover', () => {
      test('should initiate session takeover', async () => {
        const takeoverData = {
          targetOperatorId: 'op1',
          reason: 'Emergency response',
          implantId: 'implant1',
        };

        const mockTakeover = {
          id: 'takeover1',
          adminOperatorId: 'admin-id',
          ...takeoverData,
          timestamp: new Date().toISOString(),
          status: 'pending',
        };

        (mockCollaborationService.initiateSessionTakeover as jest.Mock).mockReturnValue(
          mockTakeover
        );

        const response = await request(adminApp)
          .post('/api/collaboration/takeover')
          .send(takeoverData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockTakeover);
        expect(mockCollaborationService.initiateSessionTakeover).toHaveBeenCalledWith(
          'admin-id',
          'op1',
          'Emergency response',
          'implant1'
        );
      });

      test('should reject takeover without required fields', async () => {
        const response = await request(adminApp)
          .post('/api/collaboration/takeover')
          .send({})
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Target operator ID and reason are required');
      });
    });

    describe('POST /takeover/:takeoverId/complete', () => {
      test('should complete session takeover', async () => {
        (mockCollaborationService.completeSessionTakeover as jest.Mock).mockReturnValue(true);

        const response = await request(adminApp)
          .post('/api/collaboration/takeover/takeover1/complete')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Session takeover completed');
        expect(mockCollaborationService.completeSessionTakeover).toHaveBeenCalledWith('takeover1');
      });

      test('should handle non-existent takeover', async () => {
        (mockCollaborationService.completeSessionTakeover as jest.Mock).mockReturnValue(false);

        const response = await request(adminApp)
          .post('/api/collaboration/takeover/nonexistent/complete')
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Takeover not found or already completed');
      });
    });

    describe('GET /activity', () => {
      test('should get activity logs with filters', async () => {
        const mockLogs = [
          {
            id: 'log1',
            operatorId: 'op1',
            username: 'user1',
            action: 'command_executed',
            resource: 'implant',
            timestamp: new Date().toISOString(),
            success: true,
          },
        ];

        (mockCollaborationService.getActivityLogs as jest.Mock).mockReturnValue(mockLogs);

        const response = await request(adminApp)
          .get('/api/collaboration/activity?operatorId=op1&limit=50')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.logs).toEqual(mockLogs);
        expect(mockCollaborationService.getActivityLogs).toHaveBeenCalledWith({
          operatorId: 'op1',
          limit: 50,
        });
      });
    });
  });

  describe('Non-admin access to admin routes', () => {
    beforeEach(() => {
      // Mock regular user
      (mockAuthMiddleware.authenticate as jest.Mock).mockReturnValue(
        (req: any, _res: any, next: any) => {
          req.operator = {
            id: 'user-id',
            username: 'user',
            role: OperatorRole.OPERATOR,
          };
          next();
        }
      );
    });

    test('should reject non-admin access to takeover endpoint', async () => {
      const response = await request(app)
        .post('/api/collaboration/takeover')
        .send({
          targetOperatorId: 'op1',
          reason: 'Test',
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Administrator role required');
    });

    test('should reject non-admin access to activity logs', async () => {
      const response = await request(app).get('/api/collaboration/activity').expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Administrator role required');
    });
  });
});
