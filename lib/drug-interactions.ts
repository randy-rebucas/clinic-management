// Drug Interaction Checker with RxNav API Integration
// Professional-grade implementation with NLM RxNav API support
// Includes caching, error handling, rate limiting, and fallback mechanisms

export interface DrugInteraction {
  medication1: string;
  medication2: string;
  severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
  description: string;
  recommendation?: string;
}

// RxNav API Configuration
export const RXNAV_CONFIG = {
  BASE_URL: process.env.RXNAV_API_URL || 'https://rxnav.nlm.nih.gov/REST',
  RXCUI_RESOLVE_TIMEOUT: 5000,
  INTERACTION_LOOKUP_TIMEOUT: 8000,
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
  CACHE_TTL_MS: 3600000, // 1 hour in production
  ENABLE_LOGGING: process.env.NODE_ENV === 'development',
};

// API Health monitoring
const API_STATS = {
  rxcuiRequests: 0,
  rxcuiSuccess: 0,
  rxcuiFailures: 0,
  interactionRequests: 0,
  interactionSuccess: 0,
  interactionFailures: 0,
  lastError: null as string | null,
  lastErrorTime: null as Date | null,
};

function logApiEvent(level: 'info' | 'warn' | 'error', message: string, data?: any) {
  if (!RXNAV_CONFIG.ENABLE_LOGGING) return;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [RxNav] [${level.toUpperCase()}] ${message}`, data || '');
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

// RxNav RxCUI cache with TTL (in-memory, per server instance)
const rxcuiCache = new Map<string, { value: string | null; timestamp: number }>();

/**
 * Clear expired cache entries based on TTL
 */
function pruneExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of rxcuiCache.entries()) {
    if (now - entry.timestamp > RXNAV_CONFIG.CACHE_TTL_MS) {
      rxcuiCache.delete(key);
    }
  }
}

/**
 * Get from cache if valid
 */
function getCachedRxCUI(drugName: string): string | null | undefined {
  pruneExpiredCache();
  const key = drugName.toLowerCase().trim();
  const entry = rxcuiCache.get(key);
  if (entry) {
    logApiEvent('info', `Cache hit for drug: ${drugName}`);
    return entry.value;
  }
  return undefined;
}

/**
 * Set cache with timestamp
 */
function setCachedRxCUI(drugName: string, rxcui: string | null) {
  const key = drugName.toLowerCase().trim();
  rxcuiCache.set(key, { value: rxcui, timestamp: Date.now() });
}

/**
 * Retry logic with exponential backoff
 */
async function fetchWithRetry(url: string, timeout: number, retries: number = RXNAV_CONFIG.MAX_RETRIES): Promise<Response> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const res = await fetch(url, { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'MyClinicSoft/1.0 (healthcare-app)',
          }
        });
        clearTimeout(timeoutId);
        
        if (res.ok) return res;
        
        // Don't retry on 4xx errors (data not found, invalid request)
        if (res.status >= 400 && res.status < 500) {
          throw new Error(`HTTP ${res.status}`);
        }
        
        // Retry on 5xx errors
        if (res.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, RXNAV_CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt)));
          continue;
        }
        
        throw new Error(`HTTP ${res.status}`);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: any) {
      lastError = error;
      logApiEvent('warn', `Attempt ${attempt + 1} failed for URL: ${url}`, error.message);
      
      // Don't retry on timeout or abort
      if (error.name === 'AbortError') {
        break;
      }
      
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, RXNAV_CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt)));
      }
    }
  }
  
  API_STATS.lastError = lastError?.message || 'Unknown error';
  API_STATS.lastErrorTime = new Date();
  throw lastError;
}

/**
 * Resolve a drug name to its RxNorm RxCUI using the free NLM RxNav API.
 * Includes retry logic, caching, and comprehensive error handling.
 * Returns null if not found or on network error (with fallback).
 */
async function resolveRxCUI(drugName: string): Promise<string | null> {
  API_STATS.rxcuiRequests++;
  const key = drugName.toLowerCase().trim();
  
  // Check cache first
  const cached = getCachedRxCUI(drugName);
  if (cached !== undefined) {
    if (cached) {
      API_STATS.rxcuiSuccess++;
    } else {
      API_STATS.rxcuiFailures++;
    }
    return cached;
  }

  try {
    const url = `${RXNAV_CONFIG.BASE_URL}/rxcui.json?name=${encodeURIComponent(key)}&search=1`;
    logApiEvent('info', `Resolving RxCUI for: ${drugName}`, { url });
    
    const res = await fetchWithRetry(url, RXNAV_CONFIG.RXCUI_RESOLVE_TIMEOUT);
    const data = await res.json();
    
    const rxcui = data?.idGroup?.rxnormId?.[0] ?? null;
    setCachedRxCUI(drugName, rxcui);
    
    if (rxcui) {
      logApiEvent('info', `Resolved drug to RxCUI: ${drugName} -> ${rxcui}`);
      API_STATS.rxcuiSuccess++;
    } else {
      logApiEvent('warn', `No RxCUI found for drug: ${drugName}`);
      API_STATS.rxcuiFailures++;
    }
    
    return rxcui;
  } catch (error: any) {
    logApiEvent('error', `Failed to resolve RxCUI for ${drugName}`, error.message);
    API_STATS.rxcuiFailures++;
    
    // Cache the failure to avoid repeated requests
    setCachedRxCUI(drugName, null);
    return null;
  }
}

/**
 * Map RxNav severity strings to our internal severity levels.
 */
function mapRxNavSeverity(severity: string): DrugInteraction['severity'] {
  const s = (severity ?? '').toLowerCase();
  if (s === 'high') return 'severe';
  if (s === 'moderate' || s === 'medium') return 'moderate';
  if (s === 'low') return 'mild';
  return 'moderate';
}

/**
 * Check drug interactions using the free NLM RxNav API.
 * Includes comprehensive error handling, deduplication, and fallback to static table.
 * Production-ready with monitoring and logging.
 */
export async function checkDrugInteractionsAdvanced(
  medications: Array<{ name: string; genericName?: string }>
): Promise<DrugInteraction[]> {
  API_STATS.interactionRequests++;
  
  if (medications.length < 2) {
    logApiEvent('info', 'Insufficient medications for interaction check', { count: medications.length });
    return [];
  }

  try {
    // Resolve all drug names (brand + generic) to RxCUIs in parallel
    const nameEntries = medications.flatMap((m) =>
      [m.name, m.genericName].filter(Boolean).map((n) => n as string)
    );
    
    logApiEvent('info', 'Resolving RxCUIs for medications', { count: nameEntries.length });
    const resolvedPairs = await Promise.all(nameEntries.map(resolveRxCUI));

    // Build a de-duplicated map: rxcui -> original medication name
    const rxcuiToMed = new Map<string, string>();
    nameEntries.forEach((name, idx) => {
      if (resolvedPairs[idx]) {
        rxcuiToMed.set(resolvedPairs[idx]!, name);
      }
    });

    const rxcuis = Array.from(rxcuiToMed.keys());
    logApiEvent('info', `Resolved RxCUIs`, { total: nameEntries.length, resolved: rxcuis.length });
    
    if (rxcuis.length < 2) {
      logApiEvent('warn', 'Could not resolve enough RxCUIs, falling back to static table', { 
        attempted: nameEntries.length, 
        resolved: rxcuis.length 
      });
      return checkDrugInteractions(medications);
    }

    // Query interaction database
    const url = `${RXNAV_CONFIG.BASE_URL}/interaction/list.json?rxcuis=${rxcuis.join('+')}`;
    logApiEvent('info', 'Querying RxNav for interactions', { rxcuiCount: rxcuis.length });
    
    const res = await fetchWithRetry(url, RXNAV_CONFIG.INTERACTION_LOOKUP_TIMEOUT);
    const data = await res.json();
    
    const results: DrugInteraction[] = [];
    const seen = new Set<string>();

    const groups: any[] = data?.fullInteractionTypeGroup ?? [];
    logApiEvent('info', `Found interaction groups`, { count: groups.length });
    
    for (const group of groups) {
      const types: any[] = group?.fullInteractionType ?? [];
      for (const type of types) {
        const pairs: any[] = type?.interactionPair ?? [];
        for (const pair of pairs) {
          const concepts: any[] = pair?.interactionConcept ?? [];
          if (concepts.length < 2) continue;

          const name1 =
            rxcuiToMed.get(concepts[0]?.minConceptItem?.rxcui) ??
            concepts[0]?.minConceptItem?.name ??
            '';
          const name2 =
            rxcuiToMed.get(concepts[1]?.minConceptItem?.rxcui) ??
            concepts[1]?.minConceptItem?.name ??
            '';

          const dedupeKey = [name1, name2].sort().join('||');
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          const severity = mapRxNavSeverity(pair?.severity ?? '');
          results.push({
            medication1: name1,
            medication2: name2,
            severity,
            description: pair?.description ?? 'Potential drug interaction detected.',
            recommendation: getRecommendation(severity),
          });
          
          logApiEvent('info', `Found interaction: ${name1} <-> ${name2}`, { severity });
        }
      }
    }

    // Merge with static table results so nothing is lost
    const staticResults = checkDrugInteractions(medications);
    for (const sr of staticResults) {
      const dedupeKey = [sr.medication1, sr.medication2].sort().join('||');
      if (!seen.has(dedupeKey)) {
        results.push(sr);
        seen.add(dedupeKey);
        logApiEvent('info', `Added result from static table: ${sr.medication1} <-> ${sr.medication2}`);
      }
    }

    API_STATS.interactionSuccess++;
    logApiEvent('info', `Completed drug interaction check`, { 
      interactionsFound: results.length, 
      medications: medications.length 
    });
    
    return results;
  } catch (error: any) {
    API_STATS.interactionFailures++;
    logApiEvent('error', 'RxNav interaction check failed, falling back to static table', error.message);
    
    try {
      return checkDrugInteractions(medications);
    } catch (fallbackError) {
      logApiEvent('error', 'Static table lookup also failed', fallbackError);
      return [];
    }
  }
}

// Check interactions with patient's current medications
export async function checkInteractionsWithPatientMedications(
  prescriptionMedications: Array<{ name: string; genericName?: string }>,
  patientCurrentMedications?: Array<{ name: string; genericName?: string }>
): Promise<DrugInteraction[]> {
  if (!patientCurrentMedications || patientCurrentMedications.length === 0) {
    return checkDrugInteractionsAdvanced(prescriptionMedications);
  }

  const allMedications = [...prescriptionMedications, ...patientCurrentMedications];
  return checkDrugInteractionsAdvanced(allMedications);
}

/**
 * Get API statistics for monitoring and debugging
 * Useful for tracking API health, cache effectiveness, and failure rates
 */
export function getApiStats() {
  return {
    ...API_STATS,
    cacheSize: rxcuiCache.size,
    rxcuiSuccessRate: API_STATS.rxcuiRequests > 0 
      ? ((API_STATS.rxcuiSuccess / API_STATS.rxcuiRequests) * 100).toFixed(2) + '%'
      : 'N/A',
    interactionSuccessRate: API_STATS.interactionRequests > 0
      ? ((API_STATS.interactionSuccess / API_STATS.interactionRequests) * 100).toFixed(2) + '%'
      : 'N/A',
  };
}

/**
 * Clear the RxCUI cache if needed (e.g., on server restart or manual cache clear)
 * Use sparingly as cache improves performance
 */
export function clearRxCuiCache() {
  const previousSize = rxcuiCache.size;
  rxcuiCache.clear();
  logApiEvent('info', 'RxCUI cache cleared', { previousSize });
}

/**
 * Force refresh cache for specific drugs
 * Useful if drug data changes and you need fresh data
 */
export function invalidateCacheFor(drugNames: string[]) {
  const invalidated = drugNames.filter(name => {
    const key = name.toLowerCase().trim();
    return rxcuiCache.delete(key);
  });
  logApiEvent('info', 'Cache invalidated for drugs', { drugs: invalidated.length });
}

