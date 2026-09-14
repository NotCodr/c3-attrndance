import React, { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import ReceiptTicket from '@/components/ReceiptTicket';
import { receiptFor } from '@/lib/receipt';
import { drawBand, drawReceipt, loadReceiptAssets } from '@/components/lanyard/drawReceipt';

const loadScene = () => import('@/components/lanyard/LanyardScene');
const LanyardScene = lazy(loadScene);

/** Starts fetching the 3D scene early, e.g. while the ticket itself is loading. */
export const preloadLanyard = () => { loadScene().catch(() => {}); };

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
 * The ticket as a receipt hanging from a lanyard: it drops in, swings, and can
 * be grabbed and thrown. Tapping it opens the QR. Without WebGL, with reduced
 * motion, or if the scene can't load, the same receipt hangs still instead.
 */
export default function LanyardTicket({ data, qrDataUrl, onShowQr }) {
  const reduce = useReducedMotion();
  const stage = useRef(null);
  const model = useMemo(() => receiptFor(data), [data]);
  const [mode, setMode] = useState(() => (hasWebGL() ? 'loading' : 'flat'));
  const [textures, setTextures] = useState(null);
  const [active, setActive] = useState(true);
  const flat = mode === 'flat' || !!reduce;

  useEffect(() => {
    if (flat) return undefined;
    let cancelled = false;
    loadReceiptAssets(model, qrDataUrl)
      .then((assets) => {
        if (!cancelled) setTextures({ receipt: drawReceipt(model, assets), band: drawBand('CONNECT3') });
      })
      .catch(() => { if (!cancelled) setMode('flat'); });
    return () => { cancelled = true; };
  }, [model, qrDataUrl, flat]);

  // Hang it still if the scene is still not up after a slow connection.
  useEffect(() => {
    if (mode !== 'loading') return undefined;
    const t = setTimeout(() => setMode((m) => (m === 'loading' ? 'flat' : m)), 12000);
    return () => clearTimeout(t);
  }, [mode]);

  // No physics while the stage is scrolled out of view.
  useEffect(() => {
    const el = stage.current;
    if (!el || flat || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, [flat]);

  if (flat) {
    return (
      <div className="flex flex-col items-center pb-10">
        <Strap />
        <ReceiptTicket data={data} qrDataUrl={qrDataUrl} onShowQr={onShowQr} clip scale={1.08} />
      </div>
    );
  }

  const hint = model.showQr ? 'Tap it for your QR, or give it a swing.' : 'Grab it and give it a swing.';

  return (
    <div ref={stage} data-lanyard={mode} className="relative select-none overflow-hidden" style={{ height: 'clamp(540px, calc(100svh - 4.5rem), 820px)', minHeight: 540 }}>
      <p aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[52%] text-center font-medium leading-none tracking-[-0.05em] text-white opacity-[0.05]" style={{ fontSize: 140 }}>
        C3
      </p>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-16 h-px bg-white/[0.12]" />

      {textures && (
        <SceneBoundary onError={() => setMode('flat')}>
          <Suspense fallback={null}>
            <div className={`absolute inset-0 transition-opacity duration-700 ${mode === 'live' ? 'opacity-100' : 'opacity-0'}`}>
              <LanyardScene
                receipt={textures.receipt}
                band={textures.band}
                active={active}
                onTap={model.showQr ? onShowQr : undefined}
                onReady={() => setMode('live')}
              />
            </div>
          </Suspense>
        </SceneBoundary>
      )}

      {mode === 'loading' && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-[#9A9AA3]">
          printing your ticket<span className="animate-pulse">_</span>
        </p>
      )}
      <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs text-[#9A9AA3]">{hint}</p>

      {/* The paper is drawn on a canvas, so its words are repeated here for screen readers. */}
      <div className="sr-only">
        <h2>{data.event.title}</h2>
        <dl>
          {model.rows.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
        <p>{[model.status.label, model.status.aside].filter(Boolean).join(' ')}. {model.status.note}</p>
      </div>
    </div>
  );
}

/** The strap for the still version: straight down from the top, into the clip. */
function Strap() {
  return (
    <div aria-hidden="true" className="relative h-24 w-[26px] overflow-hidden border-x-[3px] border-white bg-[#0A0A0C] shadow-[0_0_0_2px_rgba(0,0,0,.5)] sm:h-32">
      <p className="absolute inset-0 whitespace-nowrap text-[8.5px] font-semibold tracking-[0.26em] text-white [writing-mode:vertical-rl]" style={{ lineHeight: '20px' }}>
        CONNECT3 — CONNECT3 — CONNECT3
      </p>
    </div>
  );
}
