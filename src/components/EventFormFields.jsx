import React, { useState } from 'react';
import { api } from '@/api/db';
import { UMSU_RULES } from '@/lib/umsu';
import { plusHours } from '@/lib/events';
import { AlertTriangle, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

/**
 * The event form, shared by the create and edit screens so the two cannot drift.
 *
 * Controlled entirely by the caller: `form` holds the state, `onChange` takes a
 * partial patch.
 */
export default function EventFormFields({ form, onChange, clubId, disabled = false }) {
  const [coverUploading, setCoverUploading] = useState(false);
  const set = (patch) => onChange({ ...form, ...patch });

  const onCover = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error('Cover must be under 5 MB');
    setCoverUploading(true);
    try {
      const { file_url } = await api.upload(f, clubId);
      set({ coverUrl: file_url });
    } catch (err) {
      toast.error(err.message || 'Could not upload that image.');
    } finally {
      setCoverUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="c3-card p-6 space-y-5">
      <div>
        <label className="c3-label" htmlFor="ev-title">title</label>
        <input id="ev-title" className="c3-input" disabled={disabled} maxLength={120}
          value={form.title} onChange={(e) => set({ title: e.target.value })}
          placeholder="Winter trivia night" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="c3-label" htmlFor="ev-start">starts (Melbourne time)</label>
          <input id="ev-start" type="datetime-local" className="c3-input" disabled={disabled}
            value={form.startsLocal}
            onChange={(e) => {
              const startsLocal = e.target.value;
              // Keep the end after the start rather than letting it go invalid.
              const endsLocal = new Date(form.endsLocal) <= new Date(startsLocal)
                ? plusHours(startsLocal, 2)
                : form.endsLocal;
              set({ startsLocal, endsLocal });
            }} />
        </div>
        <div>
          <label className="c3-label" htmlFor="ev-end">ends</label>
          <input id="ev-end" type="datetime-local" className="c3-input" disabled={disabled}
            value={form.endsLocal} onChange={(e) => set({ endsLocal: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="c3-label" htmlFor="ev-loc">location name</label>
        <input id="ev-loc" className="c3-input" disabled={disabled}
          value={form.locationName} onChange={(e) => set({ locationName: e.target.value })}
          placeholder="Old Arts Building, Room G16" />
      </div>
      <div>
        <label className="c3-label" htmlFor="ev-addr">address (optional)</label>
        <input id="ev-addr" className="c3-input" disabled={disabled}
          value={form.locationAddress} onChange={(e) => set({ locationAddress: e.target.value })}
          placeholder="Old Arts Building, Parkville VIC 3010" />
      </div>

      <div>
        <label className="c3-label" htmlFor="ev-desc">description (markdown supported)</label>
        <textarea id="ev-desc" className="c3-input" rows={5} disabled={disabled} maxLength={5000}
          value={form.description} onChange={(e) => set({ description: e.target.value })} />
      </div>

      <div>
        <label className="c3-label">cover image (optional, ≤5 MB)</label>
        <div className="flex items-center gap-2">
          <label className={`flex items-center gap-2 c3-btn-secondary w-fit ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
            {coverUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {form.coverUrl ? 'replace' : 'upload'}
            <input type="file" accept="image/*" className="hidden" disabled={disabled} onChange={onCover} />
          </label>
          {form.coverUrl && !disabled && (
            <button type="button" onClick={() => set({ coverUrl: '' })} className="c3-btn-ghost text-xs">remove</button>
          )}
        </div>
        {form.coverUrl && <img src={form.coverUrl} alt="" className="mt-3 w-full max-w-sm rounded-lg border border-border object-cover" />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="c3-label" htmlFor="ev-cap">capacity (optional)</label>
          <input id="ev-cap" type="number" min={1} className="c3-input" disabled={disabled}
            value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} placeholder="unlimited" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" disabled={disabled} checked={form.rsvpRequired}
              onChange={(e) => set({ rsvpRequired: e.target.checked })} />
            public RSVP page
          </label>
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" disabled={disabled} checked={form.isGrantFunded}
            onChange={(e) => set({ isGrantFunded: e.target.checked })} />
          grant-funded event
        </label>

        {form.isGrantFunded && (
          <div className="mt-4 space-y-4">
            <div className="flex gap-2 p-3 rounded-lg bg-secondary border border-border text-xs">
              <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                Grant-funded events require student number and course on RSVP and check-in. UMSU rules.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="c3-label" htmlFor="ev-cat">grant category</label>
                <select id="ev-cat" className="c3-input" disabled={disabled}
                  value={form.grantCategory} onChange={(e) => set({ grantCategory: e.target.value })}>
                  {UMSU_RULES.grant_categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="c3-label" htmlFor="ev-amt">grant amount (AUD)</label>
                <input id="ev-amt" type="number" step="0.01" min="0" className="c3-input" disabled={disabled}
                  value={form.grantAmount} onChange={(e) => set({ grantAmount: e.target.value })} placeholder="150.00" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-5">
        <p className="c3-label">collect extra fields on RSVP</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" disabled={disabled} checked={form.collectDietary}
              onChange={(e) => set({ collectDietary: e.target.checked })} /> dietary requirements
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" disabled={disabled} checked={form.collectAccessibility}
              onChange={(e) => set({ collectAccessibility: e.target.checked })} /> accessibility requirements
          </label>
        </div>
      </div>
    </div>
  );
}
