// Session resolution and club-role lookup.
//
// The authoritative implementation of connect3's permission ladder. The copy in
// src/lib/clubs.js decides only what the UI renders; a client can lie about it
// freely, so nothing may be authorised from there.

import { sha256Hex } from "./crypto.ts";
import { db, one } from "./db.ts";

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
  full_name?: string | null;
  status?: string;
  email_verified?: boolean;
  password_hash?: string;
  [k: string]: unknown;
}

export interface Membership {
  club_id: string;
  role: ClubRole;
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
 * Sessions are looked up by SHA-256 of the token: the raw token is never stored,
 * so a dump of app_sessions cannot be replayed as a login.
 */
export async function resolveActor(req: Request): Promise<Actor | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const supabase = db();
  const session = await one<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>(
    supabase.from("app_sessions").select("id,user_id,expires_at,revoked_at")
      .eq("token_hash", await sha256Hex(token)).limit(1),
  );
  if (!session || session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;

  const user = await one<AppUserRecord>(
    supabase.from("app_users").select("*").eq("id", session.user_id).limit(1),
  );
  if (!user || user.status === "disabled") return null;

  // Equality, not ILIKE. Matching a membership by pattern would let an address
  // containing "_" or "%" pick up another member's row, and with it their role
  // in that club.
  const { data: memberships } = await supabase
    .from("club_memberships")
    .select("club_id,role")
    .eq("user_email", String(user.email).toLowerCase());

  return { user, sessionId: session.id, memberships: (memberships || []) as Membership[] };
}

export function roleInClub(actor: Actor | null, clubId: string | undefined): ClubRole | null {
  if (!actor || !clubId) return null;
  return actor.memberships.find((m) => m.club_id === clubId)?.role || null;
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

export async function issueSession(userId: string, rawToken: string, userAgent?: string) {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const { data, error } = await db().from("app_sessions").insert({
    user_id: userId,
    token_hash: await sha256Hex(rawToken),
    expires_at: expires.toISOString(),
    user_agent: userAgent?.slice(0, 300),
    last_seen_at: new Date().toISOString(),
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  let q = db().from("app_sessions").update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId).is("revoked_at", null);
  if (exceptSessionId) q = q.neq("id", exceptSessionId);
  await q;
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
