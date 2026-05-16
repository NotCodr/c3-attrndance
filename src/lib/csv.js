// Lightweight CSV generation for client-side downloads.
import { MEL_TZ } from '@/lib/format';

function esc(val) {
  if (val == null) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(headers, rows) {
  const head = headers.map(esc).join(',');
  const body = rows.map((r) => r.map(esc).join(',')).join('\n');
  return `${head}\n${body}\n`;
}

export function downloadCsv(filename, csv) {
  // BOM so Excel opens UTF-8 correctly
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function generateAttendanceCsv({ event, club, rsvps, checkIns }) {
  const checkInByRsvp = new Map(checkIns.map((c) => [c.rsvp_id, c]));
  // Merge RSVPs + walk-in check-ins (those without an rsvp_id)
  const rsvpRows = rsvps.map((r) => {
    const ci = checkInByRsvp.get(r.id);
    return {
      full_name: r.full_name,
      email: r.email,
      student_number: r.student_number,
      course: r.course,
      university: r.university,
      is_member: r.is_member,
      rsvp_status: r.status,
      checked_in: !!ci,
      checked_in_at: ci?.checked_in_at || '',
      check_in_method: ci?.method || '',
      dietary: r.dietary_requirements || '',
      accessibility: r.accessibility_requirements || '',
    };
  });
  const walkInRows = checkIns
    .filter((c) => !c.rsvp_id)
    .map((c) => ({
      full_name: c.full_name,
      email: c.email || '',
      student_number: c.student_number || '',
      course: c.course || '',
      university: c.university || '',
      is_member: '',
      rsvp_status: 'walk-in',
      checked_in: true,
      checked_in_at: c.checked_in_at,
      check_in_method: c.method,
      dietary: '',
      accessibility: '',
    }));

  const all = [...rsvpRows, ...walkInRows];
  const headers = [
    'Full name', 'Email', 'Student number', 'Course', 'University', 'Member',
    'RSVP status', 'Checked in', 'Checked-in at (Melbourne)', 'Check-in method',
    'Dietary requirements', 'Accessibility requirements',
  ];
  const rows = all.map((r) => [
    r.full_name,
    r.email,
    r.student_number,
    r.course,
    r.university,
    r.is_member === true ? 'yes' : r.is_member === false ? 'no' : '',
    r.rsvp_status,
    r.checked_in ? 'yes' : 'no',
    r.checked_in_at
      ? new Date(r.checked_in_at).toLocaleString('en-AU', { timeZone: MEL_TZ })
      : '',
    r.check_in_method,
    r.dietary,
    r.accessibility,
  ]);

  const filename = `${club.slug}_${(event.starts_at || '').slice(0, 10)}_attendance.csv`;
  return { csv: rowsToCsv(headers, rows), filename };
}