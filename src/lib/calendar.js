// Add-to-calendar for an event: a Google Calendar link, and an .ics file that
// Apple Calendar and Outlook open directly.

import { placeText } from '@/lib/ticket';

const utc = (value) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function googleCalendarUrl(event, { details = '' } = {}) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${utc(event.starts_at)}/${utc(event.ends_at || event.starts_at)}`,
    details,
    location: placeText(event),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const escapeText = (s) =>
  String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// RFC 5545 caps content lines at 75 octets; a leading space continues a line.
function fold(line) {
  const parts = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
}

export function downloadIcs(event, { url = '', details = '', uid } = {}) {
  const place = placeText(event);
  const description = [details, url].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//connect3//events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid || event.id}@connect3.dev`,
    `DTSTAMP:${utc(Date.now())}`,
    `DTSTART:${utc(event.starts_at)}`,
    `DTEND:${utc(event.ends_at || event.starts_at)}`,
    `SUMMARY:${escapeText(event.title)}`,
    place && `LOCATION:${escapeText(place)}`,
    description && `DESCRIPTION:${escapeText(description)}`,
    url && `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).map(fold);

  const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${(event.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
