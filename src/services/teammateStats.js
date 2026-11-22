function tradesAfterDeath(match, playerId) {
  const credits = new Map();
  if (!playerId || !Array.isArray(match.kills) || match.kills.length === 0) return null;
  const events = match.kills;
  if (events.some((event) => !event?.killer?.puuid || !event?.victim?.puuid ||
    !Number.isFinite(event.round) || !Number.isFinite(event.time_in_round_in_ms))) return null;

  const ordered = events.slice().sort((a, b) => a.round - b.round ||
    a.time_in_round_in_ms - b.time_in_round_in_ms);
  for (let i = 0; i < ordered.length; i++) {
    const death = ordered[i];
    if (death.victim.puuid !== playerId) continue;
    for (let j = i + 1; j < ordered.length; j++) {
      const event = ordered[j];
      if (event.round !== death.round || event.time_in_round_in_ms - death.time_in_round_in_ms > 5000) break;
      if (event.time_in_round_in_ms <= death.time_in_round_in_ms || event.victim.puuid !== death.killer.puuid) continue;
      const id = event.killer.puuid;
      credits.set(id, (credits.get(id) || 0) + 1);
      break;
    }
  }
  return credits;
}

function partyId(player) {
  const id = typeof player?.party_id === 'string' ? player.party_id.trim() : '';
  return id && !/^0+$/.test(id.replaceAll('-', '')) ? id : null;
}

function sameParty(player, teammate) {
  const id = partyId(player);
  return id !== null && id === partyId(teammate);
}

function comparePartyResults(matches, partners) {
  const seen = new Set();
  return partners.map((partner) => {
    seen.clear();
    const withPartner = { wins: 0, games: 0 };
    const withoutPartner = { wins: 0, games: 0 };
    for (const match of matches) {
      if (!match.matchId || seen.has(match.matchId) || typeof match.isWin !== 'boolean') continue;
      seen.add(match.matchId);
      const roster = match.teammates || [];
      const member = roster.find((player) => (player.puuid || (player.name && player.tag
        ? `${player.name}#${player.tag}`.toLowerCase() : null)) === partner.key);
      const group = member?.sameParty === true ? withPartner
        : match.partyCheckComplete ? withoutPartner : null;
      if (!group) continue;
      group.games++;
      if (match.isWin) group.wins++;
    }
    return { ...partner, withPartner, withoutPartner };
  }).filter((row) => row.withPartner.games && row.withoutPartner.games);
}

function summarizeTeammates(matches, friend, { partyOnly = false } = {}) {
  const rows = new Map();
  const seen = new Set();
  for (const match of matches) {
    if (match.matchId && seen.has(match.matchId)) continue;
    if (match.matchId) seen.add(match.matchId);
    const counted = new Set();
    for (const teammate of match.teammates || []) {
      if (partyOnly && teammate.sameParty !== true) continue;
      const riotId = teammate.name && teammate.tag ? `${teammate.name}#${teammate.tag}` : null;
      const key = teammate.puuid || riotId?.toLowerCase();
      if (!key || counted.has(key)) continue;
      counted.add(key);
      const row = rows.get(key) || { key, riotId, puuid: teammate.puuid, agent: teammate.agent, games: 0, wins: 0, decided: 0, trades: 0, tradeGames: 0, roundDiff: 0, roundGames: 0 };
      row.games++;
      if (Number.isFinite(match.roundDiff)) {
        row.roundDiff += match.roundDiff;
        row.roundGames++;
      }
      if (typeof match.isWin === 'boolean') {
        row.decided++;
        if (match.isWin) row.wins++;
      }
      if (Number.isInteger(teammate.trades)) {
        row.tradeGames++;
        row.trades += teammate.trades;
      }
      row.friend ||= Boolean(friend && riotId?.toLowerCase() === friend.toLowerCase());
      rows.set(key, row);
    }
  }
  return [...rows.values()].filter((row) => row.riotId && (partyOnly || row.games > 1 || row.friend))
    .sort((a, b) => Number(b.friend) - Number(a.friend) || b.games - a.games || a.riotId.localeCompare(b.riotId));
}

module.exports = { tradesAfterDeath, summarizeTeammates, sameParty, partyId, comparePartyResults };
