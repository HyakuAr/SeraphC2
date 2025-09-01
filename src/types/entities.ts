/**
 * Core entity interfaces for SeraphC2
 * Based on the design document data models
 */

export enum ImplantStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISCONNECTED = 'disconnected',
  COMPROMISED = 'compromised',
}

export enum PrivilegeLevel {
  USER = 'user',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

export enum Protocol {
  HTTP = 'http',
  HTTPS = 'https',
  DNS = 'dns',
  SMB = 'smb',
  WEBSOCKET = 'websocket',
}

export enum OperatorRole {
  READ_ONLY = 'read_only',
  OPERATOR = 'operator',
  ADMINISTRATOR = 'administrator',
}

export enum CommandType {
  SHELL = 'shell',
  POWERSHELL = 'powershell',
  POWERSHELL_SCRIPT = 'powershell_script',
  POWERSHELL_MODULE_LOAD = 'powershell_module_load',
  POWERSHELL_MODULE_LIST = 'powershell_module_list',
  FILE_UPLOAD = 'file_upload',
  FILE_UPLOAD_CHUNK = 'file_upload_chunk',
  FILE_UPLOAD_FINALIZE = 'file_upload_finalize',
  FILE_DOWNLOAD = 'file_download',
  FILE_LIST = 'file_list',
  FILE_DELETE = 'file_delete',
  FILE_RENAME = 'file_rename',
  FILE_COPY = 'file_copy',
  FILE_CHECKSUM = 'file_checksum',
  FILE_INTEGRITY_CHECK = 'file_integrity_check',
  SYSTEM_INFO = 'system_info',
  PROCESS_LIST = 'process_list',
  PROCESS_KILL = 'process_kill',
  PROCESS_SUSPEND = 'process_suspend',
  PROCESS_RESUME = 'process_resume',
  SERVICE_LIST = 'service_list',
  SERVICE_START = 'service_start',
  SERVICE_STOP = 'service_stop',
  SERVICE_RESTART = 'service_restart',
  SERVICE_CONFIG = 'service_config',
  SYSTEM_RESOURCES = 'system_resources',
  SCREENSHOT = 'screenshot',
  SCREEN_STREAM_START = 'screen_stream_start',
  SCREEN_STREAM_STOP = 'screen_stream_stop',
  SCREEN_STREAM_CONFIG = 'screen_stream_config',
  SCREEN_MONITORS = 'screen_monitors',
  REMOTE_DESKTOP_MOUSE_CLICK = 'remote_desktop_mouse_click',
  REMOTE_DESKTOP_MOUSE_MOVE = 'remote_desktop_mouse_move',
  REMOTE_DESKTOP_KEY_INPUT = 'remote_desktop_key_input',
  REMOTE_DESKTOP_DISABLE_INPUT = 'remote_desktop_disable_input',
  REMOTE_DESKTOP_ENABLE_INPUT = 'remote_desktop_enable_input',
}

export enum CommandStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
}

export interface SystemInformation {
  hostname: string;
  operatingSystem: string;
  architecture: string;
  processorInfo: string;
  memoryTotal: number;
  diskSpace: number;
  networkInterfaces: string[];
  installedSoftware: string[];
  runningProcesses: number;
}

export interface ImplantConfig {
  callbackInterval: number;
  jitter: number;
  maxRetries: number;
  killDate?: Date;
  workingHours?: {
    start: string;
    end: string;
  };
}

export interface Implant {
  id: string;
  hostname: string;
  username: string;
  operatingSystem: string;
  architecture: string;
  privileges: PrivilegeLevel;
  lastSeen: Date;
  status: ImplantStatus;
  communicationProtocol: Protocol;
  encryptionKey: string;
  configuration: ImplantConfig;
  systemInfo: SystemInformation;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  resource: string;
  actions: string[];
}

export interface Operator {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: OperatorRole;
  permissions: Permission[];
  lastLogin?: Date | undefined;
  isActive: boolean;
  sessionToken?: string | undefined;
  totpSecret?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  powershellOutput?: PowerShellOutput;
}

export interface PowerShellOutput {
  objects?: any[];
  warnings?: string[];
  errors?: PowerShellError[];
  verbose?: string[];
  debug?: string[];
  information?: string[];
  progress?: PowerShellProgress[];
  formatted?: string;
}

export interface PowerShellError {
  message: string;
  categoryInfo: string;
  fullyQualifiedErrorId: string;
  scriptStackTrace?: string;
  targetObject?: string;
}

export interface PowerShellProgress {
  activity: string;
  statusDescription: string;
  currentOperation?: string;
  percentComplete?: number;
}

