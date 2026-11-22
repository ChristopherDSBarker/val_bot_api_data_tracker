const { test } = require('node:test');
const assert = require('node:assert/strict');
const client = require('../src/services/henrikClient');
const api = require('../src/services/valorantApi');

test('v4 profile, v2 history and legacy fallback preserve profile contracts', async () => {
  const original = client.get;
  const env = { ...process.env };
  process.env.HENRIK_API_KEY = 'test-only';
  process.env.USE_MOCK_DATA = 'false';
  process.env.ENABLE_EXPERIMENTAL_VALORANT_PIPELINE = 'true';
  let failModern = false;
  const calls = [];
  client.get = async (url) => {
    calls.push(url);
    if (failModern && /v4\/matches|v2\/mmr-history/.test(url)) {
      const error = new Error('unsupported'); error.response = { status: 404 }; throw error;
    }
    if (url.includes('/account/')) return { data: { data: { name: failModern ? 'Legacy' : 'Test Name', tag: 'NA1', puuid: 'id', account_level: 10 } } };
    if (url.includes('/v2/mmr-history/')) return { data: { data: { history: [{ tier: { name: 'Gold 1', tier: 9 }, rr: 0, last_change: 0 }] } } };
    if (url.includes('/v1/mmr-history/')) return { data: { data: [{ currenttierpatched: 'Silver 1', currenttier: 6, mmr_change_to_last_game: -10 }] } };
    if (url.includes('/v3/mmr/')) return { data: { data: { current: { tier: { name: 'Gold 1' }, rr: 0 }, peak: null } } };
    const player = { name: failModern ? 'Legacy' : 'Test Name', tag: 'NA1', puuid: 'id', team_id: 'Red', agent: { name: 'Hush' },
      stats: { kills: 20, deaths: 10, assists: 5, score: 4000, damage: { dealt: 3000, received: 2800 } }, performance: { score: null } };
    return { data: { data: [{ metadata: { map: { name: 'Bind' }, rounds_played: 20 }, players: [player],
      teams: [{ team_id: 'Red', won: true, rounds: { won: 13, lost: 7 } }, { team_id: 'Blue', won: false, rounds: { won: 7, lost: 13 } }] }] } };
  };
  try {
    const profile = await api.getPlayerProfile('Test Name', 'NA1', 'na');
    assert.equal(profile.currentRank, 'Gold 1');
    assert.equal(profile.peakRank, 'N/A');
    assert.deepEqual(profile.topAgents, ['Hush']);
    const recent = await api.getRecentMatches('Test Name', 'NA1', 'na');
    assert.equal(recent[0].performanceScore, null);
    assert.equal(recent[0].roundsWon, 13);
    assert.equal(recent[0].adrPerRound, 150);
    assert.equal(recent[0].damageReceived, 2800);
    assert.ok(calls.some((url) => url.includes('Test%20Name')));
    assert.equal((await api.getPlayerAccount('Test Name', 'NA1', 'na')).account_level, 10);
    assert.equal((await api.getPlayerMMR('Test Name', 'NA1', 'na')).currentRR, 0);
    failModern = true;
    assert.equal((await api.getPlayerProfile('Legacy', 'NA1', 'na')).currentRank, 'Silver 1');
    assert.ok(calls.some((url) => url.includes('/v3/matches/')));
    process.env.USE_MOCK_DATA = 'true';
    const before = calls.length;
    assert.equal(await api.getExperimentalValorantEnhancements({ name: 'Mock', tag: 'NA1', region: 'na' }), null);
    assert.equal(calls.length, before);
  } finally {
    client.get = original;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});
