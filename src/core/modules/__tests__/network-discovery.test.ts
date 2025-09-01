/**
 * Tests for NetworkDiscoveryModule
 * Implements requirement 13.4 - Network discovery and scanning modules
 */

import { NetworkDiscoveryModule } from '../network-discovery.module';
import { ModuleCategory, ModuleExecutionMode } from '../../../types/modules';

describe('NetworkDiscoveryModule', () => {
  let module: NetworkDiscoveryModule;

  beforeEach(() => {
    module = new NetworkDiscoveryModule();
  });

  describe('getMetadata', () => {
    it('should return correct metadata', () => {
      const metadata = NetworkDiscoveryModule.getMetadata();

      expect(metadata.name).toBe('NetworkDiscovery');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.author).toBe('SeraphC2 Team');
      expect(metadata.category).toBe(ModuleCategory.NETWORK_DISCOVERY);
      expect(metadata.executionMode).toBe(ModuleExecutionMode.ASYNCHRONOUS);
      expect(metadata.capabilities).toHaveLength(6);

      // Check capabilities
      const capabilityNames = metadata.capabilities.map(c => c.name);
      expect(capabilityNames).toContain('scan_ports');
      expect(capabilityNames).toContain('discover_hosts');
      expect(capabilityNames).toContain('enumerate_services');
      expect(capabilityNames).toContain('enumerate_smb_shares');
      expect(capabilityNames).toContain('enumerate_dns');
      expect(capabilityNames).toContain('scan_web_directories');
    });

    it('should have proper network access requirements', () => {
      const metadata = NetworkDiscoveryModule.getMetadata();

      expect(metadata.networkAccess).toBe(true);
      expect(metadata.fileSystemAccess).toBe(false);
      expect(metadata.registryAccess).toBe(false);
      expect(metadata.processAccess).toBe(false);
    });
  });

  describe('scanPorts', () => {
    it('should scan ports with default parameters', async () => {
      const parameters = {
        targets: ['192.168.1.1', '192.168.1.2'],
      };

      const result = await module.scanPorts(parameters);

      expect(result.type).toBe('port_scan');
      expect(result.hosts).toBeInstanceOf(Array);
      expect(result.services).toBeInstanceOf(Array);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.scanDuration).toBeGreaterThan(0);
      expect(result.metadata).toBeDefined();
      expect((result.metadata as any)?.targets).toBe(2);
    });

    it('should scan ports with custom parameters', async () => {
      const parameters = {
        targets: ['192.168.1.1'],
        ports: ['80', '443', '22'],
        protocol: 'tcp',
        timeout: 5000,
        threads: 10,
      };

      const result = await module.scanPorts(parameters);

      expect(result.type).toBe('port_scan');
      expect((result.metadata as any)?.protocol).toBe('tcp');
      expect((result.metadata as any)?.timeout).toBe(5000);
      expect((result.metadata as any)?.threads).toBe(10);
    });

    it('should return discovered hosts with services', async () => {
      const parameters = {
        targets: ['192.168.1.1'],
      };

      const result = await module.scanPorts(parameters);

      // Check host structure if any hosts were found
      if (result.hosts.length > 0) {
        const host = result.hosts[0];
        if (host) {
          expect(host).toHaveProperty('ipAddress');
          expect(host).toHaveProperty('openPorts');
          expect(host).toHaveProperty('services');
          expect(host).toHaveProperty('isAlive');
          expect(host).toHaveProperty('lastSeen');
          expect(host.openPorts).toBeInstanceOf(Array);
          expect(host.services).toBeInstanceOf(Array);
        }
      }
    });
  });

  describe('discoverHosts', () => {
    it('should discover hosts in network ranges', async () => {
      const parameters = {
        networks: ['192.168.1.0/24'],
      };

      const result = await module.discoverHosts(parameters);

      expect(result.type).toBe('host_discovery');
      expect(result.hosts).toBeInstanceOf(Array);
      expect(result.networks).toBeInstanceOf(Array);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect((result.metadata as any)?.networks).toBe(1);
    });

    it('should support different discovery methods', async () => {
      const parameters = {
        networks: ['192.168.1.0/24'],
        methods: ['ping', 'arp'],
        timeout: 3000,
        resolve_hostnames: true,
      };

      const result = await module.discoverHosts(parameters);

      expect((result.metadata as any)?.methods).toEqual(['ping', 'arp']);
      expect((result.metadata as any)?.timeout).toBe(3000);
      expect((result.metadata as any)?.resolveHostnames).toBe(true);
    });

    it('should return network information', async () => {
      const parameters = {
        networks: ['192.168.1.0/24'],
      };

      const result = await module.discoverHosts(parameters);

      expect(result.networks.length).toBeGreaterThan(0);

      const network = result.networks[0];
      if (network) {
        expect(network).toHaveProperty('network');
        expect(network).toHaveProperty('netmask');
        expect(network).toHaveProperty('hostCount');
        expect(typeof network.hostCount).toBe('number');
      }
    });
  });

  describe('enumerateServices', () => {
    it('should enumerate services on target hosts', async () => {
      const parameters = {
        targets: ['192.168.1.1:80', '192.168.1.1:443'],
      };

      const result = await module.enumerateServices(parameters);

      expect(result.type).toBe('service_enum');
      expect(result.hosts).toBeInstanceOf(Array);
      expect(result.services).toBeInstanceOf(Array);
      expect((result.metadata as any)?.targets).toBe(2);
    });

    it('should support service detection options', async () => {
      const parameters = {
        targets: ['192.168.1.1:80'],
        service_detection: true,
        banner_grabbing: true,
        vulnerability_scan: true,
      };

      const result = await module.enumerateServices(parameters);

      expect((result.metadata as any)?.serviceDetection).toBe(true);
      expect((result.metadata as any)?.bannerGrabbing).toBe(true);
      expect((result.metadata as any)?.vulnerabilityScan).toBe(true);
    });

    it('should return service details', async () => {
      const parameters = {
        targets: ['192.168.1.1:80'],
      };

      const result = await module.enumerateServices(parameters);

      // Check service structure if any services were found
      if (result.services.length > 0) {
        const service = result.services[0];
        if (service) {
          expect(service).toHaveProperty('port');
          expect(service).toHaveProperty('protocol');
          expect(service).toHaveProperty('service');
          expect(service).toHaveProperty('state');
          expect(service).toHaveProperty('confidence');
          expect(typeof service.port).toBe('number');
          expect(typeof service.confidence).toBe('number');
        }
      }
    });
  });

  describe('enumerateSmbShares', () => {
    it('should enumerate SMB shares', async () => {
      const parameters = {
        targets: ['192.168.1.1', '192.168.1.2'],
      };

      const result = await module.enumerateSmbShares(parameters);

      expect(result.type).toBe('service_enum');
      expect(result.hosts).toBeInstanceOf(Array);
      expect(result.services).toBeInstanceOf(Array);
      expect((result.metadata as any)?.targets).toBe(2);
    });

    it('should support authentication credentials', async () => {
      const parameters = {
        targets: ['192.168.1.1'],
        credentials: {
          username: 'testuser',
          password: 'testpass',
          domain: 'TESTDOMAIN',
        },
        null_session: false,
      };

      const result = await module.enumerateSmbShares(parameters);

      expect((result.metadata as any)?.hasCredentials).toBe(true);
      expect((result.metadata as any)?.nullSession).toBe(false);
    });

    it('should return SMB service information', async () => {
      const parameters = {
        targets: ['192.168.1.1'],
      };

      const result = await module.enumerateSmbShares(parameters);

      // Should find SMB services
      const smbServices = result.services.filter(s => s.port === 445 || s.port === 139);
      expect(smbServices.length).toBeGreaterThan(0);

      const smbService = smbServices[0];
      if (smbService) {
        expect(smbService.service).toMatch(/microsoft-ds|netbios-ssn/);
      }
    });
  });

  describe('helper methods', () => {
    it('should generate valid MAC addresses', () => {
      const generateMac = (module as any).generateMacAddress.bind(module);

      const mac = generateMac();
      expect(mac).toMatch(
        /^[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}$/
      );
    });

    it('should guess operating systems', () => {
      const guessOS = (module as any).guessOperatingSystem.bind(module);

      const os = guessOS();
      expect(typeof os).toBe('string');
      expect(os.length).toBeGreaterThan(0);
    });

    it('should map service names correctly', () => {
      const getServiceName = (module as any).getServiceName.bind(module);

      expect(getServiceName(80)).toBe('http');
      expect(getServiceName(443)).toBe('https');
      expect(getServiceName(22)).toBe('ssh');
      expect(getServiceName(21)).toBe('ftp');
      expect(getServiceName(9999)).toBe('unknown');
    });

    it('should convert CIDR to netmask', () => {
      const cidrToNetmask = (module as any).cidrToNetmask.bind(module);

      expect(cidrToNetmask('192.168.1.0/24')).toBe('255.255.255.0');
      expect(cidrToNetmask('10.0.0.0/8')).toBe('255.0.0.0');
      expect(cidrToNetmask('172.16.0.0/16')).toBe('255.255.0.0');
    });

    it('should determine gateway for network', () => {
      const getGateway = (module as any).getGatewayForNetwork.bind(module);

      expect(getGateway('192.168.1.0/24')).toBe('192.168.1.1');
      expect(getGateway('10.0.0.0/24')).toBe('10.0.0.1');
    });
  });

  describe('error handling', () => {
    it('should handle scan errors gracefully', async () => {
      // Test with invalid parameters
      const parameters = {
        targets: [], // Empty targets array
      };

      const result = await module.scanPorts(parameters);

      // Should complete without throwing, even with empty targets
      expect(result.type).toBe('port_scan');
      expect(result.hosts).toHaveLength(0);
      expect(result.services).toHaveLength(0);
    });
  });

  describe('performance', () => {
    it('should complete scans within reasonable time', async () => {
      const startTime = Date.now();

      const parameters = {
        targets: ['192.168.1.1'],
        ports: ['80', '443'],
      };

      const result = await module.scanPorts(parameters);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.scanDuration).toBeGreaterThan(0);
    });
  });

  describe('data validation', () => {
    it('should return valid network discovery results', async () => {
      const parameters = {
        networks: ['192.168.1.0/24'],
      };

      const result = await module.discoverHosts(parameters);

      // Validate result structure
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('hosts');
      expect(result).toHaveProperty('networks');
      expect(result).toHaveProperty('services');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('scanDuration');
      expect(result).toHaveProperty('metadata');

      // Validate hosts structure
      result.hosts.forEach(host => {
        expect(host).toHaveProperty('ipAddress');
        expect(host).toHaveProperty('isAlive');
        expect(host).toHaveProperty('lastSeen');
        expect(host.lastSeen).toBeInstanceOf(Date);
        expect(typeof host.isAlive).toBe('boolean');
      });

      // Validate networks structure
      result.networks.forEach(network => {
        expect(network).toHaveProperty('network');
        expect(network).toHaveProperty('netmask');
        expect(network).toHaveProperty('hostCount');
        expect(typeof network.hostCount).toBe('number');
      });
    });
  });
});
