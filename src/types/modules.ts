/**
 * Modular Task Architecture types for SeraphC2
 * Implements requirements 13.1, 13.2, 13.3, 13.4
 */

export enum ModuleCategory {
  CREDENTIAL_HARVESTING = 'credential_harvesting',
  NETWORK_DISCOVERY = 'network_discovery',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  DATA_EXFILTRATION = 'data_exfiltration',
  PERSISTENCE = 'persistence',
  KEYLOGGING = 'keylogging',
  RECONNAISSANCE = 'reconnaissance',
  LATERAL_MOVEMENT = 'lateral_movement',
  EVASION = 'evasion',
  CUSTOM = 'custom',
}

export enum ModuleStatus {
  LOADED = 'loaded',
  UNLOADED = 'unloaded',
  LOADING = 'loading',
  FAILED = 'failed',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export enum ModuleExecutionMode {
  SYNCHRONOUS = 'synchronous',
  ASYNCHRONOUS = 'asynchronous',
  BACKGROUND = 'background',
}

export interface ModuleMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  category: ModuleCategory;
  tags: string[];
  requirements: ModuleRequirements;
  capabilities: ModuleCapability[];
  executionMode: ModuleExecutionMode;
  timeout?: number; // milliseconds
  memoryLimit?: number; // bytes
  cpuLimit?: number; // percentage
  networkAccess?: boolean;
  fileSystemAccess?: boolean;
  registryAccess?: boolean;
  processAccess?: boolean;
}

export interface ModuleRequirements {
  minOSVersion?: string;
  maxOSVersion?: string;
  architecture?: string[];
  privileges?: string[];
  dependencies?: string[];
  powershellVersion?: string;
  dotnetVersion?: string;
}

export interface ModuleCapability {
  name: string;
  description: string;
  parameters?: ModuleParameter[];
  returns?: ModuleReturnType;
}

export interface ModuleParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  defaultValue?: any;
  validation?: ModuleParameterValidation;
}

export interface ModuleParameterValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: any[];
  min?: number;
  max?: number;
}

export interface ModuleReturnType {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  schema?: Record<string, any>;
}

export interface ModuleSignature {
  algorithm: 'RSA-SHA256' | 'ECDSA-SHA256';
  publicKey: string;
  signature: string;
  timestamp: Date;
  issuer: string;
}

export interface Module {
  id: string;
  metadata: ModuleMetadata;
  signature: ModuleSignature;
  binary: Buffer;
  hash: string;
  size: number;
  status: ModuleStatus;
  loadedAt?: Date;
  lastExecuted?: Date;
  executionCount: number;
  successCount: number;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModuleExecution {
  id: string;
  moduleId: string;
  implantId: string;
  operatorId: string;
  capability: string;
  parameters: Record<string, any>;
  startTime: Date;
  endTime?: Date;
  status: ModuleStatus;
  result?: ModuleExecutionResult;
  error?: string;
  logs: ModuleExecutionLog[];
  resourceUsage?: ModuleResourceUsage;
}

export interface ModuleExecutionResult {
  success: boolean;
  data: any;
  type: string;
  size: number;
  checksum?: string;
  metadata?: Record<string, any>;
}

export interface ModuleExecutionLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, any>;
}

export interface ModuleResourceUsage {
  peakMemoryUsage: number; // bytes
  averageCpuUsage: number; // percentage
  networkBytesReceived: number;
  networkBytesSent: number;
  filesRead: number;
  filesWritten: number;
  registryKeysAccessed: number;
  processesCreated: number;
}

export interface ModuleLoadRequest {
  moduleId: string;
  implantId: string;
  operatorId: string;
  verifySignature?: boolean;
  sandboxed?: boolean;
  resourceLimits?: ModuleResourceLimits;
}

export interface ModuleResourceLimits {
  maxMemory?: number; // bytes
  maxCpuUsage?: number; // percentage
  maxExecutionTime?: number; // milliseconds
  maxNetworkConnections?: number;
  maxFileOperations?: number;
  maxRegistryOperations?: number;
  maxProcessCreations?: number;
}

