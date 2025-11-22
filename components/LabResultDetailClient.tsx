'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Tabs, Callout, Heading, IconButton, Separator } from '@radix-ui/themes';

interface LabResult {
  _id: string;
  requestCode?: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
  };
  visit?: {
    _id: string;
    visitCode: string;
    date: string;
    visitType?: string;
  };
  orderedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  reviewedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  orderDate: string;
  request: {
    testType: string;
    testCode?: string;
    description?: string;
    urgency?: 'routine' | 'urgent' | 'stat';
    specialInstructions?: string;
    fastingRequired?: boolean;
    preparationNotes?: string;
  };
  thirdPartyLab?: {
    labName: string;
    labId?: string;
    labCode?: string;
    integrationType?: 'manual' | 'api' | 'hl7' | 'other';
    status?: 'pending' | 'sent' | 'received' | 'error';
    sentAt?: string;
    receivedAt?: string;
    errorMessage?: string;
  };
  results?: any;
  resultDate?: string;
  interpretation?: string;
  referenceRanges?: any;
  abnormalFlags?: Record<string, 'high' | 'low' | 'normal'>;
  status: 'ordered' | 'in-progress' | 'completed' | 'reviewed' | 'cancelled';
  attachments?: Array<{
    filename: string;
    url: string;
    uploadedAt: string;
  }>;
  reviewedAt?: string;
  notificationSent?: boolean;
  notificationSentAt?: string;
  notificationMethod?: 'email' | 'sms' | 'both';
}

