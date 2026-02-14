/**
 * Appointment WebSocket Hook
 * 
 * Real-time appointment updates using WebSocket.
 * Replaces polling-based useAppointmentRealtime hook.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket, useWebSocketEvent } from './useWebSocket';

interface AppointmentFilters {
  date?: string;
  doctorId?: string;
  status?: string;
}

interface UseAppointmentWebSocketOptions {
  enabled?: boolean;
  filters?: AppointmentFilters;
  onUpdate?: (appointments: any[]) => void;
}

export function useAppointmentWebSocket(options: UseAppointmentWebSocketOptions = {}) {
  const { enabled = true, filters, onUpdate } = options;

  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { socket, connected } = useWebSocket({ enabled });

  // Fetch initial appointments data
  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters?.date) {
        params.append('date', filters.date);
      }
      if (filters?.doctorId) {
        params.append('doctorId', filters.doctorId);
      }
      if (filters?.status) {
        params.append('status', filters.status);
      }

      const response = await fetch(`/api/appointments?${params.toString()}`);
      
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch appointments');
      }

      const data = await response.json();
      setAppointments(Array.isArray(data) ? data : data.appointments || []);
      onUpdate?.(Array.isArray(data) ? data : data.appointments || []);
      
    } catch (err) {
      console.error('[Appointment WebSocket] Fetch error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch appointments'));
    } finally {
      setLoading(false);
    }
  }, [filters, onUpdate]);

  // Subscribe to appointment updates when connected
  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit('subscribe:appointments', filters);

    // Fetch initial data
    fetchAppointments();

    return () => {
      socket.emit('unsubscribe:appointments');
    };
  }, [socket, connected, filters, fetchAppointments]);

  // Listen for appointment update events
  useWebSocketEvent('appointment:updated', (data: { appointment: any; timestamp: number }) => {
    
    setAppointments((prevAppointments) => {
      // Check if appointment exists
      const existingIndex = prevAppointments.findIndex(
        (apt) => apt._id.toString() === data.appointment._id.toString()
      );

      if (existingIndex >= 0) {
        // Update existing appointment
        const newAppointments = [...prevAppointments];
        newAppointments[existingIndex] = data.appointment;
        
        // Filter out if date/status no longer matches
        const aptDate = new Date(data.appointment.date).toISOString().split('T')[0];
        if (filters?.date && aptDate !== filters.date) {
          return newAppointments.filter((_, i) => i !== existingIndex);
        }
        if (filters?.status && data.appointment.status !== filters.status) {
          return newAppointments.filter((_, i) => i !== existingIndex);
        }
        
        return newAppointments;
      } else {
        // Add new appointment if it matches filters
        const aptDate = new Date(data.appointment.date).toISOString().split('T')[0];
        const matchesDate = !filters?.date || aptDate === filters.date;
        const matchesStatus = !filters?.status || data.appointment.status === filters.status;
        const matchesDoctor = !filters?.doctorId || data.appointment.doctor?._id === filters.doctorId;
        
        if (matchesDate && matchesStatus && matchesDoctor) {
          return [...prevAppointments, data.appointment];
        }
        return prevAppointments;
      }
    });

    onUpdate?.(appointments);
  }, [filters, appointments, onUpdate]);

  // Listen for bulk updates
  useWebSocketEvent('appointments:bulk-update', () => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Listen for queue updates (queue changes may affect appointments)
  useWebSocketEvent('queue:updated', (data: { queueItem: any }) => {
    fetchAppointments();
  }, [fetchAppointments]);

  return {
    appointments,
    loading,
    error,
    refetch: fetchAppointments,
    connected,
  };
}
