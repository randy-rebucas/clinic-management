import type { IssuedSeal } from '@/lib/document-seal';

/**
 * HTML building blocks for protected, printable documents:
 *   - tiled forensic watermark (survives printing and photocopying poorly when cropped)
 *   - circular clinic seal, QR verification block and microtext strip
 *   - on-screen deterrents against copying, screenshots and DevTools
 *
 * The deterrents are best-effort: a browser cannot truly prevent a screenshot
 * or a phone camera. The real protection is the seal — every printed copy is
 * traceable, and anything not verifiable at /verify is not genuine.
 */

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only allow inline raster images (e.g. stored signature pads) as <img src>. */
export function safeImageSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : null;
}

export const PROTECTED_DOCUMENT_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

/**
 * Stamps the per-request CSP nonce (set by proxy.ts as x-nonce) on every <script> tag of a
 * server-built HTML document. Templates must escape all interpolated values, so the only
 * literal <script> tags are our own. Use data-print instead of onclick for print buttons.
 */
export function withScriptNonce(html: string, request: Request): string {
  const nonce = request.headers.get('x-nonce');
  if (!nonce || !/^[A-Za-z0-9+/=]+$/.test(nonce)) return html;
  return html.replace(/<script(?=[\s>])/gi, `<script nonce="${nonce}"`);
}

const strictAntiInspect = () =>
  process.env.NODE_ENV === 'production' && process.env.DOCUMENT_ANTI_INSPECT !== 'off';

/**
 * <style> + <script> to place inside <head>.
 * shieldOnBlur: hide the page while the window is unfocused (screen-capture tools
 * and screen sharing usually steal focus). Disable for pages that embed iframes.
 */
