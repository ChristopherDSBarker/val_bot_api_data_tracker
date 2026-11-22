const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../src/services/valorantApi');
const profile = require('../src/commands/valorantProfile');

test('one command shows automatic coaching with the existing lookup inputs and an optional goal', async (t) => {
  assert.deepEqual(fs.readdirSync(path.join(__dirname, '../src/commands')).filter((name) => name.endsWith('.js')),
    ['valorantProfile.js']);
  const config = profile.data.toJSON();
  assert.deepEqual(config.options.map(({ name }) => name), ['name', 'tag', 'region', 'goal']);
  assert.ok(config.options.find((option) => option.name === 'region').choices
    .some(({ name, value }) => name === 'North America' && value === 'na'));

  const match = { map: 'Sunset', isWin: false, roundsWon: 11, roundsLost: 13 };
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
  assert.ok(fields.some((field) => field.name.includes('Latest Match') && field.value.includes('Replay cue')));
  assert.ok(fields.some((field) => field.name.includes('Recent Competitive')));
  assert.equal(message.files, undefined);
  const { coachGoals } = require('../src/services/coachGoals');
  const previousMock = process.env.USE_MOCK_DATA;
  process.env.USE_MOCK_DATA = 'false';
  t.after(() => {
    if (previousMock === undefined) delete process.env.USE_MOCK_DATA;
    else process.env.USE_MOCK_DATA = previousMock;
  });
  const { matchStore } = require('../src/services/store');
  t.mock.method(matchStore, 'recordAndRead', async () => []);
  const checkIn = t.mock.method(coachGoals, 'checkIn', async (identity, matches, target) => {
    assert.deepEqual(identity, ['guild', 'requester', 'player', 'na', 'personal-first-kill-v1']);
    assert.deepEqual(matches, [match]);
    assert.equal(target, 14);
    return { target, window: 5, baseline: { rounds: 20, won: 3 }, current: { games: 3, rounds: 42, won: 5 } };
  });
  const { MessageFlags } = require('discord.js');
  await profile.execute({
    guildId: 'guild', user: { id: 'requester' },
    options: { getString: (key) => ({ name: 'Test', tag: 'NA1', region: 'na' })[key] ?? null,
      getInteger: () => 14 },
    deferReply: async ({ flags }) => assert.equal(flags, MessageFlags.Ephemeral),
    editReply: async (value) => { message = value; },
  });
  assert.match(message.embeds[0].fields.find((field) => field.name.includes('Latest Match')).value,
    /14% of known openings.*5\/42 first kills/s);
  assert.equal(checkIn.mock.callCount(), 1);

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
  const party = withHistory.find((field) => field.name.includes('How You Played Together'));
  assert.match(party.value, /Saved act with: 3\/5 \(60%\)/);
  assert.match(party.value, /Saved act apart: 4\/10 \(40%\)/);

  fail = true;
  assert.ok((await run()).some((field) => field.name.includes('Latest Match')));
  process.env.ENABLE_MATCH_HISTORY = 'false';
  assert.ok((await run()).some((field) => field.name.includes('Latest Match')));
  assert.equal(record.mock.callCount(), 2);
});
