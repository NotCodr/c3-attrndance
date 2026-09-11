import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import QRCode from 'qrcode';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db, submitRsvp } from '@/api/db';
import { formatEventTimeRange } from '@/lib/format';
import { UNIVERSITY_OPTIONS } from '@/lib/umsu';
import EventBackdrop from '@/components/EventBackdrop';
import ShaderBackground from '@/components/ui/shader-background';
import ConfirmedTicket from '@/components/ConfirmedTicket';
import RsvpButton from '@/components/RsvpButton';
import { AlertTriangle, CalendarDays, Loader2, Lock, MapPin, Users } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1];

export default function PublicRSVP() {
  const { eventId } = useParams();
  const reduce = useReducedMotion();

  const [event, setEvent] = useState(null);
  const [club, setClub] = useState(null);
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
  const [confirmed, setConfirmed] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    (async () => {
      const list = await db.Event.filter({ id: eventId });
      const ev = list[0];
      if (!ev) { setNotFound(true); setLoading(false); return; }
      setEvent(ev);
      const clubs = await db.Club.filter({ id: ev.club_id });
      setClub(clubs[0]);
      setUniversity(clubs[0]?.university || 'unimelb');
      setLoading(false);
    })();
  }, [eventId]);

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

      setConfirmed({ status: result.status, email: lcEmail, rsvp_token: result.rsvp_token });

      if (result.status === 'confirmed' && result.rsvp_token) {
        const url = `${window.location.origin}/rsvp/${event.id}#token=${result.rsvp_token}`;
        setQrDataUrl(await QRCode.toDataURL(url, {
          width: 320, margin: 1, color: { dark: '#0A0A0F', light: '#FFFFFF' },
        }));
      }
    } catch (err) {
      setError(err.message || 'Could not submit your RSVP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Centered><Loader2 className="w-5 h-5 animate-spin text-white/80" /></Centered>;
  }
  if (notFound) return <StatusPage note="We could not find that event." />;
  if (event.status === 'cancelled') {
    return <StatusPage title={event.title} club={club} note="This event was cancelled." reason={event.cancellation_reason} />;
  }
  if (event.status === 'draft') {
    return <StatusPage club={club} note="This event has not been published yet." />;
  }
  if (new Date(event.ends_at) < new Date()) {
    return <StatusPage title={event.title} club={club} note="This event has already ended." />;
  }
  if (event.rsvp_required === false) {
    return <StatusPage title={event.title} club={club} note="Walk-ins only. No RSVP needed, just turn up." />;
  }

  const whenText = formatEventTimeRange(event.starts_at, event.ends_at);

  if (confirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 py-12">
        <ShaderBackground />
        <div className="w-full max-w-md">
          <ConfirmedTicket
            status={confirmed.status}
            email={confirmed.email}
            ticketToken={confirmed.rsvp_token}
            qrDataUrl={qrDataUrl}
            event={event}
            club={club}
            whenText={whenText}
          />
          <p className="text-center text-xs text-white/60 mt-6">
            <a href="/explore" className="hover:text-white transition-colors">more events on connect3</a>
          </p>
        </div>
      </div>
    );
  }

  const fade = (i) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.55, delay: reduce ? 0 : i * 0.08, ease: EASE },
  });

  return (
    <div className="min-h-screen">
      <EventBackdrop />

      <div className="max-w-xl mx-auto px-5 pt-10 pb-20 sm:pt-16">
        <motion.div {...fade(0)} className="mb-8">
          {event.cover_image_url && (
            <img
              src={event.cover_image_url}
              alt=""
              className="w-full aspect-[16/9] rounded-2xl object-cover mb-7 border border-white/30 shadow-2xl shadow-black/20"
            />
          )}

          <div className="flex items-center gap-2 mb-3">
            {club?.logo_url && (
              <img src={club.logo_url} alt="" className="w-6 h-6 rounded-md object-cover border border-white/40" />
            )}
            <p className="text-xs font-semibold text-white/85 tracking-wider uppercase">{club?.name}</p>
          </div>

          <h1 className="font-display font-bold text-4xl sm:text-5xl leading-[1.05] text-balance text-white [text-shadow:0_2px_28px_rgba(20,0,60,0.45)]">
            {event.title}
          </h1>
        </motion.div>

        {/* Facts as chips rather than a wall of lines */}
        <motion.div {...fade(1)} className="flex flex-wrap gap-2 mb-8">
          <Chip icon={CalendarDays}>{whenText}</Chip>
          <Chip icon={MapPin}>{event.location_name}</Chip>
          {event.capacity ? <Chip icon={Users}>{event.capacity} places</Chip> : null}
        </motion.div>

        {event.description && (
          <motion.div
            {...fade(2)}
            className="prose prose-sm max-w-none mb-8 rounded-2xl bg-white/85 backdrop-blur-md border border-white/60 shadow-xl shadow-black/10 p-5 sm:p-6 text-muted-foreground prose-headings:text-foreground prose-headings:font-display prose-a:text-primary prose-strong:text-foreground"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{event.description}</ReactMarkdown>
          </motion.div>
        )}

        <motion.form {...fade(3)} onSubmit={submit} className="c3-card p-6 sm:p-7">
            <h2 className="font-display font-bold text-xl mb-1">Save your place</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Takes a few seconds. We will email you a code for the door.
            </p>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 mb-5"
              >
                {error}
              </motion.p>
            )}

            <div className="space-y-5">
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
                  <div className="flex gap-2.5 p-3.5 rounded-xl bg-secondary/70 border border-border text-xs">
                    <Lock className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <p className="text-muted-foreground leading-relaxed">
                      This event is funded by {club?.union_name || 'the student union'}, so they require these
                      details on the attendance record. Stored securely, see our{' '}
                      <a href="/privacy" className="underline hover:text-foreground">privacy policy</a>.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-5">
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

              <div className="pt-2">
                <RsvpButton submitting={submitting} />
              </div>
            </div>
          </motion.form>

        <motion.p {...fade(4)} className="text-center text-xs text-white/80 mt-10 [text-shadow:0_1px_10px_rgba(20,0,60,0.45)]">
          <a href="/explore" className="hover:text-white transition-colors">more events on connect3</a>
        </motion.p>
      </div>
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
      {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}

function Chip({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white bg-white/15 backdrop-blur-md border border-white/25">
      <Icon className="w-3.5 h-3.5 text-white/85 shrink-0" />
      {children}
    </span>
  );
}

function Centered({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <EventBackdrop />
      {children}
    </div>
  );
}

function StatusPage({ title, club, note, reason }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <EventBackdrop />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="c3-card p-8 max-w-sm text-center"
      >
        <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-4" />
        {title && <h1 className="font-display font-bold text-xl mb-1">{title}</h1>}
        {club && <p className="text-xs text-muted-foreground mb-4">{club.name}</p>}
        <p className="text-sm text-muted-foreground">{note}</p>
        {reason && <p className="text-xs text-muted-foreground mt-3 italic">{reason}</p>}
        <a href="/explore" className="c3-btn-secondary text-xs mt-6">find other events</a>
      </motion.div>
    </div>
  );
}
