const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeSpendingEfficiency } = require('../src/services/analytics');

test('spending ratios use matched samples and exact totals when reported', () => {
  const metrics = summarizeSpendingEfficiency([
    { roundsPlayed: 20, roundsWon: 13, damageDealt: 3000, creditsSpentTotal: 40000, creditsPerRound: 9999 },
    { roundsPlayed: 10, roundsWon: 4, creditsPerRound: 1000 },
    { roundsPlayed: 10, damageDealt: 1000, creditsPerRound: 2000 },
    { roundsPlayed: 10, roundsWon: 8, damageDealt: 1000 },
  ]);
  assert.deepEqual(metrics, {
    roundWins: { perThousand: 0.34, matches: 2 },
    damage: { perThousand: 4000 / 60, matches: 2 },
  });
  assert.deepEqual(summarizeSpendingEfficiency([{ roundsPlayed: 10, roundsWon: 3, creditsPerRound: 0 }]),
    { roundWins: null, damage: null });
});
