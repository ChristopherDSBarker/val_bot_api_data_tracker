const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../src/services/valorantApi');
const profile = require('../src/commands/valorantProfile');

test('the ranked report shows automatic coaching with only name, tag, and region', async (t) => {
  assert.deepEqual(fs.readdirSync(path.join(__dirname, '../src/commands')).filter((name) => name.endsWith('.js')),
    ['status.js', 'valorantProfile.js']);
  const config = profile.data.toJSON();
  assert.deepEqual(config.options.map(({ name }) => name), ['name', 'tag', 'region']);
  assert.ok(config.options.find((option) => option.name === 'region').choices
    .some(({ name, value }) => name === 'North America' && value === 'na'));

  const match = { map: 'Sunset', agent: 'Jett', role: 'Duelist', isWin: false, roundsWon: 11, roundsLost: 13 };
  t.mock.method(api, 'getPlayerAccount', async () => ({ puuid: 'player', name: 'Test', tag: 'NA1' }));
  t.mock.method(api, 'getPlayerProfile', async () => null);
  t.mock.method(api, 'getPlayerMMR', async () => null);
  t.mock.method(api, 'getMMRHistory', async () => []);
  t.mock.method(api, 'getRecentMatches', async () => [match]);
  t.mock.method(api, 'isExperimentalValorantPipelineEnabled', () => false);
  let message;
  await profile.execute({
    options: { getString: (key) => ({ name: 'Test', tag: 'NA1', region: 'na' })[key] ?? null },
    deferReply: async () => {},
    editReply: async (value) => { message = value; },
  });
  const fields = message.embeds[0].fields;
  assert.match(fields[0].name, /Coach · Latest Match/);
  assert.match(fields[0].value, /Replay cue/);
  assert.ok(fields.some((field) => field.name.includes('Match Log · 1 of 2')));
  assert.ok(fields.some((field) => field.value.includes('Duelist 0/1')));
  assert.equal(message.files, undefined);

});

test('profile includes saved party results by default, and renders if the store fails', async (t) => {
  const { matchStore } = require('../src/services/store');
  const previous = process.env.ENABLE_MATCH_HISTORY;
  const mock = process.env.USE_MOCK_DATA;
  delete process.env.ENABLE_MATCH_HISTORY;
  process.env.USE_MOCK_DATA = 'false';
  t.after(() => {
    if (previous === undefined) delete process.env.ENABLE_MATCH_HISTORY;
    else process.env.ENABLE_MATCH_HISTORY = previous;
    if (mock === undefined) delete process.env.USE_MOCK_DATA;
    else process.env.USE_MOCK_DATA = mock;
  });

  const match = { matchId: 'recent', isWin: true, map: 'Sunset', roundsWon: 13, roundsLost: 8,
    seasonId: 'act', teammates: [{ puuid: 'partner', name: 'Duo', tag: 'NA1', sameParty: true }] };
  t.mock.method(api, 'getPlayerAccount', async () => ({ puuid: 'player', name: 'Test', tag: 'NA1' }));
  t.mock.method(api, 'getPlayerProfile', async () => null);
  t.mock.method(api, 'getPlayerMMR', async () => null);
  t.mock.method(api, 'getMMRHistory', async () => []);
  t.mock.method(api, 'getRecentMatches', async () => [match]);
  t.mock.method(api, 'isExperimentalValorantPipelineEnabled', () => false);
  let fail = false;
  const record = t.mock.method(matchStore, 'recordAndRead', async (guild, player, matches) => {
    assert.deepEqual([guild, player, matches], ['guild', 'player', [match]]);
    if (fail) throw new Error('test store error');
    const { createHash } = require('node:crypto');
    const partner = createHash('sha256').update(JSON.stringify([guild, 'partner'])).digest('hex');
    return Array.from({ length: 15 }, (_, i) => ({
      actId: 'act', startedAt: '2026-11-22T00:00:00Z', won: i < 3 || i >= 11,
      partyKnown: true, party: i < 5 ? [partner] : [],
    }));
  });
  async function run() {
    const fields = [];
    const capture = async (page) => { fields.push(...page.embeds[0].fields); };
    await profile.execute({
      guildId: 'guild',
      options: { getString: (key) => ({ name: 'Test', tag: 'NA1', region: 'na' })[key] ?? null },
      deferReply: async () => {}, editReply: capture, followUp: capture,
    });
    return fields;
  }

  const withHistory = await run();
  const party = withHistory.find((field) => field.name.includes('Saved Act'));
  assert.match(party.value, /3W \/ 5G/);
  assert.match(party.value, /4W \/ 10G/);

  fail = true;
  assert.ok((await run()).some((field) => field.name.includes('Latest Match')));
  process.env.ENABLE_MATCH_HISTORY = 'false';
  assert.ok((await run()).some((field) => field.name.includes('Latest Match')));
  assert.equal(record.mock.callCount(), 2);
});

