import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { formatDate, formatTime, formatMoneyCents, MEL_TZ } from '@/lib/format';

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const ACCENT = rgb(0.71, 0.66, 0.94); // lavender
const TEXT = rgb(0.04, 0.04, 0.06);
const MUTED = rgb(0.4, 0.4, 0.45);
const LINE = rgb(0.85, 0.85, 0.87);

function arrivalTimeLocal(iso) {
  return new Date(iso).toLocaleTimeString('en-AU', { timeZone: MEL_TZ, hour: 'numeric', minute: '2-digit', hour12: true });
}

function downloadBlob(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function fetchPng(url) {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch { return null; }
}

function drawHeader(page, fonts, { eventTitle, eventDate, location, clubName, pageTitle }) {
  const { regular, medium } = fonts;
  page.drawText('connect3', { x: A4.width - MARGIN - 60, y: A4.height - MARGIN + 4, size: 9, font: regular, color: MUTED });
  page.drawText(pageTitle, { x: MARGIN, y: A4.height - MARGIN + 4, size: 14, font: medium, color: TEXT });
  page.drawLine({ start: { x: MARGIN, y: A4.height - MARGIN - 8 }, end: { x: A4.width - MARGIN, y: A4.height - MARGIN - 8 }, thickness: 0.5, color: LINE });
  page.drawText(eventTitle, { x: MARGIN, y: A4.height - MARGIN - 26, size: 11, font: medium, color: TEXT });
  page.drawText(`${eventDate}  ·  ${location}`, { x: MARGIN, y: A4.height - MARGIN - 40, size: 9, font: regular, color: MUTED });
  page.drawText(clubName, { x: MARGIN, y: A4.height - MARGIN - 54, size: 9, font: regular, color: MUTED });
}

function drawFooter(page, fonts, { pageNum, totalPages, attendees, generatedAt }) {
  const { regular } = fonts;
  const y = MARGIN - 10;
  page.drawText(`Page ${pageNum} of ${totalPages}`, { x: MARGIN, y, size: 8, font: regular, color: MUTED });
  page.drawText(`Total attendees: ${attendees}`, { x: A4.width / 2 - 40, y, size: 8, font: regular, color: MUTED });
  page.drawText(`Generated ${generatedAt}`, { x: A4.width - MARGIN - 120, y, size: 8, font: regular, color: MUTED });
}

function clipText(font, text, size, maxWidth) {
  if (!text) return '';
  const s = String(text);
  let out = s;
  while (font.widthOfTextAtSize(out, size) > maxWidth - 4 && out.length > 3) {
    out = out.slice(0, -1);
  }
  return out === s ? s : out + '…';
}

export async function generateAttendancePdf({ event, club, checkIns, returnBytes = false }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const medium = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, medium };

  const sorted = [...checkIns].sort((a, b) => new Date(a.checked_in_at) - new Date(b.checked_in_at));
  const rowsPerPage = 30;
  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));

  // Validation: missing fields for grant-funded events
  const missing = event.is_grant_funded
    ? sorted.filter((c, i) => !c.student_number || !c.course).map((c, i) => ({ ...c, _idx: sorted.indexOf(c) + 1 }))
    : [];

  let extraPagesBefore = 0;
  if (missing.length > 0) extraPagesBefore = 1;

  const eventDate = formatDate(event.starts_at);
  const generatedAt = new Date().toLocaleString('en-AU', { timeZone: MEL_TZ });

  if (missing.length > 0) {
    const p = pdf.addPage([A4.width, A4.height]);
    drawHeader(p, fonts, { eventTitle: event.title, eventDate, location: event.location_name, clubName: club.name, pageTitle: 'Attendance Record — Warnings' });
    p.drawText(`⚠ ${missing.length} attendee(s) are missing required fields.`, { x: MARGIN, y: A4.height - MARGIN - 90, size: 12, font: medium, color: rgb(0.85, 0.4, 0.1) });
    p.drawText('UMSU may reject this record. Affected rows:', { x: MARGIN, y: A4.height - MARGIN - 108, size: 10, font: regular, color: MUTED });
    let y = A4.height - MARGIN - 130;
    for (const m of missing.slice(0, 30)) {
      p.drawText(`Row ${m._idx}:  ${m.full_name || '—'}  ·  student#: ${m.student_number || '—'}  ·  course: ${m.course || '—'}`, { x: MARGIN, y, size: 9, font: regular, color: TEXT });
      y -= 14;
    }
    drawFooter(p, fonts, { pageNum: 1, totalPages: totalPages + 1, attendees: sorted.length, generatedAt });
  }

  if (sorted.length === 0) {
    const p = pdf.addPage([A4.width, A4.height]);
    drawHeader(p, fonts, { eventTitle: event.title, eventDate, location: event.location_name, clubName: club.name, pageTitle: 'Event Attendance Record' });
    p.drawText('No attendees recorded.', { x: MARGIN, y: A4.height / 2, size: 12, font: regular, color: MUTED });
    drawFooter(p, fonts, { pageNum: 1 + extraPagesBefore, totalPages: 1 + extraPagesBefore, attendees: 0, generatedAt });
  } else {
    for (let pageNum = 0; pageNum < totalPages; pageNum++) {
      const p = pdf.addPage([A4.width, A4.height]);
      drawHeader(p, fonts, { eventTitle: event.title, eventDate, location: event.location_name, clubName: club.name, pageTitle: 'Event Attendance Record' });
      // Table header
      const colX = [MARGIN, MARGIN + 28, MARGIN + 170, MARGIN + 270, MARGIN + 400, MARGIN + 470];
      const headerY = A4.height - MARGIN - 80;
      const headers = ['#', 'Full name', 'Student #', 'Course', 'University', 'Arrival'];
      headers.forEach((h, i) => p.drawText(h, { x: colX[i], y: headerY, size: 9, font: medium, color: TEXT }));
      p.drawLine({ start: { x: MARGIN, y: headerY - 6 }, end: { x: A4.width - MARGIN, y: headerY - 6 }, thickness: 0.5, color: LINE });
      let y = headerY - 22;
      const start = pageNum * rowsPerPage;
      const slice = sorted.slice(start, start + rowsPerPage);
      slice.forEach((c, idx) => {
        const row = [
          String(start + idx + 1),
          clipText(regular, c.full_name, 9, colX[2] - colX[1]),
          c.student_number || '—',
          clipText(regular, c.course || '—', 9, colX[4] - colX[3]),
          clipText(regular, c.university || '—', 9, colX[5] - colX[4]),
          arrivalTimeLocal(c.checked_in_at),
        ];
        row.forEach((cell, i) => p.drawText(cell, { x: colX[i], y, size: 9, font: regular, color: TEXT }));
        y -= 18;
      });
      drawFooter(p, fonts, { pageNum: pageNum + 1 + extraPagesBefore, totalPages: totalPages + extraPagesBefore, attendees: sorted.length, generatedAt });
    }
  }

  // Compliance footer note on last page
  const pages = pdf.getPages();
  const last = pages[pages.length - 1];
  last.drawText('This electronic attendance record contains the name, student number, course, and timestamp of arrival', { x: MARGIN, y: MARGIN + 8, size: 7, font: regular, color: MUTED });
  last.drawText('for each attendee, in accordance with UMSU C&S Club Events Guide.', { x: MARGIN, y: MARGIN, size: 7, font: regular, color: MUTED });

  const bytes = await pdf.save();
  if (returnBytes) return bytes;
  const filename = `${club.slug}_${event.starts_at.slice(0, 10)}_attendance.pdf`;
  downloadBlob(bytes, filename);
  return bytes;
}

