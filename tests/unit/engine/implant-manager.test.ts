/**
 * Unit tests for ImplantManager
 */

import {
  ImplantManager,
  ImplantRegistrationData,
  HeartbeatData,
} from '../../../src/core/engine/implant-manager';
import { ImplantRepository } from '../../../src/core/repositories/interfaces';
import {
  Implant,
  ImplantStatus,
  PrivilegeLevel,
  Protocol,
  CreateImplantData,
  UpdateImplantData,
} from '../../../src/types/entities';

// Mock repository
class MockImplantRepository implements ImplantRepository {
  private implants: Map<string, Implant> = new Map();
  private idCounter = 1;

  async create(data: CreateImplantData): Promise<Implant> {
    const implant: Implant = {
      id: `implant-${this.idCounter++}`,
      ...data,
      lastSeen: new Date(),
      status: ImplantStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.implants.set(implant.id, implant);
    return implant;
  }

  async findById(id: string): Promise<Implant | null> {
    return this.implants.get(id) || null;
  }

  async findAll(): Promise<Implant[]> {
    return Array.from(this.implants.values());
  }

  async update(id: string, data: UpdateImplantData): Promise<Implant | null> {
    const implant = this.implants.get(id);
    if (!implant) return null;

    const updated = { ...implant, ...data, updatedAt: new Date() };
    this.implants.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.implants.delete(id);
  }

  async findByHostname(hostname: string): Promise<Implant[]> {
    return Array.from(this.implants.values()).filter(i => i.hostname === hostname);
  }

  async findByStatus(status: ImplantStatus): Promise<Implant[]> {
    return Array.from(this.implants.values()).filter(i => i.status === status);
  }

  async findActiveImplants(): Promise<Implant[]> {
    return this.findByStatus(ImplantStatus.ACTIVE);
  }

  async findInactiveImplants(thresholdMinutes: number): Promise<Implant[]> {
    const threshold = new Date(Date.now() - thresholdMinutes * 60000);
    return Array.from(this.implants.values()).filter(i => i.lastSeen < threshold);
  }

  async updateLastSeen(id: string): Promise<void> {
    const implant = this.implants.get(id);
    if (implant) {
      implant.lastSeen = new Date();
      implant.updatedAt = new Date();
    }
  }

  async updateStatus(id: string, status: ImplantStatus): Promise<void> {
    const implant = this.implants.get(id);
    if (implant) {
      implant.status = status;
      implant.updatedAt = new Date();
    }
  }

  async getImplantCount(): Promise<number> {
    return this.implants.size;
  }

  async getImplantsByProtocol(protocol: string): Promise<Implant[]> {
    return Array.from(this.implants.values()).filter(i => i.communicationProtocol === protocol);
  }
}

describe('ImplantManager', () => {
  let implantManager: ImplantManager;
  let mockRepository: MockImplantRepository;

  beforeEach(() => {
    mockRepository = new MockImplantRepository();
    implantManager = new ImplantManager(mockRepository, 1000, 5000); // Short intervals for testing
  });

  afterEach(() => {
    implantManager.stop();
  });

  describe('registerImplant', () => {
    it('should register a new implant successfully', async () => {
      const registrationData: ImplantRegistrationData = {
        hostname: 'test-host',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: 'test-key',
        configuration: {
          callbackInterval: 30000,
          jitter: 0.1,
          maxRetries: 3,
        },
        systemInfo: {
          hostname: 'test-host',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel Core i7',
          memoryTotal: 16777216,
          diskSpace: 1073741824,
          networkInterfaces: ['Ethernet'],
          installedSoftware: ['Chrome', 'Firefox'],
          runningProcesses: 150,
        },
        remoteAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
      };

      const implant = await implantManager.registerImplant(registrationData);

      expect(implant).toBeDefined();
      expect(implant.hostname).toBe('test-host');
      expect(implant.status).toBe(ImplantStatus.ACTIVE);

      // Check that session was created
      const session = implantManager.getImplantSession(implant.id);
      expect(session).toBeDefined();
      expect(session?.implantId).toBe(implant.id);
      expect(session?.isActive).toBe(true);
    });

    it('should update existing implant on re-registration', async () => {
      const registrationData: ImplantRegistrationData = {
        hostname: 'test-host',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: 'test-key',
        configuration: {
          callbackInterval: 30000,
          jitter: 0.1,
          maxRetries: 3,
        },
        systemInfo: {
          hostname: 'test-host',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel Core i7',
          memoryTotal: 16777216,
          diskSpace: 1073741824,
          networkInterfaces: ['Ethernet'],
          installedSoftware: ['Chrome', 'Firefox'],
          runningProcesses: 150,
        },
        remoteAddress: '192.168.1.100',
      };

      // Register first time
      const implant1 = await implantManager.registerImplant(registrationData);

      // Register again with updated protocol
      const updatedData = {
        ...registrationData,
        communicationProtocol: Protocol.DNS,
      };
      const implant2 = await implantManager.registerImplant(updatedData);

      expect(implant1.id).toBe(implant2.id);
      expect(implant2.communicationProtocol).toBe(Protocol.DNS);
    });

    it('should emit implantRegistered event', async () => {
      const registrationData: ImplantRegistrationData = {
        hostname: 'test-host',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: 'test-key',
        configuration: {
          callbackInterval: 30000,
          jitter: 0.1,
          maxRetries: 3,
        },
        systemInfo: {
          hostname: 'test-host',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel Core i7',
          memoryTotal: 16777216,
          diskSpace: 1073741824,
          networkInterfaces: ['Ethernet'],
          installedSoftware: ['Chrome', 'Firefox'],
          runningProcesses: 150,
        },
        remoteAddress: '192.168.1.100',
      };

      const eventPromise = new Promise(resolve => {
        implantManager.once('implantRegistered', resolve);
      });

      await implantManager.registerImplant(registrationData);
      const event = await eventPromise;

      expect(event).toBeDefined();
    });
  });

  describe('processHeartbeat', () => {
    let implant: Implant;

    beforeEach(async () => {
      const registrationData: ImplantRegistrationData = {
        hostname: 'test-host',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: 'test-key',
        configuration: {
          callbackInterval: 30000,
          jitter: 0.1,
          maxRetries: 3,
        },
        systemInfo: {
          hostname: 'test-host',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel Core i7',
          memoryTotal: 16777216,
          diskSpace: 1073741824,
          networkInterfaces: ['Ethernet'],
          installedSoftware: ['Chrome', 'Firefox'],
          runningProcesses: 150,
        },
        remoteAddress: '192.168.1.100',
      };

      implant = await implantManager.registerImplant(registrationData);
    });

    it('should process heartbeat successfully', async () => {
      const heartbeatData: HeartbeatData = {
        implantId: implant.id,
        protocol: Protocol.HTTPS,
        remoteAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
      };

      await implantManager.processHeartbeat(heartbeatData);

      const session = implantManager.getImplantSession(implant.id);
      expect(session).toBeDefined();
      expect(session?.isActive).toBe(true);
    });

    it('should update system info when provided', async () => {
      const updatedSystemInfo = {
        hostname: 'test-host',
        operatingSystem: 'Windows 11',
        architecture: 'x64',
        processorInfo: 'Intel Core i9',
        memoryTotal: 33554432,
        diskSpace: 2147483648,
        networkInterfaces: ['Ethernet', 'WiFi'],
        installedSoftware: ['Chrome', 'Firefox', 'Edge'],
        runningProcesses: 200,
      };

      const heartbeatData: HeartbeatData = {
        implantId: implant.id,
        protocol: Protocol.HTTPS,
        remoteAddress: '192.168.1.100',
        systemInfo: updatedSystemInfo,
      };

      await implantManager.processHeartbeat(heartbeatData);

      const updatedImplant = await implantManager.getImplant(implant.id);
      expect(updatedImplant?.systemInfo.operatingSystem).toBe('Windows 11');
      expect(updatedImplant?.systemInfo.processorInfo).toBe('Intel Core i9');
    });

    it('should emit heartbeatReceived event', async () => {
      const heartbeatData: HeartbeatData = {
        implantId: implant.id,
        protocol: Protocol.HTTPS,
        remoteAddress: '192.168.1.100',
      };

      const eventPromise = new Promise(resolve => {
        implantManager.once('heartbeatReceived', resolve);
      });

      await implantManager.processHeartbeat(heartbeatData);
      const event = await eventPromise;

      expect(event).toBeDefined();
    });
  });

  describe('session management', () => {
    let implant: Implant;

    beforeEach(async () => {
      const registrationData: ImplantRegistrationData = {
        hostname: 'test-host',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: 'test-key',
        configuration: {
          callbackInterval: 30000,
          jitter: 0.1,
          maxRetries: 3,
        },
        systemInfo: {
          hostname: 'test-host',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel Core i7',
          memoryTotal: 16777216,
          diskSpace: 1073741824,
          networkInterfaces: ['Ethernet'],
          installedSoftware: ['Chrome', 'Firefox'],
          runningProcesses: 150,
        },
        remoteAddress: '192.168.1.100',
      };

      implant = await implantManager.registerImplant(registrationData);
    });

    it('should check if implant is active', () => {
      expect(implantManager.isImplantActive(implant.id)).toBe(true);
    });

    it('should get active sessions', () => {
      const sessions = implantManager.getActiveSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.implantId).toBe(implant.id);
    });

    it('should disconnect implant', async () => {
      await implantManager.disconnectImplant(implant.id, 'Test disconnect');

      expect(implantManager.isImplantActive(implant.id)).toBe(false);
      const session = implantManager.getImplantSession(implant.id);
      expect(session).toBeNull();

      const updatedImplant = await implantManager.getImplant(implant.id);
      expect(updatedImplant?.status).toBe(ImplantStatus.DISCONNECTED);
    });

    it('should emit implantDisconnected event', async () => {
      const eventPromise = new Promise(resolve => {
        implantManager.once('implantDisconnected', resolve);
      });

      await implantManager.disconnectImplant(implant.id, 'Test disconnect');
      const event = await eventPromise;

      expect(event).toBeDefined();
    });
  });

  describe('statistics', () => {
    it('should get implant statistics', async () => {
      // Register multiple implants with different statuses
      const registrationData: ImplantRegistrationData = {
        hostname: 'test-host-1',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: 'test-key',
        configuration: {
          callbackInterval: 30000,
          jitter: 0.1,
          maxRetries: 3,
        },
        systemInfo: {
          hostname: 'test-host-1',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel Core i7',
          memoryTotal: 16777216,
          diskSpace: 1073741824,
          networkInterfaces: ['Ethernet'],
          installedSoftware: ['Chrome', 'Firefox'],
          runningProcesses: 150,
        },
        remoteAddress: '192.168.1.100',
      };

      await implantManager.registerImplant(registrationData);

      const implant2 = await implantManager.registerImplant({
        ...registrationData,
        hostname: 'test-host-2',
      });

      // Disconnect one implant
      await implantManager.disconnectImplant(implant2.id);

      const stats = await implantManager.getImplantStats();

      expect(stats.total).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.disconnected).toBe(1);
    });
  });

