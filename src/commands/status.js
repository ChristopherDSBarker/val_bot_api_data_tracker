const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../services/henrikClient');
const { matchStore } = require('../services/store');

const run = promisify(execFile);
let build;
function buildRevision() {
  build ||= run('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: path.join(__dirname, '../..'), timeout: 1000,
  }).then(({ stdout }) => stdout.trim() || 'Unavailable', () => 'Unavailable');
  return build;
}

module.exports = {
  data: new SlashCommandBuilder().setName('status').setDescription('Check the ranked report bot’s health'),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [revision, matches] = await Promise.all([
      buildRevision(),
      interaction.guildId ? matchStore.countGuildMatches(interaction.guildId).catch(() => 'Unavailable') : 'Server only',
    ]);
    const { cached, lastStatus } = api.status();
    await interaction.editReply([
      '**Ranked report bot is online.**',
      `Cached API responses: ${cached}`,
      `Saved matches in this server: ${matches}`,
      `Last HenrikDev request: ${lastStatus ?? 'None since startup'}`,
      `Build: ${revision}`,
    ].join('\n'));
  },
};
