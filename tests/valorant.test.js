const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { normalizeCareer, summarizeMaps } = require('../src/services/valorantCareer');
const { createProfileEmbed } = require('../src/utils/embeds');

test('unknown accolades survive and omitted mastery levels stay unavailable', () => {
  const career = normalizeCareer({ summary: { all_time: [{ id: 'new_kind', type: null, count: 2 }] } },
    { agents: [{ agent: { name: 'Hush' }, flourish: { long_level: null } }] });
  assert.equal(career.accolades[0].label, 'new_kind');
  assert.deepEqual(career.mastery, []);
  assert.deepEqual(normalizeCareer(null, null), { accolades: [], mastery: [] });
});

test('unknown outcomes and absent performance are excluded from denominators', () => {
  const rows = summarizeMaps([
    { map: 'Bind', isWin: true, performanceScore: 0 },
    { map: 'Bind', isWin: null, performanceScore: null },
    { map: 'Bind', isWin: false, performanceScore: 100 },
  ]);
  assert.equal(rows[0].winRate, 50);
  assert.equal(rows[0].performanceScore, 50);
  assert.equal(rows[0].performanceSamples, 2);
  assert.equal(rows[0].games, 3);
});

test('profile preserves existing fields, respects embed limits, and labels map sample', () => {
  const data = { riotId: 'Test#NA1', currentRank: 'Gold 1', currentRR: 0,
    mapSummary: summarizeMaps(Array.from({ length: 5 }, () => ({ map: 'Bind', isWin: true }))),
    career: normalizeCareer({ summary: { all_time: [{ id: 'new', count: 1 }] } }, null),
    lifetimePrestige: { gold: { count: 0 } } };
  const embed = createProfileEmbed(data).toJSON();
  assert.match(embed.description, /0 RR/);
  assert.doesNotMatch(embed.description, /\+0 RR last match/);
  assert.ok(embed.fields.some((f) => f.name === 'Combat'));
  assert.ok(embed.fields.some((f) => f.value.includes('not Riot Map Rating')));
  assert.ok(embed.fields.some((f) => f.value.includes('minimum 5')));
  assert.ok(embed.fields.length <= 25);
  assert.ok(embed.fields.every((f) => f.value.length <= 1024));
});

test('client deduplicates requests and stops requests during Retry-After', async () => {
  const original = axios.get;
  let calls = 0;
  axios.get = async () => { calls++; return { data: { data: { ok: true } } }; };
  try {
    const client = require('../src/services/henrikClient');
    await Promise.all([client.get('dedupe'), client.get('dedupe')]);
    await client.get('dedupe');
    assert.equal(calls, 1);
    axios.get = async () => { calls++; const error = new Error('limited');
      error.response = { status: 429, headers: { 'retry-after': '60' } }; throw error; };
    await assert.rejects(client.get('limited'));
    await assert.rejects(client.get('another'), /cooldown/);
    assert.equal(calls, 2);
  } finally { axios.get = original; }
});
