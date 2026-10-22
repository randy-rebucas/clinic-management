/**
 * One CSV cell. Text starting with = + - @ (or a tab / carriage return) is prefixed with ' so a
 * spreadsheet shows it instead of running it as a formula (CSV injection: a patient named
 * `=HYPERLINK(...)` on the public booking form). Numbers, including negative ones, stay numbers.
 */
export function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const raw = String(value);
  const text = typeof value !== 'number' && /^[=+\-@\t\r]/.test(raw) && !/^[-+]?\d+(\.\d+)?$/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
