/**
 * Custom hook for managing WebSocket connection
 */

import { useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { webSocketService } from '../services/websocketService';
import {
  updateImplantStats,
  updateImplantList,
  updateImplantDetails,
  addImplant,
  updateImplantStatus,
  updateImplantHeartbeat,
} from '../store/slices/implantSlice';

export const useWebSocket = () => {
  const dispatch = useDispatch();
  const { token, isAuthenticated } = useSelector((state: RootState) => state.auth);

  const connect = useCallback(async () => {
    if (!token || !isAuthenticated) {
      return;
    }

    try {
      await webSocketService.connect(token);
      console.log('WebSocket connected successfully');

      // Set up event listeners
      webSocketService.onImplantStats(stats => {
        dispatch(updateImplantStats(stats));
      });

      webSocketService.onImplantList(data => {
        dispatch(updateImplantList(data.implants));
      });

      webSocketService.onImplantDetails(data => {
        dispatch(updateImplantDetails(data.implant));
      });

      webSocketService.onImplantRegistered(data => {
        dispatch(addImplant(data.implant));
        console.log('New implant registered:', data.implant.hostname);
      });

      webSocketService.onImplantDisconnected(data => {
        dispatch(
          updateImplantStatus({
            implantId: data.implantId,
            status: 'disconnected',
          })
        );
        console.log('Implant disconnected:', data.implantId, data.reason);
      });

      webSocketService.onImplantHeartbeat(data => {
        dispatch(
          updateImplantHeartbeat({
            implantId: data.implantId,
            timestamp: data.timestamp,
          })
        );
      });

      webSocketService.onImplantStatusChanged(data => {
        dispatch(
          updateImplantStatus({
            implantId: data.implantId,
            status: data.status,
          })
        );
      });

      webSocketService.onError(data => {
        console.error('WebSocket error:', data.message);
      });

      // Request initial data
      webSocketService.requestImplantStats();
      webSocketService.requestImplantList();
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
    }
  }, [token, isAuthenticated, dispatch]);

  const disconnect = useCallback(() => {
    webSocketService.removeAllListeners();
    webSocketService.disconnect();
    console.log('WebSocket disconnected');
  }, []);

  const requestImplantStats = useCallback(() => {
    webSocketService.requestImplantStats();
  }, []);

  const requestImplantList = useCallback(() => {
    webSocketService.requestImplantList();
  }, []);

  const requestImplantDetails = useCallback((implantId: string) => {
    webSocketService.requestImplantDetails(implantId);
  }, []);

  useEffect(() => {
    if (isAuthenticated && token) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, token, connect, disconnect]);

  return {
    socket: webSocketService.getSocket(),
    isConnected: webSocketService.isConnected(),
    connect,
    disconnect,
    requestImplantStats,
    requestImplantList,
    requestImplantDetails,
  };
};
