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
  makeCompactCurrencyFormatter,
  makeCurrencyFormatter,
  periodTitle,
  useDashboardData,
  type DashboardAppointment,
  type Period,
} from './shared';
import {
  ClinicDay,
  RankedBars,
  SERIES,
  StatusMix,
  TrendChart,
  scheduleSubtitle,
  trendWindowLabel,
  type TodaySchedule,
  type TrendDay,
} from './charts';

interface DashboardData {
  period: string;
  dateRange: {
    start: string;
    end: string;
  };
  overview: {
    totalPatients: number;
    totalDoctors: number;
    todayAppointments: number;
    periodAppointments: number;
    periodVisits: number;
    periodRevenue: number;
    periodBilled: number;
    totalOutstanding: number;
    outstandingInvoiceCount: number;
  };
  recentAppointments: DashboardAppointment[];
  upcomingAppointments: DashboardAppointment[];
  paymentMethodBreakdown: Record<string, number>;
  trend?: { today: string; days: TrendDay[] };
  statusMix?: Record<string, number>;
  todaySchedule?: TodaySchedule;
}

export default function AdminDashboard() {
  const [period, setPeriod] = useState<Period>('today');
  const state = useDashboardData<DashboardData>(period);
  const currency = useSetting('billingSettings.currency', 'PHP');
  const formatCurrency = makeCurrencyFormatter(currency);
  const formatCompact = makeCompactCurrencyFormatter(currency);

  return (
    <DashboardShell
      title="Admin Dashboard"
      subtitle="Complete system overview and management"
      period={period}
      onPeriodChange={setPeriod}
      state={state}
      skeletonStats={6}
    >
      {(data) => (
        <>
          <StatGrid
            items={[
              { title: 'Total Patients', value: data.overview.totalPatients, href: '/patients', icon: 'users' },
              { title: 'Scheduled Today', value: data.overview.todayAppointments, href: '/appointments', icon: 'clock' },
              { title: periodTitle('Visits', data.period), value: data.overview.periodVisits, href: '/visits', icon: 'document' },
              { title: 'Active Doctors', value: data.overview.totalDoctors, href: '/doctors', icon: 'building' },
              { title: periodTitle('Revenue', data.period), value: formatCurrency(data.overview.periodRevenue), href: '/invoices', icon: 'currency' },
              {
                title: 'Outstanding Invoices',
                value: data.overview.outstandingInvoiceCount,
                subtitle: `${formatCurrency(data.overview.totalOutstanding)} unpaid`,
                href: '/invoices?status=open',
                icon: 'alert',
                alert: data.overview.outstandingInvoiceCount > 0,
              },
            ]}
          />

          {data.todaySchedule && (
            <Panel title="The clinic day" subtitle={scheduleSubtitle(data.todaySchedule)} viewAllHref="/appointments">
              <ClinicDay schedule={data.todaySchedule} receivedAt={state.receivedAt} />
            </Panel>
          )}

          {data.trend && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Panel title="Patient flow" subtitle={trendWindowLabel(data.period)} className="lg:col-span-2">
                <TrendChart
                  days={data.trend.days}
                  today={data.trend.today}
                  caption="Visits seen and appointments booked per day"
                  format={formatCount}
                  series={[
                    { key: 'visits', label: 'Visits seen', color: SERIES.teal, kind: 'column' },
                    { key: 'appointments', label: 'Appointments booked', color: SERIES.blue, kind: 'line' },
                  ]}
                />
              </Panel>
              <Panel title="Appointment status" subtitle={periodTitle('Booked', data.period)}>
                <StatusMix mix={data.statusMix ?? {}} />
              </Panel>
            </div>
          )}

          {data.trend && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Panel title="Collections" subtitle={trendWindowLabel(data.period)} className="lg:col-span-2" viewAllHref="/invoices">
                <TrendChart
                  days={data.trend.days}
                  today={data.trend.today}
                  caption="Payments collected and amounts billed per day"
                  format={formatCurrency}
                  formatTick={formatCompact}
                  series={[
                    { key: 'collected', label: 'Collected', color: SERIES.teal, kind: 'area' },
                    { key: 'billed', label: 'Billed', color: SERIES.blue, kind: 'line' },
                  ]}
                />
              </Panel>
              <Panel title="Payment methods" subtitle={periodTitle('Collected', data.period)}>
                <RankedBars values={data.paymentMethodBreakdown ?? {}} format={formatCurrency} />
              </Panel>
            </div>
          )}

          <Panel title="Upcoming Appointments" subtitle="Next 7 days" viewAllHref="/appointments">
            <AppointmentList
              appointments={data.upcomingAppointments}
              variant="datetime"
              emptyTitle="Nothing booked for the next 7 days"
              emptyHint="Scheduled and confirmed bookings will appear here."
            />
          </Panel>

          <QuickActions
            items={[
              { title: 'Manage Users', href: '/users', description: 'Manage user accounts and roles', icon: 'user' },
              { title: 'Roles & Permissions', href: '/roles', description: 'Configure roles and permissions', icon: 'shield' },
              { title: 'System Settings', href: '/settings', description: 'Configure system settings', icon: 'settings' },
              { title: 'View Reports', href: '/reports', description: 'View system reports and analytics', icon: 'report' },
            ]}
          />
        </>
      )}
    </DashboardShell>
  );
}
