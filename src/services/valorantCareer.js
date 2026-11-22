function number(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function normalizeAccolades(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((item) => item && number(item.count) !== null)
    .map((item) => ({ label: String(item.type || item.id || 'Unknown accolade'), count: number(item.count) }))
    .sort((a, b) => b.count - a.count);
}

function normalizeActAccolades(accolades, match) {
  if (!match?.seasonId || !Array.isArray(accolades?.summary?.seasons)) return null;
  const entry = accolades.summary.seasons.find((item) => item?.season?.id === match.seasonId);
  if (!entry) return null;
  return { label: entry.season.short || match.seasonLabel || 'latest match’s act',
    entries: normalizeAccolades(entry.accolades) };
}

function normalizeCareer(accolades, mastery) {
  const levels = (Array.isArray(mastery?.agents) ? mastery.agents : [])
    .filter((item) => item?.agent?.name && number(item.flourish?.long_level) > 0)
    .map((item) => ({ agent: item.agent.name, level: number(item.flourish.long_level) }))
    .sort((a, b) => b.level - a.level || a.agent.localeCompare(b.agent));
  const cutoff = levels[2]?.level;

  return {
    accolades: normalizeAccolades(accolades?.summary?.all_time).slice(0, 5),
    mastery: levels.filter((entry) => cutoff === undefined || entry.level >= cutoff),
  };
}

// Input is the normalized competitive history requested by the service.
// These are recent sample statistics, never Riot's private Map Rating.
function summarizeMaps(matches = []) {
  const maps = new Map();
  for (const match of matches) {
    if (!match?.map || match.map === 'Unknown') continue;
    const row = maps.get(match.map) || { map: match.map, games: 0, wins: 0, decided: 0, scores: [],
      attack: { wins: 0, total: 0 }, defense: { wins: 0, total: 0 } };
    row.games++;
    if (typeof match.isWin === 'boolean') {
      row.decided++;
      if (match.isWin) row.wins++;
    }
    for (const round of match.roundResults || []) {
      if (!['attack', 'defense'].includes(round.side) || typeof round.won !== 'boolean') continue;
      row[round.side].total++;
      if (round.won) row[round.side].wins++;
    }
    const score = number(match.performanceScore);
    if (score !== null) row.scores.push(score);
    maps.set(match.map, row);
  }
  return [...maps.values()].map(({ scores, ...row }) => ({
    ...row,
    winRate: row.decided ? 100 * row.wins / row.decided : null,
    performanceScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    performanceSamples: scores.length,
  })).sort((a, b) => b.games - a.games || a.map.localeCompare(b.map));
}

function summarizeRoles(matches, roleOf) {
  const roles = new Map();
  const seen = new Set();
  const baseline = { wins: 0, games: 0 };
  for (const match of matches) {
    if (match.completed === false || typeof match.isWin !== 'boolean' ||
        (match.matchId && seen.has(match.matchId))) continue;
    if (match.matchId) seen.add(match.matchId);
    baseline.games++;
    if (match.isWin) baseline.wins++;

    const role = match.role || roleOf(match.agent);
    if (!role || role === 'Unknown') continue;
    const row = roles.get(role) || { role, wins: 0, games: 0, maps: new Map(),
      firstKills: 0, knownOpeners: 0, defenseWins: 0, defenseRounds: 0 };
    row.games++;
    if (match.isWin) row.wins++;
    if (match.map && match.map !== 'Unknown') row.maps.set(match.map, (row.maps.get(match.map) || 0) + 1);
    for (const round of match.roundResults || []) {
      if (typeof round.playerGotFirstKill === 'boolean') {
        row.knownOpeners++;
        if (round.playerGotFirstKill) row.firstKills++;
      }
      if (round.side === 'defense' && typeof round.won === 'boolean') {
        row.defenseRounds++;
        if (round.won) row.defenseWins++;
      }
    }
    roles.set(role, row);
  }
  return { baseline, roles: [...roles.values()] };
}

module.exports = { normalizeCareer, normalizeActAccolades, summarizeMaps, summarizeRoles };
