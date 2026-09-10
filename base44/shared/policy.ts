// Authorisation policy for the data gateway.
//
// Every entity is sealed at the RLS layer, so this file is the only thing
// standing between a request and the database. The rules here are the real
// permission model; src/lib/clubs.js merely decides what buttons to draw.
//
// Two ideas do most of the work:
//
//   1. Club scoping. Almost every record belongs to a club. A caller may only
//      touch records in clubs they are a member of, and the gateway *rewrites*
//      the incoming query to enforce that rather than trusting it.
//   2. Role floors. Each entity declares the minimum club role needed to read
//      and to write it, checked against the caller's role in that specific club.

import type { Actor, ClubRole } from "./session.ts";
import { hasAtLeastRole, memberClubIds, roleInClub } from "./session.ts";

export type Op = "filter" | "get" | "create" | "update" | "delete";

interface EntityRule {
  /** Minimum club role to read. "public" means anyone, including signed-out. */
  read: ClubRole | "public";
  /** Minimum club role to create/update/delete. */
  write: ClubRole;
  /** Fields stripped from responses for callers who are not club members. */
  publicRedact?: string[];
  /** Fields a client may never set or change; the server owns them. */
  serverOwned?: string[];
}

export const RULES: Record<string, EntityRule> = {
  // Readable by anyone: the /p/:slug page and the public RSVP form need it.
  // Contact addresses are committee-only, so they are stripped for outsiders.
  Club: {
    read: "public",
    write: "admin",
    publicRedact: ["primary_contact_email", "treasurer_email", "umsu_affiliation_code"],
  },
  // Public reads are additionally narrowed to published events in publicFilter().
  Event: { read: "public", write: "admin" },

  ClubMembership: { read: "scanner", write: "admin" },
  RSVP: { read: "scanner", write: "admin" },
  CheckIn: { read: "scanner", write: "scanner" },
  EventPhoto: { read: "scanner", write: "treasurer" },
  EventReceipt: { read: "treasurer", write: "treasurer" },
  AcquittalPack: { read: "treasurer", write: "treasurer" },
  // actor_email is stamped from the session; a client cannot forge who did what.
  AuditLog: { read: "admin", write: "scanner", serverOwned: ["actor_email"] },
};

/** Entities the gateway will not touch at any privilege level. */
export const FORBIDDEN = new Set(["AppUser", "AppSession", "User"]);

export function ruleFor(entity: string): EntityRule | null {
  if (FORBIDDEN.has(entity)) return null;
  return RULES[entity] || null;
}

/**
 * Whether an outsider may see this row.
 *
 * This is the security boundary for publicly readable entities, evaluated per
 * row rather than as a query constraint so that it cannot be sidestepped by a
 * cleverly shaped filter.
 *
 * Events keep their cancelled and completed states visible on purpose: someone
 * holding a link to a called-off event should be told it was called off, not
 * shown a bare "not found". Drafts stay hidden — they are not announced yet.
 */
export function isPubliclyVisible(entity: string, row: Record<string, any>): boolean {
  if (entity === "Club") return !row.deleted_at;
  if (entity === "Event") return row.status !== "draft";
  return false;
}

/** Cheap query-level narrowing for anonymous reads. Not the boundary; an
 *  optimisation layered on top of isPubliclyVisible. */
export function publicQuery(entity: string): Record<string, unknown> {
  if (entity === "Club") return { deleted_at: null };
  return {};
}

export function redactForOutsider(entity: string, row: Record<string, unknown>): Record<string, unknown> {
  const rule = RULES[entity];
  if (!rule?.publicRedact) return row;
  const copy = { ...row };
  for (const f of rule.publicRedact) delete copy[f];
  return copy;
}

export function stripServerOwned(entity: string, data: Record<string, unknown>): Record<string, unknown> {
  const rule = RULES[entity];
  const copy = { ...data };
  // Never let a client set identity or provenance columns.
  for (const f of ["id", "created_date", "updated_date", "created_by", "created_by_id", "is_sample"]) {
    delete copy[f];
  }
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
