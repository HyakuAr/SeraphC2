/**
 * Multi-operator collaboration types for SeraphC2
 * Implements requirements 16.2, 16.3, 16.6, 16.7
 */

export interface OperatorPresence {
  operatorId: string;
  username: string;
  role: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  lastActivity: Date;
  currentImplant?: string | undefined;
  currentAction?: string | undefined;
  socketId?: string | undefined;
}

export interface OperatorMessage {
  id: string;
  fromOperatorId: string;
  toOperatorId?: string | undefined; // undefined for broadcast messages
  message: string;
  timestamp: Date;
  type: 'direct' | 'broadcast' | 'system';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: {
    implantId?: string;
    commandId?: string;
    sessionId?: string;
  };
}

export interface SessionConflict {
  id: string;
  implantId: string;
  conflictType: 'concurrent_access' | 'command_execution' | 'file_operation' | 'screen_control';
  primaryOperatorId: string;
  conflictingOperatorId: string;
  timestamp: Date;
  status: 'active' | 'resolved' | 'escalated';
  resolution?: 'takeover' | 'queue' | 'abort' | 'share';
  resolvedBy?: string;
  resolvedAt?: Date;
}

export interface ActivityLog {
  id: string;
  operatorId: string;
  username: string;
  action: string;
  resource: string;
  resourceId?: string | undefined;
  details?: any;
  timestamp: Date;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  sessionId?: string | undefined;
  implantId?: string | undefined;
  success: boolean;
  error?: string | undefined;
}

export interface SessionTakeover {
  id: string;
  targetOperatorId: string;
  adminOperatorId: string;
  implantId?: string | undefined;
  reason: string;
  timestamp: Date;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  notificationSent: boolean;
  originalSessionData?: any;
}

export interface CollaborationEvent {
  type: 'presence_update' | 'message' | 'conflict' | 'takeover' | 'activity';
  data: OperatorPresence | OperatorMessage | SessionConflict | SessionTakeover | ActivityLog;
  timestamp: Date;
  operatorId?: string;
}

export interface ImplantLock {
  implantId: string;
  operatorId: string;
  username: string;
  lockType: 'exclusive' | 'shared';
  action: string;
  timestamp: Date;
  expiresAt: Date;
  metadata?: any;
}

export interface OperatorSession {
  operatorId: string;
  username: string;
  role: string;
  socketId: string;
  connectedAt: Date;
  lastActivity: Date;
  currentImplant?: string | undefined;
  currentAction?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}
