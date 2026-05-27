/**
 * /valorant-recent command - Display recent Valorant matches
 */

const { SlashCommandBuilder } = require('discord.js');
const valorantApi = require('../services/valorantApi');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('valorant-recent')
    .setDescription('Display recent Valorant match stats (last 5 matches)')
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
    ),

  async execute(interaction) {
    try {
      // Defer the reply
      await interaction.deferReply();

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

      // Fetch recent matches
      const recentMatches = await valorantApi.getRecentMatches(name, tag, region);

      if (!recentMatches || recentMatches.length === 0) {
        const errorEmbed = embeds.createErrorEmbed(
          'No Matches Found',
          `Could not find recent matches for **${name}#${tag}** in region **${region}**.`
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Create embeds for each match
      const matchEmbeds = recentMatches.map((match, index) =>
        embeds.createMatchEmbed(match, index + 1)
      );

      // Send the embeds
      await interaction.editReply({ embeds: matchEmbeds });
    } catch (error) {
      console.error('[ERROR] Valorant recent command failed:', error);
      const errorEmbed = embeds.createErrorEmbed(
        'Command Failed',
        'An unexpected error occurred while fetching recent matches. Please try again later.'
      );
      try {
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch (replyError) {
        console.error('[ERROR] Failed to send error reply:', replyError);
      }
    }
  },
};
