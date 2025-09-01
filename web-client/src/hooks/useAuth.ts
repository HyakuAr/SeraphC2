import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { loginUser, logoutUser, refreshToken } from '../store/slices/authSlice';

export const useAuth = () => {
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);

  const login = async (credentials: { username: string; password: string }) => {
    return dispatch(loginUser(credentials));
  };

  const logout = async () => {
    return dispatch(logoutUser());
  };

  const refresh = async () => {
    return dispatch(refreshToken());
  };

  return {
    user: auth.user,
    token: auth.token,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,
    requiresMfa: auth.requiresMfa,
    pendingMfaUser: auth.pendingMfaUser,
    login,
    logout,
    refresh,
  };
};
