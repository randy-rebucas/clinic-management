/**
 * Print an invite slip on its own page, so nothing else on screen (the patient record, the
 * kiosk) reaches the printer. Returns false when the browser blocked the pop-up.
 */
export function printInviteSlip(slip: HTMLElement | null): boolean {
  if (!slip) return true;
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return false;
  win.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>eMCR invite</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;color:#111}.slip{max-width:300px;margin:0 auto;text-align:center}
h1{font-size:18px;margin:0 0 4px}p{font-size:13px;margin:4px 0;line-height:1.4}.code{font:700 24px ui-monospace,monospace;letter-spacing:3px;margin:12px 0 4px}
.qr{margin:16px auto 8px;width:180px}.qr svg{width:180px;height:180px}ol{text-align:left;font-size:13px;padding-left:20px;margin:12px 0}
.muted{color:#555;font-size:12px}</style></head><body>${slip.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
