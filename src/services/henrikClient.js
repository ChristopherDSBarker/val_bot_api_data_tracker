const axios = require('axios');

// Share identical requests across profile surfaces without caching credentials on disk.
const responses = new Map();
const pending = new Map();
let blockedUntil = 0;
let lastStatus = null;

async function get(url, options = {}) {
  const key = JSON.stringify([options.headers?.Authorization, url]);
  const cached = responses.get(key);
  if (cached && cached.expires > Date.now()) return cached.response;
  if (pending.has(key)) return pending.get(key);
  if (Date.now() < blockedUntil) {
    const error = new Error('HenrikDev rate limit cooldown');
    error.response = { status: 429 };
    throw error;
  }
  const request = axios.get(url, options).then((response) => {
    lastStatus = response.status ?? 200;
    // Cache successful data envelopes only. Never cache an API error as data.
    if (response.data?.data !== undefined && !response.data?.errors) {
      if (responses.size >= 250) responses.delete(responses.keys().next().value);
      responses.set(key, { response, expires: Date.now() + 60000 });
    }
    return response;
  }).catch((error) => {
    lastStatus = error.response?.status ?? 'Network error';
    if (error.response?.status === 429) {
      const retry = error.response.headers?.['retry-after'];
      const seconds = Number(retry);
      const delay = retry && Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now();
      blockedUntil = Date.now() + (Number.isFinite(delay) ? Math.max(1000, delay) : 60000);
    }
    throw error;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

function status() {
  return { lastStatus, cached: [...responses.values()].filter((row) => row.expires > Date.now()).length };
}

module.exports = { get, status };
