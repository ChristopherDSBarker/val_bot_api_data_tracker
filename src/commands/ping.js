/**
 * /ping command - Simple health check
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong! Used to verify the bot is alive.'),

  async execute(interaction) {
    try {
      await interaction.reply({
        content: 'Pong! 🏓',
        ephemeral: false,
      });
    } catch (error) {
      console.error('[ERROR] Ping command failed:', error);
      await interaction.reply({
        content: 'Something went wrong!',
        ephemeral: true,
      });
    }
  },
};
