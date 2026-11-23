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
  assert.equal(team.inline, false);
  assert.match(team.value, /Sage.*Duo#NA1.*10\/11\/12/);
  assert.match(team.value, /Omen.*Name unavailable/);
  assert.ok(fields.some((field) => field.value.includes('**Momentum:**')));
  assert.match(fields.find((field) => field.name.includes('Match Log · 1 of 2')).value, /12-14.*Haven/);
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

test('teammate comparison groups a recurring party rather than duplicating wins per player', () => {
  const member = (name) => ({ name, tag: 'NA1', sameParty: true });
  const recentMatches = Array.from({ length: 5 }, (_, i) => ({
    matchId: String(i), partyCheckComplete: true, teammates: [member('DuoA'), member('DuoB')],
    isWin: i === 0, roundDiff: -2,
  }));
  const card = createProfileEmbed({}, { recentMatches }).toJSON();
  const table = card.fields.find((field) => field.name.includes('Who You Queued With')).value;
  assert.match(table, /Trio · you \+ 2/);
  assert.match(table, /DuoA#NA1/);
  assert.match(table, /DuoB#NA1/);
  assert.equal((table.match(/1W \/ 5G/g) || []).length, 1);
  assert.match(table, /Rounds\/game/);
  assert.doesNotMatch(table, /Recent apart/);
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
  assert.match(progress, /Earlier rounds\s+Latest rounds/);
  assert.match(progress, /5 earlier and 5 latest matches contributed/);
  assert.match(progress, /Biggest shift: Attack/);
  assert.match(progress, /Sunset \/ Jett \/ attack\n8% \(1\/12\)\s+54% \(13\/24\)\s+\+46/);
});

test('role comparison uses a personal baseline, names a single-map sample, and requires two eligible roles', () => {
  const duelist = Array.from({ length: 3 }, (_, i) => ({ agent: 'Jett', map: 'Ascent', isWin: i < 2 }));
  const controller = Array.from({ length: 3 }, (_, i) => ({ agent: 'Omen', map: 'Lotus', isWin: i < 1 }));
  const read = (recentMatches) => createProfileEmbed({}, { recentMatches }).toJSON().fields
    .find((field) => field.name.includes('Sample Leaders')).value;
  assert.match(read([...duelist, ...controller]), /Duelist 2\/3 \(67%\).*Controller 1\/3 \(33%\)/);
  assert.match(read([...duelist, ...controller]), /\+17 percentage points vs your recent baseline of 50%/);
  assert.match(read([...duelist, ...controller]), /Duelist: all 3 on Ascent/);
  assert.doesNotMatch(read(duelist), /Highest role win rate/);
});

test('comparison leads with the larger round-equivalent shift and omits Controller opening kills', () => {
  const recentMatches = Array.from({ length: 10 }, (_, i) => ({
    matchId: String(i), seasonId: 'act', startedAt: new Date(Date.UTC(2026, 10, i + 1)).toISOString(),
    role: 'Controller', agent: 'Omen', map: 'Sunset',
    roundResults: ['attack', 'defense'].flatMap((side) => {
      const newer = i >= 5;
      const rounds = side === 'attack' ? 12 : 10;
      const wins = side === 'attack' ? (newer ? 6 : 8) : (newer ? 5 : 4);
      return Array.from({ length: rounds }, (_, r) => ({ side, won: r < wins, playerGotFirstKill: r === 0 }));
    }),
  }));
  const field = createProfileEmbed({}, { recentMatches }).toJSON().fields
    .find(({ name }) => name.includes('Compare Your'));
  assert.match(field.value, /Attack.*10\.0 fewer rounds.*defense.*5\.0 rounds/);
  assert.doesNotMatch(field.value, /First kills/);
  assert.ok(field.value.indexOf('Sunset / Omen / attack') < field.value.indexOf('Sunset / Omen / defense'));
});
