import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { getClubBySlug } from '@/lib/clubs';
import { fromLocalInputValue, slugify, randomToken, toLocalInputValue } from '@/lib/format';
import { UMSU_RULES } from '@/lib/umsu';
import { toast } from 'sonner';
import { Loader2, Upload, AlertTriangle } from 'lucide-react';

function defaultStart() {
  const d = new Date();
  d.setHours(d.getHours() + 24, 0, 0, 0);
  return toLocalInputValue(d.toISOString());
}
function plusHours(localStr, h) {
  const d = new Date(localStr);
  d.setHours(d.getHours() + h);
  return toLocalInputValue(d.toISOString());
}

export default function EventNew() {
  const { clubSlug } = useParams();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsLocal, setStartsLocal] = useState(defaultStart());
  const [endsLocal, setEndsLocal] = useState(plusHours(defaultStart(), 2));
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  const [capacity, setCapacity] = useState('');
  const [rsvpRequired, setRsvpRequired] = useState(true);
  const [isGrantFunded, setIsGrantFunded] = useState(false);
  const [grantCategory, setGrantCategory] = useState('Functions');
  const [grantAmount, setGrantAmount] = useState('');
  const [collectDietary, setCollectDietary] = useState(false);
  const [collectAccessibility, setCollectAccessibility] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => setClub(await getClubBySlug(clubSlug)))(); }, [clubSlug]);

  useEffect(() => {
    if (new Date(endsLocal) <= new Date(startsLocal)) {
      setEndsLocal(plusHours(startsLocal, 2));
    }
  }, [startsLocal]);

  const onCover = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error('Cover must be under 5 MB');
    setCoverUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
    setCoverUrl(file_url);
    setCoverUploading(false);
  };

  const validate = (publishing) => {
    if (!title.trim()) return 'Title is required.';
    if (title.length > 120) return 'Title must be 120 chars or fewer.';
    if (description.length > 5000) return 'Description must be 5000 chars or fewer.';
    if (!locationName.trim()) return 'Location is required.';
    if (!startsLocal || !endsLocal) return 'Start and end times are required.';
    if (new Date(endsLocal) < new Date(startsLocal)) return 'End time must be after start time.';
    if (publishing && new Date(startsLocal) < new Date()) return 'Start time must be in the future to publish.';
    if (isGrantFunded) {
      if (!grantCategory) return 'Grant category is required.';
      if (!grantAmount || Number(grantAmount) <= 0) return 'Grant amount must be greater than zero.';
    }
    return null;
  };

  const buildPayload = (publish) => {
    const payload = {
      club_id: club.id,
      club_slug: club.slug,
      club_name: club.name,
      title: title.trim(),
      description: description.trim() || undefined,
      starts_at: fromLocalInputValue(startsLocal),
      ends_at: fromLocalInputValue(endsLocal),
      location_name: locationName.trim(),
      location_address: locationAddress.trim() || undefined,
      cover_image_url: coverUrl || undefined,
      capacity: capacity ? Number(capacity) : undefined,
      rsvp_required: rsvpRequired,
      is_grant_funded: isGrantFunded,
      grant_category: isGrantFunded ? grantCategory : undefined,
      grant_amount_cents: isGrantFunded ? Math.round(Number(grantAmount) * 100) : undefined,
      collect_dietary: collectDietary,
      collect_accessibility: collectAccessibility,
      status: publish ? 'published' : 'draft',
    };
    if (publish) {
      payload.published_at = new Date().toISOString();
      payload.public_slug = `${slugify(title)}-${randomToken(6)}`;
      payload.qr_token = randomToken(32);
    }
    return payload;
  };

  const save = async (publish) => {
    const err = validate(publish);
    if (err) return toast.error(err);
    if (!club) return;
    setSaving(true);
    const ev = await base44.entities.Event.create(buildPayload(publish));
    await base44.entities.AuditLog.create({
      club_id: club.id, event_id: ev.id, action: publish ? 'event.published' : 'event.created',
      metadata: { title: ev.title },
    });
    toast.success(publish ? 'Published' : 'Saved as draft');
    navigate(`/c/${clubSlug}/events/${ev.id}`);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-medium mb-1">create event</h1>
      <p className="text-sm text-muted-foreground mb-6">Save a draft now, publish later.</p>

      <div className="c3-card p-6 space-y-5">
        <div>
          <label className="c3-label">title</label>
          <input className="c3-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Winter trivia night" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="c3-label">starts (Melbourne time)</label>
            <input type="datetime-local" className="c3-input" value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} />
          </div>
          <div>
            <label className="c3-label">ends</label>
            <input type="datetime-local" className="c3-input" value={endsLocal} onChange={(e) => setEndsLocal(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="c3-label">location name</label>
          <input className="c3-input" value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Old Arts Building, Room G16" />
        </div>
        <div>
          <label className="c3-label">address (optional)</label>
          <input className="c3-input" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} placeholder="Old Arts Building, Parkville VIC 3010" />
        </div>

        <div>
          <label className="c3-label">description (markdown supported)</label>
          <textarea className="c3-input" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
        </div>

        <div>
          <label className="c3-label">cover image (optional, ≤5 MB)</label>
          <label className="flex items-center gap-2 cursor-pointer c3-btn-secondary w-fit">
            {coverUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {coverUrl ? 'replace' : 'upload'}
            <input type="file" accept="image/*" className="hidden" onChange={onCover} />
          </label>
          {coverUrl && <img src={coverUrl} alt="cover" className="mt-3 w-full max-w-sm rounded-lg border border-border object-cover" />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="c3-label">capacity (optional)</label>
            <input type="number" min={1} className="c3-input" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="unlimited" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={rsvpRequired} onChange={(e) => setRsvpRequired(e.target.checked)} />
              public RSVP page
            </label>
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isGrantFunded} onChange={(e) => setIsGrantFunded(e.target.checked)} />
            grant-funded event
          </label>

          {isGrantFunded && (
            <div className="mt-4 space-y-4">
              <div className="flex gap-2 p-3 rounded-lg bg-secondary border border-border text-xs">
                <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-muted-foreground">Grant-funded events require student number and course on RSVP and check-in. UMSU rules.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="c3-label">grant category</label>
                  <select className="c3-input" value={grantCategory} onChange={(e) => setGrantCategory(e.target.value)}>
                    {UMSU_RULES.grant_categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="c3-label">grant amount (AUD)</label>
                  <input type="number" step="0.01" min="0" className="c3-input" value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} placeholder="150.00" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-5">
          <p className="c3-label">collect extra fields on RSVP</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={collectDietary} onChange={(e) => setCollectDietary(e.target.checked)} /> dietary requirements</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={collectAccessibility} onChange={(e) => setCollectAccessibility(e.target.checked)} /> accessibility requirements</label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <button onClick={() => save(false)} disabled={saving} className="c3-btn-secondary">save as draft</button>
          <button onClick={() => save(true)} disabled={saving} className="c3-btn-primary">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} publish
          </button>
        </div>
      </div>
    </div>
  );
}