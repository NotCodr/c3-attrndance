import React, { useEffect, useRef, useState } from 'react';

const TEAR_MS = 280;
const LIFT_MS = 560;
const BODY = 58;

/**
 * A slim receipt printer that feeds the slip out a line at a time, gives it a
 * tug as it tears, and lifts away when `release` turns on.
 *
 * `rect` is where the printed slip ends up within the stage (px); the printer
 * sits over its top edge, covering the first `lip` px. With `keepPaper` the
 * slip stays once the printer has gone; otherwise it is hidden
 * `hidePaperAfter` ms into the release, once whatever takes over is showing.
 */
export default function ReceiptPrinter({
  src, rect, paperWidth, lip = 14, release = false, keepPaper = false, hidePaperAfter = 0, onPrinted, onReleased,
}) {
  const paper = useRef(null);
  const [printing, setPrinting] = useState(true);
  const [paperHidden, setPaperHidden] = useState(false);
  const [lifted, setLifted] = useState(false);
  const callbacks = useRef({ onPrinted, onReleased });
  callbacks.current = { onPrinted, onReleased };
  const height = rect?.height || 0;

  useEffect(() => {
    const img = paper.current;
    if (!img || !height) return undefined;
    const duration = Math.min(2600, Math.max(1500, height * 3));
    const line = Math.max(3, Math.round(height / 110));
    const start = performance.now();
    let raf = 0;
    let timer = 0;
    const feed = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const fed = Math.min(height, Math.floor((t * height) / line) * line);
      // A line at a time, with the faint shudder of the print head.
      img.style.transform = `translate3d(${((Math.random() - 0.5) * 0.7).toFixed(2)}px, ${fed - height}px, 0)`;
      if (t < 1) {
        raf = requestAnimationFrame(feed);
        return;
      }
      img.style.transform = 'translate3d(0, 0, 0)';
      setPrinting(false);
      img.animate?.(
        [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-1.4deg)' }, { transform: 'rotate(0.9deg)' }, { transform: 'rotate(0deg)' }],
        { duration: TEAR_MS, easing: 'ease-out' },
      );
      timer = setTimeout(() => callbacks.current.onPrinted?.(), TEAR_MS);
    };
    raf = requestAnimationFrame(feed);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [src, height]);

  useEffect(() => {
    if (!release) return undefined;
    const hide = keepPaper || !hidePaperAfter ? 0 : setTimeout(() => setPaperHidden(true), hidePaperAfter);
    const lift = setTimeout(() => {
      setLifted(true);
      callbacks.current.onReleased?.();
    }, LIFT_MS);
    return () => {
      clearTimeout(hide);
      clearTimeout(lift);
    };
  }, [release, keepPaper, hidePaperAfter]);

  if (!rect) return null;
  const printerWidth = paperWidth + 28;
  const printerTop = rect.top + lip - BODY;
  // Without a delay the slip goes in the same render the release arrives in.
  const hidden = paperHidden || (release && !keepPaper && !hidePaperAfter);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* Until there's a slip to print, the printer just waits, light blinking. */}
      {src && (
        <div
          className="absolute overflow-hidden"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, visibility: hidden ? 'hidden' : 'visible' }}
        >
          <img
            ref={paper}
            src={src}
            alt=""
            draggable={false}
            className="block h-full w-full select-none"
            style={{ transform: 'translate3d(0, -100%, 0)', transformOrigin: '50% 0' }}
          />
        </div>
      )}

      {!lifted && (
        <div
          className="absolute"
          style={{
            left: rect.left + rect.width / 2 - printerWidth / 2,
            top: printerTop,
            width: printerWidth,
            height: BODY,
            transform: release ? `translate3d(0, ${-(rect.top + lip + 30)}px, 0)` : 'none',
            opacity: release ? 0 : 1,
            transition: `transform ${LIFT_MS}ms cubic-bezier(.55,0,.8,.2), opacity ${LIFT_MS}ms ease-in`,
          }}
        >
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
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,226,190,.7), transparent)', opacity: printing ? 1 : 0 }}
          />
          <span className="absolute left-4 top-3 h-[3px] w-8 rounded-full bg-white/[0.07]" />
          <span
            className={`absolute right-4 top-[11px] h-[5px] w-[5px] rounded-full ${printing ? 'animate-pulse bg-[#7CE0B0] shadow-[0_0_8px_#7CE0B0]' : 'bg-[#7CE0B0]/60'}`}
          />
        </div>
      )}
    </div>
  );
}