test('mock mode answers without an API key or a network call', async (t) => {
  const saved = { key: process.env.HENRIK_API_KEY, mock: process.env.USE_MOCK_DATA };
  delete process.env.HENRIK_API_KEY;
  process.env.USE_MOCK_DATA = 'true';
  t.after(() => {
    if (saved.key === undefined) delete process.env.HENRIK_API_KEY;
    else process.env.HENRIK_API_KEY = saved.key;
    if (saved.mock === undefined) delete process.env.USE_MOCK_DATA;
    else process.env.USE_MOCK_DATA = saved.mock;
  });
  const network = t.mock.method(require('../src/services/henrikClient'), 'get', async () => {
    throw new Error('unexpected network call');
  });
  let reply;
  await profile.execute({
    options: { getString: (key) => ({ name: 'Test', tag: 'NA1', region: 'na' })[key] ?? null },
    deferReply: async () => {}, editReply: async (value) => { reply = value; },
  });
  assert.equal(network.mock.callCount(), 0);
  assert.match(reply.embeds[0].author.name, /EXAMPLE REPORT/);
  assert.ok(reply.embeds[0].fields.some(({ name }) => name.includes('Match Log · 1 of 2')));
});

test('complete API failure yields one plain-language error reply', async (t) => {
  for (const method of ['getPlayerAccount', 'getPlayerProfile', 'getPlayerMMR', 'getMMRHistory', 'getRecentMatches']) {
    t.mock.method(api, method, async () => { throw new Error('upstream unavailable'); });
  }
  t.mock.method(api, 'isExperimentalValorantPipelineEnabled', () => false);
  const replies = [];
  await profile.execute({
    options: { getString: (key) => ({ name: 'Test', tag: 'NA1', region: 'na' })[key] ?? null },
    deferReply: async () => {}, editReply: async (value) => replies.push(value),
  });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].embeds[0].toJSON().title, 'Profile Unavailable');
});

test('status is a private zero-option health check and scopes match count to the server', async (t) => {
  const { MessageFlags } = require('discord.js');
  const status = require('../src/commands/status');
  const { matchStore } = require('../src/services/store');
  assert.equal(status.data.toJSON().options.length, 0);
  t.mock.method(matchStore, 'countGuildMatches', async (guild) => {
    assert.equal(guild, 'test-guild');
    return 12;
  });
  t.mock.method(require('../src/services/henrikClient'), 'status', () => ({ cached: 5, lastStatus: 429 }));
  let text;
  await status.execute({ guildId: 'test-guild',
    deferReply: async ({ flags }) => assert.equal(flags, MessageFlags.Ephemeral),
    editReply: async (content) => { text = content; },
  });
  assert.match(text, /Cached API responses: 5/);
  assert.match(text, /Saved matches in this server: 12/);
  assert.match(text, /Last HenrikDev request: 429/);
});
