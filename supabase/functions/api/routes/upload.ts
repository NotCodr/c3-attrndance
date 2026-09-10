// File uploads: club logos, event covers, acquittal photos and receipts.
//
// Routed through the API rather than letting the browser talk to Storage
// directly, so membership, size and MIME type are all checked somewhere a client
// cannot edit. Limits enforced only in the browser are not limits.

import { Hono } from "jsr:@hono/hono@4";
import { db } from "../../_shared/db.ts";
import { hasAtLeastRole, resolveActor, roleInClub } from "../../_shared/session.ts";

export const uploadRoutes = new Hono();

const BUCKET = "uploads";
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

uploadRoutes.post("/upload", async (c) => {
  const actor = await resolveActor(c.req.raw);
  if (!actor) return c.json({ error: "unauthenticated", message: "Sign in to continue." }, 401);

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "invalid_body", message: "Expected a multipart upload." }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "no_file", message: "No file was provided." }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: "too_large", message: "Files must be 10 MB or smaller." }, 413);

  const ext = ALLOWED[file.type];
  if (!ext) return c.json({ error: "unsupported_type", message: "Upload a JPEG, PNG, WebP, HEIC or PDF." }, 415);

  // A club id is optional, because the onboarding logo upload happens before the
  // club exists. When one is given, membership is required so this cannot be
  // used as open file hosting by anyone holding a session.
  const clubId = form.get("club_id");
  if (typeof clubId === "string" && clubId) {
    if (!hasAtLeastRole(roleInClub(actor, clubId), "treasurer")) {
      return c.json({ error: "forbidden", message: "You do not have permission to upload to this club." }, 403);
    }
  }

  // Random path: object names are never guessable from a club or event id.
  const path = [
    typeof clubId === "string" && clubId ? clubId : "unscoped",
    `${crypto.randomUUID()}.${ext}`,
  ].join("/");

  const { error } = await db().storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) {
    console.error("[upload] storage rejected:", error.message);
    return c.json({ error: "upload_failed", message: "Could not store that file." }, 502);
  }

  const { data } = db().storage.from(BUCKET).getPublicUrl(path);
  return c.json({ file_url: data.publicUrl });
});
