// Transport for connect3's own backend.
//
// Deliberately does NOT use base44.functions.invoke: that attaches a Base44
// session token, and connect3 no longer has one. Sessions are ours, so requests
// carry our own bearer token and nothing here depends on Base44 identity.

import { appParams } from '@/lib/app-params';

const FUNCTIONS_BASE = `/api/apps/${appParams.appId}/functions`;
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
    // Session survives in memory for this tab even if storage is unavailable.
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

async function request(path, { body, formData, auth = true } = {}) {
  const headers = { 'X-App-Id': appParams.appId };
  if (!formData) headers['Content-Type'] = 'application/json';

  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}${path}`, {
      method: 'POST',
      headers,
      body: formData || JSON.stringify(body || {}),
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
    throw new ApiError(
      message || 'Something went wrong.',
      error || 'unknown',
      res.status,
      extra,
    );
  }
  return payload;
}

export const api = {
  /** POST a JSON body to a backend function. */
  call: (name, body, opts) => request(`/${name}`, { body, ...opts }),

  /** Upload a file, returning its public URL. */
  async upload(file, clubId) {
    const fd = new FormData();
    fd.append('file', file);
    if (clubId) fd.append('club_id', clubId);
    const { file_url } = await request('/upload', { formData: fd });
    return { file_url };
  },
};
