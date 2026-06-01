/**
 * Utility functions for formatting Valorant stats
 */

/**
 * Format a ratio to 2 decimal places
 * @param {number|string} value
 * @returns {string}
 */
function formatRatio(value) {
  if (value === 'N/A' || value === null || value === undefined) return 'N/A';
  const num = parseFloat(value);
  if (Number.isNaN(num)) return 'N/A';
  return num.toFixed(2);
}

/**
 * Format a percentage to 1 decimal place
 * @param {number|string} value
 * @returns {string}
 */
function formatPercent(value) {
  if (value === 'N/A' || value === null || value === undefined) return 'N/A';
  const num = parseFloat(value);
  if (Number.isNaN(num)) return 'N/A';
  return num.toFixed(1) + '%';
}

/**
 * Format ACS (Average Combat Score)
 * @param {number|string} value
 * @returns {string}
 */
function formatACS(value) {
  if (value === 'N/A' || value === null || value === undefined) return 'N/A';
  const num = parseFloat(value);
  if (Number.isNaN(num)) return 'N/A';
  return num.toFixed(1);
}

/**
 * Format ADR (Average Damage per Round)
 * @param {number|string} value
 * @returns {string}
 */
function formatADR(value) {
  if (value === 'N/A' || value === null || value === undefined) return 'N/A';
  const num = parseFloat(value);
  if (Number.isNaN(num)) return 'N/A';
  return num.toFixed(1);
}

/**
 * Format KAST as a percentage, accepting either decimal or percent inputs.
 * @param {number|string} value
 * @returns {string}
 */
function formatKASTPercent(value) {
  if (value === 'N/A' || value === null || value === undefined) return 'N/A';
  const num = parseFloat(value);
  if (Number.isNaN(num)) return 'N/A';
  const percent = Math.abs(num) <= 1 ? num * 100 : num;
  return percent.toFixed(1) + '%';
}

/**
 * Format kills, deaths, assists
 * @param {number} k
 * @param {number} d
 * @param {number} a
 * @returns {string}
 */
function formatKDA(k, d, a) {
  const kills = k || 0;
  const deaths = d || 0;
  const assists = a || 0;
  return `${kills}/${deaths}/${assists}`;
}

/**
 * Format K/D ratio
 * @param {number} kills
 * @param {number} deaths
 * @returns {string}
 */
function formatKD(kills, deaths) {
  if (kills === null || deaths === null || deaths === undefined) return 'N/A';
  if (deaths === 0) return kills > 0 ? '∞' : '0.00';
  return formatRatio(kills / deaths);
}

/**
 * Format win rate
 * @param {number} wins
 * @param {number} losses
 * @returns {string}
 */
function formatWinRate(wins, losses) {
  if (wins === null || losses === null) return 'N/A';
  const total = wins + losses;
  if (total === 0) return 'N/A';
  const rate = (wins / total) * 100;
  return formatPercent(rate);
}

/**
 * Format a rank with tier and division
 * @param {string} rank - e.g., "Platinum 1"
 * @returns {string}
 */
function formatRank(rank) {
  return rank || 'Unranked';
}

/**
 * Format damage delta
 * @param {number|string} value - e.g., +5 or -3
 * @returns {string}
 */
function formatDamageAdjustment(value) {
  if (value === 'N/A' || value === null || value === undefined) return 'N/A';
  const num = Number(value);
  if (isNaN(num)) return 'N/A';
  const sign = num >= 0 ? '+' : '';
  return sign + num;
}

/**
 * Format match score as "13-7" or similar
 * @param {number} roundsWon
 * @param {number} roundsLost
 * @returns {string}
 */
function formatMatchScore(roundsWon, roundsLost) {
  return `${roundsWon || 0}-${roundsLost || 0}`;
}

module.exports = {
  formatRatio,
  formatPercent,
  formatACS,
  formatADR,
  formatKASTPercent,
  formatKDA,
  formatKD,
  formatWinRate,
  formatRank,
  formatDamageAdjustment,
  formatMatchScore,
};
