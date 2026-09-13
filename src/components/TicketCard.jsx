import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring,
} from 'motion/react';
import { Clock, Crown, Flame, MapPin, Maximize2, Repeat, Sparkles, X } from 'lucide-react';
import { formatDate, formatTime, MEL_TZ } from '@/lib/format';
import { countdown, editionFor, loyaltyFor, ticketNumber } from '@/lib/ticket';

const EASE = [0.16, 1, 0.3, 1];
const LOYALTY_ICONS = { first: Sparkles, returning: Repeat, regular: Flame, legend: Crown };

function dateParts(iso) {
  const f = (opts) => new Date(iso).toLocaleDateString('en-AU', { timeZone: MEL_TZ, ...opts });
  return { month: f({ month: 'short' }).replace('.', '').toUpperCase(), day: f({ day: 'numeric' }), weekday: f({ weekday: 'short' }) };
}

function timeText(event) {
  const sameDay = event.ends_at
    && new Date(event.starts_at).toLocaleDateString('en-AU', { timeZone: MEL_TZ })
      === new Date(event.ends_at).toLocaleDateString('en-AU', { timeZone: MEL_TZ });
  if (!event.ends_at) return formatTime(event.starts_at);
  return sameDay
    ? `${formatTime(event.starts_at)} to ${formatTime(event.ends_at)}`
    : `${formatTime(event.starts_at)} to ${formatDate(event.ends_at, { weekday: undefined, year: undefined })}`;
}

function stateOf({ rsvp, event }) {
  if (event.status === 'cancelled') return 'event-cancelled';
  if (rsvp.status === 'cancelled') return 'cancelled';
  if (rsvp.checked_in_at) return 'admitted';
  if (rsvp.status === 'waitlisted') return 'waitlisted';
  if (event.ends_at && new Date(event.ends_at) < new Date()) return 'ended';
  return 'valid';
}

/**
 * The attendee's ticket, shared by the moment after RSVPing and the ticket page
 * so the two are the same object.
 *
 * It behaves like something worth keeping: minted as one of a few colourways
 * (a rare Holo among them) that the page takes on, numbered in sign-up order,
 * tilting and catching the light under the pointer, counting down to the start,
 * and stamped once it has been scanned at the door. `reveal` plays the printing
 * animation for the first time it appears.
 */
