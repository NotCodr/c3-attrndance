import React, { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { db } from '@/api/db';
import { getClubBySlug, getMyRoleInClub, canEditEvents } from '@/lib/clubs';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2 } from 'lucide-react';

const ROLES = ['owner', 'admin', 'treasurer', 'scanner'];

export default function Committee() {
  const { clubSlug } = useParams();
  const { user } = useOutletContext() || {};
  const [club, setClub] = useState(null);
  const [role, setRole] = useState(null);
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('scanner');
  const [inviting, setInviting] = useState(false);

  const reload = async () => {
    const c = await getClubBySlug(clubSlug);
    setClub(c);
    if (user?.email) setRole(await getMyRoleInClub(c.id, user.email));
    setMembers(await db.ClubMembership.filter({ club_id: c.id }));
  };
  useEffect(() => { reload(); }, [clubSlug, user?.email]);

  if (!club) return <div className="text-sm text-muted-foreground">loading…</div>;
  const canManage = canEditEvents(role);

  const invite = async (e) => {
    e.preventDefault();
    const lc = email.toLowerCase().trim();
    if (!lc) return;
    const existing = await db.ClubMembership.filter({ club_id: club.id, user_email: lc });
    if (existing[0]) return toast.error('Already a member.');
    setInviting(true);
    await db.ClubMembership.create({
      club_id: club.id, user_email: lc, role: inviteRole, invited_by_email: user?.email,
    });
    await db.AuditLog.create({ club_id: club.id, action: 'committee.invited', actor_email: user?.email, metadata: { email: lc, role: inviteRole } });
    setEmail('');
    setInviting(false);
    toast.success('Member added');
    reload();
  };

  const changeRole = async (m, newRole) => {
    if (m.role === 'owner' && role !== 'owner') return toast.error('Only the owner can change the owner.');
    await db.ClubMembership.update(m.id, { role: newRole });
    reload();
  };

  const remove = async (m) => {
    if (m.role === 'owner') return toast.error("Can't remove the owner.");
    if (!confirm(`Remove ${m.user_email}?`)) return;
    await db.ClubMembership.delete(m.id);
    reload();
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-medium mb-1">committee</h1>
      <p className="text-sm text-muted-foreground mb-6">Members of {club.name}.</p>

      {canManage && (
        <form onSubmit={invite} className="c3-card p-4 mb-6 flex flex-col sm:flex-row gap-2">
          <input type="email" className="c3-input flex-1" placeholder="email to add" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <select className="c3-input sm:w-36" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            {ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button disabled={inviting} className="c3-btn-primary">{inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} add</button>
        </form>
      )}

      <div className="c3-card divide-y divide-border">
        {members.map((m) => (
          <div key={m.id} className="p-3 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">{m.full_name || m.user_email}</p>
              <p className="text-xs text-muted-foreground truncate">{m.user_email}{!m.accepted_at && ' · pending'}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canManage && m.role !== 'owner' ? (
                <select className="bg-secondary border border-border rounded-md text-xs px-2 py-1" value={m.role} onChange={(e) => changeRole(m, e.target.value)}>
                  {ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : (
                <span className="c3-badge">{m.role}</span>
              )}
              {canManage && m.role !== 'owner' && (
                <button onClick={() => remove(m)} className="c3-btn-ghost text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}