export async function generateAcquittalPack({ event, club, checkIns, photos, receipts, afpOverrides, treasurerName, generatedByEmail }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const medium = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, medium };
  const generatedAt = new Date().toLocaleString('en-AU', { timeZone: MEL_TZ });

  // 1. Cover page
  const cover = pdf.addPage([A4.width, A4.height]);
  cover.drawText('Acquittal Pack', { x: MARGIN, y: A4.height - MARGIN - 20, size: 20, font: medium, color: TEXT });
  cover.drawText(event.title, { x: MARGIN, y: A4.height - MARGIN - 50, size: 16, font: medium, color: TEXT });
  cover.drawText(`${formatDate(event.starts_at)} · ${event.location_name}`, { x: MARGIN, y: A4.height - MARGIN - 70, size: 10, font: regular, color: MUTED });
  cover.drawText(club.name + ' · ' + (club.union_name || 'UMSU'), { x: MARGIN, y: A4.height - MARGIN - 86, size: 10, font: regular, color: MUTED });

  let y = A4.height - MARGIN - 130;
  const line = (k, v) => {
    cover.drawText(k, { x: MARGIN, y, size: 9, font: regular, color: MUTED });
    cover.drawText(v, { x: MARGIN + 140, y, size: 10, font: regular, color: TEXT });
    y -= 18;
  };
  if (event.is_grant_funded) {
    line('Grant category', event.grant_category || '—');
    line('Grant amount', formatMoneyCents(event.grant_amount_cents));
  }
  line('Attendees', String(checkIns.length));
  line('Receipts', String(receipts.length));
  line('Total receipts', formatMoneyCents(receipts.reduce((s, r) => s + (r.amount_cents || 0), 0)));
  line('Photos', String(photos.length));
  line('Generated by', generatedByEmail || '—');
  line('Generated at', generatedAt);

  // 2. AFP (only if grant-funded)
  if (event.is_grant_funded) {
    const afp = pdf.addPage([A4.width, A4.height]);
    drawHeader(afp, fonts, { eventTitle: event.title, eventDate: formatDate(event.starts_at), location: event.location_name, clubName: club.name, pageTitle: 'Application for Payment' });
    let ay = A4.height - MARGIN - 90;
    const afpLine = (k, v) => {
      afp.drawText(k, { x: MARGIN, y: ay, size: 9, font: regular, color: MUTED });
      afp.drawText(String(v || '—'), { x: MARGIN + 180, y: ay, size: 10, font: regular, color: TEXT });
      ay -= 18;
    };
    afpLine('Club name', afpOverrides.club_name || club.name);
    afpLine('Affiliation code', afpOverrides.umsu_affiliation_code || club.umsu_affiliation_code || '—');
    afpLine('Event name', afpOverrides.event_title || event.title);
    afpLine('Event date', formatDate(event.starts_at));
    afpLine('Event location', afpOverrides.event_location || event.location_name);
    afpLine('Grant category', afpOverrides.grant_category || event.grant_category);
    afpLine('Amount claimed', formatMoneyCents(afpOverrides.amount_cents ?? event.grant_amount_cents));
    afpLine('Treasurer name', treasurerName || '—');
    afpLine('Treasurer email', club.treasurer_email || club.primary_contact_email);
    ay -= 12;
    afp.drawText('Itemised receipts', { x: MARGIN, y: ay, size: 10, font: medium, color: TEXT });
    ay -= 6;
    afp.drawLine({ start: { x: MARGIN, y: ay }, end: { x: A4.width - MARGIN, y: ay }, thickness: 0.5, color: LINE });
    ay -= 14;
    for (const r of receipts) {
      afp.drawText(clipText(regular, r.description, 9, 320), { x: MARGIN, y: ay, size: 9, font: regular, color: TEXT });
      afp.drawText(r.purchase_date || '—', { x: MARGIN + 330, y: ay, size: 9, font: regular, color: MUTED });
      afp.drawText(formatMoneyCents(r.amount_cents), { x: A4.width - MARGIN - 60, y: ay, size: 9, font: regular, color: TEXT });
      ay -= 14;
      if (ay < MARGIN + 30) break;
    }
    ay -= 6;
    afp.drawLine({ start: { x: MARGIN, y: ay }, end: { x: A4.width - MARGIN, y: ay }, thickness: 0.5, color: LINE });
    ay -= 14;
    afp.drawText('Total', { x: MARGIN, y: ay, size: 10, font: medium, color: TEXT });
    afp.drawText(formatMoneyCents(receipts.reduce((s, r) => s + (r.amount_cents || 0), 0)), { x: A4.width - MARGIN - 60, y: ay, size: 10, font: medium, color: TEXT });
    ay -= 30;
    afp.drawText('Bank details to be completed manually by treasurer before submission.', { x: MARGIN, y: ay, size: 8, font: regular, color: MUTED });
  }

  // 3. Attendance pages — re-generate inline using same helper
  const attendanceBytes = await generateAttendancePdf({ event, club, checkIns, returnBytes: true });
  const attendancePdf = await PDFDocument.load(attendanceBytes);
  const copiedAttendance = await pdf.copyPages(attendancePdf, attendancePdf.getPageIndices());
  copiedAttendance.forEach((p) => pdf.addPage(p));

  // 4. Photos — one per page
  for (const photo of photos) {
    const imgBytes = await fetchPng(photo.file_url);
    if (!imgBytes) continue;
    let img;
    try { img = await pdf.embedJpg(imgBytes); } catch { try { img = await pdf.embedPng(imgBytes); } catch { continue; } }
    const page = pdf.addPage([A4.width, A4.height]);
    drawHeader(page, fonts, { eventTitle: event.title, eventDate: formatDate(event.starts_at), location: event.location_name, clubName: club.name, pageTitle: 'Photo' });
    const maxW = A4.width - 2 * MARGIN;
    const maxH = A4.height - 2 * MARGIN - 100;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: (A4.width - w) / 2, y: MARGIN + 30, width: w, height: h });
    if (photo.caption) page.drawText(clipText(regular, photo.caption, 9, A4.width - 2 * MARGIN), { x: MARGIN, y: MARGIN + 16, size: 9, font: regular, color: MUTED });
  }

  // 5. Receipts — one per page with header strip
  for (const r of receipts) {
    const page = pdf.addPage([A4.width, A4.height]);
    drawHeader(page, fonts, { eventTitle: event.title, eventDate: formatDate(event.starts_at), location: event.location_name, clubName: club.name, pageTitle: 'Receipt' });
    page.drawText(clipText(regular, r.description, 10, A4.width - 2 * MARGIN), { x: MARGIN, y: A4.height - MARGIN - 80, size: 11, font: medium, color: TEXT });
    page.drawText(`${formatMoneyCents(r.amount_cents)}  ·  ${r.purchase_date || ''}  ·  ${r.vendor_name || ''}`, { x: MARGIN, y: A4.height - MARGIN - 96, size: 9, font: regular, color: MUTED });
    const imgBytes = await fetchPng(r.file_url);
    if (imgBytes) {
      let img;
      try { img = await pdf.embedJpg(imgBytes); } catch { try { img = await pdf.embedPng(imgBytes); } catch { img = null; } }
      if (img) {
        const maxW = A4.width - 2 * MARGIN;
        const maxH = A4.height - 2 * MARGIN - 130;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: (A4.width - w) / 2, y: MARGIN + 30, width: w, height: h });
      } else {
        page.drawText('(receipt is a PDF — view original file)', { x: MARGIN, y: A4.height / 2, size: 9, font: regular, color: MUTED });
      }
    }
  }

  const bytes = await pdf.save();
  return bytes;
}

export { downloadBlob };