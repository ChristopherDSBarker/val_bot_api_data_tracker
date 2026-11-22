const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

function hashPlayer(guild, puuid) {
  return createHash('sha256').update(JSON.stringify([guild, puuid])).digest('hex');
}

function createMatchStore(file) {
  const rows = new Map();
  const byPlayer = new Map();
  let ready;
  let pending = Promise.resolve();
  const playerKey = (row) => JSON.stringify([row.guild, row.player]);
  const matchKey = (row) => JSON.stringify([row.guild, row.player, row.matchId]);

  function index(row) {
    const key = matchKey(row);
    if (rows.has(key)) return;
    rows.set(key, row);
    const keyByPlayer = playerKey(row);
    if (!byPlayer.has(keyByPlayer)) byPlayer.set(keyByPlayer, []);
    byPlayer.get(keyByPlayer).push(row);
  }

  function load() {
    ready ||= fs.readFile(file, 'utf8').then((text) => {
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line);
          if (row?.guild && row.player && row.matchId) index(row);
        } catch {
          console.warn('[HISTORY] Skipped an unreadable match record.');
        }
      }
    }).catch((error) => {
      if (error.code !== 'ENOENT') {
        ready = undefined;
        throw error;
      }
    });
    return ready;
  }

  function recordAndRead(guild, puuid, matches) {
    const operation = pending.then(async () => {
      await load();
      const player = hashPlayer(guild, puuid);
      const fresh = new Map();
      for (const match of matches) {
        if (!match.matchId || !match.seasonId || !Number.isFinite(Date.parse(match.startedAt)) ||
          match.completed === false || typeof match.isWin !== 'boolean') continue;
        const row = {
          guild, player, matchId: match.matchId, actId: match.seasonId, startedAt: match.startedAt,
          won: match.isWin, map: match.map, agent: match.agent, role: match.role ?? null, tier: match.tier,
          acs: match.acsPerRound, adr: match.adrPerRound, roundsPlayed: match.roundsPlayed,
          kills: match.kills, deaths: match.deaths, assists: match.assists,
          damageDealt: match.damageDealt, credits: match.creditsSpentTotal,
          openedRounds: (match.roundResults || []).filter((round) => round.opened === true).length,
          openedRoundWins: (match.roundResults || []).filter((round) => round.opened === true && round.won === true).length,
          partyKnown: match.partyCheckComplete === true,
          party: [...new Set((match.teammates || []).filter((member) => member.sameParty === true && member.puuid)
            .map((member) => hashPlayer(guild, member.puuid)))],
        };
        const key = matchKey(row);
        if (!rows.has(key) && !fresh.has(key)) fresh.set(key, row);
      }
      if (fresh.size) {
        await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        // A leading newline keeps new rows readable after an interrupted append.
        await fs.appendFile(file, '\n' + [...fresh.values()].map((row) => JSON.stringify(row)).join('\n') + '\n', { mode: 0o600 });
        for (const row of fresh.values()) index(row);
      }
      return [...(byPlayer.get(playerKey({ guild, player })) || [])];
    });
    pending = operation.catch(() => {});
    return operation;
  }

  return { recordAndRead };
}

function historicalPartySplits(rows, guild, actId, partners) {
  if (!actId) return [];
  return partners.flatMap((partner) => {
    if (!partner.puuid) return [];
    const id = hashPlayer(guild, partner.puuid);
    const together = { games: 0, wins: 0 };
    const apart = { games: 0, wins: 0 };
    for (const row of rows) {
      if (row.actId !== actId || typeof row.won !== 'boolean') continue;
      const group = row.party?.includes(id) ? together : row.partyKnown === true ? apart : null;
      if (!group) continue;
      group.games++;
      if (row.won) group.wins++;
    }
    return together.games >= 5 && apart.games >= 10 ? [{ riotId: partner.riotId, together, apart }] : [];
  });
}

const matchStore = createMatchStore(path.join(__dirname, '../../data/matches.jsonl'));
module.exports = { matchStore, createMatchStore, historicalPartySplits };