  describe('heartbeat monitoring', () => {
    it('should mark implants as inactive after threshold', async () => {
      // Use very short thresholds for testing
      const testManager = new ImplantManager(mockRepository, 100, 200);

      const registrationData: ImplantRegistrationData = {
        hostname: 'test-host',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: 'test-key',
        configuration: {
          callbackInterval: 30000,
          jitter: 0.1,
          maxRetries: 3,
        },
        systemInfo: {
          hostname: 'test-host',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel Core i7',
          memoryTotal: 16777216,
          diskSpace: 1073741824,
          networkInterfaces: ['Ethernet'],
          installedSoftware: ['Chrome', 'Firefox'],
          runningProcesses: 150,
        },
        remoteAddress: '192.168.1.100',
      };

      const implant = await testManager.registerImplant(registrationData);

      // Wait for inactivity threshold
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(testManager.isImplantActive(implant.id)).toBe(false);

      testManager.stop();
    });

    it('should emit implantInactive event', async () => {
      const testManager = new ImplantManager(mockRepository, 100, 200);

      const registrationData: ImplantRegistrationData = {
        hostname: 'test-host',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: 'test-key',
        configuration: {
          callbackInterval: 30000,
          jitter: 0.1,
          maxRetries: 3,
        },
        systemInfo: {
          hostname: 'test-host',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel Core i7',
          memoryTotal: 16777216,
          diskSpace: 1073741824,
          networkInterfaces: ['Ethernet'],
          installedSoftware: ['Chrome', 'Firefox'],
          runningProcesses: 150,
        },
        remoteAddress: '192.168.1.100',
      };

      const eventPromise = new Promise(resolve => {
        testManager.once('implantInactive', resolve);
      });

      await testManager.registerImplant(registrationData);

      // Wait for inactivity threshold
      const event = await eventPromise;
      expect(event).toBeDefined();

      testManager.stop();
    });
  });
});
