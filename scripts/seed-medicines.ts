/**
 * Seed script: Common Medicines
 * Usage: npm run seed:medicines
 *
 * Inserts ~150 common medicines into the Medicine collection.
 * Safe to re-run: upserts by (tenantId, name, strength) to avoid duplicates.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';
import Medicine from '../models/Medicine';
import Tenant from '../models/Tenant';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI!;

// ─── Medicine catalog ──────────────────────────────────────────────────────────
// Each entry must satisfy the Medicine schema:
//   name, form, strength, unit, route, category, requiresPrescription, active
// Optional but recommended: genericName, brandNames, standardDosage, standardFrequency, duration, indications
const COMMON_MEDICINES: Omit<any, '_id' | 'tenantId' | 'createdAt' | 'updatedAt'>[] = [

  // ── Analgesics / Antipyretics ─────────────────────────────────────────────
  { name: 'Paracetamol 500mg', genericName: 'Acetaminophen', brandNames: ['Biogesic', 'Tempra', 'Calpol'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'Analgesic', indications: ['Pain', 'Fever'], standardDosage: '500–1000mg', standardFrequency: 'Every 4–6 hours', duration: '3–5 days', requiresPrescription: false },
  { name: 'Paracetamol 250mg/5ml', genericName: 'Acetaminophen', brandNames: ['Calpol Syrup', 'Tempra Syrup'], form: 'syrup', strength: '250mg/5ml', unit: 'ml', route: 'oral', category: 'Analgesic', indications: ['Pediatric fever', 'Pain'], standardDosage: '5–10ml', standardFrequency: 'Every 4–6 hours', requiresPrescription: false },
  { name: 'Tramadol 50mg', genericName: 'Tramadol HCl', brandNames: ['Tramal', 'Ultram'], form: 'capsule', strength: '50mg', unit: 'mg', route: 'oral', category: 'Opioid Analgesic', indications: ['Moderate to severe pain'], standardDosage: '50–100mg', standardFrequency: 'Every 4–6 hours', requiresPrescription: true, controlledSubstance: true },
  { name: 'Meloxicam 7.5mg', genericName: 'Meloxicam', brandNames: ['Mobic', 'Movalis'], form: 'tablet', strength: '7.5mg', unit: 'mg', route: 'oral', category: 'NSAID', indications: ['Arthritis', 'Pain'], standardDosage: '7.5–15mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Mefenamic Acid 500mg', genericName: 'Mefenamic Acid', brandNames: ['Ponstan', 'Feminax'], form: 'capsule', strength: '500mg', unit: 'mg', route: 'oral', category: 'NSAID', indications: ['Pain', 'Dysmenorrhea'], standardDosage: '500mg', standardFrequency: 'TID', requiresPrescription: true },

  // ── NSAIDs ────────────────────────────────────────────────────────────────
  { name: 'Ibuprofen 200mg', genericName: 'Ibuprofen', brandNames: ['Advil', 'Nurofen', 'Brufen'], form: 'tablet', strength: '200mg', unit: 'mg', route: 'oral', category: 'NSAID', indications: ['Pain', 'Inflammation', 'Fever'], standardDosage: '200–400mg', standardFrequency: 'Every 4–6 hours', requiresPrescription: false },
  { name: 'Ibuprofen 400mg', genericName: 'Ibuprofen', brandNames: ['Brufen 400'], form: 'tablet', strength: '400mg', unit: 'mg', route: 'oral', category: 'NSAID', indications: ['Pain', 'Inflammation'], standardDosage: '400mg', standardFrequency: 'TID', requiresPrescription: true },
  { name: 'Celecoxib 200mg', genericName: 'Celecoxib', brandNames: ['Celebrex'], form: 'capsule', strength: '200mg', unit: 'mg', route: 'oral', category: 'COX-2 Inhibitor', indications: ['Arthritis', 'Pain'], standardDosage: '200mg', standardFrequency: 'Once or twice daily', requiresPrescription: true },
  { name: 'Diclofenac 50mg', genericName: 'Diclofenac Sodium', brandNames: ['Voltaren', 'Cataflam'], form: 'tablet', strength: '50mg', unit: 'mg', route: 'oral', category: 'NSAID', indications: ['Pain', 'Inflammation'], standardDosage: '50mg', standardFrequency: 'TID', requiresPrescription: true },
  { name: 'Naproxen 500mg', genericName: 'Naproxen', brandNames: ['Naprosyn', 'Aleve'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'NSAID', indications: ['Pain', 'Inflammation', 'Fever'], standardDosage: '500mg', standardFrequency: 'BID', requiresPrescription: true },

  // ── Antibiotics ───────────────────────────────────────────────────────────
  { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', brandNames: ['Amoxil', 'Trimox'], form: 'capsule', strength: '500mg', unit: 'mg', route: 'oral', category: 'Antibiotic', indications: ['Bacterial infections', 'Respiratory tract infections', 'UTI'], standardDosage: '500mg', standardFrequency: 'TID', duration: '7 days', requiresPrescription: true },
  { name: 'Amoxicillin-Clavulanate 625mg', genericName: 'Co-amoxiclav', brandNames: ['Augmentin', 'Clavamox'], form: 'tablet', strength: '625mg', unit: 'mg', route: 'oral', category: 'Antibiotic', indications: ['Complicated infections', 'Sinusitis', 'Pneumonia'], standardDosage: '625mg', standardFrequency: 'BID', duration: '7–10 days', requiresPrescription: true },
  { name: 'Azithromycin 500mg', genericName: 'Azithromycin', brandNames: ['Zithromax', 'Azee'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'Antibiotic', indications: ['Respiratory infections', 'STI', 'Skin infections'], standardDosage: '500mg', standardFrequency: 'Once daily', duration: '3–5 days', requiresPrescription: true },
  { name: 'Ciprofloxacin 500mg', genericName: 'Ciprofloxacin HCl', brandNames: ['Ciprobay', 'Cipro'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'Antibiotic', indications: ['UTI', 'Respiratory infections', 'GI infections'], standardDosage: '500mg', standardFrequency: 'BID', duration: '7–14 days', requiresPrescription: true },
  { name: 'Doxycycline 100mg', genericName: 'Doxycycline Hyclate', brandNames: ['Vibramycin', 'Doryx'], form: 'capsule', strength: '100mg', unit: 'mg', route: 'oral', category: 'Antibiotic', indications: ['Respiratory infections', 'STI', 'Lyme disease', 'Acne'], standardDosage: '100mg', standardFrequency: 'BID', duration: '7–14 days', requiresPrescription: true },
  { name: 'Cetirizine HCl 10mg / Cloxacillin 500mg', genericName: 'Cloxacillin Sodium', brandNames: ['Orbenin'], form: 'capsule', strength: '500mg', unit: 'mg', route: 'oral', category: 'Antibiotic', indications: ['Staphylococcal infections', 'Skin infections'], standardDosage: '500mg', standardFrequency: 'QID', duration: '7 days', requiresPrescription: true },
  { name: 'Cloxacillin 500mg', genericName: 'Cloxacillin Sodium', brandNames: ['Orbenin', 'Tegopen'], form: 'capsule', strength: '500mg', unit: 'mg', route: 'oral', category: 'Antibiotic', indications: ['Staphylococcal infections'], standardDosage: '500mg', standardFrequency: 'QID', requiresPrescription: true },
  { name: 'Metronidazole 500mg', genericName: 'Metronidazole', brandNames: ['Flagyl', 'Metrogyl'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'Antibiotic', indications: ['Anaerobic infections', 'H. pylori', 'Bacterial vaginosis', 'Protozoal infections'], standardDosage: '500mg', standardFrequency: 'TID', duration: '7 days', requiresPrescription: true },
  { name: 'Cephalexin 500mg', genericName: 'Cephalexin', brandNames: ['Keflex', 'Ceporex'], form: 'capsule', strength: '500mg', unit: 'mg', route: 'oral', category: 'Antibiotic', indications: ['Skin infections', 'UTI', 'Respiratory infections'], standardDosage: '500mg', standardFrequency: 'QID', duration: '7–10 days', requiresPrescription: true },
  { name: 'Cotrimoxazole 960mg', genericName: 'Sulfamethoxazole + Trimethoprim', brandNames: ['Bactrim', 'Septra'], form: 'tablet', strength: '960mg', unit: 'mg', route: 'oral', category: 'Antibiotic', indications: ['UTI', 'PCP prophylaxis', 'Respiratory infections'], standardDosage: '960mg', standardFrequency: 'BID', duration: '7–14 days', requiresPrescription: true },
  { name: 'Clarithromycin 500mg', genericName: 'Clarithromycin', brandNames: ['Klacid', 'Biaxin'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'Antibiotic', indications: ['Respiratory infections', 'H. pylori', 'MAC'], standardDosage: '500mg', standardFrequency: 'BID', duration: '7–14 days', requiresPrescription: true },
  { name: 'Levofloxacin 500mg', genericName: 'Levofloxacin', brandNames: ['Levaquin', 'Tavanic'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'Antibiotic', indications: ['Pneumonia', 'UTI', 'Sinusitis'], standardDosage: '500mg', standardFrequency: 'Once daily', duration: '7–10 days', requiresPrescription: true },

  // ── Antihypertensives ─────────────────────────────────────────────────────
  { name: 'Amlodipine 5mg', genericName: 'Amlodipine Besylate', brandNames: ['Norvasc', 'Amvaz'], form: 'tablet', strength: '5mg', unit: 'mg', route: 'oral', category: 'Antihypertensive', indications: ['Hypertension', 'Angina'], standardDosage: '5–10mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Amlodipine 10mg', genericName: 'Amlodipine Besylate', brandNames: ['Norvasc 10mg'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'Antihypertensive', indications: ['Hypertension', 'Angina'], standardDosage: '10mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Losartan 50mg', genericName: 'Losartan Potassium', brandNames: ['Cozaar', 'Losacar'], form: 'tablet', strength: '50mg', unit: 'mg', route: 'oral', category: 'Antihypertensive', indications: ['Hypertension', 'Diabetic nephropathy'], standardDosage: '50–100mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Enalapril 10mg', genericName: 'Enalapril Maleate', brandNames: ['Vasotec', 'Renitec'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'ACE Inhibitor', indications: ['Hypertension', 'Heart failure'], standardDosage: '10–20mg', standardFrequency: 'Once or twice daily', requiresPrescription: true },
  { name: 'Captopril 25mg', genericName: 'Captopril', brandNames: ['Capoten'], form: 'tablet', strength: '25mg', unit: 'mg', route: 'oral', category: 'ACE Inhibitor', indications: ['Hypertension', 'Heart failure', 'Post-MI'], standardDosage: '25–50mg', standardFrequency: 'TID', requiresPrescription: true },
  { name: 'Metoprolol 50mg', genericName: 'Metoprolol Tartrate', brandNames: ['Lopressor', 'Betaloc'], form: 'tablet', strength: '50mg', unit: 'mg', route: 'oral', category: 'Beta-blocker', indications: ['Hypertension', 'Angina', 'Heart failure'], standardDosage: '50–100mg', standardFrequency: 'BID', requiresPrescription: true },
  { name: 'Atenolol 50mg', genericName: 'Atenolol', brandNames: ['Tenormin', 'Atenol'], form: 'tablet', strength: '50mg', unit: 'mg', route: 'oral', category: 'Beta-blocker', indications: ['Hypertension', 'Angina'], standardDosage: '50–100mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Valsartan 80mg', genericName: 'Valsartan', brandNames: ['Diovan', 'Valtan'], form: 'tablet', strength: '80mg', unit: 'mg', route: 'oral', category: 'ARB Antihypertensive', indications: ['Hypertension', 'Heart failure'], standardDosage: '80–160mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Hydrochlorothiazide 25mg', genericName: 'Hydrochlorothiazide', brandNames: ['HydroDIURIL', 'HCTZ'], form: 'tablet', strength: '25mg', unit: 'mg', route: 'oral', category: 'Diuretic', indications: ['Hypertension', 'Edema'], standardDosage: '12.5–25mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Furosemide 40mg', genericName: 'Furosemide', brandNames: ['Lasix', 'Salix'], form: 'tablet', strength: '40mg', unit: 'mg', route: 'oral', category: 'Loop Diuretic', indications: ['Edema', 'Hypertension', 'Heart failure'], standardDosage: '20–80mg', standardFrequency: 'Once or twice daily', requiresPrescription: true },
  { name: 'Spironolactone 25mg', genericName: 'Spironolactone', brandNames: ['Aldactone'], form: 'tablet', strength: '25mg', unit: 'mg', route: 'oral', category: 'Potassium-sparing Diuretic', indications: ['Heart failure', 'Hypertension', 'Hyperaldosteronism'], standardDosage: '25–50mg', standardFrequency: 'Once daily', requiresPrescription: true },

  // ── Antidiabetics ─────────────────────────────────────────────────────────
  { name: 'Metformin 500mg', genericName: 'Metformin HCl', brandNames: ['Glucophage', 'Glumetza'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'Antidiabetic', indications: ['Type 2 Diabetes', 'PCOS'], standardDosage: '500–1000mg', standardFrequency: 'BID', requiresPrescription: true },
  { name: 'Metformin 850mg', genericName: 'Metformin HCl', brandNames: ['Glucophage 850'], form: 'tablet', strength: '850mg', unit: 'mg', route: 'oral', category: 'Antidiabetic', indications: ['Type 2 Diabetes'], standardDosage: '850mg', standardFrequency: 'TID', requiresPrescription: true },
  { name: 'Glimepiride 2mg', genericName: 'Glimepiride', brandNames: ['Amaryl', 'Glimpid'], form: 'tablet', strength: '2mg', unit: 'mg', route: 'oral', category: 'Antidiabetic', indications: ['Type 2 Diabetes'], standardDosage: '1–4mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Gliclazide 80mg', genericName: 'Gliclazide', brandNames: ['Diamicron', 'Glizid'], form: 'tablet', strength: '80mg', unit: 'mg', route: 'oral', category: 'Antidiabetic', indications: ['Type 2 Diabetes'], standardDosage: '80–160mg', standardFrequency: 'BID', requiresPrescription: true },
  { name: 'Sitagliptin 100mg', genericName: 'Sitagliptin Phosphate', brandNames: ['Januvia'], form: 'tablet', strength: '100mg', unit: 'mg', route: 'oral', category: 'DPP-4 Inhibitor', indications: ['Type 2 Diabetes'], standardDosage: '100mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Empagliflozin 10mg', genericName: 'Empagliflozin', brandNames: ['Jardiance'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'SGLT2 Inhibitor', indications: ['Type 2 Diabetes', 'Heart failure', 'CKD'], standardDosage: '10–25mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Insulin Regular 100IU/ml', genericName: 'Insulin Human', brandNames: ['Humulin R', 'Actrapid'], form: 'injection', strength: '100IU/ml', unit: 'IU', route: 'im', category: 'Insulin', indications: ['Type 1 Diabetes', 'Type 2 Diabetes'], standardDosage: 'As directed', standardFrequency: 'Before meals', requiresPrescription: true },
  { name: 'Insulin Glargine 100IU/ml', genericName: 'Insulin Glargine', brandNames: ['Lantus', 'Toujeo'], form: 'injection', strength: '100IU/ml', unit: 'IU', route: 'im', category: 'Long-acting Insulin', indications: ['Type 1 and 2 Diabetes'], standardDosage: 'As directed', standardFrequency: 'Once daily at bedtime', requiresPrescription: true },

  // ── Lipid-lowering ────────────────────────────────────────────────────────
  { name: 'Atorvastatin 20mg', genericName: 'Atorvastatin Calcium', brandNames: ['Lipitor', 'Atorva'], form: 'tablet', strength: '20mg', unit: 'mg', route: 'oral', category: 'Statin', indications: ['Hyperlipidemia', 'Cardiovascular risk reduction'], standardDosage: '10–40mg', standardFrequency: 'Once daily at bedtime', requiresPrescription: true },
  { name: 'Atorvastatin 40mg', genericName: 'Atorvastatin Calcium', brandNames: ['Lipitor 40'], form: 'tablet', strength: '40mg', unit: 'mg', route: 'oral', category: 'Statin', indications: ['Hyperlipidemia', 'Cardiovascular risk reduction'], standardDosage: '40–80mg', standardFrequency: 'Once daily at bedtime', requiresPrescription: true },
  { name: 'Simvastatin 20mg', genericName: 'Simvastatin', brandNames: ['Zocor', 'Simcard'], form: 'tablet', strength: '20mg', unit: 'mg', route: 'oral', category: 'Statin', indications: ['Hyperlipidemia', 'Cardiovascular risk reduction'], standardDosage: '20–40mg', standardFrequency: 'Once daily at bedtime', requiresPrescription: true },
  { name: 'Rosuvastatin 10mg', genericName: 'Rosuvastatin Calcium', brandNames: ['Crestor', 'Rosuvas'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'Statin', indications: ['Hyperlipidemia'], standardDosage: '5–20mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Fenofibrate 145mg', genericName: 'Fenofibrate', brandNames: ['Tricor', 'Lipofen'], form: 'tablet', strength: '145mg', unit: 'mg', route: 'oral', category: 'Fibrate', indications: ['Hypertriglyceridemia'], standardDosage: '145mg', standardFrequency: 'Once daily', requiresPrescription: true },

  // ── GI / PPI / H2 Blockers ────────────────────────────────────────────────
  { name: 'Omeprazole 20mg', genericName: 'Omeprazole', brandNames: ['Losec', 'Prilosec'], form: 'capsule', strength: '20mg', unit: 'mg', route: 'oral', category: 'Proton Pump Inhibitor', indications: ['GERD', 'Peptic ulcer', 'H. pylori eradication'], standardDosage: '20–40mg', standardFrequency: 'Once daily before breakfast', duration: '4–8 weeks', requiresPrescription: true },
  { name: 'Pantoprazole 40mg', genericName: 'Pantoprazole Sodium', brandNames: ['Protonix', 'Pantoloc'], form: 'tablet', strength: '40mg', unit: 'mg', route: 'oral', category: 'Proton Pump Inhibitor', indications: ['GERD', 'Peptic ulcer'], standardDosage: '40mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Esomeprazole 40mg', genericName: 'Esomeprazole Magnesium', brandNames: ['Nexium'], form: 'capsule', strength: '40mg', unit: 'mg', route: 'oral', category: 'Proton Pump Inhibitor', indications: ['GERD', 'Erosive esophagitis'], standardDosage: '20–40mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Lansoprazole 30mg', genericName: 'Lansoprazole', brandNames: ['Prevacid', 'Zoton'], form: 'capsule', strength: '30mg', unit: 'mg', route: 'oral', category: 'Proton Pump Inhibitor', indications: ['GERD', 'Peptic ulcer'], standardDosage: '15–30mg', standardFrequency: 'Once daily before breakfast', requiresPrescription: true },
  { name: 'Ranitidine 150mg', genericName: 'Ranitidine HCl', brandNames: ['Zantac', 'Ranit'], form: 'tablet', strength: '150mg', unit: 'mg', route: 'oral', category: 'H2 Blocker', indications: ['GERD', 'Peptic ulcer'], standardDosage: '150mg', standardFrequency: 'BID', requiresPrescription: false },
  { name: 'Aluminum Hydroxide + Magnesium Hydroxide', genericName: 'Antacid', brandNames: ['Maalox', 'Mylanta'], form: 'syrup', strength: '200mg/5ml+200mg/5ml', unit: 'ml', route: 'oral', category: 'Antacid', indications: ['Heartburn', 'Indigestion', 'GERD'], standardDosage: '10–20ml', standardFrequency: 'After meals and at bedtime', requiresPrescription: false },
  { name: 'Domperidone 10mg', genericName: 'Domperidone', brandNames: ['Motilium', 'Motinorm'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'Prokinetic', indications: ['Nausea', 'Vomiting', 'Gastroparesis'], standardDosage: '10mg', standardFrequency: 'TID before meals', requiresPrescription: true },
  { name: 'Metoclopramide 10mg', genericName: 'Metoclopramide HCl', brandNames: ['Reglan', 'Maxolon'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'Antiemetic', indications: ['Nausea', 'Vomiting', 'GERD'], standardDosage: '10mg', standardFrequency: 'TID', requiresPrescription: true },
  { name: 'Ondansetron 8mg', genericName: 'Ondansetron HCl', brandNames: ['Zofran', 'Ondaz'], form: 'tablet', strength: '8mg', unit: 'mg', route: 'oral', category: 'Antiemetic', indications: ['Nausea', 'Vomiting', 'Chemotherapy-induced nausea'], standardDosage: '8mg', standardFrequency: 'BID–TID', requiresPrescription: true },
  { name: 'Loperamide 2mg', genericName: 'Loperamide HCl', brandNames: ['Imodium', 'Diatabs'], form: 'capsule', strength: '2mg', unit: 'mg', route: 'oral', category: 'Antidiarrheal', indications: ['Acute diarrhea', 'Chronic diarrhea'], standardDosage: '4mg initially then 2mg', standardFrequency: 'After loose stool', requiresPrescription: false },

  // ── Antihistamines / Allergy ──────────────────────────────────────────────
  { name: 'Cetirizine 10mg', genericName: 'Cetirizine HCl', brandNames: ['Zyrtec', 'Zirtec'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'Antihistamine', indications: ['Allergic rhinitis', 'Urticaria', 'Allergies'], standardDosage: '10mg', standardFrequency: 'Once daily', requiresPrescription: false },
  { name: 'Loratadine 10mg', genericName: 'Loratadine', brandNames: ['Claritin', 'Alavert'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'Antihistamine', indications: ['Allergic rhinitis', 'Urticaria'], standardDosage: '10mg', standardFrequency: 'Once daily', requiresPrescription: false },
  { name: 'Fexofenadine 180mg', genericName: 'Fexofenadine HCl', brandNames: ['Allegra', 'Telfast'], form: 'tablet', strength: '180mg', unit: 'mg', route: 'oral', category: 'Antihistamine', indications: ['Allergic rhinitis', 'Urticaria'], standardDosage: '180mg', standardFrequency: 'Once daily', requiresPrescription: false },
  { name: 'Diphenhydramine 25mg', genericName: 'Diphenhydramine HCl', brandNames: ['Benadryl', 'Dermamycin'], form: 'capsule', strength: '25mg', unit: 'mg', route: 'oral', category: 'Antihistamine', indications: ['Allergies', 'Insomnia', 'Nausea'], standardDosage: '25–50mg', standardFrequency: 'Every 4–6 hours', requiresPrescription: false },
  { name: 'Montelukast 10mg', genericName: 'Montelukast Sodium', brandNames: ['Singulair', 'Montair'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'Leukotriene Inhibitor', indications: ['Asthma', 'Allergic rhinitis'], standardDosage: '10mg', standardFrequency: 'Once daily at bedtime', requiresPrescription: true },

  // ── Respiratory / Bronchodilators ─────────────────────────────────────────
  { name: 'Salbutamol 100mcg Inhaler', genericName: 'Albuterol Sulfate', brandNames: ['Ventolin', 'ProAir'], form: 'inhaler', strength: '100mcg', unit: 'mcg', route: 'inhalation', category: 'Bronchodilator', indications: ['Asthma', 'COPD', 'Bronchospasm'], standardDosage: '100–200mcg', standardFrequency: 'As needed (PRN)', requiresPrescription: true },
  { name: 'Salbutamol 2mg', genericName: 'Albuterol Sulfate', brandNames: ['Ventolin tablets'], form: 'tablet', strength: '2mg', unit: 'mg', route: 'oral', category: 'Bronchodilator', indications: ['Asthma', 'Bronchospasm'], standardDosage: '2–4mg', standardFrequency: 'TID', requiresPrescription: true },
  { name: 'Budesonide 200mcg Inhaler', genericName: 'Budesonide', brandNames: ['Pulmicort', 'Rhinocort'], form: 'inhaler', strength: '200mcg', unit: 'mcg', route: 'inhalation', category: 'Inhaled Corticosteroid', indications: ['Asthma', 'COPD'], standardDosage: '200–400mcg', standardFrequency: 'BID', requiresPrescription: true },
  { name: 'Fluticasone+Salmeterol 125/25mcg Inhaler', genericName: 'Fluticasone+Salmeterol', brandNames: ['Seretide', 'Advair'], form: 'inhaler', strength: '125/25mcg', unit: 'mcg', route: 'inhalation', category: 'Combination Inhaler', indications: ['Asthma', 'COPD'], standardDosage: '2 puffs', standardFrequency: 'BID', requiresPrescription: true },
  { name: 'Theophylline 200mg', genericName: 'Theophylline', brandNames: ['Theo-Dur', 'Uniphyl'], form: 'tablet', strength: '200mg', unit: 'mg', route: 'oral', category: 'Bronchodilator', indications: ['Asthma', 'COPD'], standardDosage: '200–400mg', standardFrequency: 'BID', requiresPrescription: true },
  { name: 'Ambroxol 30mg', genericName: 'Ambroxol HCl', brandNames: ['Mucosolvan', 'Lasolvan'], form: 'tablet', strength: '30mg', unit: 'mg', route: 'oral', category: 'Mucolytic', indications: ['Cough with mucus', 'Respiratory disorders'], standardDosage: '30mg', standardFrequency: 'TID', requiresPrescription: false },

  // ── Corticosteroids ───────────────────────────────────────────────────────
  { name: 'Prednisone 20mg', genericName: 'Prednisone', brandNames: ['Deltasone', 'Predone'], form: 'tablet', strength: '20mg', unit: 'mg', route: 'oral', category: 'Corticosteroid', indications: ['Inflammation', 'Autoimmune conditions', 'Asthma exacerbation'], standardDosage: '5–60mg', standardFrequency: 'Once daily in the morning', requiresPrescription: true },
  { name: 'Prednisone 5mg', genericName: 'Prednisone', brandNames: ['Deltasone 5mg'], form: 'tablet', strength: '5mg', unit: 'mg', route: 'oral', category: 'Corticosteroid', indications: ['Inflammation', 'Autoimmune conditions'], standardDosage: '5–60mg', standardFrequency: 'Once daily in the morning', requiresPrescription: true },
  { name: 'Methylprednisolone 4mg', genericName: 'Methylprednisolone', brandNames: ['Medrol', 'Solu-Medrol'], form: 'tablet', strength: '4mg', unit: 'mg', route: 'oral', category: 'Corticosteroid', indications: ['Inflammation', 'Allergic reactions'], standardDosage: '4–48mg', standardFrequency: 'Once daily in the morning', requiresPrescription: true },
  { name: 'Dexamethasone 0.5mg', genericName: 'Dexamethasone', brandNames: ['Decadron', 'Dexasone'], form: 'tablet', strength: '0.5mg', unit: 'mg', route: 'oral', category: 'Corticosteroid', indications: ['Inflammation', 'Edema', 'Allergic reactions'], standardDosage: '0.5–9mg', standardFrequency: 'BID–QID', requiresPrescription: true },

  // ── Thyroid ───────────────────────────────────────────────────────────────
  { name: 'Levothyroxine 50mcg', genericName: 'Levothyroxine Sodium', brandNames: ['Synthroid', 'Euthyrox'], form: 'tablet', strength: '50mcg', unit: 'mcg', route: 'oral', category: 'Thyroid Hormone', indications: ['Hypothyroidism'], standardDosage: '25–200mcg', standardFrequency: 'Once daily on empty stomach', requiresPrescription: true },
  { name: 'Levothyroxine 100mcg', genericName: 'Levothyroxine Sodium', brandNames: ['Synthroid 100', 'Euthyrox 100'], form: 'tablet', strength: '100mcg', unit: 'mcg', route: 'oral', category: 'Thyroid Hormone', indications: ['Hypothyroidism'], standardDosage: '100mcg', standardFrequency: 'Once daily on empty stomach', requiresPrescription: true },
  { name: 'Methimazole 10mg', genericName: 'Methimazole', brandNames: ['Tapazole', 'Northyx'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'Antithyroid', indications: ['Hyperthyroidism', 'Graves disease'], standardDosage: '5–30mg', standardFrequency: 'TID', requiresPrescription: true },

  // ── Cardiovascular ────────────────────────────────────────────────────────
  { name: 'Aspirin 80mg', genericName: 'Acetylsalicylic Acid', brandNames: ['Aspirin Cardio', 'Cartia'], form: 'tablet', strength: '80mg', unit: 'mg', route: 'oral', category: 'Antiplatelet', indications: ['CAD prophylaxis', 'Post-MI', 'Stroke prevention'], standardDosage: '75–100mg', standardFrequency: 'Once daily', requiresPrescription: false },
  { name: 'Aspirin 325mg', genericName: 'Acetylsalicylic Acid', brandNames: ['Aspirin'], form: 'tablet', strength: '325mg', unit: 'mg', route: 'oral', category: 'Antiplatelet / Analgesic', indications: ['Pain', 'Fever', 'Antiplatelet therapy'], standardDosage: '325–650mg', standardFrequency: 'Every 4–6 hours', requiresPrescription: false },
  { name: 'Clopidogrel 75mg', genericName: 'Clopidogrel Bisulfate', brandNames: ['Plavix', 'Clopicard'], form: 'tablet', strength: '75mg', unit: 'mg', route: 'oral', category: 'Antiplatelet', indications: ['ACS', 'Post-stent', 'Stroke prevention'], standardDosage: '75mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Digoxin 0.25mg', genericName: 'Digoxin', brandNames: ['Lanoxin', 'Digacin'], form: 'tablet', strength: '0.25mg', unit: 'mg', route: 'oral', category: 'Cardiac Glycoside', indications: ['Atrial fibrillation', 'Heart failure'], standardDosage: '0.125–0.25mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Warfarin 5mg', genericName: 'Warfarin Sodium', brandNames: ['Coumadin', 'Marevan'], form: 'tablet', strength: '5mg', unit: 'mg', route: 'oral', category: 'Anticoagulant', indications: ['DVT', 'Atrial fibrillation', 'Stroke prevention'], standardDosage: 'As per INR', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Isosorbide Mononitrate 20mg', genericName: 'Isosorbide Mononitrate', brandNames: ['Imdur', 'Ismo'], form: 'tablet', strength: '20mg', unit: 'mg', route: 'oral', category: 'Nitrate', indications: ['Angina prophylaxis'], standardDosage: '20–40mg', standardFrequency: 'BID (7am & 1pm)', requiresPrescription: true },
  { name: 'Nitroglycerin 0.5mg Sublingual', genericName: 'Glyceryl Trinitrate', brandNames: ['Nitrostat', 'GTN'], form: 'tablet', strength: '0.5mg', unit: 'mg', route: 'oral', category: 'Nitrate', indications: ['Acute angina'], standardDosage: '0.3–0.6mg', standardFrequency: 'PRN, every 5 min x3', requiresPrescription: true },

  // ── Antidepressants / Mental Health ──────────────────────────────────────
  { name: 'Sertraline 50mg', genericName: 'Sertraline HCl', brandNames: ['Zoloft', 'Lustral'], form: 'tablet', strength: '50mg', unit: 'mg', route: 'oral', category: 'SSRI Antidepressant', indications: ['Depression', 'Anxiety', 'OCD', 'PTSD'], standardDosage: '50–200mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Fluoxetine 20mg', genericName: 'Fluoxetine HCl', brandNames: ['Prozac', 'Sarafem'], form: 'capsule', strength: '20mg', unit: 'mg', route: 'oral', category: 'SSRI Antidepressant', indications: ['Depression', 'OCD', 'Bulimia'], standardDosage: '20–60mg', standardFrequency: 'Once daily in the morning', requiresPrescription: true },
  { name: 'Escitalopram 10mg', genericName: 'Escitalopram Oxalate', brandNames: ['Lexapro', 'Cipralex'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'SSRI Antidepressant', indications: ['Depression', 'Generalized anxiety'], standardDosage: '10–20mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Amitriptyline 25mg', genericName: 'Amitriptyline HCl', brandNames: ['Elavil', 'Tryptanol'], form: 'tablet', strength: '25mg', unit: 'mg', route: 'oral', category: 'Tricyclic Antidepressant', indications: ['Depression', 'Neuropathic pain', 'Migraine prophylaxis'], standardDosage: '25–150mg', standardFrequency: 'Once daily at bedtime', requiresPrescription: true },
  { name: 'Clonazepam 0.5mg', genericName: 'Clonazepam', brandNames: ['Klonopin', 'Rivotril'], form: 'tablet', strength: '0.5mg', unit: 'mg', route: 'oral', category: 'Benzodiazepine', indications: ['Anxiety', 'Panic disorder', 'Seizures'], standardDosage: '0.25–2mg', standardFrequency: 'BID–TID', requiresPrescription: true, controlledSubstance: true },
  { name: 'Diazepam 5mg', genericName: 'Diazepam', brandNames: ['Valium', 'Diastat'], form: 'tablet', strength: '5mg', unit: 'mg', route: 'oral', category: 'Benzodiazepine', indications: ['Anxiety', 'Muscle spasm', 'Seizures'], standardDosage: '2–10mg', standardFrequency: 'BID–QID', requiresPrescription: true, controlledSubstance: true },
  { name: 'Quetiapine 25mg', genericName: 'Quetiapine Fumarate', brandNames: ['Seroquel'], form: 'tablet', strength: '25mg', unit: 'mg', route: 'oral', category: 'Antipsychotic', indications: ['Schizophrenia', 'Bipolar disorder'], standardDosage: '25–800mg', standardFrequency: 'BID', requiresPrescription: true },

  // ── Antifungals ───────────────────────────────────────────────────────────
  { name: 'Fluconazole 150mg', genericName: 'Fluconazole', brandNames: ['Diflucan', 'Flucand'], form: 'capsule', strength: '150mg', unit: 'mg', route: 'oral', category: 'Antifungal', indications: ['Vaginal candidiasis', 'Oropharyngeal candidiasis', 'Cryptococcal meningitis'], standardDosage: '150mg single dose', standardFrequency: 'Single dose', requiresPrescription: true },
  { name: 'Clotrimazole Cream 1%', genericName: 'Clotrimazole', brandNames: ['Canesten', 'Lotrimin'], form: 'cream', strength: '1%', unit: '%', route: 'topical', category: 'Antifungal', indications: ['Tinea infections', 'Candidiasis', 'Ringworm'], standardDosage: 'Apply thinly', standardFrequency: 'BID–TID', duration: '2–4 weeks', requiresPrescription: false },
  { name: 'Itroconazole 100mg', genericName: 'Itraconazole', brandNames: ['Sporanox', 'Itracap'], form: 'capsule', strength: '100mg', unit: 'mg', route: 'oral', category: 'Antifungal', indications: ['Systemic fungal infections', 'Onychomycosis'], standardDosage: '100–200mg', standardFrequency: 'Once or twice daily', requiresPrescription: true },

  // ── Antivirals ────────────────────────────────────────────────────────────
  { name: 'Acyclovir 400mg', genericName: 'Acyclovir', brandNames: ['Zovirax', 'Acivir'], form: 'tablet', strength: '400mg', unit: 'mg', route: 'oral', category: 'Antiviral', indications: ['Herpes simplex', 'Herpes zoster', 'Genital herpes'], standardDosage: '400mg', standardFrequency: 'TID–5x daily', duration: '7–10 days', requiresPrescription: true },
  { name: 'Oseltamivir 75mg', genericName: 'Oseltamivir Phosphate', brandNames: ['Tamiflu'], form: 'capsule', strength: '75mg', unit: 'mg', route: 'oral', category: 'Antiviral', indications: ['Influenza treatment and prophylaxis'], standardDosage: '75mg', standardFrequency: 'BID', duration: '5 days', requiresPrescription: true },
  { name: 'Valacyclovir 500mg', genericName: 'Valacyclovir HCl', brandNames: ['Valtrex', 'Valztrex'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'Antiviral', indications: ['HSV', 'Shingles', 'Cold sores'], standardDosage: '500–1000mg', standardFrequency: 'BID', duration: '5–10 days', requiresPrescription: true },

  // ── Antimalarials / Antiparasitics ────────────────────────────────────────
  { name: 'Chloroquine 250mg', genericName: 'Chloroquine Phosphate', brandNames: ['Aralen', 'Chloromag'], form: 'tablet', strength: '250mg', unit: 'mg', route: 'oral', category: 'Antimalarial', indications: ['Malaria prophylaxis and treatment', 'Autoimmune diseases'], standardDosage: '250–500mg', standardFrequency: 'Once weekly (prophylaxis)', requiresPrescription: true },
  { name: 'Metronidazole 250mg', genericName: 'Metronidazole', brandNames: ['Flagyl 250'], form: 'tablet', strength: '250mg', unit: 'mg', route: 'oral', category: 'Antiparasitic', indications: ['Amoebiasis', 'Giardiasis', 'Trichomoniasis'], standardDosage: '250–750mg', standardFrequency: 'TID', duration: '5–10 days', requiresPrescription: true },
  { name: 'Albendazole 400mg', genericName: 'Albendazole', brandNames: ['Zentel', 'Albenza'], form: 'tablet', strength: '400mg', unit: 'mg', route: 'oral', category: 'Anthelmintic', indications: ['Intestinal worm infections', 'Ascariasis', 'Pinworms'], standardDosage: '400mg', standardFrequency: 'Single dose', requiresPrescription: false },
  { name: 'Mebendazole 500mg', genericName: 'Mebendazole', brandNames: ['Vermox', 'Mebex'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'Anthelmintic', indications: ['Intestinal worm infections'], standardDosage: '100–500mg', standardFrequency: 'Single dose or BID x3 days', requiresPrescription: false },

  // ── Vitamins / Supplements ────────────────────────────────────────────────
  { name: 'Vitamin C 500mg', genericName: 'Ascorbic Acid', brandNames: ['Cecon', 'Ce-Vi-Sol'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'Vitamin', indications: ['Vitamin C deficiency', 'Immune support'], standardDosage: '500–1000mg', standardFrequency: 'Once daily', requiresPrescription: false },
  { name: 'Vitamin D3 1000IU', genericName: 'Cholecalciferol', brandNames: ['D-Cal', 'Decavi', 'D-Drops'], form: 'tablet', strength: '1000IU', unit: 'IU', route: 'oral', category: 'Vitamin', indications: ['Vitamin D deficiency', 'Bone health'], standardDosage: '1000–2000IU', standardFrequency: 'Once daily', requiresPrescription: false },
  { name: 'Vitamin B Complex', genericName: 'B1+B6+B12', brandNames: ['Neurobion', 'Becozyme'], form: 'tablet', strength: '100mg/5mg/50mcg', unit: 'mg', route: 'oral', category: 'Vitamin', indications: ['B vitamin deficiency', 'Neuropathy'], standardDosage: '1 tablet', standardFrequency: 'Once daily', requiresPrescription: false },
  { name: 'Ferrous Sulfate 325mg', genericName: 'Iron (Ferrous Sulfate)', brandNames: ['Feosol', 'Ferro-Sulfate'], form: 'tablet', strength: '325mg', unit: 'mg', route: 'oral', category: 'Mineral Supplement', indications: ['Iron deficiency anemia'], standardDosage: '1–3 tablets', standardFrequency: 'Once or twice daily', requiresPrescription: false },
  { name: 'Calcium Carbonate 500mg', genericName: 'Calcium Carbonate', brandNames: ['Tums', 'Caltrate', 'Os-Cal'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'Mineral Supplement', indications: ['Calcium deficiency', 'Osteoporosis', 'Antacid'], standardDosage: '500–1000mg', standardFrequency: 'BID', requiresPrescription: false },
  { name: 'Folic Acid 5mg', genericName: 'Folic Acid', brandNames: ['Folvite', 'Folacin'], form: 'tablet', strength: '5mg', unit: 'mg', route: 'oral', category: 'Vitamin', indications: ['Neural tube defect prevention', 'Anemia', 'Megaloblastic anemia'], standardDosage: '0.4–5mg', standardFrequency: 'Once daily', requiresPrescription: false },
  { name: 'Zinc Sulfate 220mg', genericName: 'Zinc Sulfate', brandNames: ['Zincap', 'Zincovit'], form: 'capsule', strength: '220mg', unit: 'mg', route: 'oral', category: 'Mineral Supplement', indications: ['Zinc deficiency', 'Wound healing', 'Immune support'], standardDosage: '220mg', standardFrequency: 'Once daily', requiresPrescription: false },

  // ── Ophthalmics ───────────────────────────────────────────────────────────
  { name: 'Timolol 0.5% Eye Drops', genericName: 'Timolol Maleate', brandNames: ['Timoptic', 'Betimol'], form: 'drops', strength: '0.5%', unit: '%', route: 'ophthalmic', category: 'Beta-blocker (ophthalmic)', indications: ['Glaucoma', 'Ocular hypertension'], standardDosage: '1 drop', standardFrequency: 'BID', requiresPrescription: true },
  { name: 'Ciprofloxacin 0.3% Eye Drops', genericName: 'Ciprofloxacin HCl', brandNames: ['Ciloxan', 'Ciprolate'], form: 'drops', strength: '0.3%', unit: '%', route: 'ophthalmic', category: 'Antibiotic (ophthalmic)', indications: ['Bacterial conjunctivitis', 'Corneal ulcer'], standardDosage: '1–2 drops', standardFrequency: 'Every 2 hours then QID', duration: '7–14 days', requiresPrescription: true },
  { name: 'Artificial Tears Eye Drops', genericName: 'Carboxymethylcellulose', brandNames: ['Refresh Tears', 'Systane'], form: 'drops', strength: '0.5%', unit: '%', route: 'ophthalmic', category: 'Lubricant (ophthalmic)', indications: ['Dry eyes'], standardDosage: '1–2 drops', standardFrequency: 'As needed', requiresPrescription: false },

  // ── Dermatology ───────────────────────────────────────────────────────────
  { name: 'Hydrocortisone Cream 1%', genericName: 'Hydrocortisone', brandNames: ['Cortaid', 'Hytone'], form: 'cream', strength: '1%', unit: '%', route: 'topical', category: 'Topical Corticosteroid', indications: ['Skin inflammation', 'Eczema', 'Dermatitis'], standardDosage: 'Apply thinly', standardFrequency: 'BID–TID', requiresPrescription: false },
  { name: 'Betamethasone Cream 0.1%', genericName: 'Betamethasone Valerate', brandNames: ['Betnovate', 'Valisone'], form: 'cream', strength: '0.1%', unit: '%', route: 'topical', category: 'Topical Corticosteroid', indications: ['Psoriasis', 'Eczema', 'Skin inflammation'], standardDosage: 'Apply thinly', standardFrequency: 'Once or twice daily', requiresPrescription: true },
  { name: 'Mupirocin 2% Ointment', genericName: 'Mupirocin', brandNames: ['Bactroban', 'Centany'], form: 'cream', strength: '2%', unit: '%', route: 'topical', category: 'Topical Antibiotic', indications: ['Impetigo', 'Skin infections'], standardDosage: 'Apply small amount', standardFrequency: 'TID', duration: '10 days', requiresPrescription: true },
  { name: 'Tretinoin 0.025% Cream', genericName: 'Tretinoin', brandNames: ['Retin-A', 'Retacnyl'], form: 'cream', strength: '0.025%', unit: '%', route: 'topical', category: 'Retinoid', indications: ['Acne vulgaris', 'Photoaging'], standardDosage: 'Apply pea-sized amount', standardFrequency: 'Once daily at bedtime', requiresPrescription: true },
  { name: 'Benzoyl Peroxide 5% Gel', genericName: 'Benzoyl Peroxide', brandNames: ['Benzac', 'Clearasil'], form: 'cream', strength: '5%', unit: '%', route: 'topical', category: 'Acne Agent', indications: ['Acne vulgaris'], standardDosage: 'Apply thinly', standardFrequency: 'Once or twice daily', requiresPrescription: false },

  // ── Urology / Reproductive ────────────────────────────────────────────────
  { name: 'Tamsulosin 0.4mg', genericName: 'Tamsulosin HCl', brandNames: ['Flomax', 'Harnal'], form: 'capsule', strength: '0.4mg', unit: 'mg', route: 'oral', category: 'Alpha-blocker', indications: ['BPH', 'Urinary retention'], standardDosage: '0.4mg', standardFrequency: 'Once daily after breakfast', requiresPrescription: true },
  { name: 'Finasteride 5mg', genericName: 'Finasteride', brandNames: ['Proscar', 'Hytrin'], form: 'tablet', strength: '5mg', unit: 'mg', route: 'oral', category: '5-Alpha Reductase Inhibitor', indications: ['BPH', 'Male pattern baldness'], standardDosage: '5mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Oral Contraceptive (Levonorgestrel+EE) 0.15mg/0.03mg', genericName: 'Levonorgestrel+Ethinyl Estradiol', brandNames: ['Microgynon', 'Nordette', 'Lady'], form: 'tablet', strength: '0.15mg/0.03mg', unit: 'mg', route: 'oral', category: 'Oral Contraceptive', indications: ['Contraception', 'Menstrual regulation'], standardDosage: '1 tablet', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Misoprostol 200mcg', genericName: 'Misoprostol', brandNames: ['Cytotec'], form: 'tablet', strength: '200mcg', unit: 'mcg', route: 'oral', category: 'Prostaglandin', indications: ['Peptic ulcer prevention', 'Cervical ripening'], standardDosage: '200mcg', standardFrequency: 'QID', requiresPrescription: true },

  // ── Neurology / Epilepsy ──────────────────────────────────────────────────
  { name: 'Carbamazepine 200mg', genericName: 'Carbamazepine', brandNames: ['Tegretol', 'Epitol'], form: 'tablet', strength: '200mg', unit: 'mg', route: 'oral', category: 'Anticonvulsant', indications: ['Epilepsy', 'Trigeminal neuralgia', 'Bipolar disorder'], standardDosage: '200–400mg', standardFrequency: 'BID', requiresPrescription: true },
  { name: 'Phenytoin 100mg', genericName: 'Phenytoin Sodium', brandNames: ['Dilantin', 'Epanutin'], form: 'capsule', strength: '100mg', unit: 'mg', route: 'oral', category: 'Anticonvulsant', indications: ['Epilepsy', 'Status epilepticus'], standardDosage: '100–300mg', standardFrequency: 'TID', requiresPrescription: true },
  { name: 'Gabapentin 300mg', genericName: 'Gabapentin', brandNames: ['Neurontin', 'Gabarone'], form: 'capsule', strength: '300mg', unit: 'mg', route: 'oral', category: 'Anticonvulsant / Neuropathic Pain', indications: ['Epilepsy', 'Neuropathic pain', 'Postherpetic neuralgia'], standardDosage: '300–1200mg', standardFrequency: 'TID', requiresPrescription: true },
  { name: 'Pregabalin 75mg', genericName: 'Pregabalin', brandNames: ['Lyrica', 'Prelin'], form: 'capsule', strength: '75mg', unit: 'mg', route: 'oral', category: 'Anticonvulsant / Neuropathic Pain', indications: ['Neuropathic pain', 'Fibromyalgia', 'Epilepsy'], standardDosage: '75–150mg', standardFrequency: 'BID', requiresPrescription: true },
  { name: 'Topiramate 50mg', genericName: 'Topiramate', brandNames: ['Topamax'], form: 'tablet', strength: '50mg', unit: 'mg', route: 'oral', category: 'Anticonvulsant', indications: ['Epilepsy', 'Migraine prophylaxis'], standardDosage: '25–400mg', standardFrequency: 'BID', requiresPrescription: true },
  { name: 'Propranolol 40mg', genericName: 'Propranolol HCl', brandNames: ['Inderal', 'Avlocardyl'], form: 'tablet', strength: '40mg', unit: 'mg', route: 'oral', category: 'Beta-blocker', indications: ['Hypertension', 'Migraine prophylaxis', 'Tremor', 'Angina'], standardDosage: '40–80mg', standardFrequency: 'BID–TID', requiresPrescription: true },
  { name: 'Sumatriptan 50mg', genericName: 'Sumatriptan Succinate', brandNames: ['Imitrex', 'Imigran'], form: 'tablet', strength: '50mg', unit: 'mg', route: 'oral', category: 'Triptan', indications: ['Migraine', 'Cluster headache'], standardDosage: '50–100mg', standardFrequency: 'Single dose, repeat after 2h if needed', requiresPrescription: true },

  // ── Gout ──────────────────────────────────────────────────────────────────
  { name: 'Allopurinol 100mg', genericName: 'Allopurinol', brandNames: ['Zyloprim', 'Alloril'], form: 'tablet', strength: '100mg', unit: 'mg', route: 'oral', category: 'Antigout', indications: ['Gout', 'Hyperuricemia', 'Kidney stones'], standardDosage: '100–300mg', standardFrequency: 'Once daily', requiresPrescription: true },
  { name: 'Colchicine 0.5mg', genericName: 'Colchicine', brandNames: ['Colcrys', 'Mitigare'], form: 'tablet', strength: '0.5mg', unit: 'mg', route: 'oral', category: 'Antigout', indications: ['Acute gout', 'Gout prophylaxis', 'Familial Mediterranean fever'], standardDosage: '0.5–1mg', standardFrequency: 'BID', duration: '2–3 days (acute)', requiresPrescription: true },

  // ── Musculoskeletal ───────────────────────────────────────────────────────
  { name: 'Methocarbamol 500mg', genericName: 'Methocarbamol', brandNames: ['Robaxin', 'Methocarbamol'], form: 'tablet', strength: '500mg', unit: 'mg', route: 'oral', category: 'Muscle Relaxant', indications: ['Muscle spasm', 'Back pain'], standardDosage: '1500mg', standardFrequency: 'QID', duration: '5 days', requiresPrescription: true },
  { name: 'Cyclobenzaprine 10mg', genericName: 'Cyclobenzaprine HCl', brandNames: ['Flexeril', 'Amrix'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'Muscle Relaxant', indications: ['Muscle spasm'], standardDosage: '5–10mg', standardFrequency: 'TID', duration: '2–3 weeks', requiresPrescription: true },
  { name: 'Baclofen 10mg', genericName: 'Baclofen', brandNames: ['Lioresal', 'Gablofen'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'Muscle Relaxant', indications: ['Spasticity', 'MS', 'Spinal cord injury'], standardDosage: '5–20mg', standardFrequency: 'TID', requiresPrescription: true },

  // ── Sleep ─────────────────────────────────────────────────────────────────
  { name: 'Zolpidem 10mg', genericName: 'Zolpidem Tartrate', brandNames: ['Ambien', 'Stilnox'], form: 'tablet', strength: '10mg', unit: 'mg', route: 'oral', category: 'Sedative-Hypnotic', indications: ['Insomnia'], standardDosage: '5–10mg', standardFrequency: 'Once daily at bedtime', requiresPrescription: true, controlledSubstance: true },
  { name: 'Melatonin 3mg', genericName: 'Melatonin', brandNames: ['Circadin', 'Sleep Aid Melatonin'], form: 'tablet', strength: '3mg', unit: 'mg', route: 'oral', category: 'Sleep Aid', indications: ['Insomnia', 'Jet lag', 'Sleep disturbance'], standardDosage: '0.5–5mg', standardFrequency: 'Once daily 30 min before bedtime', requiresPrescription: false },

  // ── Ear / Nose ────────────────────────────────────────────────────────────
  { name: 'Oxymetazoline 0.05% Nasal Spray', genericName: 'Oxymetazoline HCl', brandNames: ['Afrin', 'Nasivin'], form: 'drops', strength: '0.05%', unit: '%', route: 'otic', category: 'Nasal Decongestant', indications: ['Nasal congestion', 'Sinusitis'], standardDosage: '2–3 sprays each nostril', standardFrequency: 'BID (max 3 days)', requiresPrescription: false },
  { name: 'Sodium Chloride 0.9% Nasal Spray', genericName: 'Normal Saline', brandNames: ['Simply Saline', 'NeilMed'], form: 'drops', strength: '0.9%', unit: '%', route: 'otic', category: 'Nasal Irrigant', indications: ['Nasal congestion', 'Rhinitis'], standardDosage: '2–3 sprays each nostril', standardFrequency: 'As needed', requiresPrescription: false },
];

async function main() {
  console.log('🔌 Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected\n');

  // Find all tenants (seed for each, or seed as "global" without tenantId)
  const tenants = await Tenant.find({}).lean();

  if (tenants.length === 0) {
    // No tenants — seed without tenantId (fallback for single-tenant setups)
    console.log('⚠️  No tenants found — seeding medicines without tenantId\n');
    await seedMedicines(undefined);
  } else {
    for (const tenant of tenants) {
      console.log(`\n🏥 Seeding medicines for tenant: ${(tenant as any).name} (${(tenant as any)._id})`);
      await seedMedicines((tenant as any)._id.toString());
    }
  }

  await mongoose.disconnect();
  console.log('\n✅ Done. Disconnected from database.');
}

async function seedMedicines(tenantId: string | undefined) {
  let created = 0;
  let skipped = 0;

  for (const med of COMMON_MEDICINES) {
    const filter: any = { name: med.name, strength: med.strength };
    if (tenantId) filter.tenantId = new mongoose.Types.ObjectId(tenantId);
    else filter.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];

    const payload: any = { ...med, active: true };
    if (tenantId) payload.tenantId = new mongoose.Types.ObjectId(tenantId);

    const existing = await Medicine.findOne(filter);
    if (existing) {
      skipped++;
    } else {
      await Medicine.create(payload);
      created++;
      process.stdout.write(`   ✓ ${med.name}\n`);
    }
  }

  console.log(`   📊 Created: ${created} | Skipped (already exist): ${skipped}`);
}

main().catch((err) => {
  console.error('❌ Seed error:', err);
  process.exit(1);
});
