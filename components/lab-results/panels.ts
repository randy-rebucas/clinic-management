// Standard parameters of the panels ordered most often, so entering results starts from the
// lines the lab report has rather than one row per test.
//
// Reference ranges are deliberately left out: they depend on the lab's analyser and on the
// patient's age and sex (this is often a children's clinic), and a wrong default would set the
// high/low flags wrongly. The lab types the range from its own report; `unit` is only a hint.
//
// Parameter names become stored keys: no "." and no leading "$" (see safeAnalyteKey).

export interface PanelParameter {
  name: string;
  /** Shown as the result field's placeholder, e.g. "g/dL". */
  unit?: string;
}

interface Panel {
  aliases: string[];
  parameters: PanelParameter[];
}

const PANELS: Panel[] = [
  {
    aliases: ['cbc', 'complete blood count', 'cbc with platelet', 'cbc with platelets', 'cbc with platelet count', 'hemogram'],
    parameters: [
      { name: 'Hemoglobin', unit: 'g/dL' },
      { name: 'Hematocrit', unit: '%' },
      { name: 'RBC', unit: '×10¹²/L' },
      { name: 'WBC', unit: '×10⁹/L' },
      { name: 'Platelets', unit: '×10⁹/L' },
      { name: 'Neutrophils', unit: '%' },
      { name: 'Lymphocytes', unit: '%' },
      { name: 'Monocytes', unit: '%' },
      { name: 'Eosinophils', unit: '%' },
      { name: 'Basophils', unit: '%' },
    ],
  },
  {
    aliases: ['urinalysis', 'ua', 'routine urinalysis', 'urine analysis', 'urine routine'],
    parameters: [
      { name: 'Color', unit: 'e.g. Yellow' },
      { name: 'Transparency', unit: 'e.g. Clear' },
      { name: 'pH' },
      { name: 'Specific gravity', unit: 'e.g. 1015' },
      { name: 'Protein', unit: 'e.g. Negative' },
      { name: 'Glucose', unit: 'e.g. Negative' },
      { name: 'RBC', unit: '/hpf' },
      { name: 'WBC (pus cells)', unit: '/hpf' },
      { name: 'Epithelial cells', unit: 'e.g. Few' },
      { name: 'Bacteria', unit: 'e.g. Few' },
      { name: 'Casts', unit: '/lpf' },
      { name: 'Crystals', unit: 'e.g. None' },
    ],
  },
  {
    aliases: ['lipid profile', 'lipid panel', 'lipids', 'lipid test'],
    parameters: [
      { name: 'Total cholesterol', unit: 'mg/dL' },
      { name: 'Triglycerides', unit: 'mg/dL' },
      { name: 'HDL', unit: 'mg/dL' },
      { name: 'LDL', unit: 'mg/dL' },
      { name: 'VLDL', unit: 'mg/dL' },
    ],
  },
  {
    aliases: ['fecalysis', 'stool exam', 'stool examination', 'routine stool', 'routine stool exam', 'se', 'stool routine'],
    parameters: [
      { name: 'Color', unit: 'e.g. Brown' },
      { name: 'Consistency', unit: 'e.g. Formed' },
      { name: 'Mucus', unit: 'e.g. None' },
      { name: 'RBC', unit: '/hpf' },
      { name: 'WBC (pus cells)', unit: '/hpf' },
      { name: 'Ova or parasites', unit: 'e.g. None seen' },
      { name: 'Occult blood', unit: 'e.g. Negative' },
    ],
  },
];

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The standard parameters for a test name ("CBC", "Urinalysis"…), or null for a single-value test. */
export function panelFor(testType?: string | null): PanelParameter[] | null {
  if (!testType) return null;
  const name = normalize(testType);
  return PANELS.find((p) => p.aliases.some((a) => normalize(a) === name))?.parameters ?? null;
}
