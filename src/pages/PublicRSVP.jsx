import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import QRCode from 'qrcode';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, db, submitRsvp } from '@/api/db';
import { formatDate, formatTime, MEL_TZ } from '@/lib/format';
import { UNIVERSITY_OPTIONS } from '@/lib/umsu';
import { editionFor, mapsUrl, ticketNumber } from '@/lib/ticket';
import EventShell, { GlassButton, GlassCard } from '@/components/EventShell';
import CrtButton from '@/components/CrtButton';
import PrintedReceipt from '@/components/receipt/PrintedReceipt';
import QrOverlay from '@/components/QrOverlay';
import AddToCalendar from '@/components/AddToCalendar';
import {
  AlertTriangle, ArrowRight, CalendarDays, Check, ExternalLink, Loader2, Lock, MapPin, Share2,
  Ticket as TicketIcon, Users,
} from 'lucide-react';
import { toast } from 'sonner';

const EASE = [0.16, 1, 0.3, 1];

const melDay = (iso) => new Date(iso).toLocaleDateString('en-AU', { timeZone: MEL_TZ });

function timeRange(event) {
  if (!event.ends_at) return formatTime(event.starts_at);
  if (melDay(event.starts_at) === melDay(event.ends_at)) {
    return `${formatTime(event.starts_at)} to ${formatTime(event.ends_at)}`;
  }
  return `${formatTime(event.starts_at)} to ${formatDate(event.ends_at, { year: undefined })}, ${formatTime(event.ends_at)}`;
}

