const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rankOrdinal, averageEnemyRank, summarizeVisibleRankResults } = require('../src/services/visibleRanks');
const { createProfileEmbed } = require('../src/utils/embeds');

test('visible-rank comparison requires five ranked opponents and a matching act', () => {
  const higher = { actId: 'act', tier: 'Gold 3', enemyTiers: Array(5).fill('Platinum 1'), won: true };
  const lower = { ...higher, enemyTiers: Array(5).fill('Gold 2'), won: false };
  assert.equal(rankOrdinal('Radiant'), rankOrdinal('Immortal 3') + 1);
  assert.equal(averageEnemyRank(['Gold 1', 'Gold 2', 'Gold 3', 'Silver 2', 'Unranked']), null);
  const result = summarizeVisibleRankResults([higher, lower, { ...higher, actId: 'old' },
    { ...higher, enemyTiers: null }, { ...higher, enemyTiers: ['Gold 1'] },
    { ...higher, enemyTiers: Array(5).fill('Gold 3') }], 'act');
  assert.deepEqual(result, { higher: { games: 1, wins: 1 }, lower: { games: 1, wins: 0 } });
  assert.ok(!createProfileEmbed({ visibleRankResults: result }).toJSON().fields
    .some(({ name }) => name.includes('Visible Rank')));
  const qualified = summarizeVisibleRankResults(Array.from({ length: 40 }, (_, i) => ({ ...higher, won: i < 24 })), 'act');
  assert.match(createProfileEmbed({ visibleRankResults: qualified }).toJSON().fields
    .find(({ name }) => name.includes('Visible Rank')).value, /Higher\s+24\/40\s+60%/);
});
