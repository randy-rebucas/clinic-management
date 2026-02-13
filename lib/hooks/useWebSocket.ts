/**
 * WebSocket React Hook
 * 
 * Provides real-time updates using WebSocket connection instead of polling.
 * This replaces the polling-based useRealtime hook with instant push notifications.
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseWebSocketOptions {
  enabled?: boolean;
  autoConnect?: boolean;
  reconnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: Error | null;
  socket: Socket | null;
}

/**
 * Base WebSocket hook
 * Manages connection lifecycle and authentication
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    enabled = true,
    autoConnect = true,
    reconnect = true,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    socket: null,
  });

  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const authRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const authRetryCountRef = useRef(0);

  // Get auth token from localStorage
  const getAuthToken = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }, []);

  // Connect to WebSocket server
  const connect = useCallback(() => {
    if (!enabled || socketRef.current?.connected) return;

    const token = getAuthToken();
    if (!token) {
      // No token available yet - retry after a short delay (max 5 attempts)
      // This handles the case where auth completes shortly after component mount
      if (authRetryCountRef.current < 5) {
        authRetryCountRef.current++;
        const delay = 500 * authRetryCountRef.current; // Progressive delay: 500ms, 1s, 1.5s, 2s, 2.5s
        
        authRetryTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
        
        setState((prev) => ({
          ...prev,
          error: null,
          connecting: false,
        }));
      } else {
        // Max retries reached - user probably not authenticated
        setState((prev) => ({
          ...prev,
          error: null, // Not an error, just not authenticated
          connecting: false,
        }));
      }
      return;
    }

    // Token found - reset retry counter and proceed with connection
    authRetryCountRef.current = 0;
    if (authRetryTimeoutRef.current) {
      clearTimeout(authRetryTimeoutRef.current);
      authRetryTimeoutRef.current = null;
    }

    setState((prev) => ({ ...prev, connecting: true, error: null }));

    const socket = io({
      path: '/api/socket',
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: reconnect,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setState({
        connected: true,
        connecting: false,
        error: null,
        socket,
      });
      onConnect?.();
    });

    socket.on('disconnect', (reason) => {
      setState((prev) => ({
        ...prev,
        connected: false,
        connecting: false,
      }));
      onDisconnect?.();

      // Attempt manual reconnect if needed
      if (reconnect && reason === 'io server disconnect') {
        reconnectTimeoutRef.current = setTimeout(() => {
          socket.connect();
        }, 2000);
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] ❌ Connection error:', error.message);
      const errorObj = new Error(error.message);
      setState((prev) => ({
        ...prev,
        connected: false,
        connecting: false,
        error: errorObj,
      }));
      onError?.(errorObj);
    });

    socket.on('error', (error) => {
      console.error('[WebSocket] ❌ Socket error:', error);
      const errorObj = new Error(error);
      setState((prev) => ({ ...prev, error: errorObj }));
      onError?.(errorObj);
    });

  }, [enabled, getAuthToken, reconnect, onConnect, onDisconnect, onError]);

  // Disconnect from WebSocket server
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (authRetryTimeoutRef.current) {
      clearTimeout(authRetryTimeoutRef.current);
      authRetryTimeoutRef.current = null;
    }
    authRetryCountRef.current = 0;
    
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setState({
        connected: false,
        connecting: false,
        error: null,
        socket: null,
      });
    }
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, enabled, connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    emit: (event: string, data?: any) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit(event, data);
      }
    },
    on: (event: string, callback: (...args: any[]) => void) => {
      socketRef.current?.on(event, callback);
    },
    off: (event: string, callback?: (...args: any[]) => void) => {
      socketRef.current?.off(event, callback);
    },
  };
}

/**
 * Hook to subscribe to specific WebSocket event
 */
export function useWebSocketEvent<T = any>(
  eventName: string,
  callback: (data: T) => void,
  deps: any[] = []
) {
  const { socket, connected } = useWebSocket();

  useEffect(() => {
    if (!socket || !connected) return;

    const handler = (data: T) => {
      callback(data);
    };

    socket.on(eventName, handler);

    return () => {
      socket.off(eventName, handler);
    };
  }, [socket, connected, eventName, ...deps]);
}
