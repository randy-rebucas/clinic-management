// Drug Interaction Checker
// Basic implementation with option for advanced API integration

export interface DrugInteraction {
  medication1: string;
  medication2: string;
  severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
  description: string;
  recommendation?: string;
}

// Basic drug interaction database (common interactions)
// For production, consider using a professional API like:
// - RxNav API (free, from NLM)
// - DrugBank API
// - Micromedex API (commercial)
const BASIC_INTERACTIONS: Record<string, Array<{ drug: string; severity: string; description: string }>> = {
  'warfarin': [
    { drug: 'aspirin', severity: 'severe', description: 'Increased risk of bleeding' },
    { drug: 'ibuprofen', severity: 'moderate', description: 'Increased bleeding risk' },
    { drug: 'acetaminophen', severity: 'mild', description: 'May affect INR' },
  ],
  'aspirin': [
    { drug: 'warfarin', severity: 'severe', description: 'Increased risk of bleeding' },
    { drug: 'ibuprofen', severity: 'moderate', description: 'Increased GI bleeding risk' },
  ],
  'ibuprofen': [
    { drug: 'warfarin', severity: 'moderate', description: 'Increased bleeding risk' },
    { drug: 'aspirin', severity: 'moderate', description: 'Increased GI bleeding risk' },
    { drug: 'lithium', severity: 'moderate', description: 'May increase lithium levels' },
  ],
  'metformin': [
    { drug: 'alcohol', severity: 'moderate', description: 'Increased risk of lactic acidosis' },
  ],
  'digoxin': [
    { drug: 'furosemide', severity: 'moderate', description: 'May cause hypokalemia and digoxin toxicity' },
  ],
  'lithium': [
    { drug: 'ibuprofen', severity: 'moderate', description: 'May increase lithium levels' },
    { drug: 'furosemide', severity: 'moderate', description: 'May increase lithium levels' },
  ],
  'furosemide': [
    { drug: 'digoxin', severity: 'moderate', description: 'May cause hypokalemia and digoxin toxicity' },
    { drug: 'lithium', severity: 'moderate', description: 'May increase lithium levels' },
  ],
};

// Normalize medication name for comparison
function normalizeMedicationName(name: string): string {
  return name.toLowerCase().trim();
}

// Check if two medications interact
function checkBasicInteraction(med1: string, med2: string): DrugInteraction | null {
  const normalized1 = normalizeMedicationName(med1);
  const normalized2 = normalizeMedicationName(med2);

  // Check direct interaction
  const interactions1 = BASIC_INTERACTIONS[normalized1];
  if (interactions1) {
    const interaction = interactions1.find((i) => normalizeMedicationName(i.drug) === normalized2);
    if (interaction) {
      return {
        medication1: med1,
        medication2: med2,
        severity: interaction.severity as any,
        description: interaction.description,
        recommendation: getRecommendation(interaction.severity),
      };
    }
  }

  // Check reverse (med2 -> med1)
  const interactions2 = BASIC_INTERACTIONS[normalized2];
  if (interactions2) {
    const interaction = interactions2.find((i) => normalizeMedicationName(i.drug) === normalized1);
    if (interaction) {
      return {
        medication1: med1,
        medication2: med2,
        severity: interaction.severity as any,
        description: interaction.description,
        recommendation: getRecommendation(interaction.severity),
      };
    }
  }

  return null;
}

function getRecommendation(severity: string): string {
  switch (severity) {
    case 'contraindicated':
      return 'Do not use together. Consider alternative medications.';
    case 'severe':
      return 'Use with extreme caution. Monitor closely. Consider dose adjustment or alternative.';
    case 'moderate':
      return 'Monitor patient closely. May require dose adjustment or additional monitoring.';
    case 'mild':
      return 'Minor interaction. Monitor patient.';
    default:
      return 'Review interaction and monitor patient.';
  }
}

// Check interactions for a list of medications
export function checkDrugInteractions(medications: Array<{ name: string; genericName?: string }>): DrugInteraction[] {
  const interactions: DrugInteraction[] = [];

  for (let i = 0; i < medications.length; i++) {
    for (let j = i + 1; j < medications.length; j++) {
      const med1 = medications[i];
      const med2 = medications[j];

      // Check using brand name
      let interaction = checkBasicInteraction(med1.name, med2.name);
      
      // Check using generic name if available
      if (!interaction && med1.genericName && med2.genericName) {
        interaction = checkBasicInteraction(med1.genericName, med2.genericName);
      }
      
      // Check brand vs generic
      if (!interaction && med1.genericName) {
        interaction = checkBasicInteraction(med1.genericName, med2.name);
      }
      if (!interaction && med2.genericName) {
        interaction = checkBasicInteraction(med1.name, med2.genericName);
      }

      if (interaction) {
        interactions.push(interaction);
      }
    }
  }

  return interactions;
}

// Advanced API integration (placeholder for professional services)
export async function checkDrugInteractionsAdvanced(
  medications: Array<{ name: string; genericName?: string }>
): Promise<DrugInteraction[]> {
  // Check if advanced API is configured
  const apiKey = process.env.DRUG_INTERACTION_API_KEY;
  const apiUrl = process.env.DRUG_INTERACTION_API_URL;

  if (!apiKey || !apiUrl) {
    // Fall back to basic checking
    return checkDrugInteractions(medications);
  }

  try {
    // Example integration with external API
    // This is a placeholder - implement based on your chosen API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        medications: medications.map((m) => ({
          name: m.name,
          genericName: m.genericName,
        })),
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.interactions || [];
    }
  } catch (error) {
    console.error('Error checking drug interactions via API:', error);
    // Fall back to basic checking
  }

  return checkDrugInteractions(medications);
}

// Check interactions with patient's current medications
export async function checkInteractionsWithPatientMedications(
  prescriptionMedications: Array<{ name: string; genericName?: string }>,
  patientCurrentMedications?: Array<{ name: string; genericName?: string }>
): Promise<DrugInteraction[]> {
  if (!patientCurrentMedications || patientCurrentMedications.length === 0) {
    return checkDrugInteractions(prescriptionMedications);
  }

  const allMedications = [...prescriptionMedications, ...patientCurrentMedications];
  return checkDrugInteractions(allMedications);
}

