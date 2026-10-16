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

function doctorLabel(d: any): string {
  if (!d) return '';
  return d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || String(d._id);
}

/**
 * Optimize queue assignment based on various factors.
 *
 * A waiting patient is moved only when their doctor is busy (has someone in progress)
 * AND another active doctor is free (nobody in progress) with a strictly shorter
 * waiting list. Patients who booked a specific doctor are never moved.
 */
export async function optimizeQueue(
  tenantId: string | Types.ObjectId
): Promise<QueueOptimizationResult> {
  const emptyResult: QueueOptimizationResult = {
    optimized: false,
    changes: [],
    metrics: { averageWaitTime: 0, totalPatients: 0, doctorsAvailable: 0, roomsAvailable: 0 },
  };

  if (!tenantId || (typeof tenantId === 'string' && !Types.ObjectId.isValid(tenantId))) {
    logger.error('optimizeQueue called with invalid tenantId', new Error('Invalid tenantId'), { tenantId: String(tenantId) });
    return emptyResult;
  }

  try {
    await connectDB();

    const settings = await getSettings(tenantId.toString());
    if (!settings?.automationSettings?.autoQueueOptimization) {
      return emptyResult;
    }

    const tenantIdObj = new Types.ObjectId(String(tenantId));

    const queueEntries = await Queue.find({
      tenantId: tenantIdObj,
      status: { $in: ['waiting', 'in-progress'] },
    })
      .populate('patient', 'firstName lastName')
      .populate('appointment', 'doctor')
      .populate('doctor', 'firstName lastName specialization')
      .populate('room', 'name')
      .sort({ queuedAt: 1 })
      .lean();

    const availableDoctors = await Doctor.find({
      tenantId: tenantIdObj,
      status: 'active',
    }).select('firstName lastName specialization').lean();

    const availableRooms = await Room.find({
      tenantId: tenantIdObj,
      status: 'available',
    }).select('name capacity').lean();

    const entries = (queueEntries || []) as any[];
    const doctors = (availableDoctors || []) as any[];
    const changes: QueueOptimizationResult['changes'] = [];

    const inProgress = new Map<string, number>();
    const waiting = new Map<string, number>();
    const bump = (m: Map<string, number>, k: string, d: number) => m.set(k, (m.get(k) || 0) + d);
    for (const e of entries) {
      const did = e.doctor?._id ? String(e.doctor._id) : null;
      if (!did) continue;
      bump(e.status === 'in-progress' ? inProgress : waiting, did, 1);
    }

    for (const entry of entries) {
      // 1. Rebalance waiting patients away from a busy doctor
      if (entry.status === 'waiting' && entry.doctor?._id) {
        const bookedDoctor = entry.appointment?.doctor;
        if (bookedDoctor) continue; // patient booked this specific doctor

        const currentId = String(entry.doctor._id);
        if ((inProgress.get(currentId) || 0) === 0) continue; // current doctor isn't busy

        const currentWaiting = waiting.get(currentId) || 0;
        const spec = entry.doctor.specialization;
        const candidate = doctors
          .filter((d) => String(d._id) !== currentId)
          .filter((d) => (inProgress.get(String(d._id)) || 0) === 0)
          .filter((d) => (waiting.get(String(d._id)) || 0) + 1 < currentWaiting)
          .filter((d) => !spec || !d.specialization || d.specialization === spec)
          .sort((a, b) => (waiting.get(String(a._id)) || 0) - (waiting.get(String(b._id)) || 0))[0];

        if (candidate) {
          const res = await Queue.updateOne(
            { _id: entry._id, tenantId: tenantIdObj, status: 'waiting', doctor: entry.doctor._id },
            { $set: { doctor: candidate._id } }
          );
          if ((res as any)?.modifiedCount !== 0) {
            bump(waiting, currentId, -1);
            bump(waiting, String(candidate._id), 1);
            changes.push({
              queueId: String(entry._id),
              action: 'reassigned',
              reason: 'Current doctor is busy; moved to a free doctor with a shorter queue',
              oldValue: doctorLabel(entry.doctor),
              newValue: doctorLabel(candidate),
            });
          }
        }
      }

      // 2. Give in-progress patients without a room a free one (each room used once)
      if (!entry.room && entry.status === 'in-progress' && availableRooms.length > 0) {
        const room = availableRooms.shift() as any;
        await Queue.updateOne({ _id: entry._id, tenantId: tenantIdObj }, { $set: { room: room._id } });
        changes.push({
          queueId: String(entry._id),
          action: 'reassigned',
          reason: 'Assigned to available room',
          oldValue: null,
          newValue: room.name,
        });
      }
    }

    const waitingEntries = entries.filter((e) => e.status === 'waiting');
    const totalWaitMs = waitingEntries.reduce((sum, e) => {
      const since = e.queuedAt || e.createdAt;
      return since ? sum + (Date.now() - new Date(since).getTime()) : sum;
    }, 0);
    const averageWaitTime = waitingEntries.length > 0 ? totalWaitMs / waitingEntries.length / 1000 / 60 : 0;

    return {
      optimized: changes.length > 0,
      changes,
      metrics: {
        averageWaitTime: Math.round(averageWaitTime * 100) / 100,
        totalPatients: entries.length,
        doctorsAvailable: doctors.length,
        roomsAvailable: availableRooms.length,
      },
    };
  } catch (error: any) {
    logger.error('Error optimizing queue', error as Error, { tenantId: String(tenantId) });
    return emptyResult;
  }
}

