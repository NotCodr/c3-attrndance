import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin } from 'lucide-react';

/**
 * The moment after someone RSVPs.
 *
 * Deliberately not confetti. The effect is physical rather than decorative: a
 * single ring leaves the point of confirmation, a tick draws itself, and the
 * ticket assembles underneath in a short stagger. It reads as "the thing you
 * pressed produced this thing" instead of "a party happened at you", and it is
 * over in about a second so it never gets tiring on a second visit.
 *
 * Every motion value collapses to a plain fade when the visitor has asked for
 * reduced motion.
 */

const EASE = [0.16, 1, 0.3, 1];

export default function ConfirmedTicket({ status, email, qrDataUrl, ticketToken, event, club, whenText }) {
  const reduce = useReducedMotion();
  const waitlisted = status === 'waitlisted';
  const [ringGone, setRingGone] = useState(reduce);

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setRingGone(true), 1200);
    return () => clearTimeout(t);
  }, [reduce]);

  const stagger = (i) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay: reduce ? 0 : 0.28 + i * 0.07, ease: EASE },
  });

  return (
    <motion.div
      layout
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={reduce ? { duration: 0.3 } : { type: 'spring', stiffness: 260, damping: 24, mass: 0.9 }}
      className="relative c3-card p-7 sm:p-9 text-center overflow-hidden"
    >
      {/* A single pulse of colour behind the mark, then gone. */}
      {!ringGone && (
        <span
          aria-hidden="true"
          className="c3-ring absolute left-1/2 top-16 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full"
          style={{ background: 'radial-gradient(circle, hsl(var(--c3-purple) / 0.55), transparent 65%)' }}
        />
      )}

      <Mark waitlisted={waitlisted} reduce={reduce} />

      <motion.h2 {...stagger(0)} className="font-display font-bold text-2xl sm:text-3xl mt-5 mb-1.5">
        {waitlisted ? "You're on the waitlist" : "You're going"}
      </motion.h2>

      <motion.div {...stagger(0)} className="mb-1.5">
        {club?.name && <p className="text-xs font-semibold text-primary tracking-wider uppercase">{club.name}</p>}
        <p className="font-display font-bold text-lg text-balance">{event.title}</p>
      </motion.div>

      <motion.p {...stagger(1)} className="text-sm text-muted-foreground max-w-xs mx-auto">
        {waitlisted
          ? 'The event is full for now. We will email you the moment a place opens up.'
          : 'Show the code below at the door. We have emailed you a copy.'}
      </motion.p>

      <motion.div {...stagger(2)} className="mt-6 mb-6 grid gap-1.5 text-sm text-left max-w-xs mx-auto">
        <Detail icon={Calendar}>{whenText}</Detail>
        <Detail icon={MapPin}>{event.location_name}</Detail>
      </motion.div>

      {!waitlisted && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, delay: reduce ? 0 : 0.5, ease: EASE }}
          className="inline-block bg-white p-3 rounded-2xl shadow-lg shadow-black/5"
        >
          {qrDataUrl
            ? <img src={qrDataUrl} alt="Your check-in QR code" className="w-52 h-52 sm:w-56 sm:h-56" />
            : <div className="w-52 h-52 sm:w-56 sm:h-56 animate-pulse bg-black/5 rounded-lg" />}
        </motion.div>
      )}

      <motion.p {...stagger(4)} className="text-xs text-muted-foreground mt-6">
        Sent to <span className="text-foreground">{email}</span>
      </motion.p>

      {ticketToken && (
        <motion.div {...stagger(5)} className="mt-5">
          <Link to={`/ticket?t=${encodeURIComponent(ticketToken)}`} className="c3-btn-secondary text-xs">
            open my ticket
          </Link>
          <p className="text-[11px] text-muted-foreground mt-2.5">
            {waitlisted ? 'Check your place any time from this link.' : 'Lost the tab? This link always has your code.'}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

/** A tick that draws itself, or a clock for the waitlist. */
function Mark({ waitlisted, reduce }) {
  if (waitlisted) {
    return (
      <motion.div
        initial={reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0.3 } : { type: 'spring', stiffness: 380, damping: 18, delay: 0.1 }}
        className="w-16 h-16 mx-auto rounded-2xl bg-secondary border-2 border-border flex items-center justify-center"
      >
        <Clock className="w-8 h-8 text-muted-foreground" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={reduce ? { duration: 0.3 } : { type: 'spring', stiffness: 380, damping: 17, delay: 0.08 }}
      className="w-16 h-16 mx-auto rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30"
    >
      <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" aria-hidden="true">
        <motion.path
          d="M4.5 12.5l5 5 10-10"
          stroke="hsl(var(--primary-foreground))"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.42, delay: reduce ? 0 : 0.24, ease: EASE }}
        />
      </svg>
    </motion.div>
  );
}

function Detail({ icon: Icon, children }) {
  return (
    <p className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <span>{children}</span>
    </p>
  );
}
