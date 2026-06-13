/**
 * Valorant API service - handles both real API and mock data
 */

const axios = require('axios');
const Cache = require('../utils/cache.js');

const cache = new Cache(5); // 5 minute TTL
const API_BASE_URL = 'https://api.henrikdev.xyz';
const EXPERIMENTAL_TIMEOUT_MS = 4000;

/**
 * Mock player profile data (Tracker.gg style reference)
 */
const MOCK_PROFILE = {
  riotId: 'SongSiDiYa#NA1',
  region: 'na',
  currentRank: 'Platinum 1',
  peakRank: 'Platinum 2',
  level: 263,
  wins: 23,
  losses: 20,
  kills: 686,
  deaths: 703,
  assists: 205,
  kdRatio: 0.98,
  adrPerRound: 144.4,
  acsPerRound: 218.1,
  headshotPercent: 15.9,
  kastPercent: null,
  damageDeltaPerRound: null,
  winPercent: 52.3,
  topAgents: ['Veto', 'Jett', 'Raze'],
  damageAdjustment: null,
  matchesAnalyzed: 10,
};

/**
 * Mock MMR data
 */
const MOCK_MMR = {
  name: 'SongSiDiYa',
  tag: 'NA1',
  region: 'na',
  platform: 'pc',
  currentRank: 'Platinum 1',
  currentTierId: 18,
  currentRR: 75,
  lastRRChange: 19,
  elo: 1150,
  gamesNeededForRating: 0,
  leaderboardRank: null,
  peakRank: 'Platinum 2',
  peakSeason: 'e11a3',
  seasonalCount: 0,
  rawAvailable: true,
};

/**
 * Mock recent matches data
 */
const MOCK_RECENT_MATCHES = [
  {
    agent: 'Jett',
    map: 'Ascent',
    roundsWon: 13,
    roundsLost: 7,
    isWin: true,
    kills: 18,
    deaths: 12,
    assists: 3,
    kdRatio: 1.5,
    acsPerRound: 245.3,
    headshotPercent: 18.5,
    damageAdjustment: 8,
    matchDate: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    agent: 'Veto',
    map: 'Icebox',
    roundsWon: 11,
    roundsLost: 13,
    isWin: false,
    kills: 16,
    deaths: 15,
    assists: 7,
    kdRatio: 1.07,
    acsPerRound: 198.5,
    headshotPercent: 12.3,
    damageAdjustment: -2,
    matchDate: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    agent: 'Raze',
    map: 'Split',
    roundsWon: 13,
    roundsLost: 10,
    isWin: true,
    kills: 20,
    deaths: 14,
    assists: 4,
    kdRatio: 1.43,
    acsPerRound: 267.8,
    headshotPercent: 14.2,
    damageAdjustment: 12,
    matchDate: new Date(Date.now() - 10800000).toISOString(),
  },
  {
    agent: 'Jett',
    map: 'Haven',
    roundsWon: 13,
    roundsLost: 9,
    isWin: true,
    kills: 19,
    deaths: 10,
    assists: 5,
    kdRatio: 1.9,
    acsPerRound: 256.4,
    headshotPercent: 19.8,
    damageAdjustment: 10,
    matchDate: new Date(Date.now() - 14400000).toISOString(),
  },
  {
    agent: 'Veto',
    map: 'Bind',
    roundsWon: 13,
    roundsLost: 11,
    isWin: true,
    kills: 17,
    deaths: 13,
    assists: 6,
    kdRatio: 1.31,
    acsPerRound: 223.6,
    headshotPercent: 16.1,
    damageAdjustment: 3,
    matchDate: new Date(Date.now() - 18000000).toISOString(),
  },
];

/**
 * Mock MMR history data (RR changes)
 */
const MOCK_MMR_HISTORY = [
  { rr_change: 22 },
  { rr_change: -8 },
  { rr_change: 18 },
  { rr_change: -5 },
  { rr_change: 25 },
];

/**
 * Mock account data
 */
const MOCK_ACCOUNT = {
  name: 'SongSiDiYa',
  tag: 'NA1',
  puuid: 'mock-puuid-123',
  account_level: 263,
  region: 'na',
  card: { wide: 'https://media.valorantapi.com/playercards/wide/random.png' },
};

/**
 * Validate region input
 * @param {string} region
 * @returns {boolean}
 */
function isValidRegion(region) {
  const validRegions = ['na', 'eu', 'br', 'latam', 'kr', 'jp', 'ap'];
  return validRegions.includes(region.toLowerCase());
}

/**
 * Safe number coercion with fallback
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return isNaN(num) ? fallback : num;
}

/**
 * Safe number coercion for optional stats where missing should stay unavailable.
 * @param {*} value
 * @returns {number|null}
 */
function safeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function firstOptionalNumber(...values) {
  for (const value of values) {
    const num = safeOptionalNumber(value);
    if (num !== null) return num;
  }

  return null;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text.length > 0) return text;
  }

  return null;
}

/**
 * Average numeric samples, or null when no grounded samples exist.
 * @param {number[]} values
 * @returns {number|null}
 */
