// Authorisation policy for the data gateway.
//
// Every table is deny-by-default at the RLS layer and the API holds the only
// key, so this file is the whole permission model. The mirror of the role ladder
// in src/lib/clubs.js decides which buttons to draw and nothing more.
//
// Two ideas do the work:
//
//   1. Club scoping. Almost every row belongs to a club. A caller may only touch
//      rows in clubs they belong to, and the gateway *rewrites* the query to
//      enforce that rather than trusting what arrived.
//   2. Role floors. Each entity declares the minimum club role needed to read
//      and to write it, checked against the caller's role in that club.

import type { Actor, ClubRole } from "./session.ts";
import { hasAtLeastRole, memberClubIds, roleInClub } from "./session.ts";

export type Op = "filter" | "get" | "create" | "update" | "delete";

interface EntityRule {
  /** Postgres table backing this entity. */
  table: string;
  /** Minimum club role to read. "public" means anyone, signed out included. */
  read: ClubRole | "public";
  /** Minimum club role to create, update or delete. */
  write: ClubRole;
  /** Stripped from responses for callers who are not club members. */
  publicRedact?: string[];
  /** The server owns these; a client may never set them. */
  serverOwned?: string[];
}

// The keys are the entity names the React client already used, which is why the
// frontend needed no changes when the backend moved.
export const RULES: Record<string, EntityRule> = {
  // Public: the /p/:slug page and the RSVP form need it. Contact addresses are
  // committee-only, so they are stripped for outsiders.
  Club: {
    table: "clubs",
    read: "public",
    write: "admin",
    publicRedact: ["primary_contact_email", "treasurer_email", "umsu_affiliation_code"],
  },
  Event: { table: "events", read: "public", write: "admin" },

  ClubMembership: { table: "club_memberships", read: "scanner", write: "admin" },
  RSVP: { table: "rsvps", read: "scanner", write: "admin" },
  CheckIn: { table: "check_ins", read: "scanner", write: "scanner" },
  EventPhoto: { table: "event_photos", read: "scanner", write: "treasurer" },
  EventReceipt: { table: "event_receipts", read: "treasurer", write: "treasurer" },
  AcquittalPack: { table: "acquittal_packs", read: "treasurer", write: "treasurer" },
  // actor_email is stamped from the session so a client cannot forge who acted.
  AuditLog: { table: "audit_logs", read: "admin", write: "scanner", serverOwned: ["actor_email"] },
};

/** Never reachable through the gateway at any privilege level. */
export const FORBIDDEN = new Set(["AppUser", "AppSession", "app_users", "app_sessions"]);

export function ruleFor(entity: string): EntityRule | null {
  if (FORBIDDEN.has(entity)) return null;
  return RULES[entity] || null;
}

/**
 * Whether an outsider may see this row.
 *
 * The security boundary for publicly readable entities, evaluated per row rather
 * than as a query constraint so a cleverly shaped filter cannot slip past it.
 *
 * Cancelled and completed events stay visible on purpose: someone holding a link
 * to a called-off event should be told it was called off, not shown a bare "not
 * found". Drafts stay hidden, because they have not been announced.
 */
export function isPubliclyVisible(entity: string, row: Record<string, unknown>): boolean {
  if (entity === "Club") return !row.deleted_at;
  if (entity === "Event") return row.status !== "draft";
  return false;
}

/**
 * Provenance columns hold the email of whoever created the row, so they leak a
 * committee member's personal address on any publicly readable entity. Stripped
 * for every entity rather than listed per-entity, because the next public table
 * would otherwise leak it again by omission.
 */
const ALWAYS_REDACT = ["created_by", "created_by_id"];

export function redactForOutsider(entity: string, row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  for (const f of ALWAYS_REDACT) delete copy[f];
  for (const f of RULES[entity]?.publicRedact || []) delete copy[f];
  return copy;
}

export function stripServerOwned(entity: string, data: Record<string, unknown>): Record<string, unknown> {
  const rule = RULES[entity];
  const copy = { ...data };
  for (const f of ["id", "created_date", "updated_date", "created_by"]) delete copy[f];
  for (const f of rule?.serverOwned || []) delete copy[f];
  return copy;
}

/** Club ids where the caller holds at least `required`. */
export function clubIdsWithRole(actor: Actor | null, required: ClubRole): string[] {
  if (!actor) return [];
  return memberClubIds(actor).filter((id) => hasAtLeastRole(roleInClub(actor, id), required));
}

export function canActOnClub(actor: Actor | null, clubId: string | undefined, required: ClubRole): boolean {
  if (!actor || !clubId) return false;
  return hasAtLeastRole(roleInClub(actor, clubId), required);
}
