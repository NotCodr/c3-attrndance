import React, { useMemo } from 'react';

/**
 * Slow drifting colour fields, rebuilt on every mount so no two visits look the
 * same.
 *
 * The randomness is bounded rather than free: a mood picks three or four hues
 * from the brand palette that are known to sit well together, and only the
 * positions, sizes and drift paths vary. Fully random hues would eventually
 * produce something muddy, and a page an attendee opens on their way to a venue
 * should never look broken.
 *
 * Everything animates via CSS custom properties on one shared keyframe, so the
 * work stays on the compositor. There is no canvas, no WebGL and no JavaScript
 * running per frame.
 */

// Hues from the brand tokens in index.css.
const HUES = {
  purple: '257 65% 65%',
  lavender: '251 71% 85%',
  pink: '340 80% 85%',
  yellow: '45 90% 75%',
  blue: '210 85% 78%',
};

const MOODS = [
  { name: 'dawn', hues: ['lavender', 'pink', 'yellow', 'lavender'] },
  { name: 'dusk', hues: ['purple', 'blue', 'pink', 'purple'] },
  { name: 'meadow', hues: ['blue', 'lavender', 'yellow', 'blue'] },
  { name: 'orchid', hues: ['purple', 'pink', 'lavender', 'pink'] },
  { name: 'citrus', hues: ['yellow', 'pink', 'lavender', 'yellow'] },
];

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function buildBlobs() {
  const mood = pick(MOODS);
  return mood.hues.map((hue, i) => {
    // Spread the blobs across quadrants so they never all clump in one corner.
    const quadrantX = i % 2 === 0 ? rand(-10, 45) : rand(40, 95);
    const quadrantY = i < 2 ? rand(-15, 40) : rand(35, 90);
    const size = rand(38, 66);
    return {
      key: `${mood.name}-${i}`,
      hue: HUES[hue],
      left: `${quadrantX}%`,
      top: `${quadrantY}%`,
      size: `${size}vmax`,
      dx: `${rand(-14, 14)}vw`,
      dy: `${rand(-12, 12)}vh`,
      dur: `${rand(22, 40)}s`,
      delay: `${-rand(0, 20)}s`,
      blur: `${rand(45, 80)}px`,
      s1: rand(1.04, 1.2).toFixed(3),
      s2: rand(0.85, 0.98).toFixed(3),
      oMin: rand(0.6, 0.78).toFixed(2),
      oMax: rand(0.9, 1).toFixed(2),
    };
  });
}

export default function AnimatedBackdrop({ className = '' }) {
  // No dependencies: one arrangement per mount, stable across re-renders so the
  // background does not twitch every time a form field changes.
  const blobs = useMemo(buildBlobs, []);

  return (
    <div aria-hidden="true" className={`fixed inset-0 -z-10 overflow-hidden bg-background ${className}`}>
      {blobs.map((b) => (
        <div
          key={b.key}
          className="c3-blob"
          style={{
            left: b.left,
            top: b.top,
            width: b.size,
            height: b.size,
            marginLeft: `calc(${b.size} / -2)`,
            marginTop: `calc(${b.size} / -2)`,
            background: `radial-gradient(circle at 32% 30%, hsl(${b.hue}) 0%, hsl(${b.hue} / 0.55) 42%, hsl(${b.hue} / 0) 72%)`,
            '--dx': b.dx,
            '--dy': b.dy,
            '--dur': b.dur,
            '--delay': b.delay,
            '--blur': b.blur,
            '--s1': b.s1,
            '--s2': b.s2,
            '--o-min': b.oMin,
            '--o-max': b.oMax,
          }}
        />
      ))}

      {/* A slowly turning wash that keeps the field from ever looking static,
          even at the moment two blobs happen to overlap. */}
      <div
        className="absolute -inset-1/4 c3-sweep opacity-40"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, hsl(var(--c3-purple) / 0.28) 70deg, transparent 150deg, hsl(var(--c3-pink) / 0.24) 250deg, transparent 340deg)',
        }}
      />

      {/* Just enough veil to keep body text comfortable, kept off the top third
          so the headline still sits in colour. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/25 to-background/60" />
      <div className="absolute inset-0 c3-grain opacity-[0.22] mix-blend-soft-light" />
    </div>
  );
}
