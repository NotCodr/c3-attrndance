// Paints the receipt for the lanyard: the printed front, the back of the paper
// and the strap. Everything is laid out in the design's pixels (a 236px slip)
// and drawn SCALE times larger, so the texture stays sharp up close.

import { RECEIPT_INK, RECEIPT_MUTED, RECEIPT_PAPER } from '@/lib/receipt';

const SCALE = 3;
const W = 236;
const PAD_X = 20;
const MARGIN = 34; // either side, so the sticker can hang over the edge
const TOOTH = 9;
const MONO = '"Space Mono", ui-monospace, Menlo, monospace';
const SANS = 'Inter, system-ui, sans-serif';

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Fonts and images the paper needs, loaded before anything is drawn. */
export async function loadReceiptAssets(model, qrDataUrl) {
  const fonts = document.fonts
    ? Promise.all([
      document.fonts.load(`400 12px ${MONO}`),
      document.fonts.load(`700 12px ${MONO}`),
      document.fonts.load(`600 12px ${SANS}`),
    ]).catch(() => null)
    : null;
  const [logo, paper, sticker, qr] = await Promise.all([
    loadImage('/brand/connect3-logo.png'),
    loadImage('/brand/receipt-paper.webp'),
    loadImage(model.sticker),
    loadImage(model.showQr ? qrDataUrl : null),
    fonts,
  ]);
  return { logo: logo && inkLogo(logo), paper, sticker, qr };
}

/** The logo in grey ink, as the design prints it (grayscale, contrast 1.4, brightness .55). */
function inkLogo(img) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = Math.round((128 * img.naturalHeight) / img.naturalWidth);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const pixels = ctx.getImageData(0, 0, c.width, c.height);
  const px = pixels.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = Math.max(0, Math.min(255, ((lum - 128) * 1.4 + 128) * 0.55));
  }
  ctx.putImageData(pixels, 0, 0);
  return c;
}

// ------------------------------------------------------------------ text --

const setFont = (ctx, size, weight = 400, family = MONO) => { ctx.font = `${weight} ${size}px ${family}`; };

function spacedWidth(ctx, text, spacing) {
  let width = 0;
  let count = 0;
  for (const ch of text) { width += ctx.measureText(ch).width; count++; }
  return width + spacing * Math.max(0, count - 1);
}

