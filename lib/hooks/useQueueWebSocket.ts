/**
 * Queue WebSocket Hook
 * 
 * Real-time queue updates using WebSocket.
 * Replaces polling-based useQueueRealtime hook.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket, useWebSocketEvent } from './useWebSocket';

interface QueueFilters {
  status?: ('waiting' | 'called' | 'in-progress' | 'completed' | 'cancelled')[];
  doctorId?: string;
  roomId?: string;
}

interface UseQueueWebSocketOptions {
  enabled?: boolean;
  filters?: QueueFilters;
  onUpdate?: (queue: any[]) => void;
}

export function useQueueWebSocket(options: UseQueueWebSocketOptions = {}) {
  const { enabled = true, filters, onUpdate } = options;

  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { socket, connected } = useWebSocket({ enabled });

  // Fetch initial queue data
  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters?.status?.length) {
        params.append('status', filters.status.join(','));
      }
      if (filters?.doctorId) {
        params.append('doctorId', filters.doctorId);
      }
      if (filters?.roomId) {
        params.append('roomId', filters.roomId);
      }

      const response = await fetch(`/api/queue?${params.toString()}`);
      
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch queue');
      }

      const data = await response.json();
      setQueue(Array.isArray(data) ? data : data.queue || []);
      onUpdate?.(Array.isArray(data) ? data : data.queue || []);
      
    } catch (err) {
      console.error('[Queue WebSocket] Fetch error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch queue'));
    } finally {
      setLoading(false);
    }
  }, [filters, onUpdate]);

  // Subscribe to queue updates when connected
  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit('subscribe:queue', filters);

    // Fetch initial data
    fetchQueue();

    return () => {
      socket.emit('unsubscribe:queue');
    };
  }, [socket, connected, filters, fetchQueue]);

  // Listen for queue update events
  useWebSocketEvent('queue:updated', (data: { queueItem: any; timestamp: number }) => {
    
    setQueue((prevQueue) => {
      // Check if item exists in current queue
      const existingIndex = prevQueue.findIndex(
        (item) => item._id.toString() === data.queueItem._id.toString()
      );

      if (existingIndex >= 0) {
        // Update existing item
        const newQueue = [...prevQueue];
        newQueue[existingIndex] = data.queueItem;
        
        // Filter out if status no longer matches
        if (filters?.status && !filters.status.includes(data.queueItem.status)) {
          return newQueue.filter((_, i) => i !== existingIndex);
        }
        
        return newQueue;
      } else {
        // Add new item if it matches filters
        if (!filters?.status || filters.status.includes(data.queueItem.status)) {
          return [...prevQueue, data.queueItem];
        }
        return prevQueue;
      }
    });

    onUpdate?.(queue);
  }, [filters, queue, onUpdate]);

  // Listen for bulk updates (refetch all)
  useWebSocketEvent('queue:bulk-update', () => {
    fetchQueue();
  }, [fetchQueue]);

  // Listen for related updates (appointments also trigger queue refresh in some cases)
  useWebSocketEvent('appointment:updated', (data: { appointment: any }) => {
    fetchQueue();
  }, [fetchQueue]);

  return {
    queue,
    loading,
    error,
    refetch: fetchQueue,
    connected,
  };
}
