import {
  KillSwitchService,
  KillSwitchStatus,
} from '../../../src/core/incident/kill-switch.service';
import { ImplantManager } from '../../../src/core/engine/implant-manager';
import { DatabaseService } from '../../../src/core/database/database.service';

// Mock dependencies
jest.mock('../../../src/core/implant/implant-manager');
jest.mock('../../../src/core/database/database.service');

describe('KillSwitchService', () => {
  let killSwitchService: KillSwitchService;
  let mockImplantManager: jest.Mocked<ImplantManager>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;

  const mockConfig = {
    defaultTimeout: 300000, // 5 minutes
    checkInterval: 30000, // 30 seconds
    maxMissedHeartbeats: 3,
    gracePeriod: 5000, // 5 seconds
  };

  beforeEach(() => {
    jest.useFakeTimers();

    mockImplantManager = new ImplantManager(
      {} as any,
      {} as any,
      {} as any
    ) as jest.Mocked<ImplantManager>;
    mockDatabaseService = new DatabaseService({} as any) as jest.Mocked<DatabaseService>;

    mockImplantManager.sendCommand = jest.fn().mockResolvedValue(undefined);
    mockImplantManager.removeImplant = jest.fn().mockResolvedValue(undefined);
    mockImplantManager.on = jest.fn();

    mockDatabaseService.query = jest.fn().mockResolvedValue({ rows: [] });

    killSwitchService = new KillSwitchService(mockConfig, mockImplantManager, mockDatabaseService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('service lifecycle', () => {
    it('should start and stop the service', () => {
      expect(killSwitchService['isRunning']).toBe(false);

      killSwitchService.start();
      expect(killSwitchService['isRunning']).toBe(true);
      expect(killSwitchService['checkIntervalId']).toBeDefined();

      killSwitchService.stop();
      expect(killSwitchService['isRunning']).toBe(false);
      expect(killSwitchService['checkIntervalId']).toBeUndefined();
    });

    it('should not start if already running', () => {
      killSwitchService.start();
      const firstIntervalId = killSwitchService['checkIntervalId'];

      killSwitchService.start(); // Should not create new interval
      expect(killSwitchService['checkIntervalId']).toBe(firstIntervalId);
    });

    it('should not stop if not running', () => {
      expect(() => killSwitchService.stop()).not.toThrow();
    });
  });

  describe('timer management', () => {
    it('should create a kill switch timer', () => {
      const implantId = 'implant123';
      const timeout = 600000; // 10 minutes
      const reason = 'Test timer';

      const timerId = killSwitchService.createTimer(implantId, timeout, reason);

      expect(timerId).toBeDefined();
      expect(timerId).toMatch(/^timer_/);

      const timer = killSwitchService.getTimer(timerId);
      expect(timer).toBeDefined();
      expect(timer!.implantId).toBe(implantId);
      expect(timer!.timeout).toBe(timeout);
      expect(timer!.reason).toBe(reason);
      expect(timer!.isActive).toBe(true);
      expect(timer!.missedHeartbeats).toBe(0);

      // Verify database persistence
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO kill_switch_timers'),
        expect.arrayContaining([timerId, implantId, timeout])
      );
    });

    it('should use default timeout when not specified', () => {
      const implantId = 'implant123';
      const timerId = killSwitchService.createTimer(implantId);

      const timer = killSwitchService.getTimer(timerId);
      expect(timer!.timeout).toBe(mockConfig.defaultTimeout);
    });

    it('should cancel a timer', () => {
      const implantId = 'implant123';
      const timerId = killSwitchService.createTimer(implantId);

      const cancelled = killSwitchService.cancelTimer(timerId, 'Manual cancellation');

      expect(cancelled).toBe(true);

      const timer = killSwitchService.getTimer(timerId);
      expect(timer!.isActive).toBe(false);

      // Verify database update
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (id) DO UPDATE SET'),
        expect.arrayContaining([timerId])
      );
    });

    it('should return false when cancelling non-existent timer', () => {
      const cancelled = killSwitchService.cancelTimer('non-existent');
      expect(cancelled).toBe(false);
    });

    it('should cancel all timers for an implant', () => {
      const implantId = 'implant123';
      const timer1 = killSwitchService.createTimer(implantId);
      const timer2 = killSwitchService.createTimer(implantId);
      const timer3 = killSwitchService.createTimer('other-implant');

      const cancelled = killSwitchService.cancelImplantTimers(implantId, 'Implant shutdown');

      expect(cancelled).toBe(2);

      expect(killSwitchService.getTimer(timer1)!.isActive).toBe(false);
      expect(killSwitchService.getTimer(timer2)!.isActive).toBe(false);
      expect(killSwitchService.getTimer(timer3)!.isActive).toBe(true);
    });
  });

  describe('heartbeat management', () => {
    it('should update heartbeat for active timer', () => {
      const implantId = 'implant123';
      const timerId = killSwitchService.createTimer(implantId);

      const originalHeartbeat = killSwitchService.getTimer(timerId)!.lastHeartbeat;

      // Advance time slightly
      jest.advanceTimersByTime(1000);

      killSwitchService.updateHeartbeat(implantId);

      const timer = killSwitchService.getTimer(timerId)!;
      expect(timer.lastHeartbeat.getTime()).toBeGreaterThan(originalHeartbeat.getTime());
      expect(timer.missedHeartbeats).toBe(0);
    });

    it('should not update heartbeat for inactive timer', () => {
      const implantId = 'implant123';
      const timerId = killSwitchService.createTimer(implantId);
      killSwitchService.cancelTimer(timerId);

      const originalHeartbeat = killSwitchService.getTimer(timerId)!.lastHeartbeat;

      killSwitchService.updateHeartbeat(implantId);

      const timer = killSwitchService.getTimer(timerId)!;
      expect(timer.lastHeartbeat).toEqual(originalHeartbeat);
    });

    it('should not update heartbeat for non-existent implant', () => {
      expect(() => killSwitchService.updateHeartbeat('non-existent')).not.toThrow();
    });
  });

  describe('timer checking and activation', () => {
    beforeEach(() => {
      killSwitchService.start();
    });

    afterEach(() => {
      killSwitchService.stop();
    });

    it('should activate kill switch when timer expires', async () => {
      const implantId = 'implant123';
      const timeout = 60000; // 1 minute
      const timerId = killSwitchService.createTimer(implantId, timeout, 'Test expiration');

      // Advance time beyond timeout
      jest.advanceTimersByTime(timeout + 1000);

      // Wait for async operations
      await jest.runAllTimersAsync();

      const timer = killSwitchService.getTimer(timerId)!;
      expect(timer.isActive).toBe(false);

      // Verify kill switch command was sent
      expect(mockImplantManager.sendCommand).toHaveBeenCalledWith(implantId, {
        type: 'kill_switch_activated',
        payload: expect.objectContaining({
          reason: expect.stringContaining('Timer expired'),
        }),
      });

      // Verify activation was recorded
      const activations = killSwitchService.getActivations(implantId);
      expect(activations).toHaveLength(1);
      expect(activations[0].status).toBe(KillSwitchStatus.COMPLETED);
    });

    it('should track missed heartbeats', () => {
      const implantId = 'implant123';
      const timerId = killSwitchService.createTimer(implantId);

      // Advance time to simulate missed heartbeats but not timeout
      jest.advanceTimersByTime(mockConfig.checkInterval * 2.5);

      const timer = killSwitchService.getTimer(timerId)!;
      expect(timer.missedHeartbeats).toBeGreaterThan(0);
      expect(timer.isActive).toBe(true); // Should still be active
    });

    it('should handle kill switch command failure', async () => {
      const implantId = 'implant123';
      const timeout = 60000;
      const timerId = killSwitchService.createTimer(implantId, timeout);

      // Mock command failure
      mockImplantManager.sendCommand.mockRejectedValueOnce(new Error('Command failed'));

      // Advance time beyond timeout
      jest.advanceTimersByTime(timeout + 1000);
      await jest.runAllTimersAsync();

      // Verify implant was still removed even if command failed
      expect(mockImplantManager.removeImplant).toHaveBeenCalledWith(implantId);

      const activations = killSwitchService.getActivations(implantId);
      expect(activations).toHaveLength(1);
      expect(activations[0].status).toBe(KillSwitchStatus.FAILED);
    });
  });

  describe('manual activation', () => {
    it('should manually activate kill switch', async () => {
      const implantId = 'implant123';
      const reason = 'Manual activation test';

      const activationId = await killSwitchService.activateKillSwitch(implantId, reason);

      expect(activationId).toBeDefined();
      expect(activationId).toMatch(/^activation_/);

      // Verify command was sent
      expect(mockImplantManager.sendCommand).toHaveBeenCalledWith(implantId, {
        type: 'kill_switch_activated',
        payload: expect.objectContaining({
          activationId,
          reason,
        }),
      });

      // Verify activation was recorded
      const activations = killSwitchService.getActivations(implantId);
      expect(activations).toHaveLength(1);
      expect(activations[0].id).toBe(activationId);
      expect(activations[0].reason).toBe(reason);
      expect(activations[0].status).toBe(KillSwitchStatus.COMPLETED);
    });

    it('should handle manual activation failure', async () => {
      const implantId = 'implant123';
      const reason = 'Test failure';

      mockImplantManager.sendCommand.mockRejectedValueOnce(new Error('Activation failed'));

      await expect(killSwitchService.activateKillSwitch(implantId, reason)).rejects.toThrow(
        'Activation failed'
      );

      const activations = killSwitchService.getActivations(implantId);
      expect(activations).toHaveLength(1);
      expect(activations[0].status).toBe(KillSwitchStatus.FAILED);
    });
  });

  describe('data retrieval', () => {
    it('should get active timers', () => {
      const implant1 = 'implant1';
      const implant2 = 'implant2';

      const timer1 = killSwitchService.createTimer(implant1);
      const timer2 = killSwitchService.createTimer(implant2);
      killSwitchService.cancelTimer(timer2);

      const activeTimers = killSwitchService.getActiveTimers();
      expect(activeTimers).toHaveLength(1);
      expect(activeTimers[0].id).toBe(timer1);
    });

    it('should get timers for specific implant', () => {
      const implant1 = 'implant1';
      const implant2 = 'implant2';

      killSwitchService.createTimer(implant1);
      killSwitchService.createTimer(implant1);
      killSwitchService.createTimer(implant2);

      const implant1Timers = killSwitchService.getImplantTimers(implant1);
      expect(implant1Timers).toHaveLength(2);

      const implant2Timers = killSwitchService.getImplantTimers(implant2);
      expect(implant2Timers).toHaveLength(1);
    });

    it('should get activations with optional filtering', async () => {
      const implant1 = 'implant1';
      const implant2 = 'implant2';

      await killSwitchService.activateKillSwitch(implant1, 'Test 1');
      await killSwitchService.activateKillSwitch(implant2, 'Test 2');

      // Get all activations
      const allActivations = killSwitchService.getActivations();
      expect(allActivations).toHaveLength(2);

      // Get activations for specific implant
      const implant1Activations = killSwitchService.getActivations(implant1);
      expect(implant1Activations).toHaveLength(1);
      expect(implant1Activations[0].implantId).toBe(implant1);
    });
  });

  describe('event handling', () => {
    it('should setup event handlers for implant manager', () => {
      expect(mockImplantManager.on).toHaveBeenCalledWith('implant:heartbeat', expect.any(Function));
      expect(mockImplantManager.on).toHaveBeenCalledWith('implant:connected', expect.any(Function));
      expect(mockImplantManager.on).toHaveBeenCalledWith(
        'implant:disconnected',
        expect.any(Function)
      );
    });

    it('should handle implant heartbeat events', () => {
      const implantId = 'implant123';
      const timerId = killSwitchService.createTimer(implantId);

      // Get the heartbeat event handler
      const heartbeatHandler = mockImplantManager.on.mock.calls.find(
        call => call[0] === 'implant:heartbeat'
      )?.[1];

      expect(heartbeatHandler).toBeDefined();

      if (heartbeatHandler) {
        const originalHeartbeat = killSwitchService.getTimer(timerId)!.lastHeartbeat;

        jest.advanceTimersByTime(1000);
        heartbeatHandler({ implantId });

        const timer = killSwitchService.getTimer(timerId)!;
        expect(timer.lastHeartbeat.getTime()).toBeGreaterThan(originalHeartbeat.getTime());
      }
    });

    it('should handle implant connection events', () => {
      const implantId = 'implant123';
      killSwitchService.createTimer(implantId);

      // Get the connection event handler
      const connectionHandler = mockImplantManager.on.mock.calls.find(
        call => call[0] === 'implant:connected'
      )?.[1];

      expect(connectionHandler).toBeDefined();

      if (connectionHandler) {
        connectionHandler({ implantId });

        // Verify timers were cancelled
        const timers = killSwitchService.getImplantTimers(implantId);
        expect(timers.every(t => !t.isActive)).toBe(true);
      }
    });

    it('should handle implant disconnection events', () => {
      const implantId = 'implant123';

      // Get the disconnection event handler
      const disconnectionHandler = mockImplantManager.on.mock.calls.find(
        call => call[0] === 'implant:disconnected'
      )?.[1];

      expect(disconnectionHandler).toBeDefined();

      if (disconnectionHandler) {
        disconnectionHandler({ implantId });

        // Verify new timer was created
        const timers = killSwitchService.getImplantTimers(implantId);
        expect(timers).toHaveLength(1);
        expect(timers[0].isActive).toBe(true);
        expect(timers[0].reason).toBe('Implant disconnected');
      }
    });
  });

  describe('database persistence', () => {
    it('should handle database persistence failures gracefully', () => {
      mockDatabaseService.query.mockRejectedValueOnce(new Error('Database error'));

      // Should not throw even if persistence fails
      expect(() => killSwitchService.createTimer('implant123')).not.toThrow();
    });

    it('should persist timer updates', () => {
      const implantId = 'implant123';
      const timerId = killSwitchService.createTimer(implantId);

      killSwitchService.updateHeartbeat(implantId);

      // Should have called database query for both create and update
      expect(mockDatabaseService.query).toHaveBeenCalledTimes(2);
    });

    it('should persist activation records', async () => {
      const implantId = 'implant123';
      await killSwitchService.activateKillSwitch(implantId, 'Test persistence');

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO kill_switch_activations'),
        expect.arrayContaining([expect.stringMatching(/^activation_/), implantId])
      );
    });
  });
});
