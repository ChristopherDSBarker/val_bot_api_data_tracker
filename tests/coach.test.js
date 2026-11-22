const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reviewLatestMatch, latestSession } = require('../src/services/coach');

test('coach separates team opening outcomes from personal opening kills', () => {
  const result = reviewLatestMatch([{ isWin: false, map: 'Sunset', roundsWon: 11, roundsLost: 13, roundResults: [
    { opened: true, won: true, playerGotFirstKill: true },
    { opened: true, won: false, playerGotFirstKill: false },
    { opened: true, won: false, playerGotFirstKill: null },
    { opened: true, won: false },
    { opened: false, won: false, playerGotFirstKill: false },
  ] }]);
  assert.deepEqual(result.opened, { total: 4, won: 1 });
  assert.deepEqual([result.personalFirstKills, result.personalCoverage], [1, 3]);
  assert.match(result.practice, /regrouped or took separate fights/);
});

test('session groups by end-to-start gap, dedupes matches, and reports partial RR coverage', () => {
  const match = (matchId, hour, isWin) => ({
    matchId, startedAt: `2026-11-22T${hour}:00:00Z`, durationMs: 45 * 60 * 1000, isWin,
  });
  const older = match('older', '18', false);
  const newer = match('newer', '20', true);
  assert.deepEqual(latestSession([older, newer, newer, match('prior', '15', true)],
    [{ matchId: 'newer', rrChange: 21 }]), { games: 2, known: 2, wins: 1, rrCoverage: 1, netRR: 21 });
});

test('verified roles tailor the replay cue only when opening data covers ten rounds', () => {
  const { roleOf } = require('../src/services/agentRoles');
  assert.equal(roleOf('KAY/O'), 'Initiator');
  assert.equal(roleOf('Hush'), 'Duelist');
  assert.equal(roleOf('Unknown'), null);
  const match = { isWin: false, role: roleOf('KAY/O'), roundResults: [] };
  assert.doesNotMatch(reviewLatestMatch([match]).practice, /utility/);
  match.roundResults = Array.from({ length: 10 }, () => ({ opened: true, won: false }));
  assert.match(reviewLatestMatch([match]).practice, /utility land before/);
});

test('opening share baseline uses earlier distinct matches of the same role and act', () => {
  const game = (matchId, day, role = 'Duelist', seasonId = 'act') => ({
    matchId, role, seasonId, startedAt: `2026-11-${day}T00:00:00Z`, isWin: true,
    roundResults: Array.from({ length: 10 }, (_, i) => ({
      opened: true, won: true, playerGotFirstKill: i < 2,
    })),
  });
  const last = game('last', 22);
  const prior = game('prior', 21);
  const earlier = game('earlier', 20);
  const recap = reviewLatestMatch([last, prior, prior, earlier, game('other-role', 19, 'Sentinel'),
    game('other-act', 18, 'Duelist', 'prior')]);
  assert.deepEqual(recap.openingBaseline, { firstKills: 4, rounds: 20, games: 2 });
  assert.equal(reviewLatestMatch([last, prior, prior]).openingBaseline, null);
});
