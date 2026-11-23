// Compare two disjoint blocks of five completed matches within the latest observed act.
function compareRoundWindows(matches, { byRole = false } = {}) {
  const ordered = matches.filter((match) => match.completed !== false && match.matchId && match.seasonId && Number.isFinite(Date.parse(match.startedAt)))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const act = ordered[0]?.seasonId;
  const unique = [...new Map(ordered.filter((match) => match.seasonId === act)
    .map((match) => [match.matchId, match])).values()].slice(0, 10);
  if (unique.length < 10) return [];

  function count(block) {
    const groups = new Map();
    for (const match of block) {
      const context = byRole ? [match.role] : [match.map, match.agent];
      if (context.some((value) => !value || value === 'Unknown')) continue;
      for (const round of match.roundResults || []) {
        if (!['attack', 'defense'].includes(round.side) || typeof round.won !== 'boolean') continue;
        const key = JSON.stringify([...context, round.side]);
        const group = groups.get(key) || { map: match.map, agent: match.agent, role: match.role, side: round.side, won: 0, total: 0, firstKills: 0, knownOpeners: 0, matchIds: new Set() };
        group.total++;
        group.matchIds.add(match.matchId);
        if (round.won) group.won++;
        if (typeof round.playerGotFirstKill === 'boolean') {
          group.knownOpeners++;
          if (round.playerGotFirstKill) group.firstKills++;
        }
        groups.set(key, group);
      }
    }
    return groups;
  }

  const newer = count(unique.slice(0, 5));
  const older = count(unique.slice(5));
  return [...newer].flatMap(([key, recent]) => {
    const prior = older.get(key);
    return recent.total >= 10 && prior?.total >= 10 ? [{ recent, prior }] : [];
  }).sort((a, b) => Math.min(b.recent.total, b.prior.total) - Math.min(a.recent.total, a.prior.total));
}

module.exports = { compareRoundWindows };
