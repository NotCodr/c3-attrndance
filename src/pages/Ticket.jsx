import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { editionFor, mapsUrl } from '@/lib/ticket';
import EventShell, { GlassButton, GlassCard } from '@/components/EventShell';
import TicketCard from '@/components/TicketCard';
import CrtButton from '@/components/CrtButton';
import AddToCalendar from '@/components/AddToCalendar';
import { AlertTriangle, Info, Loader2, Navigation } from 'lucide-react';
import { toast } from 'sonner';

const EASE = [0.16, 1, 0.3, 1];

/**
 * An attendee's ticket, reachable from the link in their confirmation email.
 *
 * The token in the URL is the credential for this one RSVP, which is why no
 * sign-in is involved: attendees are not users of the app. The page wears the
 * ticket's own colourway, the same one it was minted with after RSVPing.
 */
export default function Ticket() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const reduce = useReducedMotion();
  const palette = useMemo(() => (token ? editionFor(token) : undefined), [token]);

  const [data, setData] = useState(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    try {
      const result = await api.call('rsvp-lookup', { token }, { auth: false });
      setData(result);
      if (result.rsvp.status === 'confirmed' && !result.rsvp.checked_in_at) {
        const url = `${window.location.origin}/rsvp/${result.event.id}#token=${result.rsvp.rsvp_token}`;
        setQr(await QRCode.toDataURL(url, { width: 640, margin: 1, color: { dark: '#0A0A0F', light: '#FFFFFF' } }));
      } else {
        setQr('');
      }
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

  if (loading) {
    return (
      <EventShell palette={palette}>
        <div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-white/80" /></div>
      </EventShell>
    );
  }

  if (error) {
    return (
      <EventShell palette={palette}>
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
  const ended = event.ends_at && new Date(event.ends_at) < new Date();
  const live = event.status !== 'cancelled' && rsvp.status !== 'cancelled' && !ended;
  const canCancel = live && !rsvp.checked_in_at;
  const firstName = (rsvp.full_name || '').split(' ')[0];
  const ticketLink = `${window.location.origin}/ticket?t=${encodeURIComponent(rsvp.rsvp_token)}`;
  const fade = (i) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay: reduce ? 0 : 0.1 + i * 0.08, ease: EASE },
  });

  return (
    <EventShell palette={palette} navRight={<GlassButton to="/explore" className="h-9 px-3 text-xs">More events</GlassButton>}>
      <main className="mx-auto max-w-md px-5 pb-16 pt-8 sm:pt-12">
        <motion.div {...fade(0)} className="mb-6 text-center">
          <p className="text-sm text-white/80">{firstName ? `Hi ${firstName}, here's your ticket` : "Here's your ticket"}</p>
          <h1 className="sr-only">Your ticket for {event.title}</h1>
        </motion.div>

        <TicketCard data={data} qrDataUrl={qr} reveal />

        {live && (
          <motion.div {...fade(3)} className="mt-7 grid gap-3">
            {!rsvp.checked_in_at && <AddToCalendar event={event} url={ticketLink} variant="crt" placement="top" />}
            <div className="grid grid-cols-2 gap-3">
              <GlassButton href={mapsUrl(event)} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /> Directions</GlassButton>
              <GlassButton to={`/rsvp/${event.id}`}><Info className="h-4 w-4" /> Event page</GlassButton>
            </div>
          </motion.div>
        )}

        <motion.div {...fade(4)} className="mt-7 text-center text-xs text-white/85 [text-shadow:0_1px_10px_rgba(20,0,60,0.45)]">
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
              <button type="button" onClick={() => setConfirming(false)} className="h-9 rounded-xl px-3 font-medium text-white hover:bg-white/15">
                Keep it
              </button>
            </div>
          )}
        </motion.div>
      </main>
    </EventShell>
  );
}
