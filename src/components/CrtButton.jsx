import React, { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Loader2 } from 'lucide-react';

// three.js only loads on the pages that draw these buttons.
const CRTWarp = lazy(() => import('@/components/CRTWarp'));

/**
 * The primary button on the attendee pages: a CRT plasma behind a crisp label.
 *
 * The canvas sits under the label and takes the pointer, so hovering bends the
 * signal, while clicks still land on the button itself. Until three.js arrives,
 * or where WebGL is missing, a dark violet gradient stands in. With reduced
 * motion the signal holds still.
 *
 * Renders a <button>, a router <Link> (`to`) or a plain <a> (`href`).
 */
export default function CrtButton({
  children, to, href, type = 'button', onClick, disabled = false, loading = false,
  size = 'lg', className = '', ...rest
}) {
  const reduce = useReducedMotion();
  const inert = disabled || loading;
  const pad = size === 'sm' ? 'h-11 px-5 text-sm' : 'h-14 px-7 text-base';

  const body = (
    <>
      <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(120%_140%_at_50%_0%,#3b1a78_0%,#12052b_55%,#05010a_100%)]" />
      <span className="absolute inset-0 -z-10">
        <Suspense fallback={null}>
          <CRTWarp
            color="#c755f7"
            backgroundColor="#0a0318"
            speed={0.55}
            curvature={0.18}
            scanlineStrength={0.3}
            scanlineFrequency={70}
            waveAmplitude={0.32}
            waveFrequency={2.4}
            bloom={1.35}
            bloomRadius={0.55}
            noise={0.08}
            brightness={1.3}
            pixelation={3}
            rgbShift={0.012}
            mouseReact={!reduce}
            mouseStrength={0.8}
            dpr={2}
            fps={60}
            paused={reduce || inert}
          />
        </Suspense>
      </span>
      {/* Glass: a top highlight, an inner rim, and a soft shade behind the label. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-white/[0.14] via-transparent to-black/25" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] ring-1 ring-inset ring-white/20" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-2 left-1/2 -z-10 w-3/4 -translate-x-1/2 rounded-full bg-black/35 blur-xl" />
      <span className="pointer-events-none relative flex items-center justify-center gap-2 font-semibold tracking-tight text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.55)]">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {children}
      </span>
    </>
  );

  const classes = `group relative isolate inline-flex select-none items-center justify-center overflow-hidden rounded-2xl ${pad}
    shadow-[0_10px_30px_-8px_rgba(80,20,160,0.65),0_0_0_1px_rgba(255,255,255,0.08)]
    transition-[box-shadow,opacity] duration-300 hover:shadow-[0_14px_40px_-8px_rgba(160,70,255,0.8),0_0_0_1px_rgba(255,255,255,0.14)]
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2a0f5c]
    ${inert ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'} ${className}`;

  const press = reduce || inert ? {} : {
    whileHover: { y: -2 },
    whileTap: { y: 1, scale: 0.985 },
    transition: { type: 'spring', stiffness: 500, damping: 30 },
  };

  if (to) {
    return (
      <motion.div {...press} className="inline-flex">
        <Link to={to} className={classes} {...rest}>{body}</Link>
      </motion.div>
    );
  }
  if (href) {
    return (
      <motion.a href={href} {...press} className={classes} {...rest}>{body}</motion.a>
    );
  }
  return (
    <motion.button type={type} onClick={onClick} disabled={inert} aria-busy={loading || undefined} {...press} className={classes} {...rest}>
      {body}
    </motion.button>
  );
}
