const fs = require('node:fs/promises');
const path = require('node:path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const PREFIX = 'ranked-page:';
const LIFETIME = 7 * 24 * 60 * 60 * 1000;
const REFRESH = 'This report’s pages are no longer available. Run /valorant-profile for a fresh report.';

function pagePayload(pages, index, reportId) {
  const button = (target, label, disabled) => new ButtonBuilder()
    .setCustomId(`${PREFIX}${reportId}:${label}:${target}`).setLabel(label)
    .setStyle(ButtonStyle.Secondary).setDisabled(disabled);
  const hasSummary = pages[0].embeds[0].fields?.some((field) => field.name === '📄 Details');
  return {
    ...pages[index],
    components: [new ActionRowBuilder().addComponents(
      button(Math.max(0, index - 1), hasSummary && index === 1 ? 'Summary' : 'Previous', index === 0),
      new ButtonBuilder().setCustomId('ranked-page-count')
        .setLabel(`Page ${index + 1} of ${pages.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
      button(Math.min(pages.length - 1, index + 1), hasSummary && index === 0 ? 'Details' : 'Next', index === pages.length - 1),
    )],
  };
}

function createProfilePager(directory, clock = Date.now) {
  let lastCleanup = -Infinity;
  const fileFor = (id) => path.join(directory, `${id}.json`);

  async function cleanup(now) {
    if (now - lastCleanup < 24 * 60 * 60 * 1000) return;
    lastCleanup = now;
    try {
      for (const name of await fs.readdir(directory)) {
        if (!/^\d{1,20}\.json$/.test(name)) continue;
        const file = path.join(directory, name);
        const stat = await fs.stat(file);
        if (now - stat.mtimeMs >= LIFETIME) await fs.unlink(file);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[PROFILE] Page cleanup failed:', error.code || error.name);
    }
  }

  async function sendProfilePages(interaction, pages) {
    if (pages.length === 1 || !/^\d{1,20}$/.test(interaction.id || '')) return interaction.editReply(pages[0]);
    const now = clock();
    try {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      await fs.writeFile(fileFor(interaction.id), JSON.stringify({
        requester: interaction.user.id, expires: now + LIFETIME, pages,
      }), { mode: 0o600 });
    } catch (error) {
      console.warn('[PROFILE] Could not save report pages:', error.code || error.name);
      return interaction.editReply({ ...pages[0], content: 'Additional pages could not be saved. The first page is shown below.' });
    }
    void cleanup(now);
    return interaction.editReply(pagePayload(pages, 0, interaction.id));
  }

  async function handleProfilePage(button) {
    const reply = (content) => button.reply({ content, flags: MessageFlags.Ephemeral });
    const match = /^ranked-page:(\d{1,20}):(Previous|Next|Details|Summary):(\d+)$/.exec(button.customId);
    if (!match) return reply(REFRESH);
    const [, id, , target] = match;
    let report;
    try {
      report = JSON.parse(await fs.readFile(fileFor(id), 'utf8'));
    } catch {
      return reply(REFRESH);
    }
    if (report.expires <= clock() || !report.pages?.[target]) return reply(REFRESH);
    if (report.requester !== button.user.id) return reply('Run /valorant-profile to open your own report.');
    return button.update(pagePayload(report.pages, Number(target), id));
  }
  return { sendProfilePages, handleProfilePage };
}

const pager = createProfilePager(path.join(__dirname, '../../data/report-pages'));
const isProfilePage = (interaction) => interaction.isButton() && interaction.customId.startsWith(PREFIX);
module.exports = { ...pager, isProfilePage, createProfilePager };
