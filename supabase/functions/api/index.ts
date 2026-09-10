// connect3 API.
//
// One edge function with a router, rather than a function per endpoint: Supabase
// deploys each function separately and each pays its own cold start, so a single
// entry point keeps deploys atomic and the shared modules loaded once.
//
// verify_jwt is disabled for this function in config.toml. That is deliberate:
// connect3 issues its own sessions, so Supabase's JWT gate would reject every
// legitimate caller. Authentication happens in resolveActor(), authorisation in
// policy.ts, and both run before anything touches the database.

import { Hono } from "jsr:@hono/hono@4";
import { cors } from "jsr:@hono/hono@4/cors";
import { authRoutes } from "./routes/auth.ts";
import { dataRoutes } from "./routes/data.ts";
import { publicRoutes } from "./routes/public.ts";
import { uploadRoutes } from "./routes/upload.ts";

const app = new Hono().basePath("/api");

// Browsers send the session as an Authorization header from whatever origin the
// site is served on. Restrict that to origins we actually publish; a wildcard
// here would let any page on the internet drive a signed-in user's session.
/**
 * Reduces an origin to the exact form a browser sends: scheme, host, no path,
 * no trailing slash, lowercase.
 *
 * Comparison used to be an exact string match, which meant an entry typed as
 * "https://connect3.dev/" or plain "connect3.dev" silently matched nothing and
 * blocked the whole site, with no error anywhere to say why. Normalising both
 * sides makes those equivalent to what was meant.
 */
function normaliseOrigin(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
    return new URL(withScheme).origin.toLowerCase();
  } catch {
    return null;
  }
}

const allowed = new Set(
  [
    ...(Deno.env.get("ALLOWED_ORIGINS") || "").split(","),
    // The site the emails link to is by definition a site that has to be able
    // to call the API, so it never needs listing twice.
    Deno.env.get("APP_ORIGIN") || "",
  ]
    .map(normaliseOrigin)
    .filter((o): o is string => !!o),
);

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return undefined;              // same-origin / curl
      const o = normaliseOrigin(origin);
      if (o && allowed.has(o)) return origin;
      // Any localhost port, for development.
      if (/^http:\/\/localhost:\d+$/.test(origin)) return origin;
      return undefined;
    },
    allowHeaders: ["Content-Type", "Authorization", "apikey"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400,
    credentials: false,
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "connect3-api" }));

app.route("/auth", authRoutes);
app.route("/", dataRoutes);
app.route("/", publicRoutes);
app.route("/", uploadRoutes);

app.notFound((c) => c.json({ error: "not_found", message: "No such endpoint." }, 404));

app.onError((err, c) => {
  // Never leak internals across the trust boundary; the detail goes to logs.
  console.error("[api] unhandled:", err);
  return c.json({ error: "server_error", message: "Something went wrong." }, 500);
});

Deno.serve(app.fetch);
