/**
 * Redux slice for implant state management
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { implantService } from '../../services/implantService';
import { EnhancedImplant, ImplantStats } from '../../services/websocketService';

export interface ImplantState {
  implants: EnhancedImplant[];
  stats: ImplantStats | null;
  selectedImplant: EnhancedImplant | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

const initialState: ImplantState = {
  implants: [],
  stats: null,
  selectedImplant: null,
  loading: false,
  error: null,
  lastUpdated: null,
};

// Async thunks
export const fetchImplants = createAsyncThunk(
  'implants/fetchImplants',
  async (_, { rejectWithValue }) => {
    try {
      const implants = await implantService.getImplants();
      return implants;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch implants');
    }
  }
);

export const fetchImplantStats = createAsyncThunk(
  'implants/fetchImplantStats',
  async (_, { rejectWithValue }) => {
    try {
      const stats = await implantService.getImplantStats();
      return stats;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch implant stats');
    }
  }
);

export const fetchImplantDetails = createAsyncThunk(
  'implants/fetchImplantDetails',
  async (implantId: string, { rejectWithValue }) => {
    try {
      const implant = await implantService.getImplant(implantId);
      return implant;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch implant details');
    }
  }
);

export const disconnectImplant = createAsyncThunk(
  'implants/disconnectImplant',
  async ({ id, reason }: { id: string; reason?: string }, { rejectWithValue }) => {
    try {
      await implantService.disconnectImplant(id, reason);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to disconnect implant');
    }
  }
);

const implantSlice = createSlice({
  name: 'implants',
  initialState,
  reducers: {
    // Real-time updates from WebSocket
    updateImplantStats: (state, action: PayloadAction<ImplantStats>) => {
      state.stats = action.payload;
      state.lastUpdated = new Date();
    },

    updateImplantList: (state, action: PayloadAction<EnhancedImplant[]>) => {
      state.implants = action.payload;
      state.lastUpdated = new Date();
    },

    updateImplantDetails: (state, action: PayloadAction<EnhancedImplant>) => {
      const implant = action.payload;

      // Update in the list
      const index = state.implants.findIndex(i => i.id === implant.id);
      if (index !== -1) {
        state.implants[index] = implant;
      }

      // Update selected implant if it matches
      if (state.selectedImplant?.id === implant.id) {
        state.selectedImplant = implant;
      }

      state.lastUpdated = new Date();
    },

    addImplant: (state, action: PayloadAction<EnhancedImplant>) => {
      const existingIndex = state.implants.findIndex(i => i.id === action.payload.id);
      if (existingIndex === -1) {
        state.implants.push(action.payload);
      } else {
        state.implants[existingIndex] = action.payload;
      }
      state.lastUpdated = new Date();
    },

    updateImplantStatus: (state, action: PayloadAction<{ implantId: string; status: string }>) => {
      const { implantId, status } = action.payload;
      const implant = state.implants.find(i => i.id === implantId);
      if (implant) {
        implant.status = status;
        if (status === 'inactive' || status === 'disconnected') {
          implant.isConnected = false;
        }
      }

      // Update selected implant if it matches
      if (state.selectedImplant?.id === implantId) {
        state.selectedImplant.status = status;
        if (status === 'inactive' || status === 'disconnected') {
          state.selectedImplant.isConnected = false;
        }
      }

      state.lastUpdated = new Date();
    },

    updateImplantHeartbeat: (
      state,
      action: PayloadAction<{ implantId: string; timestamp: Date }>
    ) => {
      const { implantId, timestamp } = action.payload;
      const implant = state.implants.find(i => i.id === implantId);
      if (implant) {
        implant.lastHeartbeat = timestamp;
        implant.isConnected = true;
        if (implant.status !== 'active') {
          implant.status = 'active';
        }
      }

      // Update selected implant if it matches
      if (state.selectedImplant?.id === implantId) {
        state.selectedImplant.lastHeartbeat = timestamp;
        state.selectedImplant.isConnected = true;
        if (state.selectedImplant.status !== 'active') {
          state.selectedImplant.status = 'active';
        }
      }

      state.lastUpdated = new Date();
    },

    setSelectedImplant: (state, action: PayloadAction<EnhancedImplant | null>) => {
      state.selectedImplant = action.payload;
    },

    clearError: state => {
      state.error = null;
    },

    clearImplants: state => {
      state.implants = [];
      state.stats = null;
      state.selectedImplant = null;
      state.lastUpdated = null;
    },
  },
  extraReducers: builder => {
    // Fetch implants
    builder
      .addCase(fetchImplants.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchImplants.fulfilled, (state, action) => {
        state.loading = false;
        state.implants = action.payload;
        state.lastUpdated = new Date();
      })
      .addCase(fetchImplants.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch implant stats
    builder
      .addCase(fetchImplantStats.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchImplantStats.fulfilled, (state, action) => {
        state.loading = false;
        state.stats = action.payload;
        state.lastUpdated = new Date();
      })
      .addCase(fetchImplantStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch implant details
    builder
      .addCase(fetchImplantDetails.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchImplantDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedImplant = action.payload;

        // Also update in the list
        const index = state.implants.findIndex(i => i.id === action.payload.id);
        if (index !== -1) {
          state.implants[index] = action.payload;
        }

        state.lastUpdated = new Date();
      })
      .addCase(fetchImplantDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Disconnect implant
    builder
      .addCase(disconnectImplant.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(disconnectImplant.fulfilled, (state, action) => {
        state.loading = false;
        const implantId = action.payload;

        // Update implant status
        const implant = state.implants.find(i => i.id === implantId);
        if (implant) {
          implant.status = 'disconnected';
          implant.isConnected = false;
        }

        // Update selected implant if it matches
        if (state.selectedImplant?.id === implantId) {
          state.selectedImplant.status = 'disconnected';
          state.selectedImplant.isConnected = false;
        }

        state.lastUpdated = new Date();
      })
      .addCase(disconnectImplant.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  updateImplantStats,
  updateImplantList,
  updateImplantDetails,
  addImplant,
  updateImplantStatus,
  updateImplantHeartbeat,
  setSelectedImplant,
  clearError,
  clearImplants,
} = implantSlice.actions;

export default implantSlice.reducer;
