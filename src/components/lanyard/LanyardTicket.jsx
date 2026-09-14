import React, { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import useReceiptArt from '@/components/receipt/useReceiptArt';
import ReceiptPrinter from '@/components/receipt/ReceiptPrinter';
import { ReceiptText } from '@/components/receipt/PrintedReceipt';
import { drawStrap, loadStrapMark } from '@/components/lanyard/drawStrap';
import { framing, PAPER_WIDTH, planeSize } from '@/components/lanyard/layout';
import { MARGIN, PAPER_W } from '@/components/receipt/drawReceipt';

const loadScene = () => import('@/components/lanyard/LanyardScene');
const LanyardScene = lazy(loadScene);

/** Starts fetching the 3D scene early, e.g. while the ticket itself is loading. */
export const preloadLanyard = () => { loadScene().catch(() => {}); };

// The strap's width over the length of one repeat of its pattern (see drawStrap).
const STRAP_ACROSS = 0.16;
// How long after the printer lets go the slip starts to swing.
const HANDOFF_MS = 240;
// A typical slip's size, to place the printer before the real one is drawn.
const ESTIMATE = { paperFraction: PAPER_W / (PAPER_W + MARGIN * 2), width: PAPER_W + MARGIN * 2, height: 600 };

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
 * The ticket printed as a receipt and caught by a lanyard. A printer at the
 * top feeds the slip out; when it lets go, the 3D lanyard (loaded behind it,
 * hanging exactly where the slip ends up) takes over and the slip swings, to
 * be grabbed and thrown. Tapping it opens the QR. Without WebGL, with reduced
 * motion, or if the scene can't load, the slip hangs still instead.
 */
export default function LanyardTicket({ data, qrDataUrl, onShowQr }) {
  const reduce = useReducedMotion();
  const stage = useRef(null);
  const { model, art } = useReceiptArt(data, qrDataUrl);
  const [webgl] = useState(hasWebGL);
  const [failed, setFailed] = useState(false);
  const [strap, setStrap] = useState(null);
  const [size, setSize] = useState(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [released, setReleased] = useState(false);
  const [printerGone, setPrinterGone] = useState(false);
  const [swing, setSwing] = useState(0);
  const [active, setActive] = useState(true);
  const [slow, setSlow] = useState(false);
  const flat = !!reduce || !webgl || failed || art === false;

  useEffect(() => {
    if (flat) return undefined;
    let cancelled = false;
    loadStrapMark().then((mark) => {
      if (!cancelled) setStrap(drawStrap(mark, { across: STRAP_ACROSS }));
    });
    return () => { cancelled = true; };
  }, [flat]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [flat]);

  // No physics while the stage is scrolled out of view.
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, [flat]);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 700);
    return () => clearTimeout(t);
  }, []);

  // Printed and the lanyard is waiting behind the printer: let go. The lanyard
  // takes the slip's place as the printer lifts, then the slip is set swinging.
  useEffect(() => {
    if (printed && sceneReady && !released) setReleased(true);
  }, [printed, sceneReady, released]);

  useEffect(() => {
    if (!released) return undefined;
    const t = setTimeout(() => setSwing((n) => n + 1), HANDOFF_MS);
    return () => clearTimeout(t);
  }, [released]);

  // If the lanyard still isn't up well after printing, leave the slip hanging still.
  useEffect(() => {
    if (!printed || sceneReady) return undefined;
    const t = setTimeout(() => setFailed(true), 10000);
    return () => clearTimeout(t);
  }, [printed, sceneReady]);

  if (flat) {
    return (
      <div data-lanyard="flat" className="flex flex-col items-center pb-10 pt-1">
        <StillLanyard />
        {art ? (
          <button
            type="button"
            onClick={onShowQr}
            disabled={!model?.showQr || !onShowQr}
            aria-label="Show your check-in QR code full screen"
            className="relative z-0 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-default"
            style={{ filter: 'drop-shadow(0 22px 26px rgba(0,0,0,.55))' }}
          >
            <img src={art.url} alt="" draggable={false} className="block w-[320px] max-w-[88vw]" />
          </button>
        ) : (
          <div className="h-[520px]" />
        )}
        {model && <ReceiptText data={data} model={model} />}
      </div>
    );
  }

  let rect = null;
  let paperPx = 0;
  if (size) {
    const plane = planeSize(art || ESTIMATE);
    const frame = framing(size.width, size.height, plane.height);
    rect = {
      left: frame.toScreenX(-plane.width / 2),
      top: frame.toScreenY(frame.paperTop),
      width: plane.width * frame.pxPerUnit,
      height: plane.height * frame.pxPerUnit,
    };
    paperPx = PAPER_WIDTH * frame.pxPerUnit;
  }

  const phase = released ? 'live' : printed ? 'printed' : art ? 'printing' : 'loading';
  const hint = released
    ? (model?.showQr ? 'Tap it for your QR, or give it a swing.' : 'Grab it and give it a swing.')
    : art ? 'Printing your ticket…' : slow ? 'Getting your ticket…' : '';

  return (
    <div
      ref={stage}
      data-lanyard={phase}
      className="relative select-none overflow-hidden"
      style={{ height: 'clamp(540px, calc(100svh - 4.5rem), 820px)', minHeight: 540 }}
    >
      {art && strap && (
        <SceneBoundary onError={() => setFailed(true)}>
          <Suspense fallback={null}>
            <div
              className="absolute inset-0"
              style={{ opacity: released ? 1 : 0, pointerEvents: released ? 'auto' : 'none' }}
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

      {rect && !printerGone && (
        <ReceiptPrinter
          src={art?.url}
          rect={rect}
          paperWidth={paperPx}
          release={released}
          onPrinted={() => setPrinted(true)}
          onReleased={() => setPrinterGone(true)}
        />
      )}

      <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-16 h-px bg-white/[0.08]" />
      <p aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs text-[#9A9AA3]">{hint}</p>
      {model && <ReceiptText data={data} model={model} />}
    </div>
  );
}

/** The lanyard for the still version: a slim strap, the ring, and a clamp over the slip. */
function StillLanyard() {
  return (
    <div aria-hidden="true" className="relative z-[1] -mb-2 flex flex-col items-center">
      <div
        className="flex h-24 w-[14px] flex-col items-center justify-around overflow-hidden sm:h-28"
        style={{ background: 'linear-gradient(90deg, #040406 0%, #211f2a 50%, #040406 100%)' }}
      >
        {[0, 1, 2].map((i) => <img key={i} src="/brand/connect3-logo-white.png" alt="" className="w-[9px] opacity-90" />)}
      </div>
      <span className="-mt-px h-[18px] w-[18px] rounded-full border-[3px] border-[#dfe2e8] shadow-[0_1px_2px_rgba(0,0,0,.6)]" />
      <span className="-mt-[3px] h-2 w-[5px] rounded-sm bg-[#c9ccd3]" />
      <span
        className="relative h-4 w-9 rounded-[5px] shadow-[0_2px_4px_rgba(0,0,0,.5)]"
        style={{ background: 'linear-gradient(180deg, #3a3b42 0%, #25262c 100%)' }}
      >
        <span className="absolute left-1/2 top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#dfe2e8]" />
      </span>
    </div>
  );
}
