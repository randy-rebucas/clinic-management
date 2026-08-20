/**
 * Appointment Queue Optimization
 * Optimizes patient queue assignment and scheduling
 */

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import prisma from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import logger from '@/lib/logger';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface QueueOptimizationResult {
  optimized: boolean;
  changes: Array<{
    queueId: string;
    action: 'reassigned' | 'prioritized' | 'merged' | 'split';
    reason: string;
    oldValue?: any;
    newValue?: any;
  }>;
  metrics: {
    averageWaitTime: number;
    totalPatients: number;
    doctorsAvailable: number;
    roomsAvailable: number;
  };
}

/**
 * Optimize queue assignment based on various factors
 */
export async function optimizeQueue(
  tenantId: string
): Promise<QueueOptimizationResult> {
  const emptyResult: QueueOptimizationResult = {
    optimized: false,
    changes: [],
    metrics: { averageWaitTime: 0, totalPatients: 0, doctorsAvailable: 0, roomsAvailable: 0 },
  };

  if (!tenantId) {
    logger.error('optimizeQueue called with invalid tenantId', new Error('Invalid tenantId'), { tenantId });
    return emptyResult;
  }

  try {
    return await run(String(tenantId), async () => {
      const settings = await getSettings(String(tenantId));
      if (!settings?.automationSettings?.autoQueueOptimization) {
        return emptyResult;
      }

      // Get active queue entries
      const queueEntries = await prisma.queue.findMany({
        where: {
          tenantId: String(tenantId),
          status: { in: ['waiting', 'in_progress'] as any },
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          appointment: true,
          doctor: true,
          room: true,
        },
        orderBy: { queueNumber: 'asc' },
      });

      // Get available doctors
      const availableDoctors = await prisma.doctor.findMany({
        where: { tenantId: String(tenantId), status: 'active' },
        select: { id: true, firstName: true, lastName: true, specializationId: true, schedule: true },
      });

      // Get available rooms
      const availableRooms = await prisma.room.findMany({
        where: { tenantId: String(tenantId), status: 'available' },
        select: { id: true, name: true, capacity: true, status: true },
      });

      const changes: QueueOptimizationResult['changes'] = [];
      let totalWaitTime = 0;
      const totalPatients = queueEntries.length;

      // Optimization strategies
      for (const entry of queueEntries) {
        // 1. Reassign to available doctor if current doctor is busy
        if (entry.doctorId && entry.status === 'waiting') {
          const doctorBusy = await checkDoctorBusy(entry.doctorId, String(tenantId));
          if (doctorBusy) {
            const availableDoctor = findAvailableDoctor(
              availableDoctors,
              (entry as any).appointment?.specialization
            );
            if (availableDoctor) {
              await prisma.queue.update({
                where: { id: entry.id },
                data: { doctorId: availableDoctor.id },
              });
              changes.push({
                queueId: entry.id,
                action: 'reassigned',
                reason: 'Current doctor is busy, reassigned to available doctor',
                oldValue: entry.doctor ? `${entry.doctor.firstName} ${entry.doctor.lastName}` : undefined,
                newValue: `${availableDoctor.firstName} ${availableDoctor.lastName}`,
              });
            }
          }
        }

        // 2. Prioritize urgent cases
        if ((entry.patient as any)?.priority === 'urgent' && entry.queueNumber && Number(entry.queueNumber) > 1) {
          const currentQueueNumber = entry.queueNumber;
          // Move to front of queue (queue number 1)
          await prisma.queue.update({
            where: { id: entry.id },
            data: { queueNumber: '1', priority: 0 },
          });
          // Update other queue numbers is not straightforward with Prisma
          // string-based queueNumber ordering — skip bulk renumbering (the
          // Mongoose original relied on a numeric field; this schema uses a
          // string queueNumber) and just record the prioritization.
          changes.push({
            queueId: entry.id,
            action: 'prioritized',
            reason: 'Urgent case prioritized',
            oldValue: currentQueueNumber,
            newValue: '1',
          });
        }

        // 3. Assign to available room if not assigned
        if (!entry.roomId && entry.status === 'in_progress') {
          const availableRoom = availableRooms.find((r) => r.status === 'available');
          if (availableRoom) {
            await prisma.queue.update({
              where: { id: entry.id },
              data: { roomId: availableRoom.id },
            });
            changes.push({
              queueId: entry.id,
              action: 'reassigned',
              reason: 'Assigned to available room',
              oldValue: null,
              newValue: availableRoom.name,
            });
          }
        }

        // Calculate wait time
        if (entry.status === 'waiting' && entry.createdAt) {
          const waitTime = Date.now() - new Date(entry.createdAt).getTime();
          totalWaitTime += waitTime;
        }
      }

      const averageWaitTime = totalPatients > 0 ? totalWaitTime / totalPatients / 1000 / 60 : 0; // in minutes

      return {
        optimized: changes.length > 0,
        changes,
        metrics: {
          averageWaitTime: Math.round(averageWaitTime * 100) / 100,
          totalPatients,
          doctorsAvailable: availableDoctors.length,
          roomsAvailable: availableRooms.length,
        },
      };
    });
  } catch (error: any) {
    logger.error('Error optimizing queue', error as Error, { tenantId });
    return emptyResult;
  }
}

