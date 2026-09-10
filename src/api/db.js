// Entity access.
//
// Every call goes through POST /api/data, which applies the club role policy
// before touching Postgres. Every table is deny-by-default under RLS and the API
// holds the only key, so this is the only path in.
//
// The method names deliberately match what the pages already called, which is
// how the whole app moved backends with a one-line import change per file.

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

/** Submit a public RSVP. Unauthenticated by design: attendees are not users. */
export function submitRsvp(payload) {
  return api.call('rsvp-submit', payload, { auth: false });
}

/** Record attendance. Accepts an rsvp_token, an rsvp_id, or walk-in details. */
export function recordCheckIn(payload) {
  return api.call('check-in', payload);
}

export { api };
