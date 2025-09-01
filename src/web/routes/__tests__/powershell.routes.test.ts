/**
 * Tests for PowerShell routes
 */

import request from 'supertest';
import express from 'express';
import { createPowerShellRoutes } from '../powershell.routes';
import { AuthMiddleware } from '../../../core/auth/auth.middleware';

// Mock dependencies
jest.mock('../../../core/repositories/powershell-script.repository');
jest.mock('../../../core/repositories/powershell-favorite.repository');
jest.mock('../../../core/repositories/powershell-session.repository');
jest.mock('../../../core/services/powershell.service');
jest.mock('../../../core/engine/command-manager');

const mockAuthMiddleware = {
  authenticate: jest.fn((req, _res, next) => {
    req.user = { id: 'operator-1', username: 'testuser' };
    next();
  }),
} as unknown as AuthMiddleware;

const mockCommandManager = {
  executeCommand: jest.fn(),
} as any;

const mockPowerShellService = {
  createScript: jest.fn(),
  getScript: jest.fn(),
  getScriptsByOperator: jest.fn(),
  getScriptsByTags: jest.fn(),
  updateScript: jest.fn(),
  deleteScript: jest.fn(),
  searchScripts: jest.fn(),
  createFavorite: jest.fn(),
  getFavoritesByOperator: jest.fn(),
  getFavoritesByCategory: jest.fn(),
  getMostUsedFavorites: jest.fn(),
  updateFavorite: jest.fn(),
  deleteFavorite: jest.fn(),
  useFavorite: jest.fn(),
  createSession: jest.fn(),
  getSession: jest.fn(),
  getSessionsByImplant: jest.fn(),
  getSessionsByOperator: jest.fn(),
  updateSession: jest.fn(),
  closeSession: jest.fn(),
  deleteSession: jest.fn(),
  validateScriptSyntax: jest.fn(),
};

// Mock the service constructors
jest.mock('../../../core/services/powershell.service', () => ({
  PowerShellService: jest.fn().mockImplementation(() => mockPowerShellService),
}));

jest.mock('../../../core/engine/command-manager', () => ({
  CommandManager: jest.fn().mockImplementation(() => mockCommandManager),
}));

