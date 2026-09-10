import React, { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { db, api } from '@/api/db';
import { getMyRoleInClub, canManageAcquittal } from '@/lib/clubs';
import { formatMoneyCents, formatDate } from '@/lib/format';
import { generateAcquittalPack, downloadBlob } from '@/lib/pdf';
import { UMSU_RULES } from '@/lib/umsu';
import { Upload, Loader2, Trash2, CheckCircle2, Circle, Download, ArrowLeft, AlertTriangle, FileText } from 'lucide-react';
import { toast } from 'sonner';

const ACCEPT_IMG = 'image/jpeg,image/png,image/heic,image/heif';
const ACCEPT_RECEIPT = 'image/jpeg,image/png,image/heic,image/heif,application/pdf';

export default function EventAcquittal() {
  const { clubSlug, eventId } = useParams();
  const { user } = useOutletContext() || {};
  const [event, setEvent] = useState(null);
  const [club, setClub] = useState(null);
  const [role, setRole] = useState(null);
  const [checkIns, setCheckIns] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [packs, setPacks] = useState([]);
  const [generating, setGenerating] = useState(false);

  // AFP overrides
  const [afp, setAfp] = useState({ club_name: '', umsu_affiliation_code: '', event_title: '', event_location: '', grant_category: '', amount_cents: '' });
  const [afpReviewed, setAfpReviewed] = useState(false);

  // Receipt new form
  const [rDesc, setRDesc] = useState('');
  const [rAmount, setRAmount] = useState('');
  const [rVendor, setRVendor] = useState('');
  const [rDate, setRDate] = useState('');
  const [rUploading, setRUploading] = useState(false);

  // Photo upload
  const [pUploading, setPUploading] = useState(false);

  const reload = async () => {
    const ev = (await db.Event.filter({ id: eventId }))[0];
    setEvent(ev);
    const c = (await db.Club.filter({ id: ev.club_id }))[0];
    setClub(c);
    if (user?.email) setRole(await getMyRoleInClub(ev.club_id, user.email));
    setCheckIns(await db.CheckIn.filter({ event_id: eventId }, 'checked_in_at'));
    setPhotos(await db.EventPhoto.filter({ event_id: eventId }, 'display_order'));
    setReceipts(await db.EventReceipt.filter({ event_id: eventId }));
    setPacks(await db.AcquittalPack.filter({ event_id: eventId }, '-created_date'));
    setAfp((prev) => ({
      ...prev,
      club_name: prev.club_name || c.name,
      umsu_affiliation_code: prev.umsu_affiliation_code || c.umsu_affiliation_code || '',
      event_title: prev.event_title || ev.title,
      event_location: prev.event_location || ev.location_name,
      grant_category: prev.grant_category || ev.grant_category || '',
      amount_cents: prev.amount_cents === '' ? (ev.grant_amount_cents || '') : prev.amount_cents,
    }));
  };
  useEffect(() => { reload(); }, [eventId, user?.email]);

  if (!event || !club) return <div className="text-sm text-muted-foreground">loading…</div>;
  if (!canManageAcquittal(role)) return <div className="text-sm text-destructive">You need treasurer or admin role.</div>;

  const totalReceipts = receipts.reduce((s, r) => s + (r.amount_cents || 0), 0);
  const grantOver = event.is_grant_funded && event.grant_amount_cents && totalReceipts > event.grant_amount_cents;

  const onPhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPUploading(true);
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name} is over 10 MB`); continue; }
      const { file_url } = await api.upload(f, event.club_id);
      await db.EventPhoto.create({
        event_id: event.id, club_id: event.club_id, file_url, display_order: photos.length,
      });
    }
    setPUploading(false);
    reload();
  };
  const deletePhoto = async (id) => { await db.EventPhoto.delete(id); reload(); };

  const onReceiptUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!rDesc.trim()) return toast.error('Description required.');
    if (!rAmount || Number(rAmount) <= 0) return toast.error('Amount required.');
    if (!rDate) return toast.error('Purchase date required.');
    if (f.size > 10 * 1024 * 1024) return toast.error('File over 10 MB');
    setRUploading(true);
    const { file_url } = await api.upload(f, event.club_id);
    await db.EventReceipt.create({
      event_id: event.id,
      club_id: event.club_id,
      file_url,
      description: rDesc.trim(),
      amount_cents: Math.round(Number(rAmount) * 100),
      vendor_name: rVendor.trim() || undefined,
      purchase_date: rDate,
    });
    setRDesc(''); setRAmount(''); setRVendor(''); setRDate('');
    setRUploading(false);
    e.target.value = '';
    reload();
  };
  const deleteReceipt = async (id) => { await db.EventReceipt.delete(id); reload(); };

  const canGenerate = checkIns.length > 0 && photos.length >= 1 && receipts.length >= 1 && (event.is_grant_funded ? afpReviewed : true);

  const generate = async () => {
    setGenerating(true);
    const bytes = await generateAcquittalPack({
      event, club, checkIns, photos, receipts,
      afpOverrides: { ...afp, amount_cents: afp.amount_cents ? Number(afp.amount_cents) : undefined },
      treasurerName: user?.full_name,
      generatedByEmail: user?.email,
    });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const file = new File([blob], `acquittal-${club.slug}-${event.starts_at.slice(0, 10)}.pdf`, { type: 'application/pdf' });
    const { file_url } = await api.upload(file, event.club_id);
    const version = (packs[0]?.version || 0) + 1;
    await db.AcquittalPack.create({
      event_id: event.id, club_id: event.club_id, pdf_url: file_url,
      total_receipts_cents: totalReceipts, attendee_count: checkIns.length,
      generated_by_email: user?.email, version,
    });
    await db.AuditLog.create({ club_id: event.club_id, event_id: event.id, action: 'acquittal.generated', actor_email: user?.email, metadata: { version } });
    downloadBlob(bytes, `acquittal-${club.slug}-${event.starts_at.slice(0, 10)}-v${version}.pdf`);
    setGenerating(false);
    reload();
    toast.success(`Grant pack v${version} generated`);
  };

  const markSubmitted = async (pack) => {
    await db.AcquittalPack.update(pack.id, { submitted_to_union: true, submitted_at: new Date().toISOString() });
    toast.success('Marked as submitted');
    reload();
  };

  return (
    <div>
      <Link to={`/c/${clubSlug}/events/${event.id}`} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> back to event</Link>
      <h1 className="font-display font-bold text-3xl mt-3 mb-1">grant pack</h1>
      <p className="text-sm text-muted-foreground mb-6">{event.title} · {formatDate(event.starts_at)}</p>

      {/* Checklist */}
      <div className="c3-card divide-y divide-border mb-8">
        <Check label="Attendance list" done={checkIns.length > 0} sub={`${checkIns.length} check-in${checkIns.length === 1 ? '' : 's'} recorded`} />
        <Check
          label={`Event photos (recommended ≥${UMSU_RULES.minimum_photos_recommended})`}
          done={photos.length >= UMSU_RULES.minimum_photos_recommended}
          warn={photos.length >= 1 && photos.length < UMSU_RULES.minimum_photos_recommended}
          sub={
            photos.length === 0
              ? 'none uploaded'
              : photos.length < UMSU_RULES.minimum_photos_recommended
                ? `${photos.length} uploaded · ${UMSU_RULES.minimum_photos_recommended} recommended for UMSU`
                : `${photos.length} uploaded`
          }
        />
        <Check label="Receipts (≥1 required)" done={receipts.length >= 1} sub={`${receipts.length} uploaded · ${formatMoneyCents(totalReceipts)}`} />
        {event.is_grant_funded && (
          <Check label="Application for Payment reviewed" done={afpReviewed} sub={afpReviewed ? 'ready' : 'review below'} />
        )}
      </div>

      {/* Photos */}
      <section className="mb-8">
        <h2 className="text-sm text-muted-foreground mb-3">photos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-3">
          {photos.map((p) => (
            <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-secondary">
              <img src={p.file_url} alt="" className="w-full h-full object-cover" />
              <button onClick={() => deletePhoto(p.id)} className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 text-white opacity-0 group-hover:opacity-100 transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <label className="aspect-square rounded-lg border border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-secondary/30 transition text-xs text-muted-foreground">
            {pUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            <span className="mt-1">add photos</span>
            <input type="file" accept={ACCEPT_IMG} multiple className="hidden" onChange={onPhotoUpload} />
          </label>
        </div>
      </section>

      {/* Receipts */}
      <section className="mb-8">
        <h2 className="text-sm text-muted-foreground mb-3">receipts</h2>
        <div className="c3-card p-4 mb-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="c3-label">description</label><input className="c3-input" value={rDesc} onChange={(e) => setRDesc(e.target.value)} placeholder="Pizza for trivia night" /></div>
            <div><label className="c3-label">vendor (optional)</label><input className="c3-input" value={rVendor} onChange={(e) => setRVendor(e.target.value)} placeholder="Dominos Carlton" /></div>
            <div><label className="c3-label">amount (AUD)</label><input type="number" step="0.01" className="c3-input" value={rAmount} onChange={(e) => setRAmount(e.target.value)} placeholder="45.00" /></div>
            <div><label className="c3-label">purchase date</label><input type="date" className="c3-input" value={rDate} onChange={(e) => setRDate(e.target.value)} /></div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer c3-btn-primary text-sm">
            {rUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            upload receipt file
            <input type="file" accept={ACCEPT_RECEIPT} className="hidden" onChange={onReceiptUpload} />
          </label>
        </div>
        {receipts.length > 0 && (
          <div className="c3-card divide-y divide-border">
            {receipts.map((r) => (
              <div key={r.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.description}</p>
                  <p className="text-xs text-muted-foreground">{r.purchase_date}{r.vendor_name && ` · ${r.vendor_name}`}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-medium">{formatMoneyCents(r.amount_cents)}</span>
                  <a href={r.file_url} target="_blank" rel="noreferrer" className="c3-btn-ghost text-xs">view</a>
                  <button onClick={() => deleteReceipt(r.id)} className="c3-btn-ghost text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
            <div className="p-3 flex justify-between text-sm font-medium">
              <span>Total</span><span>{formatMoneyCents(totalReceipts)}</span>
            </div>
          </div>
        )}
        {grantOver && (
          <div className="mt-3 flex gap-2 text-xs text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p>Total receipts ({formatMoneyCents(totalReceipts)}) exceed the grant amount ({formatMoneyCents(event.grant_amount_cents)}). You can still submit.</p>
          </div>
        )}
      </section>

      {/* AFP preview */}
      {event.is_grant_funded && (
        <section className="mb-8">
          <h2 className="text-sm text-muted-foreground mb-3">application for payment (pre-filled)</h2>
          <div className="c3-card p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[
                ['club_name', 'Club name'],
                ['umsu_affiliation_code', 'UMSU affiliation code'],
                ['event_title', 'Event name'],
                ['event_location', 'Event location'],
                ['grant_category', 'Grant category'],
              ].map(([k, label]) => (
                <div key={k}><label className="c3-label">{label}</label><input className="c3-input" value={afp[k]} onChange={(e) => { setAfp({ ...afp, [k]: e.target.value }); setAfpReviewed(false); }} /></div>
              ))}
              <div>
                <label className="c3-label">amount claimed (AUD cents)</label>
                <input type="number" className="c3-input" value={afp.amount_cents} onChange={(e) => { setAfp({ ...afp, amount_cents: e.target.value }); setAfpReviewed(false); }} />
                <p className="text-xs text-muted-foreground mt-1">{formatMoneyCents(afp.amount_cents || 0)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Bank details will be filled in by you manually on the downloaded PDF.</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-2 border-t border-border">
              <input type="checkbox" checked={afpReviewed} onChange={(e) => setAfpReviewed(e.target.checked)} /> I've reviewed the AFP details
            </label>
          </div>
        </section>
      )}

      {/* Generate */}
      <div className="c3-card p-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="font-medium">{event.is_grant_funded ? 'Generate grant pack' : 'Generate event report'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{event.is_grant_funded ? 'Cover + AFP + attendance + photos + receipts' : 'Cover + attendance + photos'}</p>
        </div>
        <button onClick={generate} disabled={!canGenerate || generating} className="c3-btn-primary">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          generate
        </button>
      </div>

      {/* Previous packs */}
      {packs.length > 0 && (
        <section>
          <h2 className="text-sm text-muted-foreground mb-3">previous packs</h2>
          <div className="c3-card divide-y divide-border">
            {packs.map((p) => (
              <div key={p.id} className="p-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">v{p.version} · {p.attendee_count} attendees · {formatMoneyCents(p.total_receipts_cents)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(p.created_date).toLocaleString('en-AU')}{p.submitted_to_union && ' · submitted ✓'}</p>
                </div>
                <div className="flex gap-2">
                  <a href={p.pdf_url} target="_blank" rel="noreferrer" className="c3-btn-secondary text-xs"><FileText className="w-3.5 h-3.5" /> open</a>
                  {!p.submitted_to_union && <button onClick={() => markSubmitted(p)} className="c3-btn-ghost text-xs">mark submitted</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Check({ label, done, warn, sub }) {
  return (
    <div className="p-4 flex items-center gap-3">
      {done
        ? <CheckCircle2 className="w-5 h-5 text-primary" />
        : warn
          ? <AlertTriangle className="w-5 h-5 text-amber-400" />
          : <Circle className="w-5 h-5 text-muted-foreground" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}