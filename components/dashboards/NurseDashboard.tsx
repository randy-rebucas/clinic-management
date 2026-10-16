'use client';

import { useState } from 'react';
import {
  DashboardShell,
  Panel,
  QuickActions,
  StatGrid,
  formatCount,
  periodTitle,
  useDashboardData,
  type DashboardAppointment,
  type Period,
} from './shared';
import { ClinicDay, SERIES, StatusMix, TrendChart, scheduleSubtitle, trendWindowLabel, type TodaySchedule, type TrendDay } from './charts';

interface DashboardData {
  period: string;
  overview: {
    totalPatients: number;
    todayAppointments: number;
    periodVisits: number;
  };
  recentAppointments: DashboardAppointment[];
  permissions: {
    canViewPatients: boolean;
    canViewAppointments: boolean;
    canViewVisits: boolean;
    canViewLabResults: boolean;
  };
  trend?: { today: string; days: TrendDay[] };
  statusMix?: Record<string, number>;
  todaySchedule?: TodaySchedule;
}

export default function NurseDashboard() {
  const [period, setPeriod] = useState<Period>('today');
  const state = useDashboardData<DashboardData>(period);

  return (
    <DashboardShell
      title="Nurse Dashboard"
      subtitle="Patient care and clinical support overview"
      period={period}
      onPeriodChange={setPeriod}
      state={state}
    >
      {(data) => {
        const { permissions } = data;
        return (
          <>
            <StatGrid
              items={[
                permissions.canViewPatients && { title: 'Patients', value: data.overview.totalPatients, href: '/patients', icon: 'users' },
                permissions.canViewAppointments && { title: 'Scheduled Today', value: data.overview.todayAppointments, href: '/appointments', icon: 'clock' },
                permissions.canViewVisits && { title: periodTitle('Visits', data.period), value: data.overview.periodVisits, href: '/visits', icon: 'document' },
              ]}
            />

            {permissions.canViewAppointments && data.todaySchedule && (
              <Panel title="The clinic day" subtitle={scheduleSubtitle(data.todaySchedule)} viewAllHref="/appointments">
                <ClinicDay schedule={data.todaySchedule} receivedAt={state.receivedAt} />
              </Panel>
            )}

            {data.trend && (permissions.canViewVisits || permissions.canViewAppointments) && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Panel title="Patient flow" subtitle={trendWindowLabel(data.period)} className={permissions.canViewAppointments ? 'lg:col-span-2' : 'lg:col-span-3'}>
                  <TrendChart
                    days={data.trend.days}
                    today={data.trend.today}
                    caption="Visits seen and appointments booked per day"
                    format={formatCount}
                    series={[
                      ...(permissions.canViewVisits ? [{ key: 'visits', label: 'Visits seen', color: SERIES.teal, kind: 'column' as const }] : []),
                      ...(permissions.canViewAppointments ? [{ key: 'appointments', label: 'Appointments booked', color: SERIES.blue, kind: 'line' as const }] : []),
                    ]}
                  />
                </Panel>
                {permissions.canViewAppointments && (
                  <Panel title="Appointment status" subtitle={periodTitle('Booked', data.period)}>
                    <StatusMix mix={data.statusMix ?? {}} />
                  </Panel>
                )}
              </div>
            )}

            <QuickActions
              items={[
                permissions.canViewPatients && { title: 'New Patient', href: '/patients/new', description: 'Register a new patient', icon: 'plus' },
                permissions.canViewAppointments && { title: 'Schedule Appointment', href: '/appointments/new', description: 'Book a new appointment', icon: 'calendar' },
                permissions.canViewVisits && { title: 'New Visit', href: '/visits/new', description: 'Create a new visit record', icon: 'document' },
                permissions.canViewLabResults && { title: 'Lab Results', href: '/lab-results', description: 'View and update lab results', icon: 'clipboard' },
              ]}
            />
          </>
        );
      }}
    </DashboardShell>
  );
}
