import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { db, recordCheckIn } from '@/api/db';
import { getMyRoleInClub, canScan } from '@/lib/clubs';
import { formatTime } from '@/lib/format';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeft, Search, UserPlus, CheckCircle2, XCircle, Clock, Camera } from 'lucide-react';
import { toast } from 'sonner';

export default function EventScan() {
  const { clubSlug, eventId } = useParams();
  const { user } = useOutletContext() || {};
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [club, setClub] = useState(null);
  const [role, setRole] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [checkIns, setCheckIns] = useState([]);

  const [mode, setMode] = useState('scan'); // scan | lookup | walkin
  const [scanStatus, setScanStatus] = useState(null); // {kind, text}
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);
  const lastScanRef = useRef({ text: '', at: 0 });

  const reload = async () => {
    const evs = await db.Event.filter({ id: eventId });
    setEvent(evs[0]);
    setClub((await db.Club.filter({ id: evs[0].club_id }))[0]);
    if (user?.email) setRole(await getMyRoleInClub(evs[0].club_id, user.email));
    setRsvps(await db.RSVP.filter({ event_id: eventId, status: 'confirmed' }));
    setCheckIns(await db.CheckIn.filter({ event_id: eventId }));
  };
  useEffect(() => { reload(); }, [eventId, user?.email]);

  // Start scanner
  useEffect(() => {
    if (mode !== 'scan' || !event) return;
    let scanner;
    const start = async () => {
      try {
        scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          onScan,
          () => {}
        );
        setScanning(true);
      } catch (e) {
        toast.error('Could not access camera. Use manual lookup.');
      }
    };
    start();
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().then(() => scannerRef.current.clear()).catch(() => {});
        scannerRef.current = null;
      }
      setScanning(false);
    };
  }, [mode, event]);

  const onScan = async (decoded) => {
    const now = Date.now();
    if (decoded === lastScanRef.current.text && now - lastScanRef.current.at < 2500) return;
    lastScanRef.current = { text: decoded, at: now };

    // Parse the URL: expect /rsvp/{eventId}#token={rsvp_token}
    let parsed;
    try { parsed = new URL(decoded); } catch { return flash('error', 'Invalid QR code.'); }
    const parts = parsed.pathname.split('/').filter(Boolean);
    const qrEventId = parts[1] || parts[parts.length - 1];
    const token = (parsed.hash || '').replace(/^#token=/, '');
    if (qrEventId !== event.id) return flash('error', 'This QR is for a different event.');
    if (!token) return flash('error', 'Invalid QR code.');

    await submitCheckIn({ rsvp_token: token, method: 'qr_scan' });
  };

  const flash = (kind, text) => {
    setScanStatus({ kind, text });
    setTimeout(() => setScanStatus(null), 3000);
  };

  /**
   * Single entry point for all three check-in modes.
   *
   * Duplicate detection happens on the server: two scanners on two phones can
   * hit the same attendee at once, and attendance counts feed the grant
   * acquittal, so the check has to be somewhere both of them share.
   */
  const submitCheckIn = async (payload) => {
    try {
      const result = await recordCheckIn({ event_id: event.id, ...payload });
      if (result.duplicate) {
        flash('warn', `${result.full_name} already checked in at ${formatTime(result.checked_in_at)}`);
        return result;
      }
      if (navigator.vibrate) navigator.vibrate(60);
      flash('ok', `${result.full_name} checked in`);
      reload();
      return result;
    } catch (err) {
      flash('error', err.message || 'Check-in failed.');
      return null;
    }
  };

  if (!event || !club) return <div className="text-sm text-muted-foreground">loading…</div>;
  if (!canScan(role)) return <div className="text-sm text-destructive">You don't have scanner permission for this club.</div>;
  if (event.status !== 'published') return <div className="text-sm text-muted-foreground">This event is not published.</div>;

  const remaining = rsvps.length - checkIns.filter((c) => c.rsvp_id).length;

  return (
    <div className="-m-6 sm:-m-8 min-h-[calc(100vh-3.5rem)] bg-black text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/80 backdrop-blur">
        <button onClick={() => navigate(`/c/${clubSlug}/events/${event.id}`)} className="text-xs text-white/60 hover:text-white inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> back</button>
        <div className="text-center min-w-0">
          <p className="text-xs text-white/60 truncate">{event.title}</p>
          <p className="text-sm font-medium">{checkIns.length} checked in · {remaining} remaining</p>
        </div>
        <div className="w-12" />
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-white/10">
        {[
          { k: 'scan', label: 'scan', icon: Camera },
          { k: 'lookup', label: 'lookup', icon: Search },
          { k: 'walkin', label: 'walk-in', icon: UserPlus },
        ].map((m) => (
          <button key={m.k} onClick={() => setMode(m.k)}
            className={`flex-1 py-2 rounded-md text-xs inline-flex items-center justify-center gap-1.5 ${mode === m.k ? 'bg-white/10 text-white' : 'text-white/50'}`}>
            <m.icon className="w-3.5 h-3.5" /> {m.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 relative overflow-hidden">
        {mode === 'scan' && (
          <div className="absolute inset-0">
            <div id="qr-reader" className="w-full h-full [&_video]:object-cover [&_video]:!w-full [&_video]:!h-full" />
            {!scanning && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">starting camera…</div>
            )}
            {scanStatus && (
              <div className={`absolute inset-x-0 bottom-0 p-5 ${scanStatus.kind === 'ok' ? 'bg-emerald-600' : scanStatus.kind === 'warn' ? 'bg-amber-600' : 'bg-red-600'}`}>
                <div className="flex items-center gap-3 text-white">
                  {scanStatus.kind === 'ok' && <CheckCircle2 className="w-6 h-6" />}
                  {scanStatus.kind === 'warn' && <Clock className="w-6 h-6" />}
                  {scanStatus.kind === 'error' && <XCircle className="w-6 h-6" />}
                  <p className="font-medium">{scanStatus.text}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'lookup' && (
          <Lookup
            rsvps={rsvps}
            checkIns={checkIns}
            onPick={(r) => submitCheckIn({ rsvp_id: r.id, method: 'manual_lookup' })}
          />
        )}
        {mode === 'walkin' && <WalkIn event={event} club={club} onSubmit={submitCheckIn} />}
      </div>
    </div>
  );
}

function Lookup({ rsvps, checkIns, onPick }) {
  const [q, setQ] = useState('');
  const checkedSet = new Set(checkIns.filter((c) => c.rsvp_id).map((c) => c.rsvp_id));
  const filtered = rsvps.filter((r) => {
    const s = q.toLowerCase();
    return !s || r.full_name?.toLowerCase().includes(s) || r.email?.toLowerCase().includes(s) || r.student_number?.toLowerCase().includes(s);
  });
  return (
    <div className="p-4">
      <input className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/40" placeholder="search name, email, or student #" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="mt-3 max-h-[60vh] overflow-y-auto divide-y divide-white/10">
        {filtered.length === 0 && <p className="text-sm text-white/50 italic px-2 py-4">No matches.</p>}
        {filtered.map((r) => {
          const checked = checkedSet.has(r.id);
          return (
            <button key={r.id} disabled={checked} onClick={() => onPick(r)} className="w-full text-left py-3 px-2 disabled:opacity-50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate text-white">{r.full_name}</p>
                <p className="text-xs text-white/50 truncate">{r.email}{r.student_number && ` · ${r.student_number}`}</p>
              </div>
              {checked ? <span className="text-xs text-emerald-400">✓ checked in</span> : <span className="text-xs text-white/40">tap to check in</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WalkIn({ event, club, onSubmit }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [course, setCourse] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    if (event.is_grant_funded && (!studentNumber.trim() || !course.trim())) return toast.error('Student # and course required for grant-funded events.');
    setSaving(true);
    const result = await onSubmit({
      method: 'walk_in_add',
      full_name: fullName.trim(),
      email: email.toLowerCase().trim() || undefined,
      student_number: studentNumber.trim() || undefined,
      course: course.trim() || undefined,
      university: event.is_grant_funded ? club?.university : undefined,
    });
    if (result) {
      setFullName(''); setEmail(''); setStudentNumber(''); setCourse('');
    }
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-3 max-w-md">
      <div>
        <label className="block text-xs text-white/60 mb-1">full name</label>
        <input className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div>
        <label className="block text-xs text-white/60 mb-1">email (optional)</label>
        <input type="email" className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {event.is_grant_funded && (
        <>
          <div>
            <label className="block text-xs text-white/60 mb-1">student number</label>
            <input className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white" value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">course</label>
            <input className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white" value={course} onChange={(e) => setCourse(e.target.value)} required />
          </div>
        </>
      )}
      <button disabled={saving} className="w-full bg-primary text-primary-foreground rounded-lg py-3 text-sm font-medium">check in walk-in</button>
    </form>
  );
}