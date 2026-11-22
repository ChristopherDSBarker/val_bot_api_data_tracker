const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createMatchStore, historicalPartySplits } = require('../src/services/store');

test('saved matches survive restart, dedupe concurrent requests, and keep party samples separate', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'valorant-history-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'matches.jsonl');
  const matches = Array.from({ length: 17 }, (_, i) => ({
    matchId: String(i), seasonId: i === 16 ? 'prior' : 'act', startedAt: '2026-11-22T20:00:00Z',
    isWin: i % 2 === 0, partyCheckComplete: i >= 5 && i < 15,
    teammates: i < 5 ? [{ sameParty: true, puuid: 'raw-partner-id' }] : [],
  }));
  const store = createMatchStore(file);
  await Promise.all([store.recordAndRead('guild-a', 'raw-player-id', matches),
    store.recordAndRead('guild-a', 'raw-player-id', matches)]);
  const restart = createMatchStore(file);
  const rows = await restart.recordAndRead('guild-a', 'raw-player-id', []);
  assert.equal(rows.length, 17);
  assert.deepEqual(await restart.recordAndRead('guild-b', 'raw-player-id', []), []);
  const disk = await fs.readFile(file, 'utf8');
  assert.doesNotMatch(disk, /raw-(player|partner)-id/);
  const partners = [{ puuid: 'raw-partner-id', riotId: 'Duo#NA1' }];
  const [split] = historicalPartySplits(rows, 'guild-a', 'act', partners);
  assert.deepEqual(split.together, { games: 5, wins: 3 });
  assert.deepEqual(split.apart, { games: 10, wins: 5 });
  assert.deepEqual(historicalPartySplits(rows.slice(0, 14), 'guild-a', 'act', partners), []);
});
