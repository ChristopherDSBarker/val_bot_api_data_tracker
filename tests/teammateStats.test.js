const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tradesAfterDeath, summarizeTeammates } = require('../src/services/teammateStats');

test('trade credits use a same-round window and shared results keep their denominator', () => {
  const kill = (round, time, killer, victim) => ({
    round, time_in_round_in_ms: time, killer: { puuid: killer }, victim: { puuid: victim },
  });
  const kills = [kill(1, 1000, 'enemy', 'player'), kill(1, 5500, 'duo', 'enemy'),
    kill(2, 2000, 'enemy', 'player'), kill(3, 3000, 'duo', 'enemy')];
  const credits = tradesAfterDeath({ kills }, 'player');
  assert.equal(credits.get('duo'), 1);
  assert.equal(tradesAfterDeath({}, 'player'), null);
  const teammate = { puuid: 'duo', name: 'Duo', tag: 'NA1', agent: 'Sage', trades: credits.get('duo') };
  const match = { matchId: 'one', isWin: true, teammates: [teammate] };
  const [row] = summarizeTeammates([match, match,
    { matchId: 'two', isWin: null, teammates: [{ ...teammate, trades: null }] }], 'duo#na1');
  assert.deepEqual([row.games, row.wins, row.decided, row.trades, row.tradeGames, row.friend], [2, 1, 1, 1, 1, true]);
});

test('party reports require a positive same-match party ID and exclude ordinary teammate games', () => {
  const { sameParty } = require('../src/services/teammateStats');
  assert.equal(sameParty({ party_id: 'abc' }, { party_id: 'abc' }), true);
  assert.equal(sameParty({ party_id: 'abc' }, { party_id: 'def' }), false);
  assert.equal(sameParty({ party_id: '0000-0000' }, { party_id: '0000-0000' }), false);
  assert.equal(sameParty({}, {}), false);
  const teammate = { puuid: 'ally', name: 'Ally', tag: 'NA1', agent: 'Sage' };
  const matches = [
    { matchId: 'one', isWin: true, roundDiff: 4, teammates: [{ ...teammate, sameParty: true }] },
    { matchId: 'two', isWin: false, roundDiff: -9, teammates: [teammate] },
  ];
  const [party] = summarizeTeammates(matches, null, { partyOnly: true });
  assert.deepEqual([party.games, party.wins, party.roundDiff], [1, 1, 4]);
});

test('queue groups distinguish verified solo, known parties, and incomplete data', () => {
  const { summarizeQueueGroups } = require('../src/services/teammateStats');
  const mate = { puuid: 'p', name: 'Duo', tag: 'NA1', sameParty: true };
  const duo = { matchId: '1', isWin: true, partyCheckComplete: true, teammates: [mate] };
  const { parties } = summarizeQueueGroups([duo, duo,
    { matchId: '2', isWin: false, partyCheckComplete: true, teammates: [] },
    { matchId: '3', isWin: false, teammates: [] },
    { matchId: '4', isWin: true, teammates: [mate] },
  ]);
  assert.deepEqual(parties.map(({ members, complete, wins, games }) => [members, complete, wins, games]),
    [[['Duo#NA1'], true, 1, 1], [[], true, 0, 1], [['Duo#NA1'], false, 1, 1]]);
});

test('member stats stay inside their exact lineup and require paired kills and deaths', () => {
  const { summarizeQueueGroups } = require('../src/services/teammateStats');
  const a = { puuid: 'a', name: 'A', tag: 'NA1', sameParty: true, kills: 18, deaths: 12, trades: 2 };
  const b = { puuid: 'b', name: 'B', tag: 'NA1', sameParty: true, kills: 11 };
  const c = { puuid: 'c', name: 'C', tag: 'NA1', sameParty: false, trades: 9 };
  const game = (matchId, teammates) => ({ matchId, teammates, partyCheckComplete: true, isWin: true });
  const { parties } = summarizeQueueGroups([
    game('one', [a, b, c]), game('two', [b, a, c]), game('three', [a, c]),
  ]);
  assert.deepEqual([...parties[0].perMember.keys()], ['a', 'b']);
  const member = parties[0].perMember.get('a');
  assert.deepEqual([member.kills, member.deaths, member.trades, member.tradeGames], [36, 24, 4, 2]);
  assert.equal(parties[0].perMember.get('b').kdGames, 0);
  assert.equal(parties[1].perMember.get('a').trades, 2);
});
