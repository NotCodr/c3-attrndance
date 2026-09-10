// Transport for the connect3 API.
//
// Talks to our own backend on Supabase Edge Functions. Sessions are ours, so
// requests carry our bearer token; nothing here depends on Supabase Auth, and
// the anon key is sent only because the Functions gateway expects it for
// routing. That key is public by design and grants nothing on its own: every
// table is deny-by-default and the API holds the only key that reads them.

// Production defaults, used whenever the build environment does not supply
// its own. Both values are public by design: the API is a public endpoint, and
// the publishable key ships inside every client bundle regardless. Neither
// grants access to anything, because every table is deny-by-default.
//
// Without these, a build made before the Vercel variables were set produced an
// app with an empty API base URL. Every request then went to the site's own
// origin, landed on the SPA fallback instead of the API, and surfaced as a
// generic "Something went wrong" with nothing to say why.
const PRODUCTION_API_URL = 'https://egwvriiiiyrjusriauhr.supabase.co/functions/v1/api';
const PRODUCTION_ANON_KEY = 'sb_publishable_KGlyAS-7iyzwodCO4-I-dw_VFPkP6VG';

const API_URL = (import.meta.env.VITE_API_URL || PRODUCTION_API_URL).replace(/\/$/, '');
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || PRODUCTION_ANON_KEY;
const TOKEN_KEY = 'c3_session_token';

let cachedToken = null;

export function getToken() {
  if (cachedToken !== null) return cachedToken;
  try {
    cachedToken = localStorage.getItem(TOKEN_KEY);
  } catch {
    cachedToken = null; // private mode, blocked storage
  }
  return cachedToken;
}

export function setToken(token) {
  cachedToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // The session still works in memory for this tab.
  }
}

export function clearToken() {
  setToken(null);
}

/** Error carrying the backend's machine-readable code alongside its message. */
export class ApiError extends Error {
  constructor(message, code, status, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

async function request(path, { body, formData, auth = true, method = 'POST' } = {}) {
  const headers = {};
  if (ANON_KEY) headers.apikey = ANON_KEY;
  if (!formData && body !== undefined) headers['Content-Type'] = 'application/json';

  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData || (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch {
    throw new ApiError('Network error. Check your connection and try again.', 'network', 0);
  }

  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError('The server returned an unexpected response.', 'bad_response', res.status);
  }

  if (!res.ok) {
    const { error, message, ...extra } = payload;
    throw new ApiError(message || 'Something went wrong.', error || 'unknown', res.status, extra);
  }
  return payload;
}

export const api = {
  /** POST a JSON body to an API route. */
  call: (path, body, opts) => request(`/${path}`, { body: body || {}, ...opts }),

  /** GET an API route. */
  get: (path, opts) => request(`/${path}`, { method: 'GET', ...opts }),

  /** Upload a file, returning its public URL. */
  async upload(file, clubId) {
    const fd = new FormData();
    fd.append('file', file);
    if (clubId) fd.append('club_id', clubId);
    const { file_url } = await request('/upload', { formData: fd });
    return { file_url };
  },
};
