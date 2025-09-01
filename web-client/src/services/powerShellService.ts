/**
 * PowerShell service for managing scripts, favorites, and sessions
 */

import { apiClient } from './apiClient';

export interface PowerShellScript {
  id: string;
  name: string;
  description?: string;
  content: string;
  parameters?: PowerShellParameter[];
  tags?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PowerShellParameter {
  name: string;
  type: string;
  mandatory: boolean;
  defaultValue?: any;
  description?: string;
  validateSet?: string[];
}

export interface PowerShellFavorite {
  id: string;
  name: string;
  command: string;
  description?: string;
  category?: string;
  operatorId: string;
  createdAt: string;
  usageCount: number;
  lastUsed?: string;
}

export interface PowerShellModule {
  name: string;
  version: string;
  description?: string;
  author?: string;
  companyName?: string;
  copyright?: string;
  moduleType: string;
  exportedCommands?: string[];
  exportedFunctions?: string[];
  exportedVariables?: string[];
  requiredModules?: string[];
  path?: string;
}

export interface CreateScriptRequest {
  name: string;
  content: string;
  description?: string;
  parameters?: PowerShellParameter[];
  tags?: string[];
}

export interface CreateFavoriteRequest {
  name: string;
  command: string;
  description?: string;
  category?: string;
}

export interface ScriptSearchFilter {
  tags?: string[];
  search?: string;
}

export interface FavoriteFilter {
  category?: string;
  mostUsed?: boolean;
  limit?: number;
}

export interface PowerShellExecuteRequest {
  implantId: string;
  command: string;
  timeout?: number;
}

export interface PowerShellScriptExecuteRequest {
  implantId: string;
  scriptId?: string;
  scriptContent?: string;
  parameters?: { [key: string]: any };
  timeout?: number;
}

export interface PowerShellModuleLoadRequest {
  implantId: string;
  moduleName?: string;
  moduleContent?: string;
  timeout?: number;
}

export interface PowerShellSession {
  id: string;
  implantId: string;
  operatorId: string;
  sessionState: 'Active' | 'Broken' | 'Closed';
  runspaceId?: string;
  modules: PowerShellModule[];
  variables: { [key: string]: any };
  executionPolicy: any[];
  createdAt: string;
  lastActivity: string;
}

export class PowerShellService {
  // Script Management

  /**
   * Create a new PowerShell script
   */
  static async createScript(request: CreateScriptRequest): Promise<PowerShellScript> {
    const response = await apiClient.post('/api/powershell/scripts', request);
    return response.data.data;
  }

  /**
   * Get PowerShell scripts
   */
  static async getScripts(filter?: ScriptSearchFilter): Promise<PowerShellScript[]> {
    const params = new URLSearchParams();
    if (filter?.tags) {
      filter.tags.forEach(tag => params.append('tags', tag));
    }
    if (filter?.search) {
      params.append('search', filter.search);
    }

    const response = await apiClient.get(`/api/powershell/scripts?${params.toString()}`);
    return response.data.data;
  }

  /**
   * Get a specific PowerShell script
   */
  static async getScript(id: string): Promise<PowerShellScript> {
    const response = await apiClient.get(`/api/powershell/scripts/${id}`);
    return response.data.data;
  }

  /**
   * Update a PowerShell script
   */
  static async updateScript(
    id: string,
    updates: Partial<PowerShellScript>
  ): Promise<PowerShellScript> {
    const response = await apiClient.put(`/api/powershell/scripts/${id}`, updates);
    return response.data.data;
  }

  /**
   * Delete a PowerShell script
   */
  static async deleteScript(id: string): Promise<void> {
    await apiClient.delete(`/api/powershell/scripts/${id}`);
  }

  // Favorites Management

  /**
   * Create a new PowerShell favorite
   */
  static async createFavorite(request: CreateFavoriteRequest): Promise<PowerShellFavorite> {
    const response = await apiClient.post('/api/powershell/favorites', request);
    return response.data.data;
  }

  /**
   * Get PowerShell favorites
   */
  static async getFavorites(filter?: FavoriteFilter): Promise<PowerShellFavorite[]> {
    const params = new URLSearchParams();
    if (filter?.category) {
      params.append('category', filter.category);
    }
    if (filter?.mostUsed) {
      params.append('mostUsed', 'true');
    }
    if (filter?.limit) {
      params.append('limit', filter.limit.toString());
    }

    const response = await apiClient.get(`/api/powershell/favorites?${params.toString()}`);
    return response.data.data;
  }

  /**
   * Use a PowerShell favorite (increment usage count)
   */
  static async useFavorite(id: string): Promise<PowerShellFavorite> {
    const response = await apiClient.post(`/api/powershell/favorites/${id}/use`);
    return response.data.data;
  }

  /**
   * Update a PowerShell favorite
   */
  static async updateFavorite(
    id: string,
    updates: Partial<PowerShellFavorite>
  ): Promise<PowerShellFavorite> {
    const response = await apiClient.put(`/api/powershell/favorites/${id}`, updates);
    return response.data.data;
  }

  /**
   * Delete a PowerShell favorite
   */
  static async deleteFavorite(id: string): Promise<void> {
    await apiClient.delete(`/api/powershell/favorites/${id}`);
  }

  // Utility Methods

  /**
   * Validate PowerShell script syntax
   */
  static validateScriptSyntax(scriptContent: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!scriptContent.trim()) {
      errors.push('Script content cannot be empty');
    }

