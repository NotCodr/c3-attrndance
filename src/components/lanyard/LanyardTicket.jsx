import React, { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import useReceiptArt from '@/components/receipt/useReceiptArt';
import { ReceiptText } from '@/components/receipt/PrintedReceipt';
import { drawStrap, loadStrapMark } from '@/components/lanyard/drawStrap';
import {
  ANCHOR_Y, CLAMP, framing, NECK, planeSize, RING, ROPE, STRAP_WORLD_WIDTH,
} from '@/components/lanyard/layout';

const loadScene = () => import('@/components/lanyard/LanyardScene');
const LanyardScene = lazy(loadScene);

/** Starts fetching the 3D scene early, e.g. while the ticket itself is loading. */
export const preloadLanyard = () => { loadScene().catch(() => {}); };

// The strap's width over the length of one repeat of its pattern (see drawStrap).
const STRAP_ACROSS = 0.16;
// How far apart the marks on the strap are, in world units (3 of rope, 5 repeats).
const MARK_EVERY = 0.6;
const FADE_MS = 450;

function hasWebGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

class SceneBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The ticket as a receipt on a lanyard. The slip drops in straight away as a
 * still picture, placed exactly where the 3D lanyard hangs it; once the 3D
 * scene has loaded it fades in over the picture, takes over and swings, to be
 * grabbed and thrown. Tapping the slip opens the QR. Without WebGL, with
 * reduced motion, or if the scene can't load, the still picture stays.
 */
export default function LanyardTicket({ data, qrDataUrl, onShowQr }) {
  const reduce = useReducedMotion();
  const stage = useRef(null);
  const { model, art } = useReceiptArt(data, qrDataUrl);
  const [webgl] = useState(hasWebGL);
  const [failed, setFailed] = useState(false);
  const [strap, setStrap] = useState(null);
  const [size, setSize] = useState(null);
  const [landed, setLanded] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [handedOff, setHandedOff] = useState(false);
  const [swing, setSwing] = useState(0);
  const [active, setActive] = useState(true);
  const [slow, setSlow] = useState(false);
  const handoffDone = useRef(false);
  const threeD = webgl && !reduce && !failed && art !== false;
  const fading = threeD && landed && sceneReady;
  const live = threeD && handedOff;

  useEffect(() => {
    if (!threeD) return undefined;
    let cancelled = false;
    loadStrapMark().then((mark) => {
      if (!cancelled) setStrap(drawStrap(mark, { across: STRAP_ACROSS }));
    });
    return () => { cancelled = true; };
  }, [threeD]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // No physics while the stage is scrolled out of view.
  useEffect(() => {
    const el = stage.current;
    if (!el || !threeD || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, [threeD]);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 700);
    return () => clearTimeout(t);
  }, []);

  // If the 3D lanyard still hasn't loaded long after the slip landed, leave it still.
  useEffect(() => {
    if (!threeD || !landed || sceneReady) return undefined;
    const t = setTimeout(() => setFailed(true), 12000);
    return () => clearTimeout(t);
  }, [threeD, landed, sceneReady]);

  // Once the lanyard has faded in over the still slip, it takes over and swings.
  const handOff = useCallback(() => {
    if (handoffDone.current) return;
    handoffDone.current = true;
    setHandedOff(true);
    setSwing((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!fading) return undefined;
    const t = setTimeout(handOff, FADE_MS + 250); // in case transitionend never arrives
    return () => clearTimeout(t);
  }, [fading, handOff]);

  let plane = null;
  let frame = null;
  if (art && size) {
    plane = planeSize(art);
    frame = framing(size.width, size.height, plane.height);
  }
  const hint = !art
    ? (slow ? 'Getting your ticket…' : '')
    : live
      ? (model.showQr ? 'Tap it for your QR, or give it a swing.' : 'Grab it and give it a swing.')
      : (model.showQr ? 'Tap it for your QR.' : '');

  return (
    <div
      ref={stage}
      data-lanyard={live ? 'live' : !art ? 'loading' : threeD ? 'still' : 'flat'}
      className="relative select-none overflow-hidden"
      style={{ height: 'clamp(540px, calc(100svh - 4.5rem), 820px)', minHeight: 540 }}
    >
      {frame && !live && (
        <StillSlip
          art={art}
          plane={plane}
          frame={frame}
          animate={!reduce}
          onLanded={() => setLanded(true)}
          onShowQr={model.showQr ? onShowQr : undefined}
        />
      )}

      {threeD && art && strap && (
        <SceneBoundary onError={() => setFailed(true)}>
          <Suspense fallback={null}>
            <div
              className="absolute inset-0"
              style={{ opacity: fading ? 1 : 0, pointerEvents: live ? 'auto' : 'none', transition: `opacity ${FADE_MS}ms ease` }}
              onTransitionEnd={(e) => { if (e.target === e.currentTarget && fading) handOff(); }}
            >
              <LanyardScene
                art={art}
                strap={strap}
                swing={swing}
                active={active}
                onTap={model.showQr ? onShowQr : undefined}
                onReady={() => setSceneReady(true)}
              />
            </div>
          </Suspense>
        </SceneBoundary>
      )}

      <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-16 h-px bg-white/[0.08]" />
      <p aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs text-[#9A9AA3]">{hint}</p>
      {model && <ReceiptText data={data} model={model} />}
    </div>
  );
}

/**
 * The slip and its lanyard as a still picture, placed exactly where the 3D
 * scene hangs them (see layout.js), so one can take over from the other.
 */
function StillSlip({ art, plane, frame, animate, onLanded, onShowQr }) {
  const px = frame.pxPerUnit;
  const cx = frame.toScreenX(0);
  const ringY = frame.toScreenY(ANCHOR_Y - ROPE);
  const paperTop = frame.toScreenY(frame.paperTop);
  const strapWidth = STRAP_WORLD_WIDTH * px;
  const ringSize = (RING.radius + RING.tube) * 2 * px;
  const stitch = 'repeating-linear-gradient(180deg, rgba(255,255,255,.2) 0 5px, transparent 5px 10px)';
  const marks = [];
  for (let y = ringY - (MARK_EVERY / 2) * px; y > -40; y -= MARK_EVERY * px) marks.push(y);

  useEffect(() => {
    if (!animate) onLanded();
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      initial={animate ? { y: -56, opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 15, mass: 0.9 }}
      onAnimationComplete={animate ? onLanded : undefined}
    >
      <div aria-hidden="true">
        <div
          className="absolute overflow-hidden"
          style={{ left: cx - strapWidth / 2, top: -80, width: strapWidth, height: ringY + 80, background: 'linear-gradient(90deg, #040406 0%, #211f2a 50%, #040406 100%)' }}
        >
          <span className="absolute inset-y-0 left-[12%] w-px" style={{ background: stitch }} />
          <span className="absolute inset-y-0 right-[12%] w-px" style={{ background: stitch }} />
          {marks.map((y) => (
            <img
              key={y}
              src="/brand/connect3-logo-white.png"
              alt=""
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ top: y + 80, width: strapWidth * 0.7 }}
            />
          ))}
        </div>
        <span
          className="absolute rounded-full shadow-[0_1px_2px_rgba(0,0,0,.6)]"
          style={{ left: cx - ringSize / 2, top: ringY - ringSize / 2, width: ringSize, height: ringSize, border: `${RING.tube * 2 * px}px solid #dfe2e8` }}
        />
        <span
          className="absolute rounded-[2px] bg-[#c9ccd3]"
          style={{ left: cx - (NECK.width * px) / 2, top: paperTop - NECK.y * px - (NECK.height * px) / 2, width: NECK.width * px, height: NECK.height * px }}
        />
      </div>

      <button
        type="button"
        onClick={onShowQr}
        disabled={!onShowQr}
        aria-label="Show your check-in QR code full screen"
        className="absolute block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-default"
        style={{ left: frame.toScreenX(-plane.width / 2), top: paperTop, width: plane.width * px, height: plane.height * px }}
      >
        <img src={art.url} alt="" draggable={false} className="block h-full w-full" />
      </button>

      <span
        aria-hidden="true"
        className="absolute rounded-[4px] shadow-[0_2px_4px_rgba(0,0,0,.5)]"
        style={{
          left: cx - (CLAMP.width * px) / 2,
          top: paperTop - CLAMP.y * px - (CLAMP.height * px) / 2,
          width: CLAMP.width * px,
          height: CLAMP.height * px,
          background: 'linear-gradient(180deg, #3a3b42 0%, #25262c 100%)',
        }}
      >
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#dfe2e8]"
          style={{ width: 0.026 * px, height: 0.026 * px }}
        />
      </span>
    </motion.div>
  );
}
