/**
 * Tests for PowerShell service
 */

import { PowerShellService } from '../powershell.service';
import { PowerShellScript, PowerShellFavorite, PowerShellSession } from '../../../types/entities';

// Mock repositories
const mockScriptRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  findByOperator: jest.fn(),
  findByTags: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  search: jest.fn(),
};

const mockFavoriteRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  findByOperator: jest.fn(),
  findByCategory: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  incrementUsage: jest.fn(),
  getMostUsed: jest.fn(),
};

const mockSessionRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  findByImplant: jest.fn(),
  findByOperator: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  updateLastActivity: jest.fn(),
};

describe('PowerShellService', () => {
  let service: PowerShellService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PowerShellService(
      mockScriptRepository,
      mockFavoriteRepository,
      mockSessionRepository
    );
  });

  describe('Script Management', () => {
    const mockScript: PowerShellScript = {
      id: 'script-1',
      name: 'Test Script',
      content: 'Get-Process',
      description: 'Test description',
      parameters: [],
      tags: ['test'],
      createdBy: 'operator-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    describe('createScript', () => {
      it('should create a new PowerShell script', async () => {
        mockScriptRepository.create.mockResolvedValue(mockScript);

        const result = await service.createScript(
          'Test Script',
          'Get-Process',
          'operator-1',
          'Test description',
          [],
          ['test']
        );

        expect(mockScriptRepository.create).toHaveBeenCalledWith({
          name: 'Test Script',
          content: 'Get-Process',
          description: 'Test description',
          parameters: [],
          tags: ['test'],
          createdBy: 'operator-1',
        });
        expect(result).toEqual(mockScript);
      });

      it('should handle creation errors', async () => {
        const error = new Error('Database error');
        mockScriptRepository.create.mockRejectedValue(error);

        await expect(
          service.createScript('Test Script', 'Get-Process', 'operator-1')
        ).rejects.toThrow('Database error');
      });
    });

    describe('getScript', () => {
      it('should retrieve a script by ID', async () => {
        mockScriptRepository.findById.mockResolvedValue(mockScript);

        const result = await service.getScript('script-1');

        expect(mockScriptRepository.findById).toHaveBeenCalledWith('script-1');
        expect(result).toEqual(mockScript);
      });

      it('should return null for non-existent script', async () => {
        mockScriptRepository.findById.mockResolvedValue(null);

        const result = await service.getScript('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('updateScript', () => {
      it('should update a script', async () => {
        const updatedScript = { ...mockScript, name: 'Updated Script' };
        mockScriptRepository.update.mockResolvedValue(updatedScript);

        const result = await service.updateScript('script-1', { name: 'Updated Script' });

        expect(mockScriptRepository.update).toHaveBeenCalledWith('script-1', {
          name: 'Updated Script',
        });
        expect(result).toEqual(updatedScript);
      });
    });

    describe('deleteScript', () => {
      it('should delete a script', async () => {
        mockScriptRepository.delete.mockResolvedValue(undefined);

        await service.deleteScript('script-1');

        expect(mockScriptRepository.delete).toHaveBeenCalledWith('script-1');
      });
    });

    describe('searchScripts', () => {
      it('should search scripts', async () => {
        mockScriptRepository.search.mockResolvedValue([mockScript]);

        const result = await service.searchScripts('test');

        expect(mockScriptRepository.search).toHaveBeenCalledWith('test');
        expect(result).toEqual([mockScript]);
      });
    });
  });

  describe('Favorites Management', () => {
    const mockFavorite: PowerShellFavorite = {
      id: 'favorite-1',
      name: 'Test Favorite',
      command: 'Get-Process',
      description: 'Test favorite',
      category: 'System',
      operatorId: 'operator-1',
      createdAt: new Date(),
      usageCount: 0,
    };

    describe('createFavorite', () => {
      it('should create a new PowerShell favorite', async () => {
        mockFavoriteRepository.create.mockResolvedValue(mockFavorite);

        const result = await service.createFavorite(
          'Test Favorite',
          'Get-Process',
          'operator-1',
          'Test favorite',
          'System'
        );

        expect(mockFavoriteRepository.create).toHaveBeenCalledWith({
          name: 'Test Favorite',
          command: 'Get-Process',
          description: 'Test favorite',
          category: 'System',
          operatorId: 'operator-1',
        });
        expect(result).toEqual(mockFavorite);
      });
    });

    describe('useFavorite', () => {
      it('should increment usage count and update last used', async () => {
        const updatedFavorite = { ...mockFavorite, usageCount: 1, lastUsed: new Date() };
        mockFavoriteRepository.incrementUsage.mockResolvedValue(undefined);
        mockFavoriteRepository.update.mockResolvedValue(updatedFavorite);

        const result = await service.useFavorite('favorite-1');

        expect(mockFavoriteRepository.incrementUsage).toHaveBeenCalledWith('favorite-1');
        expect(mockFavoriteRepository.update).toHaveBeenCalledWith('favorite-1', {
          lastUsed: expect.any(Date),
        });
        expect(result).toEqual(updatedFavorite);
      });
    });

    describe('getMostUsedFavorites', () => {
      it('should get most used favorites', async () => {
        mockFavoriteRepository.getMostUsed.mockResolvedValue([mockFavorite]);

        const result = await service.getMostUsedFavorites('operator-1', 5);

        expect(mockFavoriteRepository.getMostUsed).toHaveBeenCalledWith('operator-1', 5);
        expect(result).toEqual([mockFavorite]);
      });
    });
  });

  describe('Session Management', () => {
    const mockSession: PowerShellSession = {
      id: 'session-1',
      implantId: 'implant-1',
      operatorId: 'operator-1',
      sessionState: 'Active',
      runspaceId: 'runspace-1',
      modules: [],
      variables: {},
      executionPolicy: [],
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    describe('createSession', () => {
      it('should create a new PowerShell session', async () => {
        mockSessionRepository.create.mockResolvedValue(mockSession);

        const result = await service.createSession('implant-1', 'operator-1', 'runspace-1');

        expect(mockSessionRepository.create).toHaveBeenCalledWith({
          implantId: 'implant-1',
          operatorId: 'operator-1',
          sessionState: 'Active',
          runspaceId: 'runspace-1',
          modules: [],
          variables: {},
          executionPolicy: [],
        });
        expect(result).toEqual(mockSession);
      });
    });

    describe('updateSession', () => {
      it('should update session and last activity', async () => {
        const updatedSession = { ...mockSession, sessionState: 'Closed' as const };
        mockSessionRepository.update.mockResolvedValue(updatedSession);
        mockSessionRepository.updateLastActivity.mockResolvedValue(undefined);

        const result = await service.updateSession('session-1', { sessionState: 'Closed' });

        expect(mockSessionRepository.update).toHaveBeenCalledWith('session-1', {
          sessionState: 'Closed',
        });
        expect(mockSessionRepository.updateLastActivity).toHaveBeenCalledWith('session-1');
        expect(result).toEqual(updatedSession);
      });
    });

    describe('closeSession', () => {
      it('should close a session', async () => {
        mockSessionRepository.update.mockResolvedValue(undefined);

        await service.closeSession('session-1');

        expect(mockSessionRepository.update).toHaveBeenCalledWith('session-1', {
          sessionState: 'Closed',
        });
      });
    });
  });

  describe('Utility Methods', () => {
    describe('parseScriptParameters', () => {
      it('should parse PowerShell script parameters', () => {
        const scriptContent = `
          [Parameter(Mandatory=$true)]
          [string]$Name,
          
          [Parameter()]
          [int]$Count = 10
        `;

        const result = service.parseScriptParameters(scriptContent);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          name: 'Name',
          type: 'string',
          mandatory: true,
          defaultValue: undefined,
        });
        expect(result[1]).toEqual({
          name: 'Count',
          type: 'int',
          mandatory: false,
          defaultValue: '10',
        });
      });

      it('should handle scripts without parameters', () => {
        const scriptContent = 'Get-Process | Sort-Object CPU';

        const result = service.parseScriptParameters(scriptContent);

        expect(result).toHaveLength(0);
      });
    });

    describe('formatPowerShellOutput', () => {
      it('should format string output', () => {
        const result = service.formatPowerShellOutput('test output');
        expect(result).toBe('test output');
      });

      it('should format array output', () => {
        const result = service.formatPowerShellOutput(['item1', 'item2']);
        expect(result).toBe('item1\nitem2');
      });

      it('should format object output', () => {
        const result = service.formatPowerShellOutput({ name: 'test', value: 123 });
        expect(result).toBe('{\n  "name": "test",\n  "value": 123\n}');
      });

      it('should format null/undefined output', () => {
        expect(service.formatPowerShellOutput(null)).toBe('null');
        expect(service.formatPowerShellOutput(undefined)).toBe('undefined');
      });
    });

    describe('validateScriptSyntax', () => {
      it('should validate correct script syntax', () => {
        const scriptContent = `
          if ($true) {
              Write-Host "Hello World"
          }
        `;

        const result = service.validateScriptSyntax(scriptContent);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should detect empty script', () => {
        const result = service.validateScriptSyntax('');

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Script content cannot be empty');
      });

      it('should detect unbalanced braces', () => {
        const scriptContent = 'if ($true) { Write-Host "test"';

        const result = service.validateScriptSyntax(scriptContent);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Unbalanced braces in script');
      });

      it('should detect unbalanced parentheses', () => {
        const scriptContent = 'Write-Host ("test"';

        const result = service.validateScriptSyntax(scriptContent);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Unbalanced parentheses in script');
      });
    });
  });
});