    // Check for balanced braces
    const openBraces = (scriptContent.match(/{/g) || []).length;
    const closeBraces = (scriptContent.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push('Unbalanced braces in script');
    }

    // Check for balanced parentheses
    const openParens = (scriptContent.match(/\(/g) || []).length;
    const closeParens = (scriptContent.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push('Unbalanced parentheses in script');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parse script parameters from PowerShell script content
   */
  static parseScriptParameters(scriptContent: string): PowerShellParameter[] {
    const parameters: PowerShellParameter[] = [];

    // Simple regex to extract param blocks
    const paramRegex = /\[Parameter\([^\]]*\)\]\s*\[([^\]]+)\]\s*\$(\w+)(?:\s*=\s*([^,\r\n]+))?/gi;
    let match;

    while ((match = paramRegex.exec(scriptContent)) !== null) {
      const [, type, name, defaultValue] = match;

      parameters.push({
        name,
        type: type.trim(),
        mandatory: match[0].includes('Mandatory'),
        defaultValue: defaultValue?.trim(),
        description: undefined,
      });
    }

    return parameters;
  }

  /**
   * Format PowerShell output for display
   */
  static formatPowerShellOutput(output: any): string {
    if (typeof output === 'string') {
      return output;
    }

    if (Array.isArray(output)) {
      return output.map(item => this.formatPowerShellOutput(item)).join('\n');
    }

    if (typeof output === 'object' && output !== null) {
      return JSON.stringify(output, null, 2);
    }

    return String(output);
  }

  /**
   * Get common PowerShell command categories
   */
  static getCommandCategories(): string[] {
    return [
      'System Information',
      'Process Management',
      'File Operations',
      'Network',
      'Registry',
      'Services',
      'Active Directory',
      'Security',
      'Custom',
    ];
  }

  /**
   * Get common PowerShell commands by category
   */
  static getCommonCommands(): { [category: string]: string[] } {
    return {
      'System Information': [
        'Get-ComputerInfo',
        'Get-WmiObject Win32_OperatingSystem',
        'Get-Process',
        'Get-Service',
        'Get-EventLog System -Newest 10',
      ],
      'Process Management': [
        'Get-Process | Sort-Object CPU -Descending',
        'Stop-Process -Name "notepad"',
        'Start-Process "notepad.exe"',
        'Get-Process | Where-Object {$_.CPU -gt 100}',
      ],
      'File Operations': [
        'Get-ChildItem -Recurse',
        'Get-Content "file.txt"',
        'Set-Content "file.txt" -Value "content"',
        'Copy-Item "source" "destination"',
        'Remove-Item "file.txt"',
      ],
      Network: [
        'Test-NetConnection google.com',
        'Get-NetAdapter',
        'Get-NetIPConfiguration',
        'Resolve-DnsName google.com',
      ],
      Registry: [
        'Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion',
        'Set-ItemProperty -Path "HKLM:\\Software\\Test" -Name "Value" -Value "Data"',
        'New-Item -Path "HKLM:\\Software\\Test"',
      ],
      Services: [
        'Get-Service | Where-Object {$_.Status -eq "Running"}',
        'Start-Service "Spooler"',
        'Stop-Service "Spooler"',
        'Restart-Service "Spooler"',
      ],
    };
  }

  // PowerShell Execution Methods

  /**
   * Execute a PowerShell command on an implant
   */
  static async executePowerShellCommand(request: PowerShellExecuteRequest): Promise<any> {
    const response = await apiClient.post('/api/powershell/execute', request);
    return response.data.data;
  }

  /**
   * Execute a PowerShell script on an implant
   */
  static async executePowerShellScript(request: PowerShellScriptExecuteRequest): Promise<any> {
    const response = await apiClient.post('/api/powershell/execute-script', request);
    return response.data.data;
  }

  /**
   * Load a PowerShell module on an implant
   */
  static async loadPowerShellModule(request: PowerShellModuleLoadRequest): Promise<any> {
    const response = await apiClient.post('/api/powershell/load-module', request);
    return response.data.data;
  }

  /**
   * List PowerShell modules on an implant
   */
  static async listPowerShellModules(implantId: string): Promise<any> {
    const response = await apiClient.get(`/api/powershell/modules/${implantId}`);
    return response.data.data;
  }

  // Session Management

  /**
   * Create a new PowerShell session
   */
  static async createSession(implantId: string, runspaceId?: string): Promise<PowerShellSession> {
    const response = await apiClient.post('/api/powershell/sessions', {
      implantId,
      runspaceId,
    });
    return response.data.data;
  }

  /**
   * Get PowerShell sessions
   */
  static async getSessions(implantId?: string): Promise<PowerShellSession[]> {
    const params = implantId ? `?implantId=${implantId}` : '';
    const response = await apiClient.get(`/api/powershell/sessions${params}`);
    return response.data.data;
  }

  /**
   * Get a specific PowerShell session
   */
  static async getSession(id: string): Promise<PowerShellSession> {
    const response = await apiClient.get(`/api/powershell/sessions/${id}`);
    return response.data.data;
  }

  /**
   * Update a PowerShell session
   */
  static async updateSession(
    id: string,
    updates: Partial<PowerShellSession>
  ): Promise<PowerShellSession> {
    const response = await apiClient.put(`/api/powershell/sessions/${id}`, updates);
    return response.data.data;
  }

  /**
   * Delete a PowerShell session
   */
  static async deleteSession(id: string): Promise<void> {
    await apiClient.delete(`/api/powershell/sessions/${id}`);
  }
}