export interface Command {
  id: string;
  implantId: string;
  operatorId: string;
  type: CommandType;
  payload: string;
  timestamp: Date;
  status: CommandStatus;
  result?: CommandResult;
  executionTime?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Database entity interfaces (for repository pattern)
export interface CreateImplantData {
  hostname: string;
  username: string;
  operatingSystem: string;
  architecture: string;
  privileges: PrivilegeLevel;
  communicationProtocol: Protocol;
  encryptionKey: string;
  configuration: ImplantConfig;
  systemInfo: SystemInformation;
}

export interface UpdateImplantData {
  lastSeen?: Date;
  status?: ImplantStatus;
  communicationProtocol?: Protocol;
  configuration?: ImplantConfig;
  systemInfo?: SystemInformation;
}

export interface CreateOperatorData {
  username: string;
  email: string;
  passwordHash: string;
  role: OperatorRole;
  permissions?: Permission[];
}

export interface UpdateOperatorData {
  email?: string;
  passwordHash?: string;
  role?: OperatorRole;
  permissions?: Permission[];
  lastLogin?: Date;
  isActive?: boolean;
  sessionToken?: string | undefined;
  totpSecret?: string | undefined;
}

export interface CreateCommandData {
  implantId: string;
  operatorId: string;
  type: CommandType;
  payload: string;
}

export interface UpdateCommandData {
  status?: CommandStatus;
  result?: CommandResult;
  executionTime?: number;
}

// File operation interfaces
export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  permissions: string;
  lastModified: Date;
  owner?: string;
}

export interface DirectoryListing {
  path: string;
  files: FileInfo[];
  totalSize: number;
  totalFiles: number;
  totalDirectories: number;
}

export interface FileUploadRequest {
  implantId: string;
  remotePath: string;
  fileName: string;
  fileSize: number;
  checksum?: string;
}

export interface FileDownloadRequest {
  implantId: string;
  remotePath: string;
  checksum?: boolean;
}

export interface FileOperationRequest {
  implantId: string;
  operation: 'delete' | 'rename' | 'copy';
  sourcePath: string;
  destinationPath?: string; // Required for rename and copy
}

export interface FileTransferProgress {
  transferId: string;
  fileName: string;
  totalSize: number;
  transferredSize: number;
  progress: number;
  speed: number; // bytes per second
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled' | 'paused';
  error?: string;
  checksum?: string;
  resumable?: boolean;
  chunks?: FileChunk[];
}

export interface FileChunk {
  index: number;
  offset: number;
  size: number;
  checksum: string;
  status: 'pending' | 'transferring' | 'completed' | 'failed';
}

export interface FileIntegrityCheck {
  fileName: string;
  expectedChecksum: string;
  actualChecksum: string;
  isValid: boolean;
  algorithm: 'md5' | 'sha1' | 'sha256';
}

