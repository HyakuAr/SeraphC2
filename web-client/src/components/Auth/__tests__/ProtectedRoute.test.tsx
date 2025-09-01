import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import ProtectedRoute from '../ProtectedRoute';
import authReducer from '../../../store/slices/authSlice';

// Mock navigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Navigate: ({ to }: { to: string }) => {
    mockNavigate(to);
    return <div data-testid="navigate">{to}</div>;
  },
}));

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
      <BrowserRouter>{children}</BrowserRouter>
    </Provider>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders children when user is authenticated', () => {
    const initialState = {
      auth: {
        user: { id: '1', username: 'testuser', email: 'test@example.com', role: 'operator' },
        token: 'valid-token',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    };

    renderWithProviders(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>,
      { initialState }
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });

  it('redirects to login when user is not authenticated and no token', () => {
    const initialState = {
      auth: {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      },
    };

    renderWithProviders(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>,
      { initialState }
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('navigate')).toHaveTextContent('/login');
  });

  it('renders children when user is not authenticated but has token', () => {
    const initialState = {
      auth: {
        user: null,
        token: 'valid-token',
        isAuthenticated: false,
        isLoading: false,
        error: null,
      },
    };

    renderWithProviders(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>,
      { initialState }
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });
});
