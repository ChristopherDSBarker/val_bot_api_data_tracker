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

module.exports = { summarizeSpendingEfficiency };
