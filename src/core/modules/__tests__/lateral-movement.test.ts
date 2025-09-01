/**
 * Tests for LateralMovementModule
 * Implements requirements 14.1, 14.2, 14.3, 14.4, 14.6 - Lateral movement capabilities
 */

import { LateralMovementModule } from '../lateral-movement.module';
import { ModuleCategory, ModuleExecutionMode } from '../../../types/modules';

describe('LateralMovementModule', () => {
  let module: LateralMovementModule;

  beforeEach(() => {
    module = new LateralMovementModule();
  });

  describe('getMetadata', () => {
    it('should return correct metadata', () => {
      const metadata = LateralMovementModule.getMetadata();

      expect(metadata.name).toBe('LateralMovement');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.author).toBe('SeraphC2 Team');
      expect(metadata.category).toBe(ModuleCategory.LATERAL_MOVEMENT);
      expect(metadata.executionMode).toBe(ModuleExecutionMode.ASYNCHRONOUS);
      expect(metadata.capabilities).toHaveLength(5);

      // Check capabilities
      const capabilityNames = metadata.capabilities.map(c => c.name);
      expect(capabilityNames).toContain('enumerate_network');
      expect(capabilityNames).toContain('credential_attack');
      expect(capabilityNames).toContain('remote_execute');
      expect(capabilityNames).toContain('escalate_privileges');
      expect(capabilityNames).toContain('enumerate_active_directory');
    });

    it('should have proper access requirements', () => {
      const metadata = LateralMovementModule.getMetadata();

      expect(metadata.networkAccess).toBe(true);
      expect(metadata.fileSystemAccess).toBe(true);
      expect(metadata.registryAccess).toBe(true);
      expect(metadata.processAccess).toBe(true);
      expect(metadata.timeout).toBe(1800000); // 30 minutes
    });

    it('should have required privileges', () => {
      const metadata = LateralMovementModule.getMetadata();

      expect(metadata.requirements.privileges).toContain('SeDebugPrivilege');
      expect(metadata.requirements.privileges).toContain('SeTcbPrivilege');
      expect(metadata.requirements.privileges).toContain('SeImpersonatePrivilege');
    });
  });

  describe('enumerateNetwork - Requirement 14.1', () => {
    it('should enumerate network for lateral movement targets', async () => {
      const parameters = {
        networks: ['192.168.1.0/24', '10.0.0.0/24'],
        ports: ['135', '139', '445', '3389', '5985'],
        resolve_hostnames: true,
        check_vulnerabilities: true,
      };

      const result = await module.enumerateNetwork(parameters);

      expect(result.type).toBe('network_enum');
      expect(result.success).toBe(true);
      expect(result.targets).toBeInstanceOf(Array);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.metadata).toBeDefined();
      expect((result.metadata as any)?.networks).toBe(2);
      expect((result.metadata as any)?.portsScanned).toBe(5);
      expect((result.metadata as any)?.targetsFound).toBeGreaterThan(0);
    });

    it('should find accessible targets with lateral movement services', async () => {
      const parameters = {
        networks: ['192.168.1.0/24'],
      };

      const result = await module.enumerateNetwork(parameters);

      expect(result.targets.length).toBeGreaterThan(0);

      // Check target structure
      const accessibleTargets = result.targets.filter(t => t.accessible);
      expect(accessibleTargets.length).toBeGreaterThan(0);

      const target = accessibleTargets[0];
      if (target) {
        expect(target).toHaveProperty('ipAddress');
        expect(target).toHaveProperty('hostname');
        expect(target).toHaveProperty('operatingSystem');
        expect(target).toHaveProperty('accessible');
        expect(target).toHaveProperty('vulnerabilities');
        expect(target).toHaveProperty('services');
        expect(target.accessible).toBe(true);
        expect(target.services.length).toBeGreaterThan(0);
      }
    });

    it('should identify lateral movement vulnerabilities', async () => {
      const parameters = {
        networks: ['192.168.1.0/24'],
        check_vulnerabilities: true,
      };

      const result = await module.enumerateNetwork(parameters);

      const vulnerableTargets = result.targets.filter(t => t.vulnerabilities.length > 0);
      expect(vulnerableTargets.length).toBeGreaterThan(0);

      const vulnerableTarget = vulnerableTargets[0];
      if (vulnerableTarget) {
        expect(vulnerableTarget.vulnerabilities).toBeInstanceOf(Array);
        expect(vulnerableTarget.vulnerabilities.length).toBeGreaterThan(0);
      }
    });

    it('should support custom port scanning', async () => {
      const parameters = {
        networks: ['192.168.1.0/24'],
        ports: ['22', '80', '443'],
        resolve_hostnames: false,
      };

      const result = await module.enumerateNetwork(parameters);

      expect((result.metadata as any)?.portsScanned).toBe(3);
      expect((result.metadata as any)?.resolveHostnames).toBe(false);
    });
  });

  describe('credentialAttack - Requirements 14.2, 14.3', () => {
    it('should perform pass-the-hash attacks', async () => {
      const parameters = {
        targets: ['192.168.1.10', '192.168.1.11'],
        credentials: [
          'admin:password123',
          'user:aad3b435b51404eeaad3b435b51404ee:5fbc3d5fec8206a30f4b6c473d68ae76',
        ],
        attack_types: ['pass_the_hash'],
        services: ['smb', 'wmi'],
      };

      const result = await module.credentialAttack(parameters);

      expect(result.type).toBe('credential_attack');
      expect(result.targets).toBeInstanceOf(Array);
      expect(result.credentials).toBeInstanceOf(Array);
      expect((result.metadata as any)?.attackTypes).toContain('pass_the_hash');
      expect((result.metadata as any)?.services).toContain('smb');
      expect((result.metadata as any)?.services).toContain('wmi');
    });

    it('should perform pass-the-ticket attacks', async () => {
      const parameters = {
        targets: ['192.168.1.10'],
        credentials: ['admin@domain.local:ticket_data'],
        attack_types: ['pass_the_ticket'],
        services: ['winrm'],
      };

      const result = await module.credentialAttack(parameters);

      expect(result.type).toBe('credential_attack');
      expect((result.metadata as any)?.attackTypes).toContain('pass_the_ticket');
    });

    it('should perform credential spray attacks', async () => {
      const parameters = {
        targets: ['192.168.1.10', '192.168.1.11', '192.168.1.12'],
        credentials: ['admin:password123', 'admin:admin', 'admin:Password1'],
        attack_types: ['credential_spray'],
        services: ['rdp', 'smb'],
      };

      const result = await module.credentialAttack(parameters);

      expect(result.type).toBe('credential_attack');
      expect((result.metadata as any)?.attackTypes).toContain('credential_spray');
      expect((result.metadata as any)?.targetsAttempted).toBe(3);
      expect((result.metadata as any)?.credentialsTested).toBe(3);
    });

    it('should return successful credentials with proper structure', async () => {
      const parameters = {
        targets: ['192.168.1.10'],
        credentials: ['admin:password123'],
        attack_types: ['pass_the_hash'],
        services: ['smb'],
      };

      const result = await module.credentialAttack(parameters);

      if (result.credentials && result.credentials.length > 0) {
        const credential = result.credentials[0];
        if (credential) {
          expect(credential).toHaveProperty('username');
          expect(credential).toHaveProperty('source');
          expect(credential).toHaveProperty('confidence');
          expect(credential.source).toContain('Lateral Movement');
          expect(credential.confidence).toBeGreaterThan(0);
          expect(credential.metadata).toHaveProperty('target');
          expect(credential.metadata).toHaveProperty('service');
          expect(credential.metadata).toHaveProperty('attackType');
        }
      }
    });
  });

  describe('remoteExecute - Requirement 14.3', () => {
    it('should execute commands via WMI', async () => {
      const parameters = {
        targets: [
          {
            ipAddress: '192.168.1.10',
            credentials: { username: 'admin', password: 'password123' },
          },
        ],
        method: 'wmi',
        command: 'whoami',
      };

      const result = await module.remoteExecute(parameters);

      expect(result.type).toBe('remote_execution');
      expect(result.executionResults).toBeInstanceOf(Array);
      expect((result.metadata as any)?.method).toBe('wmi');
      expect((result.metadata as any)?.deployImplant).toBe(false);
    });

    it('should execute commands via PSExec', async () => {
      const parameters = {
        targets: [
          {
            ipAddress: '192.168.1.10',
            credentials: { username: 'admin', password: 'password123' },
          },
        ],
        method: 'psexec',
        command: 'systeminfo',
      };

      const result = await module.remoteExecute(parameters);

      expect(result.type).toBe('remote_execution');
      expect((result.metadata as any)?.method).toBe('psexec');
    });

    it('should deploy implants on remote systems', async () => {
      const parameters = {
        targets: [
          {
            ipAddress: '192.168.1.10',
            credentials: { username: 'admin', password: 'password123' },
          },
        ],
        method: 'wmi',
        deploy_implant: true,
        implant_config: {
          callback_interval: 60,
          encryption_key: 'test-key',
        },
      };

      const result = await module.remoteExecute(parameters);

      expect(result.type).toBe('remote_execution');
      expect((result.metadata as any)?.deployImplant).toBe(true);
      expect(result.executionResults).toBeInstanceOf(Array);

      if (result.executionResults && result.executionResults.length > 0) {
        const execution = result.executionResults[0];
        if (execution) {
          expect(execution).toHaveProperty('target');
          expect(execution).toHaveProperty('method');
          expect(execution).toHaveProperty('command');
          expect(execution).toHaveProperty('success');
          expect(execution).toHaveProperty('executionTime');
          expect(execution.method).toBe('wmi');
        }
      }
    });

    it('should support multiple remote execution methods', async () => {
      const methods = ['wmi', 'psexec', 'winrm', 'schtasks', 'at', 'dcom'];

      for (const method of methods) {
        const parameters = {
          targets: [
            {
              ipAddress: '192.168.1.10',
              credentials: { username: 'admin', password: 'password123' },
            },
          ],
          method,
          command: 'echo test',
        };

        const result = await module.remoteExecute(parameters);
        expect((result.metadata as any)?.method).toBe(method);
      }
    });
  });

  describe('escalatePrivileges - Requirement 14.4', () => {
    it('should detect token impersonation opportunities', async () => {
      const parameters = {
        targets: ['192.168.1.10'],
        techniques: ['token_impersonation'],
        auto_exploit: false,
      };

      const result = await module.escalatePrivileges(parameters);

      expect(result.type).toBe('privilege_escalation');
      expect(result.targets).toBeInstanceOf(Array);
      expect((result.metadata as any)?.techniques).toContain('token_impersonation');
      expect((result.metadata as any)?.autoExploit).toBe(false);
    });

    it('should detect service permission vulnerabilities', async () => {
      const parameters = {
        targets: ['192.168.1.10'],
        techniques: ['service_permissions', 'unquoted_paths'],
        auto_exploit: false,
      };

      const result = await module.escalatePrivileges(parameters);

      expect((result.metadata as any)?.techniques).toContain('service_permissions');
      expect((result.metadata as any)?.techniques).toContain('unquoted_paths');
    });

    it('should detect registry-based escalation opportunities', async () => {
      const parameters = {
        targets: ['192.168.1.10'],
        techniques: ['always_install_elevated', 'registry_autoruns'],
        auto_exploit: false,
      };

      const result = await module.escalatePrivileges(parameters);

      expect((result.metadata as any)?.techniques).toContain('always_install_elevated');
      expect((result.metadata as any)?.techniques).toContain('registry_autoruns');
    });

    it('should support automatic exploitation', async () => {
      const parameters = {
        targets: ['192.168.1.10'],
        techniques: ['token_impersonation'],
        auto_exploit: true,
      };

      const result = await module.escalatePrivileges(parameters);

      expect((result.metadata as any)?.autoExploit).toBe(true);
    });

    it('should return vulnerability details', async () => {
      const parameters = {
        targets: ['192.168.1.10'],
        techniques: ['token_impersonation', 'service_permissions'],
      };

      const result = await module.escalatePrivileges(parameters);

      const vulnerableTargets = result.targets.filter(t => t.vulnerabilities.length > 0);
      if (vulnerableTargets.length > 0) {
        const target = vulnerableTargets[0];
        if (target) {
          expect(target.vulnerabilities).toBeInstanceOf(Array);
          expect(target.vulnerabilities.length).toBeGreaterThan(0);
          expect(typeof target.vulnerabilities[0]).toBe('string');
        }
      }
    });
  });

  describe('enumerateActiveDirectory - Requirement 14.6', () => {
    it('should enumerate domain users and groups', async () => {
      const parameters = {
        domain: 'TESTDOMAIN.LOCAL',
        enumerate_users: true,
        enumerate_groups: true,
        enumerate_computers: false,
        enumerate_trusts: false,
      };

      const result = await module.enumerateActiveDirectory(parameters);

      expect(result.type).toBe('ad_enum');
      expect(result.success).toBe(true);
      expect(result.targets).toBeInstanceOf(Array);
      expect((result.metadata as any)?.domain).toBe('TESTDOMAIN.LOCAL');
      expect((result.metadata as any)?.users).toBeGreaterThan(0);
      expect((result.metadata as any)?.groups).toBeGreaterThan(0);
    });

    it('should enumerate domain computers', async () => {
      const parameters = {
        enumerate_users: false,
        enumerate_groups: false,
        enumerate_computers: true,
        enumerate_trusts: false,
      };

      const result = await module.enumerateActiveDirectory(parameters);

      expect((result.metadata as any)?.computers).toBeGreaterThan(0);
      expect(result.targets.length).toBeGreaterThan(0);

      // Check that targets are derived from computers
      const target = result.targets[0];
      expect(target).toHaveProperty('ipAddress');
      expect(target).toHaveProperty('hostname');
      expect(target).toHaveProperty('operatingSystem');
      expect(target).toHaveProperty('domain');
    });

    it('should enumerate domain trusts', async () => {
      const parameters = {
        enumerate_users: false,
        enumerate_groups: false,
        enumerate_computers: false,
        enumerate_trusts: true,
      };

      const result = await module.enumerateActiveDirectory(parameters);

      expect((result.metadata as any)?.trusts).toBeGreaterThanOrEqual(0);
    });

    it('should identify administrative users', async () => {
      const parameters = {
        enumerate_users: true,
        find_admin_users: true,
      };

      const result = await module.enumerateActiveDirectory(parameters);

      expect((result.metadata as any)?.adminUsers).toBeGreaterThanOrEqual(0);
    });

    it('should support custom domain credentials', async () => {
      const parameters = {
        domain: 'CUSTOM.DOMAIN',
        credentials: {
          username: 'domain_admin',
          password: 'password123',
        },
        enumerate_users: true,
      };

      const result = await module.enumerateActiveDirectory(parameters);

      expect((result.metadata as any)?.domain).toBe('CUSTOM.DOMAIN');
    });

    it('should enumerate all AD components by default', async () => {
      const parameters = {};

      const result = await module.enumerateActiveDirectory(parameters);

      expect((result.metadata as any)?.users).toBeGreaterThan(0);
      expect((result.metadata as any)?.groups).toBeGreaterThan(0);
      expect((result.metadata as any)?.computers).toBeGreaterThan(0);
      expect((result.metadata as any)?.domainControllers).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle network enumeration errors gracefully', async () => {
      const parameters = {
        networks: [], // Empty networks
      };

      const result = await module.enumerateNetwork(parameters);

      expect(result.type).toBe('network_enum');
      expect(result.targets).toHaveLength(0);
      expect((result.metadata as any)?.networks).toBe(0);
    });

    it('should handle credential attack errors gracefully', async () => {
      const parameters = {
        targets: [],
        credentials: [],
        attack_types: ['pass_the_hash'],
      };

      const result = await module.credentialAttack(parameters);

      expect(result.type).toBe('credential_attack');
      expect(result.success).toBe(false);
      expect(result.targets).toHaveLength(0);
      expect(result.credentials).toHaveLength(0);
    });

    it('should handle remote execution failures', async () => {
      const parameters = {
        targets: [
          {
            ipAddress: '192.168.1.999', // Invalid IP
            credentials: { username: 'invalid', password: 'invalid' },
          },
        ],
        method: 'wmi',
        command: 'whoami',
      };

      const result = await module.remoteExecute(parameters);

      expect(result.type).toBe('remote_execution');
      expect(result.executionResults).toBeInstanceOf(Array);

      if (result.executionResults && result.executionResults.length > 0) {
        const execution = result.executionResults[0];
        if (execution) {
          // Some executions might fail, which is expected
          expect(execution).toHaveProperty('success');
          expect(typeof execution.success).toBe('boolean');
        }
      }
    });
  });

  describe('performance and scalability', () => {
    it('should handle large network ranges efficiently', async () => {
      const startTime = Date.now();

      const parameters = {
        networks: ['192.168.1.0/24', '10.0.0.0/24', '172.16.0.0/24'],
        ports: ['135', '139', '445'],
      };

      const result = await module.enumerateNetwork(parameters);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      expect((result.metadata as any)?.scanDuration).toBeGreaterThan(0);
    });

    it('should handle multiple credential attacks efficiently', async () => {
      const startTime = Date.now();

      const parameters = {
        targets: ['192.168.1.10', '192.168.1.11', '192.168.1.12'],
        credentials: ['admin:password', 'user:password', 'test:test'],
        attack_types: ['pass_the_hash', 'credential_spray'],
        services: ['smb', 'wmi', 'winrm'],
      };

      const result = await module.credentialAttack(parameters);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      expect((result.metadata as any)?.duration).toBeGreaterThan(0);
    });
  });

  describe('data validation', () => {
    it('should return valid lateral movement results', async () => {
      const parameters = {
        networks: ['192.168.1.0/24'],
      };

      const result = await module.enumerateNetwork(parameters);

      // Validate result structure
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('targets');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('metadata');

      // Validate targets structure
      result.targets.forEach(target => {
        expect(target).toHaveProperty('ipAddress');
        expect(target).toHaveProperty('accessible');
        expect(target).toHaveProperty('vulnerabilities');
        expect(target).toHaveProperty('services');
        expect(typeof target.accessible).toBe('boolean');
        expect(target.vulnerabilities).toBeInstanceOf(Array);
        expect(target.services).toBeInstanceOf(Array);
      });
    });

    it('should return valid credential attack results', async () => {
      const parameters = {
        targets: ['192.168.1.10'],
        credentials: ['admin:password123'],
        attack_types: ['pass_the_hash'],
      };

      const result = await module.credentialAttack(parameters);

      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('targets');
      expect(result).toHaveProperty('credentials');
      expect(result).toHaveProperty('timestamp');

      if (result.credentials && result.credentials.length > 0) {
        result.credentials.forEach(credential => {
          expect(credential).toHaveProperty('username');
          expect(credential).toHaveProperty('source');
          expect(credential).toHaveProperty('confidence');
          expect(typeof credential.confidence).toBe('number');
          expect(credential.confidence).toBeGreaterThanOrEqual(0);
          expect(credential.confidence).toBeLessThanOrEqual(100);
        });
      }
    });
  });

  describe('integration with other modules', () => {
    it('should work with network discovery results', async () => {
      // First enumerate network
      const networkParams = {
        networks: ['192.168.1.0/24'],
      };

      const networkResult = await module.enumerateNetwork(networkParams);
      const accessibleTargets = networkResult.targets.filter(t => t.accessible);

      if (accessibleTargets.length > 0) {
        // Use network results for credential attacks
        const credParams = {
          targets: accessibleTargets.map(t => t.ipAddress),
          credentials: ['admin:password123'],
          attack_types: ['pass_the_hash'],
        };

        const credResult = await module.credentialAttack(credParams);
        expect(credResult.type).toBe('credential_attack');
        expect((credResult.metadata as any)?.targetsAttempted).toBe(accessibleTargets.length);
      }
    });

    it('should integrate credential results with remote execution', async () => {
      // First perform credential attack
      const credParams = {
        targets: ['192.168.1.10'],
        credentials: ['admin:password123'],
        attack_types: ['pass_the_hash'],
      };

      const credResult = await module.credentialAttack(credParams);

      if (credResult.credentials && credResult.credentials.length > 0) {
        const credential = credResult.credentials[0];
        if (credential) {
          // Use successful credentials for remote execution
          const execParams = {
            targets: [
              {
                ipAddress: '192.168.1.10',
                credentials: {
                  username: credential.username,
                  password: credential.password,
                },
              },
            ],
            method: 'wmi',
            command: 'whoami',
          };

          const execResult = await module.remoteExecute(execParams);
          expect(execResult.type).toBe('remote_execution');
        }
      }
    });
  });
});
