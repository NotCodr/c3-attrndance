import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { formatEventTimeRange } from '@/lib/format';
import Logo from '@/components/Logo';
import { AlertTriangle, Calendar, CheckCircle2, Clock, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';

/**
 * An attendee's ticket, reachable from the link in their confirmation email.
 *
 * Previously the QR existed only in the tab where the RSVP was submitted, so
 * closing it lost the ticket for good. The token in the URL is the credential
 * for this one RSVP, which is why no sign-in is involved -- attendees are not
 * users of the app.
 */
export default function Ticket() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';

  const [data, setData] = useState(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    try {
      const result = await api.call('rsvp-lookup', { token }, { auth: false });
      setData(result);
      if (result.rsvp.status === 'confirmed' && !result.rsvp.checked_in_at) {
        const url = `${window.location.origin}/rsvp/${result.event.id}#token=${result.rsvp.rsvp_token}`;
        setQr(await QRCode.toDataURL(url, {
          width: 280, margin: 1, color: { dark: '#0A0A0F', light: '#FFFFFF' },
        }));
      }
    } catch (err) {
      setError(err.message || 'This ticket link is not valid.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) { setError('This ticket link is missing its code.'); setLoading(false); return; }
    load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async () => {
    if (!confirm('Cancel your place at this event?')) return;
    setCancelling(true);
    try {
      await api.call('rsvp-cancel', { token }, { auth: false });
      toast.success('Your place has been cancelled.');
      setQr('');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not cancel.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <Shell><Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" /></Shell>;

  if (error) {
    return (
      <Shell>
        <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <p className="text-xs text-muted-foreground mt-4">
          Open the link straight from your confirmation email, or RSVP again to get a new one.
        </p>
      </Shell>
    );
  }

  const { rsvp, event, club } = data;
  const ended = new Date(event.ends_at) < new Date();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-4 py-10">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <Logo size={32} />
          <span className="font-display font-bold text-lg tracking-tight">connect3</span>
        </Link>

        <p className="text-xs text-primary tracking-wider uppercase text-center">{club?.name}</p>
        <h1 className="font-display font-bold text-2xl mt-1 mb-5 text-center text-balance">{event.title}</h1>

        <div className="c3-card p-5 mb-5 space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
            {formatEventTimeRange(event.starts_at, event.ends_at)}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{event.location_name}{event.location_address && <span className="text-muted-foreground"> · {event.location_address}</span>}</span>
          </p>
        </div>

        <StatusCard rsvp={rsvp} qr={qr} ended={ended} eventCancelled={event.status === 'cancelled'} />

        <p className="text-center text-xs text-muted-foreground mt-6">
          Booked as {rsvp.full_name} · {rsvp.email}
        </p>

        {rsvp.status !== 'cancelled' && !rsvp.checked_in_at && !ended && event.status !== 'cancelled' && (
          <button onClick={cancel} disabled={cancelling} className="c3-btn-ghost text-destructive w-full justify-center mt-4 text-xs">
            {cancelling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {rsvp.status === 'waitlisted' ? 'leave the waitlist' : "cancel my place"}
          </button>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8">
          <Link to="/explore" className="hover:text-foreground">find more events</Link>
        </p>
      </div>
    </div>
  );
}

function StatusCard({ rsvp, qr, ended, eventCancelled }) {
  if (eventCancelled) {
    return <Notice icon={AlertTriangle} title="This event was cancelled" note="The club called it off. You do not need to do anything." />;
  }
  if (rsvp.status === 'cancelled') {
    return <Notice icon={AlertTriangle} title="You cancelled your place" note="Changed your mind? RSVP again from the event page." />;
  }
  if (rsvp.checked_in_at) {
    return <Notice icon={CheckCircle2} tone="primary" title="You're checked in" note="Scanned at the door. Enjoy the event." />;
  }
  if (ended) {
    return <Notice icon={Clock} title="This event has ended" note="Thanks for coming along." />;
  }
  if (rsvp.status === 'waitlisted') {
    return (
      <Notice
        icon={Clock}
        title="You're on the waitlist"
        note="The event is full. We'll email you if a place opens up, so keep this link."
      />
    );
  }
  return (
    <div className="c3-card p-6 text-center">
      <CheckCircle2 className="w-9 h-9 text-primary mx-auto mb-2" />
      <h2 className="font-display font-bold text-xl mb-1">You're going</h2>
      <p className="text-sm text-muted-foreground mb-5">Show this at the door.</p>
      {qr
        ? <div className="inline-block bg-white p-3 rounded-lg"><img src={qr} alt="Your check-in QR code" className="w-56 h-56" /></div>
        : <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />}
      <p className="text-xs text-muted-foreground mt-5">Screenshot it if you'll be somewhere with poor signal.</p>
    </div>
  );
}

function Notice({ icon: Icon, title, note, tone }) {
  return (
    <div className="c3-card p-6 text-center">
      <Icon className={`w-9 h-9 mx-auto mb-2 ${tone === 'primary' ? 'text-primary' : 'text-muted-foreground'}`} />
      <h2 className="font-display font-bold text-xl mb-1">{title}</h2>
      <p className="text-sm text-muted-foreground">{note}</p>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-sm text-center">{children}</div>
    </div>
  );
}
