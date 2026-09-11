// Address suggestions for the event form.
//
// Photon is a free OpenStreetMap search built for search-as-you-type (unlike
// Nominatim, whose policy forbids autocomplete). Results lean towards the
// Parkville campus and stay inside Australia. Only the text typed into the
// venue or address field is sent: no names, no accounts.

const ENDPOINT = 'https://photon.komoot.io/api/';
const CAMPUS = { lat: -37.7983, lon: 144.961 };
const AUSTRALIA = '112.9,-43.7,153.7,-10.6';
const STATES = {
  Victoria: 'VIC',
  'New South Wales': 'NSW',
  Queensland: 'QLD',
  'South Australia': 'SA',
  'Western Australia': 'WA',
  Tasmania: 'TAS',
  'Australian Capital Territory': 'ACT',
  'Northern Territory': 'NT',
};
// Suburbs and cities are too vague to meet someone at.
const PRECISE = new Set(['house', 'street', 'other']);

const cache = new Map();

/** A Photon feature as a venue name and a one-line Australian address. */
export function describePlace(p) {
  const region = [p.district || p.locality || p.city, STATES[p.state] || p.state, p.postcode].filter(Boolean).join(' ');
  const isStreet = p.osm_key === 'highway' || p.type === 'street';
  const street = isStreet ? p.name : [p.housenumber, p.street].filter(Boolean).join(' ');
  const address = [street, region].filter(Boolean).join(', ');
  let name = isStreet ? '' : p.name || '';
  if (name && address.toLowerCase().includes(name.toLowerCase())) name = '';
  return { name, address };
}

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Up to five places matching `query`. Never throws; an empty list means "nothing useful". */
export async function searchPlaces(query, { signal } = {}) {
  const q = (query || '').trim();
  if (q.length < 3) return [];
  const key = q.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({
    q,
    lat: String(CAMPUS.lat),
    lon: String(CAMPUS.lon),
    zoom: '14',
    location_bias_scale: '0.2',
    limit: '8',
    lang: 'en',
    bbox: AUSTRALIA,
  });
  let json;
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { signal });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }

  const seen = new Set();
  const out = [];
  for (const f of json.features || []) {
    const p = f.properties || {};
    if (!PRECISE.has(p.type)) continue;
    const place = describePlace(p);
    const [lon, lat] = f.geometry?.coordinates || [];
    place.km = lat == null ? Infinity : distanceKm(CAMPUS, { lat, lon });
    const id = `${place.name}|${place.address}`.toLowerCase();
    if (!place.address || seen.has(id)) continue;
    seen.add(id);
    out.push(place);
    if (out.length === 5) break;
  }
  cache.set(key, out);
  return out;
}

/**
 * The address to offer for a venue name, or null.
 *
 * Offered unprompted, so it has to be right: the place must be named like the
 * venue and sit near campus. "Union House" otherwise finds a bar in Richmond.
 * Room details after a comma are ignored ("Arts West, Room 353").
 */
export async function suggestAddress(venue, { signal } = {}) {
  const core = (venue || '').split(/,| - /)[0].trim();
  if (core.length < 4) return null;
  const words = core.toLowerCase().split(/\s+/);
  const places = await searchPlaces(core, { signal });
  return places.find((p) => p.km <= 3.5 && words.every((w) => p.name.toLowerCase().includes(w))) || null;
}
