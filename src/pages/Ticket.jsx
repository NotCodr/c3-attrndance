import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import QRCode from 'qrcode';
import { AlertTriangle, Info, Loader2, Navigation, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { countdown, mapsUrl } from '@/lib/ticket';
import { ticketState } from '@/lib/receipt';
import EventShell, { GlassButton, GlassCard } from '@/components/EventShell';
import CrtButton from '@/components/CrtButton';
import AddToCalendar from '@/components/AddToCalendar';
import QrOverlay from '@/components/QrOverlay';
import LanyardTicket, { preloadLanyard } from '@/components/lanyard/LanyardTicket';

const EASE = [0.16, 1, 0.3, 1];

/**
 * An attendee's ticket, reachable from the link in their confirmation email.
 *
 * The token in the URL is the credential for this one RSVP, which is why no
 * sign-in is involved: attendees are not users of the app. The ticket is a
 * receipt clipped to a lanyard on a dark stage; tapping it, or the button
 * below, puts the QR full screen for the scanner at the door.
 */
export default function Ticket() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const reduce = useReducedMotion();

  const [data, setData] = useState(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const load = async () => {
    try {
      const result = await api.call('rsvp-lookup', { token }, { auth: false });
      // Made before the ticket shows, so the paper is only printed once.
      let code = '';
      if (result.rsvp.status === 'confirmed' && !result.rsvp.checked_in_at) {
        const url = `${window.location.origin}/rsvp/${result.event.id}#token=${result.rsvp.rsvp_token}`;
        code = await QRCode.toDataURL(url, { width: 640, margin: 1, color: { dark: '#0A0A0F', light: '#FFFFFF' } });
      }
      setQr(code);
      setData(result);
    } catch (err) {
      setError(err.message || 'This ticket link is not valid.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setError('This ticket link is missing its code.');
      setLoading(false);
      return;
    }
    preloadLanyard();
    load();
  }, [token]);

  const cancel = async () => {
    setCancelling(true);
    try {
      await api.call('rsvp-cancel', { token }, { auth: false });
      toast.success('Your place has been cancelled.');
      setConfirming(false);
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not cancel.');
    } finally {
      setCancelling(false);
    }
  };

  const nav = (
    <Link to="/explore" className="rounded-full px-2 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[#9A9AA3] transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
      More events
    </Link>
  );

  if (loading) {
    return (
      <EventShell tone="dark" navRight={nav}>
        <div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>
      </EventShell>
    );
  }

  if (error) {
    return (
      <EventShell tone="dark" navRight={nav}>
        <main className="mx-auto grid min-h-[70vh] max-w-sm place-items-center px-5">
          <GlassCard className="w-full p-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h1 className="font-display text-xl font-bold">We couldn't open that ticket</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <p className="mt-3 text-xs text-muted-foreground">Open the link straight from your confirmation email, or RSVP again for a new one.</p>
            <CrtButton to="/explore" size="sm" className="mt-6">Find events</CrtButton>
          </GlassCard>
        </main>
      </EventShell>
    );
  }

  const { rsvp, event } = data;
  const state = ticketState(data);
  const live = state === 'valid' || state === 'waitlisted' || state === 'admitted';
  const canCancel = state === 'valid' || state === 'waitlisted';
  const ticketLink = `${window.location.origin}/ticket?t=${encodeURIComponent(rsvp.rsvp_token)}`;
  const fade = (i) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay: reduce ? 0 : 0.5 + i * 0.08, ease: EASE },
  });

  return (
    <EventShell tone="dark" navRight={nav}>
      <main>
        <h1 className="sr-only">Your ticket for {event.title}</h1>
        <LanyardTicket data={data} qrDataUrl={qr} onShowQr={() => setShowQr(true)} />

        <div className="mx-auto max-w-md px-5 pb-16">
          {(state === 'valid' || state === 'waitlisted') && (
            <motion.div {...fade(0)}><Countdown event={event} /></motion.div>
          )}

          {live && (
            <motion.div {...fade(1)} className="mt-6 grid gap-3">
              {state === 'valid' && qr && (
                <CrtButton onClick={() => setShowQr(true)} className="w-full"><QrCode className="h-4 w-4" /> Show my QR</CrtButton>
              )}
              {!rsvp.checked_in_at && (
                <AddToCalendar event={event} url={ticketLink} variant={state === 'valid' ? undefined : 'crt'} placement="top" />
              )}
              <div className="grid grid-cols-2 gap-3">
                <GlassButton href={mapsUrl(event)} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /> Directions</GlassButton>
                <GlassButton to={`/rsvp/${event.id}`}><Info className="h-4 w-4" /> Event page</GlassButton>
              </div>
            </motion.div>
          )}

          <motion.div {...fade(2)} className="mt-7 text-center text-xs text-[#9A9AA3]">
            <p>Booked as {rsvp.full_name} · {rsvp.email}</p>
            {canCancel && !confirming && (
              <button type="button" onClick={() => setConfirming(true)} className="mt-3 underline-offset-4 hover:text-white hover:underline">
                {rsvp.status === 'waitlisted' ? 'Leave the waitlist' : "Can't make it? Cancel my place"}
              </button>
            )}
            {canCancel && confirming && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  disabled={cancelling}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-destructive shadow disabled:opacity-60"
                >
                  {cancelling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {rsvp.status === 'waitlisted' ? 'Yes, leave the waitlist' : 'Yes, cancel my place'}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="h-9 rounded-xl px-3 font-medium text-white hover:bg-white/10">
                  Keep it
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </main>
      <QrOverlay open={showQr} onClose={() => setShowQr(false)} qrDataUrl={qr} data={data} />
    </EventShell>
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
      <p className="flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7CE0B0]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7CE0B0] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#7CE0B0]" />
        </span>
        Happening now
      </p>
    );
  }
  const units = c.days > 0
    ? [[c.days, 'd'], [c.hours, 'h'], [c.minutes, 'm']]
    : [[c.hours, 'h'], [c.minutes, 'm'], [c.seconds, 's']];
  return (
    <div className="text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#9A9AA3]">Starts in</p>
      <p className="mt-1 font-mono text-3xl font-bold tabular-nums tracking-[0.06em] text-white">
        {units.map(([value, unit]) => `${String(value).padStart(2, '0')}${unit}`).join(' ')}
      </p>
    </div>
  );
}
