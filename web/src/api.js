// Backend data layer. Every call goes through the same-origin `/api` proxy
// (see src/apiBase.js + vite.config.js): in dev the Vite server attaches the
// Cloudflare Access service token and forwards to the gated Worker
// (api.robogeosociety.xyz); the browser never holds a credential.
import { apiBase } from './apiBase';

async function getJSON(path) {
  const res = await fetch(`${apiBase()}${path}`);
  if (!res.ok) {
    throw new Error(`${path} → HTTP ${res.status}`);
  }
  return res.json();
}

// Fleet health: one row per inventory site (156), already carrying lat/lng so the
// map can render straight from this. Shape:
//   { guid, name, agency, lat, lng, collect, state, lastCollectedDate, ageDays, dueMs, fails }
// state ∈ "healthy" | "overdue" | "quarantined" | "disabled".
export function getCollectors() {
  return getJSON('/collectors');
}

// Availability for a single night across every collected campground. Cached per
// date — switching the date picker back and forth is then instant.
//   [{ guid, name, agency, lat, lng, available, reserved, total, collected_date }]
const availabilityCache = new Map();
export function getAvailability(date) {
  if (availabilityCache.has(date)) return availabilityCache.get(date);
  const p = getJSON(`/availability?date=${date}`).catch((err) => {
    availabilityCache.delete(date); // don't cache failures
    throw err;
  });
  availabilityCache.set(date, p);
  return p;
}

// Per-site rows for one campground on a date:
//   { sites: [{ siteId, label, loop, type, use, status }] }
// status ∈ "available" | "reserved" | "other".
export function getCampgroundSites(guid, date) {
  return getJSON(`/availability/${guid}?date=${date}`);
}

// One site's calendar across the captured window: { by_date: { 'YYYY-MM-DD': status } }.
export function getSiteCalendar(guid, siteId) {
  return getJSON(`/availability/${guid}/site/${siteId}`);
}

// The dead-letter queue: quarantined collectors, keyed by provider id. Richer than
// the `quarantined` rows in /collectors (carries failures + lastError + sinceISO),
// so the fleet panel's quarantine list reads from here.
//   { count, sites: [{ id, name, agency, kind, since, sinceISO, failures, lastError }] }
export function getDlq() {
  return getJSON('/collect/dlq');
}

// Reactivate a quarantined collector (mutation — leaves the read path). Keys on the
// provider id from the DLQ entry (?id=...), per POST /collect/reactivate.
export async function reactivate(id) {
  const res = await fetch(`${apiBase()}/collect/reactivate?id=${encodeURIComponent(id)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`reactivate ${id} → HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}