export function protectionHead(options: { shieldOnBlur?: boolean } = {}): string {
  const { shieldOnBlur = true } = options;
  return `
  <meta name="robots" content="noindex, nofollow, noarchive">
  <style>
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html.ds-protected, html.ds-protected body {
      -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
    }
    html.ds-protected img, html.ds-protected svg { -webkit-user-drag: none; pointer-events: none; }
    .ds-watermark { position: fixed; inset: 0; z-index: 9990; pointer-events: none; overflow: hidden; }
    .ds-watermark svg { width: 100%; height: 100%; display: block; }
    .ds-copy-banner {
      border: 2px solid #b91c1c; color: #b91c1c; text-align: center; font: 700 13px/1.4 Arial, sans-serif;
      letter-spacing: 2px; padding: 4px 8px; margin: 0 0 12px; text-transform: uppercase;
    }
    .ds-seal-block {
      display: flex; align-items: center; gap: 14px; border: 1px dashed #1e3a8a; border-radius: 6px;
      padding: 8px 12px; margin: 12px 0 8px; page-break-inside: avoid; break-inside: avoid;
      font: 11px/1.4 Arial, sans-serif; color: #111827; text-align: left; position: relative;
    }
    .ds-seal-block .ds-qr { width: 92px; height: 92px; flex: 0 0 auto; }
    .ds-seal-block .ds-stamp { width: 96px; height: 96px; flex: 0 0 auto; opacity: .9; }
    .ds-seal-block .ds-serial { font: 700 14px/1.3 'Courier New', monospace; letter-spacing: 1px; color: #1e3a8a; }
    .ds-seal-block .ds-meta { color: #374151; font-size: 10px; }
    .ds-microtext {
      font: 3.6px/1 Arial, sans-serif; letter-spacing: .2px; color: #1e3a8a; white-space: nowrap;
      overflow: hidden; height: 5px; margin-top: 4px; opacity: .8;
    }
    .ds-closed {
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px;
      background: #0f172a; color: #f8fafc; font: 600 16px/1.5 system-ui, Arial, sans-serif; text-align: center;
    }
    @media screen {
      .ds-shield {
        display: none; position: fixed; inset: 0; z-index: 2147483647; cursor: pointer;
        background: #0f172a; color: #f8fafc; align-items: center; justify-content: center; padding: 24px;
        font: 600 16px/1.5 system-ui, Arial, sans-serif; text-align: center;
      }
      html.ds-shielded .ds-shield { display: flex; }
      html.ds-shielded body > *:not(.ds-shield) { filter: blur(24px); }
    }
    @media print { .ds-shield, .ds-screen-only { display: none !important; } }
  </style>
  <script>
  (function () {
    var root = document.documentElement;
    root.classList.add('ds-protected');
    var shieldOnBlur = ${shieldOnBlur ? 'true' : 'false'};
    var strict = ${strictAntiInspect() ? 'true' : 'false'};
    var shield = null;

    function ensureShield() {
      if (shield || !document.body) return;
      shield = document.createElement('div');
      shield.className = 'ds-shield';
      shield.setAttribute('role', 'alert');
      shield.textContent = 'Protected document. Content is hidden while this window is inactive or a screen capture is attempted. Click to continue viewing.';
      shield.addEventListener('click', function () { setShield(false); });
      document.body.appendChild(shield);
    }
    function setShield(on) { ensureShield(); root.classList.toggle('ds-shielded', !!on); }
    function block(e) { e.preventDefault(); e.stopPropagation(); return false; }
    function wipeClipboard() {
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('').catch(function () {}); } catch (_) {}
    }

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('[data-print]')) { e.preventDefault(); window.print(); }
    });

    ['contextmenu', 'copy', 'cut', 'dragstart', 'selectstart'].forEach(function (t) {
      document.addEventListener(t, block, true);
    });

    document.addEventListener('keydown', function (e) {
      var k = (e.key || '').toLowerCase();
      var mod = e.ctrlKey || e.metaKey;
      if (k === 'printscreen' || (mod && e.shiftKey && (k === '3' || k === '4' || k === '5' || k === 's'))) {
        setShield(true); wipeClipboard(); return block(e);
      }
      if (
        k === 'f12' ||
        (mod && e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'k' || k === 'e' || k === 'm')) ||
        (e.metaKey && e.altKey && (k === 'i' || k === 'j' || k === 'c' || k === 'u')) ||
        (mod && (k === 'u' || k === 's' || k === 'c' || k === 'a' || k === 'x'))
      ) {
        return block(e);
      }
    }, true);

    document.addEventListener('keyup', function (e) {
      if ((e.key || '').toLowerCase() === 'printscreen') { wipeClipboard(); setShield(true); }
    }, true);

    if (shieldOnBlur) {
      window.addEventListener('blur', function () { setShield(true); });
      document.addEventListener('visibilitychange', function () { if (document.hidden) setShield(true); });
      window.addEventListener('focus', function () { setTimeout(function () { setShield(false); }, 250); });
    }

    if (strict) {
      var closed = false;
      function closeDocument() {
        if (closed) return;
        closed = true;
        try {
          document.body.innerHTML = '';
          var msg = document.createElement('div');
          msg.className = 'ds-closed';
          msg.textContent = 'Developer tools were opened, so this protected document was closed. Close developer tools and reload the page to view it again.';
          document.body.appendChild(msg);
          document.title = 'Document closed';
        } catch (_) {}
      }
      // A debugger statement only pauses when DevTools is open; a long pause means it is.
      setInterval(function () {
        var started = performance.now();
        debugger;
        if (performance.now() - started > 100) closeDocument();
      }, 1000);
    }
  })();
  </script>`;
}

/** Full-page diagonal watermark repeated on every printed page. */
export function watermarkOverlay(lines: string[], options: { warning?: boolean } = {}): string {
  const color = options.warning ? 'rgba(185,28,28,0.16)' : 'rgba(30,58,138,0.09)';
  const [first = '', ...rest] = lines.map(escapeHtml);
  const row = (x: number, y: number) => `
        <text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="${color}">${first}</text>
        ${rest
          .map(
            (line, i) =>
              `<text x="${x}" y="${y + 18 * (i + 1)}" font-family="Arial, sans-serif" font-size="11" fill="${color}">${line}</text>`
          )
          .join('')}`;
  return `
  <div class="ds-watermark" aria-hidden="true">
    <svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="ds-wm" width="440" height="240" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          ${row(10, 50)}
          ${row(230, 170)}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#ds-wm)" />
    </svg>
  </div>`;
}