export default function LabResultDetailClient({ labResultId }: { labResultId: string }) {
  const [labResult, setLabResult] = useState<LabResult | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchLabResult();
  }, [labResultId]);

  const fetchLabResult = async () => {
    try {
      const res = await fetch(`/api/lab-results/${labResultId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setLabResult(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch lab result:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): 'green' | 'blue' | 'yellow' | 'gray' | 'red' => {
    switch (status) {
      case 'reviewed':
        return 'green';
      case 'completed':
        return 'blue';
      case 'in-progress':
        return 'yellow';
      case 'ordered':
        return 'gray';
      case 'cancelled':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getUrgencyColor = (urgency?: string): 'green' | 'orange' | 'red' => {
    switch (urgency) {
      case 'stat':
        return 'red';
      case 'urgent':
        return 'orange';
      default:
        return 'green';
    }
  };

  if (loading) {
    return (
      <Box p="4" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Flex direction="column" align="center" gap="3">
          <Spinner size="3" />
          <Text>Loading lab result...</Text>
        </Flex>
      </Box>
    );
  }

  if (!labResult) {
    return (
      <Box p="4" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Flex direction="column" align="center" gap="3">
          <Heading size="5">Lab result not found</Heading>
          <Button asChild variant="soft">
            <Link href="/lab-results">Back to Lab Results</Link>
          </Button>
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="4">
      {/* Header */}
      <Box mb="4">
        <Flex align="center" gap="3" mb="2">
          <IconButton
            variant="ghost"
            onClick={() => router.push('/lab-results')}
            size="2"
          >
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </IconButton>
          <Heading size="7">{labResult.requestCode || 'Lab Order'}</Heading>
        </Flex>
        <Flex align="center" gap="2" ml="8">
          <Link href={`/patients/${labResult.patient._id}`}>
            <Text size="2" style={{ color: 'var(--blue-9)', textDecoration: 'none' }}>
              {labResult.patient.firstName} {labResult.patient.lastName}
            </Text>
          </Link>
          <Text size="2" color="gray">•</Text>
          <Text size="2" color="gray">
            {new Date(labResult.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </Flex>
      </Box>

      <Flex direction="column" gap="3">
        {/* Status Card */}
        <Card>
          <Box p="3">
            <Flex justify="between" align="center" mb="3">
              <Heading size="3">Status</Heading>
              <Badge color={getStatusColor(labResult.status)} size="2">
                {labResult.status}
              </Badge>
            </Flex>
            <Flex direction={{ initial: 'column', sm: 'row' }} gap="4" wrap="wrap">
              <Box>
                <Text size="1" color="gray" mb="1" as="div">Order Date</Text>
                <Text size="2" weight="medium">
                  {new Date(labResult.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </Box>
              {labResult.resultDate && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Result Date</Text>
                  <Text size="2" weight="medium">
                    {new Date(labResult.resultDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </Box>
              )}
              {labResult.orderedBy && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Ordered By</Text>
                  <Text size="2" weight="medium">{labResult.orderedBy.name}</Text>
                </Box>
              )}
              {labResult.reviewedBy && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Reviewed By</Text>
                  <Text size="2" weight="medium">{labResult.reviewedBy.name}</Text>
                </Box>
              )}
            </Flex>
          </Box>
        </Card>

        {/* Test Request Information */}
        <Card>
          <Box p="3">
            <Heading size="3" mb="3">Test Request</Heading>
            <Flex direction="column" gap="3">
              <Box>
                <Text size="1" color="gray" mb="1" as="div">Test Type</Text>
                <Text size="2" weight="medium">{labResult.request.testType}</Text>
              </Box>
              {labResult.request.testCode && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Test Code</Text>
                  <Text size="2" weight="medium">{labResult.request.testCode}</Text>
                </Box>
              )}
              {labResult.request.description && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Description</Text>
                  <Text size="2" weight="medium">{labResult.request.description}</Text>
                </Box>
              )}
              <Flex gap="4" wrap="wrap">
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Urgency</Text>
                  <Badge color={getUrgencyColor(labResult.request.urgency)} size="1" variant="soft">
                    {labResult.request.urgency || 'routine'}
                  </Badge>
                </Box>
                {labResult.request.fastingRequired && (
                  <Box>
                    <Text size="1" color="gray" mb="1" as="div">Fasting Required</Text>
                    <Text size="2" weight="medium">Yes</Text>
                  </Box>
                )}
              </Flex>
              {labResult.request.specialInstructions && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Special Instructions</Text>
                  <Text size="2" weight="medium">{labResult.request.specialInstructions}</Text>
                </Box>
              )}
              {labResult.request.preparationNotes && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Preparation Notes</Text>
                  <Text size="2" weight="medium">{labResult.request.preparationNotes}</Text>
                </Box>
              )}
            </Flex>
          </Box>
        </Card>

        {/* Results */}
        {labResult.results && (
          <Card>
            <Box p="3">
              <Heading size="3" mb="3">Results</Heading>
              <Flex direction="column" gap="2">
                {typeof labResult.results === 'object' && labResult.results !== null ? (
                  Object.entries(labResult.results).map(([key, value]) => {
                    const flag = labResult.abnormalFlags?.[key];
                    const referenceRange = labResult.referenceRanges?.[key];
                    return (
                      <Box key={key} pb="2" style={{ borderBottom: '1px solid var(--gray-6)' }}>
                        <Flex justify="between" align="start" gap="3">
                          <Box style={{ flex: 1 }}>
                            <Text size="2" weight="medium" style={{ textTransform: 'capitalize' }}>
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </Text>
                            {referenceRange && (
                              <Text size="1" color="gray" as="div">Ref: {referenceRange}</Text>
                            )}
                          </Box>
                          <Flex align="center" gap="2">
                            <Text 
                              size="2" 
                              weight="medium"
                              color={flag === 'high' ? 'red' : flag === 'low' ? 'orange' : undefined}
                            >
                              {String(value)}
                            </Text>
                            {flag && (
                              <Badge 
                                color={flag === 'high' ? 'red' : flag === 'low' ? 'orange' : 'green'} 
                                size="1"
                                variant="soft"
                              >
                                {flag.toUpperCase()}
                              </Badge>
                            )}
                          </Flex>
                        </Flex>
                      </Box>
                    );
                  })
                ) : (
                  <Text size="2">{String(labResult.results)}</Text>
                )}
              </Flex>
              {labResult.interpretation && (
                <Box mt="3" pt="3" style={{ borderTop: '1px solid var(--gray-6)' }}>
                  <Text size="1" color="gray" mb="1" as="div">Interpretation</Text>
                  <Text size="2" weight="medium">{labResult.interpretation}</Text>
                </Box>
              )}
            </Box>
          </Card>
        )}

        {/* Third Party Lab Information */}
        {labResult.thirdPartyLab && (
          <Card>
            <Box p="3">
              <Heading size="3" mb="3">Third Party Lab</Heading>
              <Flex direction="column" gap="3">
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Lab Name</Text>
                  <Text size="2" weight="medium">{labResult.thirdPartyLab.labName}</Text>
                </Box>
                {labResult.thirdPartyLab.labCode && (
                  <Box>
                    <Text size="1" color="gray" mb="1" as="div">Lab Code</Text>
                    <Text size="2" weight="medium">{labResult.thirdPartyLab.labCode}</Text>
                  </Box>
                )}
                {labResult.thirdPartyLab.status && (
                  <Box>
                    <Text size="1" color="gray" mb="1" as="div">Status</Text>
                    <Text size="2" weight="medium" style={{ textTransform: 'capitalize' }}>
                      {labResult.thirdPartyLab.status}
                    </Text>
                  </Box>
                )}
                {labResult.thirdPartyLab.sentAt && (
                  <Box>
                    <Text size="1" color="gray" mb="1" as="div">Sent At</Text>
                    <Text size="2" weight="medium">
                      {new Date(labResult.thirdPartyLab.sentAt).toLocaleString()}
                    </Text>
                  </Box>
                )}
                {labResult.thirdPartyLab.receivedAt && (
                  <Box>
                    <Text size="1" color="gray" mb="1" as="div">Received At</Text>
                    <Text size="2" weight="medium">
                      {new Date(labResult.thirdPartyLab.receivedAt).toLocaleString()}
                    </Text>
                  </Box>
                )}
              </Flex>
            </Box>
          </Card>
        )}

        {/* Attachments */}
        {labResult.attachments && labResult.attachments.length > 0 && (
          <Card>
            <Box p="3">
              <Heading size="3" mb="3">Attachments</Heading>
              <Flex direction="column" gap="2">
                {labResult.attachments.map((attachment, index) => (
                  <Button
                    key={index}
                    asChild
                    variant="ghost"
                    size="2"
                  >
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ justifyContent: 'flex-start', textDecoration: 'none' }}
                    >
                      <svg style={{ width: '16px', height: '16px', marginRight: '8px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      {attachment.filename || `Attachment ${index + 1}`}
                    </a>
                  </Button>
                ))}
              </Flex>
            </Box>
          </Card>
        )}

        {/* Visit Link */}
        {labResult.visit && (
          <Card>
            <Box p="3">
              <Heading size="3" mb="2">Related Visit</Heading>
              <Button asChild variant="soft" size="2">
                <Link href={`/visits/${labResult.visit._id}`}>
                  {labResult.visit.visitCode} - {new Date(labResult.visit.date).toLocaleDateString()}
                </Link>
              </Button>
            </Box>
          </Card>
        )}
      </Flex>
    </Box>
  );
}