/**
 * Auto-optimize queue when new patient joins
 */
export async function autoOptimizeQueueOnJoin(
  queueId: string | Types.ObjectId,
  tenantId: string | Types.ObjectId
): Promise<QueueOptimizationResult | null> {
  try {
    return await optimizeQueue(tenantId);
  } catch (error: any) {
    logger.error('Error in auto queue optimization', error as Error, { queueId: String(queueId), tenantId: String(tenantId) });
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
  if (!tenantId || (typeof tenantId === 'string' && !Types.ObjectId.isValid(tenantId))) {
    logger.error('optimizeQueueScheduling called with invalid tenantId', new Error('Invalid tenantId'), { tenantId: String(tenantId) });
    return { success: false, recommendations: [] };
  }

  try {
    await connectDB();

    const tenantIdObj = new Types.ObjectId(String(tenantId));

    const recommendations: Array<{
      type: 'time-slot' | 'doctor-assignment' | 'room-allocation';
      recommendation: string;
      impact: 'high' | 'medium' | 'low';
    }> = [];

    const appointments = (await Appointment.find({
      tenantId: tenantIdObj,
      appointmentDate: {
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      },
    }).select('appointmentDate appointmentTime doctor status').lean()) as any[];

    // Peak hours, from the clinic-local "HH:mm" appointment time
    const hourCounts: Record<number, number> = {};
    for (const apt of appointments || []) {
      const m = /^(\d{1,2}):/.exec(apt.appointmentTime || '');
      if (!m) continue;
      const hour = Number(m[1]);
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    const hourEntries = Object.entries(hourCounts);
    if (hourEntries.length > 0) {
      const [peakHour] = hourEntries.reduce((a, b) => (b[1] > a[1] ? b : a));
      if (parseInt(peakHour, 10) >= 9 && parseInt(peakHour, 10) <= 11) {
        recommendations.push({
          type: 'time-slot',
          recommendation: `Peak hours are ${peakHour}:00. Consider adding more time slots or doctors during this period.`,
          impact: 'high',
        });
      }
    }

    const doctorWorkloads: Record<string, number> = {};
    for (const apt of appointments || []) {
      const doctorId = apt.doctor ? String(apt.doctor) : null;
      if (doctorId) {
        doctorWorkloads[doctorId] = (doctorWorkloads[doctorId] || 0) + 1;
      }
    }

    const workloads = Object.values(doctorWorkloads);
    if (workloads.length > 1) {
      const maxWorkload = Math.max(...workloads);
      const avgWorkload = workloads.reduce((a, b) => a + b, 0) / workloads.length;
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
  } catch (error: any) {
    logger.error('Error optimizing queue scheduling', error as Error, { tenantId: String(tenantId) });
    return {
      success: false,
      recommendations: [],
    };
  }
}
