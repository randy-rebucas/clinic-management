'use client';

import { useState } from 'react';
import {
  DashboardShell,
  Panel,
  QuickActions,
  StatGrid,
  VisitList,
  formatCount,
  periodTitle,
  useDashboardData,
  type DashboardAppointment,
  type Period,
} from './shared';
import { ClinicDay, SERIES, TrendChart, scheduleSubtitle, trendWindowLabel, type TodaySchedule, type TrendDay } from './charts';

interface DashboardData {
  period: string;
  overview: {
    totalPatients: number;
    todayAppointments: number;
    periodVisits: number;
  };
  myAppointments?: DashboardAppointment[];
  myVisits?: Array<{
    _id: string;
    patient: string;
    date: string;
    diagnosis: string;
  }>;
  recentAppointments: DashboardAppointment[];
  permissions: {
    canViewPatients: boolean;
    canViewAppointments: boolean;
    canViewVisits: boolean;
    canViewPrescriptions: boolean;
    canViewLabResults: boolean;
  };
  trend?: { today: string; days: TrendDay[] };
  todaySchedule?: TodaySchedule;
}

export default function DoctorDashboard() {
  const [period, setPeriod] = useState<Period>('today');
  const state = useDashboardData<DashboardData>(period);

  return (
    <DashboardShell
      title="Doctor Dashboard"
      subtitle="Your clinical overview and patient management"
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
              <Panel title="Your day" subtitle={scheduleSubtitle(data.todaySchedule)} viewAllHref="/appointments">
                <ClinicDay schedule={data.todaySchedule} singleLane="You" receivedAt={state.receivedAt} />
              </Panel>
            )}

            {(permissions.canViewAppointments || permissions.canViewVisits) && data.trend && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Panel title="Your patient flow" subtitle={trendWindowLabel(data.period)} className="lg:col-span-2">
                  <TrendChart
                    days={data.trend.days}
                    today={data.trend.today}
                    caption="Your visits documented and appointments booked per day"
                    format={formatCount}
                    series={[
                      ...(permissions.canViewVisits ? [{ key: 'visits', label: 'Visits documented', color: SERIES.teal, kind: 'column' as const }] : []),
                      ...(permissions.canViewAppointments ? [{ key: 'appointments', label: 'Appointments booked', color: SERIES.blue, kind: 'line' as const }] : []),
                    ]}
                  />
                </Panel>
                {permissions.canViewVisits && (
                  <Panel title={periodTitle('My Visits', data.period)} viewAllHref="/visits">
                    <VisitList
                      visits={data.myVisits}
                      emptyTitle="No visits recorded yet"
                      emptyHint="Visits you document in this period will appear here."
                    />
                  </Panel>
                )}
              </div>
            )}

            <QuickActions
              items={[
                permissions.canViewPatients && { title: 'New Patient', href: '/patients/new', description: 'Register a new patient', icon: 'plus' },
                permissions.canViewVisits && { title: 'New Visit', href: '/visits/new', description: 'Create a new visit record', icon: 'document' },
                permissions.canViewPrescriptions && { title: 'Prescriptions', href: '/prescriptions', description: 'Made from the medicines in a visit note', icon: 'prescription' },
                permissions.canViewLabResults && { title: 'Lab Results', href: '/lab-results', description: 'View lab test results', icon: 'clipboard' },
              ]}
            />
          </>
        );
      }}
    </DashboardShell>
  );
}
