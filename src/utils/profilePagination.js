const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const PREFIX = 'ranked-page:';

function pagePayload(pages, index, expired = false) {
  const label = `Page ${index + 1} of ${pages.length}`;
  const button = (target, text, disabled) => new ButtonBuilder()
    .setCustomId(`${PREFIX}${target}`).setLabel(text).setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
  return {
    ...pages[index],
    components: [new ActionRowBuilder().addComponents(
      button(Math.max(0, index - 1), 'Previous', expired || index === 0),
      new ButtonBuilder().setCustomId('ranked-page-count')
        .setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(true),
      button(Math.min(pages.length - 1, index + 1), 'Next', expired || index === pages.length - 1),
    )],
  };
}

async function sendProfilePages(interaction, pages) {
  if (pages.length === 1) return interaction.editReply(pages[0]);

  let current = 0;
  const message = await interaction.editReply(pagePayload(pages, current));
  const collector = message.createMessageComponentCollector({
    filter: (button) => button.isButton() && button.customId.startsWith(PREFIX),
    time: 5 * 60 * 1000,
  });
  let pending = Promise.resolve();
  collector.on('collect', (button) => {
    if (button.user.id !== interaction.user.id) {
      button.reply({ content: 'Run /valorant-profile to open your own report.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    const index = Number(button.customId.slice(PREFIX.length));
    if (!Number.isInteger(index) || index < 0 || index >= pages.length) return;
    pending = pending.then(async () => {
      await button.update(pagePayload(pages, index));
      current = index;
    }).catch((error) => console.warn('[PROFILE] Page change failed:', error.code || error.name));
  });
  collector.on('end', () => {
    pending.then(() => interaction.editReply(pagePayload(pages, current, true)))
      .catch((error) => console.warn('[PROFILE] Could not disable page controls:', error.code || error.name));
  });
}

module.exports = { sendProfilePages };
