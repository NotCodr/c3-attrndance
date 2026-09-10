import { db } from '@/api/db';

// Club and membership lookups, plus the role ladder used to decide what the UI
// offers. These checks are advisory only: the authoritative copy lives in
// supabase/functions/_shared/policy.ts and runs on the server, where a client
// cannot reach it.

export async function listMyMemberships(userEmail) {
  if (!userEmail) return [];
  const rows = await db.ClubMembership.filter({ user_email: userEmail.toLowerCase() });
  return rows;
}

export async function listMyClubs(userEmail) {
  const memberships = await listMyMemberships(userEmail);
  if (memberships.length === 0) return [];
  // One $in query rather than a request per membership.
  const ids = [...new Set(memberships.map((m) => m.club_id))];
  const clubs = await db.Club.filter({ id: { $in: ids } });
  const roleByClubId = new Map(memberships.map((m) => [m.club_id, m.role]));
  return clubs.map((c) => ({ ...c, role: roleByClubId.get(c.id) }));
}

export async function getClubBySlug(slug) {
  const rows = await db.Club.filter({ slug });
  return rows[0] || null;
}

export async function getMyRoleInClub(clubId, userEmail) {
  if (!userEmail) return null;
  const rows = await db.ClubMembership.filter({
    club_id: clubId,
    user_email: userEmail.toLowerCase(),
  });
  return rows[0]?.role || null;
}

export const ROLE_RANK = { scanner: 1, treasurer: 2, admin: 3, owner: 4 };

export function hasAtLeastRole(userRole, required) {
  if (!userRole) return false;
  return (ROLE_RANK[userRole] || 0) >= (ROLE_RANK[required] || 0);
}

export function canEditEvents(role) {
  return hasAtLeastRole(role, 'admin');
}
export function canScan(role) {
  return hasAtLeastRole(role, 'scanner');
}
export function canManageAcquittal(role) {
  return hasAtLeastRole(role, 'treasurer');
}