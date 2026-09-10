import React, { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { db, api } from '@/api/db';
import { slugify } from '@/lib/format';
import { UNIVERSITY_OPTIONS } from '@/lib/umsu';
import { toast } from 'sonner';
import { Upload, ArrowRight, Loader2 } from 'lucide-react';

export default function Onboard() {
  const { user } = useOutletContext() || {};
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [university, setUniversity] = useState('unimelb');
  const [instagram, setInstagram] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);

  const [primaryEmail, setPrimaryEmail] = useState(user?.email || '');
  const [treasurerEmail, setTreasurerEmail] = useState('');

  const [invites, setInvites] = useState([{ email: '', role: 'admin' }]);

  React.useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  React.useEffect(() => {
    if (!primaryEmail && user?.email) setPrimaryEmail(user.email);
  }, [user]);

  const validateSlug = (s) => /^[a-z0-9-]{3,40}$/.test(s);

  const onLogoChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error('Logo must be under 5 MB');
    setLogoUploading(true);
    const { file_url } = await api.upload(f);
    setLogoUrl(file_url);
    setLogoUploading(false);
  };

  const createClub = async () => {
    if (!validateSlug(slug)) return toast.error('Slug must be 3–40 chars, lowercase letters/digits/hyphens.');
    if (!primaryEmail.trim()) return toast.error('Primary contact email is required.');

    setSaving(true);
    const u = UNIVERSITY_OPTIONS.find((o) => o.slug === university);
    try {
      // Slug uniqueness and the founder's owner membership are both handled by
      // the backend, in the same call that creates the club — a club can never
      // end up existing without an owner.
      const club = await db.Club.create({
        name: name.trim(),
        slug,
        university,
        university_name: u?.name,
        union_name: u?.union,
        instagram_handle: instagram.replace(/^@/, '').trim() || undefined,
        description: description.trim() || undefined,
        logo_url: logoUrl || undefined,
        primary_contact_email: primaryEmail.toLowerCase().trim(),
        treasurer_email: (treasurerEmail || primaryEmail).toLowerCase().trim(),
      });

      for (const inv of invites.filter((i) => i.email.trim())) {
        await db.ClubMembership.create({
          club_id: club.id,
          user_email: inv.email.toLowerCase().trim(),
          role: inv.role,
          invited_by_email: user.email.toLowerCase(),
        });
      }

      await db.AuditLog.create({
        club_id: club.id,
        action: 'club.created',
        metadata: { name: club.name },
      });

      // The shell reads clubs from auth context, so refresh before navigating
      // or the new club won't be in the switcher.
      await refresh();
      toast.success('Club created');
      navigate(`/c/${club.slug}`);
    } catch (err) {
      toast.error(err.message || 'Could not create the club.');
      setSaving(false);
    }
  };

  const StepBadge = ({ n, label }) => (
    <div className={`flex items-center gap-2 text-xs ${step >= n ? 'text-foreground' : 'text-muted-foreground'}`}>
      <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${step >= n ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>{n}</span>
      {label}
    </div>
  );

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-medium mb-1">create your club</h1>
      <p className="text-sm text-muted-foreground mb-6">A few details and you're in.</p>

      <div className="flex items-center gap-4 mb-6">
        <StepBadge n={1} label="club" />
        <div className="h-px flex-1 bg-border" />
        <StepBadge n={2} label="your role" />
        <div className="h-px flex-1 bg-border" />
        <StepBadge n={3} label="invites" />
      </div>

      {step === 1 && (
        <div className="c3-card p-6 space-y-4">
          <div>
            <label className="c3-label">club name</label>
            <input className="c3-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="DSCubed" />
          </div>
          <div>
            <label className="c3-label">slug</label>
            <input className="c3-input font-mono text-xs" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} placeholder="dscubed" />
            <p className="text-xs text-muted-foreground mt-1">Your URL: /p/{slug || 'your-slug'}</p>
          </div>
          <div>
            <label className="c3-label">university</label>
            <select className="c3-input" value={university} onChange={(e) => setUniversity(e.target.value)}>
              {UNIVERSITY_OPTIONS.map((u) => <option key={u.slug} value={u.slug}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="c3-label">instagram (optional)</label>
            <input className="c3-input" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="dscubedclub" />
          </div>
          <div>
            <label className="c3-label">description (optional)</label>
            <textarea className="c3-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's your club about?" />
          </div>
          <div>
            <label className="c3-label">logo (optional)</label>
            <label className="flex items-center gap-2 cursor-pointer c3-btn-secondary w-fit">
              {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {logoUrl ? 'replace' : 'upload'}
              <input type="file" accept="image/*" className="hidden" onChange={onLogoChange} />
            </label>
            {logoUrl && <img src={logoUrl} alt="logo" className="mt-3 w-16 h-16 rounded-lg object-cover border border-border" />}
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={() => name && validateSlug(slug) ? setStep(2) : toast.error('Enter a valid name and slug.')}
              className="c3-btn-primary"
            >
              next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="c3-card p-6 space-y-4">
          <p className="text-sm">You'll be the <span className="text-foreground font-medium">owner</span> of this club.</p>
          <div>
            <label className="c3-label">primary contact email</label>
            <input className="c3-input" value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Used for UMSU correspondence.</p>
          </div>
          <div>
            <label className="c3-label">treasurer email (optional)</label>
            <input className="c3-input" value={treasurerEmail} onChange={(e) => setTreasurerEmail(e.target.value)} placeholder="defaults to primary contact" />
          </div>
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="c3-btn-ghost">back</button>
            <button onClick={() => setStep(3)} className="c3-btn-primary">next <ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="c3-card p-6 space-y-4">
          <p className="text-sm">Invite committee members. Optional — you can add them later.</p>
          {invites.map((inv, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="c3-input flex-1"
                placeholder="email"
                value={inv.email}
                onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
              />
              <select
                className="c3-input w-32"
                value={inv.role}
                onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
              >
                <option value="admin">admin</option>
                <option value="treasurer">treasurer</option>
                <option value="scanner">scanner</option>
              </select>
            </div>
          ))}
          {invites.length < 10 && (
            <button onClick={() => setInvites([...invites, { email: '', role: 'admin' }])} className="c3-btn-ghost text-xs">+ add another</button>
          )}
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="c3-btn-ghost">back</button>
            <button onClick={createClub} disabled={saving} className="c3-btn-primary">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} create club
            </button>
          </div>
        </div>
      )}
    </div>
  );
}