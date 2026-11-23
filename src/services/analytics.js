// Each ratio uses only matches where both its numerator and denominator are known.
function summarizeSpendingEfficiency(matches) {
  const roundWins = { total: 0, credits: 0, matches: 0 };
  const damage = { total: 0, credits: 0, matches: 0 };

  for (const match of matches) {
    const { roundsPlayed, creditsPerRound, roundsWon, damageDealt } = match;
    if (!Number.isFinite(roundsPlayed) || roundsPlayed <= 0) continue;
    const credits = match.creditsSpentTotal ?? (
      Number.isFinite(creditsPerRound) ? creditsPerRound * roundsPlayed : null
    );
    if (!Number.isFinite(credits) || credits < 0) continue;

    if (Number.isInteger(roundsWon) && roundsWon >= 0 && roundsWon <= roundsPlayed) {
      roundWins.total += roundsWon;
      roundWins.credits += credits;
      roundWins.matches++;
    }
    if (Number.isFinite(damageDealt) && damageDealt >= 0) {
      damage.total += damageDealt;
      damage.credits += credits;
      damage.matches++;
    }
  }
  const rate = ({ total, credits, matches }) => credits > 0
    ? { perThousand: total * 1000 / credits, matches }
    : null;
  return { roundWins: rate(roundWins), damage: rate(damage) };
}

function summarizeObservedRR(matches, history) {
  const updates = new Map(history.filter((entry) => entry?.matchId && Number.isFinite(entry.rrChange))
    .map((entry) => [entry.matchId, entry]));
  const recent = matches.find((match) => match.completed !== false && match.seasonId);
  const groups = { wins: [], losses: [] };
  const seen = new Set();
  let count = 0;
  for (const match of matches) {
    if (!recent || match.seasonId !== recent.seasonId ||
        (recent.gameVersion && match.gameVersion !== recent.gameVersion) ||
        match.completed === false || typeof match.isWin !== 'boolean' ||
        !match.matchId || seen.has(match.matchId)) continue;
    seen.add(match.matchId);
    const update = updates.get(match.matchId);
    if (!update || update.placement || (update.queue && update.queue !== 'competitive')) continue;
    groups[match.isWin ? 'wins' : 'losses'].push(update.rrChange);
    count++;
  }
  const describe = (values) => values.length ? {
    games: values.length,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values), max: Math.max(...values),
  } : null;
  return { wins: describe(groups.wins), losses: describe(groups.losses), count,
    sameVersion: Boolean(recent?.gameVersion) };
}

module.exports = { summarizeSpendingEfficiency, summarizeObservedRR };
