/**
 * Tests for MFA routes
 */

import request from 'supertest';
import express from 'express';
import { MfaService } from '../../../core/auth/mfa.service';
import { AuthMiddleware } from '../../../core/auth/auth.middleware';
import { createMfaRoutes } from '../mfa.routes';
import { OperatorRole } from '../../../types/entities';

// Mock dependencies
const mockMfaService: jest.Mocked<MfaService> = {
  setupMfa: jest.fn(),
  verifyMfaToken: jest.fn(),
  verifyBackupCode: jest.fn(),
  isMfaRequired: jest.fn(),
  isMfaConfigured: jest.fn(),
  disableMfa: jest.fn(),
  regenerateBackupCodes: jest.fn(),
  updateEnforcementPolicy: jest.fn(),
  getEnforcementPolicy: jest.fn(),
} as any;

const mockAuthMiddleware: jest.Mocked<AuthMiddleware> = {
  authenticate: jest.fn(),
  requireAdmin: jest.fn(),
  rateLimitAuth: jest.fn(),
  validateRefreshToken: jest.fn(),
} as any;

describe('MFA Routes', () => {
  let app: express.Application;
  let mockOperator: any;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());

    mockOperator = {
      id: 'operator-1',
      username: 'testuser',
      email: 'test@example.com',
      role: OperatorRole.ADMINISTRATOR,
    };

    // Mock middleware to add operator to request
    mockAuthMiddleware.authenticate.mockImplementation(
      () => async (req: any, _res: any, next: any) => {
        req.operator = mockOperator;
        next();
      }
    );

    mockAuthMiddleware.requireAdmin.mockImplementation(
      () => async (req: any, res: any, next: any) => {
        req.operator = mockOperator; // Ensure operator is set
        if (req.operator?.role !== OperatorRole.ADMINISTRATOR) {
          return res.status(403).json({ success: false, error: 'Insufficient permissions' });
        }
        next();
      }
    );

    app.use('/api/mfa', createMfaRoutes(mockMfaService, mockAuthMiddleware));
  });

  describe('POST /api/mfa/setup', () => {
    it('should setup MFA successfully', async () => {
      const setupResponse = {
        success: true,
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
        backupCodes: ['ABCD1234', 'EFGH5678'],
      };

      mockMfaService.setupMfa.mockResolvedValue(setupResponse);

      const response = await request(app).post('/api/mfa/setup').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.secret).toBe(setupResponse.secret);
      expect(response.body.data.qrCodeUrl).toBe(setupResponse.qrCodeUrl);
      expect(response.body.data.backupCodes).toEqual(setupResponse.backupCodes);
      expect(mockMfaService.setupMfa).toHaveBeenCalledWith('operator-1');
    });

    it('should handle setup failure', async () => {
      mockMfaService.setupMfa.mockResolvedValue({
        success: false,
        error: 'MFA already configured',
      });

      const response = await request(app).post('/api/mfa/setup').expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('MFA already configured');
    });

    it('should require authentication', async () => {
      // Create a new app instance with failing auth middleware
      const testApp = express();
      testApp.use(express.json());

      const failingAuthMiddleware = {
        ...mockAuthMiddleware,
        authenticate: jest.fn(() => async (_req: any, res: any, _next: any) => {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }),
      };

      testApp.use('/api/mfa', createMfaRoutes(mockMfaService, failingAuthMiddleware as any));

      const response = await request(testApp).post('/api/mfa/setup');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/mfa/verify', () => {
    it('should verify MFA token successfully', async () => {
      mockMfaService.verifyMfaToken.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .post('/api/mfa/verify')
        .send({ token: '123456' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockMfaService.verifyMfaToken).toHaveBeenCalledWith({
        operatorId: 'operator-1',
        token: '123456',
      });
    });

    it('should handle invalid MFA token', async () => {
      mockMfaService.verifyMfaToken.mockResolvedValue({
        success: false,
        error: 'Invalid MFA token',
      });

      const response = await request(app)
        .post('/api/mfa/verify')
        .send({ token: '000000' })
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid MFA token');
    });

    it('should require token parameter', async () => {
      const response = await request(app).post('/api/mfa/verify').send({}).expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('MFA token is required');
    });
  });

  describe('POST /api/mfa/verify-backup-code', () => {
    it('should verify backup code successfully', async () => {
      mockMfaService.verifyBackupCode.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .post('/api/mfa/verify-backup-code')
        .send({ backupCode: 'ABCD1234' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockMfaService.verifyBackupCode).toHaveBeenCalledWith({
        operatorId: 'operator-1',
        backupCode: 'ABCD1234',
      });
    });

    it('should handle invalid backup code', async () => {
      mockMfaService.verifyBackupCode.mockResolvedValue({
        success: false,
        error: 'Invalid or already used backup code',
      });

      const response = await request(app)
        .post('/api/mfa/verify-backup-code')
        .send({ backupCode: 'INVALID1' })
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid or already used backup code');
    });

    it('should require backup code parameter', async () => {
      const response = await request(app).post('/api/mfa/verify-backup-code').send({}).expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Backup code is required');
    });
  });

  describe('GET /api/mfa/status', () => {
    it('should return MFA status', async () => {
      mockMfaService.isMfaConfigured.mockResolvedValue(true);
      mockMfaService.isMfaRequired.mockResolvedValue(true);
      mockMfaService.getEnforcementPolicy.mockReturnValue({
        enforceForRole: [OperatorRole.ADMINISTRATOR],
        gracePeriodDays: 7,
        allowBackupCodes: true,
      });

      const response = await request(app).get('/api/mfa/status').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.configured).toBe(true);
      expect(response.body.data.required).toBe(true);
      expect(response.body.data.enforcementPolicy).toBeDefined();
    });
  });

  describe('POST /api/mfa/regenerate-backup-codes', () => {
    it('should regenerate backup codes successfully', async () => {
      const newBackupCodes = ['NEW11111', 'NEW22222'];
      mockMfaService.regenerateBackupCodes.mockResolvedValue({
        success: true,
        backupCodes: newBackupCodes,
      });

      const response = await request(app).post('/api/mfa/regenerate-backup-codes').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.backupCodes).toEqual(newBackupCodes);
      expect(mockMfaService.regenerateBackupCodes).toHaveBeenCalledWith('operator-1');
    });

    it('should handle regeneration failure', async () => {
      mockMfaService.regenerateBackupCodes.mockResolvedValue({
        success: false,
        error: 'MFA not configured',
      });

      const response = await request(app).post('/api/mfa/regenerate-backup-codes').expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('MFA not configured');
    });
  });

  describe('DELETE /api/mfa/disable', () => {
    it('should disable MFA for current operator', async () => {
      mockMfaService.disableMfa.mockResolvedValue({
        success: true,
      });

      const response = await request(app).delete('/api/mfa/disable').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('MFA disabled successfully');
      expect(mockMfaService.disableMfa).toHaveBeenCalledWith('operator-1');
    });

    it('should allow admin to disable MFA for other operators', async () => {
      mockMfaService.disableMfa.mockResolvedValue({
        success: true,
      });

      const response = await request(app).delete('/api/mfa/disable/operator-2').expect(200);

      expect(response.body.success).toBe(true);
      expect(mockMfaService.disableMfa).toHaveBeenCalledWith('operator-2');
    });

    it('should prevent non-admin from disabling MFA for other operators', async () => {
      mockOperator.role = OperatorRole.OPERATOR;

      const response = await request(app).delete('/api/mfa/disable/operator-2').expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Insufficient permissions');
    });
  });

  describe('PUT /api/mfa/enforcement-policy', () => {
    beforeEach(() => {
      // Reset to admin for policy tests
      mockOperator.role = OperatorRole.ADMINISTRATOR;
    });

    it('should update enforcement policy', async () => {
      const newPolicy = {
        enforceForRole: [OperatorRole.ADMINISTRATOR, OperatorRole.OPERATOR],
        gracePeriodDays: 14,
        allowBackupCodes: false,
      };

      mockMfaService.getEnforcementPolicy.mockReturnValue(newPolicy);

      const response = await request(app)
        .put('/api/mfa/enforcement-policy')
        .send(newPolicy)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.enforcementPolicy).toEqual(newPolicy);
      expect(mockMfaService.updateEnforcementPolicy).toHaveBeenCalledWith(newPolicy);
    });

    it('should validate enforcement policy input', async () => {
      const response = await request(app)
        .put('/api/mfa/enforcement-policy')
        .send({ enforceForRole: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('enforceForRole must be an array');
    });

    it('should require admin role', async () => {
      mockOperator.role = OperatorRole.OPERATOR;

      await request(app).put('/api/mfa/enforcement-policy').send({}).expect(403);
    });
  });

  describe('GET /api/mfa/enforcement-policy', () => {
    it('should return current enforcement policy', async () => {
      const policy = {
        enforceForRole: [OperatorRole.ADMINISTRATOR],
        gracePeriodDays: 7,
        allowBackupCodes: true,
      };

      mockMfaService.getEnforcementPolicy.mockReturnValue(policy);

      const response = await request(app).get('/api/mfa/enforcement-policy').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.enforcementPolicy).toEqual(policy);
    });

    it('should require admin role', async () => {
      mockOperator.role = OperatorRole.OPERATOR;

      await request(app).get('/api/mfa/enforcement-policy').expect(403);
    });
  });
});