describe('PowerShell Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(
      '/api/powershell',
      createPowerShellRoutes({
        authMiddleware: mockAuthMiddleware,
        commandManager: mockCommandManager,
      })
    );
  });

  describe('Script Management', () => {
    describe('POST /api/powershell/scripts', () => {
      it('should create a new PowerShell script', async () => {
        const mockScript = {
          id: 'script-1',
          name: 'Test Script',
          content: 'Get-Process',
          createdBy: 'operator-1',
        };

        mockPowerShellService.validateScriptSyntax.mockReturnValue({
          isValid: true,
          errors: [],
        });
        mockPowerShellService.createScript.mockResolvedValue(mockScript);

        const response = await request(app).post('/api/powershell/scripts').send({
          name: 'Test Script',
          content: 'Get-Process',
          description: 'Test description',
        });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockScript);
        expect(mockPowerShellService.createScript).toHaveBeenCalledWith(
          'Test Script',
          'Get-Process',
          'operator-1',
          'Test description',
          undefined,
          undefined
        );
      });

      it('should return 400 for missing required fields', async () => {
        const response = await request(app).post('/api/powershell/scripts').send({
          name: 'Test Script',
          // Missing content
        });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Missing required fields');
      });

      it('should return 400 for invalid script syntax', async () => {
        mockPowerShellService.validateScriptSyntax.mockReturnValue({
          isValid: false,
          errors: ['Unbalanced braces in script'],
        });

        const response = await request(app).post('/api/powershell/scripts').send({
          name: 'Test Script',
          content: 'if ($true) { Write-Host "test"',
        });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Script syntax validation failed');
        expect(response.body.details).toEqual(['Unbalanced braces in script']);
      });
    });

    describe('GET /api/powershell/scripts', () => {
      it('should get scripts for operator', async () => {
        const mockScripts = [
          { id: 'script-1', name: 'Script 1' },
          { id: 'script-2', name: 'Script 2' },
        ];

        mockPowerShellService.getScriptsByOperator.mockResolvedValue(mockScripts);

        const response = await request(app).get('/api/powershell/scripts');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockScripts);
        expect(response.body.count).toBe(2);
      });

      it('should search scripts', async () => {
        const mockScripts = [{ id: 'script-1', name: 'Test Script' }];

        mockPowerShellService.searchScripts.mockResolvedValue(mockScripts);

        const response = await request(app)
          .get('/api/powershell/scripts')
          .query({ search: 'test' });

        expect(response.status).toBe(200);
        expect(mockPowerShellService.searchScripts).toHaveBeenCalledWith('test');
      });

      it('should filter scripts by tags', async () => {
        const mockScripts = [{ id: 'script-1', name: 'Tagged Script' }];

        mockPowerShellService.getScriptsByTags.mockResolvedValue(mockScripts);

        const response = await request(app)
          .get('/api/powershell/scripts')
          .query({ tags: ['system', 'admin'] });

        expect(response.status).toBe(200);
        expect(mockPowerShellService.getScriptsByTags).toHaveBeenCalledWith(['system', 'admin']);
      });
    });

    describe('GET /api/powershell/scripts/:id', () => {
      it('should get a specific script', async () => {
        const mockScript = { id: 'script-1', name: 'Test Script' };

        mockPowerShellService.getScript.mockResolvedValue(mockScript);

        const response = await request(app).get('/api/powershell/scripts/script-1');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockScript);
      });

      it('should return 404 for non-existent script', async () => {
        mockPowerShellService.getScript.mockResolvedValue(null);

        const response = await request(app).get('/api/powershell/scripts/non-existent');

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });

    describe('PUT /api/powershell/scripts/:id', () => {
      it('should update a script', async () => {
        const updatedScript = { id: 'script-1', name: 'Updated Script' };

        mockPowerShellService.validateScriptSyntax.mockReturnValue({
          isValid: true,
          errors: [],
        });
        mockPowerShellService.updateScript.mockResolvedValue(updatedScript);

        const response = await request(app).put('/api/powershell/scripts/script-1').send({
          name: 'Updated Script',
          content: 'Get-Service',
        });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(updatedScript);
      });
    });

    describe('DELETE /api/powershell/scripts/:id', () => {
      it('should delete a script', async () => {
        mockPowerShellService.deleteScript.mockResolvedValue(undefined);

        const response = await request(app).delete('/api/powershell/scripts/script-1');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockPowerShellService.deleteScript).toHaveBeenCalledWith('script-1');
      });
    });
  });

  describe('Favorites Management', () => {
    describe('POST /api/powershell/favorites', () => {
      it('should create a new favorite', async () => {
        const mockFavorite = {
          id: 'favorite-1',
          name: 'Test Favorite',
          command: 'Get-Process',
          operatorId: 'operator-1',
        };

        mockPowerShellService.createFavorite.mockResolvedValue(mockFavorite);

        const response = await request(app).post('/api/powershell/favorites').send({
          name: 'Test Favorite',
          command: 'Get-Process',
          description: 'Test favorite',
          category: 'System',
        });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockFavorite);
      });

      it('should return 400 for missing required fields', async () => {
        const response = await request(app).post('/api/powershell/favorites').send({
          name: 'Test Favorite',
          // Missing command
        });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/powershell/favorites', () => {
      it('should get favorites for operator', async () => {
        const mockFavorites = [
          { id: 'favorite-1', name: 'Favorite 1' },
          { id: 'favorite-2', name: 'Favorite 2' },
        ];

        mockPowerShellService.getFavoritesByOperator.mockResolvedValue(mockFavorites);

        const response = await request(app).get('/api/powershell/favorites');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockFavorites);
      });

      it('should get most used favorites', async () => {
        const mockFavorites = [{ id: 'favorite-1', name: 'Popular Favorite' }];

        mockPowerShellService.getMostUsedFavorites.mockResolvedValue(mockFavorites);

        const response = await request(app)
          .get('/api/powershell/favorites')
          .query({ mostUsed: 'true', limit: '5' });

        expect(response.status).toBe(200);
        expect(mockPowerShellService.getMostUsedFavorites).toHaveBeenCalledWith('operator-1', 5);
      });
    });

    describe('POST /api/powershell/favorites/:id/use', () => {
      it('should mark favorite as used', async () => {
        const updatedFavorite = { id: 'favorite-1', usageCount: 1 };

        mockPowerShellService.useFavorite.mockResolvedValue(updatedFavorite);

        const response = await request(app).post('/api/powershell/favorites/favorite-1/use');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(updatedFavorite);
      });
    });
  });

  describe('PowerShell Execution', () => {
    describe('POST /api/powershell/execute', () => {
      it('should execute a PowerShell command', async () => {
        const mockCommand = {
          id: 'command-1',
          type: 'powershell',
          payload: 'Get-Process',
          status: 'pending',
        };

        mockCommandManager.executeCommand.mockResolvedValue(mockCommand);

        const response = await request(app).post('/api/powershell/execute').send({
          implantId: 'implant-1',
          command: 'Get-Process',
          timeout: 30000,
        });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockCommand);
        expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
          implantId: 'implant-1',
          operatorId: 'operator-1',
          type: 'powershell',
          payload: 'Get-Process',
          timeout: 30000,
        });
      });

      it('should return 400 for missing required fields', async () => {
        const response = await request(app).post('/api/powershell/execute').send({
          implantId: 'implant-1',
          // Missing command
        });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/powershell/execute-script', () => {
      it('should execute a PowerShell script by content', async () => {
        const mockCommand = {
          id: 'command-1',
          type: 'powershell_script',
          status: 'pending',
        };

        mockCommandManager.executeCommand.mockResolvedValue(mockCommand);

        const response = await request(app)
          .post('/api/powershell/execute-script')
          .send({
            implantId: 'implant-1',
            scriptContent: 'Get-Process | Sort-Object CPU',
            parameters: { Count: 10 },
            timeout: 60000,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
          implantId: 'implant-1',
          operatorId: 'operator-1',
          type: 'powershell_script',
          payload: JSON.stringify({
            script: 'Get-Process | Sort-Object CPU',
            parameters: { Count: 10 },
          }),
          timeout: 60000,
        });
      });

      it('should execute a PowerShell script by ID', async () => {
        const mockScript = {
          id: 'script-1',
          content: 'Get-Service',
        };

        mockPowerShellService.getScript.mockResolvedValue(mockScript);
        mockCommandManager.executeCommand.mockResolvedValue({ id: 'command-1' });

        const response = await request(app).post('/api/powershell/execute-script').send({
          implantId: 'implant-1',
          scriptId: 'script-1',
        });

        expect(response.status).toBe(200);
        expect(mockPowerShellService.getScript).toHaveBeenCalledWith('script-1');
      });

      it('should return 404 for non-existent script', async () => {
        mockPowerShellService.getScript.mockResolvedValue(null);

        const response = await request(app).post('/api/powershell/execute-script').send({
          implantId: 'implant-1',
          scriptId: 'non-existent',
        });

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/powershell/load-module', () => {
      it('should load a PowerShell module', async () => {
        const mockCommand = {
          id: 'command-1',
          type: 'powershell_module_load',
          status: 'pending',
        };

        mockCommandManager.executeCommand.mockResolvedValue(mockCommand);

        const response = await request(app).post('/api/powershell/load-module').send({
          implantId: 'implant-1',
          moduleName: 'ActiveDirectory',
          timeout: 30000,
        });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
          implantId: 'implant-1',
          operatorId: 'operator-1',
          type: 'powershell_module_load',
          payload: JSON.stringify({
            moduleName: 'ActiveDirectory',
            moduleContent: '',
          }),
          timeout: 30000,
        });
      });
    });

    describe('GET /api/powershell/modules/:implantId', () => {
      it('should list PowerShell modules', async () => {
        const mockCommand = {
          id: 'command-1',
          type: 'powershell_module_list',
          status: 'completed',
        };

        mockCommandManager.executeCommand.mockResolvedValue(mockCommand);

        const response = await request(app).get('/api/powershell/modules/implant-1');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
          implantId: 'implant-1',
          operatorId: 'operator-1',
          type: 'powershell_module_list',
          payload: '',
          timeout: 30000,
        });
      });
    });
  });

  describe('Session Management', () => {
    describe('POST /api/powershell/sessions', () => {
      it('should create a new PowerShell session', async () => {
        const mockSession = {
          id: 'session-1',
          implantId: 'implant-1',
          operatorId: 'operator-1',
          sessionState: 'Active',
        };

        mockPowerShellService.createSession.mockResolvedValue(mockSession);

        const response = await request(app).post('/api/powershell/sessions').send({
          implantId: 'implant-1',
          runspaceId: 'runspace-1',
        });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockSession);
      });
    });

    describe('GET /api/powershell/sessions', () => {
      it('should get sessions for operator', async () => {
        const mockSessions = [
          { id: 'session-1', implantId: 'implant-1' },
          { id: 'session-2', implantId: 'implant-2' },
        ];

        mockPowerShellService.getSessionsByOperator.mockResolvedValue(mockSessions);

        const response = await request(app).get('/api/powershell/sessions');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockSessions);
      });

      it('should get sessions for specific implant', async () => {
        const mockSessions = [{ id: 'session-1', implantId: 'implant-1' }];

        mockPowerShellService.getSessionsByImplant.mockResolvedValue(mockSessions);

        const response = await request(app)
          .get('/api/powershell/sessions')
          .query({ implantId: 'implant-1' });

        expect(response.status).toBe(200);
        expect(mockPowerShellService.getSessionsByImplant).toHaveBeenCalledWith('implant-1');
      });
    });

    describe('DELETE /api/powershell/sessions/:id', () => {
      it('should close and delete a session', async () => {
        mockPowerShellService.closeSession.mockResolvedValue(undefined);
        mockPowerShellService.deleteSession.mockResolvedValue(undefined);

        const response = await request(app).delete('/api/powershell/sessions/session-1');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockPowerShellService.closeSession).toHaveBeenCalledWith('session-1');
        expect(mockPowerShellService.deleteSession).toHaveBeenCalledWith('session-1');
      });
    });
  });
});
