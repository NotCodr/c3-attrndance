import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db, submitRsvp } from '@/api/db';
import { formatEventTimeRange } from '@/lib/format';
import { UNIVERSITY_OPTIONS, universityNameFromSlug } from '@/lib/umsu';
import { Loader2, MapPin, Calendar, CheckCircle2, Lock, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import QRCode from 'qrcode';

export default function PublicRSVP() {
  const { eventId } = useParams();
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
      setUniversity(clubs[0]?.university_slug || 'unimelb');
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
        university_name: universityNameFromSlug(university),
        dietary_requirements: dietary.trim() || undefined,
        accessibility_requirements: accessibility.trim() || undefined,
        website, // honeypot; the server decides what to do with it
      });

      setConfirmed({ status: result.status, email: lcEmail });

      if (result.status === 'confirmed' && result.rsvp_token) {
        const url = `${window.location.origin}/rsvp/${event.id}#token=${result.rsvp_token}`;
        setQrDataUrl(
          await QRCode.toDataURL(url, {
            width: 280,
            margin: 1,
            color: { dark: '#0A0A0F', light: '#FFFFFF' },
          }),
        );
      }
    } catch (err) {
      setError(err.message || 'Could not submit your RSVP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Centered><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></Centered>;
  if (notFound) return <Centered><p className="text-muted-foreground">Event not found.</p></Centered>;
  if (event.status === 'cancelled') return <StatusPage title={event.title} club={club} note="This event was cancelled." reason={event.cancellation_reason} />;
  if (event.status === 'draft') return <StatusPage title="" club={club} note="This event isn't published yet." />;
  if (new Date(event.ends_at) < new Date()) return <StatusPage title={event.title} club={club} note="This event has ended." />;
  if (event.rsvp_required === false) return <StatusPage title={event.title} club={club} note="Walk-ins only — no RSVP required." />;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Header */}
        {event.cover_image_url && <img src={event.cover_image_url} alt="" className="w-full aspect-video rounded-xl object-cover mb-6 border border-border" />}
        <p className="text-xs text-primary tracking-wider uppercase">{club?.name}</p>
        <h1 className="text-3xl font-medium mt-1 mb-4 text-balance">{event.title}</h1>

        <div className="space-y-2 mb-6 text-sm">
          <p className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /> {formatEventTimeRange(event.starts_at, event.ends_at)}</p>
          <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /> {event.location_name}</p>
        </div>

        {event.description && (
          <div className="prose prose-invert prose-sm max-w-none mb-8 text-muted-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{event.description}</ReactMarkdown>
          </div>
        )}

        {/* Form or confirmation */}
        {confirmed ? (
          <div className="c3-card p-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-primary mx-auto mb-3" />
            <h2 className="text-xl font-medium mb-1">
              {confirmed.status === 'waitlisted' ? "You're on the waitlist" : "You're going"}
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              {confirmed.status === 'waitlisted'
                ? "We'll email you if a spot opens up."
                : 'Save this QR code — scan it at the door.'}
            </p>
            {qrDataUrl && confirmed.status === 'confirmed' && (
              <div className="inline-block bg-white p-3 rounded-lg">
                <img src={qrDataUrl} alt="check-in QR code" className="w-56 h-56" />
              </div>
            )}
            <p className="mt-5 text-xs text-muted-foreground">Confirmation sent to <span className="text-foreground">{confirmed.email}</span></p>
          </div>
        ) : (
          <form onSubmit={submit} className="c3-card p-6 space-y-4">
            {error && (
              <p role="alert" className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <div>
              <label className="c3-label">full name</label>
              <input className="c3-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={100} />
            </div>
            <div>
              <label className="c3-label">email</label>
              <input type="email" className="c3-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            {event.is_grant_funded && (
              <>
                <div className="flex gap-2 p-3 rounded-lg bg-secondary border border-border text-xs">
                  <Lock className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">Your details are collected for {club?.union_name || 'the student union'}'s grant attendance record and stored securely. See our <a href="/privacy" className="underline">privacy policy</a>.</p>
                </div>
                <div>
                  <label className="c3-label">student number</label>
                  <input className="c3-input" value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} required pattern="[A-Za-z0-9]{4,12}" placeholder="1234567" />
                </div>
                <div>
                  <label className="c3-label">course</label>
                  <input className="c3-input" value={course} onChange={(e) => setCourse(e.target.value)} required placeholder="Bachelor of Science" />
                </div>
                <div>
                  <label className="c3-label">university</label>
                  <select className="c3-input" value={university} onChange={(e) => setUniversity(e.target.value)}>
                    {UNIVERSITY_OPTIONS.map((u) => <option key={u.slug} value={u.slug}>{u.name}</option>)}
                    <option value="other">Other</option>
                  </select>
                </div>
              </>
            )}

            {event.collect_dietary && (
              <div>
                <label className="c3-label">dietary requirements (optional)</label>
                <input className="c3-input" value={dietary} onChange={(e) => setDietary(e.target.value)} />
              </div>
            )}
            {event.collect_accessibility && (
              <div>
                <label className="c3-label">accessibility requirements (optional)</label>
                <input className="c3-input" value={accessibility} onChange={(e) => setAccessibility(e.target.value)} />
              </div>
            )}

            {/* Honeypot */}
            <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden="true" />

            <button disabled={submitting} className="c3-btn-primary w-full py-3 text-base">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} RSVP
            </button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8">Powered by connect3</p>
      </div>
    </div>
  );
}

function Centered({ children }) {
  return <div className="min-h-screen bg-background flex items-center justify-center px-6">{children}</div>;
}

function StatusPage({ title, club, note, reason }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        {title && <h1 className="text-xl font-medium mb-1">{title}</h1>}
        {club && <p className="text-xs text-muted-foreground mb-4">{club.name}</p>}
        <p className="text-sm text-muted-foreground">{note}</p>
        {reason && <p className="text-xs text-muted-foreground mt-3 italic">{reason}</p>}
      </div>
    </div>
  );
}