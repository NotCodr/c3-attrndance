// Postgres access for the connect3 API.
//
// Connects with the service role key, which bypasses row-level security. That is
// deliberate and is why every table is deny-by-default: RLS cannot express our
// permission model, because connect3 issues its own identities rather than using
// Supabase Auth, so `auth.uid()` is always null here. Authorisation is decided in
// policy.ts before any of these helpers are called.
//
// Nothing in this file may be reached from the browser.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Postgres unique-violation. Lets callers turn a race into a clean 409. */
export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

/** Throws on error, so route handlers can stay linear. */
export function must<T>(result: { data: T; error: unknown }): T {
  if (result.error) {
    const e = result.error as { message?: string; code?: string };
    throw Object.assign(new Error(e.message || "database error"), { code: e.code });
  }
  return result.data;
}

/** Single row or null, without treating "no rows" as an error. */
export async function one<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    const e = error as { message?: string; code?: string };
    throw Object.assign(new Error(e.message || "database error"), { code: e.code });
  }
  return data && data.length ? data[0] : null;
}
