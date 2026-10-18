import { IMedicine } from '@/models/Medicine';

export interface PatientInfo {
  age?: number; // in years
  weight?: number; // in kg
  condition?: string; // e.g., "renal impairment", "hepatic impairment"
}

export interface CalculatedDosage {
  dose: string;
  frequency: string;
  totalDailyDose?: string;
  instructions?: string;
  warnings?: string[];
}

/**
 * Calculate medication dosage based on patient information and medicine data
 */
export function calculateDosage(
  medicine: IMedicine,
  patientInfo: PatientInfo
): CalculatedDosage {
  const { age, weight, condition } = patientInfo;
  
  // Check for contraindications based on condition
  const warnings: string[] = [];
  if (condition && medicine.contraindications) {
    const contraindicated = medicine.contraindications.some((contra) =>
      condition.toLowerCase().includes(contra.toLowerCase())
    );
    if (contraindicated) {
      warnings.push(`Warning: This medication may be contraindicated for patients with ${condition}`);
    }
  }

  // If medicine has dosage ranges, find the appropriate one
  if (medicine.dosageRanges && medicine.dosageRanges.length > 0) {
    for (const range of medicine.dosageRanges) {
      // Check age range
      if (age !== undefined) {
        if (range.minAge !== undefined && age < range.minAge) continue;
        if (range.maxAge !== undefined && age > range.maxAge) continue;
      }

      // Check weight range
      if (weight !== undefined) {
        if (range.minWeight !== undefined && weight < range.minWeight) continue;
        if (range.maxWeight !== undefined && weight > range.maxWeight) continue;
      }

      // Found matching range
      let calculatedDose = range.dose;
      
      // If dose is weight-based (e.g., "10-20 mg/kg"), calculate it
      if (weight && calculatedDose.includes('mg/kg')) {
        const match = calculatedDose.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mg\/kg/i);
        if (match) {
          const minDose = parseFloat(match[1]) * weight;
          const maxDose = parseFloat(match[2]) * weight;
          calculatedDose = `${Math.round(minDose)}-${Math.round(maxDose)} mg`;
        } else {
          const singleMatch = calculatedDose.match(/(\d+(?:\.\d+)?)\s*mg\/kg/i);
          if (singleMatch) {
            const dosePerKg = parseFloat(singleMatch[1]);
            const totalDose = dosePerKg * weight;
            calculatedDose = `${Math.round(totalDose)} mg`;
          }
        }
      }

      return {
        dose: calculatedDose,
        frequency: range.frequency,
        totalDailyDose: range.maxDailyDose,
        instructions: `Based on patient's ${age !== undefined ? `age (${age} years)` : ''}${age && weight ? ' and ' : ''}${weight !== undefined ? `weight (${weight} kg)` : ''}`,
        warnings,
      };
    }
  }

  // Fall back to standard dosage
  return {
    dose: medicine.standardDosage || medicine.strength,
    frequency: medicine.standardFrequency || 'As directed',
    instructions: 'Standard adult dosage',
    warnings,
  };
}

/**
 * Doses a day as the prescription form reads a frequency, or null when it can't tell
 * (the form then counts one a day). The medicines page uses this to warn about wordings
 * the count can't read.
 */
export function timesPerDay(frequency: string): number | null {
  const f = frequency.toLowerCase();
  if (f.includes('once') || f.includes('qd')) return 1;
  if (f.includes('bid') || f.includes('twice')) return 2;
  if (f.includes('tid') || f.includes('three')) return 3;
  if (f.includes('qid') || f.includes('four')) return 4;
  if (f.includes('every')) {
    const match = frequency.match(/every\s*(\d+)\s*h/i);
    if (match && parseInt(match[1]) > 0) return Math.floor(24 / parseInt(match[1]));
  }
  return null;
}

/**
 * Calculate total quantity needed based on frequency and duration
 */
export function calculateQuantity(
  frequency: string,
  durationDays: number,
  dose: string
): number {
  return (timesPerDay(frequency) ?? 1) * durationDays;
}

/**
 * Format dosage instructions for display
 */
export function formatDosageInstructions(
  medicine: IMedicine,
  calculatedDosage: CalculatedDosage,
  durationDays: number
): string {
  const parts: string[] = [];
  
  parts.push(`${calculatedDosage.dose}`);
  parts.push(`${calculatedDosage.frequency}`);
  
  if (durationDays > 0) {
    parts.push(`for ${durationDays} day${durationDays > 1 ? 's' : ''}`);
  }
  
  if (medicine.form === 'tablet' || medicine.form === 'capsule') {
    parts.push(`(${medicine.form})`);
  }
  
  if (medicine.route) {
    parts.push(`via ${medicine.route}`);
  }
  
  return parts.join(', ');
}

