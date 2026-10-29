'use client';

import { useState } from 'react';
import { useSetting } from '../SettingsContext';
import {
  AppointmentList,
  DashboardShell,
  Panel,
  QuickActions,
  StatGrid,
  formatCount,
  makeCurrencyFormatter,
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
    periodAppointments: number;
    periodRevenue: number;
    totalOutstanding: number;
    outstandingInvoiceCount: number;
  };
  upcomingAppointments: DashboardAppointment[];
  permissions: {
    canViewPatients: boolean;
    canViewAppointments: boolean;
    canViewInvoices: boolean;
  };
  trend?: { today: string; days: TrendDay[] };
  statusMix?: Record<string, number>;
  todaySchedule?: TodaySchedule;
}

export default function ReceptionistDashboard() {
  const [period, setPeriod] = useState<Period>('today');
  const state = useDashboardData<DashboardData>(period);
  const currency = useSetting('billingSettings.currency', 'PHP');
  const formatCurrency = makeCurrencyFormatter(currency);

  return (
    <DashboardShell
      title="Receptionist Dashboard"
      subtitle="Front desk operations and scheduling overview"
      period={period}
      onPeriodChange={setPeriod}
      state={state}
      skeletonStats={5}
    >
      {(data) => {
        const { permissions } = data;
        return (
          <>
            <StatGrid
              items={[
                permissions.canViewPatients && { title: 'Total Patients', value: data.overview.totalPatients, href: '/patients', icon: 'users' },
                permissions.canViewAppointments && { title: 'Scheduled Today', value: data.overview.todayAppointments, href: '/appointments', icon: 'clock' },
                permissions.canViewAppointments && { title: periodTitle('Appointments', data.period), value: data.overview.periodAppointments, href: '/appointments', icon: 'calendar' },
                permissions.canViewInvoices && { title: periodTitle('Revenue', data.period), value: formatCurrency(data.overview.periodRevenue), href: '/invoices', icon: 'currency' },
                permissions.canViewInvoices && {
                  title: 'Outstanding Invoices',
                  value: data.overview.outstandingInvoiceCount,
                  subtitle: `${formatCurrency(data.overview.totalOutstanding)} unpaid`,
                  href: '/invoices?status=open',
                  icon: 'alert',
                  alert: data.overview.outstandingInvoiceCount > 0,
                },
              ]}
            />

            {permissions.canViewAppointments && data.todaySchedule && (
              <Panel title="The clinic day" subtitle={scheduleSubtitle(data.todaySchedule)} viewAllHref="/appointments">
                <ClinicDay schedule={data.todaySchedule} receivedAt={state.receivedAt} />
              </Panel>
            )}

            {permissions.canViewAppointments && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Panel title="Upcoming Appointments" subtitle="Next 7 days" viewAllHref="/appointments" className="lg:col-span-2">
                  <AppointmentList
                    appointments={data.upcomingAppointments}
                    variant="datetime"
                    emptyTitle="Nothing booked for the next 7 days"
                    emptyHint="Scheduled and confirmed bookings will appear here."
                  />
                </Panel>
                <Panel title="Appointment status" subtitle={periodTitle('Booked', data.period)}>
                  <StatusMix mix={data.statusMix ?? {}} />
                </Panel>
              </div>
            )}

            {permissions.canViewAppointments && data.trend && (
              <Panel title="Bookings" subtitle={trendWindowLabel(data.period)}>
                <TrendChart
                  days={data.trend.days}
                  today={data.trend.today}
                  caption="Appointments booked per day"
                  format={formatCount}
                  series={[{ key: 'appointments', label: 'Appointments booked', color: SERIES.teal, kind: 'column' }]}
                />
              </Panel>
            )}

            <QuickActions
              items={[
                permissions.canViewPatients && { title: 'Add New Patient', href: '/patients/new', description: 'Register a new patient', icon: 'plus' },
                permissions.canViewAppointments && { title: 'Schedule Appointment', href: '/appointments/new', description: 'Book a new appointment', icon: 'calendar' },
                permissions.canViewAppointments && { title: 'View Queue', href: '/queue', description: 'Manage patient queue', icon: 'queue' },
                permissions.canViewInvoices && { title: 'Create Invoice', href: '/invoices/new', description: 'Generate a new invoice', icon: 'document' },
              ]}
            />
          </>
        );
      }}
    </DashboardShell>
  );
}
