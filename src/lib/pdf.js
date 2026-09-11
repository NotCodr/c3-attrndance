// Grant pack and attendance record PDFs.
//
// Laid out as an administrative document for the student union: one summary page
// with everything a reviewer checks first, then the evidence behind it. The old
// version spent a page per photo and a page per receipt and ran to fourteen
// pages for a single trivia night; this is usually four or five.
//
// Two things here exist because the naive approach fails in practice.
//
// Text. The PDF standard fonts only encode Western European characters, and
// pdf-lib throws on anything else, so one attendee called Nguyễn, 王小明 or
// Łukasz used to stop the whole pack from generating. Anything Helvetica cannot
// encode is typeset by the browser instead -- which has real fonts and shaping
// for every script -- and placed as a high-resolution image. Everything else
// stays selectable text.
//
// Images. Phone photos carry EXIF rotation that pdf-lib ignores, WebP cannot be
// embedded at all, and a 12-megapixel original makes for a very large PDF. All
// images are decoded by the browser, rotated upright, scaled to a sensible size
// and re-encoded before embedding. Receipts uploaded as PDFs are embedded as
// pages rather than replaced with a note.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { formatTime, formatMoneyCents, MEL_TZ } from '@/lib/format';

const PAGE = { w: 595.28, h: 841.89 };
const M = 50;
const W = PAGE.w - M * 2;

const C = {
  ink: rgb(0.1, 0.1, 0.12),
  body: rgb(0.22, 0.22, 0.25),
  muted: rgb(0.44, 0.44, 0.49),
  faint: rgb(0.6, 0.6, 0.64),
  rule: rgb(0.8, 0.8, 0.83),
  hair: rgb(0.89, 0.89, 0.91),
  zebra: rgb(0.968, 0.968, 0.975),
  panel: rgb(0.955, 0.955, 0.966),
};

// ---------------------------------------------------------------- environment --
// The browser supplies text rasterising and image decoding. Anything else (the
// test harness) can pass its own implementations as `env`.

let measureCtx = null;

/** Decodes an image upright, whatever its EXIF says, or returns null. */
async function decode(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    // Older Safari rejects the options bag; an <img> applies EXIF by default.
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const FONT_STACK =
  '"Helvetica Neue", Helvetica, Arial, "Segoe UI", "Noto Sans", "PingFang SC", ' +
  '"Hiragino Sans", "Microsoft YaHei", "Noto Sans CJK SC", "Malgun Gothic", ' +
  '"Nirmala UI", "Noto Sans Devanagari", sans-serif';

const cssFont = (sizePx, bold) => `${bold ? 700 : 400} ${sizePx}px ${FONT_STACK}`;

const browserEnv = {
  measure(text, sizePt, bold) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = cssFont(sizePt, bold);
    return measureCtx.measureText(text).width;
  },

  async rasterise(text, sizePt, bold, colour) {
    const scale = 4;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = cssFont(sizePt * scale, bold);
    const width = Math.ceil(probe.measureText(text).width) + 4;
    const height = Math.ceil(sizePt * scale * 1.55);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.font = cssFont(sizePt * scale, bold);
    ctx.fillStyle = colour;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, 2, Math.round(sizePt * scale * 1.15));
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      widthPt: width / scale,
      heightPt: height / scale,
      ascentPt: Math.round(sizePt * scale * 1.15) / scale,
      padPt: 2 / scale,
    };
  },

  async loadImage(url, maxPx) {
    if (!url) return { kind: 'missing' };
    let blob;
    try {
      const res = await fetch(url);
      if (!res.ok) return { kind: 'missing' };
      blob = await res.blob();
    } catch {
      return { kind: 'missing' };
    }
    const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) === '%PDF-') {
      return { kind: 'pdf', bytes: new Uint8Array(await blob.arrayBuffer()) };
    }
    const bitmap = await decode(blob);
    // HEIC outside Safari, or a corrupt file.
    if (!bitmap) return { kind: 'unsupported' };
    const s = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * s));
    canvas.height = Math.max(1, Math.round(bitmap.height * s));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const out = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.84));
    return { kind: 'jpg', bytes: new Uint8Array(await out.arrayBuffer()), width: canvas.width, height: canvas.height };
  },
};

