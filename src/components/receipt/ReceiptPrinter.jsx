import React, { useEffect, useRef, useState } from 'react';

const BODY = 58;
const WAKE_MS = 320;
const CUT_MS = 600;
const LIFT_MS = 560;
/** How fast the paper moves while a graphic is printing, against text. */
const GRAPHIC_SPEED = 0.45;

/**
 * A slim receipt printer that prints the slip the way a real one does. It
 * settles in and wakes, feeds the paper out in one smooth motion (easing off
 * through the QR and barcode, which take longer to print) while it hums,
 * cuts with a small tick, and lifts away, leaving the receipt where it was
 * printed.
 *
 * `rect` is where the finished slip sits (px) and the printer covers its top
 * `lip` px. `bands` are the slip's graphics as [top, bottom] px from its top.
 */
export default function ReceiptPrinter({ src, rect, paperWidth, bands = [], lip = 10, onGone }) {
  const hum = useRef(null);
  const paper = useRef(null);
  const [phase, setPhase] = useState('waking');
  const graphics = useRef(bands);
  graphics.current = bands;
  const gone = useRef(onGone);
  gone.current = onGone;
  const height = rect?.height || 0;

  // The printer settles into place from just above.
  useEffect(() => {
    hum.current?.animate?.(
      [{ transform: 'translateY(-16px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }, []);

  useEffect(() => {
    const img = paper.current;
    if (!src || !img || !height) return undefined;
    const slowStretch = graphics.current.reduce((sum, [top, bottom]) => sum + (bottom - top), 0);
    const duration = Math.min(3200, Math.max(2200, height * 3.6));
    const cruise = (height - slowStretch + slowStretch / GRAPHIC_SPEED) / duration;
    const timers = [];
    let raf = 0;
    let start = 0;
    let last = 0;
    let fed = 0;
    let speed = 0;
    let sway = 0;

    const feed = (now) => {
      if (!start) {
        start = now;
        last = now;
      }
      const dt = Math.min(48, now - last);
      last = now;
      const t = (now - start) / 1000;
      const atMouth = height - fed;
      const onGraphic = graphics.current.some(([top, bottom]) => atMouth > top && atMouth <= bottom + 2);
      // The motor never holds quite a constant speed, and takes a moment to change it.
      const target = cruise * (onGraphic ? GRAPHIC_SPEED : 1) * (1 + 0.05 * Math.sin(t * Math.PI * 14));
      speed += (target - speed) * Math.min(1, dt / 120);
      fed = Math.min(height, fed + speed * dt);
      // The longer the slip hangs, the more it sways, pivoting at the mouth.
      sway = 0.4 * Math.sin(t * Math.PI * 1.3) * (fed / height);
      img.style.transformOrigin = `50% ${(height - fed).toFixed(1)}px`;
      img.style.transform = `translate3d(0, ${(fed - height).toFixed(2)}px, 0) rotate(${sway.toFixed(3)}deg)`;
      if (hum.current) hum.current.style.transform = `translate3d(0, ${(Math.sin(now / 9) * 0.4).toFixed(2)}px, 0)`;
      if (fed < height) {
        raf = requestAnimationFrame(feed);
        return;
      }

      // Cut: a tick from the printer, and the slip bobs as it comes free.
      if (hum.current) {
        hum.current.style.transform = 'none';
        hum.current.animate?.(
          [{ transform: 'translateY(0)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }],
          { duration: 160, easing: 'ease-out' },
        );
      }
      img.style.transformOrigin = '50% 0';
      img.style.transform = 'translate3d(0, 0, 0)';
      img.animate?.(
        [
          { transform: `rotate(${sway.toFixed(3)}deg)` },
          { transform: 'translate3d(0, 2px, 0) rotate(-0.8deg)' },
          { transform: 'rotate(0.4deg)' },
          { transform: 'rotate(-0.12deg)' },
          { transform: 'rotate(0deg)' },
        ],
        { duration: 900, easing: 'ease-out' },
      );
      setPhase('cut');
      timers.push(setTimeout(() => setPhase('lifting'), CUT_MS));
      timers.push(setTimeout(() => gone.current?.(), CUT_MS + LIFT_MS));
    };

    // A moment to wake up before the paper starts to move.
    timers.push(setTimeout(() => {
      setPhase('printing');
      raf = requestAnimationFrame(feed);
    }, WAKE_MS));
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, [src, height]);

  if (!rect) return null;
  const printerWidth = paperWidth + 28;
  const lifting = phase === 'lifting';
  const working = phase === 'waking' || phase === 'printing';

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {src && (
        <div className="absolute overflow-hidden" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height + 8 }}>
          <img
            ref={paper}
            src={src}
            alt=""
            draggable={false}
            className="block select-none"
            style={{ width: rect.width, height: rect.height, transform: 'translate3d(0, -100%, 0)', transformOrigin: '50% 0' }}
          />
          {/* Shade on the paper where it leaves the mouth. */}
          <span
            className="absolute top-0 h-6 transition-opacity duration-500"
            style={{
              left: (rect.width - paperWidth) / 2,
              width: paperWidth,
              background: 'linear-gradient(180deg, rgba(10,10,14,.3), rgba(10,10,14,0))',
              opacity: phase === 'printing' || phase === 'cut' ? 1 : 0,
            }}
          />
        </div>
      )}

      <div
        className="absolute"
        style={{
          left: rect.left + rect.width / 2 - printerWidth / 2,
          top: rect.top + lip - BODY,
          width: printerWidth,
          height: BODY,
          transform: lifting ? `translate3d(0, ${-(rect.top + lip + 40)}px, 0)` : 'none',
          opacity: lifting ? 0 : 1,
          transition: `transform ${LIFT_MS}ms cubic-bezier(.5,0,.75,.15), opacity ${LIFT_MS}ms ease-in`,
        }}
      >
        <div ref={hum} className="absolute inset-0">
          <div
            className="absolute inset-0 rounded-[16px] border border-white/[0.08]"
            style={{
              background: 'linear-gradient(180deg, #26262d 0%, #17171c 45%, #0e0e12 100%)',
              boxShadow: '0 18px 30px -14px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.1)',
            }}
          />
          {/* The mouth the paper comes out of, warm while it prints. */}
          <span className="absolute inset-x-[7%] bottom-[5px] h-1 rounded-full bg-black shadow-[inset_0_1px_2px_rgba(0,0,0,.9),0_1px_0_rgba(255,255,255,.1)]" />
          <span
            className="absolute inset-x-[16%] bottom-[6px] h-px transition-opacity duration-300"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,226,190,.7), transparent)', opacity: phase === 'printing' ? 1 : 0 }}
          />
          <span className="absolute left-4 top-3 h-[3px] w-8 rounded-full bg-white/[0.07]" />
          <span
            className={`absolute right-4 top-[11px] h-[5px] w-[5px] rounded-full ${working ? 'animate-pulse bg-[#7CE0B0] shadow-[0_0_8px_#7CE0B0]' : 'bg-[#7CE0B0]/60'}`}
          />
        </div>
      </div>
    </div>
  );
}
