import { base44 } from '@/api/base44Client';

// Client-side helpers that wrap Base44 entity calls for club + membership lookups.

export async function getCurrentUser() {
  try {
    return await base44.auth.me();
  } catch {
    return null;
  }
}

export async function listMyMemberships(userEmail) {
  if (!userEmail) return [];
  const rows = await base44.entities.ClubMembership.filter({ user_email: userEmail.toLowerCase() });
  return rows;
}

export async function listMyClubs(userEmail) {
  const memberships = await listMyMemberships(userEmail);
  if (memberships.length === 0) return [];
  const clubs = await Promise.all(
    memberships.map(async (m) => {
      const c = await base44.entities.Club.filter({ id: m.club_id });
      return c[0] ? { ...c[0], role: m.role } : null;
    })
  );
  return clubs.filter(Boolean);
}

export async function getClubBySlug(slug) {
  const rows = await base44.entities.Club.filter({ slug });
  return rows[0] || null;
}

export async function getMyRoleInClub(clubId, userEmail) {
  if (!userEmail) return null;
  const rows = await base44.entities.ClubMembership.filter({
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