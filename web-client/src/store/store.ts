import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import implantReducer from './slices/implantSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    implants: implantReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
