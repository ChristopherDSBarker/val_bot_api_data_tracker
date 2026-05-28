/**
 * Valorant API service - handles both real API and mock data
 */

const axios = require('axios');
const Cache = require('../utils/cache.js');

const cache = new Cache(5); // 5 minute TTL

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
  kastPercent: 69.0,
  winPercent: 52.3,
  topAgents: ['Veto', 'Jett', 'Raze'],
  damageAdjustment: 5,
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
 * Find target player in a match's all_players array
 * @param {object} match - HenrikDev match object
 * @param {string} name - Player name (game_name)
 * @param {string} tag - Player tag (tagline)
 * @param {string} puuid - Optional player puuid for more precise matching
 * @returns {object|null}
 */
function findPlayerInMatch(match, name, tag, puuid) {
  if (!match.players || !match.players.all_players) {
    return null;
  }

  const allPlayers = match.players.all_players;

  // If puuid provided, use it (most reliable)
  if (puuid) {
    const byPuuid = allPlayers.find((p) => p.puuid === puuid);
    if (byPuuid) return byPuuid;
  }

  // Fall back to name/tag matching
  const byNameTag = allPlayers.find((p) => p.name === name && p.tag === tag);
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
  const isWin = player.team === 'Red' ? match.teams.red.has_won : match.teams.blue.has_won;
  const roundsPlayed = metadata.rounds_played || 0;

  // Calculate totals
  const totalShots = safeNumber(stats.bodyshots, 0) + safeNumber(stats.headshots, 0) + safeNumber(stats.legshots, 0);
  const headshotPercent = totalShots > 0 ? (safeNumber(stats.headshots, 0) / totalShots) * 100 : 0;

  return {
    agent: player.character || 'Unknown',
    map: metadata.map || 'Unknown',
    roundsWon: isWin ? roundsPlayed : 0,
    roundsLost: isWin ? 0 : roundsPlayed,
    isWin,
    kills: safeNumber(stats.kills, 0),
    deaths: safeNumber(stats.deaths, 0),
    assists: safeNumber(stats.assists, 0),
    kdRatio: safeNumber(stats.deaths, 0) > 0 ? safeNumber(stats.kills, 0) / safeNumber(stats.deaths, 0) : safeNumber(stats.kills, 0),
    acsPerRound: stats.score ? (safeNumber(stats.score, 0) / roundsPlayed).toFixed(1) : 'N/A',
    headshotPercent: headshotPercent.toFixed(1),
    damageAdjustment: 0, // Not available in v3 matches endpoint
    matchDate: metadata.game_start_patched || new Date().toISOString(),
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

    const stats = player.stats || {};
    const isWin = player.team === 'Red' ? match.teams.red.has_won : match.teams.blue.has_won;

    if (isWin) {
      wins++;
    } else {
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

  const matchesAnalyzed = wins + losses;

  return {
    wins,
    losses,
    kills,
    deaths,
    assists,
    kdRatio: kdRatio.toFixed(2),
    headshotPercent: headshotPercent.toFixed(1),
    winPercent: winPercent.toFixed(1),
    topAgents,
    matchesAnalyzed,
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
    const matchesUrl = `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${name}/${tag}?mode=competitive&size=20`;
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
    adrPerRound: 'N/A', // Not available in v3 matches endpoint
    acsPerRound: 'N/A', // Not available in v3 matches endpoint
    headshotPercent: stats.headshotPercent || 0,
    kastPercent: 'N/A', // Not available in v3 matches endpoint
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

module.exports = {
  getPlayerProfile,
  getRecentMatches,
  getCacheStats,
  isValidRegion,
};