function averageSamples(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isExperimentalValorantPipelineEnabled() {
  return process.env.ENABLE_EXPERIMENTAL_VALORANT_PIPELINE === 'true';
}

function isValorantApiDebugEnabled() {
  return process.env.DEBUG_VALORANT_API === 'true';
}

function logExperimentalFailure(label, error) {
  const status = error?.response?.status || 'n/a';
  const message = error?.message || 'unknown error';
  console.warn(`[EXPERIMENTAL_VALORANT] ${label} failed status=${status} message=${message}`);
}

async function experimentalGet(label, url, apiKey) {
  try {
    const response = await axios.get(url, {
      headers: { Authorization: apiKey },
      timeout: EXPERIMENTAL_TIMEOUT_MS,
    });
    console.log(`[EXPERIMENTAL_VALORANT] ${label} ok`);
    return response.data;
  } catch (error) {
    logExperimentalFailure(label, error);
    return null;
  }
}

function normalizeExperimentalAccount(data) {
  const account = data?.data || data || {};
  const rawCard = account.card || account.player_card || null;
  const card = typeof rawCard === 'string' ? { small: rawCard } : rawCard;
  const accountLevel = account.account_level ?? account.accountLevel ?? account.level ?? null;
  const puuid = account.puuid || account.account?.puuid || null;

  if (!puuid && !card && accountLevel === null) return null;

  return {
    name: account.name || account.gameName || account.game_name || account.account?.name || null,
    tag: account.tag || account.tagLine || account.tagline || account.account?.tag || null,
    puuid,
    account_level: accountLevel,
    card,
  };
}

function normalizeExperimentalMMR(data) {
  const mmr = data?.data || data;
  if (!mmr) return null;

  const normalized = {
    currentRank: mmr.current?.tier?.name || null,
    currentRR: safeOptionalNumber(mmr.current?.rr),
    elo: safeOptionalNumber(mmr.current?.elo),
    peakRank: mmr.peak?.tier?.name || null,
  };

  if (!normalized.currentRank) return null;
  return normalized;
}

function getPayloadKeys(data) {
  const value = Array.isArray(data) ? data : data?.data || data;
  if (!value || typeof value !== 'object') return 'none';
  return Object.keys(value).slice(0, 8).join(',') || 'none';
}

function keySummary(value) {
  if (!value || typeof value !== 'object') return 'none';
  return Object.keys(value).slice(0, 12).join(',') || 'none';
}

function extractExperimentalMatches(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.matches)) return data.data.matches;
  if (Array.isArray(data?.data?.items)) return data.data.items;
  if (Array.isArray(data?.matches)) return data.matches;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function getDamageRelatedKeys(player) {
  const keys = new Set();
  const stats = player?.stats || {};
  const damage = player?.damage || {};

  for (const key of Object.keys(player || {})) {
    if (key.toLowerCase().includes('damage')) keys.add(key);
  }

  for (const key of Object.keys(stats)) {
    if (key.toLowerCase().includes('damage')) keys.add(`stats.${key}`);
  }

  for (const key of Object.keys(damage)) {
    keys.add(`damage.${key}`);
  }

  return Array.from(keys).slice(0, 12).join(',') || 'none';
}

function logExperimentalV4Shape(label, data) {
  if (!isValorantApiDebugEnabled() || data === null || data === undefined) return;

  const root = data?.data ?? data;
  const rootIsArray = Array.isArray(root);
  const rootLength = rootIsArray ? root.length : 'n/a';
  console.log(`[EXPERIMENTAL_VALORANT] ${label} root isArray=${rootIsArray} length=${rootLength} keys=${keySummary(root)}`);

  if (Array.isArray(data?.data)) {
    console.log(`[EXPERIMENTAL_VALORANT] ${label} data.data isArray=true length=${data.data.length}`);
  } else if (data?.data && typeof data.data === 'object') {
    console.log(`[EXPERIMENTAL_VALORANT] ${label} data.data isArray=false keys=${keySummary(data.data)}`);
  }

  const firstMatch = extractExperimentalMatches(data)[0];
  if (!firstMatch || typeof firstMatch !== 'object') return;

  console.log(`[EXPERIMENTAL_VALORANT] ${label} first keys=${keySummary(firstMatch)}`);
  console.log(`[EXPERIMENTAL_VALORANT] ${label} metadata keys=${keySummary(firstMatch.metadata)}`);
  console.log(`[EXPERIMENTAL_VALORANT] ${label} players keys=${keySummary(firstMatch.players)}`);
  console.log(`[EXPERIMENTAL_VALORANT] ${label} teams keys=${keySummary(firstMatch.teams)}`);

  const firstPlayer = getAllPlayers(firstMatch)[0];
  if (!firstPlayer || typeof firstPlayer !== 'object') return;

  console.log(`[EXPERIMENTAL_VALORANT] ${label} first player keys=${keySummary(firstPlayer)}`);
  console.log(`[EXPERIMENTAL_VALORANT] ${label} stats keys=${keySummary(firstPlayer.stats)}`);
  console.log(`[EXPERIMENTAL_VALORANT] ${label} damage keys=${getDamageRelatedKeys(firstPlayer)}`);
}

function isUsableNormalizedMatch(match) {
  if (!match) return false;
  const hasKda = match.kills !== null && match.deaths !== null && match.assists !== null;
  const hasRounds = match.roundsPlayed !== null;
  const hasScore = match.scoreProven === true;
  const hasDamage = match.damageDealt !== null || match.damageReceived !== null;
  return hasKda || hasRounds || hasScore || hasDamage;
}