export default function PublicRSVP() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const [event, setEvent] = useState(null);
  const [club, setClub] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [course, setCourse] = useState('');
  const [university, setUniversity] = useState('unimelb');
  const [dietary, setDietary] = useState('');
  const [accessibility, setAccessibility] = useState('');
  const [website, setWebsite] = useState(''); // honeypot

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const registerRef = useRef(null);
  const [formInView, setFormInView] = useState(true);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia?.('(min-width: 1024px)').matches ?? true);

  // Someone opening their own QR link lands on their ticket, not a blank form.
  useEffect(() => {
    const match = window.location.hash.match(/^#token=(.+)$/);
    if (match) navigate(`/ticket?t=${encodeURIComponent(decodeURIComponent(match[1]))}`, { replace: true });
  }, [navigate]);

  useEffect(() => {
    (async () => {
      const ev = (await db.Event.filter({ id: eventId }))[0];
      if (!ev) { setNotFound(true); setLoading(false); return; }
      setEvent(ev);
      const c = (await db.Club.filter({ id: ev.club_id }))[0];
      setClub(c);
      setUniversity(c?.university || 'unimelb');
      setLoading(false);
      api.call('event-availability', { event_id: ev.id }, { auth: false }).then(setAvailability).catch(() => {});
    })().catch(() => { setNotFound(true); setLoading(false); });
  }, [eventId]);

  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 1024px)');
    if (!mq) return undefined;
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const el = registerRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([entry]) => setFormInView(entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
    // `loading`, not `event`: the form only exists once loading has finished,
    // which is a render after the event arrives.
  }, [loading, ticket]);

  const share = async () => {
    const url = `${window.location.origin}/rsvp/${event.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text: club?.name ? `${event.title}, hosted by ${club.name}` : event.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Event link copied');
    } catch {
      /* dismissed */
    }
  };

  const goRegister = () => {
    registerRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => document.getElementById('rsvp-name')?.focus({ preventScroll: true }), reduce ? 0 : 550);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    setSubmitting(true);
    setError('');
    const lcEmail = email.toLowerCase().trim();
    try {
      const result = await submitRsvp({
        event_id: event.id,
        full_name: fullName.trim(),
        email: lcEmail,
        student_number: studentNumber.trim() || undefined,
        course: course.trim() || undefined,
        university,
        dietary_requirements: dietary.trim() || undefined,
        accessibility_requirements: accessibility.trim() || undefined,
        website, // honeypot; the server decides what to do with it
      });

      // The same payload the ticket page renders, so the two are one ticket.
      let payload;
      try {
        payload = await api.call('rsvp-lookup', { token: result.rsvp_token }, { auth: false });
      } catch {
        payload = {
          rsvp: { full_name: fullName.trim(), email: lcEmail, status: result.status, rsvp_token: result.rsvp_token, checked_in_at: null },
          event,
          club,
          ticket: null,
        };
      }
      if (payload.rsvp.status === 'confirmed' && !payload.rsvp.checked_in_at) {
        const url = `${window.location.origin}/rsvp/${event.id}#token=${payload.rsvp.rsvp_token}`;
        setQrDataUrl(await QRCode.toDataURL(url, { width: 640, margin: 1, color: { dark: '#0A0A0F', light: '#FFFFFF' } }));
      }
      setTicket(payload);
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (err) {
      setError(err.message || 'Could not submit your RSVP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <EventShell>
        <div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-white/80" /></div>
      </EventShell>
    );
  }
  if (notFound) return <StatusPage note="We could not find that event." />;
  if (event.status === 'cancelled') {
    return <StatusPage title={event.title} club={club} note="This event was cancelled." reason={event.cancellation_reason} />;
  }
  if (event.status === 'draft') return <StatusPage club={club} note="This event has not been published yet." />;
  if (new Date(event.ends_at) < new Date()) return <StatusPage title={event.title} club={club} note="This event has already ended." />;
  if (event.rsvp_required === false) {
    return <StatusPage title={event.title} club={club} note="Walk-ins only. No RSVP needed, just turn up." />;
  }

  if (ticket) {
    return <Confirmation ticket={ticket} qrDataUrl={qrDataUrl} event={event} onShare={share} reduce={reduce} />;
  }

  const fade = (i) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.65, delay: reduce ? 0 : i * 0.09, ease: EASE },
  });

  const cap = availability?.capacity;
  const spots = availability?.spots_left;
  const full = !!cap && spots === 0;
  const nearlyFull = !!cap && spots > 0 && spots <= Math.max(10, Math.ceil(cap * 0.2));
  const showCta = !formInView && !isDesktop;
  const dateLong = formatDate(event.starts_at, { weekday: 'long', month: 'long', year: undefined });

  return (
    <EventShell
      bottomInset={showCta ? 84 : 0}
      navRight={<GlassButton onClick={share} className="h-9 px-3 text-xs"><Share2 className="h-3.5 w-3.5" /> Share</GlassButton>}
    >
      <main className="mx-auto max-w-6xl px-5 pb-32 pt-8 sm:px-8 sm:pt-12 lg:pb-20">
        <section className="grid items-end gap-8 lg:grid-cols-12">
          <motion.div {...fade(0)} className={event.cover_image_url ? 'lg:col-span-7' : 'lg:col-span-10'}>
            {club && (
              <Link
                to={`/p/${club.slug}`}
                className="inline-flex items-center gap-2 rounded-full bg-white/15 py-1 pl-1 pr-3 text-xs font-semibold ring-1 ring-inset ring-white/30 backdrop-blur-md transition hover:bg-white/25"
              >
                {club.logo_url
                  ? <img src={club.logo_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                  : <span className="grid h-6 w-6 place-items-center rounded-full bg-white/30 text-[11px] font-bold">{club.name.slice(0, 1)}</span>}
                {club.name}
              </Link>
            )}
            <h1 className="mt-5 text-balance font-display text-5xl font-bold leading-[0.98] tracking-tight text-white [text-shadow:0_4px_40px_rgba(20,0,60,0.45)] sm:text-6xl lg:text-7xl">
              {event.title}
            </h1>
            <div className="mt-7 flex flex-wrap gap-2">
              <Chip icon={CalendarDays}>{formatDate(event.starts_at, { year: undefined })} · {formatTime(event.starts_at)}</Chip>
              <Chip icon={MapPin}>{event.location_name}</Chip>
              {full && <Chip icon={Users} tone="amber">Full · waitlist open</Chip>}
              {nearlyFull && <Chip icon={Users} tone="hot">Only {spots} {spots === 1 ? 'spot' : 'spots'} left</Chip>}
              {cap && !full && !nearlyFull && <Chip icon={Users}>{cap} places</Chip>}
            </div>
          </motion.div>
          {event.cover_image_url && (
            <motion.div {...fade(1)} className="lg:col-span-5">
              <img
                src={event.cover_image_url}
                alt=""
                className="aspect-[4/3] w-full rounded-[28px] object-cover shadow-[0_30px_70px_-25px_rgba(20,0,60,0.8)] ring-1 ring-white/30"
              />
            </motion.div>
          )}
        </section>

        <div className="mt-10 grid gap-6 lg:mt-14 lg:grid-cols-12 lg:items-start">
          <div className="space-y-6 lg:col-span-7">
            <motion.div {...fade(2)}>
              <GlassCard className="p-6 sm:p-7">
                <div className="flex gap-4">
                  <DateTile iso={event.starts_at} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">When</p>
                    <p className="mt-1 font-display text-xl font-semibold">{dateLong}</p>
                    <p className="text-sm text-muted-foreground">{timeRange(event)} · Melbourne time</p>
                  </div>
                </div>
                <div className="my-5 border-t border-border" />
                <div className="flex gap-4">
                  <span className="grid h-[4.5rem] w-[4.25rem] shrink-0 place-items-center rounded-2xl bg-secondary ring-1 ring-inset ring-border">
                    <MapPin className="h-6 w-6 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Where</p>
                    <p className="mt-1 font-display text-xl font-semibold">{event.location_name}</p>
                    {event.location_address && <p className="text-sm text-muted-foreground">{event.location_address}</p>}
                    <a
                      href={mapsUrl(event)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                    >
                      Open in Maps <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {event.description && (
              <motion.div {...fade(3)}>
                <GlassCard className="p-6 sm:p-7">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">About this event</p>
                  <div className="prose prose-sm mt-3 max-w-none text-muted-foreground prose-headings:font-display prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{event.description}</ReactMarkdown>
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {club && (
              <motion.div {...fade(4)}>
                <GlassCard className="flex items-center gap-4 p-5 sm:p-6">
                  {club.logo_url
                    ? <img src={club.logo_url} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-border" />
                    : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary font-display text-xl font-bold text-white">{club.name.slice(0, 1)}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Hosted by</p>
                    <p className="truncate font-display text-lg font-semibold">{club.name}</p>
                    {club.university_name && <p className="truncate text-xs text-muted-foreground">{club.university_name}</p>}
                  </div>
                  <Link to={`/p/${club.slug}`} className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary">
                    View club
                  </Link>
                </GlassCard>
              </motion.div>
            )}
          </div>

          <motion.div {...fade(3)} id="register" ref={registerRef} className="scroll-mt-6 lg:sticky lg:top-6 lg:col-span-5">
            <GlassCard as="form" onSubmit={submit} className="p-6 sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-bold">{full ? 'Join the waitlist' : 'Get your ticket'}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {full ? "It's full right now. We'll email you if a spot opens up." : 'Takes a few seconds. Your ticket arrives by email.'}
                  </p>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary ring-1 ring-inset ring-border">
                  <TicketIcon className="h-5 w-5 text-primary" />
                </span>
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="alert"
                  className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </motion.p>
              )}

              <div className="mt-6 space-y-5">
                <Field label="full name" htmlFor="rsvp-name">
                  <input id="rsvp-name" className="c3-input" required maxLength={100} autoComplete="name"
                    value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </Field>

                <Field label="email" htmlFor="rsvp-email" hint="Your ticket goes here.">
                  <input id="rsvp-email" type="email" className="c3-input" required autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>

                {event.is_grant_funded && (
                  <div className="space-y-5 pt-1">
                    <div className="flex gap-2.5 rounded-xl border border-border bg-secondary/70 p-3.5 text-xs">
                      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <p className="leading-relaxed text-muted-foreground">
                        This event is funded by {club?.union_name || 'the student union'}, so they require these details on the
                        attendance record. Stored securely, see our{' '}
                        <a href="/privacy" className="underline hover:text-foreground">privacy policy</a>.
                      </p>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="student number" htmlFor="rsvp-sid">
                        <input id="rsvp-sid" className="c3-input" required pattern="[A-Za-z0-9]{4,12}" placeholder="1234567"
                          value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} />
                      </Field>
                      <Field label="course" htmlFor="rsvp-course">
                        <input id="rsvp-course" className="c3-input" required placeholder="Bachelor of Science"
                          value={course} onChange={(e) => setCourse(e.target.value)} />
                      </Field>
                    </div>
                    <Field label="university" htmlFor="rsvp-uni">
                      <select id="rsvp-uni" className="c3-input" value={university} onChange={(e) => setUniversity(e.target.value)}>
                        {UNIVERSITY_OPTIONS.map((u) => <option key={u.slug} value={u.slug}>{u.name}</option>)}
                        <option value="other">Other</option>
                      </select>
                    </Field>
                  </div>
                )}

                {event.collect_dietary && (
                  <Field label="dietary requirements" htmlFor="rsvp-diet" optional>
                    <input id="rsvp-diet" className="c3-input" placeholder="Vegetarian, allergies, anything we should know"
                      value={dietary} onChange={(e) => setDietary(e.target.value)} />
                  </Field>
                )}
                {event.collect_accessibility && (
                  <Field label="accessibility requirements" htmlFor="rsvp-access" optional>
                    <input id="rsvp-access" className="c3-input" placeholder="Anything that would help you take part"
                      value={accessibility} onChange={(e) => setAccessibility(e.target.value)} />
                  </Field>
                )}

                <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden"
                  value={website} onChange={(e) => setWebsite(e.target.value)} />

                <CrtButton type="submit" loading={submitting} className="w-full">
                  {submitting ? 'Getting your ticket' : full ? 'Join the waitlist' : 'Get my ticket'}
                  {!submitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                </CrtButton>
                <p className="text-center text-[11px] text-muted-foreground">No account needed.</p>
              </div>
            </GlassCard>
          </motion.div>
        </div>

        <p className="mt-12 text-center text-xs text-white/75">
          <Link to="/explore" className="hover:text-white">More events on connect3</Link>
        </p>
      </main>

      <AnimatePresence>
        {showCta && (
          <motion.div
            initial={{ y: 110 }}
            animate={{ y: 0 }}
            exit={{ y: 110 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center gap-3 rounded-3xl bg-[#14082e]/80 p-2 pl-4 ring-1 ring-white/15 backdrop-blur-xl">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{event.title}</p>
                <p className="truncate text-xs text-white/70">{formatDate(event.starts_at, { year: undefined })} · {formatTime(event.starts_at)}</p>
              </div>
              <CrtButton size="sm" onClick={goRegister}>{full ? 'Waitlist' : 'Get ticket'}</CrtButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </EventShell>
  );
}

/** The moment after RSVPing: the page takes on the ticket's colours as it prints. */
function Confirmation({ ticket, qrDataUrl, event, onShare, reduce }) {
  const { rsvp } = ticket;
  const [showQr, setShowQr] = useState(false);
  const edition = editionFor(rsvp.rsvp_token);
  const waitlisted = rsvp.status === 'waitlisted';
  const number = ticketNumber(ticket.ticket?.number);
  const link = `/ticket?t=${encodeURIComponent(rsvp.rsvp_token)}`;
  const rise = (delay) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay: reduce ? 0 : delay, ease: EASE },
  });

  return (
    <EventShell palette={edition}>
      <main className="mx-auto max-w-md px-5 pb-16 pt-8 sm:pt-10">
        <div className="text-center">
          <motion.span
            {...rise(0)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-white/30 backdrop-blur-md"
          >
            <Check className="h-3.5 w-3.5" /> {waitlisted ? 'On the waitlist' : 'RSVP confirmed'}
          </motion.span>
          <motion.h1
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={reduce ? { duration: 0.3 } : { type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
            className="mt-4 font-display text-5xl font-bold tracking-tight text-white [text-shadow:0_4px_40px_rgba(20,0,60,0.45)] sm:text-6xl"
          >
            {waitlisted ? "You're in line" : "You're in!"}
          </motion.h1>
          <motion.p {...rise(0.2)} className="mx-auto mt-3 max-w-xs text-sm text-white/85">
            {waitlisted
              ? `We'll email ${rsvp.email} the moment a spot opens up for you.`
              : `${number ? `Ticket ${number}. ` : ''}${edition.rare ? "It's a rare holo one. " : ''}A copy is on its way to ${rsvp.email}.`}
          </motion.p>
        </div>

        <div className="mt-8">
          <PrintedReceipt data={ticket} qrDataUrl={qrDataUrl} onShowQr={() => setShowQr(true)} />
        </div>

        <motion.div {...rise(1.25)} className="mt-8 grid gap-3">
          <CrtButton to={link} className="w-full">Open my ticket <ArrowRight className="h-4 w-4" /></CrtButton>
          <div className="grid grid-cols-2 gap-3">
            <AddToCalendar event={event} url={`${window.location.origin}${link}`} label="Calendar" placement="top" />
            <GlassButton onClick={onShare}><Share2 className="h-4 w-4" /> Invite a friend</GlassButton>
          </div>
          <p className="mt-1 text-center text-xs text-white/70">Keep your ticket link. It always has your QR code.</p>
        </motion.div>
      </main>
      <QrOverlay open={showQr} onClose={() => setShowQr(false)} qrDataUrl={qrDataUrl} data={ticket} />
    </EventShell>
  );
}

function DateTile({ iso }) {
  const f = (opts) => new Date(iso).toLocaleDateString('en-AU', { timeZone: MEL_TZ, ...opts });
  return (
    <div className="h-[4.5rem] w-[4.25rem] shrink-0 overflow-hidden rounded-2xl bg-secondary text-center ring-1 ring-inset ring-border">
      <p className="bg-primary py-1 text-[10px] font-bold tracking-[0.18em] text-white">{f({ month: 'short' }).replace('.', '').toUpperCase()}</p>
      <p className="font-display text-3xl font-bold leading-[1.15]">{f({ day: 'numeric' })}</p>
    </div>
  );
}

function Field({ label, htmlFor, hint, optional, children }) {
  return (
    <div>
      <label className="c3-label flex items-baseline gap-2" htmlFor={htmlFor}>
        {label}
        {optional && <span className="text-[10px] normal-case tracking-normal opacity-60">optional</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Chip({ icon: Icon, tone, children }) {
  const tones = {
    hot: 'bg-[#ff4fa3]/30 ring-[#ffb3d6]/60',
    amber: 'bg-amber-400/25 ring-amber-200/60',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-inset backdrop-blur-md ${tones[tone] || 'bg-white/15 ring-white/25'}`}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-white/90" />
      {children}
    </span>
  );
}

function StatusPage({ title, club, note, reason }) {
  return (
    <EventShell>
      <main className="mx-auto grid min-h-[75vh] max-w-sm place-items-center px-5">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="w-full">
          <GlassCard className="p-8 text-center">
            <AlertTriangle className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
            {title && <h1 className="mb-1 font-display text-xl font-bold">{title}</h1>}
            {club && <p className="mb-4 text-xs text-muted-foreground">{club.name}</p>}
            <p className="text-sm text-muted-foreground">{note}</p>
            {reason && <p className="mt-3 text-xs italic text-muted-foreground">{reason}</p>}
            <CrtButton to="/explore" size="sm" className="mt-6">Find other events</CrtButton>
          </GlassCard>
        </motion.div>
      </main>
    </EventShell>
  );
}
