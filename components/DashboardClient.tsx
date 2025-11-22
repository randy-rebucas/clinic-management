'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Flex, Box, Text, Spinner, Badge, Heading, Container, Section } from '@radix-ui/themes';
import { useSetting } from './SettingsContext';

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
  recentAppointments: Array<{
    _id: string;
    appointmentCode: string;
    patient: string;
    doctor: string;
    date: string;
    time: string;
    status: string;
  }>;
  upcomingAppointments: Array<{
    _id: string;
    appointmentCode: string;
    patient: string;
    doctor: string;
    date: string;
    time: string;
    status: string;
  }>;
  paymentMethodBreakdown: Record<string, number>;
}

export default function DashboardClient() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const router = useRouter();
  const currency = useSetting('billingSettings.currency', 'USD');

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const res = await fetch(`/api/reports/dashboard?period=${period}`);

        // Check for authentication errors
        if (res.status === 401) {
          router.push('/login');
          return;
        }

        if (!res.ok) {
          throw new Error(`Dashboard API error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch dashboard data');
        }

        setDashboardData(data.data);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [router, period]);

  if (loading || !dashboardData) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" align="center" gap="3" style={{ minHeight: '50vh', justifyContent: 'center' }}>
            <Spinner size="3" />
            <Text>Loading dashboard...</Text>
          </Flex>
        </Container>
      </Section>
    );
  }
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const statCards = [
    {
      title: 'Total Patients',
      value: dashboardData.overview.totalPatients,
      href: '/patients',
      iconColor: 'blue',
      icon: (
        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      title: 'Today\'s Appointments',
      value: dashboardData.overview.todayAppointments,
      href: '/appointments',
      iconColor: 'amber',
      icon: (
        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: period === 'today' ? 'Today\'s Visits' : period === 'week' ? 'This Week\'s Visits' : 'This Month\'s Visits',
      value: dashboardData.overview.periodVisits,
      href: '/visits',
      iconColor: 'green',
      icon: (
        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      title: 'Active Doctors',
      value: dashboardData.overview.totalDoctors,
      href: '/doctors',
      iconColor: 'purple',
      icon: (
        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      title: period === 'today' ? 'Today\'s Revenue' : period === 'week' ? 'This Week\'s Revenue' : 'This Month\'s Revenue',
      value: formatCurrency(dashboardData.overview.periodRevenue),
      href: '/invoices',
      iconColor: 'emerald',
      icon: (
        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: 'Outstanding Invoices',
      value: dashboardData.overview.outstandingInvoiceCount,
      subtitle: formatCurrency(dashboardData.overview.totalOutstanding),
      href: '/invoices?status=unpaid',
      iconColor: 'red',
      icon: (
        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
  ];

  const quickActions = [
    {
      title: 'Add New Patient',
      href: '/patients/new',
      description: 'Register a new patient',
      iconColor: 'blue',
      icon: (
        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
    },
    {
      title: 'Schedule Appointment',
      href: '/appointments/new',
      description: 'Book a new appointment',
      iconColor: 'green',
      icon: (
        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      title: 'New Visit',
      href: '/visits/new',
      description: 'Create a new visit record',
      iconColor: 'teal',
      icon: (
        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      title: 'Create Invoice',
      href: '/invoices/new',
      description: 'Generate a new invoice',
      iconColor: 'emerald',
      icon: (
        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  return (
    <Section size="3">
      <Container size="4">
        <Flex direction="column" gap="4">
          {/* Header */}
          <Flex justify="between" align="center" direction={{ initial: 'column', sm: 'row' }} gap="3">
            <Box>
              <Heading size="8" mb="1">Dashboard</Heading>
              <Text size="2" color="gray">Welcome back! Here's an overview of your clinic.</Text>
            </Box>
        <Flex gap="2">
          <Button
            onClick={() => setPeriod('today')}
            variant={period === 'today' ? 'solid' : 'soft'}
            size="2"
          >
            Today
          </Button>
          <Button
            onClick={() => setPeriod('week')}
            variant={period === 'week' ? 'solid' : 'soft'}
            size="2"
          >
            Week
          </Button>
          <Button
            onClick={() => setPeriod('month')}
            variant={period === 'month' ? 'solid' : 'soft'}
            size="2"
          >
            Month
          </Button>
        </Flex>
      </Flex>

          {/* Stats Grid */}
          <Flex gap="3" wrap="wrap">
        {statCards.map((card) => (
          <Link key={card.title} href={card.href} style={{ flex: '1 1 250px', minWidth: '200px' }}>
            <Card size="2" variant="surface" style={{ position: 'relative', overflow: 'hidden' }}>
              <Flex justify="between" align="start" gap="3">
                <Box flexGrow="1">
                  <Text size="1" color="gray" mb="1" as="div">{card.title}</Text>
                  <Text size="6" weight="bold" as="div">{card.value}</Text>
                  {card.subtitle && (
                    <Text size="1" color="gray" mt="1" as="div">{card.subtitle}</Text>
                  )}
                </Box>
                <Box 
                  style={{ 
                    borderRadius: 'var(--radius-2)', 
                    padding: '8px',
                    background: 'var(--gray-3)'
                  }}
                >
                  <Box 
                    style={{ 
                      borderRadius: 'var(--radius-2)', 
                      padding: '6px', 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `var(--${card.iconColor}-9)`,
                      color: 'white'
                    }}
                  >
                    {card.icon}
                  </Box>
                </Box>
              </Flex>
            </Card>
          </Link>
        ))}
      </Flex>

          {/* Recent and Upcoming Appointments */}
          <Flex gap="3" direction={{ initial: 'column', lg: 'row' }}>
            {/* Recent Appointments */}
            <Card size="2" variant="surface" style={{ flex: 1 }}>
              <Flex justify="between" align="center" mb="3">
                <Heading size="4">Today's Appointments</Heading>
            <Link href="/appointments">
              <Button variant="ghost" size="1" color="blue">View all</Button>
            </Link>
          </Flex>
          <Flex direction="column" gap="2">
            {dashboardData.recentAppointments.length > 0 ? (
              dashboardData.recentAppointments.slice(0, 5).map((apt) => (
                <Link key={apt._id} href={`/appointments/${apt._id}`}>
                  <Card size="1" variant="surface">
                    <Flex justify="between" align="center">
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="2" weight="medium" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {apt.patient}
                        </Text>
                        <Text size="1" color="gray">{apt.doctor}</Text>
                      </Box>
                      <Box style={{ textAlign: 'right', marginLeft: '8px' }}>
                        <Text size="1" weight="medium">{formatTime(apt.time)}</Text>
                        <Badge
                          color={
                            apt.status === 'scheduled' || apt.status === 'confirmed'
                              ? 'green'
                              : apt.status === 'completed'
                              ? 'blue'
                              : 'gray'
                          }
                          size="1"
                        >
                          {apt.status}
                        </Badge>
                      </Box>
                    </Flex>
                  </Card>
                </Link>
              ))
            ) : (
              <Text size="2" color="gray" style={{ textAlign: 'center', padding: '16px' }}>
                No appointments today
              </Text>
            )}
          </Flex>
        </Card>

            {/* Upcoming Appointments */}
            <Card size="2" variant="surface" style={{ flex: 1 }}>
              <Flex justify="between" align="center" mb="3">
                <Heading size="4">Upcoming Appointments</Heading>
            <Link href="/appointments">
              <Button variant="ghost" size="1" color="blue">View all</Button>
            </Link>
          </Flex>
          <Flex direction="column" gap="2">
            {dashboardData.upcomingAppointments.length > 0 ? (
              dashboardData.upcomingAppointments.slice(0, 5).map((apt) => (
                <Link key={apt._id} href={`/appointments/${apt._id}`}>
                  <Card size="1" variant="surface">
                    <Flex justify="between" align="center">
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="2" weight="medium" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {apt.patient}
                        </Text>
                        <Text size="1" color="gray">{apt.doctor}</Text>
                      </Box>
                      <Box style={{ textAlign: 'right', marginLeft: '8px' }}>
                        <Text size="1" weight="medium">{formatDate(apt.date)}</Text>
                        <Text size="1" color="gray">{formatTime(apt.time)}</Text>
                      </Box>
                    </Flex>
                  </Card>
                </Link>
              ))
            ) : (
              <Text size="2" color="gray" style={{ textAlign: 'center', padding: '16px' }}>
                No upcoming appointments
              </Text>
            )}
          </Flex>
        </Card>
      </Flex>

          {/* Quick Actions */}
          <Card size="2" variant="surface">
            <Heading size="4" mb="2">Quick Actions</Heading>
        <Flex gap="3" wrap="wrap">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href} style={{ flex: '1 1 200px', minWidth: '150px' }}>
              <Card size="1" variant="surface" style={{ cursor: 'pointer', transition: 'all 0.2s' }}>
                <Flex align="start" gap="3">
                  <Box 
                    style={{ 
                      borderRadius: 'var(--radius-2)', 
                      padding: '8px', 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `var(--${action.iconColor}-3)`,
                      color: `var(--${action.iconColor}-9)`
                    }}
                  >
                    {action.icon}
                  </Box>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="2" weight="bold" mb="1" as="div">{action.title}</Text>
                    <Text size="1" color="gray">{action.description}</Text>
                  </Box>
                </Flex>
              </Card>
            </Link>
          ))}
        </Flex>
      </Card>
        </Flex>
      </Container>
    </Section>
  );
}
