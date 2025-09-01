/**
 * Implant repository tests
 */

import { PostgresImplantRepository } from '../../../src/core/repositories/implant.repository';
import { DatabaseConnection } from '../../../src/core/database/connection';
import {
  ImplantStatus,
  PrivilegeLevel,
  Protocol,
  CreateImplantData,
} from '../../../src/types/entities';

// Mock DatabaseConnection
jest.mock('../../../src/core/database/connection');

describe('PostgresImplantRepository', () => {
  let repository: PostgresImplantRepository;
  let mockDb: jest.Mocked<DatabaseConnection>;

  const mockImplantRow = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    hostname: 'test-host',
    username: 'test-user',
    operating_system: 'Windows 10',
    architecture: 'x64',
    privileges: 'user',
    last_seen: '2023-01-01T00:00:00Z',
    status: 'active',
    communication_protocol: 'https',
    encryption_key: 'test-key',
    configuration: { callbackInterval: 5000, jitter: 10, maxRetries: 3 },
    system_info: { hostname: 'test-host', processorInfo: 'Intel i7' },
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  const mockCreateData: CreateImplantData = {
    hostname: 'test-host',
    username: 'test-user',
    operatingSystem: 'Windows 10',
    architecture: 'x64',
    privileges: PrivilegeLevel.USER,
    communicationProtocol: Protocol.HTTPS,
    encryptionKey: 'test-key',
    configuration: { callbackInterval: 5000, jitter: 10, maxRetries: 3 },
    systemInfo: {
      hostname: 'test-host',
      operatingSystem: 'Windows 10',
      architecture: 'x64',
      processorInfo: 'Intel i7',
      memoryTotal: 8192,
      diskSpace: 500000,
      networkInterfaces: ['eth0'],
      installedSoftware: ['Chrome'],
      runningProcesses: 150,
    },
  };

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [mockImplantRow], rowCount: 1 }),
    } as any;

    (DatabaseConnection.getInstance as jest.Mock).mockReturnValue(mockDb);

    repository = new PostgresImplantRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create new implant successfully', async () => {
      const result = await repository.create(mockCreateData);

      expect(result).toEqual({
        id: mockImplantRow.id,
        hostname: mockImplantRow.hostname,
        username: mockImplantRow.username,
        operatingSystem: mockImplantRow.operating_system,
        architecture: mockImplantRow.architecture,
        privileges: PrivilegeLevel.USER,
        lastSeen: new Date(mockImplantRow.last_seen),
        status: ImplantStatus.ACTIVE,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: mockImplantRow.encryption_key,
        configuration: mockImplantRow.configuration,
        systemInfo: mockImplantRow.system_info,
        createdAt: new Date(mockImplantRow.created_at),
        updatedAt: new Date(mockImplantRow.updated_at),
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO implants'),
        expect.arrayContaining([
          mockCreateData.hostname,
          mockCreateData.username,
          mockCreateData.operatingSystem,
          mockCreateData.architecture,
          mockCreateData.privileges,
          mockCreateData.communicationProtocol,
          mockCreateData.encryptionKey,
          JSON.stringify(mockCreateData.configuration),
          JSON.stringify(mockCreateData.systemInfo),
        ])
      );
    });
  });

  describe('findById', () => {
    it('should find implant by ID', async () => {
      const result = await repository.findById(mockImplantRow.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(mockImplantRow.id);
      expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM implants WHERE id = $1;', [
        mockImplantRow.id,
      ]);
    });

    it('should return null when implant not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all implants', async () => {
      mockDb.query.mockResolvedValue({ rows: [mockImplantRow] });

      const result = await repository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(mockImplantRow.id);
      expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM implants ORDER BY created_at DESC;');
    });
  });

  describe('update', () => {
    it('should update implant successfully', async () => {
      const updateData = { status: ImplantStatus.INACTIVE };

      const result = await repository.update(mockImplantRow.id, updateData);

      expect(result).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE implants'),
        expect.arrayContaining([ImplantStatus.INACTIVE, mockImplantRow.id])
      );
    });

    it('should return existing implant when no updates provided', async () => {
      const result = await repository.update(mockImplantRow.id, {});

      expect(result).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM implants WHERE id = $1;', [
        mockImplantRow.id,
      ]);
    });

    it('should return null when implant not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await repository.update('non-existent-id', { status: ImplantStatus.INACTIVE });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete implant successfully', async () => {
      const result = await repository.delete(mockImplantRow.id);

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith('DELETE FROM implants WHERE id = $1;', [
        mockImplantRow.id,
      ]);
    });

    it('should return false when implant not found', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 0 });

      const result = await repository.delete('non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('findByHostname', () => {
    it('should find implants by hostname', async () => {
      const result = await repository.findByHostname('test-host');

      expect(result).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM implants WHERE hostname = $1 ORDER BY created_at DESC;',
        ['test-host']
      );
    });
  });

  describe('findByStatus', () => {
    it('should find implants by status', async () => {
      const result = await repository.findByStatus(ImplantStatus.ACTIVE);

      expect(result).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM implants WHERE status = $1 ORDER BY last_seen DESC;',
        [ImplantStatus.ACTIVE]
      );
    });
  });

  describe('findActiveImplants', () => {
    it('should find active implants', async () => {
      const result = await repository.findActiveImplants();

      expect(result).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM implants WHERE status = $1 ORDER BY last_seen DESC;',
        [ImplantStatus.ACTIVE]
      );
    });
  });

  describe('findInactiveImplants', () => {
    it('should find inactive implants based on threshold', async () => {
      const result = await repository.findInactiveImplants(30);

      expect(result).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("last_seen < NOW() - INTERVAL '30 minutes'")
      );
    });
  });

  describe('updateLastSeen', () => {
    it('should update last seen timestamp', async () => {
      await repository.updateLastSeen(mockImplantRow.id);

      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE implants SET last_seen = NOW() WHERE id = $1;',
        [mockImplantRow.id]
      );
    });
  });

  describe('updateStatus', () => {
    it('should update implant status', async () => {
      await repository.updateStatus(mockImplantRow.id, ImplantStatus.INACTIVE);

      expect(mockDb.query).toHaveBeenCalledWith('UPDATE implants SET status = $1 WHERE id = $2;', [
        ImplantStatus.INACTIVE,
        mockImplantRow.id,
      ]);
    });
  });

  describe('getImplantCount', () => {
    it('should return total implant count', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ count: '5' }] });

      const result = await repository.getImplantCount();

      expect(result).toBe(5);
      expect(mockDb.query).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM implants;');
    });
  });

  describe('getImplantsByProtocol', () => {
    it('should find implants by communication protocol', async () => {
      const result = await repository.getImplantsByProtocol('https');

      expect(result).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM implants WHERE communication_protocol = $1 ORDER BY last_seen DESC;',
        ['https']
      );
    });
  });
});
