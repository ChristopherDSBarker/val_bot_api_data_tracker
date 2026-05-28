/**
 * /valorant-profile command - Display Valorant player profile stats
 */

const { SlashCommandBuilder } = require('discord.js');
const valorantApi = require('../services/valorantApi');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('valorant-profile')
    .setDescription('Display Valorant player profile stats')
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
    let deferred = false;
    try {
      // Defer the reply since the API call might take a moment
      await interaction.deferReply();
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

      // Fetch player profile
      const playerProfile = await valorantApi.getPlayerProfile(name, tag, region);

      if (!playerProfile) {
        const errorEmbed = embeds.createErrorEmbed(
          'Player Not Found',
          `Could not find player **${name}#${tag}** in region **${region}**.\n\nMake sure the name and tag are correct.`
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Create and send the embed
      const profileEmbed = embeds.createProfileEmbed(playerProfile);
      await interaction.editReply({ embeds: [profileEmbed] });
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
