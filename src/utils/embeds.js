/**
 * Discord embed builders for Valorant stats
 */

const { EmbedBuilder } = require('discord.js');
const formatters = require('./formatters');

function formatRRChange(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num >= 0 ? `+${num}` : `${num}`;
}

function getRecentRRChanges(mmrHistory) {
  if (!Array.isArray(mmrHistory)) return [];
  return mmrHistory
    .map((entry) => entry.rrChange ?? entry.rr_change)
    .filter((value) => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite)
    .slice(0, 5);
}

function getRRPattern(rrChanges) {
  const gains = rrChanges.filter((value) => value > 0);
  const losses = rrChanges.filter((value) => value < 0).map(Math.abs);

  if (gains.length === 0 && losses.length === 0) return 'N/A';
  if (gains.length === 0) return 'harsh losses';
  if (losses.length === 0) return 'favorable gains';

  const avgWinGain = gains.reduce((sum, value) => sum + value, 0) / gains.length;
  const avgLossPenalty = losses.reduce((sum, value) => sum + value, 0) / losses.length;

  if (avgWinGain >= avgLossPenalty + 5) return 'favorable gains';
  if (avgLossPenalty >= avgWinGain + 5) return 'harsh losses';
  return 'balanced';
}

function getRoundDiff(recentMatches) {
  if (!Array.isArray(recentMatches)) return null;
  const diffs = recentMatches
    .slice(0, 5)
    .map((match) => {
      if (match?.roundsWon === null || match?.roundsWon === undefined) return null;
      if (match?.roundsLost === null || match?.roundsLost === undefined) return null;
      const won = Number(match?.roundsWon);
      const lost = Number(match?.roundsLost);
      if (!Number.isFinite(won) || !Number.isFinite(lost)) return null;
      return won - lost;
    })
    .filter((value) => value !== null);

  if (diffs.length === 0) return null;
  return diffs.reduce((sum, value) => sum + value, 0);
}