export default function TicketCard({ data, qrDataUrl, reveal = false }) {
  const { rsvp, event, club, ticket } = data;
  const reduce = useReducedMotion();
  const edition = editionFor(rsvp.rsvp_token);
  const state = stateOf(data);
  const number = ticketNumber(ticket?.number);
  const loyalty = loyaltyFor(ticket?.club_visits, club?.name);
  const LoyaltyIcon = loyalty ? LOYALTY_ICONS[loyalty.level] : null;
  const date = dateParts(event.starts_at);
  const [zoom, setZoom] = useState(false);

  // Notches either side of the perforation, cut with a mask so the moving
  // background shows through them.
  const topRef = useRef(null);
  const [notch, setNotch] = useState(null);
  useLayoutEffect(() => {
    const el = topRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setNotch(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mask = notch == null ? undefined
    : `radial-gradient(circle 13px at 0 ${notch}px, transparent 12.5px, #000 13px) left / 51% 100% no-repeat,
       radial-gradient(circle 13px at 100% ${notch}px, transparent 12.5px, #000 13px) right / 51% 100% no-repeat`;

  // Tilt and glare follow a mouse or pen. Touch scrolls the page instead.
  const cardRef = useRef(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const gx = useMotionValue(50);
  const gy = useMotionValue(25);
  const rotateX = useSpring(rx, { stiffness: 170, damping: 18 });
  const rotateY = useSpring(ry, { stiffness: 170, damping: 18 });
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.55), rgba(255,255,255,0) 42%)`;
  const onMove = (e) => {
    if (reduce || e.pointerType === 'touch' || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 16);
    rx.set((0.5 - py) * 12);
    gx.set(px * 100);
    gy.set(py * 100);
  };
  const onLeave = () => { rx.set(0); ry.set(0); gx.set(50); gy.set(25); };

  const printing = reveal && !reduce;

  return (
    <div className="relative mx-auto w-full max-w-[380px]" style={{ filter: 'drop-shadow(0 30px 38px rgba(18, 0, 56, 0.5))' }}>
      <motion.div
        ref={cardRef}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ rotateX, rotateY, transformPerspective: 1100 }}
        initial={printing ? { clipPath: 'inset(0% 0% 100% 0% round 28px)', y: -28 } : reveal ? { opacity: 0 } : false}
        animate={printing ? { clipPath: 'inset(0% 0% 0% 0% round 28px)', y: 0 } : { opacity: 1 }}
        transition={{ duration: printing ? 1.05 : 0.4, delay: printing ? 0.35 : 0, ease: EASE }}
      >
        <div className="relative overflow-hidden rounded-[28px] bg-white text-foreground" style={{ WebkitMask: mask, mask }}>
          <div ref={topRef}>
            <div className="relative overflow-hidden px-6 pb-5 pt-5 text-white" style={{ backgroundImage: edition.foil }}>
              {edition.rare && (
                <div aria-hidden="true" className="c3-holo absolute inset-0 opacity-70 mix-blend-overlay" style={{ backgroundImage: edition.foil }} />
              )}
              <span aria-hidden="true" className="c3-foil-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              {/* Pale foils (Holo) need more shade under the white type. */}
              <div
                aria-hidden="true"
                className={`absolute inset-0 bg-gradient-to-b ${edition.rare
                  ? 'from-[#1a0540]/25 via-[#1a0540]/35 to-[#1a0540]/65'
                  : 'from-black/0 via-black/0 to-[#1a0540]/35'}`}
              />

              <div className="relative flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ring-white/40 backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5" />
                  {edition.name} edition
                  {edition.rare && <span className="rounded-full bg-white px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-[#6f2bff]">rare</span>}
                </span>
                <span className="font-mono text-[10px] font-semibold tracking-[0.24em] text-white [text-shadow:0_1px_8px_rgba(26,5,64,0.5)]">ADMIT ONE</span>
              </div>

              <div className="relative mt-5 flex items-center gap-2.5">
                {club?.logo_url
                  ? <img src={club.logo_url} alt="" className="h-7 w-7 rounded-lg object-cover ring-1 ring-white/50" />
                  : <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/25 text-xs font-bold">{(club?.name || '?').slice(0, 1)}</span>}
                <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-white [text-shadow:0_1px_8px_rgba(26,5,64,0.5)]">{club?.name}</p>
              </div>
              <h2 className="relative mt-2 text-balance font-display text-[1.7rem] font-bold leading-[1.08] text-white [text-shadow:0_2px_16px_rgba(40,0,90,0.35)]">
                {event.title}
              </h2>
            </div>

            <div className="px-6 pb-5 pt-5">
              <div className="flex items-stretch gap-4">
                <div className="w-[4.25rem] shrink-0 overflow-hidden rounded-2xl bg-secondary text-center ring-1 ring-inset ring-border">
                  <p className="bg-primary py-1 text-[10px] font-bold tracking-[0.18em] text-white">{date.month}</p>
                  <p className="font-display text-3xl font-bold leading-tight">{date.day}</p>
                  <p className="pb-1 text-[10px] font-semibold uppercase text-muted-foreground">{date.weekday}</p>
                </div>
                <div className="flex min-w-0 flex-col justify-center gap-1.5 text-sm">
                  <p className="flex items-center gap-2 font-medium"><Clock className="h-4 w-4 shrink-0 text-primary" />{timeText(event)}</p>
                  <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{event.location_name}</span>
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Guest</p>
                  <p className="truncate font-display text-lg font-semibold">{rsvp.full_name}</p>
                </div>
                {number && (
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ticket</p>
                    <p className="font-mono text-lg font-bold tabular-nums text-primary">{number}</p>
                  </div>
                )}
              </div>

              {loyalty && (
                <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium">
                  <LoyaltyIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">{loyalty.label}</span>
                  {loyalty.tag && (
                    <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{loyalty.tag}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div aria-hidden="true" className="mx-6 border-t-2 border-dashed border-border" />

          <div className="px-6 pb-6 pt-5 text-center">
            <Stub state={state} data={data} qrDataUrl={qrDataUrl} onZoom={() => setZoom(true)} reduce={reduce} />
          </div>

          {!reduce && (
            <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 mix-blend-soft-light" style={{ background: glare }} />
          )}
        </div>
      </motion.div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {zoom && qrDataUrl && (
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Your check-in QR code"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setZoom(false)}
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white px-6 text-center text-foreground"
            >
              <button type="button" onClick={() => setZoom(false)} className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-secondary" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{club?.name}</p>
              <p className="mt-1 max-w-sm text-balance font-display text-2xl font-bold">{event.title}</p>
              <motion.img
                initial={reduce ? false : { scale: 0.9 }}
                animate={{ scale: 1 }}
                src={qrDataUrl}
                alt="Your check-in QR code"
                className="mt-6 aspect-square w-full max-w-[22rem]"
              />
              <p className="mt-5 font-display text-lg font-semibold">{rsvp.full_name}{number && <span className="ml-2 font-mono text-primary">{number}</span>}</p>
              <p className="mt-1 text-sm text-muted-foreground">Turn your screen brightness up for the scanner.</p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function Stub({ state, data, qrDataUrl, onZoom, reduce }) {
  const { rsvp, event, ticket } = data;

  if (state === 'valid') {
    return (
      <>
        <button
          type="button"
          onClick={onZoom}
          disabled={!qrDataUrl}
          aria-label="Enlarge your QR code"
          className="group relative mx-auto block rounded-2xl bg-white p-2.5 ring-1 ring-border transition hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {qrDataUrl
            ? <img src={qrDataUrl} alt="Your check-in QR code" className="h-44 w-44" />
            : <div className="h-44 w-44 animate-pulse rounded-lg bg-secondary" />}
          <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-primary text-white shadow-md transition group-hover:scale-110">
            <Maximize2 className="h-3.5 w-3.5" />
          </span>
        </button>
        <p className="mt-3 text-xs text-muted-foreground">Show this at the door. Tap it to go full screen.</p>
        <Countdown event={event} />
      </>
    );
  }

  if (state === 'admitted') {
    return (
      <>
        <Stamp label="Admitted" tone="#6f2bff" reduce={reduce} />
        <p className="mt-4 text-sm font-medium">Checked in at {formatTime(rsvp.checked_in_at)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Enjoy the event.</p>
      </>
    );
  }

  if (state === 'waitlisted') {
    return (
      <>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your place in line</p>
        <p className="mt-1 font-display text-6xl font-bold tabular-nums text-primary">
          {ticket?.waitlist_position ? `#${ticket.waitlist_position}` : 'Waitlist'}
        </p>
        <p className="mx-auto mt-2 max-w-[16rem] text-sm text-muted-foreground">
          The event is full. We'll email you the moment a spot opens up for you.
        </p>
        <Countdown event={event} />
      </>
    );
  }

  if (state === 'cancelled') {
    return (
      <>
        <Stamp label="Void" tone="#8a8599" reduce={reduce} />
        <p className="mt-4 text-sm text-muted-foreground">You cancelled this ticket. Changed your mind? RSVP again from the event page.</p>
      </>
    );
  }

  if (state === 'event-cancelled') {
    return (
      <>
        <Stamp label="Cancelled" tone="#e5484d" reduce={reduce} />
        <p className="mt-4 text-sm text-muted-foreground">The club called this event off. You don't need to do anything.</p>
      </>
    );
  }

  return <p className="py-6 text-sm text-muted-foreground">This event has ended. Thanks for coming along.</p>;
}

