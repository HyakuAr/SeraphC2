import axios from 'axios';
import { User } from '../store/slices/authSlice';
import { getApiUrl, resetApiUrl } from './apiDiscovery';

// Create axios instance with dynamic base URL
const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to set dynamic base URL and add auth token
api.interceptors.request.use(
  async config => {
    // Set the base URL dynamically
    if (!config.baseURL) {
      const apiUrl = await getApiUrl();
      config.baseURL = `${apiUrl}/api`;
    }

    // Add auth token
    const token = localStorage.getItem('seraph_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh and connection errors
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

    // Handle connection errors by retrying API discovery
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED') {
      if (!originalRequest._apiRetry) {
        originalRequest._apiRetry = true;
        console.warn('🔄 Connection failed, retrying with API discovery...');
        resetApiUrl(); // Reset cached URL to force rediscovery
        return api(originalRequest);
      }
    }

    // Handle 401 unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshResponse = await authService.refreshToken();
        localStorage.setItem('seraph_token', refreshResponse.token);
        originalRequest.headers.Authorization = `Bearer ${refreshResponse.token}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('seraph_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export interface LoginCredentials {
  username: string;
  password: string;
  mfaToken?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface LoginResponse {
  success: boolean;
  requiresMfa?: boolean;
  operator?: {
    id: string;
    username: string;
    email: string;
    role: string;
    lastLogin: Date;
    mfaConfigured: boolean;
  };
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
  error?: string;
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },

  async refreshToken(): Promise<{ token: string }> {
    const response = await api.post('/auth/refresh');
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

export default api;
