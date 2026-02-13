// Third-Party Lab Integration Utilities
// Supports integration with external laboratory systems

export interface LabIntegrationConfig {
  labName: string;
  labId?: string;
  labCode?: string;
  integrationType: 'manual' | 'api' | 'hl7' | 'other';
  apiEndpoint?: string;
  apiKey?: string;
  apiSecret?: string;
  credentials?: Record<string, any>;
}

export interface LabRequestPayload {
  requestCode: string;
  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender?: string;
    patientCode?: string;
  };
  testType: string;
  testCode?: string;
  urgency: 'routine' | 'urgent' | 'stat';
  clinicalInfo?: {
    diagnosis?: string;
    chiefComplaint?: string;
  };
  specialInstructions?: string;
}

export interface LabResultPayload {
  externalRequestId: string;
  externalResultId: string;
  testType: string;
  results: any;
  resultDate: string;
  referenceRanges?: any;
  abnormalFlags?: Record<string, 'high' | 'low' | 'normal'>;
  interpretation?: string;
}

// Send lab request to third-party lab via API
export async function sendLabRequestToThirdParty(
  config: LabIntegrationConfig,
  request: LabRequestPayload
): Promise<{ success: boolean; externalRequestId?: string; error?: string }> {
  if (config.integrationType !== 'api') {
    return {
      success: false,
      error: 'API integration not configured for this lab',
    };
  }

  if (!config.apiEndpoint || !config.apiKey) {
    return {
      success: false,
      error: 'Lab API credentials not configured',
    };
  }

  try {
    // Example API call - adjust based on actual lab API
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        ...(config.apiSecret && { 'X-API-Secret': config.apiSecret }),
      },
      body: JSON.stringify({
        request: {
          requestCode: request.requestCode,
          patient: request.patient,
          test: {
            type: request.testType,
            code: request.testCode,
            urgency: request.urgency,
          },
          clinicalInfo: request.clinicalInfo,
          instructions: request.specialInstructions,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `API error: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      externalRequestId: data.requestId || data.id,
    };
  } catch (error: any) {
    console.error('Error sending lab request to third party:', error);
    return {
      success: false,
      error: error.message || 'Failed to send request to lab',
    };
  }
}

// Receive lab results from third-party lab
export async function receiveLabResultFromThirdParty(
  config: LabIntegrationConfig,
  result: LabResultPayload
): Promise<{ success: boolean; error?: string }> {
  if (config.integrationType !== 'api') {
    return {
      success: false,
      error: 'API integration not configured for this lab',
    };
  }

  // This would typically be called by a webhook from the lab
  // For now, we'll just validate the payload
  if (!result.externalRequestId || !result.externalResultId) {
    return {
      success: false,
      error: 'Missing required fields in lab result',
    };
  }

  return {
    success: true,
  };
}

// HL7 Integration (placeholder for HL7 message processing)
export function processHL7Message(hl7Message: string): LabRequestPayload | null {
  // This would parse HL7 messages
  // For now, return null as placeholder
  return null;
}

// Webhook handler for receiving lab results
export async function handleLabResultWebhook(
  config: LabIntegrationConfig,
  webhookPayload: any
): Promise<LabResultPayload | null> {
  // Process webhook payload based on lab's format
  // This is a placeholder - implement based on actual lab webhook format
  
  if (!webhookPayload.requestId || !webhookPayload.results) {
    return null;
  }

  return {
    externalRequestId: webhookPayload.requestId,
    externalResultId: webhookPayload.resultId || webhookPayload.id,
    testType: webhookPayload.testType || webhookPayload.test?.type,
    results: webhookPayload.results,
    resultDate: webhookPayload.resultDate || new Date().toISOString(),
    referenceRanges: webhookPayload.referenceRanges,
    abnormalFlags: webhookPayload.abnormalFlags,
    interpretation: webhookPayload.interpretation,
  };
}

