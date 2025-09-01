// Mock authService before importing
jest.mock('../../../services/authService', () => ({
  authService: {
    login: jest.fn(),
    logout: jest.fn(),
    refreshToken: jest.fn(),
    getCurrentUser: jest.fn(),
  },
}));

import { configureStore } from '@reduxjs/toolkit';
import authReducer, {
  loginUser,
  logoutUser,
  refreshToken,
  clearError,
  setCredentials,
  clearCredentials,
} from '../authSlice';
import { authService } from '../../../services/authService';

const mockedAuthService = authService as jest.Mocked<typeof authService>;

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('authSlice', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        auth: authReducer,
      },
    });
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().auth;
      expect(state).toEqual({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    });

    it('should load token from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('stored-token');

      const storeWithToken = configureStore({
        reducer: {
          auth: authReducer,
        },
      });

      const state = storeWithToken.getState().auth;
      expect(state.token).toBe('stored-token');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('seraph_token');
    });
  });

  describe('synchronous actions', () => {
    it('should clear error', () => {
      // First set an error
      store.dispatch({ type: 'auth/loginUser/rejected', payload: 'Test error' });

      // Then clear it
      store.dispatch(clearError());

      const state = store.getState().auth;
      expect(state.error).toBeNull();
    });

    it('should set credentials', () => {
      const user = { id: '1', username: 'testuser', email: 'test@example.com', role: 'operator' };
      const token = 'test-token';

      store.dispatch(setCredentials({ user, token }));

      const state = store.getState().auth;
      expect(state.user).toEqual(user);
      expect(state.token).toBe(token);
      expect(state.isAuthenticated).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('seraph_token', token);
    });

    it('should clear credentials', () => {
      // First set credentials
      const user = { id: '1', username: 'testuser', email: 'test@example.com', role: 'operator' };
      store.dispatch(setCredentials({ user, token: 'test-token' }));

      // Then clear them
      store.dispatch(clearCredentials());

      const state = store.getState().auth;
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('seraph_token');
    });
  });

  describe('async actions', () => {
    describe('loginUser', () => {
      it('should handle successful login', async () => {
        const mockResponse = {
          user: { id: '1', username: 'testuser', email: 'test@example.com', role: 'operator' },
          token: 'auth-token',
        };
        mockedAuthService.login.mockResolvedValue(mockResponse);

        await store.dispatch(loginUser({ username: 'testuser', password: 'password' }));

        const state = store.getState().auth;
        expect(state.isLoading).toBe(false);
        expect(state.user).toEqual(mockResponse.user);
        expect(state.token).toBe(mockResponse.token);
        expect(state.isAuthenticated).toBe(true);
        expect(state.error).toBeNull();
        expect(localStorageMock.setItem).toHaveBeenCalledWith('seraph_token', mockResponse.token);
      });

      it('should handle login failure', async () => {
        const errorMessage = 'Invalid credentials';
        mockedAuthService.login.mockRejectedValue(new Error(errorMessage));

        await store.dispatch(loginUser({ username: 'testuser', password: 'wrong' }));

        const state = store.getState().auth;
        expect(state.isLoading).toBe(false);
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        expect(state.error).toBe(errorMessage);
      });

      it('should set loading state during login', () => {
        mockedAuthService.login.mockImplementation(() => new Promise(() => {})); // Never resolves

        store.dispatch(loginUser({ username: 'testuser', password: 'password' }));

        const state = store.getState().auth;
        expect(state.isLoading).toBe(true);
        expect(state.error).toBeNull();
      });
    });

    describe('logoutUser', () => {
      it('should handle successful logout', async () => {
        // First login
        store.dispatch(
          setCredentials({
            user: { id: '1', username: 'testuser', email: 'test@example.com', role: 'operator' },
            token: 'auth-token',
          })
        );

        mockedAuthService.logout.mockResolvedValue();

        await store.dispatch(logoutUser());

        const state = store.getState().auth;
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('seraph_token');
      });
    });

    describe('refreshToken', () => {
      it('should handle successful token refresh', async () => {
        const newToken = 'new-auth-token';
        mockedAuthService.refreshToken.mockResolvedValue({ token: newToken });

        await store.dispatch(refreshToken());

        const state = store.getState().auth;
        expect(state.token).toBe(newToken);
        expect(localStorageMock.setItem).toHaveBeenCalledWith('seraph_token', newToken);
      });

      it('should clear credentials on refresh failure', async () => {
        // First set credentials
        store.dispatch(
          setCredentials({
            user: { id: '1', username: 'testuser', email: 'test@example.com', role: 'operator' },
            token: 'old-token',
          })
        );

        mockedAuthService.refreshToken.mockRejectedValue(new Error('Token expired'));

        await store.dispatch(refreshToken());

        const state = store.getState().auth;
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('seraph_token');
      });
    });
  });
});
