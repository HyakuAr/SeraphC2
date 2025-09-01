import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authService } from '../../services/authService';

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  mfaConfigured?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  requiresMfa: boolean;
  pendingMfaUser: User | null;
}

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('seraph_token'),
  isAuthenticated: false,
  isLoading: false,
  error: null,
  requiresMfa: false,
  pendingMfaUser: null,
};

// Async thunks for authentication
export const loginUser = createAsyncThunk(
  'auth/login',
  async (
    credentials: { username: string; password: string; mfaToken?: string },
    { rejectWithValue }
  ) => {
    try {
      const response = await authService.login(credentials);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Login failed');
    }
  }
);

export const logoutUser = createAsyncThunk('auth/logout', async (_, { rejectWithValue }) => {
  try {
    await authService.logout();
    return null;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Logout failed');
  }
});

export const refreshToken = createAsyncThunk('auth/refresh', async (_, { rejectWithValue }) => {
  try {
    const response = await authService.refreshToken();
    return response;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Token refresh failed');
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: state => {
      state.error = null;
    },
    setCredentials: (state, action: PayloadAction<{ user: User; token: string }>) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
      state.requiresMfa = false;
      state.pendingMfaUser = null;
      localStorage.setItem('seraph_token', action.payload.token);
    },
    clearCredentials: state => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.requiresMfa = false;
      state.pendingMfaUser = null;
      localStorage.removeItem('seraph_token');
    },
    clearMfaState: state => {
      state.requiresMfa = false;
      state.pendingMfaUser = null;
    },
  },
  extraReducers: builder => {
    builder
      // Login
      .addCase(loginUser.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;

        if (action.payload.requiresMfa) {
          // MFA required - store pending user info
          state.requiresMfa = true;
          state.pendingMfaUser = action.payload.operator
            ? {
                id: action.payload.operator.id,
                username: action.payload.operator.username,
                email: action.payload.operator.email,
                role: action.payload.operator.role,
                mfaConfigured: action.payload.operator.mfaConfigured,
              }
            : null;
        } else if (action.payload.tokens && action.payload.operator) {
          // Login successful
          state.user = {
            id: action.payload.operator.id,
            username: action.payload.operator.username,
            email: action.payload.operator.email,
            role: action.payload.operator.role,
            mfaConfigured: action.payload.operator.mfaConfigured,
          };
          state.token = action.payload.tokens.accessToken;
          state.isAuthenticated = true;
          state.requiresMfa = false;
          state.pendingMfaUser = null;
          localStorage.setItem('seraph_token', action.payload.tokens.accessToken);
        }
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
        state.requiresMfa = false;
        state.pendingMfaUser = null;
      })
      // Logout
      .addCase(logoutUser.fulfilled, state => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        localStorage.removeItem('seraph_token');
      })
      // Refresh token
      .addCase(refreshToken.fulfilled, (state, action) => {
        state.token = action.payload.token;
        localStorage.setItem('seraph_token', action.payload.token);
      })
      .addCase(refreshToken.rejected, state => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        localStorage.removeItem('seraph_token');
      });
  },
});

export const { clearError, setCredentials, clearCredentials, clearMfaState } = authSlice.actions;
export default authSlice.reducer;
