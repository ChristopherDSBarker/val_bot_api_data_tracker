/**
 * Main Discord bot entry point
 */

require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// Validate required environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(
      `[ERROR] Missing required environment variable: ${envVar}`
    );
    console.error('[ERROR] Please create a .env file with all required variables.');
    process.exit(1);
  }
}

// Create Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// Create commands collection
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith('.js'));

console.log('[BOT] Loading commands...');
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`[BOT] ✓ Loaded command: ${command.data.name}`);
  } else {
    console.warn(`[BOT] ⚠ Skipping command file ${file} - missing data or execute`);
  }
}

// When the bot is ready
client.once('ready', () => {
  console.log(`\n[BOT] ✓ Logged in as ${client.user.tag}`);
  console.log(`[BOT] ✓ Bot ID: ${client.user.id}`);
  console.log(`[BOT] ✓ Total commands loaded: ${client.commands.size}`);
  console.log(`[ENV] USE_MOCK_DATA: ${process.env.USE_MOCK_DATA}`);
  console.log('\n[BOT] Bot is ready to use!\n');
});

// Handle interactions (slash commands)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`[ERROR] No command matching ${interaction.commandName}`);
    return;
  }

  try {
    console.log(`[COMMAND] Executing: ${interaction.commandName}`);
    await command.execute(interaction);
  } catch (error) {
    console.error(`[ERROR] Error executing command ${interaction.commandName}:`, error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: 'There was an error while executing this command!',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: 'There was an error while executing this command!',
          ephemeral: true,
        });
      }
    } catch (replyError) {
      console.error('[ERROR] Failed to send error message:', replyError);
    }
  }
});

// Register commands to Discord
async function registerCommands() {
  try {
    console.log('[BOT] Registering slash commands with Discord...');

    const commands = client.commands.map((command) => command.data.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    // Register commands in the specific guild (test server)
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_CLIENT_ID,
        process.env.DISCORD_GUILD_ID
      ),
      { body: commands }
    );

    console.log('[BOT] ✓ Successfully registered slash commands');
  } catch (error) {
    console.error('[ERROR] Failed to register commands:', error);
    process.exit(1);
  }
}

// Login and register commands
client.login(process.env.DISCORD_TOKEN);

// Register commands after a short delay to ensure client is ready
setTimeout(() => {
  registerCommands();
}, 1000);

// Handle errors gracefully
process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[ERROR] Uncaught Exception:', error);
});
