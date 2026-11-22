const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createGoalStore } = require('../src/services/coachGoals');

test('coach goals survive restart, dedupe check-ins, and stay within the chosen act and account', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'coach-goals-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const identity = ['guild', 'requester', 'player', 'na'];
  const match = (id, day, win, act = 'act') => ({
    matchId: id, seasonId: act, isWin: win, startedAt: new Date(Date.UTC(2026, 10, day)).toISOString(),
    roundResults: [{ opened: true, won: win, playerGotFirstKill: win }, { opened: false, won: false }],
  });
  await createGoalStore(dir).checkIn(identity, [match('baseline', 20, true)], 60, new Date('2026-11-22T00:00:00Z'));
  const store = createGoalStore(dir);
  const first = match('observed', 23, true);
  const run = await store.checkIn(identity, [first, first, match('other-act', 24, false, 'other'),
    match('pre-goal', 21, false), { ...match('remake', 25, false), completed: false }], 60);
  assert.deepEqual(run.baseline, { games: 1, won: 1, rounds: 1 });
  assert.deepEqual(run.current, { games: 1, won: 1, rounds: 1 });
  const completed = await store.checkIn(identity, Array.from({ length: 6 }, (_, i) =>
    match(`extra-${i}`, 24 + i, true)), null);
  assert.equal(completed.current.games, 5);
  assert.equal(await store.checkIn(['guild', 'other', 'player', 'na'], [first], null), null);
});
