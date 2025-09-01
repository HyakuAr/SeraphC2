/**
 * Tests for implant Redux slice
 */

import { configureStore } from '@reduxjs/toolkit';
import implantReducer, {
  updateImplantStats,
  updateImplantList,
  updateImplantDetails,
  addImplant,
  updateImplantStatus,
  updateImplantHeartbeat,
  setSelectedImplant,
  clearError,
  clearImplants,
  fetchImplants,
  fetchImplantStats,
  ImplantState,
} from '../implantSlice';
import { EnhancedImplant, ImplantStats } from '../../../services/websocketService';

// Mock the implant service
jest.mock('../../../services/implantService', () => ({
  implantService: {
    getImplants: jest.fn(),
    getImplantStats: jest.fn(),
    getImplant: jest.fn(),
    disconnectImplant: jest.fn(),
  },
}));

describe('implantSlice', () => {
  let store: ReturnType<typeof configureStore>;

  const mockImplant: EnhancedImplant = {
    id: 'test-implant-1',
    hostname: 'TEST-PC',
    username: 'testuser',
    operatingSystem: 'Windows 10',
    architecture: 'x64',
    privileges: 'user',
    lastSeen: new Date('2023-01-01T12:00:00Z'),
    status: 'active',
    communicationProtocol: 'https',
    systemInfo: {
      hostname: 'TEST-PC',
      operatingSystem: 'Windows 10',
      architecture: 'x64',
      processorInfo: 'Intel Core i7',
      memoryTotal: 16777216000,
      diskSpace: 1000000000000,
      networkInterfaces: ['192.168.1.100'],
      installedSoftware: ['Chrome', 'Firefox'],
      runningProcesses: 150,
    },
    isConnected: true,
    lastHeartbeat: new Date('2023-01-01T12:05:00Z'),
    connectionInfo: {
      protocol: 'https',
      remoteAddress: '192.168.1.100',
      userAgent: 'SeraphC2-Implant/1.0',
    },
  };

  const mockStats: ImplantStats = {
    total: 5,
    active: 3,
    inactive: 1,
    disconnected: 1,
    connected: 2,
    timestamp: new Date('2023-01-01T12:00:00Z'),
  };

  beforeEach(() => {
    store = configureStore({
      reducer: {
        implants: implantReducer,
      },
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().implants;
      expect(state).toEqual({
        implants: [],
        stats: null,
        selectedImplant: null,
        loading: false,
        error: null,
        lastUpdated: null,
      });
    });
  });

  describe('synchronous actions', () => {
    it('should update implant stats', () => {
      store.dispatch(updateImplantStats(mockStats));
      const state = store.getState().implants;

      expect(state.stats).toEqual(mockStats);
      expect(state.lastUpdated).toBeInstanceOf(Date);
    });

    it('should update implant list', () => {
      const implants = [mockImplant];
      store.dispatch(updateImplantList(implants));
      const state = store.getState().implants;

      expect(state.implants).toEqual(implants);
      expect(state.lastUpdated).toBeInstanceOf(Date);
    });

    it('should update implant details', () => {
      // First add an implant to the list
      store.dispatch(updateImplantList([mockImplant]));

      // Update the implant details
      const updatedImplant = { ...mockImplant, hostname: 'UPDATED-PC' };
      store.dispatch(updateImplantDetails(updatedImplant));

      const state = store.getState().implants;
      expect(state.implants[0].hostname).toBe('UPDATED-PC');
    });

    it('should add new implant', () => {
      store.dispatch(addImplant(mockImplant));
      const state = store.getState().implants;

      expect(state.implants).toHaveLength(1);
      expect(state.implants[0]).toEqual(mockImplant);
    });

    it('should update existing implant when adding duplicate', () => {
      // Add initial implant
      store.dispatch(addImplant(mockImplant));

      // Add updated version of same implant
      const updatedImplant = { ...mockImplant, hostname: 'UPDATED-PC' };
      store.dispatch(addImplant(updatedImplant));

      const state = store.getState().implants;
      expect(state.implants).toHaveLength(1);
      expect(state.implants[0].hostname).toBe('UPDATED-PC');
    });

    it('should update implant status', () => {
      store.dispatch(updateImplantList([mockImplant]));
      store.dispatch(updateImplantStatus({ implantId: mockImplant.id, status: 'inactive' }));

      const state = store.getState().implants;
      expect(state.implants[0].status).toBe('inactive');
      expect(state.implants[0].isConnected).toBe(false);
    });

    it('should update implant heartbeat', () => {
      store.dispatch(
        updateImplantList([{ ...mockImplant, isConnected: false, status: 'inactive' }])
      );

      const heartbeatTime = new Date();
      store.dispatch(
        updateImplantHeartbeat({
          implantId: mockImplant.id,
          timestamp: heartbeatTime,
        })
      );

      const state = store.getState().implants;
      expect(state.implants[0].lastHeartbeat).toEqual(heartbeatTime);
      expect(state.implants[0].isConnected).toBe(true);
      expect(state.implants[0].status).toBe('active');
    });

    it('should set selected implant', () => {
      store.dispatch(setSelectedImplant(mockImplant));
      const state = store.getState().implants;

      expect(state.selectedImplant).toEqual(mockImplant);
    });

    it('should clear error', () => {
      // Set an error first
      const initialState: ImplantState = {
        implants: [],
        stats: null,
        selectedImplant: null,
        loading: false,
        error: 'Test error',
        lastUpdated: null,
      };

      const storeWithError = configureStore({
        reducer: { implants: implantReducer },
        preloadedState: { implants: initialState },
      });

      storeWithError.dispatch(clearError());
      const state = storeWithError.getState().implants;

      expect(state.error).toBeNull();
    });

    it('should clear all implants', () => {
      // Set some data first
      store.dispatch(updateImplantList([mockImplant]));
      store.dispatch(updateImplantStats(mockStats));
      store.dispatch(setSelectedImplant(mockImplant));

      store.dispatch(clearImplants());
      const state = store.getState().implants;

      expect(state.implants).toEqual([]);
      expect(state.stats).toBeNull();
      expect(state.selectedImplant).toBeNull();
      expect(state.lastUpdated).toBeNull();
    });
  });

  describe('async actions', () => {
    const { implantService } = require('../../../services/implantService');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should handle fetchImplants.pending', () => {
      const action = { type: fetchImplants.pending.type };
      const state = implantReducer(undefined, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should handle fetchImplants.fulfilled', () => {
      const implants = [mockImplant];
      const action = {
        type: fetchImplants.fulfilled.type,
        payload: implants,
      };
      const state = implantReducer(undefined, action);

      expect(state.loading).toBe(false);
      expect(state.implants).toEqual(implants);
      expect(state.lastUpdated).toBeInstanceOf(Date);
    });

    it('should handle fetchImplants.rejected', () => {
      const errorMessage = 'Failed to fetch implants';
      const action = {
        type: fetchImplants.rejected.type,
        payload: errorMessage,
      };
      const state = implantReducer(undefined, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(errorMessage);
    });

    it('should handle fetchImplantStats.fulfilled', () => {
      const action = {
        type: fetchImplantStats.fulfilled.type,
        payload: mockStats,
      };
      const state = implantReducer(undefined, action);

      expect(state.loading).toBe(false);
      expect(state.stats).toEqual(mockStats);
      expect(state.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('edge cases', () => {
    it('should handle updating non-existent implant status', () => {
      store.dispatch(updateImplantStatus({ implantId: 'non-existent', status: 'inactive' }));
      const state = store.getState().implants;

      // Should not crash and state should remain unchanged
      expect(state.implants).toEqual([]);
    });

    it('should handle updating non-existent implant heartbeat', () => {
      store.dispatch(
        updateImplantHeartbeat({
          implantId: 'non-existent',
          timestamp: new Date(),
        })
      );
      const state = store.getState().implants;

      // Should not crash and state should remain unchanged
      expect(state.implants).toEqual([]);
    });

    it('should update selected implant when updating details', () => {
      store.dispatch(setSelectedImplant(mockImplant));

      const updatedImplant = { ...mockImplant, hostname: 'UPDATED-PC' };
      store.dispatch(updateImplantDetails(updatedImplant));

      const state = store.getState().implants;
      expect(state.selectedImplant?.hostname).toBe('UPDATED-PC');
    });
  });
});
