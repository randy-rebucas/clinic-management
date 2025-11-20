// Common ICD-10 diagnosis codes for quick reference
// This is a subset - in production, you'd use a full ICD-10 database

export interface ICD10Code {
  code: string;
  description: string;
  category: string;
}

export const COMMON_ICD10_CODES: ICD10Code[] = [
  // Infectious Diseases
  { code: 'A00-B99', description: 'Certain infectious and parasitic diseases', category: 'Infectious' },
  { code: 'J00-J99', description: 'Diseases of the respiratory system', category: 'Respiratory' },
  { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified', category: 'Respiratory' },
  { code: 'J11.1', description: 'Influenza with other respiratory manifestations', category: 'Respiratory' },
  
  // Endocrine, Nutritional and Metabolic
  { code: 'E00-E90', description: 'Endocrine, nutritional and metabolic diseases', category: 'Endocrine' },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', category: 'Endocrine' },
  { code: 'E78.5', description: 'Hyperlipidemia, unspecified', category: 'Endocrine' },
  
  // Mental and Behavioral
  { code: 'F00-F99', description: 'Mental, behavioral and neurodevelopmental disorders', category: 'Mental Health' },
  { code: 'F41.9', description: 'Anxiety disorder, unspecified', category: 'Mental Health' },
  { code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified', category: 'Mental Health' },
  
  // Nervous System
  { code: 'G00-G99', description: 'Diseases of the nervous system', category: 'Neurological' },
  { code: 'G43.909', description: 'Migraine, unspecified, not intractable, without status migrainosus', category: 'Neurological' },
  
  // Circulatory System
  { code: 'I00-I99', description: 'Diseases of the circulatory system', category: 'Cardiovascular' },
  { code: 'I10', description: 'Essential (primary) hypertension', category: 'Cardiovascular' },
  { code: 'I25.10', description: 'Atherosclerotic heart disease of native coronary artery without angina pectoris', category: 'Cardiovascular' },
  
  // Digestive System
  { code: 'K00-K95', description: 'Diseases of the digestive system', category: 'Digestive' },
  { code: 'K21.9', description: 'Gastro-esophageal reflux disease without esophagitis', category: 'Digestive' },
  { code: 'K59.00', description: 'Constipation, unspecified', category: 'Digestive' },
  
  // Musculoskeletal
  { code: 'M00-M99', description: 'Diseases of the musculoskeletal system and connective tissue', category: 'Musculoskeletal' },
  { code: 'M79.3', description: 'Panniculitis, unspecified', category: 'Musculoskeletal' },
  { code: 'M54.5', description: 'Low back pain', category: 'Musculoskeletal' },
  
  // Genitourinary
  { code: 'N00-N99', description: 'Diseases of the genitourinary system', category: 'Genitourinary' },
  { code: 'N39.0', description: 'Urinary tract infection, site not specified', category: 'Genitourinary' },
  
  // Symptoms and Signs
  { code: 'R00-R94', description: 'Symptoms, signs and abnormal clinical and laboratory findings', category: 'Symptoms' },
  { code: 'R50.9', description: 'Fever, unspecified', category: 'Symptoms' },
  { code: 'R51', description: 'Headache', category: 'Symptoms' },
  { code: 'R06.02', description: 'Shortness of breath', category: 'Symptoms' },
  
  // Injury and Poisoning
  { code: 'S00-T88', description: 'Injury, poisoning and certain other consequences of external causes', category: 'Injury' },
  
  // External Causes
  { code: 'V00-Y99', description: 'External causes of morbidity and mortality', category: 'External' },
  
  // Factors Influencing Health Status
  { code: 'Z00-Z99', description: 'Factors influencing health status and contact with health services', category: 'Health Status' },
  { code: 'Z00.00', description: 'Encounter for general adult medical examination without abnormal findings', category: 'Health Status' },
];

export function searchICD10(query: string): ICD10Code[] {
  const lowerQuery = query.toLowerCase();
  return COMMON_ICD10_CODES.filter(
    (code) =>
      code.code.toLowerCase().includes(lowerQuery) ||
      code.description.toLowerCase().includes(lowerQuery) ||
      code.category.toLowerCase().includes(lowerQuery)
  );
}

export function getICD10ByCode(code: string): ICD10Code | undefined {
  return COMMON_ICD10_CODES.find((c) => c.code === code);
}

