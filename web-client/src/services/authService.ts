import axios from 'axios';
import { User } from '../store/slices/authSlice';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  config => {
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

// Response interceptor to handle token refresh
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

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
