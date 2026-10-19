import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Browser } from 'puppeteer-core';
import { PROTECTED_DOCUMENT_HEADERS, withScriptNonce } from '@/lib/document-protection';

/**
 * Server-side HTML → PDF for the printable documents (prescriptions, certificates, letters).
 *
 * The print routes already build complete, self-contained HTML (inline SVG seal, data-URL QR
 * and signature), so a PDF is that same page printed by headless Chromium: what the browser
 * prints and what the PDF shows cannot drift apart.
 *
 * On Vercel/Lambda the Chromium binary comes from @sparticuz/chromium. Locally, set
 * CHROME_EXECUTABLE_PATH or have Chrome/Edge installed in a standard location.
 */

const LOCAL_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

const isServerless = () => Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

async function launch(): Promise<Browser> {
  const puppeteer = (await import('puppeteer-core')).default;
  if (isServerless() && !process.env.CHROME_EXECUTABLE_PATH) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    });
  }
  const { existsSync } = await import('node:fs');
  const executablePath = process.env.CHROME_EXECUTABLE_PATH || LOCAL_CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) {
    throw new PdfUnavailableError('No Chrome found for PDF rendering. Set CHROME_EXECUTABLE_PATH.');
  }
  return puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
}

export class PdfUnavailableError extends Error {}

// One browser per warm function instance; pages are cheap, launches are not.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.connected) return existing;
  }
  browserPromise = launch();
  return browserPromise;
}

/**
 * Print self-contained HTML to a PDF. Scripts are disabled (the on-screen protection script
 * and auto-print are irrelevant here) and every network request is refused, so a template
 * can never make the server fetch a URL.
 */
export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().startsWith('data:') || req.url() === 'about:blank') req.continue();
      else req.abort();
    });
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    await page.emulateMediaType('print');
    return await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      format: 'A4',
      timeout: 20_000,
    });
  } finally {
    await page.close().catch(() => {});
  }
}

/** Filename-safe slug for Content-Disposition. */
export function pdfFilename(...parts: Array<string | undefined | null>): string {
  const name = parts
    .filter(Boolean)
    .join('-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${name || 'document'}.pdf`;
}

export function pdfHeaders(filename: string, inline = true): Record<string, string> {
  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
    'Cache-Control': 'no-store, private, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };
}

export function wantsPdf(request: { nextUrl: URL }): boolean {
  return request.nextUrl.searchParams.get('format') === 'pdf';
}

/**
 * Shared tail of a print route: the protected HTML page as before, or the same HTML as a PDF
 * when the URL has ?format=pdf (add &download=1 for an attachment instead of inline).
 */
export async function documentResponse(request: NextRequest, html: string, filename: string): Promise<Response> {
  if (!wantsPdf(request)) {
    return new NextResponse(withScriptNonce(html, request), { headers: PROTECTED_DOCUMENT_HEADERS });
  }
  try {
    const pdf = await htmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('download') !== '1';
    return new NextResponse(Buffer.from(pdf), { headers: pdfHeaders(filename, inline) });
  } catch (error) {
    console.error('PDF rendering failed:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'The PDF could not be created right now. Use Print instead.' },
      { status: 503 }
    );
  }
}
