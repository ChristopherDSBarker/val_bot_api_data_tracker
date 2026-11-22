const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProfileEmbed, createProfileReply, createMMREmbed } = require('../src/utils/embeds');

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
  const reply = createProfileReply({ toJSON: () => ({ ...card.toJSON(), fields: [...fields, ...extra] }) });
  const payload = reply.embeds[0];
  const total = [payload.title, payload.description, payload.author?.name, payload.footer?.text,
    ...payload.fields.flatMap((f) => [f.name, f.value])].reduce((sum, text) => sum + (text?.length || 0), 0);
  assert.ok(total <= 5500);
  assert.ok(payload.fields.every((f) => f.value.length <= 1024));
  assert.ok(reply.files[0].attachment.toString().includes('overflow-marker-9'));
  const delivered = payload.fields.map((f) => f.value).join('\n') + reply.files[0].attachment.toString();
  for (const row of mastery) assert.ok(delivered.includes(row.agent));
});

test('a single oversized field is moved intact to the attachment', () => {
  const large = 'x'.repeat(1100);
  const reply = createProfileReply({ toJSON: () => ({ title: 'Test', fields: [{ name: 'Table', value: large }] }) });
  assert.equal(reply.embeds[0].fields.length, 0);
  assert.ok(reply.files[0].attachment.toString().includes(large));
});

test('standalone rank card renders Elo and supports missing Elo', () => {
  assert.match(createMMREmbed({ elo: 1150 }).toJSON().fields.at(-1).value, /Elo:.*1150/);
  assert.match(createMMREmbed({}).toJSON().fields.at(-1).value, /Elo:.*N\/A/);
});

test('full profile keeps every report section in the embed or its overflow file', () => {
  const recentMatches = Array.from({ length: 10 }, (_, i) => ({
    matchId: String(i), seasonId: 'act', startedAt: new Date(Date.UTC(2026, 10, i + 1)).toISOString(),
    map: 'Sunset', agent: 'Jett', roundsWon: 13, roundsLost: 9, isWin: true,
    kills: 18, deaths: 12, assists: 7, performanceScore: i === 0 ? null : 245,
    teammates: [{ name: 'BruceBootyLee', tag: 'OwO', agent: 'Clove' }],
    roundResults: Array.from({ length: 12 }, () => ({ side: 'attack', opened: true, won: true })),
  }));
  const partySummary = Array.from({ length: 6 }, (_, i) => ({
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
  const reply = createProfileReply(card);
  const { fields } = reply.embeds[0];
  const text = fields.map(({ name, value }) => `${name}\n${value}`).join('\n') + (reply.files?.[0].attachment.toString() || '');
  for (const title of ['Competitive Snapshot', 'Combat', 'Rank Legacy', 'Agent Mastery', 'Lifetime Accolades',
    'Act Accolades', 'Competitive Maps', 'Rounds Won by Side', 'Sample Leaders & Economy', 'How Often',
    'Compare Your Recent Games', 'Recent Competitive', 'Match Stats', 'Observed RR Changes',
    'Latest Shown Match', 'How You Played Together', 'Account & Rank Details']) assert.ok(text.includes(title), title);
  const codeBlocks = [...fields.flatMap((field) => [...field.value.matchAll(/```\n([\s\S]*?)\n```/g)])];
  assert.ok(codeBlocks.length >= 8);
  assert.ok(codeBlocks.every(([, table]) => table.split('\n').every((line) => line.length <= 42)));
  assert.match(text, /Sunset \/ Jett \/ attack\n60\/60 \(100%\)/);
  assert.match(text, /BruceBootyLee#OwO/);
  assert.ok(fields.every((field) => field.value.length <= 1024));
});
