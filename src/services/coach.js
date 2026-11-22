function knownRoundRecord(rounds, opened) {
  const eligible = rounds.filter((round) => round.opened === opened && typeof round.won === 'boolean');
  return { total: eligible.length, won: eligible.filter((round) => round.won).length };
}

function earlierOpeningRecord(matches, latest) {
  const started = Date.parse(latest.startedAt);
  if (!latest.matchId || !latest.seasonId || !latest.role || !Number.isFinite(started)) return null;
  const seen = new Set([latest.matchId]);
  let wins = 0;
  let rounds = 0;
  let games = 0;
  for (const match of matches) {
    const date = Date.parse(match.startedAt);
    if (!match.matchId || seen.has(match.matchId) || match.completed === false ||
        match.role !== latest.role || match.seasonId !== latest.seasonId ||
        !Number.isFinite(date) || date >= started) continue;
    seen.add(match.matchId);
    const known = (match.roundResults || []).filter((round) => typeof round.playerGotFirstKill === 'boolean');
    if (!known.length) continue;
    games++;
    rounds += known.length;
    wins += known.filter((round) => round.playerGotFirstKill).length;
  }
  return games >= 2 && rounds >= 10 ? { firstKills: wins, rounds, games } : null;
}

function reviewLatestMatch(matches) {
  // Keep the same newest-first order as the profile and match log.
  const match = matches.find((entry) => entry.completed !== false && typeof entry.isWin === 'boolean');
  if (!match) return null;

  const rounds = match.roundResults || [];
  const opened = knownRoundRecord(rounds, true);
  const conceded = knownRoundRecord(rounds, false);
  const personal = rounds.filter((round) => typeof round.playerGotFirstKill === 'boolean');
  const personalFirstKills = personal.filter((round) => round.playerGotFirstKill).length;
  const score = [match.roundsWon, match.roundsLost].every(Number.isInteger)
    ? `${match.roundsWon}–${match.roundsLost}` : null;
  let practice = 'Pick one lost round. Check where your nearest teammate was before the first fight.';
  if (opened.total >= 4 && opened.won * 2 <= opened.total) {
    practice = 'Review two rounds you lost after the first kill. Check whether your team regrouped or took separate fights.';
  } else if (conceded.total >= 4 && conceded.won * 2 <= conceded.total) {
    practice = 'Review two rounds where the opponent got the first kill. Check if you could trade safely or regroup.';
  }

  // Roles suggest a replay question, even when a player used a different team assignment.
  const roleQuestions = {
    Duelist: 'On attack, check one first fight. Was a teammate close enough to trade if you fell?',
    Initiator: 'Check one attack entry. Did your utility land before the teammate taking first contact?',
    Controller: 'Check one attack entry. Were the key sightlines blocked when your teammates crossed?',
    Sentinel: 'Check one defense round. Did your setup give you a safe way to fall back or play for retake?',
  };
  if (opened.total + conceded.total >= 10 && roleQuestions[match.role]) {
    practice = roleQuestions[match.role];
  }

  return { match, score, opened, conceded, personalFirstKills, personalCoverage: personal.length,
    openingBaseline: personal.length >= 10 ? earlierOpeningRecord(matches, match) : null, practice };
}

function latestSession(matches, history) {
  const sorted = matches.filter((match) => match.matchId && match.completed !== false &&
    Number.isFinite(Date.parse(match.startedAt)))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const session = [];
  const seen = new Set();
  for (const match of sorted) {
    if (seen.has(match.matchId)) continue;
    const newer = session.at(-1);
    const duration = Number.isFinite(match.durationMs) && match.durationMs > 0 ? match.durationMs : 0;
    const gap = newer ? Date.parse(newer.startedAt) - Date.parse(match.startedAt) - duration : 0;
    if (gap > 90 * 60 * 1000) break;
    session.push(match);
    seen.add(match.matchId);
  }
  if (session.length < 2) return null;
  const results = session.filter(({ isWin }) => typeof isWin === 'boolean');
  const updates = new Map(history.filter((entry) => entry?.matchId && Number.isFinite(entry.rrChange))
    .map((entry) => [entry.matchId, entry.rrChange]));
  const changes = session.filter((match) => updates.has(match.matchId)).map((match) => updates.get(match.matchId));
  return {
    games: session.length, known: results.length, wins: results.filter((match) => match.isWin).length,
    rrCoverage: changes.length, netRR: changes.reduce((sum, change) => sum + change, 0),
  };
}

module.exports = { reviewLatestMatch, latestSession };
