const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createProfileEmbed, createProfileReplies, createErrorEmbed } = require('../src/utils/embeds');
const { summarizeMaps } = require('../src/services/valorantCareer');

const game = (i, overrides = {}) => ({
  matchId: String(i), startedAt: new Date(Date.UTC(2026, 10, 20, 18, 60 - i * 5)).toISOString(),
  seasonId: 'act', role: 'Duelist', agent: 'Jett', map: 'Sunset', isWin: i < 5,
  roundsWon: i < 5 ? 13 : 8, roundsLost: i < 5 ? 8 : 13, kills: 18, deaths: 12, assists: 4,
  performanceScore: 242, partyCheckComplete: true, teammates: [],
  roundResults: Array.from({ length: 12 }, (_, r) => ({ side: 'attack', won: r < (i < 5 ? 8 : 3),
    opened: r % 2 === 0, playerGotFirstKill: r === 0 })),
  ...overrides,
});
const block = (n, overrides) => Array.from({ length: n }, (_, i) => game(i, overrides));
const trio = [{ puuid: 'a', name: 'BruceBootyLee', tag: 'OwO', sameParty: true },
  { puuid: 'b', name: 'SteviePR', tag: 'aqnis', sameParty: true }];

function card(matches, { mmr = { currentRank: 'Gold 3', currentRR: 41 }, profile = {}, career, riotId = 'Player#NA1' } = {}) {
  const known = matches.filter((match) => typeof match.isWin === 'boolean');
  const wins = known.filter((match) => match.isWin).length;
  return createProfileEmbed({ ...mmr, riotId, matchesAnalyzed: matches.length, wins,
    losses: known.length - wins, winPercent: known.length ? wins * 100 / known.length : null,
    mapSummary: summarizeMaps(matches), career, peakSeason: 'e7a3', ...profile },
  { recentMatches: matches, mmr, profile: matches.length ? profile : null,
    mmrHistory: mmr ? matches.map((match) => ({ matchId: match.matchId, rrChange: match.isWin ? 20 : -18 })) : [] });
}

const scenarios = {
  'unranked-empty': () => card([], { mmr: { currentRank: 'Unranked' } }),
  'ranked-three': () => card(block(3)),
  'ranked-ten-solo': () => card(block(10)),
  'ranked-ten-trio': () => card(block(10, { teammates: trio })),
  'five-stack-members': () => card([
    ...block(1, { teammates: [
      ...trio.map((member, i) => ({ ...member, trades: i + 1, kills: 18, deaths: 12 })),
      { puuid: 'c', name: 'Doii112', tag: 'NA1', sameParty: true, trades: 0, kills: 9, deaths: 14 },
      { puuid: 'd', name: 'Ａ'.repeat(20), tag: 'UwU', sameParty: true, trades: 1, kills: 6, deaths: 9 },
    ] }),
    game(4, { teammates: [{ puuid: 'outsider', name: 'Other Player', tag: 'NA1', sameParty: false, trades: 20 }] }),
  ]),
  overtime: () => card(block(4, { roundsWon: 14, roundsLost: 12, roundDiff: 2 })),
  'missing-rounds': () => card(block(10, { roundResults: [] })),
  'new-agent': () => card(block(3, { agent: 'Uncatalogued Agent', role: null })),
  'rank-unavailable': () => card(block(3), { mmr: null }),
  'matches-unavailable': () => card([]),
  'all-api-failure': () => createErrorEmbed('Profile Unavailable', 'Check the Riot ID and region. If they are correct, try again in a moment.'),
  'zero-deaths': () => card(block(3), { profile: { kills: 8, deaths: 0 } }),
  'large-career': () => card(block(10, { teammates: trio }), { career: {
    mastery: Array.from({ length: 60 }, (_, i) => ({ agent: `Agent ${i}`, level: 1 })),
    accolades: [{ label: 'first_blood', count: 7 }],
    actAccolades: { label: 'Act 6', entries: [{ label: 'plants', count: 4 }] },
  } }),
  'wide-riot-id': () => card(block(3, { teammates: [
    { puuid: 'edge', name: 'Ａ'.repeat(54) + '```', tag: 'NA1', sameParty: true },
  ] }), { riotId: 'Ａ'.repeat(54) + '```#NA1' }),
};

for (const [name, scenario] of Object.entries(scenarios)) {
  test(`report contract: ${name}`, () => {
    const pages = createProfileReplies(scenario());
    if (name !== 'all-api-failure') {
      const summary = pages[0].embeds[0];
      assert.equal(summary.fields.length, 5);
      assert.ok(summary.fields.every((field) => !/Coverage|Legend/.test(field.name)));
      const summarySize = [summary.title, summary.description, summary.footer?.text, summary.author?.name,
        ...summary.fields.flatMap(({ name, value }) => [name, value])].reduce((sum, item) => sum + (item?.length || 0), 0);
      assert.ok(summarySize < 1800);
      assert.ok(pages.slice(1).some((page) => page.embeds[0].fields.some((field) => field.name.includes('Sample Coverage'))));
    }
    for (const page of pages) {
      assert.equal(page.files, undefined);
      const { title, description, footer, author, fields } = page.embeds[0];
      assert.ok(fields.length <= 25);
      const strings = [title, description, footer?.text, author?.name, ...fields.flatMap((f) => [f.name, f.value])];
      assert.ok(strings.reduce((sum, value) => sum + (value?.length || 0), 0) <= 5500);
      for (const field of fields) {
        assert.ok(field.name.length > 0 && field.name.length <= 256);
        assert.ok(field.value.trim() && field.value.length <= 1024);
        assert.doesNotMatch(field.value, /\b(?:undefined|NaN|Infinity|null)\b|\[object Object\]/);
        assert.equal((field.value.match(/^```$/gm) || []).length % 2, 0);
        for (const [, table] of field.value.matchAll(/```\n([\s\S]*?)\n```/g)) {
          for (const line of table.split('\n')) {
            const width = Array.from(line).reduce((n, char) => n + (/[Ａ-Ｚ]/u.test(char) ? 2 : 1), 0);
            assert.ok(width <= 42, `${field.name}: ${line}`);
          }
        }
      }
    }
    if (name === 'five-stack-members') {
      const party = pages.slice(1).flatMap((page) => page.embeds[0].fields)
        .find(({ name }) => name.includes('Who You Queued With'));
      assert.ok(party);
      assert.match(party.value, /^  Doii112#NA1\n    Trades 0 \(1G\) · K\/D 9\/14 \(1G\)$/m);
      assert.equal((party.value.match(/^    Trades .* · K\/D /gm) || []).length, 4);
      assert.match(party.value, /1W \/ 1G/);
      assert.doesNotMatch(party.value, /\+1 more/);
    }
    const rendered = pages.map(({ embeds: [page] }, i) => [
      `=== Page ${i + 1} ===`, page.title, page.description,
      ...page.fields.map(({ name, value }) => `[${name}]\n${value}`), page.footer?.text,
    ].filter(Boolean).join('\n\n')).join('\n\n') + '\n';
    const file = path.join(__dirname, 'report-snapshots', `${name}.txt`);
    if (process.env.UPDATE_REPORT_SNAPSHOTS === '1') fs.writeFileSync(file, rendered);
    assert.equal(rendered, fs.readFileSync(file, 'utf8'));
  });
}
