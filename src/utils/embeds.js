const { compareRoundWindows } = require('../services/progress');
/**
 * Discord embed builders for Valorant stats
 */

const { EmbedBuilder, escapeMarkdown } = require('discord.js');
const formatters = require('./formatters');

const VALORANT_RED = 0xFF4655;

function formatRRChange(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num >= 0 ? `+${num}` : `${num}`;
}

function sampleReadout(matches, parties) {
  const weapons = new Map();
  const agents = new Map();
  const economy = { spend: { total: 0, rounds: 0 }, loadout: { total: 0, rounds: 0 } };
  for (const match of matches) {
    for (const [weapon, kills] of Object.entries(match.weaponKills || {})) {
      weapons.set(weapon, (weapons.get(weapon) || 0) + kills);
    }
    if (Number.isFinite(match.roundsPlayed) && match.roundsPlayed > 0) {
      for (const [key, value] of [['spend', match.creditsPerRound], ['loadout', match.loadoutPerRound]]) {
        if (!Number.isFinite(value)) continue;
        economy[key].total += value * match.roundsPlayed;
        economy[key].rounds += match.roundsPlayed;
      }
    }
    if (!match.agent || typeof match.isWin !== 'boolean') continue;
    const row = agents.get(match.agent) || { name: match.agent, wins: 0, games: 0 };
    row.games++;
    if (match.isWin) row.wins++;
    agents.set(row.name, row);
  }
  const bestAgent = [...agents.values()].filter((row) => row.games >= 3)
    .sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)[0];
  const partner = [...parties].filter((row) => row.decided >= 3)
    .sort((a, b) => b.wins / b.decided - a.wins / a.decided || b.decided - a.decided)[0];
  const gun = [...weapons].sort((a, b) => b[1] - a[1])[0];
  const label = (value) => escapeMarkdown(String(value).slice(0, 60));
  return [
    bestAgent ? `**Agent sample leader:** ${label(bestAgent.name)} · ${bestAgent.wins}/${bestAgent.games} wins. ${bestAgent.wins / bestAgent.games <= 0.5 ? 'No winning record.' : 'Recent results only.'}` : '**Agent:** Need 3 known results on one agent.',
    partner ? `**Party sample leader:** ${label(partner.riotId)} · ${partner.wins}/${partner.decided} party wins. ${partner.wins / partner.decided <= 0.5 ? 'No winning record.' : 'Recent results only.'}` : '**Queue partner:** Need 3 confirmed party results with one player.',
    gun ? `**Most recorded gun kills:** ${label(gun[0])} · ${gun[1]} kills. Usage time unavailable.` : '**Gun:** Insufficient named gun events.',
    ...[['Credits spent', economy.spend], ['Equipment carried', economy.loadout]].map(([label, metric]) =>
      metric.rounds ? `**${label}:** ${Math.round(metric.total / metric.rounds).toLocaleString('en-US')} credits per round across ${metric.rounds} rounds` : `**${label}:** Unavailable.`),
    'Spending measures purchases. Equipment value includes gear carried into the round.',
  ].join('\n');
}