// ------------------------------------------------------------------- values --

const clean = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const money = (cents) => (cents == null ? 'Not set' : clean(formatMoneyCents(cents)));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const melDate = (value, opts) => clean(new Date(value).toLocaleDateString('en-AU', { timeZone: MEL_TZ, ...opts }));
const longDate = (value) => melDate(value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (value) => melDate(value, { day: 'numeric', month: 'short', year: 'numeric' });
const clock = (value) => clean(formatTime(value));

// Receipt dates are bare calendar dates. Read at midday so no timezone can move
// them to the day before.
const calendarDate = (d) => (d ? shortDate(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00Z` : d) : '');

function whenLine(ev) {
  if (!ev.ends_at) return `${longDate(ev.starts_at)}, ${clock(ev.starts_at)}`;
  if (shortDate(ev.starts_at) === shortDate(ev.ends_at)) {
    return `${longDate(ev.starts_at)}, ${clock(ev.starts_at)} to ${clock(ev.ends_at)}`;
  }
  return `${longDate(ev.starts_at)}, ${clock(ev.starts_at)} to ${longDate(ev.ends_at)}, ${clock(ev.ends_at)}`;
}

const cssColour = (c) => `rgb(${Math.round(c.red * 255)}, ${Math.round(c.green * 255)}, ${Math.round(c.blue * 255)})`;

// --------------------------------------------------------------------- text --

function makeWriter(pdf, fonts, env) {
  const encodable = new Map();
  const rendered = new Map();
  const fontFor = (bold) => (bold ? fonts.bold : fonts.regular);

  const canEncode = (str) => {
    let ok = encodable.get(str);
    if (ok === undefined) {
      try { fonts.regular.encodeText(str); ok = true; } catch { ok = false; }
      encodable.set(str, ok);
    }
    return ok;
  };

  const width = (str, size, bold) =>
    (canEncode(str) ? fontFor(bold).widthOfTextAtSize(str, size) : env.measure(str, size, bold));

  // The longest prefix that fits, with an ellipsis. Works on code points so a
  // name is never cut through the middle of a character.
  const fit = (value, size, bold, max) => {
    const str = clean(value);
    if (!max || width(str, size, bold) <= max) return str;
    const chars = Array.from(str);
    let lo = 0;
    let hi = chars.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (width(`${chars.slice(0, mid).join('').trimEnd()}…`, size, bold) <= max) lo = mid;
      else hi = mid - 1;
    }
    return `${chars.slice(0, lo).join('').trimEnd()}…`;
  };

  const wrap = (value, size, bold, max) => {
    const lines = [];
    let line = '';
    for (const word of clean(value).split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (!line || width(next, size, bold) <= max) line = next;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines.map((l) => fit(l, size, bold, max));
  };

  /** Draws one line at baseline `y` and returns its width. */
  const draw = async (page, value, x, y, { size = 9, bold = false, color = C.body, max, align = 'left' } = {}) => {
    const str = fit(value, size, bold, max);
    if (!str) return 0;
    const w = width(str, size, bold);
    const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    if (canEncode(str)) {
      page.drawText(str, { x: left, y, size, font: fontFor(bold), color });
      return w;
    }
    const key = `${size}|${bold}|${cssColour(color)}|${str}`;
    let img = rendered.get(key);
    if (!img) {
      const r = await env.rasterise(str, size, bold, cssColour(color));
      img = { ...r, embedded: await pdf.embedPng(r.bytes) };
      rendered.set(key, img);
    }
    page.drawImage(img.embedded, {
      x: left - img.padPt,
      y: y - (img.heightPt - img.ascentPt),
      width: img.widthPt,
      height: img.heightPt,
    });
    return w;
  };

  return { draw, width, fit, wrap };
}

// ------------------------------------------------------------------- images --

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Something loaded by env.loadImage, as one visual per page of evidence. */
async function embedEvidence(pdf, got) {
  if (got.kind === 'jpg') {
    try {
      return [{ kind: 'image', obj: await pdf.embedJpg(got.bytes) }];
    } catch {
      return [{ kind: 'unsupported' }];
    }
  }
  if (got.kind === 'pdf') {
    try {
      const src = await PDFDocument.load(got.bytes, { ignoreEncryption: true });
      const total = src.getPageCount();
      const shown = Math.min(total, 4);
      if (!shown) return [{ kind: 'unsupported' }];
      const pages = await pdf.embedPdf(src, Array.from({ length: shown }, (_, i) => i));
      return pages.map((obj, i) => ({ kind: 'page', obj, part: total > 1 ? `page ${i + 1} of ${total}` : '' }));
    } catch {
      return [{ kind: 'unsupported' }];
    }
  }
  return [{ kind: got.kind }];
}

// ------------------------------------------------------------------- layout --

const CONTENT_TOP = PAGE.h - 76;
const BOTTOM = 66;

async function createDoc({ event, club, env, title, clubName, eventTitle, venue, affiliationCode }) {
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const t = makeWriter(pdf, fonts, env);
  return { pdf, t, env, pages: [], event, club, title, clubName, eventTitle, venue, affiliationCode };
}

function addPage(doc, section) {
  const page = doc.pdf.addPage([PAGE.w, PAGE.h]);
  doc.pages.push({ page, section });
  return page;
}

/** Any page after the first carries a quiet running header: whose, and what. */
async function nextPage(doc, section) {
  const page = addPage(doc, section);
  const y = PAGE.h - 42;
  const w = await doc.t.draw(page, doc.clubName, M, y, { size: 8, bold: true, color: C.ink, max: W * 0.35 });
  await doc.t.draw(page, `·  ${doc.eventTitle}, ${shortDate(doc.event.starts_at)}`, M + w + 4, y,
    { size: 8, color: C.muted, max: W - w - 130 });
  await doc.t.draw(page, section, PAGE.w - M, y, { size: 8, color: C.muted, align: 'right' });
  page.drawLine({ start: { x: M, y: y - 8 }, end: { x: PAGE.w - M, y: y - 8 }, thickness: 0.5, color: C.rule });
  return { page, y: CONTENT_TOP };
}

async function footers(doc) {
  const n = doc.pages.length;
  for (let i = 0; i < n; i++) {
    const { page } = doc.pages[i];
    page.drawLine({ start: { x: M, y: 48 }, end: { x: PAGE.w - M, y: 48 }, thickness: 0.5, color: C.hair });
    await doc.t.draw(page, `${doc.clubName}  ·  ${doc.title}  ·  ${doc.eventTitle}`, M, 36,
      { size: 7.5, color: C.faint, max: W - 80 });
    await doc.t.draw(page, `Page ${i + 1} of ${n}`, PAGE.w - M, 36, { size: 7.5, color: C.muted, align: 'right' });
  }
}

/** The top of the first page: the club, its affiliation, and what this document is. */
async function letterhead(doc, page, right = []) {
  const { t, club } = doc;
  const top = PAGE.h - 52;
  const union = clean(club.union_name) || 'UMSU';
  const sub = [`${union} affiliated club`, doc.affiliationCode && `Affiliation code ${doc.affiliationCode}`]
    .filter(Boolean).join('   ·   ');
  await t.draw(page, doc.clubName, M, top - 16, { size: 19, bold: true, color: C.ink, max: W - 170 });
  await t.draw(page, sub, M, top - 32, { size: 9, color: C.muted, max: W - 170 });
  await t.draw(page, doc.title, PAGE.w - M, top - 12, { size: 10.5, bold: true, color: C.ink, align: 'right' });
  let ry = top - 26;
  for (const line of right) {
    await t.draw(page, line, PAGE.w - M, ry, { size: 8.5, color: C.muted, align: 'right' });
    ry -= 12;
  }
  const ruleY = top - 46;
  page.drawLine({ start: { x: M, y: ruleY }, end: { x: PAGE.w - M, y: ruleY }, thickness: 1.25, color: C.ink });
  return ruleY;
}

async function eventBlock(doc, page, y) {
  const { t, event } = doc;
  y -= 30;
  await t.draw(page, doc.eventTitle, M, y, { size: 15, bold: true, color: C.ink, max: W });
  y -= 18;
  await t.draw(page, whenLine(event), M, y, { size: 10, color: C.body, max: W });
  if (doc.venue) {
    y -= 14;
    await t.draw(page, doc.venue, M, y, { size: 10, color: C.body, max: W });
  }
  const address = clean(event.location_address);
  if (address && address.toLowerCase() !== doc.venue.toLowerCase()) {
    y -= 13;
    await t.draw(page, address, M, y, { size: 9, color: C.muted, max: W });
  }
  return y;
}

async function heading(doc, page, text, y, x = M, width = W) {
  await doc.t.draw(page, text, x, y, { size: 10.5, bold: true, color: C.ink, max: width });
  page.drawLine({ start: { x, y: y - 7 }, end: { x: x + width, y: y - 7 }, thickness: 0.5, color: C.rule });
  return y - 7;
}

async function paragraph(doc, page, text, y, { size = 9, color = C.body, x = M, width = W, leading = 13 } = {}) {
  for (const line of doc.t.wrap(text, size, false, width)) {
    await doc.t.draw(page, line, x, y, { size, color });
    y -= leading;
  }
  return y;
}

/**
 * A table that runs onto further pages, repeating its header row. A cell is a
 * string or { text, color, bold }.
 */
async function table(doc, { page, y, columns, rows, section, rowH = 15, size = 8.5, zebra = false, rules = false, empty }) {
  const { t } = doc;
  const header = async () => {
    let x = M;
    for (const col of columns) {
      const ax = col.align === 'right' ? x + col.w - 5 : x + 5;
      await t.draw(page, col.label, ax, y - 11, { size: 7.5, bold: true, color: C.muted, align: col.align, max: col.w - 10 });
      x += col.w;
    }
    y -= 16;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: C.rule });
  };

  await header();
  if (!rows.length && empty) {
    await t.draw(page, empty, M + 5, y - rowH / 2 - size * 0.36, { size, color: C.muted });
    y -= rowH;
  }
  for (let r = 0; r < rows.length; r++) {
    if (y - rowH < BOTTOM) {
      ({ page, y } = await nextPage(doc, section));
      await header();
    }
    if (zebra && r % 2 === 1) page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: C.zebra });
    const base = y - rowH / 2 - size * 0.36;
    let x = M;
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const cell = rows[r][c];
      const spec = cell && typeof cell === 'object' ? cell : { text: cell };
      const ax = col.align === 'right' ? x + col.w - 5 : x + 5;
      await t.draw(page, spec.text ?? '', ax, base,
        { size, bold: !!spec.bold, color: spec.color || C.ink, align: col.align, max: col.w - 10 });
      x += col.w;
    }
    y -= rowH;
    if (rules) page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.4, color: C.hair });
  }
  return { page, y };
}

// --------------------------------------------------------------- attendance --

const METHOD_PHRASES = {
  qr_scan: (n) => `${n} scanned their ticket`,
  manual_lookup: (n) => `${n} ${n === 1 ? 'was' : 'were'} found on the RSVP list`,
  walk_in_add: (n) => `${n} ${n === 1 ? 'was' : 'were'} added at the door`,
};

const joinList = (parts) =>
  (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

function attendanceIntro(list) {
  if (!list.length) return 'No one checked in to this event.';
  const first = clock(list[0].checked_in_at);
  const last = clock(list[list.length - 1].checked_in_at);
  let s = `${plural(list.length, 'person', 'people')} checked in ${first === last ? `at ${first}` : `between ${first} and ${last}`}`;

  const counts = {};
  for (const a of list) if (METHOD_PHRASES[a.method]) counts[a.method] = (counts[a.method] || 0) + 1;
  const methods = Object.keys(counts);
  if (methods.length === 1 && methods[0] === 'qr_scan' && counts.qr_scan === list.length) {
    s += ', all by scanning their ticket.';
  } else if (methods.length) {
    s += ` (${joinList(methods.map((m) => METHOD_PHRASES[m](counts[m])))}).`;
  } else {
    s += '.';
  }

  const noNumber = list.filter((a) => !clean(a.student_number)).length;
  if (noNumber === list.length) s += ' None of them gave a student number.';
  else if (noNumber) s += ` ${plural(noNumber, 'person', 'people')} did not give a student number.`;
  return s;
}

const UNI_LABELS = { unimelb: 'UniMelb', other: 'Other' };
const uniLabel = (u) => UNI_LABELS[clean(u).toLowerCase()] || clean(u);

async function attendance(doc, { page, y }, attendees, { withTitle = true } = {}) {
  const { t, club } = doc;
  if (withTitle) {
    await t.draw(page, 'Attendance record', M, y - 4, { size: 14, bold: true, color: C.ink });
    y -= 24;
  }
  y = await paragraph(doc, page, attendanceIntro(attendees), y);
  if (!attendees.length) return { page, y };
  y -= 6;

  // A university column only earns its space when someone came from elsewhere.
  const home = clean(club.university || 'unimelb').toLowerCase();
  const showUni = attendees.some((a) => clean(a.university) && clean(a.university).toLowerCase() !== home);
  const columns = showUni
    ? [{ label: 'No.', w: 30 }, { label: 'Name', w: 134 }, { label: 'Student no.', w: 70 },
      { label: 'Course', w: 136 }, { label: 'University', w: 72 }, { label: 'Arrived', w: 53, align: 'right' }]
    : [{ label: 'No.', w: 30 }, { label: 'Name', w: 152 }, { label: 'Student no.', w: 76 },
      { label: 'Course', w: 182 }, { label: 'Arrived', w: 55, align: 'right' }];
  const none = { text: 'not given', color: C.faint };

  const rows = attendees.map((a, i) => [
    { text: String(i + 1), color: C.muted },
    a.full_name,
    clean(a.student_number) || none,
    clean(a.course) || none,
    ...(showUni ? [uniLabel(a.university) || none] : []),
    clock(a.checked_in_at),
  ]);
  ({ page, y } = await table(doc, { page, y, columns, rows, section: 'Attendance record', rowH: 14.5, zebra: true }));

  if ((clean(club.union_name) || 'UMSU') === 'UMSU' && attendees.length) {
    if (y - 30 < BOTTOM) ({ page, y } = await nextPage(doc, 'Attendance record'));
    y = await paragraph(doc, page,
      'Recorded electronically at the event. Each attendee is listed with their name, student number, course and arrival time, as set out in the UMSU C&S Club Events Guide.',
      y - 16, { size: 7.5, color: C.muted, leading: 10 });
  }
  return { page, y };
}

// ----------------------------------------------------------------- evidence --

/** Fits a visual into `box`, centred and top-aligned. Returns where it landed. */
function placeVisual(page, visual, box, border) {
  const { obj } = visual;
  const s = Math.min(box.w / obj.width, box.h / obj.height);
  const rect = { w: obj.width * s, h: obj.height * s };
  rect.x = box.x + (box.w - rect.w) / 2;
  rect.y = box.y + box.h - rect.h;
  const at = { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
  if (visual.kind === 'page') page.drawPage(obj, at);
  else page.drawImage(obj, at);
  if (border) page.drawRectangle({ ...at, borderColor: C.rule, borderWidth: 0.5 });
  return rect;
}

const UNAVAILABLE = {
  missing: 'This file could not be loaded, so it is not shown here. The original is stored in connect3.',
  unsupported: 'This file type could not be included. The original is stored in connect3.',
};

async function placeholder(doc, page, box, kind) {
  const h = Math.min(box.h, 64);
  const rect = { x: box.x, y: box.y + box.h - h, w: box.w, h };
  page.drawRectangle({ x: rect.x, y: rect.y, width: rect.w, height: rect.h, color: C.panel });
  await paragraph(doc, page, UNAVAILABLE[kind] || UNAVAILABLE.missing, rect.y + h - 22,
    { size: 8, color: C.muted, x: box.x + 10, width: box.w - 20, leading: 11 });
  return rect;
}

/**
 * Evidence laid out `cols` x `rows` to a page, on as many pages as it takes.
 * Returns the page number the section starts on.
 */
async function evidenceGrid(doc, { section, intro, cells, cols, rows, border, headH = 0, captionH = 0, drawHead, drawCaption }) {
  const gapX = 18;
  const gapY = 22;
  const cellW = (W - gapX * (cols - 1)) / cols;

  let { page, y } = await nextPage(doc, section);
  const start = doc.pages.length;
  await doc.t.draw(page, section, M, y - 4, { size: 14, bold: true, color: C.ink });
  y = await paragraph(doc, page, intro, y - 24);
  y -= 8;
  const cellH = (y - BOTTOM - gapY * (rows - 1)) / rows;

  let col = 0;
  for (const cell of cells) {
    if (col === 0 && y - cellH < BOTTOM - 0.5) ({ page, y } = await nextPage(doc, section));
    const x = M + col * (cellW + gapX);
    if (drawHead) await drawHead(page, cell, x, y, cellW);
    const box = { x, y: y - cellH + captionH, w: cellW, h: cellH - headH - captionH };
    const rect = cell.visual.obj
      ? placeVisual(page, cell.visual, box, border)
      : await placeholder(doc, page, box, cell.visual.kind);
    if (drawCaption) await drawCaption(page, cell, rect);
    col = (col + 1) % cols;
    if (col === 0) y -= cellH + gapY;
  }
  return start;
}

// --------------------------------------------------------------------- pack --

/**
 * The grant acquittal (or, for an event without a grant, an event report).
 *
 * Page 1 is everything a reviewer checks first: the club, the event, the money,
 * and who to call. The attendance record, receipts and photos follow as
 * numbered evidence.
 */
export async function generateAcquittalPack({
  event, club, checkIns = [], photos = [], receipts = [],
  afpOverrides = {}, preparedBy = null, version = null, generatedAt = new Date(), env = browserEnv,
}) {
  const grant = !!event.is_grant_funded;
  const doc = await createDoc({
    event, club, env,
    title: grant ? 'Grant acquittal' : 'Event report',
    clubName: clean(afpOverrides.club_name) || clean(club.name),
    eventTitle: clean(afpOverrides.event_title) || clean(event.title),
    venue: clean(afpOverrides.event_location) || clean(event.location_name),
    affiliationCode: clean(afpOverrides.umsu_affiliation_code ?? club.umsu_affiliation_code),
  });
  const { t } = doc;

  const attendees = [...checkIns].sort((a, b) => new Date(a.checked_in_at) - new Date(b.checked_in_at));
  const spent = receipts.reduce((s, r) => s + (r.amount_cents || 0), 0);
  const approved = event.grant_amount_cents ?? null;
  const override = afpOverrides.amount_cents;
  const claimed = override != null && override !== ''
    ? Number(override)
    : approved != null ? Math.min(spent, approved) : spent;
  const category = clean(afpOverrides.grant_category) || clean(event.grant_category);
  const contact = {
    name: clean(event.contact_name) || clean(preparedBy?.name),
    email: clean(event.contact_email) || clean(preparedBy?.email),
    phone: clean(event.contact_phone) || clean(preparedBy?.phone),
  };

  // Fetch and decode every file in parallel up front, then embed in order.
  const [receiptFiles, photoFiles] = await Promise.all([
    pool(receipts, 4, (r) => env.loadImage(r.file_url, 1500)),
    pool(photos, 4, (p) => env.loadImage(p.file_url, 1100)),
  ]);
  const receiptArt = [];
  for (const f of receiptFiles) receiptArt.push(await embedEvidence(doc.pdf, f));
  const photoArt = [];
  for (const f of photoFiles) photoArt.push(await embedEvidence(doc.pdf, f));

  // ---- Page 1: summary.
  let page = addPage(doc, 'Summary');
  let y = await letterhead(doc, page,
    [version ? `Version ${version}` : null, `Prepared ${shortDate(generatedAt)}`].filter(Boolean));
  y = await eventBlock(doc, page, y);

  const facts = grant
    ? [['Grant category', category || 'Not set'], ['Attendees', String(attendees.length)],
      ['Grant approved', money(approved)], ['Total spent', money(spent)], ['Amount claimed', money(claimed)]]
    : [['Attendees', String(attendees.length)], ['Receipts', String(receipts.length)], ['Total spent', money(spent)]];
  y -= 22;
  const panelH = 46;
  page.drawRectangle({ x: M, y: y - panelH, width: W, height: panelH, color: C.panel });
  const factW = W / facts.length;
  for (let i = 0; i < facts.length; i++) {
    const x = M + 12 + i * factW;
    await t.draw(page, facts[i][0], x, y - 17, { size: 7.5, color: C.muted, max: factW - 18 });
    await t.draw(page, facts[i][1], x, y - 35, { size: 12, bold: true, color: C.ink, max: factW - 18 });
  }
  y -= panelH;

  // Who UMSU should call, beside what is enclosed. Placed above the
  // expenditure so a long list of receipts runs on without stranding it.
  const half = (W - 28) / 2;
  const x2 = M + half + 28;
  const contactRows = [['Name', contact.name], ['Email', contact.email], ['Phone', contact.phone]];
  const clubEmail = clean(club.primary_contact_email);
  if (clubEmail && clubEmail.toLowerCase() !== contact.email.toLowerCase()) contactRows.push(['Club email', clubEmail]);
  const preparer = clean(preparedBy?.name) || clean(preparedBy?.email);
  if (preparer && clean(preparedBy?.email).toLowerCase() !== contact.email.toLowerCase()) {
    contactRows.push(['Prepared by', preparer]);
  }
  const enclosed = 2 + (receipts.length ? 1 : 0) + (photos.length ? 1 : 0);
  y -= 32;
  await heading(doc, page, grant ? 'Contact for this application' : 'Contact', y, M, half);
  await heading(doc, page, 'In this pack', y, x2, half);
  const contents = { page, y: y - 7 };
  let cy = y - 7;
  for (const [label, value] of contactRows) {
    cy -= 16;
    await t.draw(page, label, M, cy, { size: 8.5, color: C.muted });
    await t.draw(page, value || 'Not provided', M + 64, cy, { size: 9, color: value ? C.ink : C.muted, max: half - 64 });
  }
  y = Math.min(cy, y - 7 - 16 * enclosed);

  // Numbered to match the receipts later in the pack.
  y = await heading(doc, page, 'Expenditure', y - 32);
  const columns = [
    { label: 'No.', w: 30 }, { label: 'Item', w: 183 }, { label: 'Supplier', w: 130 },
    { label: 'Date', w: 76 }, { label: 'Amount', w: 76, align: 'right' },
  ];
  ({ page, y } = await table(doc, {
    page, y, columns, section: 'Summary', rowH: 18, size: 9, rules: true,
    rows: receipts.map((r, i) => [
      { text: String(i + 1), color: C.muted }, r.description, clean(r.vendor_name),
      calendarDate(r.purchase_date), money(r.amount_cents),
    ]),
    empty: 'No receipts have been added.',
  }));
  if (receipts.length) {
    if (y - 18 < BOTTOM) ({ page, y } = await nextPage(doc, 'Summary'));
    await t.draw(page, 'Total', M + W - 76 - 5, y - 13, { size: 9, bold: true, color: C.ink, align: 'right' });
    await t.draw(page, money(spent), M + W - 5, y - 13, { size: 9, bold: true, color: C.ink, align: 'right' });
  }

  // ---- The evidence.
  const sections = [['Summary and expenditure', 1]];
  const attendanceStart = doc.pages.length + 1;
  await attendance(doc, await nextPage(doc, 'Attendance record'), attendees);
  sections.push([`Attendance record (${plural(attendees.length, 'person', 'people')})`, attendanceStart]);

  if (receipts.length) {
    const cells = [];
    receipts.forEach((receipt, i) => receiptArt[i].forEach((visual) => cells.push({ visual, receipt, n: i + 1 })));
    const start = await evidenceGrid(doc, {
      section: 'Receipts',
      intro: `${plural(receipts.length, 'receipt')} totalling ${money(spent)}, numbered as in the expenditure table on page 1.`,
      cells, cols: 2, rows: 2, border: true, headH: 32,
      drawHead: async (pg, { receipt: r, n, visual }, x, top, w) => {
        const aw = await t.draw(pg, money(r.amount_cents), x + w, top - 10, { size: 9, bold: true, color: C.ink, align: 'right' });
        await t.draw(pg, String(n), x, top - 10, { size: 9, bold: true, color: C.muted });
        await t.draw(pg, r.description, x + 16, top - 10, { size: 9, bold: true, color: C.ink, max: w - 16 - aw - 10 });
        const sub = [clean(r.vendor_name), calendarDate(r.purchase_date), visual.part].filter(Boolean).join('  ·  ');
        await t.draw(pg, sub, x + 16, top - 22, { size: 8, color: C.muted, max: w - 16 });
      },
    });
    sections.push([`Receipts (${receipts.length})`, start]);
  }

  if (photos.length) {
    const captioned = photos.some((p) => clean(p.caption));
    const cells = photos.map((photo, i) => ({ visual: photoArt[i][0], photo }));
    const start = await evidenceGrid(doc, {
      section: 'Event photos',
      intro: `${plural(photos.length, 'photo')} from the event.`,
      cells, cols: 2, rows: 3, border: false, captionH: captioned ? 14 : 0,
      drawCaption: captioned
        ? (pg, { photo }, rect) => t.draw(pg, photo.caption, rect.x, rect.y - 11, { size: 8, color: C.muted, max: rect.w })
        : null,
    });
    sections.push([`Event photos (${photos.length})`, start]);
  }

  let ky = contents.y;
  for (const [label, n] of sections) {
    ky -= 16;
    await t.draw(contents.page, label, x2, ky, { size: 9, color: C.ink, max: half - 40 });
    await t.draw(contents.page, `p. ${n}`, x2 + half, ky, { size: 9, color: C.muted, align: 'right' });
  }

  await footers(doc);
  return finish(doc);
}

// --------------------------------------------------------------- attendance --

export async function generateAttendancePdf({ event, club, checkIns, returnBytes = false, env = browserEnv }) {
  const doc = await createDoc({
    event, club, env,
    title: 'Attendance record',
    clubName: clean(club.name),
    eventTitle: clean(event.title),
    venue: clean(event.location_name),
    affiliationCode: clean(club.umsu_affiliation_code),
  });
  const page = addPage(doc, 'Attendance record');
  let y = await letterhead(doc, page, [`Prepared ${shortDate(new Date())}`]);
  y = await eventBlock(doc, page, y);
  const attendees = [...checkIns].sort((a, b) => new Date(a.checked_in_at) - new Date(b.checked_in_at));
  await attendance(doc, { page, y: y - 26 }, attendees, { withTitle: false });
  await footers(doc);

  const bytes = await finish(doc);
  if (!returnBytes) downloadBlob(bytes, `${club.slug}-attendance-${eventDay(event)}.pdf`);
  return bytes;
}

// ------------------------------------------------------------------- output --

async function finish(doc) {
  const { pdf } = doc;
  pdf.setTitle(`${doc.title}: ${doc.eventTitle}`, { showInWindowTitleBar: true });
  pdf.setAuthor(doc.clubName);
  pdf.setSubject(`${doc.title} for ${doc.eventTitle}`);
  pdf.setCreator('connect3');
  pdf.setProducer('connect3');
  pdf.setLanguage('en-AU');
  return pdf.save();
}

/** The event's date in Melbourne as YYYY-MM-DD, for file names. */
export function eventDay(event) {
  return new Date(event.starts_at).toLocaleDateString('en-CA', { timeZone: MEL_TZ });
}

export function packFileName(club, event, version) {
  const kind = event.is_grant_funded ? 'grant-acquittal' : 'event-report';
  return `${club.slug}-${kind}-${eventDay(event)}${version ? `-v${version}` : ''}.pdf`;
}

export function downloadBlob(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
