import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Box } from '@mui/material';
import { RootState, AppDispatch } from './store/store';
import { setCredentials } from './store/slices/authSlice';
import { authService } from './services/authService';
import Layout from './components/Layout/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import SeraphWatermark from './components/Branding/SeraphWatermark';

function App() {
  const dispatch = useDispatch<AppDispatch>();
  const { isAuthenticated, token } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    // Check if user is already authenticated on app load
    const checkAuth = async () => {
      if (token) {
        try {
          const user = await authService.getCurrentUser();
          dispatch(setCredentials({ user, token }));
        } catch (error) {
          // Token is invalid, will be handled by interceptor
          console.error('Authentication check failed:', error);
        }
      }
    };

    checkAuth();
  }, [dispatch, token]);

  return (
    <Box sx={{ minHeight: '100vh', position: 'relative' }}>
      <SeraphWatermark />
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <DashboardPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
        />
        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
        />
      </Routes>
    </Box>
  );
}

export default App;