export interface ModuleExecuteRequest {
  moduleId: string;
  implantId: string;
  operatorId: string;
  capability: string;
  parameters: Record<string, any>;
  timeout?: number;
  resourceLimits?: ModuleResourceLimits;
}

export interface ModuleUnloadRequest {
  moduleId: string;
  implantId: string;
  operatorId: string;
  force?: boolean;
}

export interface ModuleListFilter {
  category?: ModuleCategory;
  status?: ModuleStatus;
  author?: string;
  tags?: string[];
  namePattern?: string;
  loadedOnly?: boolean;
  implantId?: string;
}

export interface ModuleExecutionFilter {
  moduleId?: string;
  implantId?: string;
  operatorId?: string;
  status?: ModuleStatus;
  capability?: string;
  startDate?: Date;
  endDate?: Date;
}

// Built-in module interfaces for credential harvesting
export interface CredentialDumpResult {
  type: 'lsass' | 'sam' | 'browser' | 'registry' | 'memory' | 'file';
  credentials: Credential[];
  source: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface Credential {
  username: string;
  domain?: string;
  password?: string;
  hash?: string;
  hashType?: 'NTLM' | 'LM' | 'SHA1' | 'MD5' | 'Kerberos';
  source: string;
  confidence: number; // 0-100
  metadata?: Record<string, any>;
}

// Built-in module interfaces for network discovery
export interface NetworkDiscoveryResult {
  type: 'port_scan' | 'service_enum' | 'host_discovery' | 'ad_enum';
  hosts: DiscoveredHost[];
  networks: DiscoveredNetwork[];
  services: DiscoveredService[];
  timestamp: Date;
  scanDuration: number;
  metadata?: Record<string, any>;
}

export interface DiscoveredHost {
  ipAddress: string;
  hostname?: string;
  macAddress?: string;
  operatingSystem?: string;
  openPorts: number[];
  services: DiscoveredService[];
  isAlive: boolean;
  responseTime?: number;
  lastSeen: Date;
}

export interface DiscoveredNetwork {
  network: string;
  netmask: string;
  gateway?: string;
  dnsServers?: string[];
  dhcpServer?: string;
  vlan?: number;
  hostCount: number;
}

export interface DiscoveredService {
  port: number;
  protocol: 'tcp' | 'udp';
  service: string;
  version?: string;
  banner?: string;
  state: 'open' | 'closed' | 'filtered';
  confidence: number;
  vulnerabilities?: ServiceVulnerability[];
}

export interface ServiceVulnerability {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  cve?: string;
  exploitable: boolean;
}

// Module sandbox configuration
export interface ModuleSandboxConfig {
  enabled: boolean;
  isolateNetwork: boolean;
  isolateFileSystem: boolean;
  isolateRegistry: boolean;
  isolateProcesses: boolean;
  allowedNetworkHosts?: string[];
  allowedFilePaths?: string[];
  allowedRegistryKeys?: string[];
  allowedProcesses?: string[];
  resourceLimits: ModuleResourceLimits;
  timeoutMs: number;
}

// Module loader events
export interface ModuleEvent {
  type: string;
  moduleId: string;
  implantId?: string;
  operatorId?: string;
  timestamp: Date;
  data: Record<string, any>;
}

export interface ModuleLoadedEvent extends ModuleEvent {
  type: 'module_loaded';
  data: {
    moduleName: string;
    category: ModuleCategory;
    loadTime: number;
    sandboxed: boolean;
  };
}

export interface ModuleUnloadedEvent extends ModuleEvent {
  type: 'module_unloaded';
  data: {
    moduleName: string;
    uptime: number;
    executionCount: number;
  };
}

export interface ModuleExecutionStartedEvent extends ModuleEvent {
  type: 'module_execution_started';
  data: {
    moduleName: string;
    capability: string;
    parameters: Record<string, any>;
  };
}

export interface ModuleExecutionCompletedEvent extends ModuleEvent {
  type: 'module_execution_completed';
  data: {
    moduleName: string;
    capability: string;
    success: boolean;
    duration: number;
    resultSize?: number;
  };
}

export interface ModuleExecutionFailedEvent extends ModuleEvent {
  type: 'module_execution_failed';
  data: {
    moduleName: string;
    capability: string;
    error: string;
    duration: number;
  };
}
