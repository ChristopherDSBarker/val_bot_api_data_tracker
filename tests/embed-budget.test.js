const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProfileEmbed, createProfileReplies, createMMREmbed } = require('../src/utils/embeds');

test('career continuation preserves every row and oversized cards include overflow', () => {
  const mastery = Array.from({ length: 40 }, (_, i) => ({ agent: `Unique agent ${i}`, level: 1 }));
  const card = createProfileEmbed({ riotId: 'Player#NA1', career: {
    mastery, accolades: [{ label: 'first blood', count: 7 }],
    actAccolades: { label: 'Act 6', entries: [{ label: 'plants', count: 4 }] },
  } });
  const fields = card.toJSON().fields;
  assert.ok(fields.some((f) => f.name.includes('Agent Mastery') && f.name.includes('Continued')));
  assert.ok(fields.some((f) => f.name.includes('Lifetime Accolades') && f.value.includes('first blood')));
  const extra = Array.from({ length: 10 }, (_, i) => ({
    name: `Compare Your Games ${i}`, value: `overflow-marker-${i} ` + 'x'.repeat(950),
  }));
  const reply = createProfileReplies({ toJSON: () => ({ ...card.toJSON(), fields: [...fields, ...extra] }) });
  for (const page of reply) {
    const payload = page.embeds[0];
    const total = [payload.title, payload.description, payload.author?.name, payload.footer?.text,
      ...payload.fields.flatMap((f) => [f.name, f.value])].reduce((sum, text) => sum + (text?.length || 0), 0);
    assert.ok(total <= 5500);
    assert.ok(payload.fields.every((f) => f.value.length <= 1024));
    assert.equal(page.files, undefined);
  }
  const delivered = reply.flatMap((page) => page.embeds[0].fields).map((field) => field.value).join('\n');
  assert.ok(delivered.includes('overflow-marker-9'));
  for (const row of mastery) assert.ok(delivered.includes(row.agent));
});

test('an oversized field is split in Discord without losing text', () => {
  const large = 'x'.repeat(1100);
  const reply = createProfileReplies({ toJSON: () => ({ title: 'Test', fields: [{ name: 'Table', value: large }] }) });
  assert.equal(reply.flatMap((page) => page.embeds[0].fields).map((field) => field.value).join(''), large);
  assert.ok(reply.every((page) => !page.files));
});

test('standalone rank card renders Elo and supports missing Elo', () => {
  assert.match(createMMREmbed({ elo: 1150 }).toJSON().fields.at(-1).value, /Elo:.*1150/);
  assert.match(createMMREmbed({}).toJSON().fields.at(-1).value, /Elo:.*N\/A/);
});

test('full profile keeps every report section across inline embeds', () => {
  const recentMatches = Array.from({ length: 10 }, (_, i) => ({
    matchId: String(i), seasonId: 'act', startedAt: new Date(Date.UTC(2026, 10, i + 1)).toISOString(),
    map: 'Sunset', agent: 'Jett', roundsWon: 13, roundsLost: 9, isWin: true,
    kills: 18, deaths: 12, assists: 7, performanceScore: i === 0 ? null : 245,
    partyCheckComplete: i >= 5,
    teammates: [{ name: 'BruceBootyLee', tag: 'OwO', agent: 'Clove', sameParty: i < 5 }],
    roundResults: Array.from({ length: 12 }, () => ({ side: 'attack', opened: true, won: i >= 5 })),
  }));
  const partySummary = Array.from({ length: 6 }, (_, i) => ({
    key: i ? `peer-${i}` : 'brucebootylee#owo',
    riotId: i ? `Teammate ${i}#NA1` : 'BruceBootyLee#OwO', games: 5, decided: 5, wins: 3,
    roundGames: 5, roundDiff: 11, tradeGames: 5, trades: 2,
  }));
  const { summarizeMaps } = require('../src/services/valorantCareer');
  const card = createProfileEmbed({
    riotId: 'Layout#NA1', currentRank: 'Gold 3', currentRR: 41, matchesAnalyzed: 10, wins: 10, winPercent: 100,
    partySummary, mapSummary: summarizeMaps(recentMatches), level: 280,
    lifetimePrestige: { Gold: { count: 7 } },
    career: { mastery: [{ agent: 'Jett', level: 4 }], accolades: [{ label: 'first blood', count: 7 }],
      actAccolades: { label: 'Act 6', entries: [{ label: 'plants', count: 4 }] } },
  }, { recentMatches, mmrHistory: recentMatches.map((match) => ({ matchId: match.matchId, rrChange: 21 })) });
  const reply = createProfileReplies(card);
  const fields = reply.flatMap((page) => page.embeds[0].fields);
  const text = fields.map(({ name, value }) => `${name}\n${value}`).join('\n');
  for (const title of ['Competitive Snapshot', 'Combat', 'Rank Legacy', 'Agent Mastery', 'Lifetime Accolades',
    'Act Accolades', 'Competitive Maps', 'Rounds Won by Side', 'Sample Leaders & Economy', 'How Often',
    'Compare Your Recent Games', 'Recent Competitive', 'Match Stats', 'Observed RR Changes',
    'Latest Shown Match', 'Who You Queued With', 'Account & Rank Details']) assert.ok(text.includes(title), title);
  const codeBlocks = [...fields.flatMap((field) => [...field.value.matchAll(/```\n([\s\S]*?)\n```/g)])];
  assert.ok(codeBlocks.length >= 8);
  assert.ok(codeBlocks.every(([, table]) => table.split('\n').every((line) => line.length <= 42)));
  assert.match(text, /Sunset \/ Jett \/ attack\n0% \(0\/60\)\s+100% \(60\/60\)/);
  assert.match(text, /BruceBootyLee#OwO/);
  assert.doesNotMatch(text, /Recent apart/);
  assert.ok(reply.every((page) => !page.files));
  assert.ok(fields.every((field) => field.value.length <= 1024));
});
