// Password hashing, token minting and constant-time comparison.
//
// Everything here uses the Web Crypto API, which the Deno function runtime
// exposes directly. There is no npm crypto dependency to keep in sync, and
// SubtleCrypto is async-only in this runtime.

const enc = new TextEncoder();

/**
 * OWASP's floor for PBKDF2-HMAC-SHA256 as of 2023. Recorded inside each hash so
 * the cost can be raised later without invalidating existing passwords.
 */
export const PBKDF2_ITERATIONS = 210000;

const SALT_BYTES = 16;
const KEY_BITS = 256;

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Produces "pbkdf2$sha256$<iterations>$<saltB64>$<hashB64>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return ["pbkdf2", "sha256", String(PBKDF2_ITERATIONS), toB64(salt), toB64(hash)].join("$");
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash, so a corrupt record
 * fails closed instead of 500-ing and thereby revealing that the account exists.
 */
export async function verifyPassword(password: string, stored?: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 5000000) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromB64(parts[3]);
    expected = fromB64(parts[4]);
  } catch {
    return false;
  }
  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/**
 * A deliberate no-op hash, run when the email is unknown.
 *
 * Without it, "no such user" returns far faster than "wrong password", which
 * turns the login endpoint into an account-enumeration oracle.
 */
export async function dummyVerify(): Promise<void> {
  await pbkdf2("dummy-password-for-constant-time", new Uint8Array(SALT_BYTES), PBKDF2_ITERATIONS);
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  return timingSafeEqual(enc.encode(a), enc.encode(b));
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** URL-safe opaque token. 32 bytes = 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return toB64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A uniformly distributed numeric code.
 *
 * Rejection sampling keeps the digits unbiased; taking a raw byte modulo 10
 * would over-represent 0 through 5.
 */
export function randomNumericCode(digits = 6): string {
  const limit = 256 - (256 % 10);
  let out = "";
  while (out.length < digits) {
    for (const b of crypto.getRandomValues(new Uint8Array(digits))) {
      if (out.length >= digits) break;
      if (b < limit) out += String(b % 10);
    }
  }
  return out;
}
