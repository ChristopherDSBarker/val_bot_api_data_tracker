const { roleOf } = require('../services/agentRoles');
const { summarizeRoles } = require('../services/valorantCareer');
const { reviewLatestMatch, latestSession } = require('../services/coach');
const { summarizeQueueGroups } = require('../services/teammateStats');
const { summarizeSpendingEfficiency, summarizeObservedRR } = require('../services/analytics');
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

function roleReadout(matches) {
  const { baseline, roles } = summarizeRoles(matches, roleOf);
  if (!roles.length) return '**Role:** —';
  const percent = (wins, games) => Math.round(100 * wins / games);
  const eligible = roles.filter((row) => row.games >= 3)
    .sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games);
  const label = ({ role, games, wins }) => `${role} ${wins}/${games} (${percent(wins, games)}%)`;
  const reference = `Your recent baseline: ${baseline.wins}/${baseline.games} (${percent(baseline.wins, baseline.games)}%).`;
  if (eligible.length < 2) {
    return `${roles.map(label).join(' · ')}\n${reference}`;
  }

  const [first, second] = eligible;
  const tied = first.wins * second.games === second.wins * first.games;
  const delta = Math.round(100 * (first.wins / first.games - baseline.wins / baseline.games));
  const lines = [`${tied ? 'Tied roles' : 'Highest role win rate'}: ${label(first)} · ${label(second)}`,
    `${formatRRChange(delta)} percentage points vs your recent baseline of ${percent(baseline.wins, baseline.games)}%.`];
  for (const row of [first, second]) {
    if (row.maps.size === 1 && [...row.maps.values()][0] === row.games) {
      lines.push(`${row.role}: all ${row.games} on ${escapeMarkdown([...row.maps.keys()][0].slice(0, 50))}.`);
    }
    if (row.role === 'Duelist' && row.knownOpeners >= 10) {
      lines.push(`Duelist first kills: ${row.firstKills}/${row.knownOpeners} known openings.`);
    }
    if (row.role === 'Sentinel' && row.defenseRounds >= 10) {
      lines.push(`Sentinel defense: ${row.defenseWins}/${row.defenseRounds} rounds won.`);
    }
  }
  return lines.join('\n');
}

function sampleReadout(matches, parties, coverage) {
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
  coverage.agents = `${[...agents.values()].filter((row) => row.games >= 3).length}/${agents.size}`;
  coverage.partners = `${parties.filter((row) => row.decided >= 3).length}/${parties.length}`;
  coverage.weapons = matches.filter((match) => Object.keys(match.weaponKills || {}).length).length;
  const gun = [...weapons].sort((a, b) => b[1] - a[1])[0];

  const label = (value) => escapeMarkdown(String(value).slice(0, 60));
  return [
    bestAgent ? `**Highest agent win rate:** ${label(bestAgent.name)} · ${bestAgent.wins}/${bestAgent.games} wins` : '**Agent:** —',
    roleReadout(matches),
    partner ? `**Highest party win rate:** ${label(partner.riotId)} · ${partner.wins}/${partner.decided} party wins` : '**Queue partner:** —',
    gun ? `**Most gun kills:** ${label(gun[0])} · ${gun[1]} kills.` : '**Gun:** —',
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
  return statTable(['Measure', 'Value', 'Sample'], [18, 7, 10], rows);
}

// Conservative monospace widths for wide characters and combining marks.
function tableWidth(value) {
  return Array.from(value).reduce((sum, char) => sum + (/\p{Mark}|\u200d/u.test(char) ? 0
    : /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]|\p{Extended_Pictographic}/u.test(char) ||
      char.codePointAt(0) >= 0x20000 ? 2 : 1), 0);
}

function wrapTableText(text, width) {
  const chunks = [];
  let line = '';
  let size = 0;
  for (const char of text) {
    const nextSize = tableWidth(char);
    if (size + nextSize > width && line) {
      chunks.push(line);
      line = '';
      size = 0;
    }
    line += char;
    size += nextSize;
  }
  if (line) chunks.push(line);
  return chunks;
}