/** A rubber stamp that lands on the ticket. */
function Stamp({ label, tone, reduce }) {
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.9, rotate: -24 }}
      animate={{ opacity: 1, scale: 1, rotate: -9 }}
      transition={reduce ? { duration: 0.3 } : { type: 'spring', stiffness: 420, damping: 16, delay: 0.25 }}
      className="mx-auto mt-2 inline-block rounded-2xl p-1.5"
      style={{ border: `3px solid ${tone}`, color: tone }}
    >
      <div className="rounded-xl px-6 py-2.5" style={{ border: `1.5px solid ${tone}` }}>
        <p className="font-display text-3xl font-bold uppercase tracking-[0.14em]">{label}</p>
      </div>
    </motion.div>
  );
}

function Countdown({ event }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const c = countdown(event.starts_at, event.ends_at, now);

  if (c.phase === 'ended') return null;
  if (c.phase === 'live') {
    return (
      <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Happening now
      </div>
    );
  }

  const units = c.days > 0
    ? [[c.days, c.days === 1 ? 'day' : 'days'], [c.hours, 'hrs'], [c.minutes, 'min']]
    : [[c.hours, 'hrs'], [c.minutes, 'min'], [c.seconds, 'sec']];
  return (
    <div className="mt-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Starts in</p>
      <div className="mt-2 flex justify-center gap-2">
        {units.map(([value, unit]) => (
          <div key={unit} className="w-16 rounded-xl bg-[#14082e] py-2 text-white shadow-inner">
            <p className="font-mono text-xl font-bold tabular-nums">{String(value).padStart(2, '0')}</p>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-white/60">{unit}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
