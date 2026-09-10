// Request/response helpers shared by every connect3 backend function.

export const JSON_HEADERS = { "Content-Type": "application/json" };

export function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

/**
 * An error response.
 *
 * `code` is a stable machine-readable string the frontend switches on; `message`
 * is shown to the user. Never put internal detail in either — these cross the
 * trust boundary.
 */
export function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ error: code, message, ...extra }), { status, headers: JSON_HEADERS });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function normaliseEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// Deliberately permissive: the verification email is the real proof of ownership,
// so this only needs to reject obvious nonsense rather than adjudicate RFC 5322.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

/**
 * Length is the requirement; composition rules are not enforced.
 *
 * NIST SP 800-63B advises against mandatory character-class mixing, which pushes
 * people toward predictable substitutions rather than genuinely stronger secrets.
 */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length === 0) return "Password is required.";
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Password must be ${PASSWORD_MAX} characters or fewer.`;
  return null;
}

/** Trims and hard-caps a free-text field so a client cannot store unbounded data. */
export function clampText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t ? t.slice(0, max) : undefined;
}