/** fillText with letter spacing, which canvas can't do everywhere yet. */
function drawSpaced(ctx, text, x, y, spacing, align = 'left') {
  const width = spacedWidth(ctx, text, spacing);
  let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

function fit(ctx, text, maxWidth, spacing, forceEllipsis = false) {
  if (!forceEllipsis && spacedWidth(ctx, text, spacing) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && spacedWidth(ctx, `${t}…`, spacing) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function wrap(ctx, text, maxWidth, spacing, maxLines) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (!line || spacedWidth(ctx, next, spacing) <= maxWidth) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  const out = lines.slice(0, maxLines).map((l) => fit(ctx, l, maxWidth, spacing));
  if (lines.length > maxLines) out[maxLines - 1] = fit(ctx, lines[maxLines - 1], maxWidth, spacing, true);
  return out;
}

function dotted(ctx, x1, x2, y) {
  ctx.fillStyle = '#B8B0CC';
  for (let x = x1; x <= x2; x += 3) {
    ctx.beginPath();
    ctx.arc(x, y, 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ----------------------------------------------------------------- paper --

function paperPath(ctx, height) {
  ctx.beginPath();
  ctx.moveTo(MARGIN, 0);
  ctx.lineTo(MARGIN + W, 0);
  ctx.lineTo(MARGIN + W, height - TOOTH);
  for (let i = 1; i <= 28; i++) ctx.lineTo(MARGIN + W * (1 - (i * 3.5) / 100), i % 2 ? height : height - TOOTH);
  ctx.lineTo(MARGIN, height);
  ctx.closePath();
}

function paintPaper(ctx, height, paper) {
  ctx.save();
  paperPath(ctx, height);
  ctx.clip();
  ctx.fillStyle = RECEIPT_PAPER;
  ctx.fillRect(MARGIN, 0, W, height);
  if (paper) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = ctx.createPattern(paper, 'repeat');
    ctx.fillRect(MARGIN, 0, W, height);
    ctx.globalCompositeOperation = 'source-over';
  }
  let g = ctx.createLinearGradient(MARGIN, 0, MARGIN + W, 0);
  g.addColorStop(0, 'rgba(21,16,43,.09)');
  g.addColorStop(0.14, 'rgba(21,16,43,0)');
  g.addColorStop(0.84, 'rgba(21,16,43,0)');
  g.addColorStop(1, 'rgba(21,16,43,.10)');
  ctx.fillStyle = g;
  ctx.fillRect(MARGIN, 0, W, height);
  g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, 'rgba(255,255,255,.35)');
  g.addColorStop(0.18, 'rgba(255,255,255,0)');
  g.addColorStop(0.72, 'rgba(21,16,43,0)');
  g.addColorStop(0.9, 'rgba(21,16,43,.06)');
  g.addColorStop(1, 'rgba(21,16,43,.16)');
  ctx.fillStyle = g;
  ctx.fillRect(MARGIN, 0, W, height);
  ctx.restore();
}

function silhouette(img, color) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** The sticker over the top right corner: 74px, turned 12°, with a hard ink shadow. */
function paintSticker(ctx, img, backing = false) {
  const w = 74;
  const h = (74 * img.naturalHeight) / img.naturalWidth;
  ctx.save();
  ctx.translate(MARGIN + W + 24 - w / 2, 18 + h / 2);
  ctx.rotate((12 * Math.PI) / 180);
  if (backing) {
    ctx.drawImage(silhouette(img, '#E9E5DA'), -w / 2, -h / 2, w, h);
  } else {
    ctx.drawImage(silhouette(img, '#15102B'), -w / 2, -h / 2 + 2, w, h);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

// ----------------------------------------------------------------- front --

/** Lays out (and, unless `dry`, prints) the front. Returns the slip's height. */
function printFront(ctx, model, assets, dry) {
  const cx = MARGIN + W / 2;
  const left = MARGIN + PAD_X;
  const right = MARGIN + W - PAD_X;
  const width = W - PAD_X * 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let y = 28;

  if (!dry) {
    ctx.fillStyle = '#15102B';
    ctx.beginPath();
    ctx.arc(cx, 11, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  y += 8;
  if (!dry && assets.logo) ctx.drawImage(assets.logo, cx - 13, y, 26, (26 * assets.logo.height) / assets.logo.width);
  y += 34;
  setFont(ctx, 12, 700);
  ctx.fillStyle = RECEIPT_INK;
  if (!dry) drawSpaced(ctx, 'CONNECT3', cx, y + 9, 3.6, 'center');
  y += 18;

  setFont(ctx, 10);
  ctx.fillStyle = RECEIPT_MUTED;
  if (model.club) {
    y += 4;
    for (const line of wrap(ctx, model.club, width, 1, 2)) {
      if (!dry) drawSpaced(ctx, line, cx, y + 7.5, 1, 'center');
      y += 15;
    }
  }
  y += 2;
  if (!dry) drawSpaced(ctx, fit(ctx, model.editionLine, width, 1), cx, y + 7.5, 1, 'center');
  y += 15;

  y += 10;
  if (!dry) {
    const step = ctx.measureText('- ').width + 1.2;
    for (let x = left; x + ctx.measureText('-').width <= right; x += step) ctx.fillText('-', x, y + 7.5);
  }
  y += 15;

  y += 16;
  setFont(ctx, 16, 700);
  ctx.fillStyle = RECEIPT_INK;
  for (const line of wrap(ctx, model.title, width, 1.28, 3)) {
    if (!dry) drawSpaced(ctx, line, left, y + 9.6, 1.28);
    y += 19.2;
  }
  y += 13;

  model.rows.forEach(([label, value], i) => {
    if (i) y += 7;
    const mid = y + 9;
    setFont(ctx, 12);
    const labelWidth = ctx.measureText(label).width;
    setFont(ctx, 12, 700);
    const shown = fit(ctx, value, Math.min(width - labelWidth - 24, width * 0.72), 0);
    const valueWidth = ctx.measureText(shown).width;
    if (!dry) {
      ctx.fillStyle = RECEIPT_INK;
      ctx.fillText(shown, right - valueWidth, mid);
      setFont(ctx, 12);
      ctx.fillStyle = RECEIPT_MUTED;
      ctx.fillText(label, left, mid);
      dotted(ctx, left + labelWidth + 6, right - valueWidth - 6, mid + 3);
    }
    y += 18;
  });

  y += 14;
  ctx.fillStyle = RECEIPT_INK;
  if (!dry) ctx.fillRect(left, y, width, 2);
  y += 12;
  setFont(ctx, 19, 700);
  if (!dry) drawSpaced(ctx, fit(ctx, model.status.label, width * 0.72, 2.28), left, y + 9.5, 2.28);
  if (!dry && model.status.aside) {
    setFont(ctx, 12, 700);
    drawSpaced(ctx, model.status.aside, right, y + 12, 0.96, 'right');
  }
  y += 29;
  if (!dry) ctx.fillRect(left, y, width, 2);
  y += 2;

  y += 8;
  setFont(ctx, 9);
  if (!dry) {
    ctx.fillStyle = RECEIPT_MUTED;
    drawSpaced(ctx, fit(ctx, model.status.note, width, 1.08), cx, y + 6.75, 1.08, 'center');
  }
  y += 13.5;

  if (model.showQr) {
    y += 12;
    const box = Math.round(width * 0.72);
    if (!dry) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(cx - box / 2, y, box, box);
      ctx.strokeStyle = RECEIPT_INK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - box / 2 + 0.75, y + 0.75, box - 1.5, box - 1.5);
      if (assets.qr) {
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(assets.qr, cx - box / 2 + 6, y + 6, box - 12, box - 12);
      }
    }
    y += box;
  } else {
    y += 16;
    const barsWidth = width * 0.9;
    if (!dry) {
      ctx.fillStyle = RECEIPT_INK;
      for (const b of model.bars) ctx.fillRect(cx - barsWidth / 2 + b.x * barsWidth, y, Math.max(0.6, b.w * barsWidth), 38);
    }
    y += 38;
  }

  y += 6;
  setFont(ctx, 10);
  if (!dry) {
    ctx.fillStyle = '#3A3260';
    drawSpaced(ctx, model.code, cx, y + 7.5, 2.2, 'center');
  }
  return y + 15 + 26;
}

function makeCanvas(height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((W + MARGIN * 2) * SCALE);
  canvas.height = Math.round(height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  return { canvas, ctx };
}

/**
 * Both faces of the slip. The back is mirrored, because the back of the plane
 * faces the other way: the paper's outline and the sticker's backing line up
 * with the front, while its own print still reads the right way round.
 */
export function drawReceipt(model, assets) {
  const measure = makeCanvas(1).ctx;
  const height = Math.ceil(printFront(measure, model, assets, true));

  const front = makeCanvas(height);
  paintPaper(front.ctx, height, assets.paper);
  printFront(front.ctx, model, assets, false);
  if (assets.sticker) paintSticker(front.ctx, assets.sticker);

  const back = makeCanvas(height);
  back.ctx.save();
  back.ctx.translate(W + MARGIN * 2, 0);
  back.ctx.scale(-1, 1);
  paintPaper(back.ctx, height, assets.paper);
  if (assets.sticker) paintSticker(back.ctx, assets.sticker, true);
  back.ctx.restore();

  const cx = MARGIN + W / 2;
  back.ctx.textBaseline = 'middle';
  if (assets.logo) {
    back.ctx.globalAlpha = 0.14;
    back.ctx.drawImage(assets.logo, cx - 30, height / 2 - 60, 60, (60 * assets.logo.height) / assets.logo.width);
    back.ctx.globalAlpha = 1;
  }
  setFont(back.ctx, 10, 700);
  back.ctx.fillStyle = 'rgba(30,24,54,.28)';
  drawSpaced(back.ctx, 'CONNECT3 · ADMIT ONE', cx, height / 2 + 14, 2.4, 'center');
  setFont(back.ctx, 9);
  drawSpaced(back.ctx, model.code, cx, height / 2 + 32, 1.8, 'center');

  return { front: front.canvas, back: back.canvas, paperFraction: W / (W + MARGIN * 2) };
}

/**
 * The strap: black with white edges and the label running along it, one
 * repeat of the pattern per canvas. `flip` turns the lettering round if the
 * strap's direction reads it backwards.
 */
export function drawBand(label = 'CONNECT3', { flip = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0A0A0C';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 4, 512, 9);
  ctx.fillRect(0, 115, 512, 9);
  if (flip) {
    ctx.translate(512, 128);
    ctx.rotate(Math.PI);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  // The label and a dash, spaced evenly so the pattern joins up where it repeats.
  const text = label.toUpperCase();
  let size = 44;
  setFont(ctx, size, 600, SANS);
  while (size > 20 && spacedWidth(ctx, text, size / 4) + ctx.measureText('—').width > 512 - 96) {
    size -= 2;
    setFont(ctx, size, 600, SANS);
  }
  const labelWidth = spacedWidth(ctx, text, size / 4);
  const dashWidth = ctx.measureText('—').width;
  const gap = (512 - labelWidth - dashWidth) / 2;
  drawSpaced(ctx, text, gap / 2, 66, size / 4);
  drawSpaced(ctx, '—', gap / 2 + labelWidth + gap, 66, 0);
  return canvas;
}
