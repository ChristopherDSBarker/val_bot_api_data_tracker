const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProfileEmbed } = require('../src/utils/embeds');

test('one card shows RR, match log, and teammate identities with missing-name fallback', () => {
  const match = {
    map: 'Haven', agent: 'Hush', isWin: false, roundsWon: 12, roundsLost: 14,
    kills: 15, deaths: 21, assists: 5,
    teammates: [{ agent: 'Sage', name: 'Duo', tag: 'NA1', kills: 10, deaths: 11, assists: 12 },
      { agent: 'Omen' }],
  };
  const { fields } = createProfileEmbed({ riotId: 'Player#NA1' },
    { recentMatches: [match], mmrHistory: [{ rrChange: -22 }] }).toJSON();
  const team = fields.find((field) => field.name.endsWith('Teammates'));
  assert.equal(team.inline, true);
  assert.match(team.value, /Sage.*Duo#NA1.*10\/11\/12/);
  assert.match(team.value, /Omen.*Name unavailable/);
  assert.ok(fields.some((field) => field.name.includes('Observed RR Changes')));
  assert.match(fields.find((field) => field.name.includes('Recent Competitive')).value, /12-14.*Haven/);
});

test('mastery includes all agents tied at the cutoff', () => {
  const { normalizeCareer } = require('../src/services/valorantCareer');
  const agents = [['Deadlock', 16], ['Gekko', 1], ['KAY/O', 1], ['Omen', 1]].map(([name, level]) => ({
    agent: { name }, flourish: { long_level: level },
  }));
  const { mastery } = normalizeCareer(null, { agents });
  assert.deepEqual(mastery.map(({ agent }) => agent), ['Deadlock', 'Gekko', 'KAY/O', 'Omen']);
});

test('losing sample leaders are descriptive and economy is weighted by rounds', () => {
  const recentMatches = [10, 20, 10, 20].map((roundsPlayed) => ({
    agent: 'Clove', isWin: false, roundsPlayed, creditsPerRound: roundsPlayed === 10 ? 1000 : 2500,
  }));
  const card = createProfileEmbed({ partySummary: [{ riotId: 'Doi#NA1', games: 4, decided: 4, wins: 1 }] },
    { recentMatches }).toJSON();
  const readout = card.fields.find((field) => field.name === 'Recent Sample Leaders & Economy').value;
  assert.match(readout, /Clove.*0\/4 wins/);
  assert.match(readout, /Doi#NA1.*1\/4 party wins/);
  assert.match(readout, /Spent \/ round\s+2,000\s+60 rounds/);
});

test('round table uses separate observed denominators for sides and first kills', () => {
  const recentMatches = [{ roundResults: [
    { side: 'attack', opened: true, won: true },
    { side: 'attack', opened: null, won: false },
    { side: 'defense', opened: false, won: true },
  ] }];
  const card = createProfileEmbed({}, { recentMatches }).toJSON();
  const table = card.fields.find((field) => field.name.includes('How Often')).value;
  assert.match(table, /Playing attack\s+1\/2\s+50%/);
  assert.match(table, /Team got first kill\s+1\/1\s+100%/);
  assert.match(table, /Opponent got first kill\s+1\/1\s+100%/);
});

test('teammate comparison shows one row per player and uses party wins when available', () => {
  const teammate = { key: 'one', riotId: 'Skydemo#7618', games: 7, wins: 2, decided: 7 };
  const party = { ...teammate, games: 5, wins: 1, decided: 5, roundDiff: -10, roundGames: 5, trades: 3, tradeGames: 5 };
  const card = createProfileEmbed({ teammateSummary: [teammate], partySummary: [party] }).toJSON();
  const table = card.fields.find((field) => field.name.includes('How You Played Together')).value;
  assert.equal(table.match(/Skydemo#7618/g).length, 1);
  const tables = [...table.matchAll(/```\n([\s\S]*?)\n```/g)];
  assert.equal(tables.length, 1);
  assert.ok(tables.every(([, body]) => body.split('\n').every((line) => line.length <= 37)));

  assert.match(table, /Skydemo#7618\nParty\s+1\/5\s+20%\s+-2\s+3\/5/);
});

test('progress keeps the full map, agent, and side on their own line', () => {
  const recentMatches = Array.from({ length: 10 }, (_, i) => ({
    matchId: String(i), seasonId: 'act', startedAt: new Date(Date.UTC(2026, 10, i + 1)).toISOString(),
    map: 'Sunset', agent: 'Jett',
    roundResults: Array.from({ length: i < 5 ? (i < 2 ? 3 : 2) : (i === 9 ? 4 : 5) },
      (_, round) => ({ side: 'attack', won: i < 5 ? i === 0 && round === 0 : i < 7 || i === 7 && round < 3 })),
  }));
  const card = createProfileEmbed({}, { recentMatches }).toJSON();
  const progress = card.fields.find((field) => field.name.includes('Compare Your')).value;
  assert.match(progress, /Earlier 5\s+Latest 5/);
  assert.match(progress, /Sunset \/ Jett \/ attack\n1\/12 \(8%\)\s+13\/24 \(54%\)/);
});