function statTable(headers, widths, rows) {
  const line = (values) => values.map((value, index) =>
    String(value ?? '—').replace(/[`\r\n]/g, ' ').slice(0, widths[index]).padEnd(widths[index])
  ).join('  ').trimEnd();
  const lines = [line(headers)];
  let length = lines[0].length;
  for (const row of rows) {
    const next = line(row);
    if (length + next.length > 940) {
      lines.push('… more rows');
      break;
    }
    lines.push(next);
    length += next.length + 1;
  }
  return '\`\`\`\n' + lines.join('\n') + '\n\`\`\`';
}

function matchTable(matches, rrByMatch) {
  const cell = (value, width) => String(value ?? '—').replace(/[`\r\n]/g, ' ').slice(0, width).padEnd(width);
  const rows = matches.slice(0, 10).map((match) => {
    const result = match.isWin === true ? 'W' : match.isWin === false ? 'L' : '—';
    const score = Number.isFinite(match.roundsWon) && Number.isFinite(match.roundsLost)
      ? `${match.roundsWon}-${match.roundsLost}` : '—';
    const kda = [match.kills, match.deaths, match.assists].every(Number.isFinite)
      ? `${match.kills}/${match.deaths}/${match.assists}` : '—';
    const performance = Number.isFinite(match.performanceScore) ? match.performanceScore.toFixed(1) : '—';
    return [cell(result, 1), cell(score, 5), cell(match.map, 9), cell(match.agent, 9),
      cell(kda, 8), cell(Number.isFinite(match.acsPerRound) ? match.acsPerRound.toFixed(0) : '—', 4), cell(performance, 6), formatRRChange(rrByMatch.get(match.matchId)?.rrChange) ?? '—'].join(' ');
  });
  return ['R Score Map       Agent     K/D/A    ACS  Perf   RR', ...rows].join('\n');
}

function buildRRHistory(history) {
  return history.filter((entry) => entry && Number.isFinite(entry.rrChange ?? entry.rr_change)).slice(0, 5);
}

function rrBars(entries) {
  return entries.slice().reverse().map((entry) => {
    const rr = entry.rrChange ?? entry.rr_change;
    const segment = '█'.repeat(Math.min(10, Math.ceil(Math.abs(rr) / 5)));
    const bar = rr < 0 ? segment.padStart(10) + '│' : ' '.repeat(10) + '│' + segment;
    return `${bar.padEnd(21)} ${formatRRChange(rr)}`;
  }).join('\n');
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
    headshotPercent = null,
    damageDeltaPerRound = null,
    winPercent = 0,
    topAgents = [],
    matchesAnalyzed = 0,
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

  const results = wins + losses;
  const recap = results > 0
    ? `Won **${wins} of ${results}** recent Competitive matches with known results.`
    : 'No recent Competitive results available.';
  const updates = buildRRHistory(mmrHistory);
  const net = updates.reduce((total, entry) => total + (entry.rrChange ?? entry.rr_change), 0);
  const momentum = updates.length ? ` Rank Rating moved **${formatRRChange(net)}** over ${updates.length} recorded updates.` : '';

  const embed = new EmbedBuilder()
    .setColor(VALORANT_RED)
    .setAuthor({ name: '◆ VALORANT / RANKED REPORT' })
    .setTitle(String(riotId).slice(0, 256))
    .setDescription(`**${descriptionParts[0]}**${descriptionParts.slice(1).map((part) => `  ·  ${part}`).join('')}\n\n**At a glance**\n${recap}${momentum}`);

  const cardImage = accountData?.card?.small || accountData?.card?.wide || accountData?.card?.large;
  if (cardImage) {
    embed.setThumbnail(cardImage);
  }

  if (matchesAnalyzed > 0) {
    const recentValue = [
      `**Matches reviewed:** ${matchesAnalyzed}`,
      `**Win rate:** ${formatters.formatPercent(winPercent)}`,
      `**Most played in sample:** ${topAgents.length > 0 ? topAgents.join(', ') : 'N/A'}`,
    ];

    embed.addFields({
      name: '◆ Competitive Snapshot',
      value: recentValue.join('\n'),
      inline: true,
    });
  }

  const matchesAvailable = Number(matchesAnalyzed) > 0;
  const combatValue = matchesAvailable ? [
    `**${formatters.formatKDA(kills, deaths, assists)}** K/D/A  ·  ${formatters.formatKD(kills, deaths)} K/D`,
    `**${formatters.formatACS(acsPerRound)}** ACS  ·  ${headshotPercent == null ? 'N/A' : formatters.formatPercent(headshotPercent)} headshots by hit${playerData.recordedHits ? ` (${playerData.recordedHits} hits)` : ''}`,
    `**${formatters.formatADR(adrPerRound)}** ADR  ·  ${formatters.formatDamageDelta(damageDeltaPerRound)} DDΔ`,
  ] : ['Competitive combat data unavailable.'];

  embed.addFields({
    name: 'Combat',
    value: combatValue.join('\n'),
    inline: true,
  });

  if (recentMatches.length) {
    embed.addFields({ name: 'Recent Sample Leaders & Economy',
      value: sampleReadout(recentMatches, playerData.partySummary || []) });
  }

  const roundGroups = new Map([
    ['Playing attack', { won: 0, total: 0 }],
    ['Playing defense', { won: 0, total: 0 }],
    ['Team got first kill', { won: 0, total: 0 }],
    ['Opponent got first kill', { won: 0, total: 0 }],
  ]);
  for (const match of recentMatches) {
    for (const round of match.roundResults || []) {
      const labels = [
        round.side === 'attack' ? 'Playing attack' : round.side === 'defense' ? 'Playing defense' : null,
        round.opened === true ? 'Team got first kill' : round.opened === false ? 'Opponent got first kill' : null,
      ];
      for (const label of labels) {
        const group = roundGroups.get(label);
        if (!group) continue;
        group.total++;
        if (round.won) group.won++;
      }
    }
  }
  const roundRows = [...roundGroups].filter(([, group]) => group.total).map(([label, group]) => [
    label, `${group.won}/${group.total}`, `${Math.round(100 * group.won / group.total)}%`,
  ]);
  if (roundRows.length) {
    embed.addFields({ name: '⚑ How Often Did Your Team Win the Round?',
      value: statTable(['Situation', 'Won', 'Win %'], [24, 9, 5], roundRows) +
        '\nEach row uses rounds with the required data. A round can count in both a side and a first-kill row.' });
  }

  const progress = compareRoundWindows(recentMatches);
  if (progress.length) {
    const record = (row) => `${row.won}/${row.total} (${Math.round(100 * row.won / row.total)}%)`;
    const { prior, recent } = progress[0];
    const rows = progress.slice(0, 3).map(({ prior, recent }) => [
      `${recent.map} / ${recent.agent} / ${recent.side}`, record(prior), record(recent),
    ]);
    const direction = Math.sign(recent.won * prior.total - prior.won * recent.total);
    const comparison = direction > 0 ? 'won a larger share of rounds' : direction < 0
      ? 'won a smaller share of rounds' : 'won the same share of rounds';
    embed.addFields({ name: '↗ Compare Your Recent Games',
      value: `On **${escapeMarkdown(recent.map)}** playing **${escapeMarkdown(recent.agent)}** on ${recent.side}, you ${comparison} in the newer block.\n` +
        statTable(['Map / agent / side', 'Earlier 5', 'Latest 5'], [27, 13, 13], rows) +
        '\nSame act. Each row needs 10 known rounds per block. Matchups and teammates may differ.' });
  } else if (recentMatches.length >= 10) {
    embed.addFields({ name: '↗ Compare Your Recent Games',
      value: 'No comparable split in this sample. The comparison needs two sets of five matches in one act and at least 10 known rounds in each set on the same map, agent, and side.' });
  }

  const rrByMatch = new Map(mmrHistory.filter((entry) => entry?.matchId).map((entry) => [entry.matchId, entry]));
  if (recentMatches.length) {
    embed.addFields({ name: '▤ Recent Competitive · Newest First',
      value: `\`\`\`\n${matchTable(recentMatches, rrByMatch)}\n\`\`\`\nPerf = Performance Score · — = unavailable` });
  }

  const rrHistory = buildRRHistory(mmrHistory);
  if (rrHistory.length) {
    const net = rrHistory.reduce((sum, entry) => sum + (entry.rrChange ?? entry.rr_change), 0);
    embed.addFields({
      name: '↕ Observed RR Changes',
      inline: true,
      value: `Last ${rrHistory.length} updates · oldest first · net ${formatRRChange(net)} RR\n\`\`\`\n${rrBars(rrHistory)}\n\`\`\``,
    });
  }

  const squad = recentMatches[0]?.teammates;
  if (squad?.length) {
    embed.addFields({
      name: 'Latest Shown Match · Teammates',
      inline: true,
      value: squad.map(({ agent, name, tag, kills, deaths, assists }) => {
        const riotId = name ? (tag ? `${name}#${tag}` : name) : 'Name unavailable';
        return `**${escapeMarkdown(String(agent || 'Unknown agent').slice(0, 40))}** · ${escapeMarkdown(riotId.slice(0, 60))} · ${formatters.formatKDA(kills, deaths, assists)}`;
      }).join('\n'),
    });
  }

  const parties = playerData.partySummary || [];
  const teammates = playerData.teammateSummary || [];
  const identity = (row) => row.key || row.riotId.toLowerCase();
  const partyIds = new Set(parties.map(identity));
  const comparison = [
    ...parties.map((row) => ({ ...row, group: 'Party' })),
    ...teammates.filter((row) => !partyIds.has(identity(row)))
      .map((row) => ({ ...row, group: 'Team' })),
  ].sort((a, b) => Number(b.friend) - Number(a.friend));
  if (comparison.length || playerData.selectedFriend) {
    const rows = comparison.slice(0, 6).map((row) => [
      row.friend ? `*${row.riotId}` : row.riotId,
      row.group,
      row.decided ? `${row.wins}/${row.decided}` : '—',
      row.decided ? `${Math.round(100 * row.wins / row.decided)}%` : '—',
      row.roundGames ? formatRRChange(Number((row.roundDiff / row.roundGames).toFixed(1))) : '—',
      row.tradeGames ? `${row.trades}/${row.tradeGames}` : '—',
    ]);
    const parts = [];
    if (rows.length) {
      parts.push(statTable(['Player', 'Group', 'Wins', 'Win %', 'Margin', 'Trades'], [19, 5, 5, 5, 6, 7], rows));
      parts.push('**Party** = queued together. **Team** = played on your side. Party rows count only party games.');
      parts.push('**Margin** = average rounds won minus lost. **Trades** = times they avenged your death within 5 seconds / games with kill records.');
    }
    if (comparison.some((row) => row.friend)) parts.push('`*` marks your friend.');
    else if (playerData.selectedFriend) parts.push('Your marked friend was not found in this sample.');
    if (comparison.length > rows.length) parts.push(`Showing ${rows.length} of ${comparison.length} players.`);
    embed.addFields({ name: '👥 How You Played Together', value: parts.join('\n') });
  }

  const extraParts = [];

  // Keep the existing profile fields and add bounded, independently optional surfaces.
  const career = playerData.career;
  const safeLabel = (value) => String(value).replace(/[*`~|<>@]/g, '').slice(0, 70);
  const prestige = playerData.lifetimePrestige && typeof playerData.lifetimePrestige === 'object'
    ? Object.entries(playerData.lifetimePrestige).filter(([, value]) => Number.isFinite(value?.count)) : [];
  const careerRows = [
    ...prestige.map(([rank, value]) => ['Prestige', rank, `×${value.count}`]),
    ...(career?.mastery || []).map(({ agent, level }) => ['Mastery', agent, `Lv. ${level}`]),
    ...(career?.accolades || []).map(({ label, count }) => ['Accolade', label.replace(/_/g, ' '), `×${count}`]),
  ];
  if (careerRows.length) {
    embed.addFields({ name: '🏅 Career',
      value: statTable(['Category', 'Item', 'Count/Lv.'], [8, 24, 9], careerRows) });
  }
  const actAccolades = career?.actAccolades;
  if (actAccolades?.entries?.length) {
    embed.addFields({ name: '★ Accolades in the Latest Match’s Act',
      value: `Act: ${escapeMarkdown(String(actAccolades.label).slice(0, 50))}\n` +
        statTable(['Accolade', 'Earned'], [26, 8], actAccolades.entries.map(({ label, count }) =>
          [label.replace(/_/g, ' '), count])) });
  }
  const missingCareer = [
    !career?.mastery?.length ? 'Agent Mastery' : null,
    !career?.accolades?.length ? 'Accolades' : null,
  ].filter(Boolean);
  if (missingCareer.length) {
    embed.addFields({ name: 'Career Data Availability', value: career
      ? `No displayable data from HenrikDev for: ${missingCareer.join(', ')}.`
      : `${missingCareer.join(' and ')} require experimental career data.`, inline: false });
  }
  const maps = Array.isArray(playerData.mapSummary) ? playerData.mapSummary : [];
  if (maps.length) {
    const best = maps.filter((row) => row.decided >= 5 && row.winRate !== null)
      .sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0];
    const sideRecord = (side) => side?.total ? `${side.wins}/${side.total}` : '—';
    const rows = maps.map((row) => [
      safeLabel(row.map), `${row.wins}/${row.decided}`,
      row.winRate === null ? null : `${row.winRate.toFixed(0)}%`,
      row.performanceScore === null ? null : `${row.performanceScore.toFixed(1)} (${row.performanceSamples})`,
      sideRecord(row.attack), sideRecord(row.defense),
    ]);
    const table = statTable(['Map', 'Wins', 'Win %', 'Avg perf', 'Attack', 'Defense'], [10, 5, 5, 10, 6, 7], rows);
    const summary = best ? `Best by win rate: ${safeLabel(best.map)} (minimum 5 results).`
      : 'Best map requires 5 known results on one map.';
    embed.addFields({ name: '🗺 Competitive Maps', value: `${table}\n${summary}\nAttack/defense = rounds won out of known rounds.\nAvg perf = Performance Score (matches with a score).\nRecent sample only; not Riot Map Rating.` });

  }

  if (level !== 'N/A') {
    extraParts.push(`**Level:** ${level}`);
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
      name: 'Account & Rank Details',
      value: extraParts.join(' · '),
      inline: false,
    });
  }

  let footerText = 'HenrikDev rank and match data';
  if (!profileData && mmrData) {
    footerText = 'HenrikDev rank data · Match data unavailable';
  } else if (profileData && !mmrData) {
    footerText = 'Recent HenrikDev matches (Rank data unavailable)';
  } else if (accountData && !profileData && !mmrData) {
    footerText = 'HenrikDev account data only';
  }
  footerText += ' · Up to 10 Competitive matches · HS: headshot rate · ACS: combat score/round · ADR: damage/round · DDΔ: damage dealt minus received/round';

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
    .setColor(VALORANT_RED)
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
    .setColor(VALORANT_RED)
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
