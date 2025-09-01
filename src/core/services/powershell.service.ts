/**
 * PowerShell service for managing scripts, modules, and favorites
 * Implements requirements 4.1, 4.2, 4.5 from the SeraphC2 specification
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';
import {
  PowerShellScript,
  PowerShellFavorite,
  PowerShellSession,
  PowerShellParameter,
} from '../../types/entities';

export interface PowerShellScriptRepository {
  create(
    script: Omit<PowerShellScript, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PowerShellScript>;
  findById(id: string): Promise<PowerShellScript | null>;
  findByOperator(operatorId: string): Promise<PowerShellScript[]>;
  findByTags(tags: string[]): Promise<PowerShellScript[]>;
  update(id: string, updates: Partial<PowerShellScript>): Promise<PowerShellScript>;
  delete(id: string): Promise<void>;
  search(query: string): Promise<PowerShellScript[]>;
}

export interface PowerShellFavoriteRepository {
  create(
    favorite: Omit<PowerShellFavorite, 'id' | 'createdAt' | 'usageCount'>
  ): Promise<PowerShellFavorite>;
  findById(id: string): Promise<PowerShellFavorite | null>;
  findByOperator(operatorId: string): Promise<PowerShellFavorite[]>;
  findByCategory(category: string): Promise<PowerShellFavorite[]>;
  update(id: string, updates: Partial<PowerShellFavorite>): Promise<PowerShellFavorite>;
  delete(id: string): Promise<void>;
  incrementUsage(id: string): Promise<void>;
  getMostUsed(operatorId: string, limit?: number): Promise<PowerShellFavorite[]>;
}

export interface PowerShellSessionRepository {
  create(
    session: Omit<PowerShellSession, 'id' | 'createdAt' | 'lastActivity'>
  ): Promise<PowerShellSession>;
  findById(id: string): Promise<PowerShellSession | null>;
  findByImplant(implantId: string): Promise<PowerShellSession[]>;
  findByOperator(operatorId: string): Promise<PowerShellSession[]>;
  update(id: string, updates: Partial<PowerShellSession>): Promise<PowerShellSession>;
  delete(id: string): Promise<void>;
  updateLastActivity(id: string): Promise<void>;
}

export class PowerShellService extends EventEmitter {
  private logger: Logger;
  private scriptRepository: PowerShellScriptRepository;
  private favoriteRepository: PowerShellFavoriteRepository;
  private sessionRepository: PowerShellSessionRepository;

  constructor(
    scriptRepository: PowerShellScriptRepository,
    favoriteRepository: PowerShellFavoriteRepository,
    sessionRepository: PowerShellSessionRepository
  ) {
    super();
    this.logger = Logger.getInstance();
    this.scriptRepository = scriptRepository;
    this.favoriteRepository = favoriteRepository;
    this.sessionRepository = sessionRepository;
  }

  // Script Management
  async createScript(
    name: string,
    content: string,
    operatorId: string,
    description?: string,
    parameters?: PowerShellParameter[],
    tags?: string[]
  ): Promise<PowerShellScript> {
    try {
      const script = await this.scriptRepository.create({
        name,
        content,
        description: description || undefined,
        parameters: parameters || [],
        tags: tags || [],
        createdBy: operatorId,
      });

      this.logger.info('PowerShell script created', {
        scriptId: script.id,
        name: script.name,
        operatorId,
      });

      this.emit('scriptCreated', script);
      return script;
    } catch (error) {
      this.logger.error('Failed to create PowerShell script', {
        error: error instanceof Error ? error.message : 'Unknown error',
        name,
        operatorId,
      });
      throw error;
    }
  }

  async getScript(id: string): Promise<PowerShellScript | null> {
    return this.scriptRepository.findById(id);
  }

  async getScriptsByOperator(operatorId: string): Promise<PowerShellScript[]> {
    return this.scriptRepository.findByOperator(operatorId);
  }

  async getScriptsByTags(tags: string[]): Promise<PowerShellScript[]> {
    return this.scriptRepository.findByTags(tags);
  }

  async updateScript(id: string, updates: Partial<PowerShellScript>): Promise<PowerShellScript> {
    try {
      const script = await this.scriptRepository.update(id, updates);

      this.logger.info('PowerShell script updated', {
        scriptId: id,
        updates: Object.keys(updates),
      });

      this.emit('scriptUpdated', script);
      return script;
    } catch (error) {
      this.logger.error('Failed to update PowerShell script', {
        error: error instanceof Error ? error.message : 'Unknown error',
        scriptId: id,
      });
      throw error;
    }
  }

  async deleteScript(id: string): Promise<void> {
    try {
      await this.scriptRepository.delete(id);

      this.logger.info('PowerShell script deleted', { scriptId: id });
      this.emit('scriptDeleted', { id });
    } catch (error) {
      this.logger.error('Failed to delete PowerShell script', {
        error: error instanceof Error ? error.message : 'Unknown error',
        scriptId: id,
      });
      throw error;
    }
  }

  async searchScripts(query: string): Promise<PowerShellScript[]> {
    return this.scriptRepository.search(query);
  }

  // Favorites Management
  async createFavorite(
    name: string,
    command: string,
    operatorId: string,
    description?: string,
    category?: string
  ): Promise<PowerShellFavorite> {
    try {
      const favorite = await this.favoriteRepository.create({
        name,
        command,
        description: description || undefined,
        category: category || undefined,
        operatorId,
      });

      this.logger.info('PowerShell favorite created', {
        favoriteId: favorite.id,
        name: favorite.name,
        operatorId,
      });

      this.emit('favoriteCreated', favorite);
      return favorite;
    } catch (error) {
      this.logger.error('Failed to create PowerShell favorite', {
        error: error instanceof Error ? error.message : 'Unknown error',
        name,
        operatorId,
      });
      throw error;
    }
  }

  async getFavorite(id: string): Promise<PowerShellFavorite | null> {
    return this.favoriteRepository.findById(id);
  }

  async getFavoritesByOperator(operatorId: string): Promise<PowerShellFavorite[]> {
    return this.favoriteRepository.findByOperator(operatorId);
  }

  async getFavoritesByCategory(category: string): Promise<PowerShellFavorite[]> {
    return this.favoriteRepository.findByCategory(category);
  }

  async getMostUsedFavorites(operatorId: string, limit = 10): Promise<PowerShellFavorite[]> {
    return this.favoriteRepository.getMostUsed(operatorId, limit);
  }

  async updateFavorite(
    id: string,
    updates: Partial<PowerShellFavorite>
  ): Promise<PowerShellFavorite> {
    try {
      const favorite = await this.favoriteRepository.update(id, updates);

      this.logger.info('PowerShell favorite updated', {
        favoriteId: id,
        updates: Object.keys(updates),
      });

      this.emit('favoriteUpdated', favorite);
      return favorite;
    } catch (error) {
      this.logger.error('Failed to update PowerShell favorite', {
        error: error instanceof Error ? error.message : 'Unknown error',
        favoriteId: id,
      });
      throw error;
    }
  }

  async deleteFavorite(id: string): Promise<void> {
    try {
      await this.favoriteRepository.delete(id);

      this.logger.info('PowerShell favorite deleted', { favoriteId: id });
      this.emit('favoriteDeleted', { id });
    } catch (error) {
      this.logger.error('Failed to delete PowerShell favorite', {
        error: error instanceof Error ? error.message : 'Unknown error',
        favoriteId: id,
      });
      throw error;
    }
  }

  async useFavorite(id: string): Promise<PowerShellFavorite> {
    try {
      await this.favoriteRepository.incrementUsage(id);
      const favorite = await this.favoriteRepository.update(id, {
        lastUsed: new Date(),
      });

      this.emit('favoriteUsed', favorite);
      return favorite;
    } catch (error) {
      this.logger.error('Failed to use PowerShell favorite', {
        error: error instanceof Error ? error.message : 'Unknown error',
        favoriteId: id,
      });
      throw error;
    }
  }

  // Session Management
  async createSession(
    implantId: string,
    operatorId: string,
    runspaceId?: string
  ): Promise<PowerShellSession> {
    try {
      const session = await this.sessionRepository.create({
        implantId,
        operatorId,
        sessionState: 'Active',
        runspaceId: runspaceId || undefined,
        modules: [],
        variables: {},
        executionPolicy: [],
      });

      this.logger.info('PowerShell session created', {
        sessionId: session.id,
        implantId,
        operatorId,
      });

      this.emit('sessionCreated', session);
      return session;
    } catch (error) {
      this.logger.error('Failed to create PowerShell session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
      });
      throw error;
    }
  }

  async getSession(id: string): Promise<PowerShellSession | null> {
    return this.sessionRepository.findById(id);
  }

  async getSessionsByImplant(implantId: string): Promise<PowerShellSession[]> {
    return this.sessionRepository.findByImplant(implantId);
  }

  async getSessionsByOperator(operatorId: string): Promise<PowerShellSession[]> {
    return this.sessionRepository.findByOperator(operatorId);
  }

  async updateSession(id: string, updates: Partial<PowerShellSession>): Promise<PowerShellSession> {
    try {
      const session = await this.sessionRepository.update(id, updates);
      await this.sessionRepository.updateLastActivity(id);

      this.logger.info('PowerShell session updated', {
        sessionId: id,
        updates: Object.keys(updates),
      });

      this.emit('sessionUpdated', session);
      return session;
    } catch (error) {
      this.logger.error('Failed to update PowerShell session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: id,
      });
      throw error;
    }
  }

  async closeSession(id: string): Promise<void> {
    try {
      await this.sessionRepository.update(id, {
        sessionState: 'Closed',
      });

      this.logger.info('PowerShell session closed', { sessionId: id });
      this.emit('sessionClosed', { id });
    } catch (error) {
      this.logger.error('Failed to close PowerShell session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: id,
      });
      throw error;
    }
  }

  async deleteSession(id: string): Promise<void> {
    try {
      await this.sessionRepository.delete(id);

      this.logger.info('PowerShell session deleted', { sessionId: id });
      this.emit('sessionDeleted', { id });
    } catch (error) {
      this.logger.error('Failed to delete PowerShell session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: id,
      });
      throw error;
    }
  }

  // Utility Methods
  parseScriptParameters(scriptContent: string): PowerShellParameter[] {
    const parameters: PowerShellParameter[] = [];

    // Simple regex to extract param blocks - this could be enhanced
    const paramRegex = /\[Parameter\([^\]]*\)\]\s*\[([^\]]+)\]\s*\$(\w+)(?:\s*=\s*([^,\r\n]+))?/gi;
    let match;

    while ((match = paramRegex.exec(scriptContent)) !== null) {
      const [, type, name, defaultValue] = match;

      if (name && type) {
        parameters.push({
          name,
          type: type.trim(),
          mandatory: match[0].includes('Mandatory'),
          defaultValue: defaultValue?.trim(),
        });
      }
    }

    return parameters;
  }

  formatPowerShellOutput(output: any): string {
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

  validateScriptSyntax(scriptContent: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic syntax validation - could be enhanced with actual PowerShell parsing
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
}
