import React, { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { db, api } from '@/api/db';
import { getMyRoleInClub, canManageAcquittal } from '@/lib/clubs';
import { formatMoneyCents, formatDate, MEL_TZ } from '@/lib/format';
import { formatPhone, phoneProblem } from '@/lib/phone';
import { UMSU_RULES } from '@/lib/umsu';
import {
  AlertTriangle, ArrowLeft, Camera, CheckCircle2, Circle, Download, FileText, Loader2, Pencil, Receipt, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';

// HEIC is left out on purpose: without it, iPhones convert photos to JPEG on
// upload, and every browser can put a JPEG into a PDF.
const ACCEPT_PHOTO = 'image/jpeg,image/png,image/webp';
const ACCEPT_RECEIPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024;

const isPdf = (url) => /\.pdf($|\?)/i.test(url || '');
const toCents = (v) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};
const melDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: MEL_TZ });
const shortDay = (d) => (d ? formatDate(`${d}T12:00:00Z`, { weekday: undefined }) : '');

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
  const [history, setHistory] = useState([]);
  const [claim, setClaim] = useState(null);
  const [generating, setGenerating] = useState(null);

  const reload = async () => {
    const ev = await db.Event.get(eventId);
    const [c, myRole, ins, ph, rc, pk] = await Promise.all([
      db.Club.get(ev.club_id),
      user?.email ? getMyRoleInClub(ev.club_id, user.email) : null,
      db.CheckIn.filter({ event_id: eventId }, 'checked_in_at'),
      db.EventPhoto.filter({ event_id: eventId }, 'display_order'),
      db.EventReceipt.filter({ event_id: eventId }, 'created_date'),
      db.AcquittalPack.filter({ event_id: eventId }, '-created_date'),
    ]);
    setEvent(ev);
    setClub(c);
    setRole(myRole);
    setCheckIns(ins);
    setPhotos(ph);
    setReceipts(rc);
    setPacks(pk);
    // Filled once, from the event, falling back to whoever is signed in.
    setClaim((prev) => prev || {
      name: ev.contact_name || user?.full_name || '',
      email: ev.contact_email || user?.email || '',
      phone: ev.contact_phone || user?.phone || '',
      code: c.umsu_affiliation_code || '',
      claimed: null,
    });
    return ev;
  };

  useEffect(() => {
    reload()
      .then((ev) => db.EventReceipt.filter({ club_id: ev.club_id }, '-created_date', 200))
      .then(setHistory)
      .catch(() => toast.error('Could not load this grant pack.'));
  }, [eventId, user?.email]);

  const suggestions = useMemo(() => ({
    vendors: [...new Set(history.map((r) => r.vendor_name).filter(Boolean))].slice(0, 30),
    items: [...new Set(history.map((r) => r.description).filter(Boolean))].slice(0, 30),
  }), [history]);

  if (!event || !club || !claim) return <div className="text-sm text-muted-foreground">loading…</div>;
  if (!canManageAcquittal(role)) return <div className="text-sm text-destructive">You need treasurer or admin access for grant packs.</div>;

  const grant = !!event.is_grant_funded;
  const spent = receipts.reduce((s, r) => s + (r.amount_cents || 0), 0);
  const approved = event.grant_amount_cents || null;
  const defaultClaim = approved ? Math.min(spent, approved) : spent;
  const claimCents = claim.claimed == null ? defaultClaim : toCents(claim.claimed) ?? 0;
  const contactDone = !!(claim.name.trim() && claim.email.trim() && claim.phone.trim() && !phoneProblem(claim.phone));

  const steps = [
    { key: 'attendance', label: 'Attendance', done: checkIns.length > 0, sub: `${checkIns.length} checked in` },
    { key: 'receipts', label: 'Receipts', done: receipts.length > 0 || !grant, sub: receipts.length ? `${receipts.length} · ${formatMoneyCents(spent)}` : 'none yet' },
    {
      key: 'photos', label: 'Photos', done: photos.length >= UMSU_RULES.minimum_photos_recommended,
      warn: photos.length > 0 && photos.length < UMSU_RULES.minimum_photos_recommended,
      sub: photos.length ? `${photos.length} of ${UMSU_RULES.minimum_photos_recommended} suggested` : 'none yet',
    },
    ...(grant ? [{ key: 'claim', label: 'Contact', done: contactDone, sub: contactDone ? claim.name : 'phone needed' }] : []),
  ];
  const blocker = !checkIns.length ? 'No one has checked in yet.'
    : !photos.length ? 'Add at least one photo.'
      : grant && !receipts.length ? 'Add at least one receipt.'
        : grant && !contactDone ? 'Add a contact name, email and phone for UMSU.'
          : grant && !claimCents ? 'Enter the amount to claim.'
            : null;

  const pages = 1 + Math.max(1, Math.ceil(checkIns.length / 42)) + Math.ceil(receipts.length / 4) + Math.ceil(photos.length / 6);

  const generate = async () => {
    setGenerating('Building the PDF');
    try {
      const { generateAcquittalPack, downloadBlob, packFileName } = await import('@/lib/pdf');
      const version = (packs[0]?.version || 0) + 1;
      const bytes = await generateAcquittalPack({
        event: {
          ...event,
          contact_name: claim.name.trim(),
          contact_email: claim.email.trim(),
          contact_phone: formatPhone(claim.phone),
        },
        club, checkIns, photos, receipts, version,
        afpOverrides: { umsu_affiliation_code: claim.code.trim(), amount_cents: grant ? claimCents : undefined },
        preparedBy: { name: user?.full_name, email: user?.email, phone: user?.phone },
      });
      const name = packFileName(club, event, version);
      // Download first: if saving a copy fails, the treasurer still has the file.
      downloadBlob(bytes, name);

      setGenerating('Saving a copy');
      const { file_url } = await api.upload(new File([bytes], name, { type: 'application/pdf' }), event.club_id);
      await db.AcquittalPack.create({
        event_id: event.id, club_id: event.club_id, pdf_url: file_url,
        total_receipts_cents: spent, attendee_count: checkIns.length,
        generated_by_email: user?.email, version,
      });
      await db.AuditLog.create({ club_id: event.club_id, event_id: event.id, action: 'acquittal.generated', metadata: { version } });
      toast.success(`Grant pack v${version} downloaded`);
      reload();
    } catch (err) {
      toast.error(err.message || 'Could not finish the grant pack.');
    } finally {
      setGenerating(null);
    }
  };

  const markSubmitted = async (pack) => {
    await db.AcquittalPack.update(pack.id, { submitted_to_union: true, submitted_at: new Date().toISOString() });
    toast.success('Marked as submitted');
    reload();
  };

  return (
    <div className="max-w-3xl">
      <Link to={`/c/${clubSlug}/events/${event.id}`} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> back to event
      </Link>
      <h1 className="font-display font-bold text-3xl mt-3 mb-1">{grant ? 'grant pack' : 'event report'}</h1>
      <p className="text-sm text-muted-foreground mb-6">{event.title} · {formatDate(event.starts_at)}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
        {steps.map((s) => (
          <a key={s.key} href={s.key === 'attendance' ? undefined : `#${s.key}`} className="c3-card-soft p-3 hover:bg-secondary/40 transition">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              {s.done ? <CheckCircle2 className="w-4 h-4 text-primary" />
                : s.warn ? <AlertTriangle className="w-4 h-4 text-amber-500" />
                  : <Circle className="w-4 h-4 text-muted-foreground" />}
              {s.label}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">{s.sub}</p>
          </a>
        ))}
      </div>

      <ReceiptsSection event={event} receipts={receipts} spent={spent} approved={grant ? approved : null}
        suggestions={suggestions} onChanged={reload} />

      <PhotosSection event={event} photos={photos} onChanged={reload} />

      {grant && (
        <ClaimSection claim={claim} setClaim={setClaim} approved={approved} spent={spent} defaultClaim={defaultClaim} />
      )}

      <div className="c3-card p-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="font-medium">{grant ? 'Generate grant pack' : 'Generate event report'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {blocker || `About ${pages} pages: summary, attendance, ${receipts.length ? 'receipts and ' : ''}photos.`}
          </p>
        </div>
        <button onClick={generate} disabled={!!blocker || !!generating} className="c3-btn-primary shrink-0">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {generating || 'generate'}
        </button>
      </div>

      {packs.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display font-bold text-lg mb-3">previous packs</h2>
          <div className="c3-card divide-y divide-border">
            {packs.map((p) => (
              <div key={p.id} className="p-3.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">v{p.version} · {p.attendee_count} attendees · {formatMoneyCents(p.total_receipts_cents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.created_date).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                    {p.submitted_to_union && ' · submitted'}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a href={p.pdf_url} target="_blank" rel="noreferrer" className="c3-btn-secondary text-xs px-3 py-1.5">
                    <FileText className="w-3.5 h-3.5" /> open
                  </a>
                  {!p.submitted_to_union && (
                    <button onClick={() => markSubmitted(p)} className="c3-btn-ghost text-xs">mark submitted</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ shared --

function SectionHead({ id, title, hint }) {
  return (
    <div id={id} className="scroll-mt-6 mb-3">
      <h2 className="font-display font-bold text-lg leading-tight">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

/** Two taps to delete: the first arms it for a few seconds. */
function DeleteButton({ onDelete, label, className = '' }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const click = async () => {
    if (!armed) return setArmed(true);
    setBusy(true);
    try {
      await onDelete();
    } catch (err) {
      toast.error(err.message || 'Could not delete that.');
      setBusy(false);
      setArmed(false);
    }
    return undefined;
  };

  return (
    <button type="button" onClick={click} disabled={busy} aria-label={armed ? `Confirm: delete ${label}` : `Delete ${label}`}
      className={`inline-flex items-center gap-1 rounded-full text-xs font-medium transition ${
        armed ? 'bg-destructive text-white px-2.5 py-1.5' : 'p-2 text-muted-foreground hover:text-destructive hover:bg-secondary'
      } ${className}`}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      {armed && 'delete?'}
    </button>
  );
}

function MoneyInput({ id, value, onChange, placeholder = '0.00', autoFocus }) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
      <input id={id} inputMode="decimal" autoComplete="off" className="c3-input pl-8 tabular-nums" autoFocus={autoFocus}
        value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))} />
    </div>
  );
}

function Dropzone({ accept, onFiles, title, sub, icon: Icon, compact = false }) {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
      className={`flex items-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition ${
        over ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/50'
      } ${compact ? 'px-4 py-3' : 'flex-col justify-center text-center px-6 py-8'}`}>
      <Icon className={`${compact ? 'w-5 h-5' : 'w-7 h-7'} text-muted-foreground shrink-0`} />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        {sub && <span className="block text-xs text-muted-foreground mt-0.5">{sub}</span>}
      </span>
      <input type="file" multiple accept={accept} className="hidden"
        onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
    </label>
  );
}

function checkFiles(fileList, accept) {
  const allowed = accept.split(',');
  return Array.from(fileList || []).filter((f) => {
    if (!allowed.includes(f.type)) {
      toast.error(`${f.name}: use ${accept.includes('pdf') ? 'a photo or a PDF' : 'a JPEG, PNG or WebP photo'}.`);
      return false;
    }
    if (f.size > MAX_BYTES) {
      toast.error(`${f.name} is over 10 MB.`);
      return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------- receipts --

/**
 * Receipts go in file first: pick or drop the photo, and it uploads while you
 * say what it was for. Each saved receipt is numbered the way it will appear in
 * the pack.
 */
function ReceiptsSection({ event, receipts, spent, approved, suggestions, onChanged }) {
  const [drafts, setDrafts] = useState([]);
  const day = melDay(event.starts_at);

  const patch = (id, p) => setDrafts((all) => all.map((d) => (d.id === id ? { ...d, ...p } : d)));
  const discard = (id) => setDrafts((all) => {
    const gone = all.find((d) => d.id === id);
    if (gone?.preview) URL.revokeObjectURL(gone.preview);
    return all.filter((d) => d.id !== id);
  });

  const addFiles = (fileList) => {
    const fresh = checkFiles(fileList, ACCEPT_RECEIPT).map((file) => {
      const id = crypto.randomUUID();
      const upload = api.upload(file, event.club_id);
      upload.then(
        ({ file_url }) => patch(id, { url: file_url, status: 'ready' }),
        () => patch(id, { status: 'error' }),
      );
      return {
        id, file, upload, status: 'uploading', url: null,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        description: '', vendor: '', date: day, amount: '',
      };
    });
    if (fresh.length) setDrafts((all) => [...all, ...fresh]);
  };

  const save = async (d) => {
    const cents = toCents(d.amount);
    if (!d.description.trim()) return toast.error('Say what the receipt was for.');
    if (!cents) return toast.error('Enter the amount paid.');
    if (!d.date) return toast.error('Enter the date on the receipt.');
    patch(d.id, { saving: true });
    try {
      const url = d.url || (await d.upload).file_url;
      await db.EventReceipt.create({
        event_id: event.id, club_id: event.club_id, file_url: url,
        description: d.description.trim(), vendor_name: d.vendor.trim() || null,
        amount_cents: cents, purchase_date: d.date,
      });
      discard(d.id);
      await onChanged();
    } catch (err) {
      patch(d.id, { saving: false });
      toast.error(d.status === 'error' ? 'That file did not upload. Remove it and try again.' : err.message || 'Could not save that receipt.');
    }
    return undefined;
  };

  const over = approved && spent > approved;

  return (
    <section className="mb-10">
      <SectionHead id="receipts" title="receipts"
        hint="Each receipt becomes a numbered line on the grant pack, with the photo or PDF attached." />

      <datalist id="receipt-items">{suggestions.items.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="receipt-vendors">{suggestions.vendors.map((v) => <option key={v} value={v} />)}</datalist>

      {receipts.length > 0 && (
        <div className="c3-card mb-3 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[2rem_3rem_1fr_auto_4.5rem] gap-3 px-3.5 py-2 text-[11px] font-medium text-muted-foreground border-b-2 border-border">
            <span className="text-center">no.</span><span>file</span><span>what it was for</span><span className="text-right">amount</span><span />
          </div>
          <div className="divide-y divide-border">
            {receipts.map((r, i) => (
              <ReceiptRow key={r.id} n={i + 1} receipt={r} onChanged={onChanged} />
            ))}
          </div>
          <div className="px-3.5 py-3 border-t-2 border-border bg-secondary/30">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">Total spent</span>
              <span className="tabular-nums">
                <span className="font-semibold">{formatMoneyCents(spent)}</span>
                {approved && <span className="text-muted-foreground"> of {formatMoneyCents(approved)} approved</span>}
              </span>
            </div>
            {approved && (
              <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className={`h-full rounded-full ${over ? 'bg-amber-500' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, (spent / approved) * 100)}%` }} />
              </div>
            )}
            {over && (
              <p className="text-xs text-amber-700 mt-2">
                {formatMoneyCents(spent - approved)} over the approved amount. The claim stops at {formatMoneyCents(approved)} unless you change it below.
              </p>
            )}
          </div>
        </div>
      )}

      {drafts.map((d, i) => (
        <ReceiptDraft key={d.id} draft={d} n={receipts.length + i + 1}
          onPatch={(p) => patch(d.id, p)} onSave={() => save(d)} onCancel={() => discard(d.id)} />
      ))}

      <Dropzone accept={ACCEPT_RECEIPT} onFiles={addFiles} icon={Receipt} compact={receipts.length + drafts.length > 0}
        title={receipts.length + drafts.length ? 'Add another receipt' : 'Add receipts'}
        sub="Drop photos or PDFs here, or tap to choose. You can pick several at once." />
    </section>
  );
}

function Thumb({ url, preview, pdf, size = 'sm' }) {
  const box = size === 'sm' ? 'w-11 h-14' : 'w-20 h-28 sm:w-24 sm:h-32';
  return (
    <span className={`${box} shrink-0 rounded-lg border-2 border-border bg-secondary overflow-hidden grid place-items-center`}>
      {pdf || !(preview || url)
        ? <FileText className="w-5 h-5 text-muted-foreground" />
        : <img src={preview || url} alt="" loading="lazy" className="w-full h-full object-cover" />}
    </span>
  );
}

function ReceiptFields({ values, onPatch, idPrefix, autoFocus }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-[1fr_8.5rem_10.5rem] gap-3">
      <div className="col-span-2 sm:col-span-3">
        <label className="c3-label" htmlFor={`${idPrefix}-what`}>what was it for?</label>
        <input id={`${idPrefix}-what`} list="receipt-items" className="c3-input" maxLength={200} autoFocus={autoFocus}
          placeholder="e.g. pizza for attendees" value={values.description} onChange={(e) => onPatch({ description: e.target.value })} />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <label className="c3-label" htmlFor={`${idPrefix}-where`}>
          where from? <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input id={`${idPrefix}-where`} list="receipt-vendors" className="c3-input" maxLength={120}
          placeholder="e.g. Woolworths" value={values.vendor} onChange={(e) => onPatch({ vendor: e.target.value })} />
      </div>
      <div>
        <label className="c3-label" htmlFor={`${idPrefix}-amount`}>amount paid</label>
        <MoneyInput id={`${idPrefix}-amount`} value={values.amount} onChange={(amount) => onPatch({ amount })} />
      </div>
      <div>
        <label className="c3-label" htmlFor={`${idPrefix}-date`}>date on receipt</label>
        <input id={`${idPrefix}-date`} type="date" className="c3-input" value={values.date}
          onChange={(e) => onPatch({ date: e.target.value })} />
      </div>
    </div>
  );
}

function ReceiptDraft({ draft, n, onPatch, onSave, onCancel }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="c3-card p-4 mb-3">
      <div className="flex items-center gap-3 mb-3">
        <span className="sm:hidden"><Thumb preview={draft.preview} pdf={!draft.preview} /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Receipt {n}</p>
          <p className={`text-xs truncate ${draft.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {draft.status === 'uploading' ? `uploading ${draft.file.name}…` : draft.status === 'error' ? 'upload failed, remove it and try again' : draft.file.name}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="c3-btn-ghost p-1.5 ml-auto shrink-0" aria-label="Remove this file">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-4">
        <span className="hidden sm:block shrink-0"><Thumb preview={draft.preview} pdf={!draft.preview} size="lg" /></span>
        <div className="flex-1 min-w-0">
          <ReceiptFields values={draft} onPatch={onPatch} idPrefix={`d-${draft.id}`} autoFocus />
          <div className="flex justify-end gap-2 mt-4">
            <button type="submit" disabled={draft.saving || draft.status === 'error'} className="c3-btn-primary">
              {draft.saving && <Loader2 className="w-4 h-4 animate-spin" />} add receipt
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function ReceiptRow({ n, receipt, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(null);
  const [saving, setSaving] = useState(false);
  const pdf = isPdf(receipt.file_url);

  const edit = () => {
    setValues({
      description: receipt.description || '',
      vendor: receipt.vendor_name || '',
      amount: (receipt.amount_cents / 100).toFixed(2),
      date: receipt.purchase_date || '',
    });
    setEditing(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const cents = toCents(values.amount);
    if (!values.description.trim()) return toast.error('Say what the receipt was for.');
    if (!cents) return toast.error('Enter the amount paid.');
    if (!values.date) return toast.error('Enter the date on the receipt.');
    setSaving(true);
    try {
      await db.EventReceipt.update(receipt.id, {
        description: values.description.trim(), vendor_name: values.vendor.trim() || null,
        amount_cents: cents, purchase_date: values.date,
      });
      await onChanged();
      setEditing(false);
    } catch (err) {
      toast.error(err.message || 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  if (editing) {
    return (
      <form onSubmit={save} className="p-3.5 bg-secondary/20">
        <p className="text-sm font-semibold mb-3">Receipt {n}</p>
        <ReceiptFields values={values} onPatch={(p) => setValues({ ...values, ...p })} idPrefix={`r-${receipt.id}`} />
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={() => setEditing(false)} className="c3-btn-ghost">cancel</button>
          <button type="submit" disabled={saving} className="c3-btn-primary">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} save
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="px-3.5 py-2.5 flex items-center gap-3 sm:grid sm:grid-cols-[2rem_3rem_1fr_auto_4.5rem]">
      <span className="w-6 sm:w-auto text-sm font-semibold text-muted-foreground text-center shrink-0">{n}</span>
      <a href={receipt.file_url} target="_blank" rel="noreferrer" title="Open the file">
        <Thumb url={receipt.file_url} pdf={pdf} />
      </a>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{receipt.description}</p>
        <p className="text-xs text-muted-foreground truncate">
          {[receipt.vendor_name, shortDay(receipt.purchase_date)].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex flex-col items-end shrink-0 sm:contents">
        <span className="text-sm font-semibold tabular-nums text-right">{formatMoneyCents(receipt.amount_cents)}</span>
        <div className="flex items-center justify-end -mr-2 sm:mr-0">
          <button type="button" onClick={edit} className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary" aria-label={`Edit receipt ${n}`}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <DeleteButton label={`receipt ${n}`} onDelete={async () => { await db.EventReceipt.delete(receipt.id); await onChanged(); }} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ photos --

function PhotosSection({ event, photos, onChanged }) {
  const [uploading, setUploading] = useState(0);

  const addFiles = async (fileList) => {
    const files = checkFiles(fileList, ACCEPT_PHOTO);
    if (!files.length) return;
    setUploading(files.length);
    const base = photos.length;
    const results = await Promise.allSettled(files.map(async (f, i) => {
      const { file_url } = await api.upload(f, event.club_id);
      await db.EventPhoto.create({ event_id: event.id, club_id: event.club_id, file_url, display_order: base + i });
    }));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) toast.error(`${failed} photo${failed === 1 ? '' : 's'} did not upload.`);
    setUploading(0);
    onChanged();
  };

  return (
    <section className="mb-10">
      <SectionHead id="photos" title="photos"
        hint={`At least ${UMSU_RULES.minimum_photos_recommended} photos from the event help UMSU see it happened. Captions are optional.`} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {photos.map((p) => <PhotoTile key={p.id} photo={p} onChanged={onChanged} />)}
        {Array.from({ length: uploading }, (_, i) => (
          <div key={`up-${i}`} className="aspect-[4/3] rounded-2xl border-2 border-border bg-secondary grid place-items-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ))}
        <div className="aspect-[4/3] [&>label]:h-full">
          <Dropzone accept={ACCEPT_PHOTO} onFiles={addFiles} icon={Camera} title="Add photos" sub="Drop or tap to choose" />
        </div>
      </div>
    </section>
  );
}

function PhotoTile({ photo, onChanged }) {
  const [caption, setCaption] = useState(photo.caption || '');
  const saveCaption = async () => {
    const next = caption.trim();
    if (next === (photo.caption || '')) return;
    try {
      await db.EventPhoto.update(photo.id, { caption: next || null });
    } catch {
      toast.error('Could not save that caption.');
    }
  };

  return (
    <div>
      <div className="group relative aspect-[4/3] rounded-2xl overflow-hidden border-2 border-border bg-secondary">
        <img src={photo.file_url} alt={caption} loading="lazy" className="w-full h-full object-cover" />
        <span className="absolute top-1.5 right-1.5 rounded-full bg-white/90 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition">
          <DeleteButton label="photo" onDelete={async () => { await db.EventPhoto.delete(photo.id); await onChanged(); }} />
        </span>
      </div>
      <input value={caption} maxLength={140} placeholder="add a caption" aria-label="Photo caption"
        onChange={(e) => setCaption(e.target.value)} onBlur={saveCaption}
        className="mt-1 w-full bg-transparent text-xs px-1 py-1 rounded border-b-2 border-transparent hover:border-border focus:border-primary focus:outline-none" />
    </div>
  );
}

// ------------------------------------------------------------------- claim --

function ClaimSection({ claim, setClaim, approved, spent, defaultClaim }) {
  const set = (p) => setClaim({ ...claim, ...p });
  const phoneError = phoneProblem(claim.phone);

  return (
    <section className="mb-10">
      <SectionHead id="claim" title="claim details" hint="Printed on the first page of the pack." />
      <div className="c3-card p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="c3-label" htmlFor="claim-amount">amount to claim</label>
            <MoneyInput id="claim-amount" value={claim.claimed ?? (defaultClaim / 100).toFixed(2)}
              onChange={(claimed) => set({ claimed })} />
            <p className="text-xs text-muted-foreground mt-1">
              Spent {formatMoneyCents(spent)}{approved ? ` · approved ${formatMoneyCents(approved)}` : ''}
              {claim.claimed != null && (
                <button type="button" className="ml-2 font-medium text-primary hover:underline" onClick={() => set({ claimed: null })}>
                  reset
                </button>
              )}
            </p>
          </div>
          <div>
            <label className="c3-label" htmlFor="claim-code">
              UMSU affiliation code <span className="font-normal text-muted-foreground">(if you have one)</span>
            </label>
            <input id="claim-code" className="c3-input" maxLength={40} value={claim.code}
              onChange={(e) => set({ code: e.target.value })} />
          </div>
        </div>

        <div className="border-t-2 border-border pt-5">
          <p className="text-sm font-medium">Contact for UMSU</p>
          <p className="text-xs text-muted-foreground mb-3">Who UMSU should call or email if they have a question about this claim.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="c3-label" htmlFor="claim-name">name</label>
              <input id="claim-name" className="c3-input" autoComplete="name" maxLength={120}
                value={claim.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div>
              <label className="c3-label" htmlFor="claim-email">email</label>
              <input id="claim-email" type="email" className="c3-input" autoComplete="email" maxLength={254}
                value={claim.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
            <div>
              <label className="c3-label" htmlFor="claim-phone">phone</label>
              <input id="claim-phone" type="tel" inputMode="tel" className="c3-input" autoComplete="tel" maxLength={32}
                placeholder="04xx xxx xxx" value={claim.phone}
                onChange={(e) => set({ phone: e.target.value })} onBlur={() => set({ phone: formatPhone(claim.phone) })} />
              {phoneError && <p className="text-xs text-destructive mt-1">{phoneError}</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
