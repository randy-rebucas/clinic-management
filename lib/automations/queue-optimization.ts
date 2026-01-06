/**
 * Appointment Queue Optimization
 * Optimizes patient queue assignment and scheduling
 */

import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Room from '@/models/Room';
import { getSettings } from '@/lib/settings';
import logger from '@/lib/logger';
import { Types } from 'mongoose';

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
  tenantId: string | Types.ObjectId
): Promise<QueueOptimizationResult> {
  try {
    await connectDB();

    const settings = await getSettings(tenantId.toString());
    if (!settings?.automationSettings?.autoQueueOptimization) {
      return {
        optimized: false,
        changes: [],
        metrics: {
          averageWaitTime: 0,
          totalPatients: 0,
          doctorsAvailable: 0,
          roomsAvailable: 0,
        },
      };
    }

    const tenantIdObj = typeof tenantId === 'string' 
      ? new Types.ObjectId(tenantId) 
      : tenantId;

    // Get active queue entries
    const queueEntries = await Queue.find({
      tenantId: tenantIdObj,
      status: { $in: ['waiting', 'in-progress'] },
    })
      .populate('patient', 'firstName lastName priority')
      .populate('appointment')
      .populate('doctor')
      .populate('room')
      .sort({ queueNumber: 1 })
      .lean();

    // Get available doctors
    const availableDoctors = await Doctor.find({
      tenantId: tenantIdObj,
      status: 'active',
    }).select('name specialization schedule').lean();

    // Get available rooms
    const availableRooms = await Room.find({
      tenantId: tenantIdObj,
      status: 'available',
    }).select('name capacity').lean();

    const changes: QueueOptimizationResult['changes'] = [];
    let totalWaitTime = 0;
    const totalPatients = queueEntries.length;

    // Optimization strategies
    for (const entry of queueEntries) {
      const entryObj = entry as any;

      // 1. Reassign to available doctor if current doctor is busy
      if (entryObj.doctor && entryObj.status === 'waiting') {
        const doctorBusy = await checkDoctorBusy(entryObj.doctor._id, tenantIdObj);
        if (doctorBusy) {
          const availableDoctor = findAvailableDoctor(
            availableDoctors,
            entryObj.appointment?.specialization
          );
          if (availableDoctor) {
            await Queue.updateOne(
              { _id: entryObj._id },
              { doctor: availableDoctor._id }
            );
            changes.push({
              queueId: entryObj._id.toString(),
              action: 'reassigned',
              reason: 'Current doctor is busy, reassigned to available doctor',
              oldValue: entryObj.doctor.name,
              newValue: availableDoctor.name,
            });
          }
        }
      }

      // 2. Prioritize urgent cases
      if (entryObj.patient?.priority === 'urgent' && entryObj.queueNumber > 1) {
        const currentQueueNumber = entryObj.queueNumber;
        // Move to front of queue (queue number 1)
        await Queue.updateOne(
          { _id: entryObj._id },
          { queueNumber: 1, priority: 'high' }
        );
        // Update other queue numbers
        await Queue.updateMany(
          {
            tenantId: tenantIdObj,
            queueNumber: { $lt: currentQueueNumber },
            _id: { $ne: entryObj._id },
          },
          { $inc: { queueNumber: 1 } }
        );
        changes.push({
          queueId: entryObj._id.toString(),
          action: 'prioritized',
          reason: 'Urgent case prioritized',
          oldValue: currentQueueNumber,
          newValue: 1,
        });
      }

      // 3. Assign to available room if not assigned
      if (!entryObj.room && entryObj.status === 'in-progress') {
        const availableRoom = availableRooms.find((r: any) => r.status === 'available');
        if (availableRoom) {
          await Queue.updateOne(
            { _id: entryObj._id },
            { room: availableRoom._id }
          );
          changes.push({
            queueId: entryObj._id.toString(),
            action: 'reassigned',
            reason: 'Assigned to available room',
            oldValue: null,
            newValue: availableRoom.name,
          });
        }
      }

      // Calculate wait time
      if (entryObj.status === 'waiting' && entryObj.createdAt) {
        const waitTime = Date.now() - new Date(entryObj.createdAt).getTime();
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
  } catch (error: any) {
    logger.error('Error optimizing queue', error as Error, { tenantId });
    return {
      optimized: false,
      changes: [],
      metrics: {
        averageWaitTime: 0,
        totalPatients: 0,
        doctorsAvailable: 0,
        roomsAvailable: 0,
      },
    };
  }
}

/**
 * Check if doctor is currently busy
 */
async function checkDoctorBusy(
  doctorId: Types.ObjectId,
  tenantId: Types.ObjectId
): Promise<boolean> {
  const now = new Date();
  const activeVisits = await Queue.countDocuments({
    tenantId,
    doctor: doctorId,
    status: 'in-progress',
  });

  const activeAppointments = await Appointment.countDocuments({
    tenantId,
    doctor: doctorId,
    date: {
      $gte: new Date(now.getTime() - 30 * 60 * 1000), // Last 30 minutes
      $lte: new Date(now.getTime() + 30 * 60 * 1000), // Next 30 minutes
    },
    status: { $in: ['scheduled', 'confirmed', 'in-progress'] },
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
      (d: any) => d.specialization === specialization
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
  queueId: string | Types.ObjectId,
  tenantId: string | Types.ObjectId
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
  tenantId: string | Types.ObjectId
): Promise<{
  success: boolean;
  recommendations: Array<{
    type: 'time-slot' | 'doctor-assignment' | 'room-allocation';
    recommendation: string;
    impact: 'high' | 'medium' | 'low';
  }>;
}> {
  try {
    await connectDB();

    const tenantIdObj = typeof tenantId === 'string' 
      ? new Types.ObjectId(tenantId) 
      : tenantId;

    const recommendations: Array<{
      type: 'time-slot' | 'doctor-assignment' | 'room-allocation';
      recommendation: string;
      impact: 'high' | 'medium' | 'low';
    }> = [];

    // Analyze appointment patterns
    const appointments = await Appointment.find({
      tenantId: tenantIdObj,
      date: {
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      },
    }).select('date doctor status').lean();

    // Find peak hours
    const hourCounts: { [hour: number]: number } = {};
    for (const apt of appointments) {
      const hour = new Date(apt.date).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

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

    // Analyze doctor workload
    const doctorWorkloads: { [doctorId: string]: number } = {};
    for (const apt of appointments) {
      const doctorId = (apt.doctor as any)?.toString();
      if (doctorId) {
        doctorWorkloads[doctorId] = (doctorWorkloads[doctorId] || 0) + 1;
      }
    }

    const maxWorkload = Math.max(...Object.values(doctorWorkloads));
    const avgWorkload = Object.values(doctorWorkloads).reduce((a, b) => a + b, 0) / Object.keys(doctorWorkloads).length;

    if (maxWorkload > avgWorkload * 1.5) {
      recommendations.push({
        type: 'doctor-assignment',
        recommendation: 'Some doctors have significantly higher workload. Consider redistributing appointments.',
        impact: 'medium',
      });
    }

    return {
      success: true,
      recommendations,
    };
  } catch (error: any) {
    logger.error('Error optimizing queue scheduling', error as Error, { tenantId });
    return {
      success: false,
      recommendations: [],
    };
  }
}

