import React, { useMemo, useState } from 'react';
import { api } from '@/api/db';
import { UMSU_RULES } from '@/lib/umsu';
import { contactFor, pastVenues, plusHours } from '@/lib/events';
import { formatPhone, phoneProblem } from '@/lib/phone';
import PlaceFields from '@/components/PlaceFields';
import { Switch } from '@/components/ui/switch';
import { ImagePlus, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

/**
 * The event form, shared by the create and edit screens so the two cannot drift.
 *
 * Controlled entirely by the caller: `form` holds the state, `onChange` takes
 * the next state. `pastEvents` (the club's events, newest first) powers venue
 * suggestions; `user` is who is filling it in.
 */
export default function EventFormFields({ form, onChange, clubId, user, pastEvents = [], autoFocus = false, disabled = false }) {
  const set = (patch) => onChange({ ...form, ...patch });
  const venues = useMemo(() => pastVenues(pastEvents), [pastEvents]);

  return (
    <div className="space-y-4">
      <Section title="the basics">
        <div>
          <label className="c3-label" htmlFor="ev-title">title</label>
          <input id="ev-title" className="c3-input" disabled={disabled} maxLength={120} autoFocus={autoFocus}
            value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Winter trivia night" />
        </div>
        <div>
          <label className="c3-label" htmlFor="ev-desc">
            description <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea id="ev-desc" className="c3-input" rows={4} disabled={disabled} maxLength={5000}
            value={form.description} onChange={(e) => set({ description: e.target.value })}
            placeholder="What's happening, who it's for, anything to bring." />
          <p className="text-xs text-muted-foreground mt-1">Markdown works: **bold**, lists and links.</p>
        </div>
        <CoverField url={form.coverUrl} clubId={clubId} disabled={disabled} onChange={(coverUrl) => set({ coverUrl })} />
      </Section>

      <Section title="when">
        <WhenFields form={form} set={set} disabled={disabled} />
      </Section>

      <Section title="where">
        <PlaceFields name={form.locationName} address={form.locationAddress} venues={venues} disabled={disabled}
          onChange={(patch) => set(patch)} />
      </Section>

      <Section title="contact" hint="Not shown publicly. It goes on the grant pack so UMSU knows who to call.">
        <ContactFields form={form} set={set} user={user} disabled={disabled} />
      </Section>

      <Section title="grant">
        <Toggle id="ev-grant" checked={form.isGrantFunded} disabled={disabled}
          onChange={(isGrantFunded) => set({ isGrantFunded })}
          title="Funded by a UMSU grant"
          sub="Attendees will be asked for their student number and course, which UMSU needs." />
        {form.isGrantFunded && (
          <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
            <div>
              <p className="c3-label">category</p>
              <div className="flex flex-wrap gap-2">
                {UMSU_RULES.grant_categories.map((cat) => (
                  <Chip key={cat} on={form.grantCategory === cat} disabled={disabled} onClick={() => set({ grantCategory: cat })}>
                    {cat}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <label className="c3-label" htmlFor="ev-amt">approved amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <input id="ev-amt" inputMode="decimal" autoComplete="off" className="c3-input pl-8 tabular-nums"
                  disabled={disabled} value={form.grantAmount} placeholder="450.00"
                  onChange={(e) => set({ grantAmount: e.target.value.replace(/[^\d.]/g, '') })} />
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section title="RSVPs">
        <Toggle id="ev-rsvp" checked={form.rsvpRequired} disabled={disabled}
          onChange={(rsvpRequired) => set({ rsvpRequired })}
          title="Public RSVP page"
          sub="People sign up at a link you share and get a ticket to scan at the door." />
        {form.rsvpRequired && (
          <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
            <div>
              <label className="c3-label" htmlFor="ev-cap">capacity</label>
              <input id="ev-cap" type="number" inputMode="numeric" min={1} className="c3-input" disabled={disabled}
                value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} placeholder="no limit" />
            </div>
            <div>
              <p className="c3-label">also ask for</p>
              <div className="flex flex-wrap gap-2">
                <Chip on={form.collectDietary} disabled={disabled} onClick={() => set({ collectDietary: !form.collectDietary })}>
                  dietary requirements
                </Chip>
                <Chip on={form.collectAccessibility} disabled={disabled} onClick={() => set({ collectAccessibility: !form.collectAccessibility })}>
                  accessibility needs
                </Chip>
              </div>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="c3-card p-5 sm:p-6">
      <h2 className="font-display font-bold text-lg leading-tight">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      <div className="space-y-4 mt-4">{children}</div>
    </section>
  );
}

function Toggle({ id, checked, onChange, title, sub, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium">{title}</span>
        {sub && <span className="block text-xs text-muted-foreground mt-0.5">{sub}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
    </div>
  );
}

function Chip({ on, onClick, disabled, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`px-3.5 py-1.5 rounded-full text-sm font-medium border-2 transition disabled:opacity-50 ${
        on
          ? 'bg-primary text-primary-foreground border-[hsl(var(--c3-purple-deep))]'
          : 'bg-white text-foreground border-border hover:bg-secondary'
      }`}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------- when --

const LENGTHS = [1, 2, 3];

function lengthLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} min`;
  return `${h} hr${h === 1 ? '' : 's'}${m ? ` ${m} min` : ''}`;
}

function WhenFields({ form, set, disabled }) {
  const start = new Date(form.startsLocal);
  const end = new Date(form.endsLocal);
  const valid = !Number.isNaN(+start) && !Number.isNaN(+end) && end >= start;
  const mins = valid ? Math.round((end - start) / 60000) : 0;

  const day = (d) => d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = (d) => d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
  const sameDay = valid && start.toDateString() === end.toDateString();
  const summary = !valid ? '' : sameDay
    ? `${day(start)}, ${time(start)} to ${time(end)} · ${lengthLabel(mins)}`
    : `${day(start)}, ${time(start)} to ${day(end)}, ${time(end)}`;

  // Moving the start keeps the length, so a 6 to 9 pm event stays three hours.
  const onStart = (startsLocal) => {
    if (!startsLocal) return set({ startsLocal });
    return set({ startsLocal, endsLocal: plusHours(startsLocal, (mins > 0 ? mins : 120) / 60) });
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="c3-label" htmlFor="ev-start">starts</label>
          <input id="ev-start" type="datetime-local" className="c3-input" disabled={disabled}
            value={form.startsLocal} onChange={(e) => onStart(e.target.value)} />
        </div>
        <div>
          <label className="c3-label" htmlFor="ev-end">ends</label>
          <input id="ev-end" type="datetime-local" className="c3-input" disabled={disabled} min={form.startsLocal}
            value={form.endsLocal} onChange={(e) => set({ endsLocal: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {LENGTHS.map((h) => (
          <Chip key={h} on={mins === h * 60} disabled={disabled || !form.startsLocal}
            onClick={() => set({ endsLocal: plusHours(form.startsLocal, h) })}>
            {lengthLabel(h * 60)}
          </Chip>
        ))}
        {summary && <p className="text-xs text-muted-foreground sm:ml-2">{summary} · Melbourne time</p>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- contact --

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function ContactFields({ form, set, user, disabled }) {
  const isYou = !!user?.email && form.contactEmail.trim().toLowerCase() === user.email.toLowerCase();
  const complete = form.contactName.trim() && form.contactEmail.trim() && form.contactPhone.trim();
  const [editing, setEditing] = useState(!(complete && isYou));
  const phoneError = phoneProblem(form.contactPhone);
  const phoneNeeded = form.isGrantFunded && !form.contactPhone.trim();
  const remembers = isYou && form.contactPhone.trim() && !phoneError
    && formatPhone(form.contactPhone) !== (user?.phone || '');

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-border bg-secondary/40 p-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center text-sm font-bold">
            {initials(form.contactName)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {form.contactName} <span className="c3-badge ml-1 py-0.5">you</span>
            </p>
            <p className="text-xs text-muted-foreground truncate">{form.contactEmail}</p>
            <p className="text-xs text-muted-foreground">{form.contactPhone}</p>
          </div>
        </div>
        <button type="button" disabled={disabled} className="c3-btn-ghost text-xs shrink-0" onClick={() => setEditing(true)}>
          change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="c3-label" htmlFor="ev-cname">name</label>
          <input id="ev-cname" className="c3-input" disabled={disabled} autoComplete="name" maxLength={120}
            value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} />
        </div>
        <div>
          <label className="c3-label" htmlFor="ev-cemail">email</label>
          <input id="ev-cemail" type="email" className="c3-input" disabled={disabled} autoComplete="email" maxLength={254}
            value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="c3-label" htmlFor="ev-cphone">
          phone {!form.isGrantFunded && <span className="font-normal text-muted-foreground">(optional)</span>}
        </label>
        <input id="ev-cphone" type="tel" inputMode="tel" className="c3-input sm:max-w-[16rem]" disabled={disabled}
          autoComplete="tel" maxLength={32} placeholder="04xx xxx xxx"
          value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })}
          onBlur={() => set({ contactPhone: formatPhone(form.contactPhone) })} />
        {phoneError
          ? <p className="text-xs text-destructive mt-1">{phoneError}</p>
          : phoneNeeded
            ? <p className="text-xs text-muted-foreground mt-1">Needed for grant-funded events, in case UMSU has a question.</p>
            : remembers
              ? <p className="text-xs text-muted-foreground mt-1">We'll keep this on your profile for next time.</p>
              : null}
      </div>
      {user && !isYou && (
        <button type="button" disabled={disabled} className="text-xs font-medium text-primary hover:underline"
          onClick={() => set({ ...contactFor(user), contactPhone: user.phone || form.contactPhone })}>
          use my details
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ cover --

function CoverField({ url, clubId, disabled, onChange }) {
  const [uploading, setUploading] = useState(false);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Cover images must be under 5 MB.');
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await api.upload(f, clubId);
      onChange(file_url);
    } catch (err) {
      toast.error(err.message || 'Could not upload that image.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <p className="c3-label">cover image <span className="font-normal text-muted-foreground">(optional)</span></p>
      <div className="flex items-center gap-3">
        {url ? (
          <img src={url} alt="" className="w-28 h-16 rounded-xl object-cover border-2 border-border" />
        ) : (
          <span className="w-28 h-16 rounded-xl border-2 border-dashed border-border grid place-items-center text-muted-foreground">
            <ImagePlus className="w-5 h-5" />
          </span>
        )}
        <label className={`c3-btn-secondary ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {url ? 'replace' : 'upload'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={disabled || uploading} onChange={onFile} />
        </label>
        {url && !disabled && (
          <button type="button" onClick={() => onChange('')} className="c3-btn-ghost text-xs">remove</button>
        )}
      </div>
    </div>
  );
}
