const { comparePartyResults } = require('../services/teammateStats');
const { summarizeSpendingEfficiency } = require('../services/analytics');
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
  for (const match of matches) {
    for (const [weapon, kills] of Object.entries(match.weaponKills || {})) {
      weapons.set(weapon, (weapons.get(weapon) || 0) + kills);
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
    bestAgent ? `**Highest agent win rate:** ${label(bestAgent.name)} · ${bestAgent.wins}/${bestAgent.games} wins` : '**Agent:** Need 3 known results on one agent.',
    partner ? `**Highest party win rate:** ${label(partner.riotId)} · ${partner.wins}/${partner.decided} party wins` : '**Queue partner:** Need 3 confirmed party results with one player.',
    gun ? `**Most gun kills:** ${label(gun[0])} · ${gun[1]} kills.` : '**Gun:** Insufficient named gun events.',
  ].join('\n');
}

function economyReadout(matches) {
  const format = (value) => Math.round(value).toLocaleString('en-US');
  function average(field) {
    const covered = matches.filter((match) => Number.isFinite(match[field]) && match[field] >= 0 &&
      Number.isFinite(match.roundsPlayed) && match.roundsPlayed > 0);
    const rounds = covered.reduce((sum, match) => sum + match.roundsPlayed, 0);
    const total = covered.reduce((sum, match) => sum + match[field] * match.roundsPlayed, 0);
    return rounds ? [format(total / rounds), `${rounds} rounds`] : ['—', '—'];
  }

  const { roundWins, damage } = summarizeSpendingEfficiency(matches);
  const rows = [
    ['Spent / round', ...average('creditsPerRound')],
    ['Gear value / round', ...average('loadoutPerRound')],
    ['Spend / round won', roundWins?.perThousand > 0 ? format(1000 / roundWins.perThousand) : '—',
      roundWins ? `${roundWins.matches} games` : '—'],
    ['Damage / 1k spent', damage ? format(damage.perThousand) : '—',
      damage ? `${damage.matches} games` : '—'],
  ];
  return statTable(['Measure', 'Value', 'Sample'], [18, 7, 10], rows) +
    '\nSpent = credits you paid. Gear value includes carried gear.' +
    '\nSpend / round won = your spend ÷ team rounds won.' +
    '\nDamage / 1k spent = your damage per 1,000 credits.';
}

