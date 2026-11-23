const ranks = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'ascendant', 'immortal'];

function rankOrdinal(name) {
  const label = String(name || '').trim().toLowerCase();
  if (label === 'radiant') return ranks.length * 3;
  const match = /^(iron|bronze|silver|gold|platinum|diamond|ascendant|immortal)\s+([123])$/.exec(label);
  return match ? ranks.indexOf(match[1]) * 3 + Number(match[2]) - 1 : null;
}

function averageEnemyRank(tiers) {
  if (!Array.isArray(tiers) || tiers.length !== 5) return null;
  const values = tiers.map(rankOrdinal);
  return values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) / 5 : null;
}

function summarizeVisibleRankResults(rows, actId) {
  const groups = { higher: { games: 0, wins: 0 }, lower: { games: 0, wins: 0 } };
  if (!actId) return groups;
  for (const row of rows) {
    if (row.actId !== actId || typeof row.won !== 'boolean') continue;
    const own = rankOrdinal(row.tier);
    const opponents = averageEnemyRank(row.enemyTiers);
    if (own === null || opponents === null || opponents === own) continue;
    const group = opponents > own ? groups.higher : groups.lower;
    group.games++;
    if (row.won) group.wins++;
  }
  return groups;
}

module.exports = { rankOrdinal, averageEnemyRank, summarizeVisibleRankResults };
