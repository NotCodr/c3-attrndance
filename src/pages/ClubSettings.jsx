import React, { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { db, api } from '@/api/db';
import { getClubBySlug, getMyRoleInClub, canEditEvents } from '@/lib/clubs';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { Loader2, ExternalLink, Upload } from 'lucide-react';

export default function ClubSettings() {
  const { clubSlug } = useParams();
  const { user } = useOutletContext() || {};
  const [club, setClub] = useState(null);
  const [role, setRole] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const { refresh } = useAuth();

  useEffect(() => {
    (async () => {
      const c = await getClubBySlug(clubSlug);
      setClub(c);
      if (user?.email) setRole(await getMyRoleInClub(c.id, user.email));
      setForm({
        name: c.name, instagram_handle: c.instagram_handle || '', description: c.description || '',
        website_url: c.website_url || '', umsu_affiliation_code: c.umsu_affiliation_code || '',
        primary_contact_email: c.primary_contact_email, treasurer_email: c.treasurer_email || '',
        logo_url: c.logo_url || '',
      });
    })();
  }, [clubSlug, user?.email]);

  if (!club) return <div className="text-sm text-muted-foreground">loading…</div>;
  const canEdit = canEditEvents(role);

  const save = async (e) => {
    e.preventDefault();
    if (!form.name?.trim()) return toast.error('Club name is required.');
    if (!form.primary_contact_email?.trim()) return toast.error('Primary contact email is required.');

    setSaving(true);
    try {
      const updated = await db.Club.update(club.id, {
        ...form,
        name: form.name.trim(),
        primary_contact_email: form.primary_contact_email.toLowerCase().trim(),
        treasurer_email: (form.treasurer_email || form.primary_contact_email).toLowerCase().trim(),
        logo_url: form.logo_url || null,
      });
      setClub(updated);
      // The club switcher and shell read from auth context, so a renamed club
      // would otherwise keep its old name until a reload.
      await refresh();
      toast.success('Saved');
    } catch (err) {
      toast.error(err.message || 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  const onLogo = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error('Logo must be under 5 MB');
    setLogoUploading(true);
    try {
      const { file_url } = await api.upload(f, club.id);
      setForm((prev) => ({ ...prev, logo_url: file_url }));
      toast.success('Logo uploaded. Remember to save.');
    } catch (err) {
      toast.error(err.message || 'Could not upload that image.');
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-medium mb-1">settings</h1>
      <p className="text-sm text-muted-foreground mb-6">Edit your club details.</p>

      <div className="c3-card p-4 mb-6 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">public club page</span>
        <a href={`/p/${club.slug}`} target="_blank" rel="noreferrer" className="text-foreground hover:underline inline-flex items-center gap-1">/p/{club.slug} <ExternalLink className="w-3.5 h-3.5" /></a>
      </div>

      <form onSubmit={save} className="c3-card p-6 space-y-4">
        <div>
          <label className="c3-label">logo</label>
          <div className="flex items-center gap-3">
            {form.logo_url
              ? <img src={form.logo_url} alt="" className="w-14 h-14 rounded-lg object-cover border border-border" />
              : <div className="w-14 h-14 rounded-lg bg-primary/15 flex items-center justify-center font-display font-bold text-primary text-lg">
                  {form.name?.[0]?.toUpperCase() || 'C'}
                </div>}
            {canEdit && (
              <>
                <label className="flex items-center gap-2 cursor-pointer c3-btn-secondary w-fit">
                  {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {form.logo_url ? 'replace' : 'upload'}
                  <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                </label>
                {form.logo_url && (
                  <button type="button" onClick={() => setForm({ ...form, logo_url: '' })} className="c3-btn-ghost text-xs">
                    remove
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div><label className="c3-label">name</label><input className="c3-input" value={form.name || ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="c3-label">instagram handle</label><input className="c3-input" value={form.instagram_handle || ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, instagram_handle: e.target.value })} /></div>
        <div><label className="c3-label">website</label><input className="c3-input" value={form.website_url || ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, website_url: e.target.value })} /></div>
        <div><label className="c3-label">UMSU affiliation code</label><input className="c3-input" value={form.umsu_affiliation_code || ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, umsu_affiliation_code: e.target.value })} /></div>
        <div><label className="c3-label">primary contact email</label><input className="c3-input" value={form.primary_contact_email || ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, primary_contact_email: e.target.value })} /></div>
        <div><label className="c3-label">treasurer email</label><input className="c3-input" value={form.treasurer_email || ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, treasurer_email: e.target.value })} /></div>
        <div><label className="c3-label">description</label><textarea rows={4} className="c3-input" value={form.description || ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        {canEdit && <button disabled={saving} className="c3-btn-primary">{saving && <Loader2 className="w-4 h-4 animate-spin" />} save</button>}
      </form>
    </div>
  );
}