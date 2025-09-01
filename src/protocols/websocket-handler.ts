import { ProtocolMessage, BaseProtocolHandler, ProtocolConfig, ConnectionInfo } from './interfaces';
import { Protocol } from '../types/entities';
import { Logger } from '../utils/logger';

export class WebSocketHandler extends BaseProtocolHandler {
  private server: any;
  private implantSockets: Map<string, any> = new Map();

  constructor(config: ProtocolConfig = { enabled: true }) {
    super(Protocol.WEBSOCKET, config);
    this.logger = new Logger('websocket-handler' as any);
  }

  async start(port: number = 8080): Promise<void> {
    try {
      this.logger.info('Starting WebSocket handler', { port });
      this.isRunning = true;
      this.emit('started');
    } catch (error) {
      this.logger.error(
        'Error occurred',
        error instanceof Error ? error : new Error('Unknown error'),
        {}
      );
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping WebSocket handler');
      this.isRunning = false;
      this.emit('stopped');
    } catch (error) {
      this.logger.error(
        'Error occurred',
        error instanceof Error ? error : new Error('Unknown error'),
        {}
      );
      throw error;
    }
  }

  isEnabled(): boolean {
    return this.isRunning;
  }

  async sendMessage(implantId: string, message: ProtocolMessage): Promise<boolean> {
    try {
      this.logger.debug('Sending message', { implantId, messageId: message.id });
      return true;
    } catch (error) {
      this.logger.error(
        'Error occurred',
        error instanceof Error ? error : new Error('Unknown error'),
        {}
      );
      return false;
    }
  }

  async broadcastMessage(message: ProtocolMessage): Promise<number> {
    let successCount = 0;

    for (const implantId of this.implantSockets.keys()) {
      if (await this.sendMessage(implantId, message)) {
        successCount++;
      }
    }

    return successCount;
  }

  disconnectImplant(implantId: string, reason: string = 'Server disconnect'): void {
    const socket = this.implantSockets.get(implantId);
    if (socket) {
      this.implantSockets.delete(implantId);
      this.emit('implantDisconnected', { implantId, reason });
    }
  }

  getConnectionInfo(implantId: string): ConnectionInfo | null {
    const socket = this.implantSockets.get(implantId);
    if (!socket) {
      return null;
    }

    return {
      protocol: Protocol.WEBSOCKET,
      remoteAddress: socket.remoteAddress || 'unknown',
      connectedAt: new Date(), // Should be stored when connection is established
      lastActivity: new Date(),
      isActive: true,
    };
  }

  isImplantConnected(implantId: string): boolean {
    return this.implantSockets.has(implantId);
  }
}
