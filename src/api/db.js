// Entity access, shaped like the Base44 SDK it replaces.
//
// Every call goes through the `data` backend function, which applies the club
// role policy before touching the database. The entity API itself is sealed at
// the RLS layer, so this is the only path in.
//
// The method signatures mirror base44.entities.* on purpose, which is what let
// the pages move across with a one-line import change.

import { api } from '@/lib/api';

const ENTITIES = [
  'Club',
  'Event',
  'ClubMembership',
  'RSVP',
  'CheckIn',
  'EventPhoto',
  'EventReceipt',
  'AcquittalPack',
  'AuditLog',
];

function entityClient(entity) {
  return {
    async filter(query = {}, sort, limit, skip) {
      const { data } = await api.call('data', { entity, op: 'filter', query, sort, limit, skip });
      return data;
    },
    async list(sort, limit, skip) {
      const { data } = await api.call('data', { entity, op: 'filter', query: {}, sort, limit, skip });
      return data;
    },
    async get(id) {
      const { data } = await api.call('data', { entity, op: 'get', id });
      return data;
    },
    async create(payload) {
      const { data } = await api.call('data', { entity, op: 'create', data: payload });
      return data;
    },
    async update(id, payload) {
      const { data } = await api.call('data', { entity, op: 'update', id, data: payload });
      return data;
    },
    async delete(id) {
      const { data } = await api.call('data', { entity, op: 'delete', id });
      return data;
    },
  };
}

export const db = Object.fromEntries(ENTITIES.map((e) => [e, entityClient(e)]));

/** Submit a public RSVP. Unauthenticated by design — attendees are not users. */
export function submitRsvp(payload) {
  return api.call('rsvp-submit', payload, { auth: false });
}

/** Record attendance. Accepts an rsvp_token, an rsvp_id, or walk-in details. */
export function recordCheckIn(payload) {
  return api.call('check-in', payload);
}

export { api };