function statTable(headers, widths, rows) {
  const lines = [];
  for (const row of [headers, ...rows]) {
    const cells = row.map((value, index) => {
      const characters = Array.from(String(value ?? '—').replace(/[`\r\n]/g, ' '));
      const chunks = [];
      for (let i = 0; i < characters.length; i += widths[index]) {
        chunks.push(characters.slice(i, i + widths[index]).join(''));
      }
      return chunks;
    });
    const height = Math.max(1, ...cells.map((cell) => cell.length));
    const next = Array.from({ length: height }, (_, line) => cells
      .map((cell, index) => (cell[line] || '').padEnd(widths[index])).join(' ').trimEnd());
    lines.push(...next);
  }
  return '\`\`\`\n' + lines.join('\n') + '\n\`\`\`';
}

// A full-width label sits above each numeric row, so long names never consume a stat column.
function groupedStatTable(headers, widths, rows) {
  const clean = (text) => String(text).replace(/[`\r\n]/g, ' ');
  const body = (table) => table.split('\n').slice(1, -1);
  const [header] = body(statTable(headers, widths, []));
  const lines = rows.flatMap(([label, ...values]) => [
    clean(label), ...body(statTable(headers, widths, [values])).slice(1), '',
  ]);
  return '```\n' + [header, '', ...lines].join('\n').trimEnd() + '\n```';
}

function matchTable(matches, rrByMatch) {
  const rows = matches.slice(0, 10).map((match) => {
    const result = match.isWin === true ? 'W' : match.isWin === false ? 'L' : '—';
    const score = Number.isFinite(match.roundsWon) && Number.isFinite(match.roundsLost)
      ? `${match.roundsWon}-${match.roundsLost}` : '—';
    const kda = [match.kills, match.deaths, match.assists].every(Number.isFinite)
      ? `${match.kills}/${match.deaths}/${match.assists}` : '—';
    const performance = Number.isFinite(match.performanceScore) ? match.performanceScore.toFixed(1) : '—';
    return [result, score, match.map, match.agent, kda,
      Number.isFinite(match.acsPerRound) ? match.acsPerRound.toFixed(0) : '—',
      performance, formatRRChange(rrByMatch.get(match.matchId)?.rrChange) ?? '—'];
  });
  return [
    statTable(['#', 'R', 'Score', 'Map', 'Agent'], [2, 1, 5, 13, 12],
      rows.map((row, i) => [i + 1, ...row.slice(0, 4)])),
    statTable(['#', 'K/D/A', 'ACS', 'Perf', 'RR'], [2, 10, 5, 8, 6],
      rows.map((row, i) => [i + 1, ...row.slice(4)])),
  ];
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
const reportFields = new WeakMap();

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

  const fields = [];
  const addFields = (...entries) => fields.push(...entries);
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

    addFields({
      name: '◆ Competitive Snapshot',
      value: recentValue.join('\n'),
      inline: true,
    });
  }

  const matchesAvailable = Number(matchesAnalyzed) > 0;
  const combatValue = matchesAvailable ? [
    `**${formatters.formatKDA(kills, deaths, assists)}** K/D/A  ·  ${formatters.formatKD(kills, deaths)} K/D`,
    `**${formatters.formatACS(acsPerRound)}** ACS  ·  ${headshotPercent == null ? 'N/A' : formatters.formatPercent(headshotPercent)} headshots by hit${playerData.recordedHits ? ` (${playerData.recordedHits} hits)` : ''}`,
    `**Damage per round:** ${formatters.formatADR(adrPerRound)} dealt · ${formatters.formatDamageDelta(damageDeltaPerRound)} net`,
  ] : ['Competitive combat data unavailable.'];

  addFields({
    name: 'Combat',
    value: combatValue.join('\n'),
    inline: true,
  });

  // Keep the existing profile fields and add bounded, independently optional surfaces.
  const career = playerData.career;
  const safeLabel = (value) => String(value).replace(/[*`~|<>@]/g, '').slice(0, 70);
  const prestige = playerData.lifetimePrestige && typeof playerData.lifetimePrestige === 'object'
    ? Object.entries(playerData.lifetimePrestige).filter(([, value]) => Number.isFinite(value?.count)) : [];
  const careerSections = [
    ['🏅 Rank Legacy', ['Rank', 'Times'], [23, 8], prestige.map(([rank, value]) => [rank, `×${value.count}`])],
    ['◆ Agent Mastery', ['Agent', 'Level'], [23, 8], (career?.mastery || []).map(({ agent, level }) => [agent, `Lv. ${level}`])],
    ['🏅 Lifetime Accolades', ['Accolade', 'Earned'], [26, 8], (career?.accolades || []).map(({ label, count }) => [label.replace(/_/g, ' '), count])],
    [`★ Act Accolades · ${String(career?.actAccolades?.label || '').slice(0, 50)}`, ['Accolade', 'Earned'], [26, 8],
      (career?.actAccolades?.entries || []).map(({ label, count }) => [label.replace(/_/g, ' '), count])],
  ];
  for (const [name, headers, widths, rows] of careerSections) {
    let batch = [];
    let part = 1;
    const add = () => addFields({ name: part++ === 1 ? name : `${name} · Continued`,
      value: statTable(headers, widths, batch) });
    for (const row of rows) {
      if (batch.length && statTable(headers, widths, [...batch, row]).length > 1000) {
        add();
        batch = [];
      }
      batch.push(row);
    }
    if (batch.length) add();
  }
  const missingCareer = [
    !career?.mastery?.length ? 'Agent Mastery' : null,
    !career?.accolades?.length ? 'Accolades' : null,
  ].filter(Boolean);
  if (missingCareer.length) {
    addFields({ name: 'Career Data Availability', value: career
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
    const results = statTable(['Map', 'Wins', 'Win %', 'Avg perf'], [13, 5, 5, 12], rows.map((row) => row.slice(0, 4)));
    const sides = statTable(['Map', 'Attack', 'Defense'], [13, 8, 8], rows.map((row) => [row[0], ...row.slice(4)]));
    const summary = best ? `Best by win rate: ${safeLabel(best.map)} (minimum 5 results).`
      : 'Best map requires 5 known results on one map.';
    addFields({ name: '🗺 Competitive Maps', value: `${results}\n${summary}\nAvg perf = Performance Score (matches with a score).\nRecent sample only; not Riot Map Rating.` },
      { name: 'Competitive Maps · Rounds Won by Side', value: sides + '\nRounds won out of known rounds.' });

  }

  if (recentMatches.length) {
    addFields({ name: 'Recent Sample Leaders & Economy',
      value: sampleReadout(recentMatches, playerData.partySummary || []) + '\n\n' + economyReadout(recentMatches) });
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
    const firstKillRead = ['Team got first kill', 'Opponent got first kill'].flatMap((label, index) => {
      const { won, total } = roundGroups.get(label);
      return total ? [`Your team won **${won} of ${total}** rounds after ${index === 0 ? 'getting' : 'giving up'} the first kill.`] : [];
    }).join(' ');
    addFields({ name: '⚑ How Often Did Your Team Win the Round?',
      value: (firstKillRead ? firstKillRead + '\n' : '') + statTable(['Situation', 'Won', 'Win %'], [24, 9, 5], roundRows) +
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
    addFields({ name: '↗ Compare Your Recent Games',
      value: `On **${escapeMarkdown(recent.map)}** playing **${escapeMarkdown(recent.agent)}** on ${recent.side}, you ${comparison} in the newer block.\n` +
        groupedStatTable(['Earlier 5', 'Latest 5'], [14, 14], rows) +
        '\nSame act. Each row needs 10 known rounds per block. Matchups and teammates may differ.' });
  } else if (recentMatches.length >= 10) {
    addFields({ name: '↗ Compare Your Recent Games',
      value: 'No comparable split in this sample. The comparison needs two sets of five matches in one act and at least 10 known rounds in each set on the same map, agent, and side.' });
  }

  const rrByMatch = new Map(mmrHistory.filter((entry) => entry?.matchId).map((entry) => [entry.matchId, entry]));
  if (recentMatches.length) {
    const [results, stats] = matchTable(recentMatches, rrByMatch);
    addFields(
      { name: '▤ Recent Competitive · Newest First', value: results },
      { name: 'Recent Competitive · Match Stats', value: stats + '\nACS = Average Combat Score · Perf = Performance Score · — = unavailable' },
    );
  }

  const rrHistory = buildRRHistory(mmrHistory);
  if (rrHistory.length) {
    const net = rrHistory.reduce((sum, entry) => sum + (entry.rrChange ?? entry.rr_change), 0);
    addFields({
      name: '↕ Observed RR Changes',
      inline: true,
      value: `Last ${rrHistory.length} updates · oldest first · net ${formatRRChange(net)} RR\n\`\`\`\n${rrBars(rrHistory)}\n\`\`\``,
    });
  }

  const squad = recentMatches[0]?.teammates;
  if (squad?.length) {
    addFields({
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
      parts.push(groupedStatTable(['Group', 'Wins', 'Win %', 'Margin', 'Trades'], [5, 5, 5, 7, 8], rows));
      parts.push('**Party** = queued together. **Team** = played on your side. Party rows count only party games.');
      parts.push('**Margin** = average rounds won minus lost. **Trades** = times they avenged your death within 5 seconds / games with kill records.');
    }
    if (comparison.some((row) => row.friend)) parts.push('`*` marks your friend.');
    else if (playerData.selectedFriend) parts.push('Your marked friend was not found in this sample.');
    if (comparison.length > rows.length) parts.push(`Showing ${rows.length} of ${comparison.length} players.`);
    addFields({ name: '👥 How You Played Together', value: parts.join('\n') });
  }

  const partnerSplits = comparePartyResults(recentMatches, parties);
  if (partnerSplits.length) {
    const record = ({ wins, games }) => `${wins}/${games} (${Math.round(100 * wins / games)}%)`;
    const rows = partnerSplits.slice(0, 3).map((row) => [
      row.riotId, record(row.withPartner), record(row.withoutPartner),
    ]);
    addFields({ name: 'With and Without Your Party Partner',
      value: groupedStatTable(['Queued together', 'Queued apart'], [16, 16], rows) +
        '\nMatch wins. Games with unknown party status are excluded.' });
  }

  if (playerData.savedPartyResults?.length) {
    const record = ({ wins, games }) => `${wins}/${games} (${Math.round(100 * wins / games)}%)`;
    const rows = playerData.savedPartyResults.slice(0, 3).map((row) =>
      [row.riotId, record(row.together), record(row.apart)]);
    addFields({ name: 'Saved Party Records · Same Act',
      value: groupedStatTable(['Queued together', 'Queued apart'], [16, 16], rows) +
        '\nFrom saved games. These are observed results from different matches.' });
  }

  const extraParts = [];

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
    addFields({
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
  footerText += ' · Up to 10 Competitive matches';

  embed.setFooter({ text: footerText });

  reportFields.set(embed, fields);
  embed.setFields(fields.filter((field) => field.value.length <= 1024).slice(0, 25));
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

// Discord applies its text limit across all embeds on a single message.
function createProfileReply(embed) {
  const { fields: visibleFields = [], ...header } = embed.toJSON();
  const allFields = reportFields.get(embed) || visibleFields;
  const baseLength = [header.title, header.description, header.author?.name, header.footer?.text]
    .reduce((sum, text) => sum + (text?.length || 0), 0);
  const priority = (field) => /Compare Your|How Often|Sample Leaders|How You Played Together/.test(field.name) ? 1 : 0;
  let length = baseLength;
  const included = new Set();
  for (const field of [...allFields].sort((a, b) => priority(a) - priority(b))) {
    const size = field.name.length + field.value.length;
    if (field.value.length > 1024 || included.size >= 24 || length + size > 5500) continue;
    included.add(field);
    length += size;
  }
  const reply = { embeds: [{ ...header, fields: allFields.filter((field) => included.has(field)) }], allowedMentions: { parse: [] } };
  if (included.size !== allFields.length) {
    const overflow = allFields.filter((field) => !included.has(field));
    reply.content = `The attached ranked report contains ${overflow.length} additional section(s).`;
    reply.files = [{ name: 'ranked-report-details.txt', attachment: Buffer.from(
      [header.title, ...overflow.map((field) => `${field.name}\n${field.value.replace(/^```$/gm, '')}`)].join('\n\n'), 'utf8') }];
  }
  return reply;
}

module.exports = {
  createProfileEmbed,
  createProfileReply,
  createMatchEmbed,
  createRecentMatchesOverviewEmbed,
  createErrorEmbed,
  createMMREmbed,
};