// PowerShell-specific interfaces
export interface PowerShellScript {
  id: string;
  name: string;
  description?: string | undefined;
  content: string;
  parameters?: PowerShellParameter[];
  tags?: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PowerShellParameter {
  name: string;
  type: string;
  mandatory: boolean;
  defaultValue?: any;
  description?: string | undefined;
  validateSet?: string[];
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

export interface PowerShellFavorite {
  id: string;
  name: string;
  command: string;
  description?: string | undefined;
  category?: string | undefined;
  operatorId: string;
  createdAt: Date;
  usageCount: number;
  lastUsed?: Date;
}

export interface PowerShellExecutionPolicy {
  scope: 'MachinePolicy' | 'UserPolicy' | 'Process' | 'CurrentUser' | 'LocalMachine';
  policy: 'Restricted' | 'AllSigned' | 'RemoteSigned' | 'Unrestricted' | 'Bypass' | 'Undefined';
}

export interface PowerShellSession {
  id: string;
  implantId: string;
  operatorId: string;
  sessionState: 'Active' | 'Broken' | 'Closed';
  runspaceId?: string | undefined;
  modules: PowerShellModule[];
  variables: { [key: string]: any };
  executionPolicy: PowerShellExecutionPolicy[];
  createdAt: Date;
  lastActivity: Date;
}

export interface ImplantSession {
  id: string;
  implantId: string;
  isActive: boolean;
  lastActivity: Date;
  lastHeartbeat: Date;
  connectionInfo: {
    protocol: Protocol;
    remoteAddress: string;
    userAgent?: string;
  };
}

// Process and Service Management interfaces
export interface ProcessInfo {
  pid: number;
  name: string;
  executablePath: string;
  commandLine?: string;
  parentPid?: number;
  sessionId: number;
  cpuUsage: number;
  memoryUsage: number; // in bytes
  workingSet: number; // in bytes
  handles: number;
  threads: number;
  startTime: Date;
  owner?: string;
  architecture?: string;
  status: 'Running' | 'Suspended' | 'NotResponding';
}

export interface ServiceInfo {
  name: string;
  displayName: string;
  description?: string;
  status:
    | 'Running'
    | 'Stopped'
    | 'Paused'
    | 'StartPending'
    | 'StopPending'
    | 'ContinuePending'
    | 'PausePending';
  startType: 'Automatic' | 'Manual' | 'Disabled' | 'DelayedAutoStart';
  serviceType:
    | 'Win32OwnProcess'
    | 'Win32ShareProcess'
    | 'KernelDriver'
    | 'FileSystemDriver'
    | 'InteractiveProcess';
  executablePath?: string;
  logOnAs?: string;
  dependencies?: string[];
  dependents?: string[];
  canStop: boolean;
  canPauseAndContinue: boolean;
}

export interface SystemResources {
  cpu: {
    usage: number; // percentage
    cores: number;
    processes: number;
    threads: number;
  };
  memory: {
    totalPhysical: number; // bytes
    availablePhysical: number; // bytes
    usedPhysical: number; // bytes
    totalVirtual: number; // bytes
    availableVirtual: number; // bytes
    usedVirtual: number; // bytes
    pageFileUsage: number; // bytes
  };
  disk: {
    drives: DiskInfo[];
  };
  network: {
    interfaces: NetworkInterfaceInfo[];
    totalBytesReceived: number;
    totalBytesSent: number;
  };
  uptime: number; // seconds
  timestamp: Date;
}

export interface DiskInfo {
  drive: string;
  label?: string;
  fileSystem: string;
  totalSize: number; // bytes
  freeSpace: number; // bytes
  usedSpace: number; // bytes
  usagePercentage: number;
}

export interface NetworkInterfaceInfo {
  name: string;
  description: string;
  type: string;
  status: 'Up' | 'Down' | 'Testing' | 'Unknown' | 'Dormant' | 'NotPresent' | 'LowerLayerDown';
  speed: number; // bits per second
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
  ipAddresses: string[];
  macAddress?: string;
}

export interface ProcessManagementRequest {
  implantId: string;
  operation: 'list' | 'kill' | 'suspend' | 'resume';
  processId?: number;
  processName?: string;
  filter?: ProcessFilter;
}

export interface ProcessFilter {
  name?: string;
  owner?: string;
  minCpuUsage?: number;
  minMemoryUsage?: number;
  status?: 'Running' | 'Suspended' | 'NotResponding';
}

export interface ServiceManagementRequest {
  implantId: string;
  operation: 'list' | 'start' | 'stop' | 'restart' | 'config';
  serviceName?: string;
  config?: ServiceConfig;
  filter?: ServiceFilter;
}

export interface ServiceConfig {
  startType?: 'Automatic' | 'Manual' | 'Disabled' | 'DelayedAutoStart';
  displayName?: string;
  description?: string;
  logOnAs?: string;
  password?: string;
}

export interface ServiceFilter {
  name?: string;
  status?: 'Running' | 'Stopped' | 'Paused';
  startType?: 'Automatic' | 'Manual' | 'Disabled';
}

// Screen Monitoring interfaces
export interface MonitorInfo {
  id: number;
  name: string;
  isPrimary: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
  workingAreaWidth: number;
  workingAreaHeight: number;
  workingAreaX: number;
  workingAreaY: number;
  bitsPerPixel: number;
}

export interface ScreenStreamConfig {
  monitorId?: number; // If not specified, capture primary monitor
  quality: number; // 1-100, JPEG quality
  frameRate: number; // frames per second (1-30)
  width?: number; // Optional resize width
  height?: number; // Optional resize height
  captureMouseCursor: boolean;
}

export interface ScreenStreamFrame {
  frameId: number;
  timestamp: Date;
  monitorId: number;
  width: number;
  height: number;
  imageData: string; // Base64 encoded JPEG
  size: number; // Size in bytes
}

export interface ScreenStreamStatus {
  isActive: boolean;
  monitorId: number;
  config: ScreenStreamConfig;
  frameCount: number;
  totalDataSent: number; // bytes
  averageFrameSize: number; // bytes
  actualFrameRate: number; // actual fps
  startTime?: Date;
  lastFrameTime?: Date;
}

export interface ScreenshotRequest {
  implantId: string;
  monitorId?: number; // If not specified, capture primary monitor
  quality?: number; // 1-100, default 75
  width?: number; // Optional resize width
  height?: number; // Optional resize height
  captureMouseCursor?: boolean; // default true
}

export interface ScreenshotResult {
  monitorId: number;
  width: number;
  height: number;
  imageData: string; // Base64 encoded JPEG
  size: number; // Size in bytes
  timestamp: Date;
  capturedMouseCursor: boolean;
}

// Remote Desktop Interaction interfaces
export interface MouseClickEvent {
  x: number;
  y: number;
  button: 'left' | 'right' | 'middle';
  action: 'down' | 'up' | 'click' | 'double_click';
  monitorId?: number;
}

export interface MouseMoveEvent {
  x: number;
  y: number;
  monitorId?: number;
}

export interface KeyboardEvent {
  key: string;
  action: 'down' | 'up' | 'press';
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    win?: boolean;
  };
}

export interface RemoteDesktopConfig {
  enableMouseInput: boolean;
  enableKeyboardInput: boolean;
  disableLocalInput: boolean;
  mouseSensitivity: number; // 0.1 to 2.0
  keyboardLayout?: string;
}

export interface RemoteDesktopStatus {
  isActive: boolean;
  mouseInputEnabled: boolean;
  keyboardInputEnabled: boolean;
  localInputDisabled: boolean;
  config: RemoteDesktopConfig;
  lastInputTime?: Date;
  inputCount: number;
}