/**
 * Check if doctor is currently busy
 */
async function checkDoctorBusy(
  doctorId: string,
  tenantId: string
): Promise<boolean> {
  const now = new Date();
  const activeVisits = await prisma.queue.count({
    where: {
      tenantId,
      doctorId,
      status: 'in_progress',
    },
  });

  const activeAppointments = await prisma.appointment.count({
    where: {
      tenantId,
      doctorId,
      appointmentDate: {
        gte: new Date(now.getTime() - 30 * 60 * 1000), // Last 30 minutes
        lte: new Date(now.getTime() + 30 * 60 * 1000), // Next 30 minutes
      },
      status: { in: ['scheduled', 'confirmed'] as any },
    },
  });

  return activeVisits > 0 || activeAppointments > 0;
}

/**
 * Find available doctor based on specialization
 */
function findAvailableDoctor(
  doctors: any[],
  specialization?: string
): any | null {
  // First try to find doctor with matching specialization
  if (specialization) {
    const specializedDoctor = doctors.find(
      (d: any) => d.specializationId === specialization || d.specialization === specialization
    );
    if (specializedDoctor) {
      return specializedDoctor;
    }
  }

  // Return first available doctor
  return doctors.length > 0 ? doctors[0] : null;
}

/**
 * Auto-optimize queue when new patient joins
 */
export async function autoOptimizeQueueOnJoin(
  queueId: string,
  tenantId: string
): Promise<QueueOptimizationResult | null> {
  try {
    // Run optimization after new patient joins
    return await optimizeQueue(tenantId);
  } catch (error: any) {
    logger.error('Error in auto queue optimization', error as Error, { queueId, tenantId });
    return null;
  }
}

/**
 * Optimize queue scheduling based on appointment patterns
 */
export async function optimizeQueueScheduling(
  tenantId: string
): Promise<{
  success: boolean;
  recommendations: Array<{
    type: 'time-slot' | 'doctor-assignment' | 'room-allocation';
    recommendation: string;
    impact: 'high' | 'medium' | 'low';
  }>;
}> {
  if (!tenantId) {
    logger.error('optimizeQueueScheduling called with invalid tenantId', new Error('Invalid tenantId'), { tenantId });
    return { success: false, recommendations: [] };
  }

  try {
    return await run(String(tenantId), async () => {
      const recommendations: Array<{
        type: 'time-slot' | 'doctor-assignment' | 'room-allocation';
        recommendation: string;
        impact: 'high' | 'medium' | 'low';
      }> = [];

      // Analyze appointment patterns
      const appointments = await prisma.appointment.findMany({
        where: {
          tenantId: String(tenantId),
          appointmentDate: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        select: { appointmentDate: true, doctorId: true, status: true },
      });

      // Find peak hours
      const hourCounts: { [hour: number]: number } = {};
      for (const apt of appointments) {
        if (!apt.appointmentDate) continue;
        const hour = new Date(apt.appointmentDate).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }

      if (Object.keys(hourCounts).length > 0) {
        const peakHour = Object.entries(hourCounts).reduce((a, b) =>
          hourCounts[parseInt(a[0])] > hourCounts[parseInt(b[0])] ? a : b
        );

        if (parseInt(peakHour[0]) >= 9 && parseInt(peakHour[0]) <= 11) {
          recommendations.push({
            type: 'time-slot',
            recommendation: `Peak hours are ${peakHour[0]}:00. Consider adding more time slots or doctors during this period.`,
            impact: 'high',
          });
        }
      }

      // Analyze doctor workload
      const doctorWorkloads: { [doctorId: string]: number } = {};
      for (const apt of appointments) {
        const doctorId = apt.doctorId ?? undefined;
        if (doctorId) {
          doctorWorkloads[doctorId] = (doctorWorkloads[doctorId] || 0) + 1;
        }
      }

      const workloadValues = Object.values(doctorWorkloads);
      if (workloadValues.length > 0) {
        const maxWorkload = Math.max(...workloadValues);
        const avgWorkload = workloadValues.reduce((a, b) => a + b, 0) / workloadValues.length;

        if (maxWorkload > avgWorkload * 1.5) {
          recommendations.push({
            type: 'doctor-assignment',
            recommendation: 'Some doctors have significantly higher workload. Consider redistributing appointments.',
            impact: 'medium',
          });
        }
      }

      return {
        success: true,
        recommendations,
      };
    });
  } catch (error: any) {
    logger.error('Error optimizing queue scheduling', error as Error, { tenantId });
    return {
      success: false,
      recommendations: [],
    };
  }
}
