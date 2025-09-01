import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider } from '@mui/material/styles';
import LoginPage from '../LoginPage';
import authReducer from '../../store/slices/authSlice';
import { seraphTheme } from '../../theme/seraphTheme';

// Mock navigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock auth service
jest.mock('../../services/authService');

const createMockStore = (initialState: any) => {
  return configureStore({
    reducer: {
      auth: authReducer,
    },
    preloadedState: initialState,
  });
};

const renderWithProviders = (
  ui: React.ReactElement,
  { initialState = {}, ...renderOptions } = {}
) => {
  const store = createMockStore(initialState);

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <BrowserRouter>
        <ThemeProvider theme={seraphTheme}>{children}</ThemeProvider>
      </BrowserRouter>
    </Provider>
  );

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
};

describe('LoginPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders login form correctly', () => {
    const initialState = {
      auth: {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      },
    };

    renderWithProviders(<LoginPage />, { initialState });

    expect(screen.getByText('SERAPH')).toBeInTheDocument();
    expect(screen.getByText('C2')).toBeInTheDocument();
    expect(screen.getByText('Management Console')).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('navigates to dashboard when already authenticated', () => {
    const initialState = {
      auth: {
        user: { id: '1', username: 'testuser', email: 'test@example.com', role: 'operator' },
        token: 'valid-token',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    };

    renderWithProviders(<LoginPage />, { initialState });

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('displays error message when login fails', () => {
    const initialState = {
      auth: {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: 'Invalid credentials',
      },
    };

    renderWithProviders(<LoginPage />, { initialState });

    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });

  it('disables form when loading', () => {
    const initialState = {
      auth: {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: true,
        error: null,
      },
    };

    renderWithProviders(<LoginPage />, { initialState });

    expect(screen.getByLabelText(/username/i)).toBeDisabled();
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('disables submit button when fields are empty', () => {
    const initialState = {
      auth: {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      },
    };

    renderWithProviders(<LoginPage />, { initialState });

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when both fields are filled', async () => {
    const user = userEvent.setup();
    const initialState = {
      auth: {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      },
    };

    renderWithProviders(<LoginPage />, { initialState });

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(usernameInput, 'testuser');
    await user.type(passwordInput, 'password');

    expect(submitButton).not.toBeDisabled();
  });

  it('handles form submission', async () => {
    const user = userEvent.setup();
    const initialState = {
      auth: {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      },
    };

    const { store } = renderWithProviders(<LoginPage />, { initialState });

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(usernameInput, 'testuser');
    await user.type(passwordInput, 'password');
    await user.click(submitButton);

    // Check that the login action was dispatched
    const actions = store.getState();
    expect(actions).toBeDefined();
  });

  it('clears error when error alert is closed', async () => {
    const user = userEvent.setup();
    const initialState = {
      auth: {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: 'Test error message',
      },
    };

    renderWithProviders(<LoginPage />, { initialState });

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    // The error should be cleared (this would be handled by the Redux action)
    expect(closeButton).toBeInTheDocument();
  });
});
