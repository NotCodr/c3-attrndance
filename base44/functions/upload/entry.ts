import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { resolveActor, roleInClub, hasAtLeastRole } from "../../shared/session.ts";
import { fail, ok } from "../../shared/http.ts";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

/**
 * Uploads a logo, cover image, event photo or receipt.
 *
 * Routed through the backend because the Base44 storage integration expects a
 * privileged caller, and because size and type limits enforced only in the
 * browser are not limits at all.
 */
export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const svc = createClientFromRequest(req).asServiceRole;
  const actor = await resolveActor(svc, req);
  if (!actor) return fail(401, "unauthenticated", "Sign in to continue.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "invalid_body", "Expected a multipart upload.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "no_file", "No file was provided.");
  if (file.size > MAX_BYTES) return fail(413, "too_large", "Files must be 10 MB or smaller.");
  if (file.type && !ALLOWED.has(file.type)) {
    return fail(415, "unsupported_type", "Upload a JPEG, PNG, WebP, HEIC or PDF.");
  }

  // A club id is optional (the onboarding logo upload happens before the club
  // exists) but when given, membership is required so the endpoint can't be used
  // as open file hosting by anyone with a session.
  const clubId = form.get("club_id");
  if (typeof clubId === "string" && clubId) {
    if (!hasAtLeastRole(roleInClub(actor, clubId), "treasurer")) {
      return fail(403, "forbidden", "You don't have permission to upload to this club.");
    }
  }

  const { file_url } = await svc.integrations.Core.UploadFile({ file });
  return ok({ file_url });
}
