import { NextResponse } from 'next/server';

/** A version like 1.1.6, or null when unset or malformed (a typo must never lock patients out). */
function version(value: string | undefined): string | null {
  const v = value?.trim();
  return v && /^\d+(\.\d+){0,2}$/.test(v) ? v : null;
}

/**
 * GET /api/patients/app-config (public): what the eMCR app checks on launch.
 * - minVersion (EMCR_MIN_VERSION): older apps show a non-dismissible "Update required" screen.
 *   Raise it when a backend change breaks older apps.
 * - latestVersion (EMCR_LATEST_VERSION): older apps show a dismissible "Update available" prompt.
 * The app treats a failed or missing answer as "no requirement".
 */
export async function GET() {
  return NextResponse.json(
    {
      success: true,
      data: {
        minVersion: version(process.env.EMCR_MIN_VERSION),
        latestVersion: version(process.env.EMCR_LATEST_VERSION),
        iosStoreUrl: process.env.EMCR_IOS_STORE_URL?.trim() || null,
        androidStoreUrl:
          process.env.EMCR_ANDROID_STORE_URL?.trim() || 'https://play.google.com/store/apps/details?id=solutions.myclinicsoft.emcr',
      },
    },
    // Short cache: a raised minimum reaches every app within minutes.
    { headers: { 'Cache-Control': 'public, max-age=300' } }
  );
}