function joinSignalLabels(labels) {
  if (labels.length <= 1) return labels.join('');
  if (labels.length === 2) return labels.join(' and ');
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function createMMRSignalValue(playerData, mmrHistory, recentMatches) {
  const rrChanges = getRecentRRChanges(mmrHistory);
  const rrPattern = getRRPattern(rrChanges);
  const roundDiff = getRoundDiff(recentMatches);
  const winPercent = Number(playerData.winPercent);
  const hasRR = rrPattern !== 'N/A';
  const hasResults = Number.isFinite(winPercent) && Number(playerData.matchesAnalyzed) > 0;
  const hasRoundDiff = roundDiff !== null;

  if (!hasRR && !hasResults && !hasRoundDiff && playerData.elo === null && !playerData.currentRank) {
    return null;
  }

  const rrScore = rrPattern === 'favorable gains' ? 1 : rrPattern === 'harsh losses' ? -1 : 0;
  const resultScore = hasResults ? (winPercent >= 60 ? 1 : winPercent <= 40 ? -1 : 0) : 0;
  const roundScore = hasRoundDiff ? (roundDiff >= 15 ? 1 : roundDiff <= -15 ? -1 : 0) : 0;
  const scores = [
    hasRR ? rrScore : null,
    hasResults ? resultScore : null,
    hasRoundDiff ? roundScore : null,
  ].filter((value) => value !== null);
  const totalScore = scores.reduce((sum, value) => sum + value, 0);
  const nonZeroScores = scores.filter((value) => value !== 0);
  const allStrongPositive = nonZeroScores.length >= 3 && nonZeroScores.every((value) => value > 0);
  const allStrongNegative = nonZeroScores.length >= 3 && nonZeroScores.every((value) => value < 0);

  let read = 'Mixed / around visible rank';
  if (allStrongPositive && totalScore >= 3) {
    read = 'Likely above visible rank';
  } else if (allStrongNegative && totalScore <= -3) {
    read = 'Likely below visible rank';
  } else if (totalScore >= 1) {
    read = 'Slightly above visible rank';
  } else if (totalScore <= -1) {
    read = 'Slightly below visible rank';
  }

  const availableSignals = [
    hasRR ? 'RR trend' : null,
    hasResults ? 'recent results' : null,
    hasRoundDiff ? 'round differential' : null,
  ].filter(Boolean);
  const confidenceLevel = availableSignals.length >= 2 ? 'Medium' : availableSignals.length === 1 ? 'Low' : 'N/A';
  const confidenceReason = availableSignals.length > 0 ? `${joinSignalLabels(availableSignals)} available` : 'no recent signal data';
  const visibleElo = playerData.elo !== null && playerData.elo !== undefined ? playerData.elo : 'N/A';
  const visibleRank = playerData.currentRank || 'Unranked';

  return [
    `**Visible Elo:** ${visibleElo} (${visibleRank})`,
    `**RR Pattern:** ${rrPattern}`,
    `**Round Diff:** ${hasRoundDiff ? `${formatRRChange(roundDiff)} last ${Math.min(5, recentMatches.length)}` : 'N/A'}`,
    `**Read:** ${read}`,
    `**Confidence:** ${confidenceLevel} - ${confidenceReason}`,
  ].join('\n');
}

/**
 * Create a profile embed from player stats, rank, RR history, and recent matches.
 * @param {object} playerData - merged player data
 * @param {object} context - source data used for fallback/footer details
 * @param {object} legacyMMRData - backward-compatible MMR argument
 * @param {array} legacyRecentMatches - backward-compatible recent matches argument
 * @returns {EmbedBuilder}
 */
function createProfileEmbed(playerData, context = {}, legacyMMRData = null, legacyRecentMatches = null) {
  const isContextBundle = Object.prototype.hasOwnProperty.call(context, 'profile')
    || Object.prototype.hasOwnProperty.call(context, 'mmr')
    || Object.prototype.hasOwnProperty.call(context, 'account')
    || Object.prototype.hasOwnProperty.call(context, 'recentMatches');
  const profileData = isContextBundle ? context.profile : context;
  const mmrData = isContextBundle ? context.mmr : legacyMMRData;
  const accountData = isContextBundle ? context.account : playerData.account || null;
  const mmrHistory = isContextBundle ? context.mmrHistory || [] : playerData.mmrHistory || [];
  const recentMatches = isContextBundle ? context.recentMatches || [] : legacyRecentMatches || [];

  const {
    riotId = 'N/A',
    region = 'N/A',
    level = 'N/A',
    currentRank = 'Unranked',
    currentRR = null,
    lastRRChange = null,
    peakRank = 'N/A',
    peakSeason = 'N/A',
    wins = 0,
    losses = 0,
    kills = 0,
    deaths = 0,
    assists = 0,
    adrPerRound = null,
    acsPerRound = null,
    headshotPercent = 0,
    damageDeltaPerRound = null,
    winPercent = 0,
    topAgents = [],
    matchesAnalyzed = 0,
    elo = null,
    leaderboardRank = null,
    gamesNeededForRating = null,
  } = playerData;

  const descriptionParts = [currentRank || 'Unranked'];

  if (currentRR !== null) {
    descriptionParts.push(`${currentRR} RR`);
  }

  const lastChangeText = formatRRChange(lastRRChange);
  if (lastChangeText !== null) {
    descriptionParts.push(`${lastChangeText} RR last match`);
  }

  if (peakRank !== 'N/A' && peakRank !== null) {
    descriptionParts.push(`Peak: ${peakRank}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xFF4655)
    .setTitle(`${riotId} - Valorant Profile`)
    .setDescription(descriptionParts.join(' | '));

  const cardImage = accountData?.card?.small || accountData?.card?.wide || accountData?.card?.large;
  if (cardImage) {
    embed.setThumbnail(cardImage);
  }

  if (matchesAnalyzed > 0) {
    const recentValue = [
      `**Record:** ${wins}W - ${losses}L (Last ${matchesAnalyzed})`,
      `**Win%:** ${formatters.formatPercent(winPercent)}`,
      `**Top Agents:** ${topAgents.length > 0 ? topAgents.join(', ') : 'N/A'}`,
    ];

    embed.addFields({
      name: 'Recent Competitive',
      value: recentValue.join('\n'),
      inline: false,
    });
  }

  const matchesAvailable = Number(matchesAnalyzed) > 0;
  const combatValue = [
    `**K/D:** ${matchesAvailable ? formatters.formatKD(kills, deaths) : 'N/A'}`,
    `**K/D/A:** ${matchesAvailable ? formatters.formatKDA(kills, deaths, assists) : 'N/A'}`,
    `**ACS:** ${matchesAvailable ? formatters.formatACS(acsPerRound) : 'N/A'}`,
    `**ADR:** ${matchesAvailable ? formatters.formatADR(adrPerRound) : 'N/A'}`,
    `**DDΔ:** ${matchesAvailable ? formatters.formatDamageDelta(damageDeltaPerRound) : 'N/A'}`,
    `**HS%:** ${matchesAvailable ? formatters.formatPercent(headshotPercent) : 'N/A'}`,
  ];

  embed.addFields({
    name: 'Combat',
    value: combatValue.join('\n'),
    inline: false,
  });

  if (Array.isArray(recentMatches) && recentMatches.length > 0) {
    const matchPreview = recentMatches.slice(0, 3).map((match) => {
      const result = match.isWin === true ? 'W' : match.isWin === false ? 'L' : 'N/A';
      const hasScore = match.roundsWon !== null
        && match.roundsWon !== undefined
        && match.roundsLost !== null
        && match.roundsLost !== undefined
        && Number.isFinite(Number(match.roundsWon))
        && Number.isFinite(Number(match.roundsLost));
      const score = hasScore ? `${match.roundsWon}-${match.roundsLost}` : 'Score N/A';
      const map = match.map && match.map !== 'Unknown' ? ` | ${match.map}` : '';
      const agent = match.agent || 'Unknown';
      const stats = formatters.formatKDA(match.kills, match.deaths, match.assists);
      const acs = formatters.formatACS(match.acsPerRound);
      return `${result} ${score}${map} | ${agent} | ${stats} | ${acs} ACS`;
    }).join('\n');

    if (matchPreview) {
      embed.addFields({
        name: 'Recent Matches',
        value: matchPreview,
        inline: false,
      });
    }
  }

  if (Array.isArray(mmrHistory) && mmrHistory.length > 0) {
    const rrChanges = getRecentRRChanges(mmrHistory);

    if (rrChanges.length > 0) {
      const netRR = rrChanges.reduce((sum, value) => sum + value, 0);
      const trend = rrChanges.map(formatRRChange).join(' / ');

      embed.addFields({
        name: 'RR Trend',
        value: `**Last ${rrChanges.length}:** ${trend}\n**Net:** ${formatRRChange(netRR)} RR`,
        inline: false,
      });
    }
  }

  const mmrSignalValue = createMMRSignalValue(playerData, mmrHistory, recentMatches);
  if (mmrSignalValue) {
    embed.addFields({
      name: 'MMR Signal',
      value: mmrSignalValue,
      inline: false,
    });
  }

  const extraParts = [];

  if (level !== 'N/A') {
    extraParts.push(`**Level:** ${level}`);
  }

  if (elo !== null) {
    extraParts.push(`**Elo:** ${elo}`);
  }

  if (peakSeason !== 'N/A' && peakSeason !== null) {
    extraParts.push(`**Peak Season:** ${peakSeason}`);
  }

  if (leaderboardRank !== null) {
    extraParts.push(`**Leaderboard:** #${leaderboardRank}`);
  }

  if (gamesNeededForRating !== null && gamesNeededForRating > 0) {
    extraParts.push(`**Placement Games Needed:** ${gamesNeededForRating}`);
  }

  if (region !== 'N/A') {
    extraParts.push(`**Region:** ${String(region).toUpperCase()}`);
  }

  if (extraParts.length > 0) {
    embed.addFields({
      name: 'Extra',
      value: extraParts.join('\n'),
      inline: false,
    });
  }

  let footerText = 'HenrikDev MMR v3 + recent match data';
  if (!profileData && mmrData) {
    footerText = 'HenrikDev MMR v3 (Recent match data unavailable)';
  } else if (profileData && !mmrData) {
    footerText = 'Recent HenrikDev matches (Rank data unavailable)';
  } else if (accountData && !profileData && !mmrData) {
    footerText = 'HenrikDev account data only';
  }
  footerText += '. MMR Signal is an estimate from visible rank, RR trend, and recent results - not Riot hidden MMR. Recent stats are last 10 competitive matches, not full Tracker.gg season totals.';

  embed.setFooter({ text: footerText });

  return embed;
}

/**
 * Create an embed for a single recent match
 * @param {object} matchData
 * @param {number} matchIndex - for ordering in a list
 * @returns {EmbedBuilder}
 */
function createMatchEmbed(matchData, matchIndex = 1) {
  const {
    agent = 'Unknown',
    map = 'Unknown',
    roundsWon = 0,
    roundsLost = 0,
    isWin = false,
    kills = 0,
    deaths = 0,
    assists = 0,
    acsPerRound = 0,
    headshotPercent = 0,
    damageAdjustment = 0,
    matchDate = new Date().toISOString(),
  } = matchData;

  const resultText = isWin ? 'WIN' : 'LOSS';
  const scoreDisplay = formatters.formatMatchScore(roundsWon, roundsLost);

  return new EmbedBuilder()
    .setColor(isWin ? 0x0FBF3F : 0x8B4513)
    .setTitle(`Match ${matchIndex} - ${agent} on ${map}`)
    .setDescription(`${resultText} - Score: ${scoreDisplay}`)
    .addFields(
      { name: 'Kills/Deaths/Assists', value: formatters.formatKDA(kills, deaths, assists), inline: true },
      { name: 'K/D Ratio', value: formatters.formatKD(kills, deaths), inline: true },
      { name: 'ACS', value: formatters.formatACS(acsPerRound), inline: true },
      { name: 'Headshot %', value: formatters.formatPercent(headshotPercent), inline: true },
      { name: 'Damage Adj.', value: formatters.formatDamageAdjustment(damageAdjustment), inline: true },
      { name: 'Date', value: new Date(matchDate).toLocaleString(), inline: true }
    )
    .setFooter({ text: 'Match data from HenrikDev API' });
}

/**
 * Create an embed for recent matches overview
 * @param {string} riotId
 * @param {array} matches
 * @returns {EmbedBuilder}
 */
function createRecentMatchesOverviewEmbed(riotId, matches = []) {
  return new EmbedBuilder()
    .setColor(0xFF4655)
    .setTitle(`${riotId} - Recent Matches`)
    .setDescription(`Last ${matches.length} matches`)
    .setFooter({ text: 'Powered by HenrikDev API' });
}

/**
 * Create an error embed
 * @param {string} title
 * @param {string} description
 * @returns {EmbedBuilder}
 */
function createErrorEmbed(title = 'Error', description = 'An error occurred while fetching data.') {
  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Please try again later or check your input.' });
}

/**
 * Create an embed for Valorant ranked MMR.
 * @param {object} mmrData
 * @returns {EmbedBuilder}
 */
function createMMREmbed(mmrData) {
  const {
    name = 'Unknown',
    tag = 'Unknown',
    currentRank = 'N/A',
    currentRR = null,
    lastRRChange = null,
    elo = null,
    gamesNeededForRating = null,
    leaderboardRank = null,
    peakRank = 'N/A',
    peakSeason = 'N/A',
  } = mmrData;

  const riotId = `${name}#${tag}`;
  const currentRRText = currentRR !== null ? `${currentRR} / 100` : 'N/A';
  const lastChangeText = lastRRChange !== null
    ? `${formatRRChange(lastRRChange)} RR`
    : 'N/A';

  const embed = new EmbedBuilder()
    .setColor(0xFF4655)
    .setTitle(`${riotId} - Ranked MMR`)
    .setDescription(`**${currentRank}** ranked status`)
    .addFields(
      {
        name: 'Current Rank',
        value: `**Rank:** ${currentRank}\n**RR:** ${currentRRText}\n**Last Change:** ${lastChangeText}`,
        inline: false,
      },
      {
        name: 'Peak',
        value: `**Peak Rank:** ${peakRank}\n**Peak Season:** ${peakSeason}`,
        inline: false,
      }
    );

  const extraFields = [
    `**Elo:** ${elo !== null ? elo : 'N/A'}`,
    `**Leaderboard:** ${leaderboardRank !== null ? leaderboardRank : 'N/A'}`,
    `**Games Needed:** ${gamesNeededForRating !== null ? gamesNeededForRating : 'N/A'}`,
  ];

  embed.addFields({
    name: 'Extra',
    value: extraFields.join('\n'),
    inline: false,
  });

  embed.setFooter({ text: 'Data from HenrikDev MMR v3. Fields may be N/A when unavailable.' });

  return embed;
}

module.exports = {
  createProfileEmbed,
  createMatchEmbed,
  createRecentMatchesOverviewEmbed,
  createErrorEmbed,
  createMMREmbed,
};
