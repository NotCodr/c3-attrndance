# connect3

Events, attendance and grant acquittals for university clubs. Built for
University of Melbourne clubs and the UMSU grant process first.

A committee creates an event, shares a public RSVP link, scans attendees in at
the door, then generates the acquittal pack (attendance record, photos,
itemised receipts and a pre-filled Application for Payment) that the student
union wants before it releases grant money.

## Stack

| Layer | What |
|---|---|
| Frontend | Vite + React 18, React Router, Tailwind, shadcn/ui |
| API | One Supabase Edge Function (Deno + Hono) at `supabase/functions/api` |
| Database | Supabase Postgres |
| Storage | Supabase Storage (`uploads` bucket) |
| Email | Resend |

There is no vendor SDK in the frontend. The browser talks to one API over
`fetch`, and that API is ordinary Web-standard request handlers, so it can be
lifted onto any Deno or Node host later.

## How access control works

Every table has row-level security **enabled with no permissive policy**, which
in Postgres means deny-by-default. The API connects with the service role key,
which bypasses RLS, and decides permissions itself in
`supabase/functions/_shared/policy.ts`.

```
browser ──► /api/data ──► policy.ts ──► Postgres (service role)
                          club role checks
```

Postgres RLS cannot express this model directly, because connect3 issues its own
identities rather than using Supabase Auth, so `auth.uid()` is always null. The
policy layer is therefore the whole permission model — and it is unit tested.

`src/lib/clubs.js` has a mirror of the role ladder. It only decides which buttons
to draw; a client can lie about it freely, so nothing is ever authorised from it.

Three writes sit outside the generic gateway because they need their own rules:

| Route | Why |
|---|---|
| `POST /api/rsvp-submit` | Public and unauthenticated. Enforces capacity and the UMSU-required fields server-side. |
| `POST /api/check-in` | Duplicate detection must be shared between two scanners on two phones. |
| `POST /api/upload` | Storage needs a privileged caller, and size/type limits enforced only in a browser are not limits. |

### Roles

`scanner` < `treasurer` < `admin` < `owner`, checked per club, never globally.

## Authentication

connect3 owns its identity: `app_users` and `app_sessions`, not Supabase Auth.
PBKDF2-SHA256 at 210k iterations, opaque session tokens stored only as SHA-256
hashes, login lockout, timing-safe comparison, and a dummy hash on unknown
emails so login cannot be used to enumerate registered club addresses.

Sign-up, sign-in, email verification and password reset all happen in-app.

## Setting up

### 1. Create the Supabase project

Create a project at supabase.com, then from **Project Settings -> API** note the
project URL, the `anon` key and the `service_role` key.

### 2. Apply the schema

Paste each file into the SQL editor, in order:

```
supabase/migrations/0001_init.sql     tables, constraints, RLS lockdown
supabase/migrations/0002_storage.sql  uploads bucket
```

Or, with the Supabase CLI: `supabase db push`.

### 3. Bring your data across (optional)

Only needed if you have live Base44 data to keep.

```bash
BASE44_APP_ID=<app id> BASE44_API_KEY=<key> node scripts/export-from-base44.mjs
```

That writes `supabase/seed-from-base44.sql`. Review it, then run it in the SQL
editor after the migrations. It preserves ids so foreign keys survive, and is
safe to re-run.

### 4. Set the function secrets

**Project Settings -> Edge Functions -> Secrets:**

| Secret | Required | Purpose |
|---|---|---|
| `RESEND_API_KEY` | **Yes** | Verification and password-reset email. Without it, nobody can complete a signup. |
| `MAIL_FROM` | Recommended | Sender, e.g. `connect3 <hello@yourdomain>`. Defaults to Resend's shared onboarding sender. |
| `APP_ORIGIN` | Recommended | Absolute origin used to build password-reset links. Falls back to the request origin. |
| `ALLOWED_ORIGINS` | **Yes in production** | Comma-separated origins allowed to call the API, e.g. `https://connect3.app`. localhost is always allowed. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 5. Deploy the API

```bash
supabase functions deploy api --no-verify-jwt
```

`--no-verify-jwt` is required. connect3 authenticates callers itself, so
Supabase's JWT gate would reject every legitimate request, and the public
endpoints (login, register, rsvp-submit) would stop working entirely.

### 6. Point the frontend at it

Copy `.env.example` to `.env.local`:

```
VITE_API_URL=https://<project-ref>.supabase.co/functions/v1/api
VITE_SUPABASE_ANON_KEY=<anon key>
```

```bash
npm install
npm run dev
```

The anon key is public by design. Every table is deny-by-default, so it reads
nothing on its own; the Functions gateway just wants it for routing.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :5173 |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | ESLint (clean) |
| `npm run typecheck` | `tsc --checkJs` over untyped JSX. Pre-existing failures from undeclared optional props; not a regression gate. |

## Deploying the frontend

Any static host — Vercel, Netlify, Cloudflare Pages. Build command `npm run
build`, output `dist`. Set `VITE_API_URL` and `VITE_SUPABASE_ANON_KEY` in the
host's environment, and add the site's origin to `ALLOWED_ORIGINS` on the API.
