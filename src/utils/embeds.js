/**
 * Discord embed builders for Valorant stats
 */

const { EmbedBuilder } = require('discord.js');
const formatters = require('./formatters');

/**
 * Create a profile embed from player stats
 * @param {object} playerData
 * @returns {EmbedBuilder}
 */
function createProfileEmbed(playerData) {
  const {
    riotId = 'N/A',
    region = 'N/A',
    currentRank = 'Unranked',
    peakRank = 'N/A',
    level = 'N/A',
    wins = 0,
    losses = 0,
    kills = 0,
    deaths = 0,
    assists = 0,
    kdRatio = 0,
    adrPerRound = null,
    acsPerRound = null,
    headshotPercent = 0,
    kastPercent = null,
    winPercent = 0,
    topAgents = [],
    matchesAnalyzed = 0,
    lastUpdated = new Date().toISOString(),
  } = playerData;

  const embed = new EmbedBuilder()
    .setColor(0xFF4655) // Valorant red
    .setTitle(`${riotId} - Recent Competitive Stats`)
    .setDescription(`**${formatters.formatRank(currentRank)}** • Region: ${region}`)
    .addFields(
      { name: 'Account Info', value: `**Level:** ${level}\n**Recent Record:** ${wins}W - ${losses}L (${matchesAnalyzed} matches)`, inline: true },
      {
        name: 'Combat Stats',
        value: `**K/D:** ${formatters.formatKD(kills, deaths)}\n**K/D/A:** ${formatters.formatKDA(kills, deaths, assists)}\n**ADR:** ${formatters.formatADR(adrPerRound)}`,
        inline: true,
      },
      {
        name: 'Performance',
        value: `**ACS:** ${formatters.formatACS(acsPerRound)}\n**HS%:** ${formatters.formatPercent(headshotPercent)}\n**Win%:** ${formatters.formatPercent(winPercent)}`,
        inline: true,
      },
      {
        name: 'Additional',
        value: `**KAST:** ${formatters.formatKASTPercent(kastPercent)}\n**Top Agents:** ${topAgents.length > 0 ? topAgents.join(', ') : 'N/A'}`,
        inline: true,
      }
    )
    .setFooter({ text: `Aggregated from recent HenrikDev matches, not full Tracker.gg season data | Last updated: ${new Date(lastUpdated).toLocaleString()}` });

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
    kdRatio = 0,
    acsPerRound = 0,
    headshotPercent = 0,
    damageAdjustment = 0,
    matchDate = new Date().toISOString(),
  } = matchData;

  const resultEmoji = isWin ? '✅ WIN' : '❌ LOSS';
  const scoreDisplay = formatters.formatMatchScore(roundsWon, roundsLost);

  const embed = new EmbedBuilder()
    .setColor(isWin ? 0x0FBF3F : 0x8B4513) // Green for win, brown for loss
    .setTitle(`Match ${matchIndex} - ${agent} on ${map}`)
    .setDescription(`${resultEmoji} • Score: ${scoreDisplay}`)
    .addFields(
      { name: 'Kills/Deaths/Assists', value: formatters.formatKDA(kills, deaths, assists), inline: true },
      { name: 'K/D Ratio', value: formatters.formatKD(kills, deaths), inline: true },
      { name: 'ACS', value: formatters.formatACS(acsPerRound), inline: true },
      { name: 'Headshot %', value: formatters.formatPercent(headshotPercent), inline: true },
      { name: 'Damage Adj.', value: formatters.formatDamageAdjustment(damageAdjustment), inline: true },
      { name: 'Date', value: new Date(matchDate).toLocaleString(), inline: true }
    )
    .setFooter({ text: 'Match data from HenrikDev API' });

  return embed;
}

/**
 * Create an embed for recent matches overview
 * @param {string} riotId
 * @param {array} matches
 * @returns {EmbedBuilder}
 */
function createRecentMatchesOverviewEmbed(riotId, matches = []) {
  const embed = new EmbedBuilder()
    .setColor(0xFF4655) // Valorant red
    .setTitle(`${riotId} - Recent Matches`)
    .setDescription(`Last ${matches.length} matches`)
    .setFooter({ text: 'Powered by HenrikDev API' });

  return embed;
}

/**
 * Create an error embed
 * @param {string} title
 * @param {string} description
 * @returns {EmbedBuilder}
 */
function createErrorEmbed(title = 'Error', description = 'An error occurred while fetching data.') {
  return new EmbedBuilder()
    .setColor(0xFF0000) // Red
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Please try again later or check your input.' });
}

module.exports = {
  createProfileEmbed,
  createMatchEmbed,
  createRecentMatchesOverviewEmbed,
  createErrorEmbed,
};