function normalizeExperimentalMatches(data, name, tag, puuid) {
  const rawMatches = extractExperimentalMatches(data).slice(0, 10);
  const normalized = rawMatches
    .map((match) => {
      try {
        if (!match || typeof match !== 'object') return null;
        const player = findPlayerInMatch(match, name, tag, puuid);
        if (!player) return null;
        const normalizedMatch = normalizeMatch(match, player);
        return isUsableNormalizedMatch(normalizedMatch) ? normalizedMatch : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (normalized.length < 3) {
    console.warn(
      `[EXPERIMENTAL_VALORANT] v4-match rejected reason=insufficient-normalized-matches count=${normalized.length} keys=${getPayloadKeys(data)}`
    );
    return null;
  }

  return normalized;
}

async function getExperimentalValorantEnhancements({ region, name, tag, stableProfile = null, stableMMR = null, stableRecentMatches = [] }) {
  if (!isExperimentalValorantPipelineEnabled()) return null;

  try {
    const apiKey = process.env.HENRIK_API_KEY;
    if (!apiKey) return null;

    const encodedName = encodeURIComponent(name);
    const encodedTag = encodeURIComponent(tag);
    const enhancements = {
      account: null,
      mmr: null,
      matches: null,
      storedMatches: null,
      damageDelta: null,
      used: [],
      rejected: [],
    };

    const accountData = await experimentalGet(
      'account-v2',
      `${API_BASE_URL}/valorant/v2/account/${encodedName}/${encodedTag}`,
      apiKey
    );
    enhancements.account = normalizeExperimentalAccount(accountData);
    const puuid = enhancements.account?.puuid || null;

    if (puuid) {
      const encodedPuuid = encodeURIComponent(puuid);
      const puuidMmrData = await experimentalGet(
        'mmr-v3-puuid',
        `${API_BASE_URL}/valorant/v3/by-puuid/mmr/${region}/pc/${encodedPuuid}`,
        apiKey
      );
      enhancements.mmr = normalizeExperimentalMMR(puuidMmrData);
      if (enhancements.mmr && stableMMR?.currentRank && enhancements.mmr.currentRank !== stableMMR.currentRank) {
        enhancements.rejected.push('mmr-v3-puuid-rank-mismatch');
        enhancements.mmr = null;
      }
    }

    const v4Candidates = [];
    if (puuid) {
      v4Candidates.push({
        label: 'v4-match-puuid',
        url: `${API_BASE_URL}/valorant/v4/by-puuid/matches/${region}/pc/${encodeURIComponent(puuid)}?mode=competitive&size=10`,
      });
    }
    v4Candidates.push({
      label: 'v4-match-riot-id',
      url: `${API_BASE_URL}/valorant/v4/matches/${region}/pc/${encodedName}/${encodedTag}?mode=competitive&size=10`,
    });

    for (const candidate of v4Candidates) {
      const data = await experimentalGet(candidate.label, candidate.url, apiKey);
      logExperimentalV4Shape(candidate.label, data);
      const matches = normalizeExperimentalMatches(data, name, tag, puuid);
      if (matches) {
        enhancements.matches = matches;
        enhancements.damageDelta = summarizeDamageDeltaFromNormalizedMatches(matches, candidate.label);
        enhancements.used.push(candidate.label);
        console.log(`[EXPERIMENTAL_VALORANT] ${candidate.label} accepted count=${matches.length}`);
        break;
      }
      enhancements.rejected.push(candidate.label);
    }

    const stableHasMatches = Array.isArray(stableRecentMatches) && stableRecentMatches.length > 0;
    if (!stableHasMatches && !enhancements.matches) {
      const storedData = await experimentalGet(
        'stored-match-riot-id',
        `${API_BASE_URL}/valorant/v1/stored-matches/${region}/${encodedName}/${encodedTag}?mode=competitive&size=10`,
        apiKey
      );
      const storedMatches = normalizeExperimentalMatches(storedData, name, tag, puuid);
      if (storedMatches) {
        enhancements.storedMatches = storedMatches.map((match) => ({ ...match, dataSource: 'Stored fallback' }));
        enhancements.damageDelta = summarizeDamageDeltaFromNormalizedMatches(enhancements.storedMatches, 'stored-match-riot-id');
        enhancements.used.push('stored-match-riot-id');
      } else {
        enhancements.rejected.push('stored-match-riot-id');
      }
    }

    console.log(
      `[EXPERIMENTAL_VALORANT] sidecar complete used=${enhancements.used.join(',') || 'none'} rejected=${enhancements.rejected.join(',') || 'none'} stableProfile=${Boolean(stableProfile)}`
    );
    return enhancements;
  } catch (error) {
    logExperimentalFailure('sidecar', error);
    return null;
  }
}

function getAllPlayers(match) {
  const players = match?.players;

  if (Array.isArray(players)) return players;

  if (Array.isArray(players?.all_players)) return players.all_players;
  if (Array.isArray(players?.all)) return players.all;
  if (Array.isArray(players?.players)) return players.players;

  if (Array.isArray(players?.red) || Array.isArray(players?.blue)) {
    return [
      ...(Array.isArray(players.red) ? players.red : []),
      ...(Array.isArray(players.blue) ? players.blue : []),
    ];
  }

  return [];
}

function getPlayerTeam(player) {
  return player?.team
    || player?.team_id
    || player?.teamId
    || player?.team_name
    || player?.teamName
    || null;
}

function normalizeTeamKey(team) {
  if (!team) return null;
  return String(team).trim().toLowerCase();
}

function getTeamEntries(match) {
  const teams = match?.teams;
  if (!teams || typeof teams !== 'object') return [];

  if (Array.isArray(teams)) {
    return teams.map((team) => ({
      key: normalizeTeamKey(team?.team_id || team?.teamId || team?.team || team?.name || team?.color),
      team,
    }));
  }

  return Object.entries(teams).map(([key, team]) => ({
    key: normalizeTeamKey(team?.team_id || team?.teamId || team?.team || team?.name || team?.color || key),
    team,
  }));
}

function getTeamByKey(match, teamKey) {
  const normalizedTeam = normalizeTeamKey(teamKey);
  if (!normalizedTeam) return null;

  const directTeam = match?.teams?.[teamKey] || match?.teams?.[normalizedTeam];
  if (directTeam) return directTeam;

  const entry = getTeamEntries(match).find(({ key }) => key === normalizedTeam);
  return entry?.team || null;
}

function getOpponentTeamKey(match, teamKey) {
  const normalizedTeam = normalizeTeamKey(teamKey);
  if (!normalizedTeam) return null;

  if (normalizedTeam === 'red') return 'blue';
  if (normalizedTeam === 'blue') return 'red';

  const entries = getTeamEntries(match).filter(({ key }) => key);
  if (entries.length !== 2) return null;

  const opponent = entries.find(({ key }) => key !== normalizedTeam);
  return opponent?.key || null;
}

function getTeamRoundScore(match, teamKey) {
  const team = getTeamByKey(match, teamKey);
  if (!team) return null;

  return firstOptionalNumber(
    team.rounds_won,
    team.roundsWon,
    team.rounds?.won,
    team.score
  );
}

function getTeamWin(match, teamKey) {
  const team = getTeamByKey(match, teamKey);
  if (!team) return null;

  const value = team.has_won ?? team.hasWon ?? team.won ?? team.is_winner ?? team.isWinner;
  return typeof value === 'boolean' ? value : null;
}

function getMapName(metadata) {
  return firstText(
    metadata?.map?.name,
    metadata?.map,
    metadata?.map_name,
    metadata?.mapName
  );
}

function getAgentName(player) {
  return firstText(
    player?.character,
    player?.agent?.name,
    player?.agent,
    player?.agent_name,
    player?.agentName
  );
}

/**
 * Determine rounds played from HenrikDev match data.
 * @param {object} match
 * @returns {number|null}
 */
function getRoundsPlayed(match) {
  const metadata = match?.metadata || {};
  const metadataRounds = [
    metadata.rounds_played,
    metadata.rounds,
  ];

  for (const value of metadataRounds) {
    const rounds = safeOptionalNumber(value);
    if (rounds && rounds > 0) return rounds;
  }

  if (Array.isArray(match?.rounds) && match.rounds.length > 0) {
    return match.rounds.length;
  }

  const teamRounds = getTeamEntries(match)
    .map(({ team }) => firstOptionalNumber(
      team?.rounds_won,
      team?.roundsWon,
      team?.rounds?.won,
      team?.score
    ))
    .filter((rounds) => rounds !== null);

  if (teamRounds.length >= 2) {
    const totalRounds = teamRounds.reduce((sum, rounds) => sum + rounds, 0);
    if (totalRounds > 0) return totalRounds;
  }

  return null;
}

/**
 * Get total damage made from known HenrikDev player fields.
 * @param {object} player
 * @returns {number|null}
 */
function getDamageMade(player) {
  const stats = player?.stats || {};
  const damage = player?.damage || {};
  const candidates = [
    player?.damage_made,
    player?.damageMade,
    player?.damage_made_total,
    player?.damageMadeTotal,
    damage.made,
    damage.damage_made,
    stats.damage_made,
    stats.damageMade,
    stats.damage_made_total,
    stats.damageMadeTotal,
    stats.damage?.made,
    stats.damage,
  ];

  for (const value of candidates) {
    const totalDamage = safeOptionalNumber(value);
    if (totalDamage !== null) return totalDamage;
  }

  return null;
}

/**
 * Get total damage received from known HenrikDev player fields.
 * @param {object} player
 * @returns {number|null}
 */
function getDamageReceived(player) {
  const stats = player?.stats || {};
  const damage = player?.damage || {};
  const candidates = [
    player?.damage_received,
    player?.damageReceived,
    player?.damage_received_total,
    player?.damageReceivedTotal,
    damage.received,
    damage.damage_received,
    stats.damage_received,
    stats.damageReceived,
    stats.damage_received_total,
    stats.damageReceivedTotal,
    stats.damage?.received,
  ];

  for (const value of candidates) {
    const totalDamage = safeOptionalNumber(value);
    if (totalDamage !== null) return totalDamage;
  }

  return null;
}

/**
 * Find target player in a match's all_players array
 * @param {object} match - HenrikDev match object
 * @param {string} name - Player name (game_name)
 * @param {string} tag - Player tag (tagline)
 * @param {string} puuid - Optional player puuid for more precise matching
 * @returns {object|null}
 */
function findPlayerInMatch(match, name, tag, puuid) {
  const allPlayers = getAllPlayers(match);
  if (allPlayers.length === 0) {
    return null;
  }

  // If puuid provided, use it (most reliable)
  if (puuid) {
    const byPuuid = allPlayers.find((p) => p.puuid === puuid);
    if (byPuuid) return byPuuid;
  }

  // Fall back to name/tag matching
  const normalizedName = String(name).toLowerCase();
  const normalizedTag = String(tag).toLowerCase();
  const byNameTag = allPlayers.find((p) => {
    const playerName = p.name || p.gameName || p.game_name || p.account?.name;
    const playerTag = p.tag || p.tagLine || p.tagline || p.account?.tag;
    return String(playerName).toLowerCase() === normalizedName
      && String(playerTag).toLowerCase() === normalizedTag;
  });
  return byNameTag || null;
}

/**
 * Normalize a match into our internal format
 * @param {object} match - HenrikDev match
 * @param {object} player - Player object from the match
 * @returns {object}
 */
function normalizeMatch(match, player) {
  if (!match || !player) return null;

  const metadata = match.metadata || {};
  const stats = player.stats || {};
  const playerTeam = getPlayerTeam(player);
  const playerTeamKey = normalizeTeamKey(playerTeam);
  const enemyTeamKey = getOpponentTeamKey(match, playerTeamKey);
  const isWin = getTeamWin(match, playerTeamKey);
  const roundsPlayed = getRoundsPlayed(match);

  // Extract actual team round scores (not total rounds)
  const playerRounds = getTeamRoundScore(match, playerTeamKey);
  const enemyRounds = enemyTeamKey ? getTeamRoundScore(match, enemyTeamKey) : null;
  const scoreProven = playerRounds !== null && enemyRounds !== null;
  const roundsWon = scoreProven ? playerRounds : null;
  const roundsLost = scoreProven ? enemyRounds : null;

  // Calculate totals
  const headshots = safeOptionalNumber(stats.headshots ?? player.headshots) || 0;
  const bodyshots = safeOptionalNumber(stats.bodyshots ?? player.bodyshots) || 0;
  const legshots = safeOptionalNumber(stats.legshots ?? player.legshots) || 0;
  const totalShots = bodyshots + headshots + legshots;
  const headshotPercent = totalShots > 0 ? (headshots / totalShots) * 100 : null;
  const kills = firstOptionalNumber(stats.kills, player.kills);
  const deaths = firstOptionalNumber(stats.deaths, player.deaths);
  const assists = firstOptionalNumber(stats.assists, player.assists);
  const score = firstOptionalNumber(stats.score, player.score);
  const directAcs = firstOptionalNumber(stats.acs, player.acs);
  const directAdr = firstOptionalNumber(stats.adr, player.adr);
  const damageMade = getDamageMade(player);
  const damageReceived = getDamageReceived(player);
  const acsPerRound = directAcs !== null
    ? directAcs
    : score !== null && roundsPlayed
      ? score / roundsPlayed
      : null;
  const adrPerRound = directAdr !== null
    ? directAdr
    : damageMade !== null && roundsPlayed
      ? damageMade / roundsPlayed
      : null;

  return {
    agent: getAgentName(player),
    map: getMapName(metadata),
    roundsWon,
    roundsLost,
    isWin,
    kills,
    deaths,
    assists,
    kdRatio: kills !== null && deaths !== null ? (deaths > 0 ? kills / deaths : kills) : null,
    acsPerRound,
    adrPerRound,
    headshotPercent,
    damageDealt: damageMade,
    damageReceived,
    roundsPlayed,
    damageAdjustment: null,
    matchDate: firstText(metadata.game_start_patched, metadata.game_start, metadata.started_at, metadata.start_time)
      || new Date().toISOString(),
    scoreProven,
    roundDiff: scoreProven ? roundsWon - roundsLost : null,
  };
}

/**
 * Aggregate stats from multiple matches
 * @param {array} matches - Array of HenrikDev match objects
 * @param {string} name - Player name
 * @param {string} tag - Player tag
 * @param {string} puuid - Optional player puuid
 * @returns {object}
 */
function aggregateStatsFromMatches(matches, name, tag, puuid) {
  let wins = 0,
    losses = 0;
  let kills = 0,
    deaths = 0,
    assists = 0;
  let totalHeadshots = 0,
    totalShots = 0;
  let totalScore = 0;
  let totalDamage = 0;
  let totalRounds = 0;
  let matchesAnalyzed = 0;
  let totalDamageDealtForDelta = 0;
  let totalDamageReceivedForDelta = 0;
  let totalRoundsForDelta = 0;
  let damageDeltaCompleteMatches = 0;
  const acsSamples = [];
  const adrSamples = [];
  const kastSamples = [];
  const agents = {};

  if (!matches || !Array.isArray(matches)) {
    console.log('[API] No matches provided for aggregation');
    return null;
  }

  for (const match of matches) {
    const player = findPlayerInMatch(match, name, tag, puuid);
    if (!player) {
      console.log(`[API] Player not found in match`);
      continue;
    }

    matchesAnalyzed++;
    const stats = player.stats || {};
    const isWin = getTeamWin(match, getPlayerTeam(player));
    const roundsPlayed = getRoundsPlayed(match);

    if (isWin === true) {
      wins++;
    } else if (isWin === false) {
      losses++;
    }

    const k = safeNumber(stats.kills, 0);
    const d = safeNumber(stats.deaths, 0);
    const a = safeNumber(stats.assists, 0);

    kills += k;
    deaths += d;
    assists += a;

    const hs = safeNumber(stats.headshots, 0);
    const bs = safeNumber(stats.bodyshots, 0);
    const ls = safeNumber(stats.legshots, 0);

    totalHeadshots += hs;
    totalShots += hs + bs + ls;

    const score = safeOptionalNumber(stats.score);
    const damageMade = getDamageMade(player);
    const damageReceived = getDamageReceived(player);
    const directAcs = safeOptionalNumber(stats.acs);
    const directAdr = safeOptionalNumber(stats.adr);
    const directKast = safeOptionalNumber(stats.kast ?? player.kast);

    if (roundsPlayed !== null) {
      totalRounds += roundsPlayed;
    }

    if (score !== null) {
      totalScore += score;
    }

    if (damageMade !== null) {
      totalDamage += damageMade;
    }

    if (damageMade !== null && damageReceived !== null && roundsPlayed !== null && roundsPlayed > 0) {
      totalDamageDealtForDelta += damageMade;
      totalDamageReceivedForDelta += damageReceived;
      totalRoundsForDelta += roundsPlayed;
      damageDeltaCompleteMatches++;
    }

    if (directAcs !== null) {
      acsSamples.push(directAcs);
    }

    if (directAdr !== null) {
      adrSamples.push(directAdr);
    }

    if (directKast !== null) {
      kastSamples.push(directKast);
    }

    // Track top agents
    const agent = player.character || 'Unknown';
    agents[agent] = (agents[agent] || 0) + 1;
  }

  const total = wins + losses;
  const kdRatio = deaths > 0 ? kills / deaths : kills;
  const winPercent = total > 0 ? (wins / total) * 100 : 0;
  const headshotPercent = totalShots > 0 ? (totalHeadshots / totalShots) * 100 : 0;

  // Get top agents sorted by play count
  const topAgents = Object.entries(agents)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((entry) => entry[0]);

  const directAcs = averageSamples(acsSamples);
  const directAdr = averageSamples(adrSamples);
  const directKast = averageSamples(kastSamples);

  const acsPerRound = directAcs !== null
    ? directAcs
    : totalScore > 0 && totalRounds > 0
      ? totalScore / totalRounds
      : null;

  const adrPerRound = directAdr !== null
    ? directAdr
    : totalDamage > 0 && totalRounds > 0
      ? totalDamage / totalRounds
      : null;

  // KAST requires per-round kill/assist/survive/trade data.
  // If HenrikDev does not expose those fields, we intentionally leave it as N/A.
  const kastPercent = directKast !== null ? directKast : null;
  const damageDeltaPerRound = damageDeltaCompleteMatches >= 3 && totalRoundsForDelta > 0
    ? Math.round((totalDamageDealtForDelta - totalDamageReceivedForDelta) / totalRoundsForDelta)
    : null;
  const damageDeltaMissingReason = damageDeltaPerRound === null
    ? `need 3 complete damage matches; found ${damageDeltaCompleteMatches}`
    : null;

  return {
    wins,
    losses,
    kills,
    deaths,
    assists,
    kdRatio: kdRatio.toFixed(2),
    headshotPercent: headshotPercent.toFixed(1),
    winPercent: winPercent.toFixed(1),
    acsPerRound,
    adrPerRound,
    kastPercent,
    damageDeltaPerRound,
    damageDeltaSource: damageDeltaPerRound !== null ? 'stable-v3' : null,
    damageDeltaCompleteMatches,
    damageDeltaMissingReason,
    topAgents,
    matchesAnalyzed,
  };
}

function summarizeDamageDeltaFromNormalizedMatches(matches, source) {
  let totalDamageDealt = 0;
  let totalDamageReceived = 0;
  let totalRounds = 0;
  let completeMatches = 0;

  for (const match of Array.isArray(matches) ? matches : []) {
    const damageDealt = safeOptionalNumber(match?.damageDealt);
    const damageReceived = safeOptionalNumber(match?.damageReceived);
    const roundsPlayed = safeOptionalNumber(match?.roundsPlayed);

    if (damageDealt === null || damageReceived === null || roundsPlayed === null || roundsPlayed <= 0) {
      continue;
    }

    totalDamageDealt += damageDealt;
    totalDamageReceived += damageReceived;
    totalRounds += roundsPlayed;
    completeMatches++;
  }

  if (completeMatches < 3 || totalRounds <= 0) {
    return {
      value: null,
      source: null,
      completeMatches,
      missingReason: `need 3 complete damage matches; found ${completeMatches}`,
    };
  }

  return {
    value: Math.round((totalDamageDealt - totalDamageReceived) / totalRounds),
    source,
    completeMatches,
    missingReason: null,
  };
}

/**
 * Get player profile from mock data or API
 * @param {string} name
 * @param {string} tag
 * @param {string} region
 * @returns {Promise<object>}
 */
async function getPlayerProfile(name, tag, region = 'na') {
  try {
    // Validate region
    if (!isValidRegion(region)) {
      throw new Error(`Invalid region: ${region}. Valid regions: na, eu, br, latam, kr, jp, ap`);
    }

    // Check cache
    const cacheKey = `profile_${name.toLowerCase()}_${tag.toUpperCase()}_${region}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[CACHE HIT] Profile for ${name}#${tag}`);
      return cached;
    }

    // Use mock data if enabled
    if (process.env.USE_MOCK_DATA === 'true') {
      console.log('[MOCK DATA] Returning mock profile for', `${name}#${tag}`);
      const mockData = { ...MOCK_PROFILE, region };
      cache.set(cacheKey, mockData);
      return mockData;
    }

    // Call real API
    const apiKey = process.env.HENRIK_API_KEY;
    if (!apiKey) {
      console.warn(
        '[WARNING] No API key found. Set HENRIK_API_KEY in .env or enable USE_MOCK_DATA=true'
      );
      return null;
    }

    // Fetch account info
    const accountUrl = `https://api.henrikdev.xyz/valorant/v1/account/${name}/${tag}`;
    console.log(`[API] GET account endpoint for ${name}#${tag}`);

    const accountResponse = await axios.get(accountUrl, {
      headers: { Authorization: apiKey },
      timeout: 10000,
    });

    if (!accountResponse.data || !accountResponse.data.data) {
      throw new Error('Unexpected account API response format');
    }

    const accountData = accountResponse.data.data;
    console.log(`[API] Account response received: name=${accountData.name}, tag=${accountData.tag}, level=${accountData.account_level}`);

    // Fetch MMR data
    const mmrUrl = `https://api.henrikdev.xyz/valorant/v1/mmr-history/${region}/${name}/${tag}`;
    console.log(`[API] GET mmr-history endpoint`);

    const mmrResponse = await axios.get(mmrUrl, {
      headers: { Authorization: apiKey },
      timeout: 10000,
    });

    const mmrHistory = mmrResponse.data.data || [];
    console.log(`[API] MMR history received: ${mmrHistory.length} entries`);

    // Fetch recent matches for stats aggregation
    const matchesUrl = `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${name}/${tag}?mode=competitive&size=10`;
    console.log(`[API] GET matches endpoint for stats aggregation`);

    const matchesResponse = await axios.get(matchesUrl, {
      headers: { Authorization: apiKey },
      timeout: 10000,
    });

    const matches = matchesResponse.data.data || [];
    console.log(`[API] Matches response received: ${matches.length} matches available`);

    // Aggregate stats from matches
    const puuid = accountData.puuid;
    const aggregatedStats = aggregateStatsFromMatches(matches, name, tag, puuid);
    console.log(`[API] Stats aggregated: ${aggregatedStats?.wins || 0}W - ${aggregatedStats?.losses || 0}L`);

    // Parse combined response and cache it
    const playerData = parseProfileResponse(accountData, mmrHistory, region, aggregatedStats);
    cache.set(cacheKey, playerData);
    console.log(`[API] Profile parsed and cached for ${name}#${tag}`);
    return playerData;
  } catch (error) {
    console.error('[ERROR] Failed to get player profile:');
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Message: ${error.response.statusText}`);
      if (error.response.status === 401 || error.response.status === 403) {
        console.error('  → API key issue (401/403)');
      } else if (error.response.status === 404) {
        console.error('  → Player not found (404)');
      } else if (error.response.status === 429) {
        console.error('  → Rate limited (429)');
      }
    } else if (error.code === 'ECONNABORTED') {
      console.error(`  Timeout: request took longer than 10000ms`);
    } else {
      console.error(`  Message: ${error.message}`);
    }
    return null;
  }
}

/**
 * Get Valorant account data from HenrikDev.
 * @param {string} name
 * @param {string} tag
 * @param {string} region
 * @returns {Promise<object|null>}
 */
async function getPlayerAccount(name, tag, region = 'na') {
  try {
    if (!isValidRegion(region)) {
      throw new Error(`Invalid region: ${region}. Valid regions: na, eu, br, latam, kr, jp, ap`);
    }

    const cacheKey = `account_${name.toLowerCase()}_${tag.toUpperCase()}_${region}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[CACHE HIT] Account for ${name}#${tag}`);
      return cached;
    }

    if (process.env.USE_MOCK_DATA === 'true') {
      console.log('[MOCK DATA] Returning mock account for', `${name}#${tag}`);
      const mockData = { ...MOCK_ACCOUNT, name, tag, region };
      cache.set(cacheKey, mockData);
      return mockData;
    }

    const apiKey = process.env.HENRIK_API_KEY;
    if (!apiKey) {
      console.warn(
        '[WARNING] No API key found. Set HENRIK_API_KEY in .env or enable USE_MOCK_DATA=true'
      );
      return null;
    }

    const encodedName = encodeURIComponent(name);
    const encodedTag = encodeURIComponent(tag);
    const url = `https://api.henrikdev.xyz/valorant/v1/account/${encodedName}/${encodedTag}`;
    console.log(`[API] GET account endpoint for ${name}#${tag}`);

    const response = await axios.get(url, {
      headers: { Authorization: apiKey },
      timeout: 10000,
    });

    if (!response.data || !response.data.data) {
      throw new Error('Unexpected account API response format');
    }

    const accountData = {
      name: response.data.data.name || name,
      tag: response.data.data.tag || tag,
      puuid: response.data.data.puuid || null,
      account_level: response.data.data.account_level ?? null,
      region,
      card: response.data.data.card || null,
      last_update: response.data.data.last_update || null,
      rawAvailable: true,
    };

    cache.set(cacheKey, accountData);
    console.log(`[API] Account parsed and cached for ${name}#${tag}`);
    return accountData;
  } catch (error) {
    console.error('[ERROR] Failed to get player account:');
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Message: ${error.response.statusText}`);
    } else if (error.code === 'ECONNABORTED') {
      console.error('  Timeout: request took longer than 10000ms');
    } else {
      console.error(`  Message: ${error.message}`);
    }
    return null;
  }
}

/**
 * Get recent MMR history from HenrikDev and normalize RR deltas.
 * @param {string} name
 * @param {string} tag
 * @param {string} region
 * @returns {Promise<array>}
 */
async function getMMRHistory(name, tag, region = 'na') {
  try {
    if (!isValidRegion(region)) {
      throw new Error(`Invalid region: ${region}. Valid regions: na, eu, br, latam, kr, jp, ap`);
    }

    const cacheKey = `mmr_history_${name.toLowerCase()}_${tag.toUpperCase()}_${region}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[CACHE HIT] MMR history for ${name}#${tag}`);
      return cached;
    }

    if (process.env.USE_MOCK_DATA === 'true') {
      console.log('[MOCK DATA] Returning mock MMR history for', `${name}#${tag}`);
      cache.set(cacheKey, MOCK_MMR_HISTORY);
      return MOCK_MMR_HISTORY;
    }

    const apiKey = process.env.HENRIK_API_KEY;
    if (!apiKey) {
      console.warn(
        '[WARNING] No API key found. Set HENRIK_API_KEY in .env or enable USE_MOCK_DATA=true'
      );
      return [];
    }

    const encodedName = encodeURIComponent(name);
    const encodedTag = encodeURIComponent(tag);
    const url = `https://api.henrikdev.xyz/valorant/v1/mmr-history/${region}/${encodedName}/${encodedTag}`;
    console.log(`[API] GET mmr-history endpoint for ${name}#${tag}`);

    const response = await axios.get(url, {
      headers: { Authorization: apiKey },
      timeout: 10000,
    });

    const history = Array.isArray(response.data?.data) ? response.data.data : [];
    const normalizedHistory = history.map((entry) => ({
      currentRank: entry.currenttierpatched || entry.tier?.name || null,
      currentTierId: safeOptionalNumber(entry.currenttier ?? entry.tier?.tier),
      rr: safeOptionalNumber(entry.ranking_in_tier ?? entry.rr),
      rrChange: safeOptionalNumber(entry.mmr_change_to_last_game ?? entry.rr_change),
      elo: safeOptionalNumber(entry.elo),
      date: entry.date || entry.date_raw || null,
      raw: entry,
    }));

    cache.set(cacheKey, normalizedHistory);
    console.log(`[API] MMR history parsed and cached for ${name}#${tag}`);
    return normalizedHistory;
  } catch (error) {
    console.error('[ERROR] Failed to get MMR history:');
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Message: ${error.response.statusText}`);
    } else if (error.code === 'ECONNABORTED') {
      console.error('  Timeout: request took longer than 10000ms');
    } else {
      console.error(`  Message: ${error.message}`);
    }
    return [];
  }
}

/**
 * Get recent matches from mock data or API
 * @param {string} name
 * @param {string} tag
 * @param {string} region
 * @returns {Promise<array>}
 */
async function getRecentMatches(name, tag, region = 'na') {
  try {
    // Validate region
    if (!isValidRegion(region)) {
      throw new Error(`Invalid region: ${region}. Valid regions: na, eu, br, latam, kr, jp, ap`);
    }

    // Check cache
    const cacheKey = `matches_${name.toLowerCase()}_${tag.toUpperCase()}_${region}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[CACHE HIT] Matches for ${name}#${tag}`);
      return cached;
    }

    // Use mock data if enabled
    if (process.env.USE_MOCK_DATA === 'true') {
      console.log('[MOCK DATA] Returning mock recent matches for', `${name}#${tag}`);
      cache.set(cacheKey, MOCK_RECENT_MATCHES);
      return MOCK_RECENT_MATCHES;
    }

    // Call real API
    const apiKey = process.env.HENRIK_API_KEY;
    if (!apiKey) {
      console.warn(
        '[WARNING] No API key found. Set HENRIK_API_KEY in .env or enable USE_MOCK_DATA=true'
      );
      return [];
    }

    const url = `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${name}/${tag}?mode=competitive&size=5`;
    console.log(`[API] GET matches endpoint for ${name}#${tag}`);

    const response = await axios.get(url, {
      headers: { Authorization: apiKey },
      timeout: 10000,
    });

    if (!response.data || !response.data.data || !Array.isArray(response.data.data)) {
      throw new Error('Unexpected matches API response format');
    }

    console.log(`[API] Matches response received: status=${response.status}, count=${response.data.data.length}`);

    // Fetch account info for puuid lookup
    const accountUrl = `https://api.henrikdev.xyz/valorant/v1/account/${name}/${tag}`;
    const accountResponse = await axios.get(accountUrl, {
      headers: { Authorization: apiKey },
      timeout: 10000,
    });

    const puuid = accountResponse.data?.data?.puuid;
    console.log(`[API] Got puuid for player lookup`);

    // Parse matches and normalize to internal format
    const matches = response.data.data
      .slice(0, 5)
      .map((match) => {
        const player = findPlayerInMatch(match, name, tag, puuid);
        if (!player) {
          console.log(`[API] Could not find player in match`);
          return null;
        }
        return normalizeMatch(match, player);
      })
      .filter((m) => m !== null);

    cache.set(cacheKey, matches);
    console.log(`[API] ${matches.length} matches parsed and cached for ${name}#${tag}`);
    return matches;
  } catch (error) {
    console.error('[ERROR] Failed to get recent matches:');
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Message: ${error.response.statusText}`);
      if (error.response.status === 401 || error.response.status === 403) {
        console.error('  → API key issue (401/403)');
      } else if (error.response.status === 404) {
        console.error('  → Player not found (404)');
      } else if (error.response.status === 429) {
        console.error('  → Rate limited (429)');
      }
    } else if (error.code === 'ECONNABORTED') {
      console.error(`  Timeout: request took longer than 10000ms`);
    } else {
      console.error(`  Message: ${error.message}`);
    }
    return [];
  }
}

/**
 * Parse profile response from HenrikDev API
 * @param {object} accountData - From v1/account endpoint
 * @param {array} mmrHistory - From v1/mmr-history endpoint
 * @param {string} region
 * @param {object} aggregatedStats - From match aggregation
 * @returns {object}
 *
 * TODO: Add season aggregate support if HenrikDev provides stored season match history.
 * Currently aggregating recent competitive matches only, not full season data.
 */
function parseProfileResponse(accountData, mmrHistory = [], region, aggregatedStats = null) {
  // Get current rank from most recent MMR entry
  const latestMMR = mmrHistory.length > 0 ? mmrHistory[0] : {};
  const currentRank = latestMMR.currenttierpatched || 'Unranked';

  // Get peak rank by finding the highest tier
  let peakRank = 'N/A';
  if (mmrHistory.length > 0) {
    const highestTier = Math.max(...mmrHistory.map((m) => m.currenttier || 0));
    const peakEntry = mmrHistory.find((m) => m.currenttier === highestTier);
    peakRank = peakEntry?.currenttierpatched || 'N/A';
  }

  // Use aggregated stats if available
  const stats = aggregatedStats || {};

  return {
    riotId: `${accountData.name}#${accountData.tag}`,
    region,
    currentRank,
    peakRank,
    level: accountData.account_level || 'N/A',
    wins: stats.wins || 0,
    losses: stats.losses || 0,
    kills: stats.kills || 0,
    deaths: stats.deaths || 0,
    assists: stats.assists || 0,
    kdRatio: stats.kdRatio || 0,
    adrPerRound: stats.adrPerRound ?? null,
    acsPerRound: stats.acsPerRound ?? null,
    headshotPercent: stats.headshotPercent || 0,
    kastPercent: stats.kastPercent ?? null,
    damageDeltaPerRound: stats.damageDeltaPerRound ?? null,
    damageDeltaSource: stats.damageDeltaSource ?? null,
    damageDeltaCompleteMatches: stats.damageDeltaCompleteMatches ?? 0,
    damageDeltaMissingReason: stats.damageDeltaMissingReason ?? null,
    winPercent: stats.winPercent || 0,
    topAgents: stats.topAgents || [],
    damageAdjustment: 'N/A', // Not available in v3 matches endpoint
    matchesAnalyzed: stats.matchesAnalyzed || 0,
    lastUpdated: new Date().toISOString(),
  };
}