/** Red banner for reprints and file copies, so duplicates are obvious on paper. */
export function copyBanner(seal: IssuedSeal, options: { fileCopy?: boolean } = {}): string {
  if (options.fileCopy) {
    return `<div class="ds-copy-banner">Clinic file copy — not valid for dispensing or claims</div>`;
  }
  if (seal.printNumber > 1) {
    return `<div class="ds-copy-banner">Reprint — copy #${seal.printNumber}. Verify before accepting.</div>`;
  }
  return '';
}

/** Circular official seal with the clinic name around the rim. */
function sealStamp(clinicName: string, seal: IssuedSeal): string {
  const rim = `${clinicName.toUpperCase().slice(0, 34)} • OFFICIAL DOCUMENT • `;
  const issued = seal.issuedAt.toISOString().slice(0, 10);
  return `
    <svg class="ds-stamp" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><path id="ds-rim" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" /></defs>
      <circle cx="60" cy="60" r="57" fill="none" stroke="#1e3a8a" stroke-width="2.5" />
      <circle cx="60" cy="60" r="52" fill="none" stroke="#1e3a8a" stroke-width="0.8" />
      <circle cx="60" cy="60" r="35" fill="none" stroke="#1e3a8a" stroke-width="0.8" stroke-dasharray="2 1.5" />
      <text font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#1e3a8a">
        <textPath href="#ds-rim" textLength="280" lengthAdjust="spacingAndGlyphs">${escapeHtml(rim)}</textPath>
      </text>
      <text x="60" y="55" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="800" fill="#1e3a8a">SEALED</text>
      <text x="60" y="66" text-anchor="middle" font-family="Courier New, monospace" font-size="6.5" font-weight="700" fill="#1e3a8a">${escapeHtml(seal.displaySerial.slice(-9))}</text>
      <text x="60" y="76" text-anchor="middle" font-family="Arial, sans-serif" font-size="6" fill="#1e3a8a">${issued}</text>
    </svg>`;
}

/** Verification block: seal stamp, QR code, serial, fingerprint and issuance trail. */
export function sealBlock(seal: IssuedSeal, clinicName: string, documentLabel: string): string {
  const micro = escapeHtml(
    `AUTHENTIC ${documentLabel.toUpperCase()} · ${clinicName.toUpperCase()} · ${seal.displaySerial} · `
  ).repeat(12);
  const verifyPage = `${seal.verifyBaseUrl}/verify`;
  return `
  <div class="ds-seal-block">
    ${sealStamp(clinicName, seal)}
    <img class="ds-qr" src="${seal.qrDataUrl}" alt="Verification QR code" />
    <div style="flex: 1 1 auto; min-width: 0;">
      <div style="font-weight: 700; font-size: 12px;">Verify this document's authenticity</div>
      <div>Scan the QR code, or go to <strong>${escapeHtml(verifyPage)}</strong> and enter the serial.</div>
      <div class="ds-serial">${escapeHtml(seal.displaySerial)}</div>
      <div class="ds-meta">Seal fingerprint: ${escapeHtml(seal.fingerprint)}</div>
      <div class="ds-meta">
        Copy #${seal.printNumber} · issued ${escapeHtml(seal.issuedAt.toLocaleString('en-US'))} by ${escapeHtml(seal.issuedByName)}
      </div>
      <div class="ds-meta">Altered, photocopied or unverifiable copies are not valid.</div>
      <div class="ds-microtext" aria-hidden="true">${micro}</div>
    </div>
  </div>`;
}

/** Convenience: everything a sealed document template needs. */
export function sealedDocumentParts(params: {
  seal: IssuedSeal;
  clinicName: string;
  documentLabel: string;
  documentCode?: string;
  fileCopy?: boolean;
}) {
  const { seal, clinicName, documentLabel, documentCode, fileCopy } = params;
  const watermarkLines = [
    fileCopy ? `FILE COPY · NOT FOR CLAIMS · ${clinicName}` : `${clinicName} · ${documentLabel}`,
    `${documentCode ? `${documentCode} · ` : ''}Serial ${seal.displaySerial} · Copy #${seal.printNumber}`,
    `Verify at ${seal.verifyBaseUrl}/verify`,
  ];
  return {
    head: protectionHead(),
    watermark: watermarkOverlay(watermarkLines, { warning: fileCopy }),
    banner: copyBanner(seal, { fileCopy }),
    seal: sealBlock(seal, clinicName, documentLabel),
  };
}