function statTable(headers, widths, rows) {
  const lines = [];
  for (const row of [headers, ...rows]) {
    const cells = row.map((value, index) =>
      wrapTableText(String(value ?? '—').replace(/[`\r\n]/g, ' '), widths[index]));
    const height = Math.max(1, ...cells.map((cell) => cell.length));
    const next = Array.from({ length: height }, (_, line) => cells
      .map((cell, index) => {
        const value = cell[line] || '';
        return value + ' '.repeat(Math.max(0, widths[index] - tableWidth(value)));
      }).join(' ').trimEnd());
    lines.push(...next);
  }
  return '\`\`\`\n' + lines.join('\n') + '\n\`\`\`';
}

// A full-width label sits above each numeric row, so long names never consume a stat column.
function groupedStatTable(headers, widths, rows, notes = []) {
  const clean = (text) => String(text).replace(/[`\r\n]/g, ' ');
  const body = (table) => table.split('\n').slice(1, -1);
  const [header] = body(statTable(headers, widths, []));
  const wrapLabel = (label) => {
    const lines = [];
    let current = '';
    for (const word of clean(label).split(/\s+/)) {
      if (current && tableWidth(current) + tableWidth(word) + 1 > 40) {
        lines.push(current);
        current = '';
      }
      current += current ? ` ${word}` : word;
    }
    if (current) lines.push(current);
    return lines.flatMap((line) => wrapTableText(line, 40));
  };
  const lines = rows.flatMap(([label, ...values], index) => [
    ...wrapLabel(label), ...body(statTable(headers, widths, [values])).slice(1),
    ...(notes[index] || []).map(clean), '',
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
const reportSummaries = new WeakMap();

function seasonLabel(value) {
  const text = String(value ?? '').trim();
  const episode = /^e(\d+)a(\d+)$/i.exec(text);
  if (episode) return `Episode ${Number(episode[1])}, Act ${Number(episode[2])}`;
  const season = /^v(\d+)a(\d+)$/i.exec(text);
  if (season) return `Season ${Number(season[1])}, Act ${Number(season[2])}`;
  return /^(Episode|Season) .+ Act /i.test(text) ? text : 'Unavailable';
}

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
    currentRank = 'Rank unavailable',
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

  const descriptionParts = [currentRank || 'Rank unavailable'];

  if (currentRR !== null) {
    descriptionParts.push(`${currentRR} RR`);
  }

  const lastChangeText = formatRRChange(lastRRChange);
  if (lastChangeText !== null) {
    descriptionParts.push(`${lastChangeText} RR last match`);
  }

  if (peakRank !== 'N/A' && peakRank !== null) {
    descriptionParts.push(`Career peak: ${peakRank}`);
  }

  const observed = recentMatches.filter((match) => typeof match.isWin === 'boolean');
  const useMatchResults = wins + losses === 0 && observed.length > 0;
  const resultWins = useMatchResults ? observed.filter((match) => match.isWin).length : wins;
  const results = useMatchResults ? observed.length : wins + losses;
  const recap = results > 0
    ? `Won **${resultWins} of ${results}** recent Competitive matches with known results.`
    : 'No recent Competitive results available.';
  const updates = buildRRHistory(mmrHistory);
  const net = updates.reduce((total, entry) => total + (entry.rrChange ?? entry.rr_change), 0);
  const momentum = updates.length ? ` Rank Rating moved **${formatRRChange(net)}** over ${updates.length} recorded updates.` : '';

  const coach = reviewLatestMatch(recentMatches);
  const coachHint = coach ? '\nRank, momentum and the full report follow.' : '';
  const embed = new EmbedBuilder()
    .setColor(VALORANT_RED)
    .setAuthor({ name: playerData.mockData ? '◆ VALORANT / EXAMPLE REPORT' : '◆ VALORANT / RANKED REPORT + COACH' })
    .setTitle(escapeMarkdown(String(riotId)).slice(0, 256))
    .setDescription(`**${descriptionParts[0]}**${descriptionParts.slice(1).map((part) => `  ·  ${part}`).join('')}\n\n**At a glance**\n${recap}${momentum}${coachHint}`);

  const fields = [];
  const addFields = (...entries) => fields.push(...entries);
  const cardImage = accountData?.card?.small || accountData?.card?.wide || accountData?.card?.large;
  if (cardImage) {
    embed.setThumbnail(cardImage);
  }

  const changesRR = updates.map((entry) => entry.rrChange ?? entry.rr_change);
  const directionRR = changesRR.every((value) => value > 0) ? 'all RR gains'
    : changesRR.every((value) => value < 0) ? 'all RR losses'
      : changesRR.every((value) => value === 0) ? 'all zero changes' : 'mixed changes';
  const momentumReadout = updates.length
    ? `**Momentum:** ${formatRRChange(net)} RR over ${updates.length} updates, ${directionRR}. Oldest first.\n\`\`\`\n${rrBars(updates)}\n\`\`\`` : '';

  if (coach) {
    const { match, score, opened, conceded, personalFirstKills, personalCoverage, openingBaseline, practice } = coach;
    const result = match.isWin ? 'Won' : 'Lost';
    const map = escapeMarkdown(String(match.map || 'unknown map').slice(0, 60));
    const roleLabel = match.role && match.agent ? ` · ${escapeMarkdown(match.agent)} (${match.role})` : '';
    const readout = [`**${result}${score ? ` ${score}` : ''} on ${map}.**${roleLabel}`];
    if (opened.total) readout.push(`Your team won ${opened.won}/${opened.total} rounds after getting the first kill.`);
    if (conceded.total) readout.push(`It won ${conceded.won}/${conceded.total} after the opponent got it.`);
    if (personalCoverage) {
      const share = 100 * personalFirstKills / personalCoverage;
      readout.push(`**Your first kills:** ${personalFirstKills}/${personalCoverage} known openings (${Math.round(share)}%).`);
      if (openingBaseline) {
        const { firstKills, rounds, games } = openingBaseline;
        const earlier = 100 * firstKills / rounds;
        const change = formatRRChange(Math.round(share - earlier));
        readout.push(`**Earlier as ${match.role}:** ${firstKills}/${rounds} (${Math.round(earlier)}%) across ${games} matches this act.`);
        readout.push(`**Change:** ${change} percentage points.`);
      }
    }
    readout.push(`**Replay cue:** ${practice}`);
    if (momentumReadout) readout.push(momentumReadout);
    addFields({ name: '🎯 Coach · Latest Match', value: readout.join('\n') });
  }
  if (!coach && momentumReadout) addFields({ name: '↕ Rank Momentum', value: momentumReadout });

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
    `**${formatters.formatKDA(kills, deaths, assists)}** K/D/A  ·  ${deaths === 0 && kills > 0 ? 'no deaths' : `${formatters.formatKD(kills, deaths)} K/D`}`,
    `**${formatters.formatACS(acsPerRound)}** ACS  ·  ${headshotPercent == null ? 'N/A' : formatters.formatPercent(headshotPercent)} headshots by hit${playerData.recordedHits ? ` (${playerData.recordedHits} hits)` : ''}`,
    `**Damage per round:** ${formatters.formatADR(adrPerRound)} dealt · ${formatters.formatDamageDelta(damageDeltaPerRound)} net`,
  ] : ['Competitive combat data unavailable.'];

  addFields({
    name: 'Combat',
    value: combatValue.join('\n'),
    inline: true,
  });

  const session = latestSession(recentMatches, mmrHistory);
  if (session) {
    const record = session.known ? `Won ${session.wins} of ${session.known} matches with a known result.` : 'Results unavailable.';
    const readout = [`${session.games} matches in the recent session. ${record}`];
    if (session.rrCoverage) readout.push(`Observed RR: ${formatRRChange(session.netRR)} across ${session.rrCoverage}/${session.games} matches.`);
    addFields({ name: '📋 Latest Session · Recent Sample', value: readout.join('\n') });
  }

  // Keep the existing profile fields and add bounded, independently optional surfaces.
  const career = playerData.career;
  const safeLabel = (value) => String(value).replace(/[*`~|<>@]/g, '').slice(0, 70);
  const prestige = playerData.lifetimePrestige && typeof playerData.lifetimePrestige === 'object'
    ? Object.entries(playerData.lifetimePrestige).filter(([, value]) => Number.isFinite(value?.count)) : [];
  const current = currentRank || 'Unavailable';
  const rankLines = [
    `**Current rank:** ${current}${currentRR !== null ? ` · ${currentRR} RR` : ''}`,
    `**Career peak:** ${peakRank && peakRank !== 'N/A' ? peakRank : 'Unavailable'}`,
  ];
  addFields({ name: 'Career Rank', value: rankLines.join('\n') });
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
    addFields({ name: 'Career Data Availability', value: missingCareer.map((item) => `${item}: —`).join('\n') });
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
    const summary = best ? `Highest recent map win rate: ${safeLabel(best.map)} (minimum 5 results).`
      : 'Map comparison needs 5 known results on one map.';
    addFields({ name: '🗺 Competitive Maps', value: `${results}\n${summary}\nAvg perf = Performance Score (matches with a score).\nRecent sample only; not Riot Map Rating.` },
      { name: 'Competitive Maps · Rounds Won by Side', value: sides + '\nRounds won out of known rounds.' });

  }

  const coverage = { agents: '0/0', partners: '0/0', weapons: 0 };
  if (recentMatches.length) {
    addFields({ name: 'Recent Sample Leaders & Economy',
      value: sampleReadout(recentMatches, playerData.partySummary || [], coverage) + '\n\n' + economyReadout(recentMatches) });
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

  const exactProgress = compareRoundWindows(recentMatches);
  const byRole = exactProgress.length === 0;
  const progress = byRole ? compareRoundWindows(recentMatches, { byRole }) : exactProgress;
  const changes = progress.map(({ prior, recent }) => {
    const rateChange = recent.won / recent.total - prior.won / prior.total;
    return { prior, recent, rateChange, roundsMoved: rateChange * recent.total };
  }).filter(({ rateChange }) => rateChange !== 0)
    .sort((a, b) => Math.abs(b.roundsMoved) - Math.abs(a.roundsMoved));

  if (changes.length) {
    const shown = changes.slice(0, 2);
    const leading = shown[0];
    const record = ({ won, total }) => `${Math.round(100 * won / total)}% (${won}/${total})`;
    const matchCount = (key) => new Set(shown.flatMap((row) => [...row[key].matchIds])).size;
    const rows = shown.map(({ prior, recent, rateChange }) => [
      byRole ? `${recent.role} / ${recent.side}` : `${recent.map} / ${recent.agent} / ${recent.side}`,
      record(prior), record(recent), formatRRChange(Math.round(rateChange * 100)),
    ]);
    const notes = shown.map(({ prior, recent }) => {
      if (recent.role !== 'Duelist' || prior.knownOpeners < 10 || recent.knownOpeners < 10 ||
          (!prior.firstKills && !recent.firstKills)) return [];
      return [`First kills: ${prior.firstKills}/${prior.knownOpeners} → ${recent.firstKills}/${recent.knownOpeners}`];
    });
    const side = leading.recent.side === 'attack' ? 'Attack' : 'Defense';
    const equivalent = Math.abs(leading.roundsMoved).toFixed(1);
    const direction = leading.roundsMoved < 0 ? 'fewer' : 'more';
    const changeSummary = `**Biggest shift: ${side}.** About ${equivalent} ${direction} rounds won than at your earlier rate, over the latest ${leading.recent.total} rounds.`;
    const other = shown[1];
    const sameContext = other && (byRole ? other.recent.role === leading.recent.role
      : other.recent.map === leading.recent.map && other.recent.agent === leading.recent.agent);
    const offset = sameContext && Math.sign(other.roundsMoved) !== Math.sign(leading.roundsMoved)
      ? ` The ${other.recent.side} shift went the other way, by about ${Math.abs(other.roundsMoved).toFixed(1)} rounds.`
      : '';
    const scope = `Same act · ${matchCount('prior')} earlier and ${matchCount('recent')} latest matches contributed.`;
    addFields({ name: '↗ Compare Your Recent Games',
      value: [changeSummary + offset, scope,
        groupedStatTable(['Earlier rounds', 'Latest rounds', 'Δ pts'], [15, 15, 6], rows, notes),
        'Values are rounds won / played. Δ pts = change in win percentage.' +
          (byRole ? ' Same role and side; maps may differ.' : ''),
        ...(changes.length > shown.length ? [`Showing the ${shown.length} largest shifts of ${changes.length}.`] : []),
      ].join('\n') });
  } else if (progress.length) {
    addFields({ name: '↗ Compare Your Recent Games',
      value: 'No change in round win rate across the comparable groups.' });
  } else if (recentMatches.length >= 10) {
    addFields({ name: '↗ Compare Your Recent Games',
      value: 'Not enough matching rounds to compare. Each side needs 10 recorded rounds in both match blocks from the same act.' });
  }

  const rrByMatch = new Map(mmrHistory.filter((entry) => entry?.matchId).map((entry) => [entry.matchId, entry]));
  if (recentMatches.length) {
    const [results, stats] = matchTable(recentMatches, rrByMatch);
    addFields(
      { name: '▤ Match Log · 1 of 2', value: results },
      { name: '▤ Match Log · 2 of 2', value: stats + '\nMatch numbers link both panels, newest first.' },
    );
  }

  const rrByResult = summarizeObservedRR(recentMatches, mmrHistory);
  if (rrByResult.count) {
    const rows = [['Match wins', rrByResult.wins], ['Match losses', rrByResult.losses]].map(([label, group]) => [
      label, group?.games ?? '—', group ? formatRRChange(Number(group.average.toFixed(1))) : '—',
      group ? `${formatRRChange(group.min)} to ${formatRRChange(group.max)}` : '—',
    ]);
    addFields({ name: 'RR After Wins and Losses',
      value: statTable(['Result', 'Games', 'Avg RR', 'RR range'], [12, 5, 6, 14], rows) +
        `\n${rrByResult.count} matches with linked RR in the same act${rrByResult.sameVersion ? ' and game version' : ''}. Known placements excluded.` });
  }

  const ranks = playerData.visibleRankResults;
  if (ranks) {
    const rows = [['Higher', ranks.higher], ['Lower', ranks.lower]]
      .filter(([, group]) => group.games >= 40)
      .map(([label, group]) => [label, `${group.wins}/${group.games}`, `${Math.round(100 * group.wins / group.games)}%`]);
    if (rows.length) {
      addFields({ name: 'Results by Opponents’ Visible Rank',
        value: statTable(['Opp. rank', 'Wins', 'Win %'], [10, 8, 5], rows) +
          '\nOpponent average compared with your rank in each match.' +
          '\nSame act. Each row needs 40 games with all five opponent ranks.' });
    }
  }

  const squad = recentMatches[0]?.teammates;
  if (squad?.length) {
    addFields({
      name: 'Latest Shown Match · Teammates',
      inline: false,
      value: squad.map(({ agent, name, tag, kills, deaths, assists }) => {
        const riotId = name ? (tag ? `${name}#${tag}` : name) : 'Name unavailable';
        return `**${escapeMarkdown(String(agent || 'Unknown agent').slice(0, 40))}** · ${escapeMarkdown(riotId.slice(0, 60))} · ${formatters.formatKDA(kills, deaths, assists)}`;
      }).join('\n'),
    });
  }

  const queued = summarizeQueueGroups(recentMatches);
  const partyNames = ['Solo', 'Duo', 'Trio', 'Four players', 'Five-stack'];
  const record = ({ wins, games }) => games ? `${wins}W / ${games}G` : '—';
  const rows = [
    ...queued.parties.map((row) => ({
      ...row, label: row.complete
        ? `${partyNames[row.members.length]} · you${row.members.length ? ` + ${row.members.length}` : ''}`
        : 'Party · roster incomplete',
    })),
    ...queued.teammates.map((row) => ({ ...row, label: `${row.riotId} · teammate, not in party` })),
  ];
  if (rows.length) {
    const shown = rows.slice(0, 6);
    const values = shown.map((row) => [
      row.label, record({ wins: row.wins, games: row.decided }),
      row.decided ? `${Math.round(100 * row.wins / row.decided)}%` : '—',
      row.roundGames ? formatRRChange(Number((row.roundDiff / row.roundGames).toFixed(1))) : '—',
    ]);
    const memberNotes = shown.map((row) => {
      const members = [...(row.perMember?.values() || [])]
        .sort((a, b) => b.trades - a.trades || b.games - a.games || a.name.localeCompare(b.name));
      const notes = members.flatMap((member) => {
        const trades = member.tradeGames ? `${member.trades} (${member.tradeGames}G)` : '—';
        const kd = member.kdGames ? `${member.kills}/${member.deaths} (${member.kdGames}G)` : '—';
        const name = String(member.name).replace(/[`\r\n]/g, ' ');
        return [
          ...wrapTableText(name, 38).map((line) => `  ${line}`),
          ...wrapTableText(`Trades ${trades} · K/D ${kd}`, 36).map((line) => `    ${line}`),
        ];
      });
      if (!row.perMember && row.tradeGames) {
        notes.push(`  Trades ${row.trades} (${row.tradeGames}G)`);
      }
      return notes;
    });
    addFields({ name: '👥 Who You Queued With',
      value: groupedStatTable(['Wins / games', 'Win %', 'Rounds/game'], [13, 6, 11], values, memberNotes) +
        '\nA trade means a teammate killed your killer within 5 seconds. K/D shows kills and deaths. G is games with data.' +
        (rows.length > shown.length ? ` Showing ${shown.length} of ${rows.length} groups.` : '') });
  }

  if (playerData.savedPartyResults?.length) {
    const saved = playerData.savedPartyResults.slice(0, 3).map((row) =>
      [row.riotId, record(row.together), record(row.apart)]);
    addFields({ name: 'Saved Act · Party Partners',
      value: groupedStatTable(['Queued with', 'Queued without'], [15, 15], saved) +
        '\nWins and games across your saved matches in this act.' });
  }

  const extraParts = [];

  if (level !== 'N/A') {
    extraParts.push(`**Level:** ${level}`);
  }

  if (peakSeason !== 'N/A' && peakSeason !== null) {
    extraParts.push(`**Peak Season:** ${seasonLabel(peakSeason)}`);
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

  const economyMatches = recentMatches.filter((match) => match.roundsPlayed > 0 &&
    [match.creditsPerRound, match.loadoutPerRound, match.creditsSpentTotal].some(Number.isFinite)).length;
  addFields({ name: `◆ Sample Coverage · ${recentMatches.length} matches`,
    value: statTable(['Measure', 'Requirement', 'Seen'], [13, 20, 7], [
      ['Agent leader', '3 results per agent', coverage.agents],
      ['Role leader', '3 results in 2 roles', summarizeRoles(recentMatches, roleOf).roles.filter((row) => row.games >= 3).length],
      ['Queue partner', '3 party results', coverage.partners],
      ['Weapon kills', '1 logged gun match', coverage.weapons],
      ['Economy', '1 match with costs', economyMatches],
    ]) + '\n— means unavailable or below the sample requirement. Agent and partner counts show how many qualified out of how many appeared.' });
  addFields({ name: 'Report Legend', value: [
    '**ACS** Average Combat Score',
    '**Damage / 1k spent** Your damage per 1,000 credits',
    '**G** Games with data · **Gear value** Includes carried gear',
    '**K/D/A** Kills, deaths, assists · **Perf** Performance Score',
    '**Rounds/game** Average rounds won minus lost · **RR** Rank Rating',
    '**Spend / round won** Your spend divided by team rounds won',
    '**Spent** Credits paid · **T** Trades after your death · **W** Wins',
  ].join('\n') });

  let footerText = 'HenrikDev rank and match data';
  if (!profileData && mmrData && !recentMatches.length) {
    footerText = 'HenrikDev rank data · Match data unavailable';
  } else if ((profileData || recentMatches.length) && !mmrData) {
    footerText = 'Recent HenrikDev matches (Rank data unavailable)';
  } else if (accountData && !profileData && !mmrData) {
    footerText = 'HenrikDev account data only';
  }
  footerText += ' · Up to 10 Competitive matches';

  embed.setFooter({ text: footerText });

  const roles = summarizeRoles(recentMatches, roleOf);
  const roleRate = (row) => `${Math.round(100 * row.wins / row.games)}%`;
  const roleRows = roles.roles.slice().sort((a, b) => b.games - a.games);
  const roleSummary = roleRows.length ? [
    `Overall: ${roleRate(roles.baseline)} (${roles.baseline.wins} wins in ${roles.baseline.games} games).`,
    ...roleRows.map((row) => `${row.role}: ${roleRate(row)} (${row.wins} of ${row.games} wins)`),
  ].join('\n') : 'No role results in this sample.';
  const partySummary = queued.parties.filter((row) => row.decided).slice(0, 2).map((row) => {
    const type = row.complete ? partyNames[row.members.length] : 'Party · roster incomplete';
    const members = row.members.map((name) => escapeMarkdown(String(name).slice(0, 60)));
    return `**${type}**${members.length ? ` · ${members.join(', ')}` : ''}\n${record({ wins: row.wins, games: row.decided })} (${Math.round(100 * row.wins / row.decided)}%)`;
  }).join('\n');
  const summaryCoach = coach
    ? `**${coach.match.isWin ? 'Won' : 'Lost'}${coach.score ? ` ${coach.score}` : ''} on ${escapeMarkdown(String(coach.match.map || 'unknown map').slice(0, 60))}.**\n${coach.practice}`
    : 'No completed match with a known result to review.';
  reportSummaries.set(embed, [
    { name: '🎯 Coach · Latest Match', value: summaryCoach },
    { name: '📈 Momentum', value: updates.length ? `${formatRRChange(net)} Rank Rating over ${updates.length} updates, ${directionRR}.` : 'No recent Rank Rating updates.' },
    { name: '🧭 Your Roles', value: roleSummary },
    { name: '👥 Who You Queued With', value: partySummary || 'No confirmed queue groups with known results.' },
    { name: '📄 Details', value: 'Open **Details** for the full match log, maps, economy, party stats, and career.' },
  ]);
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
        value: `**Peak Rank:** ${peakRank}\n**Peak Season:** ${seasonLabel(peakSeason)}`,
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

// Discord counts the text of all embeds in one message together.
function createProfileReplies(embed) {
  const { fields: visibleFields = [], ...header } = embed.toJSON();
  const allFields = reportFields.get(embed) || visibleFields;
  const summary = reportSummaries.get(embed);
  const pages = summary ? [{ embeds: [{ ...header, description: header.description?.split('\n\n')[0], fields: summary }],
    allowedMentions: { parse: [] } }] : [];
  let fields = [];
  let size = summary ? 'Ranked Report · Details'.length : [header.title, header.description, header.author?.name, header.footer?.text]
    .reduce((sum, text) => sum + (text?.length || 0), 0);

  function finishPage() {
    const pageHeader = pages.length ? { title: summary && pages.length === 1 ? 'Ranked Report · Details' : 'Ranked Report · Continued', color: header.color } : header;
    pages.push({ embeds: [{ ...pageHeader, fields }], allowedMentions: { parse: [] } });
    fields = [];
    size = 'Ranked Report · Continued'.length;
  }

  for (const field of allFields) {
    // Keep normal fields intact. For unusually long sections, close and reopen code fences.
    const chunks = [];
    let lines = [];
    let length = 0;
    let fenced = false;
    for (const line of field.value.split('\n')) {
      for (const piece of line.match(/[\s\S]{1,940}/gu) || ['']) {
        if (length + piece.length + 1 > 980) {
          chunks.push([...lines, ...(fenced ? ['```'] : [])].join('\n'));
          lines = fenced ? ['```'] : [];
          length = fenced ? 4 : 0;
        }
        lines.push(piece);
        length += piece.length + 1;
        if (piece === '```') fenced = !fenced;
      }
    }
    if (field.value.length <= 1024) chunks.splice(0, chunks.length, field.value);
    else if (lines.length) chunks.push(lines.join('\n'));

    for (const [i, value] of chunks.entries()) {
      const name = i ? `${field.name} · Continued` : field.name;
      if (fields.length >= 25 || size + name.length + value.length > 5500) finishPage();
      fields.push({ ...field, name, value });
      size += name.length + value.length;
    }
  }
  if (fields.length || !pages.length) finishPage();
  return pages;
}

module.exports = {
  createProfileEmbed,
  createProfileReplies,
  createMatchEmbed,
  createRecentMatchesOverviewEmbed,
  createErrorEmbed,
  createMMREmbed,
};
