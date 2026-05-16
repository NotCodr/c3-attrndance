import React, { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { getClubBySlug, getMyRoleInClub, canEditEvents } from '@/lib/clubs';
import { toast } from 'sonner';
import { Loader2, ExternalLink } from 'lucide-react';

export default function ClubSettings() {
  const { clubSlug } = useParams();
  const { user } = useOutletContext() || {};
  const [club, setClub] = useState(null);
  const [role, setRole] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const c = await getClubBySlug(clubSlug);
      setClub(c);
      if (user?.email) setRole(await getMyRoleInClub(c.id, user.email));
      setForm({
        name: c.name, instagram_handle: c.instagram_handle || '', description: c.description || '',
        website_url: c.website_url || '', umsu_affiliation_code: c.umsu_affiliation_code || '',
        primary_contact_email: c.primary_contact_email, treasurer_email: c.treasurer_email || '',
      });
    })();
  }, [clubSlug, user?.email]);

  if (!club) return <div className="text-sm text-muted-foreground">loading…</div>;
  const canEdit = canEditEvents(role);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    await base44.entities.Club.update(club.id, {
      ...form,
      primary_contact_email: form.primary_contact_email.toLowerCase().trim(),
      treasurer_email: (form.treasurer_email || form.primary_contact_email).toLowerCase().trim(),
    });
    setSaving(false);
    toast.success('Saved');
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