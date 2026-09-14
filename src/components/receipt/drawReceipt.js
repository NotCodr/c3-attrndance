// Paints the receipt onto canvases: the printed front and the plain back of
// the paper. It is laid out in the design's pixels (a 236px slip) and drawn
// SCALE times larger, so it stays sharp on the lanyard and printed flat alike.

import { RECEIPT_INK, RECEIPT_MUTED, RECEIPT_PAPER } from '@/lib/receipt';
import { code128c } from '@/lib/barcode';

const SCALE = 3;
export const PAPER_W = 236;
export const MARGIN = 30; // either side, so the rare seal can overhang the edge
const PAD_X = 20;
const TOOTH = 9;
const MONO = '"Space Mono", ui-monospace, Menlo, monospace';

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The font and images the paper needs, loaded before anything is drawn. */
export async function loadReceiptAssets(model, qrDataUrl) {
  const fonts = document.fonts
    ? Promise.all([document.fonts.load(`400 12px ${MONO}`), document.fonts.load(`700 12px ${MONO}`)]).catch(() => null)
    : null;
  const [paper, qr] = await Promise.all([
    loadImage('/brand/receipt-paper.webp'),
    loadImage(model.showQr ? qrDataUrl : null),
    fonts,
  ]);
  return { paper, qr };
}

// ------------------------------------------------------------------ text --

const setFont = (ctx, size, weight = 400) => { ctx.font = `${weight} ${size}px ${MONO}`; };

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

// ---------------------------------------------------------------- pieces --

function dashes(ctx, y, left, right, dry) {
  if (!dry) {
    setFont(ctx, 10);
    ctx.fillStyle = RECEIPT_MUTED;
    const step = ctx.measureText('- ').width + 1.2;
    for (let x = left; x + ctx.measureText('-').width <= right; x += step) ctx.fillText('-', x, y + 6);
  }
  return y + 12;
}

function doubleRule(ctx, y, left, width, dry) {
  if (!dry) {
    ctx.fillStyle = RECEIPT_INK;
    ctx.fillRect(left, y, width, 1.5);
    ctx.fillRect(left, y + 4, width, 1.5);
  }
  return y + 5.5;
}

