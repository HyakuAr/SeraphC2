/**
 * Tests for implant API routes
 */

import request from 'supertest';
import express from 'express';
import { createImplantRoutes } from '../implant.routes';
import { ImplantManager } from '../../../core/engine/implant-manager';
import { AuthMiddleware } from '../../../core/auth/auth.middleware';
import { Implant, ImplantStatus, PrivilegeLevel, Protocol } from '../../../types/entities';

// Mock dependencies
jest.mock('../../../core/engine/implant-manager');
jest.mock('../../../core/auth/auth.middleware');
jest.mock('../../../utils/logger');

describe('Implant Routes', () => {
  let app: express.Application;
  let mockImplantManager: jest.Mocked<ImplantManager>;
  let mockAuthMiddleware: jest.Mocked<AuthMiddleware>;
  let mockLogger: any;

  const mockImplant: Implant = {
    id: 'test-implant-1',
    hostname: 'TEST-PC',
    username: 'testuser',
    operatingSystem: 'Windows 10',
    architecture: 'x64',
    privileges: PrivilegeLevel.USER,
    lastSeen: new Date('2023-01-01T12:00:00Z'),
    status: ImplantStatus.ACTIVE,
    communicationProtocol: Protocol.HTTPS,
    encryptionKey: 'test-key',
    configuration: {
      callbackInterval: 30000,
      jitter: 10,
      maxRetries: 3,
    },
    systemInfo: {
      hostname: 'TEST-PC',
      operatingSystem: 'Windows 10',
      architecture: 'x64',
      processorInfo: 'Intel Core i7',
      memoryTotal: 16777216000,
      diskSpace: 1000000000000,
      networkInterfaces: ['192.168.1.100'],
      installedSoftware: ['Chrome'],
      runningProcesses: 150,
    },
    createdAt: new Date('2023-01-01T10:00:00Z'),
    updatedAt: new Date('2023-01-01T12:00:00Z'),
  };

  const mockSession = {
    implantId: 'test-implant-1',
    lastHeartbeat: new Date('2023-01-01T12:05:00Z'),
    connectionInfo: {
      protocol: Protocol.HTTPS,
      remoteAddress: '192.168.1.100',
      userAgent: 'SeraphC2-Implant/1.0',
    },
    isActive: true,
  };

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    };

    // Mock Logger.getInstance()
    const LoggerModule = require('../../../utils/logger');
    LoggerModule.Logger.getInstance = jest.fn().mockReturnValue(mockLogger);

    // Create mocked instances
    mockImplantManager = {
      getAllImplants: jest.fn(),
      getImplantStats: jest.fn(),
      getImplant: jest.fn(),
      disconnectImplant: jest.fn(),
      getActiveSessions: jest.fn(),
      getImplantSession: jest.fn(),
    } as any;

    mockAuthMiddleware = {
      authenticate: jest.fn((_req, _res, next) => next()),
    } as any;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(
      '/api/implants',
      createImplantRoutes({
        implantManager: mockImplantManager,
        authMiddleware: mockAuthMiddleware,
      })
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/implants', () => {
    it('should return all implants with session data', async () => {
      const implants = [mockImplant];
      const sessions = [mockSession];

      mockImplantManager.getAllImplants.mockResolvedValue(implants);
      mockImplantManager.getActiveSessions.mockReturnValue(sessions);

      const response = await request(app).get('/api/implants').expect(200);

      expect(response.body).toEqual({
        success: true,
        data: [
          {
            ...mockImplant,
            createdAt: mockImplant.createdAt.toISOString(),
            updatedAt: mockImplant.updatedAt.toISOString(),
            lastSeen: mockImplant.lastSeen.toISOString(),
            isConnected: true,
            lastHeartbeat: mockSession.lastHeartbeat,
            connectionInfo: mockSession.connectionInfo,
          },
        ],
        count: 1,
      });

      expect(mockImplantManager.getAllImplants).toHaveBeenCalled();
      expect(mockImplantManager.getActiveSessions).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockImplantManager.getAllImplants.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/implants').expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to fetch implants',
      });
    });

    it('should apply authentication middleware', async () => {
      mockImplantManager.getAllImplants.mockResolvedValue([]);
      mockImplantManager.getActiveSessions.mockReturnValue([]);

      await request(app).get('/api/implants').expect(200);

      expect(mockAuthMiddleware.authenticate).toHaveBeenCalled();
    });
  });

  describe('GET /api/implants/stats', () => {
    it('should return implant statistics', async () => {
      const stats = {
        total: 5,
        active: 3,
        inactive: 1,
        disconnected: 1,
      };
      const sessions = [mockSession];

      mockImplantManager.getImplantStats.mockResolvedValue(stats);
      mockImplantManager.getActiveSessions.mockReturnValue(sessions);

      const response = await request(app).get('/api/implants/stats').expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          ...stats,
          connected: 1,
        },
      });
    });

    it('should handle stats fetch errors', async () => {
      mockImplantManager.getImplantStats.mockRejectedValue(new Error('Stats error'));

      const response = await request(app).get('/api/implants/stats').expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to fetch implant statistics',
      });
    });
  });

  describe('GET /api/implants/:id', () => {
    it('should return specific implant details', async () => {
      mockImplantManager.getImplant.mockResolvedValue(mockImplant);
      mockImplantManager.getImplantSession.mockReturnValue(mockSession);

      const response = await request(app).get('/api/implants/test-implant-1').expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          ...mockImplant,
          isConnected: true,
          lastHeartbeat: mockSession.lastHeartbeat,
          connectionInfo: mockSession.connectionInfo,
        },
      });

      expect(mockImplantManager.getImplant).toHaveBeenCalledWith('test-implant-1');
      expect(mockImplantManager.getImplantSession).toHaveBeenCalledWith('test-implant-1');
    });

    it('should return 404 for non-existent implant', async () => {
      mockImplantManager.getImplant.mockResolvedValue(null);

      const response = await request(app).get('/api/implants/non-existent').expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Implant not found',
      });
    });

    it('should handle implant fetch errors', async () => {
      mockImplantManager.getImplant.mockRejectedValue(new Error('Fetch error'));

      const response = await request(app).get('/api/implants/test-implant-1').expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to fetch implant details',
      });
    });
  });

  describe('POST /api/implants/:id/disconnect', () => {
    it('should disconnect implant successfully', async () => {
      mockImplantManager.disconnectImplant.mockResolvedValue();

      const response = await request(app)
        .post('/api/implants/test-implant-1/disconnect')
        .send({ reason: 'Test disconnect' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Implant disconnected successfully',
      });

      expect(mockImplantManager.disconnectImplant).toHaveBeenCalledWith(
        'test-implant-1',
        'Test disconnect'
      );
    });

    it('should use default reason when none provided', async () => {
      mockImplantManager.disconnectImplant.mockResolvedValue();

      await request(app).post('/api/implants/test-implant-1/disconnect').send({}).expect(200);

      expect(mockImplantManager.disconnectImplant).toHaveBeenCalledWith(
        'test-implant-1',
        'Manual disconnect by operator'
      );
    });

    it('should handle disconnect errors', async () => {
      mockImplantManager.disconnectImplant.mockRejectedValue(new Error('Disconnect error'));

      const response = await request(app)
        .post('/api/implants/test-implant-1/disconnect')
        .send({ reason: 'Test disconnect' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to disconnect implant',
      });
    });
  });

  describe('session enhancement', () => {
    it('should enhance implants without active sessions', async () => {
      const implants = [mockImplant];
      const sessions: any[] = []; // No active sessions

      mockImplantManager.getAllImplants.mockResolvedValue(implants);
      mockImplantManager.getActiveSessions.mockReturnValue(sessions);

      const response = await request(app).get('/api/implants').expect(200);

      expect(response.body.data[0]).toEqual({
        ...mockImplant,
        isConnected: false,
        lastHeartbeat: undefined,
        connectionInfo: undefined,
      });
    });

    it('should handle implants with inactive sessions', async () => {
      const inactiveSession = { ...mockSession, isActive: false };

      mockImplantManager.getImplantSession.mockReturnValue(inactiveSession);
      mockImplantManager.getImplant.mockResolvedValue(mockImplant);

      const response = await request(app).get('/api/implants/test-implant-1').expect(200);

      expect(response.body.data.isConnected).toBe(false);
    });
  });
});
