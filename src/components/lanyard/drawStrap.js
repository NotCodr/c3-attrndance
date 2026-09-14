// The lanyard's strap: slim black satin with the C3 mark repeated along it in
// white. One canvas holds one repeat of the pattern.

const WIDTH = 512;
const HEIGHT = 128;

/** The C3 mark in white, lifted out of the logo's dark strokes. */
function whiteMark(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, c.width, c.height);
  const px = pixels.data;
  for (let i = 0; i < px.length; i += 4) {
    // The strokes are near black and the blob behind them pale lavender: keep
    // only the strokes, with their soft edges.
    const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    const ink = Math.max(0, Math.min(1, (200 - lum) / 150));
    px[i] = px[i + 1] = px[i + 2] = 255;
    px[i + 3] = Math.round(px[i + 3] * ink);
  }
  ctx.putImageData(pixels, 0, 0);
  return c;
}

export function loadStrapMark() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(whiteMark(img));
    img.onerror = () => resolve(null);
    img.src = '/brand/connect3-logo.png';
  });
}

/**
 * `across` is how wide the strap is compared with the length of one repeat,
 * so the mark keeps its shape once the canvas is stretched along the strap.
 * The canvas runs along the strap (its left end is up), so the mark is drawn
 * turned a quarter so it stands upright as the strap hangs.
 */
export function drawStrap(mark, { across = 0.25 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  // Satin: darker at the edges, a soft sheen down the middle.
  const sheen = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sheen.addColorStop(0, '#040406');
  sheen.addColorStop(0.3, '#15141b');
  sheen.addColorStop(0.5, '#211f2a');
  sheen.addColorStop(0.7, '#15141b');
  sheen.addColorStop(1, '#040406');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A fine weave, and stitching just inside each edge.
  ctx.fillStyle = 'rgba(255,255,255,0.028)';
  for (let x = 0; x < WIDTH; x += 4) ctx.fillRect(x, 0, 1.5, HEIGHT);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  for (let x = 3; x < WIDTH; x += 16) {
    ctx.fillRect(x, 13, 9, 2);
    ctx.fillRect(x, HEIGHT - 15, 9, 2);
  }

  if (mark) {
    const markAcross = HEIGHT * 0.7;
    // Along the strap, a canvas pixel covers `across * 4` as much as one across it.
    const markAlong = ((markAcross * mark.height) / mark.width) * across * 4;
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(mark, -markAlong / 2, -markAcross / 2, markAlong, markAcross);
    ctx.restore();
  }
  return canvas;
}
