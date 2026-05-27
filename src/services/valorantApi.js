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

    const url = `https://api.henrikdev.gg/valorant/v1/account/${name}/${tag}`;
    const response = await axios.get(url, {
      params: { region },
      headers: { 'X-API-Key': apiKey },
      timeout: 10000,
    });

    if (!response.data || !response.data.data) {
      throw new Error('Unexpected API response format');
    }

    // Parse the response and cache it
    const playerData = parseProfileResponse(response.data.data, region);
    cache.set(cacheKey, playerData);
    return playerData;
  } catch (error) {
    console.error('[ERROR] Failed to get player profile:', error.message);
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

    const url = `https://api.henrikdev.gg/valorant/v3/matches/${region}/${name}/${tag}`;
    const response = await axios.get(url, {
      headers: { 'X-API-Key': apiKey },
      timeout: 10000,
    });

    if (!response.data || !response.data.data) {
      throw new Error('Unexpected API response format');
    }

    // Parse the response and cache it
    const matches = response.data.data
      .slice(0, 5) // Get last 5 matches
      .map((match) => parseMatchResponse(match));

    cache.set(cacheKey, matches);
    return matches;
  } catch (error) {
    console.error('[ERROR] Failed to get recent matches:', error.message);
    return [];
  }
}

/**
 * Parse profile response from HenrikDev API
 * @param {object} data
 * @param {string} region
 * @returns {object}
 */
function parseProfileResponse(data, region) {
  const account = data.account || {};
  const mmr = data.mmr_data || {};
  const stats = data.statistics || {};

  return {
    riotId: `${account.game_name}#${account.tag_line}`,
    region,
    currentRank: mmr.current_tierpatched || 'Unranked',
    peakRank: mmr.highest_rank_patched || 'N/A',
    level: account.account_level || 'N/A',
    wins: stats.wins || 0,
    losses: stats.losses || 0,
    kills: stats.kills || 0,
    deaths: stats.deaths || 0,
    assists: stats.assists || 0,
    kdRatio: stats.kills && stats.deaths ? stats.kills / stats.deaths : 0,
    adrPerRound: stats.damage_per_round || 0,
    acsPerRound: stats.score_per_round || 0,
    headshotPercent: stats.headshot_percent || 0,
    kastPercent: stats.kast_percent || 0,
    winPercent: stats.win_percent || 0,
    topAgents: stats.top_agents || [],
    damageAdjustment: stats.damage_delta || 0,
  };
}

/**
 * Parse match response from HenrikDev API
 * @param {object} match
 * @returns {object}
 */
function parseMatchResponse(match) {
  const stats = match.stats || {};
  const kills = stats.kills || 0;
  const deaths = stats.deaths || 0;

  return {
    agent: match.character || 'Unknown',
    map: match.map || 'Unknown',
    roundsWon: match.rounds_won || 0,
    roundsLost: match.rounds_lost || 0,
    isWin: match.team_won || false,
    kills,
    deaths,
    assists: stats.assists || 0,
    kdRatio: deaths > 0 ? kills / deaths : kills,
    acsPerRound: stats.score_per_round || 0,
    headshotPercent: stats.headshot_percent || 0,
    damageAdjustment: stats.damage_delta || 0,
    matchDate: match.date || new Date().toISOString(),
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
