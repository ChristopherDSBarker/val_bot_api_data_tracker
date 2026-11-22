const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compareRoundWindows } = require('../src/services/progress');
const { normalizeActAccolades } = require('../src/services/valorantCareer');

test('round comparison uses disjoint same-act blocks with matching map, agent and side', () => {
  const matches = Array.from({ length: 10 }, (_, i) => ({
    matchId: String(i), seasonId: 'act', startedAt: new Date(Date.UTC(2026, 10, i + 1)).toISOString(),
    map: 'Haven', agent: 'Jett',
    roundResults: [{ side: 'attack', won: i >= 5 }, { side: 'attack', won: i >= 5 }],
  }));
  const [result] = compareRoundWindows([...matches, matches[0]]);
  assert.deepEqual([result.prior.won, result.prior.total, result.recent.won, result.recent.total], [0, 10, 10, 10]);
  assert.deepEqual(compareRoundWindows([{ ...matches[0], seasonId: 'old' }, ...matches.slice(1)]), []);
  assert.deepEqual(compareRoundWindows(matches.map((m, i) => i < 5 ? { ...m, agent: 'Sage' } : m)), []);
});

test('act accolades select the matching act ID and preserve reported zero', () => {
  const payload = { summary: { seasons: [
    { season: { id: 'other' }, accolades: [{ type: 'aces', count: 20 }] },
    { season: { id: 'act', short: 'v26a6' }, accolades: [{ type: 'aces', count: 0 }] },
  ] } };
  assert.deepEqual(normalizeActAccolades(payload, { seasonId: 'act' }),
    { label: 'v26a6', entries: [{ label: 'aces', count: 0 }] });
  assert.equal(normalizeActAccolades(payload, { seasonId: 'missing' }), null);
});

test('role and side fallback compares different agents in the same role using known opener counts', () => {
  const matches = Array.from({ length: 10 }, (_, i) => ({
    matchId: String(i), seasonId: 'act', startedAt: new Date(Date.UTC(2026, 10, i + 1)).toISOString(),
    map: i < 5 ? 'Haven' : 'Sunset', agent: i < 5 ? 'Jett' : 'Hush', role: 'Duelist',
    roundResults: [
      { side: 'attack', won: true, playerGotFirstKill: i >= 5 },
      { side: 'attack', won: i >= 5, playerGotFirstKill: i >= 5 ? false : null },
    ],
  }));
  assert.deepEqual(compareRoundWindows(matches), []);
  const [row] = compareRoundWindows(matches, { byRole: true });
  assert.equal(row.recent.role, 'Duelist');
  assert.deepEqual([row.prior.knownOpeners, row.recent.knownOpeners, row.recent.firstKills], [5, 10, 5]);
});
