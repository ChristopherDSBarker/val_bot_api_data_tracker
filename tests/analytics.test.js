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

test('observed RR joins by match, filters context and placements, and keeps zero RR', () => {
  const { summarizeObservedRR } = require('../src/services/analytics');
  const game = (matchId, isWin, gameVersion = '13.10') => ({ matchId, isWin, seasonId: 'act', gameVersion });
  const win = game('win', true);
  const result = summarizeObservedRR([win, win, game('zero', false), game('loss', false), game('old', true, '13.09'),
    game('placement', true), game('missing', true)], [
    { matchId: 'win', rrChange: 21 }, { matchId: 'loss', rrChange: -15 }, { matchId: 'zero', rrChange: 0 },
    { matchId: 'old', rrChange: 50 }, { matchId: 'placement', rrChange: 90, placement: true },
  ]);
  assert.deepEqual(result, { wins: { games: 1, average: 21, min: 21, max: 21 },
    losses: { games: 2, average: -7.5, min: -15, max: 0 }, count: 3, sameVersion: true });
});
