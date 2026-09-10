# connect3

Events, attendance and grant acquittals for university clubs. Built for
University of Melbourne clubs and the UMSU grant process first.

A committee creates an event, shares a public RSVP link, scans attendees in at
the door, then generates the acquittal pack (attendance record, photos,
itemised receipts and a pre-filled Application for Payment) that the student
union requires before releasing grant money.

## Architecture

Vite + React on the front end. Base44 provides the database, the serverless
function runtime and file storage.

**Authentication is connect3's own** — it does not use Base44 auth. Accounts,
passwords, email verification and sessions all live in `base44/functions/auth/*`
and the `AppUser` / `AppSession` entities. Nobody is ever redirected to a
Base44-hosted login page.

### The data path

Every entity is sealed. `base44/entities/*.jsonc` grant read and write to the
`admin` role only, which means **no client can reach the database directly**.
All access goes through one function:

```
browser ──► /functions/data ──► shared/policy.ts ──► entities (service role)
                                (club role checks)
```

`base44/shared/policy.ts` is the permission model: which club role can read and
write each entity. `src/lib/clubs.js` has a mirror of the role ladder, but it
only decides which buttons to draw — it is advisory and a client can lie about
it freely.

Three writes bypass the generic gateway because they need rules of their own:

| Function | Why it exists |
|---|---|
| `rsvp-submit` | Public, unauthenticated. Enforces capacity and the UMSU-required fields server-side. |
| `check-in` | Duplicate detection has to be shared between two scanners on two phones. |
| `upload` | Base44 storage needs a privileged caller; also enforces size and type limits. |

### Roles

`scanner` < `treasurer` < `admin` < `owner`. Checked per club, not globally.

## Local development

```bash
npm install
```

Create `.env.local`:

```
VITE_BASE44_APP_ID=6a083c7537b39dfd4b4eb9a0
VITE_BASE44_APP_BASE_URL=https://connect3.base44.app
```

The Vite plugin proxies `/api` to that URL, and the app is built to call
same-origin, so both variables are required or every request 404s.

```bash
npm run dev
```

Note that the front end talks to whichever backend `VITE_BASE44_APP_BASE_URL`
points at, so local development runs against **live data** unless you point it
at a separate Base44 app.

## Deploying

Entities and functions are deployed with the Base44 CLI:

```bash
npx base44 login
npx base44 entities push
npx base44 functions deploy
```

`entities push` is what applies the RLS rules. Until it runs, the database is
still world-readable.

**The entity files must stay in sync with the deployed schema.** `entities push`
overwrites the remote schema with the local copy and deletes anything not
present locally, so a stale file silently drops real fields. The files in
`base44/entities/` were regenerated from the live schema; if they drift again,
re-pull before pushing:

```bash
curl -s "https://connect3.base44.app/api/apps/$VITE_BASE44_APP_ID/entity-schemas"   -H "api_key: $BASE44_APP_API_KEY"
```

Comparing local files against *records* is not a sufficient check — records keep
whatever keys they were written with and can lag a schema rename. Compare
against `entity-schemas`.

### Required secrets

Set these in app settings → environment variables (or `npx base44 secrets set`):

| Secret | Required | Purpose |
|---|---|---|
| `RESEND_API_KEY` | Strongly recommended | Sends verification and password-reset email. Base44's built-in `SendEmail` only reliably reaches *registered Base44 users*, and a new connect3 signup is not one — without this, verification email may not arrive. |
| `MAIL_FROM` | With Resend | Sender address, e.g. `connect3 <hello@yourdomain>`. Defaults to Resend's shared onboarding sender. |
| `APP_ORIGIN` | Recommended | Absolute origin used to build password-reset links. Falls back to the request origin. |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :5173 |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | ESLint (clean) |
| `npm run typecheck` | `tsc --checkJs` over untyped JSX. **Pre-existing failures** (~61) from undeclared optional props; not a regression gate. |
