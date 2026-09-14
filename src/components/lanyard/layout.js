// Where things sit in the lanyard's world, shared by the 3D scene and the
// printer drawn over it, so the slip coming out of the printer lands exactly
// where the lanyard catches it. Plain maths: no three.js in the main bundle.

export const PAPER_WIDTH = 1.6;
export const ANCHOR_Y = 4;
export const ROPE = 3;
/** From the ring the strap loops through down to the top edge of the paper. */
export const CLIP_DROP = 0.16;
/** The strap's meshline width, and about how wide that draws in world units. */
export const STRAP_WIDTH = 0.58;
export const STRAP_WORLD_WIDTH = STRAP_WIDTH * 0.165;
/** The clip's parts; `y` is the centre's height above the paper's top edge. */
export const RING = { radius: 0.05, tube: 0.012 };
export const NECK = { width: 0.034, height: 0.05, y: 0.088 };
export const CLAMP = { width: 0.21, height: 0.1, y: 0.022 };
const STRAP_SHOWING = 0.95;
const BOTTOM_ROOM = 0.55;
const TAN_HALF_FOV = Math.tan(Math.PI / 18); // a 20° field of view

/** The slip's plane in world units, sticker margins included. */
export function planeSize(art) {
  const width = PAPER_WIDTH / art.paperFraction;
  return { width, height: width * (art.height / art.width) };
}

/**
 * The camera for a stage of this size, and how to find world points on
 * screen. At rest the ring hangs at ANCHOR_Y - ROPE with the strap rising
 * out of the top edge and the whole slip in view.
 */
export function framing(stageWidth, stageHeight, paperHeight) {
  const aspect = stageWidth / stageHeight;
  const visible = Math.max(
    STRAP_SHOWING + CLIP_DROP + paperHeight + BOTTOM_ROOM,
    (PAPER_WIDTH * 1.2) / (0.66 * aspect),
    (PAPER_WIDTH * stageHeight) / 300,
  );
  const ring = ANCHOR_Y - ROPE;
  const top = ring + STRAP_SHOWING;
  const pxPerUnit = stageHeight / visible;
  return {
    cameraY: top - visible / 2,
    cameraZ: visible / (2 * TAN_HALF_FOV),
    pxPerUnit,
    paperTop: ring - CLIP_DROP,
    toScreenX: (x) => stageWidth / 2 + x * pxPerUnit,
    toScreenY: (y) => (top - y) * pxPerUnit,
  };
}
