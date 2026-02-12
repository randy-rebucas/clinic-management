/**
 * Medical Specializations Constants
 * 
 * Centralized list of medical specializations used across the application.
 * Import this file to ensure consistency between UI components and database seeding.
 * 
 * Usage:
 * ```typescript
 * import { MEDICAL_SPECIALIZATIONS } from '@/lib/constants/specializations';
 * ```
 */

export const MEDICAL_SPECIALIZATIONS = [
  'General Practice / Family Medicine',
  'Internal Medicine',
  'Pediatrics',
  'Obstetrics and Gynecology',
  'Surgery',
  'Orthopedic Surgery',
  'Cardiology',
  'Dermatology',
  'Neurology',
  'Psychiatry',
  'Ophthalmology',
  'ENT (Ear, Nose, and Throat)',
  'Urology',
  'Oncology',
  'Radiology',
  'Anesthesiology',
  'Emergency Medicine',
  'Pathology',
  'Pulmonology',
  'Gastroenterology',
  'Endocrinology',
  'Rheumatology',
  'Nephrology',
  'Hematology',
  'Infectious Disease',
  'Physical Medicine and Rehabilitation',
  'Sports Medicine',
  'Geriatrics',
  'Allergy and Immunology',
  'Critical Care Medicine',
  'Plastic Surgery',
  'Neurosurgery',
  'Cardiothoracic Surgery',
  'Vascular Surgery',
  'Pediatric Surgery',
  'Other',
] as const;

/**
 * Type for medical specialization names
 */
export type MedicalSpecialization = typeof MEDICAL_SPECIALIZATIONS[number];

/**
 * Specialization categories
 */
export enum SpecializationCategory {
  PRIMARY_CARE = 'Primary Care',
  SURGERY = 'Surgery',
  DIAGNOSTIC = 'Diagnostic',
  EMERGENCY = 'Emergency',
  SPECIALTY = 'Specialty',
}

/**
 * Categorize a specialization name into its broad category
 */
export function categorizeSpecialization(name: string): SpecializationCategory {
  if (
    name.includes('Surgery') || 
    name === 'Plastic Surgery' || 
    name === 'Neurosurgery' || 
    name === 'Cardiothoracic Surgery' || 
    name === 'Vascular Surgery' || 
    name === 'Pediatric Surgery'
  ) {
    return SpecializationCategory.SURGERY;
  }
  
  if (
    name === 'Radiology' || 
    name === 'Pathology' || 
    name === 'Anesthesiology'
  ) {
    return SpecializationCategory.DIAGNOSTIC;
  }
  
  if (
    name === 'Emergency Medicine' || 
    name === 'Critical Care Medicine'
  ) {
    return SpecializationCategory.EMERGENCY;
  }
  
  if (
    name === 'General Practice / Family Medicine' || 
    name === 'Internal Medicine' || 
    name === 'Pediatrics' || 
    name === 'Geriatrics'
  ) {
    return SpecializationCategory.PRIMARY_CARE;
  }
  
  return SpecializationCategory.SPECIALTY;
}

/**
 * Get specializations grouped by category
 */
export function getSpecializationsByCategory(): Record<SpecializationCategory, string[]> {
  const grouped: Record<string, string[]> = {
    [SpecializationCategory.PRIMARY_CARE]: [],
    [SpecializationCategory.SURGERY]: [],
    [SpecializationCategory.DIAGNOSTIC]: [],
    [SpecializationCategory.EMERGENCY]: [],
    [SpecializationCategory.SPECIALTY]: [],
  };
  
  for (const spec of MEDICAL_SPECIALIZATIONS) {
    const category = categorizeSpecialization(spec);
    grouped[category].push(spec);
  }
  
  return grouped as Record<SpecializationCategory, string[]>;
}

/**
 * Get description for a specialization
 */
export function getSpecializationDescription(name: string): string {
  const descriptions: Record<string, string> = {
    'General Practice / Family Medicine': 'Comprehensive healthcare for individuals and families of all ages',
    'Internal Medicine': 'Prevention, diagnosis, and treatment of adult diseases',
    'Pediatrics': 'Medical care for infants, children, and adolescents',
    'Obstetrics and Gynecology': "Women's reproductive health, pregnancy, and childbirth",
    'Surgery': 'Operative treatment of diseases, injuries, and deformities',
    'Orthopedic Surgery': 'Treatment of musculoskeletal system disorders',
    'Cardiology': 'Diagnosis and treatment of heart and cardiovascular conditions',
    'Dermatology': 'Skin, hair, and nail disorders and treatments',
    'Neurology': 'Disorders of the nervous system and brain',
    'Psychiatry': 'Mental health disorders and emotional well-being',
    'Ophthalmology': 'Eye and vision care',
    'ENT (Ear, Nose, and Throat)': 'Disorders of the ear, nose, throat, and related structures',
    'Urology': 'Urinary tract and male reproductive system',
    'Oncology': 'Cancer diagnosis, treatment, and management',
    'Radiology': 'Medical imaging for diagnosis and treatment',
    'Anesthesiology': 'Anesthesia, pain management, and critical care',
    'Emergency Medicine': 'Immediate evaluation and treatment of acute illnesses and injuries',
    'Pathology': 'Laboratory diagnosis of disease through examination of tissues and fluids',
    'Pulmonology': 'Respiratory system and lung diseases',
    'Gastroenterology': 'Digestive system and gastrointestinal disorders',
    'Endocrinology': 'Hormonal disorders and endocrine system',
    'Rheumatology': 'Autoimmune and inflammatory diseases affecting joints and muscles',
    'Nephrology': 'Kidney diseases and renal system disorders',
    'Hematology': 'Blood disorders and diseases affecting blood cells',
    'Infectious Disease': 'Prevention and treatment of infectious and communicable diseases',
    'Physical Medicine and Rehabilitation': 'Restoration of function and quality of life after injury or illness',
    'Sports Medicine': 'Prevention and treatment of sports and exercise-related injuries',
    'Geriatrics': 'Healthcare for elderly patients and age-related conditions',
    'Allergy and Immunology': 'Allergic and immunologic disorders',
    'Critical Care Medicine': 'Life-threatening conditions requiring intensive monitoring',
    'Plastic Surgery': 'Reconstruction and cosmetic enhancement of body structures',
    'Neurosurgery': 'Surgical treatment of nervous system disorders',
    'Cardiothoracic Surgery': 'Surgical treatment of heart and chest conditions',
    'Vascular Surgery': 'Surgical treatment of blood vessel diseases',
    'Pediatric Surgery': 'Surgical care for infants, children, and adolescents',
    'Other': 'Other medical specializations',
  };
  
  return descriptions[name] || `Medical specialization in ${name}`;
}

/**
 * Validate if a string is a valid specialization
 */
export function isValidSpecialization(name: string): name is MedicalSpecialization {
  return (MEDICAL_SPECIALIZATIONS as readonly string[]).includes(name);
}
