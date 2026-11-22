const { matchStore, historicalPartySplits } = require('../services/store');
/**
 * /valorant-profile command - Display Valorant player profile stats
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const valorantApi = require('../services/valorantApi');
const embeds = require('../utils/embeds');
const { coachGoals } = require('../services/coachGoals');
const { sendProfilePages } = require('../utils/profilePagination');
const { summarizeTeammates } = require('../services/teammateStats');
const { summarizeMaps } = require('../services/valorantCareer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('valorant-profile')
    .setDescription('Show your ranked report and coaching insights')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Player name (Riot ID)')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('tag')
        .setDescription('Player tag (e.g., NA1)')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('region')
        .setDescription('Region (default: na)')
        .setRequired(false)
        .addChoices(
          { name: 'North America', value: 'na' },
          { name: 'Europe', value: 'eu' },
          { name: 'Brazil', value: 'br' },
          { name: 'Latin America', value: 'latam' },
          { name: 'Korea', value: 'kr' },
          { name: 'Japan', value: 'jp' },
          { name: 'Asia-Pacific', value: 'ap' }
        )
    )
    .addIntegerOption((option) => option.setName('goal')
      .setDescription('Private goal: your share of first kills over five matches').setMinValue(0).setMaxValue(100)),

  async execute(interaction) {
    let deferred = false;
    try {
      // Defer the reply since the API call might take a moment
      const target = interaction.options.getInteger?.('goal');
      await interaction.deferReply(Number.isInteger(target) ? { flags: MessageFlags.Ephemeral } : {});
      deferred = true;

      const name = interaction.options.getString('name');
      const tag = interaction.options.getString('tag');
      const region = interaction.options.getString('region') || 'na';

      // Validate inputs
      if (!name || name.trim().length === 0) {
        const errorEmbed = embeds.createErrorEmbed(
          'Invalid Input',
          'Please provide a valid player name.'
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      if (!tag || tag.trim().length === 0) {
        const errorEmbed = embeds.createErrorEmbed(
          'Invalid Input',
          'Please provide a valid player tag (e.g., NA1).'
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Fetch all profile surfaces in parallel. Each endpoint can fail independently.
      const [accountResult, profileResult, mmrResult, mmrHistoryResult, recentMatchesResult] = await Promise.allSettled([
        valorantApi.getPlayerAccount(name, tag, region),
        valorantApi.getPlayerProfile(name, tag, region),
        valorantApi.getPlayerMMR(name, tag, region, 'pc'),
        valorantApi.getMMRHistory(name, tag, region),
        valorantApi.getRecentMatches(name, tag, region),
      ]);

      // Extract values or null
      const account = accountResult.status === 'fulfilled' ? accountResult.value : null;
      const playerProfile = profileResult.status === 'fulfilled' ? profileResult.value : null;
      const playerMMR = mmrResult.status === 'fulfilled' ? mmrResult.value : null;
      const mmrHistory = mmrHistoryResult.status === 'fulfilled' ? mmrHistoryResult.value : [];
      let recentMatches = recentMatchesResult.status === 'fulfilled' && Array.isArray(recentMatchesResult.value)
        ? recentMatchesResult.value
        : [];

      let experimentalEnhancements = null;
      if (valorantApi.isExperimentalValorantPipelineEnabled()) {
        try {
          experimentalEnhancements = await valorantApi.getExperimentalValorantEnhancements({
            region,
            name,
            tag,
            stableProfile: playerProfile,
            stableMMR: playerMMR,
            stableRecentMatches: recentMatches,
          });
        } catch (error) {
          console.warn(`[EXPERIMENTAL_VALORANT] sidecar ignored message=${error.message}`);
        }
      }

      // Valid v4 samples can enrich previews; failed beta calls leave stable results intact.
      if (experimentalEnhancements?.matches?.length) {
        recentMatches = experimentalEnhancements.matches;
      } else if (!recentMatches.length && experimentalEnhancements?.storedMatches?.length) {
        recentMatches = experimentalEnhancements.storedMatches;
      }

      // If both are missing, return error
      if (!account && !playerProfile && !playerMMR) {
        const errorEmbed = embeds.createErrorEmbed(
          'Player Not Found',
          `Could not find player **${name}#${tag}** in region **${region}**.\n\nMake sure the name and tag are correct.`
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const partySummary = summarizeTeammates(recentMatches, null, { partyOnly: true });
      let savedPartyResults = [];
      const puuid = account?.puuid || experimentalEnhancements?.account?.puuid;
      // Store only the current v4 sample, never mock entries or the stored-history fallback.
      if (process.env.ENABLE_MATCH_HISTORY !== 'false' && process.env.USE_MOCK_DATA !== 'true' &&
          interaction.guildId && puuid) {
        try {
          const history = await matchStore.recordAndRead(interaction.guildId, puuid, recentMatches.filter((match) => !match.dataSource));
          const latest = [...history].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
          savedPartyResults = historicalPartySplits(history, interaction.guildId, latest?.actId, partySummary);
        } catch (error) {
          console.warn('[HISTORY] Saved comparisons unavailable:', error.code || error.name);
        }
      }

      let goalStatus = null;
      let goalNotice = null;
      if (Number.isInteger(target)) {
        if (!interaction.guildId || !interaction.user?.id || !puuid || process.env.USE_MOCK_DATA === 'true') {
          goalNotice = 'A saved goal needs a live Riot account and a Discord server.';
        } else {
          try {
            const identity = [interaction.guildId, interaction.user.id, puuid, region, 'personal-first-kill-v1'];
            goalStatus = await coachGoals.checkIn(identity, recentMatches.filter((match) => !match.dataSource), target);
          } catch (error) {
            console.warn('[COACH] Saved goal unavailable:', error.code || error.name);
            goalNotice = 'Saved goal unavailable right now. The match review is still available.';
          }
        }
      }

      // Merge MMR data into profile if both available, or use what we have
      const mergedData = {
        ...playerProfile,
        ...playerMMR,
        account,
        mmrHistory,
        career: experimentalEnhancements?.career || null,
        mapSummary: summarizeMaps(recentMatches),
        teammateSummary: summarizeTeammates(recentMatches),
        partySummary,
        savedPartyResults,
        goalStatus,
        goalNotice,
        // Ensure we preserve profile-specific fields even if MMR is missing
        riotId: playerProfile?.riotId || `${account?.name || name}#${account?.tag || tag}`,
        name: playerMMR?.name || account?.name || name,
        tag: playerMMR?.tag || account?.tag || tag,
        level: account?.account_level || playerProfile?.level || 'N/A',
        region: playerProfile?.region || account?.region || region,
        damageDeltaPerRound: playerProfile?.damageDeltaPerRound
          ?? experimentalEnhancements?.damageDelta?.value
          ?? null,
        damageDeltaSource: playerProfile?.damageDeltaPerRound !== null && playerProfile?.damageDeltaPerRound !== undefined
          ? playerProfile?.damageDeltaSource || 'stable-v3'
          : experimentalEnhancements?.damageDelta?.source || null,
        damageDeltaMissingReason: playerProfile?.damageDeltaPerRound !== null && playerProfile?.damageDeltaPerRound !== undefined
          ? null
          : playerProfile?.damageDeltaMissingReason || experimentalEnhancements?.damageDelta?.missingReason || null,
      };

      // Create and send the unified embed with recent match preview
      const profileEmbed = embeds.createProfileEmbed(mergedData, {
        account,
        profile: playerProfile,
        mmr: playerMMR,
        mmrHistory,
        recentMatches,
      });
      await sendProfilePages(interaction, embeds.createProfileReplies(profileEmbed));
    } catch (error) {
      console.error('[ERROR] Valorant profile command failed:', error);
      const errorEmbed = embeds.createErrorEmbed(
        'Command Failed',
        'An unexpected error occurred while fetching player stats. Please try again later.'
      );
      try {
        if (deferred) {
          await interaction.editReply({ embeds: [errorEmbed] });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (replyError) {
        console.error('[ERROR] Failed to send error reply:', replyError);
      }
    }
  },
};
