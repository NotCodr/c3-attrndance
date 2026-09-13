import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { randomPalette } from '@/lib/ticket';

// Loaded on demand: WebGL is only needed here, and the page should not wait
// for it. Until it arrives the same colours sit behind the page as a gradient.
const Grainient = lazy(() => import('@/components/Grainient'));

const rand = (min, max) => min + Math.random() * (max - min);
const colorsOf = (p) => ({ color1: p.color1, color2: p.color2, color3: p.color3 });

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const channel = (shift) => {
    const x = (pa >> shift) & 255;
    const y = (pb >> shift) & 255;
    return Math.round(x + (y - x) * t);
  };
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}

/**
 * The moving background behind the attendee pages: Grainient, a little
 * different on every visit (angle, centre, starting point).
 *
 * Without a `palette` it picks one of the common colourways at random. Given
 * one, it takes it on, and when the palette changes (an RSVP minting a ticket)
 * it glides between the two over about a second instead of cutting.
 */
export default function EventBackdrop({ palette }) {
  const reduce = useReducedMotion();
  const layout = useMemo(() => ({
    blendAngle: rand(-35, 35),
    centerX: rand(-0.12, 0.12),
    centerY: rand(-0.1, 0.1),
    timeOffset: rand(0, 120),
  }), []);
  const [colors, setColors] = useState(() => colorsOf(palette || randomPalette()));
  const current = useRef(colors);
  current.current = colors;

  useEffect(() => {
    if (!palette) return undefined;
    const from = current.current;
    const to = colorsOf(palette);
    if (from.color1 === to.color1 && from.color2 === to.color2 && from.color3 === to.color3) return undefined;
    if (reduce) {
      setColors(to);
      return undefined;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 1100);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
      setColors({
        color1: mixHex(from.color1, to.color1, eased),
        color2: mixHex(from.color2, to.color2, eased),
        color3: mixHex(from.color3, to.color3, eased),
      });
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [palette?.color1, palette?.color2, palette?.color3, reduce]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10"
      style={{ background: `linear-gradient(${135 + layout.blendAngle}deg, ${colors.color3}, ${colors.color2} 55%, ${colors.color1})` }}
    >
      <Suspense fallback={null}>
        <Grainient {...layout} {...colors} />
      </Suspense>
      {/* Shade at the top for white headline text, fading out further down. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#14003c]/40 via-[#14003c]/10 to-[#14003c]/25" />
    </div>
  );
}
