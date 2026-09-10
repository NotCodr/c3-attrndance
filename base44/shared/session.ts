// Session resolution and club-role lookup.
//
// This is the authoritative implementation of connect3's permission ladder. The
// copy in src/lib/clubs.js decides only what the UI renders; it is advisory and
// a client can lie about it freely. Nothing may be authorised from that copy.

import { sha256Hex } from "./crypto.ts";

export const SESSION_DAYS = 30;

export type ClubRole = "scanner" | "treasurer" | "admin" | "owner";

export const ROLE_RANK: Record<ClubRole, number> = {
  scanner: 1,
  treasurer: 2,
  admin: 3,
  owner: 4,
};

export interface AppUserRecord {
  id: string;
  email: string;
  full_name?: string;
  status?: string;
  email_verified?: boolean;
  [k: string]: unknown;
}

export interface Membership {
  club_id: string;
  role: ClubRole;
  [k: string]: unknown;
}

export interface Actor {
  user: AppUserRecord;
  sessionId: string;
  memberships: Membership[];
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

/**
 * Resolves the caller from their bearer token, or null if there isn't a valid one.
 *
 * Tokens are looked up by SHA-256 hash: the raw token is never stored, so a leak
 * of the AppSession table cannot be replayed as a login.
 */
export async function resolveActor(svc: any, req: Request): Promise<Actor | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const sessions = await svc.entities.AppSession.filter({ token_hash: tokenHash }, undefined, 1);
  const session = sessions[0];
  if (!session) return null;
  if (session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;

  const user = await svc.entities.AppUser.get(session.user_id).catch(() => null);
  if (!user || user.status === "disabled") return null;

  const memberships = await svc.entities.ClubMembership.filter({
    user_email: String(user.email).toLowerCase(),
  });

  return { user, sessionId: session.id, memberships: memberships as Membership[] };
}

export function roleInClub(actor: Actor | null, clubId: string | undefined): ClubRole | null {
  if (!actor || !clubId) return null;
  const m = actor.memberships.find((x) => x.club_id === clubId);
  return (m?.role as ClubRole) || null;
}

export function hasAtLeastRole(role: ClubRole | null, required: ClubRole): boolean {
  if (!role) return false;
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[required] || 0);
}

/** Club ids the caller belongs to, for scoping list queries. */
export function memberClubIds(actor: Actor | null): string[] {
  if (!actor) return [];
  return [...new Set(actor.memberships.map((m) => m.club_id))];
}

export async function issueSession(svc: any, userId: string, rawToken: string, userAgent?: string) {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return await svc.entities.AppSession.create({
    user_id: userId,
    token_hash: await sha256Hex(rawToken),
    expires_at: expires.toISOString(),
    user_agent: userAgent?.slice(0, 300),
    last_seen_at: new Date().toISOString(),
  });
}

/** The shape of a user that is safe to hand to the browser. */
export function publicUser(user: AppUserRecord) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name || null,
    email_verified: !!user.email_verified,
  };
}
