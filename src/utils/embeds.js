const { roleOf } = require('../services/agentRoles');
const { summarizeRoles } = require('../services/valorantCareer');
const { reviewLatestMatch, latestSession } = require('../services/coach');
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

function roleReadout(matches) {
  const { baseline, roles } = summarizeRoles(matches, roleOf);
  if (!roles.length) return 'Role results unavailable.';
  const percent = (wins, games) => Math.round(100 * wins / games);
  const eligible = roles.filter((row) => row.games >= 3)
    .sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games);
  const label = ({ role, games, wins }) => `${role} ${wins}/${games} (${percent(wins, games)}%)`;
  const reference = `Your recent baseline: ${baseline.wins}/${baseline.games} (${percent(baseline.wins, baseline.games)}%).`;
  if (eligible.length < 2) {
    return `${roles.map(label).join(' · ')}\n${reference} Compare after 3 games in each of two roles.`;
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
    roleReadout(matches),
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
function groupedStatTable(headers, widths, rows, notes = []) {
  const clean = (text) => String(text).replace(/[`\r\n]/g, ' ');
  const body = (table) => table.split('\n').slice(1, -1);
  const [header] = body(statTable(headers, widths, []));
  const lines = rows.flatMap(([label, ...values], index) => [
    clean(label), ...body(statTable(headers, widths, [values])).slice(1),
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
    .setAuthor({ name: '◆ VALORANT / RANKED REPORT + COACH' })
    .setTitle(String(riotId).slice(0, 256))
    .setDescription(`**${descriptionParts[0]}**${descriptionParts.slice(1).map((part) => `  ·  ${part}`).join('')}\n\n**At a glance**\n${recap}${momentum}\nStart with **Coach · Latest Match** for one replay question.`);

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

  const goal = playerData.goalStatus;
  const goalLines = playerData.goalNotice ? [playerData.goalNotice] : [];
  if (goal) {
    const { current, baseline, target, window } = goal;
    const record = (row) => row.rounds
      ? `${row.won}/${row.rounds} first kills (${Math.round(100 * row.won / row.rounds)}%)`
      : 'No known openings yet.';
    const progress = current.games >= window
      ? (current.won * 100 >= target * current.rounds ? 'Target met.' : 'Target missed.')
      : `${current.games}/${window} matches with known openings.`;
    goalLines.push(`**Your first-kill goal:** ${target}% of known openings.`,
      `**Before:** ${record(baseline)}`, `**Since setting it:** ${record(current)} ${progress}`);
  }
  const coach = reviewLatestMatch(recentMatches);
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
    addFields({ name: '🎯 Coach · Latest Match', value: [...goalLines, ...readout].join('\n') });
  } else if (goalLines.length) {
    addFields({ name: '🎯 Coach · Your Goal', value: goalLines.join('\n') });
  }
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

  const exactProgress = compareRoundWindows(recentMatches);
  const byRole = exactProgress.length === 0;
  const progress = byRole ? compareRoundWindows(recentMatches, { byRole }) : exactProgress;
  if (progress.length) {
    const record = (won, total) => `${won}/${total} (${Math.round(100 * won / total)}%)`;
    const delta = (before, after) => `${formatRRChange(Math.round((after - before) * 100))} pp`;
    const shown = progress.slice(0, 3);
    const rows = shown.map(({ prior, recent }) => [
      byRole ? `${recent.role} / ${recent.side}` : `${recent.map} / ${recent.agent} / ${recent.side}`,
      record(prior.won, prior.total), record(recent.won, recent.total),
      delta(prior.won / prior.total, recent.won / recent.total),
    ]);
    const notes = shown.map(({ prior, recent }) => {
      if (prior.knownOpeners < 10 || recent.knownOpeners < 10) return [];
      return ['Your first kills:',
        `${record(prior.firstKills, prior.knownOpeners)} → ${record(recent.firstKills, recent.knownOpeners)}`];
    });
    addFields({ name: '↗ Compare Your Recent Games',
      value: groupedStatTable(['Earlier 5', 'Latest 5', 'Change'], [14, 14, 7], rows, notes) +
        '\nSame act · pp = percentage points. Each sample needs 10 known rounds.' +
        (byRole ? '\nMatched by role and side. Maps and agents may differ.' : '\nMatched by map, agent, and side.') });
  } else if (recentMatches.length >= 10) {
    addFields({ name: '↗ Compare Your Recent Games',
      value: 'No comparable split in this sample. The comparison needs two sets of five matches in one act and at least 10 known rounds in each set with a matching map, agent, and side, or a matching role and side.' });
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
  ];
  if (comparison.length) {
    const players = comparison.slice(0, 6);
    const rows = players.map((row) => [
      row.riotId,
      row.group,
      row.decided ? `${row.wins}/${row.decided}` : '—',
      row.decided ? `${Math.round(100 * row.wins / row.decided)}%` : '—',
      row.roundGames ? formatRRChange(Number((row.roundDiff / row.roundGames).toFixed(1))) : '—',
      row.tradeGames ? `${row.trades}/${row.tradeGames}` : '—',
    ]);
    const recent = new Map(comparePartyResults(recentMatches, parties).map((row) => [identity(row), row]));
    const saved = new Map((playerData.savedPartyResults || []).map((row) => [row.riotId.toLowerCase(), row]));
    const record = ({ wins, games }) => `${wins}/${games} (${Math.round(100 * wins / games)}%)`;
    const notes = players.map((player) => {
      const split = recent.get(identity(player));
      const history = saved.get(player.riotId.toLowerCase());
      return [
        ...(split ? [`Recent apart: ${record(split.withoutPartner)}`] : []),
        ...(history ? [`Saved act with: ${record(history.together)}`, `Saved act apart: ${record(history.apart)}`] : []),
      ];
    });
    const parts = [];
    if (rows.length) {
      parts.push(groupedStatTable(['Group', 'Wins', 'Win %', 'Margin', 'Trades'], [5, 5, 5, 7, 8], rows, notes));
      parts.push('**Party** = queued together. **Team** = played on your side. Party rows count only party games.');
      if (notes.some((note) => note.length)) parts.push('**Apart** counts known games queued separately. Saved act rows use saved matches.');
      parts.push('**Margin** = average rounds won minus lost. **Trades** = times they avenged your death within 5 seconds / games with kill records.');
    }
    if (comparison.length > rows.length) parts.push(`Showing ${rows.length} of ${comparison.length} players.`);
    addFields({ name: '👥 How You Played Together', value: parts.join('\n') });
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

// Discord counts the text of all embeds in one message together.
function createProfileReplies(embed) {
  const { fields: visibleFields = [], ...header } = embed.toJSON();
  const allFields = reportFields.get(embed) || visibleFields;
  const pages = [];
  let fields = [];
  let size = [header.title, header.description, header.author?.name, header.footer?.text]
    .reduce((sum, text) => sum + (text?.length || 0), 0);

  function finishPage() {
    const pageHeader = pages.length ? { title: 'Ranked Report · Continued', color: header.color } : header;
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
