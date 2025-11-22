'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Tabs, Skeleton, Container, Section, Heading } from '@radix-ui/themes';

interface ReportData {
  totalConsultations?: number;
  totalIncome?: number;
  totalPatients?: number;
  [key: string]: any;
}

export default function ReportsPageClient() {
  const [dashboardData, setDashboardData] = useState<ReportData>({});
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const router = useRouter();

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/reports/dashboard');
      
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        data = { success: false, error: `API error: ${res.status} ${res.statusText}` };
      }
      
      if (data.success) {
        setDashboardData(data.data?.overview || {});
      } else {
        console.error('Failed to fetch reports:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReport = async (reportType: string, reportPeriod?: 'daily' | 'weekly' | 'monthly') => {
    setReportLoading(true);
    setSelectedReport(reportType);
    try {
      const url = reportPeriod 
        ? `/api/reports/${reportType}?period=${reportPeriod}`
        : `/api/reports/${reportType}`;
      
      const res = await fetch(url);
      
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      const data = await res.json();
      if (data.success) {
        setReportData(data.data);
      } else {
        alert(data.error || 'Failed to fetch report');
        setReportData(null);
      }
    } catch (error) {
      console.error('Failed to fetch report:', error);
      alert('Failed to fetch report. Please try again.');
      setReportData(null);
    } finally {
      setReportLoading(false);
    }
  };

  const renderReportDetails = (reportType: string, data: any) => {
    switch (reportType) {
      case 'consultations':
        return (
          <Flex direction="column" gap="3">
            <Text size="3" weight="bold">Consultations Summary</Text>
            <Flex gap="2" wrap="wrap">
              <Card size="1" variant="surface" style={{ flex: '1 1 200px' }}>
                <Flex direction="column" gap="1" p="2">
                  <Text size="1" color="gray">Total</Text>
                  <Text size="4" weight="bold">{data.summary?.totalConsultations || 0}</Text>
                </Flex>
              </Card>
            </Flex>
            {data.summary?.byType && (
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">By Type</Text>
                <Flex direction="column" gap="1">
                  {Object.entries(data.summary.byType).map(([type, count]: [string, any]) => (
                    <Flex key={type} justify="between" py="1">
                      <Text size="2" color="gray" style={{ textTransform: 'capitalize' }}>{type}</Text>
                      <Text size="2" weight="medium">{count}</Text>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            )}
            {data.summary?.byProvider && (
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">By Provider</Text>
                <Flex direction="column" gap="1">
                  {Object.entries(data.summary.byProvider).slice(0, 5).map(([provider, count]: [string, any]) => (
                    <Flex key={provider} justify="between" py="1">
                      <Text size="2" color="gray">{provider}</Text>
                      <Text size="2" weight="medium">{count}</Text>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            )}
          </Flex>
        );
      case 'income':
        return (
          <Flex direction="column" gap="3">
            <Text size="3" weight="bold">Income Summary</Text>
            <Flex direction="column" gap="2">
              <Card size="1" variant="surface" style={{ backgroundColor: 'var(--green-3)' }}>
                <Flex direction="column" gap="1" p="2">
                  <Text size="1" color="gray">Total Paid</Text>
                  <Text size="4" weight="bold" style={{ color: 'var(--green-9)' }}>
                    ₱{(data.summary?.totalPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </Flex>
              </Card>
              <Card size="1" variant="surface">
                <Flex direction="column" gap="1" p="2">
                  <Text size="1" color="gray">Total Billed</Text>
                  <Text size="4" weight="bold">₱{(data.summary?.totalBilled || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                </Flex>
              </Card>
              <Card size="1" variant="surface" style={{ backgroundColor: 'var(--yellow-3)' }}>
                <Flex direction="column" gap="1" p="2">
                  <Text size="1" color="gray">Outstanding</Text>
                  <Text size="4" weight="bold" style={{ color: 'var(--yellow-9)' }}>
                    ₱{(data.summary?.totalOutstanding || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </Flex>
              </Card>
            </Flex>
            {data.breakdowns?.byPaymentMethod && (
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">By Payment Method</Text>
                <Flex direction="column" gap="1">
                  {Object.entries(data.breakdowns.byPaymentMethod).map(([method, amount]: [string, any]) => (
                    <Flex key={method} justify="between" py="1">
                      <Text size="2" color="gray" style={{ textTransform: 'capitalize' }}>{method.replace('_', ' ')}</Text>
                      <Text size="2" weight="medium">₱{amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            )}
          </Flex>
        );
      case 'demographics':
        return (
          <Flex direction="column" gap="3">
            <Text size="3" weight="bold">Demographics Summary</Text>
            {data.demographics?.ageGroups && (
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">Age Groups</Text>
                <Flex direction="column" gap="1">
                  {Object.entries(data.demographics.ageGroups).map(([age, count]: [string, any]) => (
                    <Flex key={age} justify="between" py="1">
                      <Text size="2" color="gray">{age}</Text>
                      <Text size="2" weight="medium">{count}</Text>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            )}
          </Flex>
        );
      case 'inventory':
        return (
          <Flex direction="column" gap="3">
            <Text size="3" weight="bold">Inventory Summary</Text>
            <Flex gap="2" wrap="wrap">
              <Card size="1" variant="surface" style={{ flex: '1 1 200px' }}>
                <Flex direction="column" gap="1" p="2">
                  <Text size="1" color="gray">Total Items</Text>
                  <Text size="4" weight="bold">{data.summary?.totalItems || 0}</Text>
                </Flex>
              </Card>
              <Card size="1" variant="surface" style={{ flex: '1 1 200px', backgroundColor: 'var(--red-3)' }}>
                <Flex direction="column" gap="1" p="2">
                  <Text size="1" color="gray">Low Stock</Text>
                  <Text size="4" weight="bold" style={{ color: 'var(--red-9)' }}>{data.summary?.lowStockCount || 0}</Text>
                </Flex>
              </Card>
            </Flex>
            {data.lowStockItems && data.lowStockItems.length > 0 && (
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">Low Stock Items</Text>
                <Flex direction="column" gap="1">
                  {data.lowStockItems.slice(0, 5).map((item: any) => (
                    <Flex key={item._id} justify="between" py="1">
                      <Text size="2" color="gray" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                        {item.name}
                      </Text>
                      <Text size="2" weight="medium" style={{ color: 'var(--red-9)' }}>
                        {item.quantity} {item.unit}
                      </Text>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            )}
          </Flex>
        );
      case 'hmo-claims':
        return (
          <Flex direction="column" gap="3">
            <Text size="3" weight="bold">HMO Claims Summary</Text>
            <Flex gap="2" wrap="wrap">
              <Card size="1" variant="surface" style={{ flex: '1 1 200px' }}>
                <Flex direction="column" gap="1" p="2">
                  <Text size="1" color="gray">Total Claims</Text>
                  <Text size="4" weight="bold">{data.summary?.totalClaims || 0}</Text>
                </Flex>
              </Card>
              <Card size="1" variant="surface" style={{ flex: '1 1 200px', backgroundColor: 'var(--yellow-3)' }}>
                <Flex direction="column" gap="1" p="2">
                  <Text size="1" color="gray">Pending</Text>
                  <Text size="4" weight="bold" style={{ color: 'var(--yellow-9)' }}>{data.summary?.pendingClaims || 0}</Text>
                </Flex>
              </Card>
            </Flex>
            <Card size="1" variant="surface">
              <Flex direction="column" gap="1" p="2">
                <Text size="1" color="gray">Backlog Amount</Text>
                <Text size="4" weight="bold">₱{(data.summary?.backlogAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
              </Flex>
            </Card>
          </Flex>
        );
      default:
        return <Text size="2" color="gray">Report data not available</Text>;
    }
  };

  if (loading) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" gap="3">
            <Skeleton height="32px" width="200px" />
            <Skeleton height="40px" />
            <Flex gap="3" wrap="wrap">
              <Skeleton height="150px" style={{ flex: '1 1 250px' }} />
              <Skeleton height="150px" style={{ flex: '1 1 250px' }} />
              <Skeleton height="150px" style={{ flex: '1 1 250px' }} />
            </Flex>
            <Skeleton height="400px" />
          </Flex>
        </Container>
      </Section>
    );
  }

  return (
    <Section size="3">
      <Container size="4">
        <Flex direction="column" gap="4">
          <Box>
            <Heading size="8" mb="1">Reports & Analytics</Heading>
            <Text size="2" color="gray">View clinic performance metrics and reports</Text>
          </Box>

          <Flex gap="3" wrap="wrap">
            <Card size="2" variant="surface" style={{ flex: '1 1 250px', minWidth: '200px' }}>
              <Flex justify="between" align="center" gap="3">
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Total Consultations</Text>
                  <Text size="6" weight="bold">
                    {dashboardData.periodVisits || dashboardData.totalConsultations || 0}
                  </Text>
                </Box>
                <Box
                  style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: 'var(--blue-3)',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="20" height="20" fill="none" stroke="var(--blue-9)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </Box>
              </Flex>
            </Card>

            <Card size="2" variant="surface" style={{ flex: '1 1 250px', minWidth: '200px' }}>
              <Flex justify="between" align="center" gap="3">
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Total Income</Text>
                  <Text size="6" weight="bold">
                    ₱{(dashboardData.periodRevenue || dashboardData.totalIncome || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </Box>
                <Box
                  style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: 'var(--green-3)',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="20" height="20" fill="none" stroke="var(--green-9)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Box>
              </Flex>
            </Card>

            <Card size="2" variant="surface" style={{ flex: '1 1 250px', minWidth: '200px' }}>
              <Flex justify="between" align="center" gap="3">
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Total Patients</Text>
                  <Text size="6" weight="bold">
                    {dashboardData.totalPatients || 0}
                  </Text>
                </Box>
                <Box
                  style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: 'var(--purple-3)',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="20" height="20" fill="none" stroke="var(--purple-9)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </Box>
              </Flex>
            </Card>

            <Card size="2" variant="surface" style={{ flex: '1 1 250px', minWidth: '200px' }}>
              <Flex justify="between" align="center" gap="3">
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Available Reports</Text>
                  <Text size="6" weight="bold">6</Text>
                </Box>
                <Box
                  style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: 'var(--orange-3)',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="20" height="20" fill="none" stroke="var(--orange-9)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </Box>
              </Flex>
            </Card>
          </Flex>

          <Flex gap="3" direction={{ initial: 'column', md: 'row' }}>
            <Card size="2" variant="surface" style={{ flex: 1 }}>
              <Flex direction="column" gap="3" p="3">
                <Flex justify="between" align="center">
                  <Heading size="4">Available Reports</Heading>
                  {(selectedReport === 'consultations' || selectedReport === 'income') && (
                    <Select.Root
                      value={period}
                      onValueChange={(value) => {
                        setPeriod(value as 'daily' | 'weekly' | 'monthly');
                        if (selectedReport) {
                          fetchReport(selectedReport, value as 'daily' | 'weekly' | 'monthly');
                        }
                      }}
                      size="1"
                    >
                      <Select.Trigger />
                      <Select.Content>
                        <Select.Item value="daily">Daily</Select.Item>
                        <Select.Item value="weekly">Weekly</Select.Item>
                        <Select.Item value="monthly">Monthly</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  )}
                </Flex>
                <Flex direction="column" gap="2">
                  <Button
                    variant="soft"
                    onClick={() => fetchReport('consultations', period)}
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    <Flex direction="column" align="start" gap="1" style={{ width: '100%' }}>
                      <Text size="2" weight="medium">Consultations Report</Text>
                      <Text size="1" color="gray">View consultation statistics</Text>
                    </Flex>
                  </Button>
                  <Button
                    variant="soft"
                    onClick={() => fetchReport('income', period)}
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    <Flex direction="column" align="start" gap="1" style={{ width: '100%' }}>
                      <Text size="2" weight="medium">Income Report</Text>
                      <Text size="1" color="gray">Financial performance analysis</Text>
                    </Flex>
                  </Button>
                  <Button
                    variant="soft"
                    onClick={() => fetchReport('demographics')}
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    <Flex direction="column" align="start" gap="1" style={{ width: '100%' }}>
                      <Text size="2" weight="medium">Demographics Report</Text>
                      <Text size="1" color="gray">Patient demographics analysis</Text>
                    </Flex>
                  </Button>
                  <Button
                    variant="soft"
                    onClick={() => fetchReport('inventory')}
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    <Flex direction="column" align="start" gap="1" style={{ width: '100%' }}>
                      <Text size="2" weight="medium">Inventory Report</Text>
                      <Text size="1" color="gray">Inventory status and usage</Text>
                    </Flex>
                  </Button>
                  <Button
                    variant="soft"
                    onClick={() => fetchReport('hmo-claims')}
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    <Flex direction="column" align="start" gap="1" style={{ width: '100%' }}>
                      <Text size="2" weight="medium">HMO Claims Report</Text>
                      <Text size="1" color="gray">HMO claims and reimbursements</Text>
                    </Flex>
                  </Button>
                </Flex>
              </Flex>
            </Card>

            <Card size="2" variant="surface" style={{ flex: 1 }}>
              <Flex direction="column" gap="3" p="3">
                <Heading size="4">Report Details</Heading>
                {reportLoading ? (
                  <Flex justify="center" align="center" style={{ minHeight: '200px' }}>
                    <Flex direction="column" align="center" gap="2">
                      <Spinner size="3" />
                      <Text size="2" color="gray">Loading report...</Text>
                    </Flex>
                  </Flex>
                ) : reportData ? (
                  <Box style={{ maxHeight: '500px', overflowY: 'auto' }}>
                    {renderReportDetails(selectedReport!, reportData)}
                  </Box>
                ) : (
                  <Flex justify="center" align="center" style={{ minHeight: '200px' }}>
                    <Text size="2" color="gray">Select a report to view details</Text>
                  </Flex>
                )}
              </Flex>
            </Card>
          </Flex>
        </Flex>
      </Container>
    </Section>
  );
}

