/**
 * Repository pattern interfaces for SeraphC2
 */

import {
  Implant,
  Operator,
  Command,
  CreateImplantData,
  UpdateImplantData,
  CreateOperatorData,
  UpdateOperatorData,
  CreateCommandData,
  UpdateCommandData,
  ImplantStatus,
  CommandStatus,
} from '../../types/entities';

export interface BaseRepository<T, CreateData, UpdateData> {
  create(data: CreateData): Promise<T>;
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  update(id: string, data: UpdateData): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

export interface ImplantRepository
  extends BaseRepository<Implant, CreateImplantData, UpdateImplantData> {
  findByHostname(hostname: string): Promise<Implant[]>;
  findByStatus(status: ImplantStatus): Promise<Implant[]>;
  findActiveImplants(): Promise<Implant[]>;
  findInactiveImplants(thresholdMinutes: number): Promise<Implant[]>;
  updateLastSeen(id: string): Promise<void>;
  updateStatus(id: string, status: ImplantStatus): Promise<void>;
  getImplantCount(): Promise<number>;
  getImplantsByProtocol(protocol: string): Promise<Implant[]>;
}

export interface OperatorRepository
  extends BaseRepository<Operator, CreateOperatorData, UpdateOperatorData> {
  findByUsername(username: string): Promise<Operator | null>;
  findByEmail(email: string): Promise<Operator | null>;
  findBySessionToken(token: string): Promise<Operator | null>;
  findActiveOperators(): Promise<Operator[]>;
  updateLastLogin(id: string): Promise<void>;
  updateSessionToken(id: string, token: string | null): Promise<void>;
  deactivateOperator(id: string): Promise<void>;
  activateOperator(id: string): Promise<void>;
}

export interface CommandRepository
  extends BaseRepository<Command, CreateCommandData, UpdateCommandData> {
  findByImplantId(implantId: string, limit?: number): Promise<Command[]>;
  findByOperatorId(operatorId: string, limit?: number): Promise<Command[]>;
  findByStatus(status: CommandStatus): Promise<Command[]>;
  findPendingCommands(implantId?: string): Promise<Command[]>;
  updateCommandStatus(id: string, status: CommandStatus): Promise<void>;
  getCommandHistory(implantId: string, limit: number, offset: number): Promise<Command[]>;
  getCommandCount(): Promise<number>;
  getCommandsByDateRange(startDate: Date, endDate: Date): Promise<Command[]>;
}

export interface RepositoryFactory {
  getImplantRepository(): ImplantRepository;
  getOperatorRepository(): OperatorRepository;
  getCommandRepository(): CommandRepository;
}
