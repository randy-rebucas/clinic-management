'use client';

import { useState } from 'react';
import { useSetting } from '../SettingsContext';
import {
  DashboardShell,
  FigureRow,
  Panel,
  QuickActions,
  StatGrid,
  makeCompactCurrencyFormatter,
  makeCurrencyFormatter,
  periodTitle,
  useDashboardData,
  type Period,
} from './shared';
import { RankedBars, SERIES, TrendChart, trendWindowLabel, type TrendDay } from './charts';

interface DashboardData {
  period: string;
  overview: {
    periodRevenue: number;
    periodBilled: number;
    totalOutstanding: number;
    outstandingInvoiceCount: number;
  };
  financialSummary?: {
    totalInvoices: number;
    paidInvoices: number;
    unpaidInvoices: number;
    partialInvoices: number;
    totalPaid: number;
    totalUnpaid: number;
  };
  permissions: {
    canViewInvoices: boolean;
    canViewReports: boolean;
  };
  paymentMethodBreakdown?: Record<string, number>;
  trend?: { today: string; days: TrendDay[] };
}

export default function AccountantDashboard() {
  const [period, setPeriod] = useState<Period>('today');
  const state = useDashboardData<DashboardData>(period);
  const currency = useSetting('billingSettings.currency', 'PHP');
  const formatCurrency = makeCurrencyFormatter(currency);
  const formatCompact = makeCompactCurrencyFormatter(currency);

  return (
    <DashboardShell
      title="Accountant Dashboard"
      subtitle="Financial overview and billing management"
      period={period}
      onPeriodChange={setPeriod}
      state={state}
    >
      {(data) => {
        const { permissions, financialSummary: summary } = data;
        return (
          <>
            <StatGrid
              items={[
                permissions.canViewInvoices && { title: periodTitle('Revenue', data.period), value: formatCurrency(data.overview.periodRevenue), href: '/invoices', icon: 'currency' },
                permissions.canViewInvoices && { title: periodTitle('Billed', data.period), value: formatCurrency(data.overview.periodBilled), href: '/invoices', icon: 'document' },
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

            {permissions.canViewInvoices && data.trend && (
              <Panel title="Collections" subtitle={trendWindowLabel(data.period)} viewAllHref="/invoices">
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
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {summary && (
              <Panel title={periodTitle('Invoices', data.period)} viewAllHref="/invoices" className="lg:col-span-2">
                <FigureRow
                  figures={[
                    { label: 'Total', value: summary.totalInvoices },
                    { label: 'Paid', value: summary.paidInvoices, detail: formatCurrency(summary.totalPaid), status: 'success' },
                    { label: 'Unpaid', value: summary.unpaidInvoices, detail: formatCurrency(summary.totalUnpaid), status: summary.unpaidInvoices > 0 ? 'danger' : undefined },
                    { label: 'Partial', value: summary.partialInvoices, status: summary.partialInvoices > 0 ? 'warning' : undefined },
                  ]}
                />
              </Panel>
            )}
            {permissions.canViewInvoices && (
              <Panel title="Payment methods" subtitle={periodTitle('Collected', data.period)} className={summary ? '' : 'lg:col-span-3'}>
                <RankedBars values={data.paymentMethodBreakdown ?? {}} format={formatCurrency} />
              </Panel>
            )}
            </div>

            <QuickActions
              items={[
                permissions.canViewInvoices && { title: 'View Invoices', href: '/invoices', description: 'Manage all invoices', icon: 'document' },
                permissions.canViewInvoices && { title: 'Unpaid Invoices', href: '/invoices?status=open', description: 'View unpaid invoices', icon: 'alert' },
                permissions.canViewReports && { title: 'Financial Reports', href: '/reports', description: 'View financial reports', icon: 'report' },
              ]}
            />
          </>
        );
      }}
    </DashboardShell>
  );
}
