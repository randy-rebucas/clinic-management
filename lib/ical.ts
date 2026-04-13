/**
 * Minimal iCalendar (RFC 5545) generator.
 * Produces text/calendar content without external dependencies.
 */

export interface ICalEvent {
  uid: string;
  summary: string;
  description?: string;
  dtstart: Date;
  dtend: Date;
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  location?: string;
  organizer?: string;
}

function formatDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Fold long lines at 75 octets per RFC 5545 §3.1 */
function fold(line: string): string {
  const chunks: string[] = [];
  while (line.length > 75) {
    chunks.push(line.slice(0, 75));
    line = ' ' + line.slice(75);
  }
  chunks.push(line);
  return chunks.join('\r\n');
}

export function buildICalFeed(calName: string, events: ICalEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//MyClinicsoftware//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-WR-TIMEZONE:UTC',
  ];

  const now = formatDate(new Date());

  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(fold(`UID:${ev.uid}`));
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${formatDate(ev.dtstart)}`);
    lines.push(`DTEND:${formatDate(ev.dtend)}`);
    lines.push(fold(`SUMMARY:${esc(ev.summary)}`));
    if (ev.description) lines.push(fold(`DESCRIPTION:${esc(ev.description)}`));
    if (ev.location) lines.push(fold(`LOCATION:${esc(ev.location)}`));
    if (ev.status) lines.push(`STATUS:${ev.status}`);
    if (ev.organizer) lines.push(fold(`ORGANIZER:${esc(ev.organizer)}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
