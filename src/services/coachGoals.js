const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const WINDOW = 5;

function eligibleMatches(matches) {
  const seen = new Set();
  const rows = [];
  for (const match of [...matches].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))) {
    if (!match.matchId || seen.has(match.matchId) || match.completed === false ||
        typeof match.isWin !== 'boolean' || !Number.isFinite(Date.parse(match.startedAt))) continue;
    seen.add(match.matchId);
    const rounds = (match.roundResults || []).filter((round) => typeof round.playerGotFirstKill === 'boolean');
    if (rounds.length) rows.push({
      id: match.matchId, act: match.seasonId || null, startedAt: match.startedAt,
      rounds: rounds.length, wins: rounds.filter((round) => round.playerGotFirstKill).length,
    });
  }
  return rows;
}

function summarize(rows) {
  return {
    games: rows.length,
    won: rows.reduce((sum, row) => sum + row.wins, 0),
    rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
  };
}

function advanceGoal(goal, matches) {
  const seen = new Set(goal.samples.map((row) => row.id));
  const added = eligibleMatches(matches).filter((row) => Date.parse(row.startedAt) > Date.parse(goal.startedAt) &&
    (!goal.act || row.act === goal.act) && !seen.has(row.id));
  const act = goal.act ?? added.find((row) => row.act)?.act ?? null;
  return { ...goal, act, samples: [...goal.samples, ...added.filter((row) => !act || row.act === act)].slice(0, WINDOW) };
}

function createGoalStore(directory) {
  let queue = Promise.resolve();
  function checkIn(identity, matches, target, now = new Date()) {
    const operation = queue.then(async () => {
      const key = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
      const file = path.join(directory, `${key}.json`);
      let goal = null;
      try {
        goal = JSON.parse(await fs.readFile(file, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }

      if (Number.isInteger(target) && (!goal || goal.target !== target)) {
        const eligible = eligibleMatches(matches);
        const act = eligible.at(-1)?.act ?? null;
        goal = {
          target, startedAt: now.toISOString(), act,
          baseline: summarize(eligible.filter((row) => row.act === act).slice(-WINDOW)), samples: [],
        };
      } else if (goal) {
        goal = advanceGoal(goal, matches);
      }
      if (!goal) return null;

      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const staging = `${file}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(staging, JSON.stringify(goal) + '\n', { mode: 0o600 });
        await fs.rename(staging, file);
      } finally {
        await fs.unlink(staging).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
      return { ...goal, current: summarize(goal.samples), window: WINDOW };
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { checkIn };
}

const coachGoals = createGoalStore(path.join(__dirname, '../../data/coach-goals'));
module.exports = { createGoalStore, coachGoals };