/**
 * Get cache stats
 * @returns {object}
 */
function getCacheStats() {
  return cache.getStats();
}

/**
 * Get player MMR data from HenrikDev v3 endpoint
 * @param {string} name
 * @param {string} tag
 * @param {string} region
 * @param {string} platform
 * @returns {Promise<object>}
 */
async function getPlayerMMR(name, tag, region = 'na', platform = 'pc') {
  try {
    // Validate region
    if (!isValidRegion(region)) {
      throw new Error(`Invalid region: ${region}. Valid regions: na, eu, br, latam, kr, jp, ap`);
    }

    // Check cache
    const cacheKey = `mmr_${name.toLowerCase()}_${tag.toUpperCase()}_${region}_${platform}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[CACHE HIT] MMR for ${name}#${tag}`);
      return cached;
    }

    // Use mock data if enabled
    if (process.env.USE_MOCK_DATA === 'true') {
      console.log('[MOCK DATA] Returning mock MMR for', `${name}#${tag}`);
      const mockData = { ...MOCK_MMR, name, tag, region, platform };
      cache.set(cacheKey, mockData);
      return mockData;
    }

    // Call real API
    const apiKey = process.env.HENRIK_API_KEY;
    if (!apiKey) {
      console.warn(
        '[WARNING] No API key found. Set HENRIK_API_KEY in .env or enable USE_MOCK_DATA=true'
      );
      return null;
    }

    // URL encode name and tag
    const encodedName = encodeURIComponent(name);
    const encodedTag = encodeURIComponent(tag);
    const url = `https://api.henrikdev.xyz/valorant/v3/mmr/${region}/${platform}/${encodedName}/${encodedTag}`;
    console.log(`[API] GET MMR v3 endpoint for ${name}#${tag}`);

    const response = await axios.get(url, {
      headers: { Authorization: apiKey },
      timeout: 10000,
    });

    if (!response.data || !response.data.data) {
      throw new Error('Unexpected MMR API response format');
    }

    const mmrData = response.data.data;
    console.log(`[API] MMR response received: rank=${mmrData.current?.tier?.name || 'Unknown'}, rr=${mmrData.current?.rr || 'N/A'}`);

    // Normalize and parse response
    const normalizedMMR = {
      name: mmrData.account?.name || name,
      tag: mmrData.account?.tag || tag,
      region,
      platform,
      currentRank: mmrData.current?.tier?.name || null,
      currentTierId: mmrData.current?.tier?.tier || null,
      currentRR: safeOptionalNumber(mmrData.current?.rr),
      lastRRChange: safeOptionalNumber(mmrData.current?.last_change),
      elo: safeOptionalNumber(mmrData.current?.elo),
      gamesNeededForRating: safeOptionalNumber(mmrData.current?.games_needed_for_rating),
      leaderboardRank: mmrData.current?.leaderboard_placement?.rank || null,
      peakRank: mmrData.peak?.tier?.name || null,
      peakSeason: mmrData.peak?.season?.short || null,
      seasonalCount: mmrData.seasonal ? Object.keys(mmrData.seasonal).length : 0,
      rawAvailable: true,
    };

    cache.set(cacheKey, normalizedMMR);
    console.log(`[API] MMR parsed and cached for ${name}#${tag}`);
    return normalizedMMR;
  } catch (error) {
    console.error('[ERROR] Failed to get player MMR:');
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Message: ${error.response.statusText}`);
      if (error.response.status === 401 || error.response.status === 403) {
        console.error('  → API key issue (401/403)');
      } else if (error.response.status === 404) {
        console.error('  → Player not found (404)');
      } else if (error.response.status === 429) {
        console.error('  → Rate limited (429)');
      }
    } else if (error.code === 'ECONNABORTED') {
      console.error(`  Timeout: request took longer than 10000ms`);
    } else {
      console.error(`  Message: ${error.message}`);
    }
    return null;
  }
}

module.exports = {
  getPlayerAccount,
  getPlayerProfile,
  getRecentMatches,
  getPlayerMMR,
  getMMRHistory,
  getCacheStats,
  getExperimentalValorantEnhancements,
  isExperimentalValorantPipelineEnabled,
  isValidRegion,
};
