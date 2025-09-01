// Mock axios before importing authService
const mockAxiosInstance = {
  post: jest.fn(),
  get: jest.fn(),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

jest.mock('axios', () => ({
  create: jest.fn(() => mockAxiosInstance),
}));

import { authService } from '../authService';

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

// Mock window.location
delete (window as any).location;
window.location = { href: '' } as any;

describe('authService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should make POST request to /auth/login', async () => {
      const mockResponse = {
        data: {
          user: { id: '1', username: 'testuser', email: 'test@example.com', role: 'operator' },
          token: 'auth-token',
        },
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const credentials = { username: 'testuser', password: 'password' };
      const result = await authService.login(credentials);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/login', credentials);
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle login error', async () => {
      const errorResponse = {
        response: {
          status: 401,
          data: { message: 'Invalid credentials' },
        },
      };
      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      const credentials = { username: 'testuser', password: 'wrong' };

      await expect(authService.login(credentials)).rejects.toEqual(errorResponse);
    });
  });

  describe('logout', () => {
    it('should make POST request to /auth/logout', async () => {
      mockAxiosInstance.post.mockResolvedValue({});

      await authService.logout();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/logout');
    });
  });

  describe('refreshToken', () => {
    it('should make POST request to /auth/refresh', async () => {
      const mockResponse = {
        data: { token: 'new-auth-token' },
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await authService.refreshToken();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/refresh');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getCurrentUser', () => {
    it('should make GET request to /auth/me', async () => {
      const mockResponse = {
        data: { id: '1', username: 'testuser', email: 'test@example.com', role: 'operator' },
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await authService.getCurrentUser();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/auth/me');
      expect(result).toEqual(mockResponse.data);
    });
  });
});
