import React, { Suspense, lazy, useMemo } from 'react';

// Loaded on demand: WebGL is only needed here, and the page should not wait
// for it. Until it arrives, the same colours sit behind the page as a CSS
// gradient.
const Grainient = lazy(() => import('@/components/Grainient'));

/**
 * The moving background behind the public event page.
 *
 * Grainient, anchored on its own violet, and a little different on every visit:
 * one of a few hand-picked colour sets, a different blend angle and centre, and
 * a different starting point in the animation. The choices are bounded rather
 * than random hues, so the page is always on brand and never muddy.
 */
const PALETTES = [
  { color1: '#FF9FFC', color2: '#5227FF', color3: '#B497CF' }, // orchid, the React Bits original
  { color1: '#A9D6FF', color2: '#5227FF', color3: '#B497CF' }, // lagoon
  { color1: '#FFB8D9', color2: '#4B2BEA', color3: '#9C8CF0' }, // dusk
  { color1: '#FF8FB8', color2: '#3D1FD1', color3: '#A78BFA' }, // berry
];

const rand = (min, max) => min + Math.random() * (max - min);

export default function EventBackdrop() {
  // One look per mount, stable across re-renders so typing in the form does not
  // reshuffle the background.
  const look = useMemo(() => ({
    ...PALETTES[Math.floor(Math.random() * PALETTES.length)],
    blendAngle: rand(-35, 35),
    centerX: rand(-0.12, 0.12),
    centerY: rand(-0.1, 0.1),
    timeOffset: rand(0, 120),
  }), []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10"
      style={{ background: `linear-gradient(${135 + look.blendAngle}deg, ${look.color3}, ${look.color2} 55%, ${look.color1})` }}
    >
      <Suspense fallback={null}>
        <Grainient {...look} />
      </Suspense>
      {/* Enough shade at the top for white headline text over the lightest
          part of the gradient, fading out before the form. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#14003c]/35 via-[#14003c]/10 to-transparent" />
    </div>
  );
}
