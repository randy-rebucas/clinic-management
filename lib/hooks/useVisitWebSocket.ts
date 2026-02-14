/**
 * Visit WebSocket Hook
 * 
 * Real-time visit updates using WebSocket.
 * Replaces polling-based useVisitRealtime hook.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket, useWebSocketEvent } from './useWebSocket';

interface VisitFilters {
  patientId?: string;
  doctorId?: string;
  status?: string;
}

interface UseVisitWebSocketOptions {
  enabled?: boolean;
  filters?: VisitFilters;
  onUpdate?: (visits: any[]) => void;
}

export function useVisitWebSocket(options: UseVisitWebSocketOptions = {}) {
  const { enabled = true, filters, onUpdate } = options;

  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { socket, connected } = useWebSocket({ enabled });

  // Fetch initial visits data
  const fetchVisits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters?.patientId) {
        params.append('patientId', filters.patientId);
      }
      if (filters?.doctorId) {
        params.append('doctorId', filters.doctorId);
      }
      if (filters?.status) {
        params.append('status', filters.status);
      }

      const response = await fetch(`/api/visits?${params.toString()}`);
      
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch visits');
      }

      const data = await response.json();
      setVisits(Array.isArray(data) ? data : data.visits || []);
      onUpdate?.(Array.isArray(data) ? data : data.visits || []);
      
    } catch (err) {
      console.error('[Visit WebSocket] Fetch error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch visits'));
    } finally {
      setLoading(false);
    }
  }, [filters, onUpdate]);

  // Subscribe to visit updates when connected
  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit('subscribe:visits', filters);

    // Fetch initial data
    fetchVisits();

    return () => {
      socket.emit('unsubscribe:visits');
    };
  }, [socket, connected, filters, fetchVisits]);

  // Listen for visit update events
  useWebSocketEvent('visit:updated', (data: { visit: any; timestamp: number }) => {
    
    setVisits((prevVisits) => {
      // Check if visit exists
      const existingIndex = prevVisits.findIndex(
        (v) => v._id.toString() === data.visit._id.toString()
      );

      if (existingIndex >= 0) {
        // Update existing visit
        const newVisits = [...prevVisits];
        newVisits[existingIndex] = data.visit;
        
        // Filter out if status no longer matches
        if (filters?.status && data.visit.status !== filters.status) {
          return newVisits.filter((_, i) => i !== existingIndex);
        }
        
        return newVisits;
      } else {
        // Add new visit if it matches filters
        const matchesStatus = !filters?.status || data.visit.status === filters.status;
        const matchesDoctor = !filters?.doctorId || data.visit.doctor?._id === filters.doctorId;
        const matchesPatient = !filters?.patientId || data.visit.patient?._id === filters.patientId;
        
        if (matchesStatus && matchesDoctor && matchesPatient) {
          return [...prevVisits, data.visit];
        }
        return prevVisits;
      }
    });

    onUpdate?.(visits);
  }, [filters, visits, onUpdate]);

  // Listen for prescription creation (linked to visits)
  useWebSocketEvent('visit:prescription-created', (data: { prescription: any; visitId: string }) => {
    
    // Update visit if prescription was created for it
    setVisits((prevVisits) =>
      prevVisits.map((visit) => {
        if (visit._id.toString() === data.visitId) {
          return {
            ...visit,
            prescriptions: [...(visit.prescriptions || []), data.prescription._id],
          };
        }
        return visit;
      })
    );
  }, []);

  // Listen for bulk updates
  useWebSocketEvent('visits:bulk-update', () => {
    fetchVisits();
  }, [fetchVisits]);

  // Listen for queue updates (patients moving through queue affects visits)
  useWebSocketEvent('queue:updated', (data: { queueItem: any }) => {
    // Only refetch if queue status is in-progress (patient ready for visit)
    if (data.queueItem.status === 'in-progress') {
      fetchVisits();
    }
  }, [fetchVisits]);

  return {
    visits,
    loading,
    error,
    refetch: fetchVisits,
    connected,
  };
}
