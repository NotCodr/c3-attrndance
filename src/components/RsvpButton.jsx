import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Loader2 } from 'lucide-react';

/**
 * The primary action on the public event page.
 *
 * Three things do the work: a gradient that shifts on hover, a sheen that sweeps
 * across on a slow loop to signal it is the live control on the page, and a real
 * press response. The press uses a spring rather than a duration so it feels
 * like pushing something with mass instead of playing a canned animation.
 *
 * The label swaps through AnimatePresence so the width change is animated
 * instead of snapping when it becomes a spinner.
 */
export default function RsvpButton({ submitting, disabled, children = 'RSVP' }) {
  const reduce = useReducedMotion();

  return (
    <motion.button
      type="submit"
      disabled={disabled || submitting}
      whileHover={reduce || disabled ? undefined : { y: -2 }}
      whileTap={reduce || disabled ? undefined : { y: 1, scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="group relative w-full overflow-hidden rounded-xl px-6 py-4
                 text-base font-semibold text-primary-foreground
                 border-2 border-[hsl(var(--c3-purple-deep))]
                 shadow-[0_4px_0_0_hsl(var(--c3-purple-deep))]
                 disabled:opacity-60 disabled:shadow-none disabled:cursor-not-allowed
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
                 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{
        backgroundImage:
          'linear-gradient(110deg, hsl(var(--c3-purple)) 0%, hsl(var(--c3-purple-deep)) 45%, hsl(var(--c3-purple)) 100%)',
        backgroundSize: '200% 100%',
        transition: 'background-position .5s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundPosition = '100% 0'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundPosition = '0 0'; }}
    >
      {/* Sheen. Purely decorative and never intercepts a tap. */}
      {!disabled && !submitting && !reduce && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <span className="c3-sheen absolute inset-y-0 -left-1/3 w-1/3 bg-white/25 blur-md" />
        </span>
      )}

      <span className="relative flex items-center justify-center gap-2 min-h-[1.5rem]">
        <AnimatePresence mode="wait" initial={false}>
          {submitting ? (
            <motion.span
              key="loading"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin" /> saving your place
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2"
            >
              {children}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </motion.button>
  );
}