/** LABEL ........ VALUE lines, the value cut short rather than overrunning. */
function rows(ctx, list, y, left, right, width, dry) {
  list.forEach(([label, value], i) => {
    if (i) y += 5;
    const mid = y + 8;
    setFont(ctx, 11);
    const labelWidth = ctx.measureText(label).width;
    setFont(ctx, 11, 700);
    const shown = fit(ctx, value, width - labelWidth - 22, 0);
    const valueWidth = ctx.measureText(shown).width;
    if (!dry) {
      ctx.fillStyle = RECEIPT_INK;
      ctx.fillText(shown, right - valueWidth, mid);
      setFont(ctx, 11);
      ctx.fillStyle = RECEIPT_MUTED;
      ctx.fillText(label, left, mid);
      ctx.fillStyle = '#B8B0CC';
      for (let x = left + labelWidth + 5; x <= right - valueWidth - 5; x += 3) {
        ctx.beginPath();
        ctx.arc(x, mid + 3, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    y += 16;
  });
  return y;
}

// ----------------------------------------------------------------- paper --

function paperPath(ctx, height) {
  ctx.beginPath();
  ctx.moveTo(MARGIN, 0);
  ctx.lineTo(MARGIN + PAPER_W, 0);
  ctx.lineTo(MARGIN + PAPER_W, height - TOOTH);
  for (let i = 1; i <= 28; i++) ctx.lineTo(MARGIN + PAPER_W * (1 - (i * 3.5) / 100), i % 2 ? height : height - TOOTH);
  ctx.lineTo(MARGIN, height);
  ctx.closePath();
}

function paintPaper(ctx, height, paper) {
  ctx.save();
  paperPath(ctx, height);
  ctx.clip();
  ctx.fillStyle = RECEIPT_PAPER;
  ctx.fillRect(MARGIN, 0, PAPER_W, height);
  if (paper) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = ctx.createPattern(paper, 'repeat');
    ctx.fillRect(MARGIN, 0, PAPER_W, height);
    ctx.globalCompositeOperation = 'source-over';
  }
  let g = ctx.createLinearGradient(MARGIN, 0, MARGIN + PAPER_W, 0);
  g.addColorStop(0, 'rgba(21,16,43,.08)');
  g.addColorStop(0.12, 'rgba(21,16,43,0)');
  g.addColorStop(0.88, 'rgba(21,16,43,0)');
  g.addColorStop(1, 'rgba(21,16,43,.09)');
  ctx.fillStyle = g;
  ctx.fillRect(MARGIN, 0, PAPER_W, height);
  g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, 'rgba(21,16,43,.07)');
  g.addColorStop(0.06, 'rgba(255,255,255,0)');
  g.addColorStop(0.85, 'rgba(21,16,43,0)');
  g.addColorStop(1, 'rgba(21,16,43,.12)');
  ctx.fillStyle = g;
  ctx.fillRect(MARGIN, 0, PAPER_W, height);
  ctx.restore();
}

/** A holographic foil seal over the top right corner, on the rare Holo tickets. */
function paintSeal(ctx, backing = false) {
  const r = 24;
  ctx.save();
  ctx.translate(MARGIN + PAPER_W - 8, 46);
  ctx.rotate(-0.2);
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rr = i % 2 ? r : r - 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  if (backing) {
    ctx.fillStyle = '#E9E5DA';
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.shadowColor = 'rgba(21,16,43,.35)';
  ctx.shadowOffsetY = 1.5;
  ctx.shadowBlur = 2;
  const colours = ['#8cf5ff', '#ff9be8', '#ffe29a', '#9dffc8', '#b48bff', '#8cf5ff'];
  const foil = ctx.createConicGradient ? ctx.createConicGradient(0, 0, 0) : ctx.createLinearGradient(-r, -r, r, r);
  colours.forEach((c, i) => foil.addColorStop(i / (colours.length - 1), c));
  ctx.fillStyle = foil;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, r - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = RECEIPT_INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  setFont(ctx, 8.5, 700);
  drawSpaced(ctx, 'RARE', 0, -2.5, 1.5, 'center');
  setFont(ctx, 5.5, 700);
  drawSpaced(ctx, 'HOLO', 0, 6.5, 1.3, 'center');
  ctx.restore();
}

// ----------------------------------------------------------------- front --

/**
 * Lays out (and, unless `dry`, prints) the front. Returns the slip's height,
 * and adds the graphics (QR, barcode) to `bands` as [top, bottom].
 */
function printFront(ctx, model, assets, dry, bands = []) {
  const cx = MARGIN + PAPER_W / 2;
  const left = MARGIN + PAD_X;
  const right = MARGIN + PAPER_W - PAD_X;
  const width = PAPER_W - PAD_X * 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let y = 30;

  // Who is issuing it: the club, the way a shop's name heads its receipts.
  setFont(ctx, 13, 700);
  ctx.fillStyle = RECEIPT_INK;
  for (const line of wrap(ctx, model.issuer || 'EVENT TICKET', width, 2.2, 2)) {
    if (!dry) drawSpaced(ctx, line, cx, y + 9, 2.2, 'center');
    y += 18;
  }
  if (model.issuer) {
    y += 2;
    setFont(ctx, 8.5);
    if (!dry) {
      ctx.fillStyle = RECEIPT_MUTED;
      drawSpaced(ctx, 'PRESENTS', cx, y + 6, 2.6, 'center');
    }
    y += 12;
  }

  y = dashes(ctx, y + 10, left, right, dry);

  y += 10;
  setFont(ctx, 17, 700);
  ctx.fillStyle = RECEIPT_INK;
  for (const line of wrap(ctx, model.title, width, 1.2, 3)) {
    if (!dry) drawSpaced(ctx, line, left, y + 10.5, 1.2);
    y += 21;
  }

  y = rows(ctx, model.event, y + 8, left, right, width, dry);
  if (model.address) {
    setFont(ctx, 8.5);
    const text = fit(ctx, model.address, width, 0.4);
    if (!dry) {
      ctx.fillStyle = RECEIPT_MUTED;
      drawSpaced(ctx, text, right, y + 6, 0.4, 'right');
    }
    y += 13;
  }

  y = dashes(ctx, y + 8, left, right, dry);
  y = rows(ctx, model.guest, y + 8, left, right, width, dry);
  y = doubleRule(ctx, y + 12, left, width, dry);

  const status = model.status;
  if (model.showQr) {
    y += 12;
    const box = Math.round(width * 0.64);
    if (!dry) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(cx - box / 2, y, box, box);
      ctx.strokeStyle = RECEIPT_INK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - box / 2 + 0.75, y + 0.75, box - 1.5, box - 1.5);
      if (assets.qr) {
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(assets.qr, cx - box / 2 + 5, y + 5, box - 10, box - 10);
      }
    }
    bands.push([y, y + box]);
    y += box + 8;
    setFont(ctx, 8.5);
    if (!dry) {
      ctx.fillStyle = RECEIPT_MUTED;
      drawSpaced(ctx, status.caption, cx, y + 6, 2.6, 'center');
    }
    y += 12;
  } else {
    y += 12;
    setFont(ctx, 17, 700);
    const asideWidth = status.aside ? ctx.measureText(status.aside).width + 10 : 0;
    const headline = fit(ctx, status.headline, width - asideWidth, 1.4);
    if (!dry) {
      ctx.fillStyle = RECEIPT_INK;
      drawSpaced(ctx, headline, left, y + 10.5, 1.4);
      if (status.aside) ctx.fillText(status.aside, right - ctx.measureText(status.aside).width, y + 10.5);
    }
    y += 21;
    if (status.detail) {
      y += 4;
      setFont(ctx, 8.5);
      if (!dry) {
        ctx.fillStyle = RECEIPT_MUTED;
        drawSpaced(ctx, fit(ctx, status.detail, width, 1.2), left, y + 6, 1.2);
      }
      y += 12;
    }
  }

  y = doubleRule(ctx, y + 12, left, width, dry);
  if (model.footer) {
    y += 9;
    setFont(ctx, 8.5);
    if (!dry) {
      ctx.fillStyle = RECEIPT_MUTED;
      drawSpaced(ctx, fit(ctx, model.footer, width, 1), cx, y + 6, 1, 'center');
    }
    y += 12;
  }

  // A real Code 128 barcode of the ticket's reference, as till receipts end with.
  if (model.barcode) {
    y += 14;
    const { bars, modules } = code128c(model.barcode);
    const barsWidth = Math.min(width * 0.86, modules * 1.3);
    const unit = barsWidth / modules;
    const left0 = cx - barsWidth / 2;
    if (!dry) {
      ctx.fillStyle = RECEIPT_INK;
      for (const bar of bars) ctx.fillRect(left0 + bar.x * unit, y, bar.w * unit, 34);
    }
    bands.push([y, y + 34]);
    y += 39;
    setFont(ctx, 9);
    if (!dry) {
      ctx.fillStyle = RECEIPT_INK;
      drawSpaced(ctx, model.barcode.replace(/(\d{4})(?=\d)/g, '$1 '), cx, y + 6, 2.2, 'center');
    }
    y += 12;
  }
  return y + 22;
}

function makeCanvas(height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((PAPER_W + MARGIN * 2) * SCALE);
  canvas.height = Math.round(height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  return { canvas, ctx };
}

/**
 * Both faces of the slip, plus its size in layout pixels (margins included).
 * The back is mirrored because the back of the plane faces the other way, so
 * its outline and the seal's backing line up with the front.
 */
export function drawReceipt(model, assets) {
  const bands = [];
  const height = Math.ceil(printFront(makeCanvas(1).ctx, model, assets, true, bands));

  const front = makeCanvas(height);
  paintPaper(front.ctx, height, assets.paper);
  printFront(front.ctx, model, assets, false);
  if (model.rare) paintSeal(front.ctx);

  const back = makeCanvas(height);
  back.ctx.translate(PAPER_W + MARGIN * 2, 0);
  back.ctx.scale(-1, 1);
  paintPaper(back.ctx, height, assets.paper);
  if (model.rare) paintSeal(back.ctx, true);

  return {
    front: front.canvas,
    back: back.canvas,
    width: PAPER_W + MARGIN * 2,
    height,
    paperFraction: PAPER_W / (PAPER_W + MARGIN * 2),
    bands,
  };
}
